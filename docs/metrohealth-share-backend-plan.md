# Share Market backend: metrohealth_services

Verified by read-only inspection on 23 September 2026. Target: `192.168.4.7:5432/metrohealth_services`, user `centre`. This supersedes the earlier metrosacco table mapping. No database records or schema were changed.

## Confirmed findings

| Object | Evidence and intended use |
| --- | --- |
| `public.ac_shares_ledger` | Main share ledger; `share_reg_view` calculates credit minus debit from this table for transaction types matching `Sh%`. Use for holdings and statements after reconciliation. |
| `public.pb_share_register` | Member accounts and approval/closure/life-status fields. Link `acc_no` to ledger `account_no`. |
| `public.ac_shares_journal` | Existing share journal with `approved`, `appr_status`, `app_by` and notification flags. Posting semantics need confirmation with the legacy application. |
| `public.share_reg_view`, `public.share_summ` | Existing share summaries. Definitions join by account number, do not scope company or eligibility, and cast account numbers to integer when sorting. Avoid treating these as marketplace eligibility checks. |
| `public.sms_share_transfer`, `public.sms_share_transferappr` | Existing transfer notification views read approved journal rows. New journal writes may be picked up by an external notification worker. |
| `public.pb_users` | Portal user/password/role schema exists; actual login and role mappings have not been validated. No password records were retrieved. |

`ac_shares_capital` and `integration.shares_summ_view` are absent here. The current app's capital total and loan eligibility queries therefore cannot be carried over unchanged.

Aggregate observations:

- 5,225 share-ledger rows. All have null `company_id`; no missing account numbers or null debit/credit values were found.
- 5,207 rows have transaction type `Shares`. Other rows use `UnShares` (16) and `Debits` (2); their business meaning must be established before choosing the balance filter.
- Exact `Shares` net balances span 716 accounts: 571 positive, 142 zero, 3 negative. Counts are ledger accounts, not a count of members eligible to trade.
- 468 reference groups were found among entries with narrations starting `transf`; 449 have two distinct accounts with equal positive aggregate debits and credits. The remaining 19 need review; this does not by itself prove incorrect postings.
- Member status combinations include open accounts marked deceased and inconsistent approval labels. `closed = false` alone is insufficient.
- No duplicate `(company_id, normalized acc_no)` groups were found in the member register at inspection time.
- No declared constraints, indexes or non-internal triggers were returned for the inspected member, journal and share-ledger tables. Ledger IDs currently contain no duplicates, but are not protected by a declared unique constraint in this inspection.
- No user-defined routines referencing the share ledger/journal were found through routine-body text search. This does not rule out dynamic SQL or posting code in the legacy application.
- Journal states include New, Approve, Nullify, Resubmit and Return, sometimes alongside `approved = true`. Do not infer posting completion from that boolean alone.

## Implementation order

1. **Reconcile and define the accounting contract.** Compare a small approved set of member statements with `SUM(COALESCE(credit,0)-COALESCE(debit,0))` using the agreed transaction-type rules. Establish the meaning of the historical activity codes and the 19 transfer groups outside the simple balanced pattern. Confirm whether amounts are nominal monetary capital or share units; the inspected schema has no explicit unit quantity or nominal-price fields. The demo's KES 100 is not evidence of the real unit value.
2. **Prepare the app for this database.** Add a database-specific repository for member, holdings and statement queries. Replace the missing capital summary view and remove assumptions about the separate SACCO capital table. Review all exposed routes for schema compatibility, including loan/member APIs. Confirm the upstream Spring API belongs to this same organisation/database before retaining it for login or data. Resolve JWT configuration and verify member/role identity. Switch the runtime database configuration only with compatible routes ready, so we do not mix metrosacco data with metrohealth_services data.
3. **Add marketplace storage.** Proposed tables: `share_market_listings`, `share_market_trades`, `share_market_reservations`, `share_market_confirmations`, `share_market_approvals`, `share_market_transfers`, `share_market_disputes`, and append-only events/outbox. Include immutable accepted terms, exact numeric amounts, timestamps, unique settlement/idempotency references and approved actor identity. Establish a stable member key before adding foreign keys to legacy tables with no declared uniqueness.
4. **Connect listings and reservations.** Provide authenticated holdings/listing/trade endpoints. Calculate available capital from reconciled holdings less restrictions and active reservations. Whole-listing trades first. Reserve shares without altering ownership or recording cash receipts. Validate both parties' eligibility server-side; deceased/estate transfers require their own authorised process. A buy request is not proof of funds.
5. **Implement confirmations and settlement.** Both parties accept terms; required organisational clearance precedes payment; buyer reports payment; seller confirms actual receipt and authorises transfer; registration completes the transaction. Debit seller and credit buyer for the same nominal amount under a shared unique transfer reference, in one transaction, once all requirements hold. Capture negotiated payment amount separately if permitted by policy.
6. **Validate and pilot.** Run integration tests on a staging copy, reconcile holdings and statements, and pilot with approved members before enabling settlement broadly.

