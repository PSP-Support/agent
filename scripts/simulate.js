import { countries } from "../data/countries.js";
import { calcEconomy } from "../economy.js";
import { calculateSettlementResources } from "../settlement.js";

const country = countries.find((item) => item[0] === "germany");
if (!country) throw new Error("Germany is missing from data/countries.js");

const state = {
  country_id: country[0],
  population: Number(country[4]),
  treasury: Number(country[5]),
  stability: 60,
  tax_rate: 10,
  tariff: 5,
  industry: 20,
  agriculture: 30,
  technology: 10,
  army: 20,
  navy: 5,
  air_force: 0,
  oil_field_level: 0,
  oil_reserves: 0,
  oil_stock: 0,
  gold_stock: 0,
  iron: 3000,
  coal: 5000,
  grain: 10000,
  cloth: 2500,
  electricity_stock: 0,
  fuel_stock: 0,
};

const buildings = {
  housing: 5,
  wheat_farm: 2,
  coal_mine: 2,
  iron_mine: 1,
  hydro_power: 1,
  oil_refinery: 1,
  railway: 2,
};
const initial = { ...state };
let totalIncome = 0;
let ticksWithShortages = 0;

for (let tick = 0; tick < 56; tick += 1) {
  const result = calculateSettlementResources(state, buildings, 1);
  const economy = calcEconomy(state);
  const earned = Math.max(0, Math.round((economy.income + result.dailyBuildingIncome) * result.scale));
  totalIncome += earned;
  state.treasury += earned;
  state.oil_stock = result.oilStock;
  state.oil_reserves = Math.max(0, state.oil_reserves - result.oilProduced);
  state.gold_stock += result.goldMade;
  state.iron = Math.max(0, state.iron - result.ironUsed) + result.ironMade;
  state.coal = Math.max(0, state.coal - result.coalUsed) + result.coalMade;
  state.grain = Math.max(0, state.grain - result.grainUsed) + result.grainMade;
  state.cloth = Math.max(0, state.cloth - result.clothUsed);
  state.electricity_stock = Math.max(
    0,
    state.electricity_stock + result.electricityMade - result.electricityUsed,
  );
  state.fuel_stock = result.fuelStock;

  const shortages =
    (result.grainUsed < result.grainNeed ? 1 : 0) +
    (result.coalUsed < result.coalNeed ? 1 : 0) +
    (result.ironUsed < result.ironNeed ? 1 : 0) +
    (result.clothUsed < result.clothNeed ? 1 : 0) +
    (result.electricityUsed < result.electricityNeed ? 1 : 0) +
    (result.oilShortage > 0 ? 1 : 0);
  if (shortages > 0) ticksWithShortages += 1;
  state.stability = Math.max(
    0,
    Math.min(
      100,
      state.stability -
        (result.grainUsed < result.grainNeed ? 3 : 0) -
        (shortages > 2 ? 1 : 0) +
        (shortages === 0 ? 1 : 0),
    ),
  );
  state.population = Math.max(
    1000,
    state.population +
      (result.grainUsed < result.grainNeed
        ? -Math.ceil(state.population * 0.00001 * result.scale)
        : Math.round(Number(buildings.housing || 0) * 5 * result.scale)),
  );
}

console.log("56-tick (7-day) settlement simulation");
console.log("Country:", country[1], "(" + country[0] + ")");
console.log("Treasury:", initial.treasury.toLocaleString(), "->", state.treasury.toLocaleString());
console.log("Net treasury change:", (state.treasury - initial.treasury).toLocaleString());
console.log("Income accumulated:", totalIncome.toLocaleString());
console.log("Population:", initial.population.toLocaleString(), "->", state.population.toLocaleString());
console.log("Stability:", initial.stability, "->", state.stability);
console.log("Ticks with resource shortages:", ticksWithShortages, "/ 56");
console.log("Final stocks:", {
  grain: state.grain,
  coal: state.coal,
  iron: state.iron,
  cloth: state.cloth,
  electricity: state.electricity_stock,
  refinedFuel: state.fuel_stock,
});
