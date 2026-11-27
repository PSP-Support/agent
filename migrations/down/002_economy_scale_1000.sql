DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM game_players
    WHERE treasury%1000<>0 OR wage%1000<>0 OR service_budget%1000<>0
  ) OR EXISTS (
    SELECT 1 FROM game_ledger WHERE amount%1000<>0 OR balance%1000<>0
  ) OR EXISTS (
    SELECT 1 FROM game_stocks WHERE price%1000<>0
  ) OR EXISTS (
    SELECT 1 FROM game_commodities WHERE price%1000<>0
  ) OR EXISTS (
    SELECT 1 FROM game_trade WHERE unit_price%1000<>0
  ) OR EXISTS (
    SELECT 1 FROM game_trade_contracts
    WHERE transit_cost%1000<>0
       OR (offer_resource='cash' AND offer_quantity%1000<>0)
       OR (want_resource='cash' AND want_quantity%1000<>0)
  ) OR EXISTS (
    SELECT 1 FROM game_weapon_market WHERE unit_price%1000<>0
  ) OR EXISTS (
    SELECT 1 FROM game_exchange_orders WHERE unit_price%1000<>0
  ) OR EXISTS (
    SELECT 1 FROM game_international_loans WHERE amount%1000<>0
  ) THEN
    RAISE EXCEPTION 'Cannot reverse economy scale exactly: some monetary values are not divisible by 1000. Restore a pre-migration backup instead.';
  END IF;
END $$;

UPDATE game_players SET treasury=treasury/1000,wage=wage/1000,service_budget=service_budget/1000;
UPDATE game_ledger SET amount=amount/1000,balance=balance/1000;
UPDATE game_stocks SET price=price/1000;
UPDATE game_commodities SET price=price/1000;
UPDATE game_trade SET unit_price=unit_price/1000;
UPDATE game_trade_contracts
SET transit_cost=transit_cost/1000,
    offer_quantity=CASE WHEN offer_resource='cash' THEN offer_quantity/1000 ELSE offer_quantity END,
    want_quantity=CASE WHEN want_resource='cash' THEN want_quantity/1000 ELSE want_quantity END;
UPDATE game_weapon_market SET unit_price=unit_price/1000;
UPDATE game_exchange_orders SET unit_price=unit_price/1000;
UPDATE game_international_loans SET amount=amount/1000;
ALTER TABLE game_players ALTER COLUMN treasury SET DEFAULT 100000;
ALTER TABLE game_players ALTER COLUMN wage SET DEFAULT 100;
ALTER TABLE game_players ALTER COLUMN service_budget SET DEFAULT 1000;
