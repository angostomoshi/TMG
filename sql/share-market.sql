-- Additive request-stage storage only. Does not modify legacy accounting tables.
CREATE SCHEMA IF NOT EXISTS share_market;
CREATE TABLE IF NOT EXISTS share_market.listings (
  id uuid PRIMARY KEY,
  owner text NOT NULL,
  side text NOT NULL CHECK (side IN ('buy','sell')),
  capital_amount numeric(12,2) NOT NULL CHECK (capital_amount > 0),
  asking_amount numeric(12,2) NOT NULL CHECK (asking_amount > 0),
  note varchar(240) NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','matched','cancelled','expired')),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  parent_trade uuid UNIQUE
);
CREATE TABLE IF NOT EXISTS share_market.trades (
  id uuid PRIMARY KEY,
  listing_id uuid NOT NULL REFERENCES share_market.listings(id),
  buyer text NOT NULL,
  seller text NOT NULL,
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','awaiting_review','cancelled','declined')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (buyer <> seller),
  UNIQUE(listing_id,buyer,seller)
);
CREATE TABLE IF NOT EXISTS share_market.events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor text NOT NULL,
  kind text NOT NULL,
  entity_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS market_listing_owner ON share_market.listings(owner,status);
CREATE INDEX IF NOT EXISTS market_trade_buyer ON share_market.trades(buyer,created_at);
CREATE INDEX IF NOT EXISTS market_trade_seller ON share_market.trades(seller,created_at);
