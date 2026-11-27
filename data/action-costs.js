export const developmentResourceCosts = {
  industry: { iron: 100, coal: 150 },
  agriculture: { grain: 100, iron: 20 },
  infrastructure: { iron: 50, coal: 25 },
};

export const militaryUnitResourceCosts = {
  army: { iron: 40, cloth: 20, grain: 50 },
  navy: { iron: 600, coal: 300, fuel_stock: 100 },
  air: { iron: 120, cloth: 60, fuel_stock: 20 },
  defense: { iron: 80, coal: 50 },
};

export const diplomacyResourceCosts = {
  mission: { cloth: 20, grain: 50 },
  embassy: { iron: 100, cloth: 50 },
};

export const strategicResourceCosts = {
  attack: { fuel_stock: 100 },
  repair: { iron: 50 },
  foreignBase: { iron: 300, coal: 200 },
  alliedBase: { iron: 250, coal: 150 },
  navalPatrol: { fuel_stock: 200 },
  exercise: { fuel_stock: 100 },
  intelligence: { iron: 100 },
  command: { iron: 150 },
  nuclear: { iron: 500, coal: 1000 },
};
