# Member share marketplace: research and implementation plan

Research date: 23 September 2026. Status: proposed design; no trading or ledger changes implemented.

## Recommendation and assumptions

Build a members-only bulletin board for buy and sell requests, with controlled settlement and an auditable ownership transfer. Start with fixed-price, whole-listing trades and direct member-to-member payment. Both parties confirm different facts: the buyer reports payment; the seller confirms actual receipt and authorises transfer. An authorised officer records the required organisational approval before the transaction can complete.

Assumptions awaiting confirmation: existing approved members only; Kenyan organisation; exact legal form and registered bylaws not yet supplied. Repository SACCO terminology and Kenyan contacts do not establish the entity's legal classification. Negotiated prices must remain disabled until the applicable rules are confirmed. The initial product can use an approved nominal price.

## Research and implications

1. Kenya's Ministry of Cooperatives publishes model bylaws for regulated non-withdrawable deposit-taking SACCOs. Sections 11.2–11.4 describe a maximum holding of one-fifth, transfers between members with board approval, written transfers at nominal value, and registration of transfers. These are model provisions, not proof of TMG's adopted rules. Confirm the registered bylaws and applicable law before selecting price and approval policy.
   Source: https://ushirika.go.ke/sites/default/files/2026-02/MODEL%20BY-LAWS%20FOR%20THE%20REGULATED%20NON-WITHDRAWABLE%20DEPOSIT%20TAKING%20NON-WDT%20SACCO%20SOCIETIES%20IN%20KENYA.pdf
2. The Ministry's investment cooperative model also specifies transfers to members, management committee approval, nominal value, and registration. An investment group label alone therefore does not establish that negotiated pricing is appropriate.
   Source: https://ushirika.go.ke/sites/default/files/2026-02/Investment%20by%20laws%281%29.pdf
3. Carta describes private-company secondary transactions with negotiated terms, issuer approval, and possible rights of first refusal. Design implication: membership, pricing, transfer restrictions, and approval policy should be explicit configuration, subject to the actual governing documents. This is a product pattern, not Kenyan legal guidance.
   Source: https://carta.com/learn/equity/liquidity-events/selling-private-company-stock/
   Source: https://carta.com/sg/en/learn/equity/liquidity-events/secondary-transactions/?ir=corps_liquidity_related3
4. Binance's P2P workflow distinguishes a buyer reporting payment from a seller checking their account and releasing the asset, and provides an appeal route. Adapt that interaction pattern only: a screenshot or buyer click must never transfer ownership. A database share reservation is not cash escrow or a payment guarantee.
   Source: https://www.binance.com/en-NZ/support/faq/detail/360041106311
5. CMA publishes private-offer requirements. A closed membership market is a scope recommendation, not a conclusion that securities rules do not apply. If the entity is a company or outside participation is proposed, determine the applicable requirements before enabling that scope.
   Source: https://www.cma.or.ke/private-offers/

## Workspace findings

- React 18 application with routes in `src/App.js`; existing share-capital page in `src/components/ShareCapital.js` and dashboard totals in `src/components/Dashboard.js`.
- `npm run dev` starts the Express `proxy-server.js` and React app. The proxy connects to PostgreSQL and an upstream Spring API. `backend/server.js` is a separate server; decide deployment ownership before adding services there.
- `/api/v1/shareCapital/sumTotal/:memberNo` totals credit from `integration.shares_summ_view` with `deposit = 'Shares'`.
- `/api/v1/shareCapital/:memberNo` reads credit minus debit from `ac_shares_ledger` with `transaction_type ILIKE 'sha%'`. Savings queries also include that same ledger filter. Reconcile these definitions with accounting before any transfer writes; the source inspection does not establish which is correct.
- `ShareCapital.js` treats balances as monetary amounts, not an explicit inventory of share units. `ShareStatement.js` processes savings despite its filename. Define share class, unit count, nominal unit value, and any conversion from legacy balances explicitly.
- `requireAuth` only checks for the presence of a bearer token and trusts a supplied member number. `requireVerifiedProxyAuth` verifies proxy tokens and derives identity from claims. Every marketplace operation needs verified identity and ownership/role checks, with a defined approach for upstream-issued tokens.
- Existing M-Pesa STK/callback routes concern payments to the organisation. They do not establish support for verifying money sent directly to another member. Keep the first release's receipt confirmation explicitly manual.
- No marketplace or transfer implementation was found in the inspected application sources. No live database verification was performed.

