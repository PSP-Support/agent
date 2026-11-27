export const MAX_SETTLEMENT_TICKS = 56;
export const SETTLEMENT_PERIOD_MS = 3 * 60 * 60 * 1000;

export function calculateSettlementTicks(lastSettlement, now = Date.now(), period = SETTLEMENT_PERIOD_MS) {
  return Math.min(
    MAX_SETTLEMENT_TICKS,
    Math.floor((now - new Date(lastSettlement).getTime()) / period),
  );
}

export function advanceSettlementTimestamp(lastSettlement, ticks, period = SETTLEMENT_PERIOD_MS) {
  return new Date(new Date(lastSettlement).getTime() + ticks * period);
}

export function calculateSettlementResources(row, buildings, ticks) {
  const lv = (k) => Number(buildings[k] || 0),
  scale = ticks / 8;
const oilProduced = Math.min(
  Number(row.oil_reserves || 0),
  Math.round(
    Number(row.oil_field_level || 0) * (1 + Number(row.technology || 0) / 250) * scale,
  ),
);
const rawOil = Math.max(0, Number(row.oil_stock || 0)) + oilProduced;
const refineryOil = Math.min(rawOil, Math.round(lv("oil_refinery") * 55 * scale));
const fuelMade = Math.round(refineryOil * 1.7);
const population = Number(row.population || 0);
const coldGeo = [
  "russia",
  "canada",
  "sweden",
  "norway",
  "finland",
  "iceland",
  "denmark",
  "switzerland",
  "mongolia",
  "ukraine",
  "poland",
  "czech",
  "hungary",
  "serbia",
  "romania",
];
const aridGeo = [
  "persia",
  "afghanistan",
  "saudi",
  "oman",
  "yemen",
  "egypt",
  "sudan",
  "libya",
  "algeria",
  "morocco",
  "iraq",
];
const tropicalGeo = [
  "india",
  "indonesia",
  "vietnam",
  "burma",
  "malaya",
  "nigeria",
  "ghana",
  "kenya",
  "uganda",
  "congo",
  "brazil",
  "colombia",
  "venezuela",
  "philippines",
];
const coldFactor = coldGeo.includes(row.country_id) ? 1.2 : 1;
const foodFactor = aridGeo.includes(row.country_id)
  ? 1.25
  : tropicalGeo.includes(row.country_id)
    ? 1.1
    : coldGeo.includes(row.country_id)
      ? 1.15
      : 1;
const fuelFactor = coldGeo.includes(row.country_id)
  ? 1.25
  : aridGeo.includes(row.country_id)
    ? 1.1
    : 1;
const grainNeed = Math.ceil((population / 100000) * foodFactor * scale);
const ironNeed = Math.ceil(
  (Number(row.industry || 0) * 8 + lv("arms_factory") * 35 + lv("railway") * 10) * scale,
);
const clothNeed = Math.ceil((population / 100000) * 3 * scale);
const electricityNeed = Math.ceil(
  (population / 10000 + Number(row.industry || 0) * 25) * scale,
);
const oilNeed = Math.ceil(
  (Number(row.army || 0) * 2 +
    Number(row.navy || 0) * 10 +
    Number(row.air_force || 0) * 3 +
    Number(row.industry || 0) * 4) *
    fuelFactor *
    scale,
);
const coalBaseNeed = Math.ceil(
  (Number(row.industry || 0) * 20 + (population / 1000000) * 12 * coldFactor) * scale,
);
const coalPowerDemand = Math.ceil(lv("coal_power") * 120 * scale);
const coalNeed = coalBaseNeed + coalPowerDemand;
const grainMade = Math.round((lv("wheat_farm") * 250 + lv("plateau_farm") * 160) * scale);
const goldMade = Math.round(lv("gold_mine") * 35 * scale);
const ironMade = Math.round(lv("iron_mine") * 180 * scale);
const coalMade = Math.round(lv("coal_mine") * 220 * scale);
const coalUsed = Math.min(Number(row.coal || 0), coalNeed);
const coalForPower = Math.min(coalPowerDemand, Math.max(0, coalUsed - coalBaseNeed));
const coalPowerRatio = coalPowerDemand ? coalForPower / coalPowerDemand : 1;
const electricityMade = Math.round(
  (lv("coal_power") * 500 * coalPowerRatio + lv("hydro_power") * 650 + lv("oil_power") * 420) *
    scale,
);
const ironUsed = Math.min(Number(row.iron || 0), ironNeed);
const grainUsed = Math.min(Number(row.grain || 0), grainNeed);
const clothUsed = Math.min(Number(row.cloth || 0), clothNeed);
const electricityAvailable = Math.max(0, Number(row.electricity_stock || 0) + electricityMade);
const electricityUsed = Math.min(electricityAvailable, electricityNeed);
const oilAvailable = Math.max(0, rawOil - refineryOil);
const fuelAvailable = Math.max(0, Number(row.fuel_stock || 0) + fuelMade);
const oilConsumed = Math.min(fuelAvailable, oilNeed),
  oilShortage = oilNeed - oilConsumed;
const oilStock = oilAvailable;
const fuelStock = fuelAvailable - oilConsumed;
const dailyBuildingIncome =
  lv("gold_mine") * 9000 +
  lv("iron_mine") * 6500 +
  lv("coal_mine") * 5000 +
  lv("oil_refinery") * 8500 +
  lv("housing") * 1800 +
  lv("admin") * 2500 +
  lv("commercial") * 4000 +
  lv("hotel") * 6000 +
  lv("highway") * 1200 +
  lv("railway") * 2500 +
  lv("station") * 2000 +
  lv("airport") * 12000 +
  lv("port") * 9000 +
  lv("wheat_farm") * 1800 +
  lv("plateau_farm") * 1200 +
  lv("grain_silo") * 700 +
  lv("coal_power") * 4000 +
  lv("hydro_power") * 5000 +
  lv("oil_power") * 3800 +
  lv("arms_factory") * 6500;

  return {
    lv,
    scale,
    oilProduced,
    rawOil,
    refineryOil,
    fuelMade,
    population,
    coldFactor,
    foodFactor,
    fuelFactor,
    grainNeed,
    ironNeed,
    clothNeed,
    electricityNeed,
    oilNeed,
    coalBaseNeed,
    coalPowerDemand,
    coalNeed,
    grainMade,
    goldMade,
    ironMade,
    coalMade,
    coalUsed,
    coalForPower,
    coalPowerRatio,
    electricityMade,
    ironUsed,
    grainUsed,
    clothUsed,
    electricityAvailable,
    electricityUsed,
    oilAvailable,
    fuelAvailable,
    oilConsumed,
    oilShortage,
    oilStock,
    fuelStock,
    dailyBuildingIncome,
  };
}
