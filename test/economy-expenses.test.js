import test from "node:test";
import assert from "node:assert/strict";
import { calcEconomy } from "../economy.js";
import { countries } from "../data/countries.js";

test("wage, military upkeep, and service budget create real treasury expenses", () => {
  const result = calcEconomy({
    population: 1000000,
    tax_rate: 0,
    industry: 0,
    agriculture: 0,
    tariff: 0,
    wage: 100,
    service_budget: 100,
    army: 1,
    navy: 2,
    air_force: 1,
    air_defense: 1,
    oil_reserves: 0,
    oil_field_level: 0,
    technology: 0,
  });
  assert.equal(result.wages, 800);
  assert.equal(result.army, 35600);
  assert.equal(result.services, 800);
  assert.equal(result.expense, 37200);
  assert.equal(result.net, -37200);
});

test("India population is numeric and Brazil's 1914 president is fully transliterated", () => {
  const india = countries.find((country) => country[0] === "india");
  const brazil = countries.find((country) => country[0] === "brazil");
  assert.equal(india[4], 315000000);
  assert.equal(typeof india[4], "number");
  assert.equal(brazil[2], "هرمس دا فونسه‌کا");
});