## Member experience

Add a Share Market navigation entry and `/share-market` route with:

| Area | Contents |
| --- | --- |
| Buy shares | Members' sell listings: quantity, permitted unit price, total, expiry, and Request to buy |
| Sell shares | Members' buy requests: desired quantity, permitted price, expiry, and Offer to sell |
| My listings | Draft, active, matched, expired and cancelled posts |
| My transactions | Current action, deadline, trade details, confirmations, disputes and receipts |

Show owned, reserved and available shares separately. Posting asks for buy/sell, share class, quantity, expiry, and price only where policy permits it; calculate the total on the server. Use approved payment methods. Hide payment account details until a trade has been accepted and cleared to proceed.

The transaction page presents the agreed terms, named counterparties, a step-by-step timeline, payment instructions, and the appropriate action for the signed-in member. Actions include Accept terms, I have paid, I confirm receipt and authorise transfer, and Report a problem. Display a clear confirmation summary before the seller authorises release.

Add an officer queue for eligibility/organisational approval, payment disputes, and registration status. Record the board/committee resolution or delegation where required; a portal admin role alone does not substitute for that authority. Officers must not approve their own trades.

## Trade lifecycle

1. Seller publishes a listing. Validate authoritative available holdings and reserve the offered quantity atomically. A buy request does not reserve shares or claim the buyer has funds.
2. Another member responds. A buy request response identifies the seller and reserves that seller's shares when creating a binding offer. For the first release, accept the entire listing; no partial fills or bidding engine.
3. Both parties accept the same immutable terms. Only one response may become the accepted trade. Release unsuccessful offer reservations when their offers end. Prevent self-trading and overlapping reservations.
4. Obtain required organisational clearance before directing the buyer to pay. Record approval evidence and check minimum holdings, member status, any pledged shares, holding limits, and transfer restrictions.
5. Buyer pays the seller externally and selects I have paid, recording method, amount, reference and time. Optional supporting documents remain private to the parties and authorised reviewers.
6. Seller checks their actual bank/M-Pesa account and confirms receipt of the agreed amount. This confirmation authorises the ownership transfer; buyer-submitted evidence alone does not.
7. Complete registration and ledger settlement only when all required approvals and confirmations exist and there is no dispute. If separate registration approval is needed, show Awaiting registration rather than Completed.
8. Commit the ownership movement exactly once. Issue a transfer receipt and update both members' balances/statements with the same reference and effective time.

Suggested trade states: `AWAITING_ACCEPTANCE -> AWAITING_APPROVAL -> AWAITING_PAYMENT -> PAYMENT_REPORTED -> AWAITING_REGISTRATION -> COMPLETED`. Separate listing states and reservation status from trade states. A trade can enter `DISPUTED`; `CANCELLED`, `REJECTED` and `EXPIRED` require state-specific rules.

Before payment, expiry/cancellation can release reservations when no competing payment report or settlement has occurred. Once payment is reported or receipt acknowledged, prohibit unilateral cancellation and automatic release. Disputes freeze shares until an authorised resolution documents settlement or confirmed refund. A late payment after cancellation is a support case, never an automatic transfer. Deadlines and expiry workers must use the same locking rules as member actions.

## Accounting and consistency

- First define the authoritative ownership register and ledger contract with the accounting system owner. A read view is not a write API. Confirm whether direct posting is supported, including general-ledger journals, registration and dividend effects.
- Available quantity = eligible owned quantity minus the union of pledged/restricted quantity and active reservations; avoid counting the same restriction twice. Apply configured minimum retained holdings separately.
- Lock the trade and relevant holdings/reservations during validation and settlement. All systems that can reduce holdings or create pledges must honour the same controls; a portal-only lock cannot protect against external accounting writes.
- Where all authoritative records share one PostgreSQL transaction, debit the seller's share ownership/capital and credit the buyer's by the same quantity and nominal value, record the transfer, consume reservations, and mark completed together. Preserve total issued shares and aggregate share capital.
- Where the upstream system owns posting, require an idempotent transfer API and durable pending/reconciliation workflow. Do not mark complete until authoritative posting is confirmed. Never issue two unrelated debit/credit API calls and assume they are atomic.
- Keep negotiated sale proceeds, nominal capital moved, transfer fees and taxes separate. Money paid directly between members is not new organisation capital or a deposit into its cash account.
- Use integer units where applicable and exact decimal monetary values. Store currency and round according to policy; do not use floating-point arithmetic for posting.
- Keep completed records immutable. Corrections require an authorised compensating transfer with a linked audit record, not deleting or editing the original entries.
- Define dividend entitlement using the ownership effective date and approved dividend policy; do not rewrite historical dividend payments merely because ownership changes.

