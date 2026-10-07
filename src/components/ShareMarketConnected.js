import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FaPlus, FaSearch, FaArrowRight, FaExchangeAlt, FaInfoCircle } from 'react-icons/fa';
import { marketRequest } from '../services/shareMarketApi';
import './ShareMarket.css';
import { useLocation } from 'react-router-dom';

const money = value => new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES', maximumFractionDigits: 2 }).format(Number(value || 0));
const labels = { requested: 'Awaiting member acceptance', awaiting_review: 'Awaiting office review', cancelled: 'Cancelled', declined: 'Closed', open: 'Open', matched: 'In a transaction', expired: 'Expired' };

export default function ShareMarketConnected() {
  const location = useLocation();
  const [data,setData] = useState(null);
  const [error,setError] = useState('');
  const [notice,setNotice] = useState('');
  const [busy,setBusy] = useState(false);
  const [loading,setLoading] = useState(true);
  const [tab,setTab] = useState('buy');
  useEffect(()=>{if(location.hash==='#trades')setTab('trades');},[location]);
  const [search,setSearch] = useState('');
  const [modal,setModal] = useState(null);
  const [form,setForm] = useState({side:'sell',capitalAmount:'',askingAmount:'',days:7,note:''});
  const dialog = useRef(null);
  const mounted = useRef(true);
  const actionLock = useRef(false);
  const refresh = useCallback(async()=>{
    const result=await marketRequest();
    if (mounted.current) setData(result);
  },[]);
  useEffect(()=>{
    mounted.current=true;
    refresh().catch(e=>{if(mounted.current)setError(e.message);}).finally(()=>{if(mounted.current)setLoading(false);});
    const timer=setInterval(()=>{if(!document.hidden && !actionLock.current)refresh().catch(e=>{if(mounted.current)setError(e.message);});},30000);
    return()=>{mounted.current=false;clearInterval(timer);};
  },[refresh]);
  useEffect(()=>{if(modal && dialog.current) dialog.current.showModal();},[modal]);
  const run=async(path,body,message)=>{
    if(actionLock.current)return;
    actionLock.current=true;setBusy(true);setError('');setNotice('');
    try {
      await marketRequest(path,body);
      window.dispatchEvent(new Event('market-updated'));
      setModal(null);setNotice(message);
      try {await refresh();} catch {setError('Your action was saved, but the view could not refresh. Refresh before taking another action.');setData(null);}
    }catch(e){setError(e.message);}finally{setBusy(false);actionLock.current=false;}
  };
  const open=value=>{setError('');setNotice('');setModal(value);};
  const reload=async()=>{setLoading(true);setError('');try{await refresh();}catch(e){setError(e.message);}finally{setLoading(false);}};
  const member=data?.memberNo;
  const available=Number(data?.holdings.owned || 0)-Number(data?.holdings.reserved || 0);
  const filtered=(data?.listings || []).filter(l=>!l.parent_trade && (tab==='listings' ? l.owner===member : l.owner!==member && l.status==='open' && l.side===(tab==='buy'?'sell':'buy'))).filter(l=>`${l.id} ${l.note} ${l.capital_amount}`.toLowerCase().includes(search.toLowerCase()));
  const selected=modal?.listing;
  return <div className="sm-page">
    <div className="sm-page-heading"><div><div className="sm-eyebrow">METRO HEALTH SERVICES</div><h1>Share Market</h1><p>Buy and sell capital with fellow members.</p></div><button className="sm-button sm-primary" disabled={!data?.eligible || busy} onClick={()=>{setForm({side:'sell',capitalAmount:'',askingAmount:'',days:7,note:''});open({type:'post'});}}><FaPlus /> Post a listing</button></div>
    <div className="sm-demo-banner"><FaInfoCircle /><p><strong>Open for requests.</strong> Listings and requests are saved to your account. Payments and ownership transfers are not enabled yet. Do not send money.</p><button className="sm-text-button" disabled={busy || loading} onClick={reload}>Refresh</button></div>
    {!modal && error && <p role="alert" className="sm-error">{error}</p>}
    {notice && <p role="status" className="sm-success">{notice}</p>}
    {loading && <p role="status">Loading your capital and market listings…</p>}
    {!loading && !data && <div className="sm-empty"><p>We could not load the market. Check your connection or sign in again.</p><button className="sm-button sm-secondary" onClick={reload}>Try again</button></div>}
    {data && <>
      <section className="sm-hero"><div className="sm-hero-intro"><span className="sm-eyebrow">YOUR CAPITAL</span><h2>Make your next move.</h2><p>Offer a capital amount or find an offer that suits you.</p><span className="sm-hero-tag">{data.eligible?'Your account is eligible to submit requests':'Contact the office to confirm your trading eligibility'}</span></div><div className="sm-portfolio"><div><span>Recorded capital</span><strong style={{fontSize:26}}>{money(data.holdings.owned)}</strong><small>Current share ledger balance</small></div><div><span>Unreserved in this portal</span><strong style={{fontSize:26}}>{money(Math.max(0,available))}</strong><small>{money(data.holdings.reserved)} reserved</small></div></div></section>
      <p className="sm-bottom-note">Capital is shown as a monetary amount, not a count of shares. Availability remains subject to office review and any restrictions outside this portal.</p>
      <section className="sm-market-section"><div className="sm-tabs" aria-label="Market views">{[['buy','Buy capital'],['sell','Sell capital'],['listings','My listings'],['trades','My transactions']].map(([key,label])=><button key={key} aria-pressed={tab===key} className={tab===key?'active':''} onClick={()=>{setTab(key);setSearch('');}}>{label}</button>)}</div>
        <div id="sm-panel"><div className="sm-section-heading"><div><h2>{tab==='buy'?'Capital available to buy':tab==='sell'?'Members looking to buy':tab==='listings'?'Your listings':'Your transactions'}</h2><p>{tab==='trades'?'Track member acceptance and office review.':'Each listing is offered as one complete capital amount.'}</p></div></div>
          {tab!=='trades' && <div className="sm-toolbar"><label className="sm-search"><FaSearch /><input aria-label="Search listings" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search amount, note or reference" /></label></div>}
          {tab!=='trades' && <div className="sm-listings">{filtered.map(l=><article key={l.id} className="sm-listing"><div className="sm-card-top"><span className={`sm-direction ${l.side}`}>{l.side==='sell'?'SELL OFFER':'BUY REQUEST'}</span><span className="sm-badge">{labels[l.status]}</span></div><div className="sm-card-quantity"><strong style={{fontSize:25}}>{money(l.capital_amount)}</strong></div><p className="sm-unit-price">Capital amount</p><div className="sm-card-total"><span>Proposed payment</span><strong>{money(l.asking_amount)}</strong></div><p className="sm-listing-note">{l.note || 'No additional notes.'}</p><div className="sm-member"><div><strong>{l.owner===member?'Your listing':'Member listing'}</strong><small>{l.id.slice(0,8)} · Expires {new Date(l.expires_at).toLocaleDateString('en-KE')}</small></div></div>{l.status==='open' && (l.owner===member?<button disabled={busy} className="sm-button sm-secondary" onClick={()=>open({type:'cancel',listing:l})}>Cancel listing</button>:<button disabled={!data.eligible || busy} className="sm-button sm-secondary" onClick={()=>open({type:'respond',listing:l})}>{l.side==='sell'?'Request to buy':'Offer to sell'} <FaArrowRight /></button>)}</article>)}</div>}
          {tab==='trades' && <div className="sm-trades">{data.trades.map(t=>{

            return <article className="sm-trade-row" key={t.id}><span className="sm-trade-icon"><FaExchangeAlt /></span><div className="sm-trade-name"><h3>{t.buyer===member?'Buying':'Selling'} {money(t.capital_amount)} of capital</h3><p>Proposed payment: {money(t.asking_amount)} · {t.id.slice(0,8)}</p><p>{t.status==='awaiting_review'?'Both members agreed. Awaiting office review; do not pay yet.':labels[t.status]}</p></div>{t.status==='requested' && t.owner===member && <button disabled={busy} className="sm-button sm-primary" onClick={()=>open({type:'accept',trade:t})}>Review & accept</button>}{['requested','awaiting_review'].includes(t.status) && <button disabled={busy} className="sm-button sm-secondary" onClick={()=>open({type:'cancel-trade',trade:t})}>{t.status==='requested' && t.owner===member?'Decline request':'Cancel request'}</button>}</article>;
          })}</div>}
          {(tab==='trades'?data.trades:filtered).length===0 && <div className="sm-empty"><h3>{search?'No matching listings':'Nothing here yet'}</h3><p>{tab==='trades'?'Your trade requests will appear here.':'Post a listing to get started.'}</p></div>}
        </div>
      </section>
    </>}
    {modal && <dialog className="sm-dialog" ref={dialog} aria-labelledby="live-market-title" onCancel={e=>{if(busy)e.preventDefault();else setModal(null);}}><div className="sm-dialog-header"><h2 id="live-market-title">{modal.type==='post'?'Post a capital listing':modal.type==='respond'?'Review the request':modal.type==='accept'?'Accept this request?':'Confirm cancellation'}</h2><button disabled={busy} className="sm-icon-button" aria-label="Close dialog" onClick={()=>setModal(null)}>×</button></div><div className="sm-dialog-body">
      {error && <p className="sm-error" role="alert">{error}</p>}
      {modal.type==='post'?<form className="sm-form" onSubmit={e=>{e.preventDefault();run('/listings',form,'Your listing has been saved.');}}><fieldset disabled={busy} className="sm-form" style={{border:0}}><label>I want to<select value={form.side} onChange={e=>setForm({...form,side:e.target.value})}><option value="sell">Sell capital</option><option value="buy">Buy capital</option></select></label><div className="sm-form-grid"><label>Capital amount (KES)<input autoFocus required type="number" min="0.01" max="9999999999.99" step="0.01" value={form.capitalAmount} onChange={e=>setForm({...form,capitalAmount:e.target.value})} /></label><label>Proposed payment (KES)<input required type="number" min="0.01" max="9999999999.99" step="0.01" value={form.askingAmount} onChange={e=>setForm({...form,askingAmount:e.target.value})} /></label></div><p className="sm-field-help">The capital amount is the holding offered. The payment is your proposed price, subject to the organisation’s trading rules.</p><label>Duration<select value={form.days} onChange={e=>setForm({...form,days:Number(e.target.value)})}>{[7,14,30].map(days=><option key={days} value={days}>{days} days</option>)}</select></label><label>Notes<textarea maxLength="240" rows="3" value={form.note} onChange={e=>setForm({...form,note:e.target.value})} /></label><button className="sm-button sm-primary" type="submit">{busy?'Saving…':'Post listing'}</button></fieldset></form>:<div className="sm-form"><p>{modal.type==='respond'?`Request the full ${money(selected.capital_amount)} capital amount for a proposed payment of ${money(selected.asking_amount)}. The listing owner must accept your request.`:modal.type==='accept'?`Accept ${money(modal.trade.capital_amount)} of capital for a proposed payment of ${money(modal.trade.asking_amount)}? Capital will remain reserved pending office review.`:'Cancel this listing or request? Any associated reservation will be released where applicable.'}</p><p className="sm-callout">No payment or ownership transfer will take place.</p><button disabled={busy} className="sm-button sm-primary" onClick={()=>{
        if(modal.type==='respond')run(`/listings/${selected.id}/respond`,{},'Your request has been saved. The listing owner will see a portal alert. Track the response in My transactions.');
        if(modal.type==='cancel')run(`/listings/${selected.id}/cancel`,{},'Listing cancelled.');
        if(modal.type==='accept')run(`/trades/${modal.trade.id}/accept`,{},'Terms accepted. Awaiting office review. Do not pay yet.');
        if(modal.type==='cancel-trade')run(`/trades/${modal.trade.id}/cancel`,{},'Request cancelled.');
      }}>{busy?'Saving…':'Confirm'}</button></div>}
    </div></dialog>}
  </div>;
}
