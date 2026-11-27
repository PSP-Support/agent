import test from "node:test";
import assert from "node:assert/strict";
import { registerMarketHandlers } from "../handlers/market.js";

test("market module registers sell, buy, and cancel callbacks", () => {
  const registered = [];
  const bot = {
    callbackQuery: (pattern, handler) => registered.push({ pattern, handler }),
  };
  registerMarketHandlers({
    bot,
    pool: {},
    ready: async () => null,
    say: async () => {},
    K: () => ({}),
    nation: () => ({}),
    resourceNames: {},
    resourceLabel: (key) => key,
    country: () => null,
    fmt: String,
    money: String,
  });
  assert.equal(registered.length, 3);
  assert.deepEqual(
    registered.map(({ pattern }) => String(pattern)),
    [
      "/^sell:(grain|coal|iron|cloth|oil|gold_stock)$/",
      "/^buy:(\\d+)$/",
      "/^tradecancel:(\\d+)$/",
    ],
  );
});
