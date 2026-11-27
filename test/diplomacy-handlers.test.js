import test from "node:test";
import assert from "node:assert/strict";
import { registerDiplomacyHandlers } from "../handlers/diplomacy.js";

test("diplomacy module registers the mission and embassy callback handlers", () => {
  const registered = [];
  const bot = {
    callbackQuery: (pattern, handler) => registered.push({ pattern, handler }),
  };
  registerDiplomacyHandlers({
    bot,
    pool: {},
    ready: async () => null,
    say: async () => {},
    edit: async () => {},
    K: () => ({}),
    get: async () => null,
    country: () => null,
    diplomacyResourceCosts: { mission: {}, embassy: {} },
    resourceShortages: () => [],
    resourceCostDescription: () => "",
    resourceCostAssignments: () => [],
    resourceCostValues: () => [],
  });
  assert.equal(registered.length, 4);
  assert.deepEqual(
    registered.map(({ pattern }) => String(pattern)),
    [
      "/^dipmissions$/",
      "/^dipembassies$/",
      "/^dipmission:(\\d+)$/",
      "/^dipembassy:(\\d+)$/",
    ],
  );
});
