export function calcEconomy(p) {
  const taxable = Math.max(10000, Number(p.population) / 100),
    tax = ((taxable * p.tax_rate) / 100) * 1000,
    production = (p.industry * 1200 + p.agriculture * 800) * 1000,
    tariff = p.tariff * 500 * 1000,
    oilProduction = Math.min(
      Number(p.oil_reserves || 0),
      Math.round(Number(p.oil_field_level || 0) * (1 + Number(p.technology || 0) / 250)),
    ),
    oilConsumption = Math.max(
      10,
      Number(p.industry || 0) * 4 +
        Number(p.army || 0) * 2 +
        Number(p.navy || 0) * 10 +
        Number(p.air_force || 0) * 3,
    );
  return {
    income: tax + production + tariff,
    expense: 0,
    tax,
    production,
    tariff,
    wages: 0,
    army: 0,
    services: 0,
    roads: 0,
    upkeep: 0,
    oilProduction,
    oilConsumption,
    oilNet: oilProduction - oilConsumption,
  };
}