## Proposed implementation

New frontend components: `ShareMarket`, `ShareListingForm`, `ShareTradeDetail`, and `ShareTransferAdmin`. Reuse the existing TMG styling, navigation and authenticated API conventions.

New backend module in the deployed Express service: marketplace routes, authorisation, policy checks, reservations, settlement adapter, audit events and scheduled expiry/reconciliation. Avoid adding all business logic directly into the existing large proxy file.

Proposed tables (names illustrative):

- `share_market_policies`: share class, price mode, nominal value, eligibility, limits, approvals, fees, deadlines and policy version.
- `share_market_listings`: owner, side, quantity, price, currency, expiry and status.
- `share_market_trades`: listing, buyer, seller, immutable agreed terms, policy version, state and timestamps.
- `share_market_reservations`: owner, quantity, listing/trade link, status and release reason; transfer an existing listing reservation to its trade instead of reserving twice.
- `share_market_confirmations`: payment reports and seller release authorisations, actor and timestamps.
- `share_market_approvals`: authorised decision, authority/resolution reference and reasons.
- `share_market_transfers`: unique trade reference, effective date and authoritative ledger/registration references.
- `share_market_disputes`, append-only `share_market_events`, and a notification outbox.

Provide scoped endpoints to browse/post listings, respond/accept, report payment, confirm receipt, raise disputes and perform officer decisions. Derive the acting member from verified authentication; never trust a submitted member number as proof of identity. Enforce each transition on the server, including retry idempotency and unique settlement per trade. Keep evidence access private and restrict sensitive data in logs.

## Delivery phases and acceptance gates

1. **Rules and accounting contract:** confirm organisation type, registered bylaws, pricing, approver authority, share units, source-of-truth balances, restrictions, fees and dividend rules. Reconcile representative balances with statements. Establish verified authentication for both supported token flows. Output: signed-off rules and posting contract.
2. **Market and reservations:** build member pages, listings, responses and server-side eligibility/reservations. Keep settlement disabled until the accounting contract exists. Output: members can safely create and accept permitted offers.
3. **Controlled settlement:** add payment reports, seller authorisation, officer approval/registration, atomic or upstream-idempotent transfer, statements, receipts and notifications. Output: a complete test trade reconciles in the authoritative register.
4. **Pilot and operational controls:** test disputes, refunds, expiries, duplicate requests, permissions and accounting failures; pilot with a small approved member group. Output: reconciliation and support procedures work before wider release.
5. **Later scope:** partial fills, counteroffers, approved electronic signatures and automated payment verification where the payment provider genuinely supports the flow. Cash escrow or platform collections/payouts require their own provider and operational design.

Required settlement tests: simultaneous buyers cannot oversell; one member cannot authorise another's release; officers cannot self-approve; duplicate actions/retries cannot double-post; failures cannot leave a one-sided transfer; disputes retain reservations; cancellation races with payment reports resolve safely; restricted holdings are unavailable; transfer totals reconcile; dashboards and statements agree; upstream timeout reconciliation does not duplicate a successful posting; notification failures do not undo settlement.

## Decisions still needed

- Legal entity type, registration country and current governing transfer rules.
- Existing members only, or outsiders admitted through a separate membership process?
- Which accounting balance represents transferable shares, and what is one unit's nominal value?
- Nominal-value transfers or permitted negotiated prices?
- Who has organisational approval and dispute authority, and how is that authority recorded?
- Direct member payments for the first release, payment deadlines, fees and dividend cutoff policy.

Recommended initial scope: existing approved members, approved nominal price pending rule confirmation, whole-listing trades, direct payments, seller receipt confirmation, recorded organisational approval, and authoritative registered transfers.
