import test from "node:test";
import assert from "node:assert/strict";
import {
  advanceSettlementTimestamp,
  calculateSettlementResources,
  calculateSettlementTicks,
  MAX_SETTLEMENT_TICKS,
  SETTLEMENT_PERIOD_MS,
} from "../settlement.js";

const basePlayer = {
  country_id: "germany",
  population: 1000,
  industry: 0,
  army: 1,
  navy: 0,
  air_force: 0,
  technology: 10,
  oil_field_level: 100,
  oil_reserves: 1000,
  oil_stock: 0,
  fuel_stock: 0,
  grain: 0,
  coal: 0,
  iron: 0,
  cloth: 0,
  electricity_stock: 0,
};

test("catch-up is capped at seven days (56 three-hour ticks)", () => {
  const start = new Date("1914-01-01T00:00:00.000Z");
  const eightDaysLater = new Date(start.getTime() + 8 * 24 * 60 * 60 * 1000);
  assert.equal(calculateSettlementTicks(start, eightDaysLater), MAX_SETTLEMENT_TICKS);
  assert.equal(MAX_SETTLEMENT_TICKS, 56);
});

test("advancing ticks preserves the timestamp remainder", () => {
  const start = new Date("1914-01-01T00:17:23.000Z");
  const next = advanceSettlementTimestamp(start, 2);
  assert.equal(next.getTime(), start.getTime() + 2 * SETTLEMENT_PERIOD_MS);
  assert.equal(next.toISOString(), "1914-01-01T06:17:23.000Z");
});

test("electricity generated this tick can satisfy this tick's demand", () => {
  const result = calculateSettlementResources(
    { ...basePlayer, population: 100000, electricity_stock: 0 },
    { hydro_power: 1 },
    8,
  );
  assert.equal(result.electricityMade, 650);
  assert.ok(result.electricityUsed > 0);
  assert.equal(result.electricityAvailable, result.electricityMade);
});

test("refinery fuel generated this tick can satisfy current fuel demand", () => {
  const result = calculateSettlementResources(basePlayer, { oil_refinery: 1 }, 8);
  assert.ok(result.fuelMade > 0);
  assert.ok(result.oilConsumed > 0);
  assert.equal(result.fuelAvailable, result.fuelMade);
});

test("grain shortage is recorded without consuming negative grain", () => {
  const result = calculateSettlementResources(
    { ...basePlayer, population: 1000000, grain: 0 },
    {},
    8,
  );
  assert.ok(result.grainNeed > 0);
  assert.equal(result.grainUsed, 0);
  assert.ok(result.grainUsed <= 0);
});

test("building levels affect production and building income", () => {
  const result = calculateSettlementResources(
    basePlayer,
    { wheat_farm: 2, housing: 3, hydro_power: 2 },
    8,
  );
  assert.equal(result.grainMade, 500);
  assert.equal(result.electricityMade, 1300);
  assert.ok(result.dailyBuildingIncome >= 5400 + 3600 + 10000);
});

test("resource consumption never exceeds available stocks", () => {
  const player = {
    ...basePlayer,
    population: 2000000,
    grain: 1,
    coal: 2,
    iron: 3,
    cloth: 4,
    electricity_stock: 5,
    fuel_stock: 6,
  };
  const result = calculateSettlementResources(player, { hydro_power: 2, oil_refinery: 2 }, 56);
  assert.ok(result.grainUsed <= player.grain);
  assert.ok(result.coalUsed <= player.coal);
  assert.ok(result.ironUsed <= player.iron);
  assert.ok(result.clothUsed <= player.cloth);
  assert.ok(result.electricityUsed <= player.electricity_stock + result.electricityMade);
  assert.ok(result.oilConsumed <= player.fuel_stock + result.fuelMade);
  assert.ok(result.oilStock >= 0);
  assert.ok(result.fuelStock >= 0);
});
