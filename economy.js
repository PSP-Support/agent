export function calcEconomy(p) {
  const population = Math.max(0, Number(p.population || 0)),
    taxable = Math.max(10000, population / 100),
    tax = (taxable * Number(p.tax_rate || 0)) / 100,
    production = Number(p.industry || 0) * 1200 + Number(p.agriculture || 0) * 800,
    tariff = Number(p.tariff || 0) * 500,
    wage = Math.max(0, Number(p.wage || 0)),
    wages = Math.round(wage * (population / 1000000) * 8),
    army = Math.round(
      (Number(p.army || 0) * 900 +
        Number(p.navy || 0) * 1400 +
        Number(p.air_force || 0) * 450 +
        Number(p.air_defense || 0) * 300) *
        8,
    ),
    services = Math.max(0, Number(p.service_budget || 0)) * 8,
    expense = wages + army + services,
    income = tax + production + tariff,
    net = income - expense,
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
    income,
    expense,
    net,
    tax,
    production,
    tariff,
    wages,
    army,
    services,
    roads: 0,
    upkeep: army,
    oilProduction,
    oilConsumption,
    oilNet: oilProduction - oilConsumption,
  };
}