## Settlement decisions that must be resolved

- Decide whether the legacy journal is the required workflow or whether an authorised service can post the ledger directly. Do not insert both journal and ledger rows without understanding whether an external process will post them again.
- The existing notification views can react to journal inserts. Coordinate notification ownership and flags to prevent duplicate or premature messages; inspection sent no messages.
- Confirm whether balanced member-to-member ledger entries are sufficient or additional accounting entries/registration records are required. Never record an external buyer-to-seller payment as new company capital.
- Define member status policy explicitly using approval and life-status fields. Do not automatically make every non-closed account tradable.
- Resolve the legacy null-company convention explicitly. Filtering the ledger by `company_id = 1` today would omit every inspected row; blindly treating all future nulls as company 1 would also be unsafe without confirming ownership.
- Add reviewed uniqueness and lookup indexes through migrations after auditing existing data. Do not run blanket constraint changes on the legacy system as part of discovery.
- Coordinate all writers, including the legacy application. Marketplace-only advisory locks do not prevent another application spending the same holdings. Recheck balance at settlement, but require a shared reservation/locking protocol or a controlled single posting path for live trading.
- Keep payment-reported/disputed holdings reserved. Cancellation and expiry may release only eligible unpaid reservations. Settlement, cancellation and expiry must use the same concurrency controls.

## Suggested API surface

- `GET /api/v1/share-market/holdings`: owned, restricted, reserved and available amounts/units, pricing policy.
- `GET/POST /api/v1/share-market/listings`: browse/create eligible listings.
- `POST /api/v1/share-market/listings/:id/respond`: propose a trade; separate acceptance where needed.
- `GET /api/v1/share-market/trades`: only the member's trades or explicitly authorised officer scope.
- `POST /api/v1/share-market/trades/:id/{accept,report-payment,confirm-receipt,cancel,dispute}`.
- Officer-only approval/registration/resolution endpoints with recorded authority; no self-approval.

Replace the in-memory service in `ShareMarket.js` with this API, server-provided allowed actions, loading/error/conflict states, and actual receipt data. Remove all simulated actor controls. Keep the market in preview mode until the accounting contract and concurrency controls are validated.

## Required verification

Balance/statement agreement; positive sellable holdings; member status and identity isolation; no overselling under concurrent requests or external writes; exactly-once settlement after retry; rollback of both ledger sides on failure; correct journal/notification behaviour; disputes retaining reservations; no cross-company leakage; no transfer before receipt/approval; no automatic reversal of historical dividends.

## Scope of this inspection

Connection, table/view definitions, constraints, indexes, trigger/routine metadata, and aggregate activity were inspected. Individual member identities, passwords and transaction references were not fetched. No test postings, migration, trade or notification was performed. Following the user's explicit direction, the main proxy default, Docker configuration and local environment now target `metrohealth_services`. The query compatibility changes described above remain outstanding; changing the connection target does not complete backend integration.
