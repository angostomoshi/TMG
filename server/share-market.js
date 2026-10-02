const express = require('express');
const crypto = require('crypto');

function fail(status, message) { const error = new Error(message); error.status = status; throw error; }
function amount(value) {
  if (typeof value !== 'string' || !/^\d{1,10}(\.\d{1,2})?$/.test(value) || Number(value) <= 0) fail(400, 'Enter a positive capital amount with at most two decimal places.');
  return value;
}
function eligible(member) {
  return member && member.closed === false && member.approved === true && member.status === 'Approved' && member.account_status === 'Alive';
}
async function getMember(db, account) {
  const result = await db.query('SELECT id, acc_no, holders_name, closed, approved, status, account_status, company_id FROM public.pb_share_register WHERE upper(trim(acc_no))=$1', [account]);
  if (result.rows.length !== 1) fail(403, 'Your membership could not be uniquely verified. Contact the office.');
  return result.rows[0];
}
async function holdings(db, account) {
  // Matches the existing share_reg_view type filter; amounts remain monetary capital.
  const result = await db.query(`SELECT
    (SELECT coalesce(sum(coalesce(credit,0)-coalesce(debit,0)),0) FROM public.ac_shares_ledger WHERE upper(trim(account_no))=$1 AND transaction_type ILIKE 'Sh%')::text AS owned,
    (SELECT coalesce(sum(capital_amount),0) FROM share_market.listings WHERE owner=$1 AND side='sell' AND (status='matched' OR (status='open' AND expires_at>now())))::text AS reserved`, [account]);
  return result.rows[0];
}
function createShareMarketRouter({ pool, auth }) {
  const router = express.Router();
  router.use(auth);
  const route = handler => async (req, res) => {
    try { await handler(req, res); }
    catch (error) {
      if (!error.status) console.error('Share market failure:', error.code || error.name);
      const missingSchema=error.code==='42P01' || error.code==='3F000';
      res.status(error.status || 503).json({ message: error.status ? error.message : missingSchema ? 'Marketplace storage has not been installed. Please contact the portal administrator.' : 'The share market is temporarily unavailable. Please try again.' });
    }
  };
  async function transaction(handler) {
    const db = await pool.connect();
    try { await db.query('BEGIN'); await db.query("SET LOCAL statement_timeout='10s'"); const result = await handler(db); await db.query('COMMIT'); return result; }
    catch (error) { await db.query('ROLLBACK'); throw error; }
    finally { db.release(); }
  }
  async function lock(db) {
    // Serialises portal reservations. Does not lock out legacy accounting writers.
    await db.query("SELECT pg_advisory_xact_lock(734821,1)");
    await db.query("UPDATE share_market.listings SET status='expired' WHERE status='open' AND expires_at<=now()");
    await db.query("UPDATE share_market.trades SET status='declined' WHERE status='requested' AND listing_id IN (SELECT id FROM share_market.listings WHERE status IN ('expired','cancelled'))");
  }
  async function event(db, actor, kind, entity) {
    await db.query('INSERT INTO share_market.events(actor,kind,entity_id) VALUES ($1,$2,$3)', [actor, kind, entity]);
  }
  router.get('/', route(async (req, res) => {
    const member = await getMember(pool, req.auth.memberNo);
    const balances = await holdings(pool, req.auth.memberNo);
    const listings = await pool.query(`SELECT id,owner,side,capital_amount::text,asking_amount::text,note,
      CASE WHEN status='open' AND expires_at<=now() THEN 'expired' ELSE status END AS status,expires_at,created_at
      FROM share_market.listings WHERE parent_trade IS NULL AND (owner=$1 OR (status='open' AND expires_at>now())) ORDER BY created_at DESC LIMIT 200`, [req.auth.memberNo]);
    const trades = await pool.query(`SELECT t.id,t.listing_id,t.buyer,t.seller,t.status,t.created_at,l.capital_amount::text,l.asking_amount::text
      FROM share_market.trades t JOIN share_market.listings l ON l.id=t.listing_id
      WHERE buyer=$1 OR seller=$1 ORDER BY created_at DESC LIMIT 100`, [req.auth.memberNo]);
    res.json({ memberNo: req.auth.memberNo, eligible: eligible(member), holdings: balances, listings: listings.rows, trades: trades.rows,
      phase: 'requests_only', message: 'Listings and requests are saved. Payments and ownership transfers are not enabled. Do not send money yet.' });
  }));
  router.post('/listings', route(async (req, res) => {
    const capital = amount(req.body.capitalAmount), asking = amount(req.body.askingAmount);
    if (!['buy','sell'].includes(req.body.side)) fail(400, 'Choose buy or sell.');
    if (![7,14,30].includes(req.body.days)) fail(400, 'Choose a 7, 14 or 30 day duration.');
    if (typeof req.body.note !== 'string' || req.body.note.length > 240) fail(400, 'Notes must be at most 240 characters.');
    const id = await transaction(async db => {
      await lock(db);
      if (!eligible(await getMember(db, req.auth.memberNo))) fail(403, 'Your account is not eligible to post trading requests. Contact the office.');
      const balance = await holdings(db, req.auth.memberNo);
      if (req.body.side === 'sell') {
        const check = await db.query('SELECT $1::numeric-$2::numeric >= $3::numeric AS ok', [balance.owned,balance.reserved,capital]);
        if (!check.rows[0].ok) fail(409, 'Insufficient unreserved capital for this listing. Refresh your holdings.');
      }
      const id = crypto.randomUUID();
      await db.query(`INSERT INTO share_market.listings(id,owner,side,capital_amount,asking_amount,note,expires_at)
        VALUES ($1,$2,$3,$4,$5,$6,now()+$7*interval '1 day')`, [id,req.auth.memberNo,req.body.side,capital,asking,req.body.note.trim(),req.body.days]);
      await event(db,req.auth.memberNo,'listing_created',id); return id;
    });
    res.status(201).json({ id });
  }));
  router.post('/listings/:id/respond', route(async (req,res) => {
    const id = await transaction(async db => {
      await lock(db);
      if (!eligible(await getMember(db,req.auth.memberNo))) fail(403,'Your account is not eligible to trade.');
      const result = await db.query("SELECT * FROM share_market.listings WHERE id=$1 AND status='open' AND expires_at>now() FOR UPDATE",[req.params.id]);
      const listing = result.rows[0];
      if (!listing) fail(409,'This listing is no longer available.');
      if (listing.owner === req.auth.memberNo) fail(400,'You cannot respond to your own listing.');
      if (!eligible(await getMember(db,listing.owner))) fail(409,'The listing owner is no longer eligible to trade.');
      // A response is an expression of interest. The owner must accept it.
      const buyer = listing.side==='sell' ? req.auth.memberNo : listing.owner;
      const seller = listing.side==='sell' ? listing.owner : req.auth.memberNo;
      const existing = await db.query('SELECT id FROM share_market.trades WHERE listing_id=$1 AND buyer=$2 AND seller=$3',[listing.id,buyer,seller]);
      if (existing.rows[0]) return existing.rows[0].id;
      const id = crypto.randomUUID();
      await db.query('INSERT INTO share_market.trades(id,listing_id,buyer,seller) VALUES ($1,$2,$3,$4)',[id,listing.id,buyer,seller]);
      await event(db,req.auth.memberNo,'trade_requested',id); return id;
    });
    res.status(201).json({id});
  }));
  router.post('/trades/:id/accept', route(async (req,res) => {
    await transaction(async db => {
      await lock(db);
      const result=await db.query('SELECT t.*,l.owner,l.side,l.capital_amount,l.status AS listing_status,l.expires_at FROM share_market.trades t JOIN share_market.listings l ON l.id=t.listing_id WHERE t.id=$1 FOR UPDATE OF t,l',[req.params.id]);
      const trade=result.rows[0];
      if (!trade || trade.owner!==req.auth.memberNo) fail(403,'Only the listing owner can accept this request.');
      if (trade.status==='awaiting_review') return;
      if (trade.status!=='requested' || trade.listing_status!=='open' || new Date(trade.expires_at)<=new Date()) fail(409,'This request is no longer available.');
      for (const member of [trade.buyer,trade.seller]) if (!eligible(await getMember(db,member))) fail(409,'Both members must be eligible before acceptance.');
      const balance=await holdings(db,trade.seller);
      const check=await db.query('SELECT $1::numeric-$2::numeric+$3::numeric >= $4::numeric AS ok',[balance.owned,balance.reserved,trade.side==='sell' ? trade.capital_amount : '0',trade.capital_amount]);
      if (!check.rows[0].ok) fail(409,'The seller no longer has enough unreserved capital.');
      // For buy listings the owner remains the buyer. Reserve seller capital separately.
      if (trade.side==='buy') {
        await db.query(`INSERT INTO share_market.listings(id,owner,side,capital_amount,asking_amount,note,status,expires_at,parent_trade)
          SELECT $1,$2,'sell',capital_amount,asking_amount,'Accepted buy request','matched',expires_at,$3 FROM share_market.listings WHERE id=$4`,[crypto.randomUUID(),trade.seller,trade.id,trade.listing_id]);
      }
      await db.query("UPDATE share_market.listings SET status='matched' WHERE id=$1",[trade.listing_id]);
      await db.query("UPDATE share_market.trades SET status=CASE WHEN id=$1 THEN 'awaiting_review' ELSE 'declined' END WHERE listing_id=$2 AND status='requested'",[trade.id,trade.listing_id]);
      await event(db,req.auth.memberNo,'terms_accepted',trade.id);
    });
    res.json({success:true});
  }));
  router.post('/trades/:id/cancel',route(async(req,res)=>{
    await transaction(async db=>{
      await lock(db);
      const result=await db.query('SELECT * FROM share_market.trades WHERE id=$1 FOR UPDATE',[req.params.id]);
      const trade=result.rows[0];
      if (!trade || ![trade.buyer,trade.seller].includes(req.auth.memberNo)) fail(404,'Transaction not found.');
      if (trade.status==='cancelled') return;
      if (!['requested','awaiting_review'].includes(trade.status)) fail(409,'This request cannot be cancelled.');
      if (trade.status==='awaiting_review') await db.query("UPDATE share_market.listings SET status='cancelled' WHERE id=$1 OR parent_trade=$2",[trade.listing_id,trade.id]);
      await db.query("UPDATE share_market.trades SET status='cancelled' WHERE id=$1",[trade.id]);
      await event(db,req.auth.memberNo,'trade_cancelled',trade.id);
    });res.json({success:true});
  }));
  router.post('/listings/:id/cancel',route(async(req,res)=>{
    await transaction(async db=>{
      await lock(db);
      const result=await db.query("UPDATE share_market.listings SET status='cancelled' WHERE id=$1 AND owner=$2 AND status='open' RETURNING id",[req.params.id,req.auth.memberNo]);
      if (!result.rows.length) fail(409,'Only an open listing you own can be cancelled.');
      await db.query("UPDATE share_market.trades SET status='declined' WHERE listing_id=$1 AND status='requested'",[req.params.id]);
      await event(db,req.auth.memberNo,'listing_cancelled',req.params.id);
    });res.json({success:true});
  }));
  // No payment, approval, or posting endpoint exists until the accounting contract is verified.
  return router;
}
module.exports={createShareMarketRouter,eligible,amount,getMember};
