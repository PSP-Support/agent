import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { countries } from "../data/countries.js";
import { storeCats, storeIncomeDaily } from "../data/buildings.js";
import { countryWeapons } from "../data/weapons.js";
import { calcEconomy } from "../economy.js";

test("country starting treasury, building prices, and building income use ×1000", () => {
  const germany = countries.find((country) => country[0] === "germany");
  assert.ok(germany);
  assert.ok(Number(germany[5]) >= 1000000000);
  assert.equal(Number(germany[5]) % 1000, 0);
  const commercial = storeCats
    .flatMap((category) => category.items)
    .find((item) => item[0] === "commercial");
  assert.equal(commercial[2], 38000000);
  assert.equal(storeIncomeDaily.commercial, 4000000);
});

test("weapon market reference prices use ×1000 while production costs stay resource-based", () => {
  const mauser = countryWeapons.germany.find((weapon) => weapon[0] === "mauser98");
  assert.equal(mauser[2], 180000);
});

test("economy income calculations return actual scaled dollars", () => {
  const result = calcEconomy({
    population: 100000,
    tax_rate: 10,
    industry: 0,
    agriculture: 0,
    tariff: 0,
    oil_reserves: 0,
    oil_field_level: 0,
    technology: 0,
    army: 0,
    navy: 0,
    air_force: 0,
  });
  assert.equal(result.tax, 1000000);
  assert.equal(result.income, 1000000);
});

test("economy migration is numbered and down migration stays outside auto-run directory", async () => {
  const rootFiles = await readdir(new URL("../migrations/", import.meta.url));
  assert.ok(rootFiles.includes("002_economy_scale_1000.sql"));
  const sql = await readFile(
    new URL("../migrations/002_economy_scale_1000.sql", import.meta.url),
    "utf8",
  );
  const down = await readFile(
    new URL("../migrations/down/002_economy_scale_1000.sql", import.meta.url),
    "utf8",
  );
  assert.match(sql, /UPDATE game_players/);
  assert.match(sql, /COALESCE\(treasury,100000\)::numeric\*1000/);
  assert.match(sql, /ALTER COLUMN treasury SET DEFAULT 100000000/);
  assert.match(down, /Cannot reverse economy scale exactly/);
});

test("migration preflight script passes Node syntax validation", () => {
  execFileSync(process.execPath, [
    "--check",
    new URL("../scripts/preflight-economy-migration.js", import.meta.url).pathname,
  ]);
});
