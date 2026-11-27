import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  developmentResourceCosts,
  diplomacyResourceCosts,
  militaryUnitResourceCosts,
  strategicResourceCosts,
} from "../data/action-costs.js";
import { weaponResourceCosts } from "../data/weapons.js";

test("non-market action costs are resources, never treasury", () => {
  const groups = [
    developmentResourceCosts,
    diplomacyResourceCosts,
    militaryUnitResourceCosts,
    strategicResourceCosts,
  ];
  for (const group of groups)
    for (const costs of Object.values(group)) {
      assert.ok(Object.keys(costs).length > 0);
      assert.ok(!Object.hasOwn(costs, "treasury"));
      for (const amount of Object.values(costs)) assert.ok(amount > 0);
    }
});

test("weapon production consumes class-appropriate resources", () => {
  assert.deepEqual(weaponResourceCosts(["rifle", "تفنگ ماوزر", 180]), {
    iron: 1,
    coal: 1,
  });
  assert.deepEqual(weaponResourceCosts(["plane", "هواپیمای آلباتروس", 85000]), {
    iron: 85,
    cloth: 43,
    fuel_stock: 9,
  });
  assert.deepEqual(weaponResourceCosts(["battleship", "ناو جنگی", 2300000]), {
    iron: 2300,
    coal: 1150,
    fuel_stock: 230,
  });
});

test("cash deductions in gameplay code remain limited to trade and markets", async () => {
  const source = await readFile(new URL("../index.js", import.meta.url), "utf8");
  const market = await readFile(new URL("../handlers/market.js", import.meta.url), "utf8");
  const gameplaySource = source + "\\n" + market;
  const deductions = [...gameplaySource.matchAll(/treasury\s*=\s*treasury\s*-\s*(?:\$[0-9]+|[0-9]+)/g)];
  assert.equal(deductions.length, 6);
  for (const match of deductions) {
    const context = gameplaySource.slice(Math.max(0, match.index - 300), match.index + 350);
    assert.match(context, /offer|stock|trade|transit|resource|commodity/i);
  }
});
