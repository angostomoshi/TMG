# Share Market frontend

Open **Share Market** in the signed-in sidebar, or navigate to `/share-market`.

The frontend preview includes searchable buy/sell listings, price/quantity sorting, a posting form, listing cancellation, sample reservations, member transaction details, payment reporting, seller receipt authorisation, disputes and transfer receipts. All data is fictional and held in component memory. Navigating away or refreshing resets it; **Reset demo** also restores the initial fixtures.

To preview a complete purchase, select **Request to buy**, accept the terms, then open **My transactions**. Use the labelled preview controls to simulate organisational approval, enter a sample payment reference, simulate seller receipt, then simulate registration. The demo portfolio changes only after registration.

To preview selling, open the preloaded selling transaction or respond to a buy request. **My listings → Preview member response** demonstrates another member accepting your own listing. These controls simulate other actors; they are not production permissions or real officer approvals.

## Files

- `src/components/ShareMarket.js`: page, accessible native dialogs, listing form and transaction view.
- `src/components/ShareMarket.css`: responsive styles scoped with the `sm-` prefix.
- `src/services/shareMarketDemo.mjs`: isolated fixtures, reservation calculations and guarded demo state transitions.
- `scripts/share-market-demo.test.mjs`: reservation, settlement order, role, duplicate-action and dispute tests. Run `node --test scripts/share-market-demo.test.mjs`.
- `src/App.js`: navigation and authenticated-layout route.

## Backend integration boundary

Replace the demo reducer/fixtures with an authenticated API service and server-returned holdings, listings, trades and allowed actions. Add loading, retry and server-conflict states when the API contract is defined. The frontend currently makes no marketplace network calls and never changes cached real member balances.

Remove preview controls and bind counterpart and officer actions to their actual sessions. All identity, ownership, reservations, validation and settlement guarantees must be implemented by the server. The in-memory checks only make the preview behave coherently.

The illustrative unit price is KES 100; the demo form allows price exploration. Production pricing, share units, member eligibility and approval policy must come from the confirmed organisational rules. Listing durations are displayed only; there is no real expiry worker, payment window, cash escrow, payment processing, dispute resolution or accounting posting in this frontend release. See `share-marketplace-plan.md` for the full integration plan.
