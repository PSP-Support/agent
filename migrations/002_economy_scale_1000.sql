DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM game_players
    WHERE ABS(treasury::numeric) > 9223372036854775
       OR ABS(wage::numeric) > 9223372036854775
       OR ABS(service_budget::numeric) > 9223372036854775
  ) THEN
    RAISE EXCEPTION 'Economy scale migration would overflow game_players BIGINT values';
  END IF;
  IF EXISTS (
    SELECT 1 FROM game_ledger
    WHERE ABS(amount::numeric) > 9223372036854775
       OR ABS(balance::numeric) > 9223372036854775
  ) THEN
    RAISE EXCEPTION 'Economy scale migration would overflow game_ledger';
  END IF;
  IF EXISTS (
    SELECT 1 FROM game_stocks WHERE ABS(price::numeric) > 9223372036854775
  ) OR EXISTS (
    SELECT 1 FROM game_commodities WHERE ABS(price::numeric) > 9223372036854775
  ) OR EXISTS (
    SELECT 1 FROM game_trade WHERE ABS(unit_price::numeric) > 9223372036854775
  ) OR EXISTS (
    SELECT 1 FROM game_trade_contracts WHERE ABS(transit_cost::numeric) > 9223372036854775
  ) OR EXISTS (
    SELECT 1 FROM game_weapon_market WHERE ABS(unit_price::numeric) > 9223372036854775
  ) OR EXISTS (
    SELECT 1 FROM game_exchange_orders WHERE ABS(unit_price::numeric) > 9223372036854775
  ) OR EXISTS (
    SELECT 1 FROM game_international_loans WHERE ABS(amount::numeric) > 9223372036854775
  ) THEN
    RAISE EXCEPTION 'Economy scale migration would overflow market or loan values';
  END IF;
  IF EXISTS (
    SELECT 1 FROM game_trade_contracts
    WHERE (offer_resource='cash' AND ABS(offer_quantity::numeric)>9223372036854775)
       OR (want_resource='cash' AND ABS(want_quantity::numeric)>9223372036854775)
  ) THEN
    RAISE EXCEPTION 'Economy scale migration would overflow cash trade quantities';
  END IF;
END $$;

UPDATE game_players
SET treasury=(COALESCE(treasury,100000)::numeric*1000)::bigint,
    wage=(COALESCE(wage,100)::numeric*1000)::bigint,
    service_budget=(COALESCE(service_budget,1000)::numeric*1000)::bigint;

UPDATE game_ledger
SET amount=(amount::numeric*1000)::bigint,
    balance=(balance::numeric*1000)::bigint;

UPDATE game_stocks SET price=(price::numeric*1000)::bigint;
UPDATE game_commodities SET price=(price::numeric*1000)::bigint;
UPDATE game_trade SET unit_price=(unit_price::numeric*1000)::bigint;
UPDATE game_trade_contracts
SET transit_cost=(transit_cost::numeric*1000)::bigint,
    offer_quantity=CASE WHEN offer_resource='cash' THEN (offer_quantity::numeric*1000)::bigint ELSE offer_quantity END,
    want_quantity=CASE WHEN want_resource='cash' THEN (want_quantity::numeric*1000)::bigint ELSE want_quantity END;
UPDATE game_weapon_market SET unit_price=(unit_price::numeric*1000)::bigint;
UPDATE game_exchange_orders SET unit_price=(unit_price::numeric*1000)::bigint;
UPDATE game_international_loans SET amount=(amount::numeric*1000)::bigint;

ALTER TABLE game_players ALTER COLUMN treasury SET DEFAULT 100000000;
ALTER TABLE game_players ALTER COLUMN wage SET DEFAULT 100000;
ALTER TABLE game_players ALTER COLUMN service_budget SET DEFAULT 1000000;
