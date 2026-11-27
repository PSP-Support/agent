import test from "node:test";
import assert from "node:assert/strict";
import { registerMilitaryHandlers } from "../handlers/military.js";

test("military module registers recruitment and repair callbacks", () => {
  const registered = [];
  const bot = {
    callbackQuery: (pattern, handler) => registered.push({ pattern, handler }),
  };
  registerMilitaryHandlers({
    bot,
    pool: {},
    ready: async () => null,
    say: async () => {},
    edit: async () => {},
    K: () => ({}),
    nation: () => ({}),
    money: (value) => String(value),
    getCountryWeapons: () => [],
    countryWeapons: {},
    weaponLabel: (weapon) => weapon[1],
    resourceShortages: () => [],
    resourceCostDescription: () => "",
    resourceCostAssignments: () => [],
    resourceCostValues: () => [],
  });
  assert.equal(registered.length, 3);
  assert.deepEqual(
    registered.map(({ pattern }) => String(pattern)),
    [
      "/^mil:(army|navy|air|defense)$/",
      "/^weaponrepair$/",
      "/^weaponrepair:([a-z0-9_]+)$/",
    ],
  );
});
