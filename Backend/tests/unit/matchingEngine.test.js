const { isCargoCompatibleWithVehicle } = require('../../src/modules/matching/matching.service');

describe('Recommendation & Matching Engine Logic (MOD-5, BR-4, BR-5, Table C-5)', () => {
  test('should correctly match compatible cargo types to vehicle body types', () => {
    // Open-body truck allows general goods, construction material, agricultural produce
    expect(isCargoCompatibleWithVehicle('OPEN_BODY', 'AGRICULTURAL_PRODUCE')).toBe(true);
    expect(isCargoCompatibleWithVehicle('OPEN_BODY', 'CONSTRUCTION_MATERIAL')).toBe(true);
    expect(isCargoCompatibleWithVehicle('OPEN_BODY', 'GENERAL_GOODS')).toBe(true);

    // Refrigerated vehicle allows perishable, pharmaceutical, temperature-controlled
    expect(isCargoCompatibleWithVehicle('REFRIGERATED', 'PERISHABLE_GOODS')).toBe(true);
    expect(isCargoCompatibleWithVehicle('REFRIGERATED', 'PHARMACEUTICAL_GOODS')).toBe(true);

    // Tanker allows liquids only
    expect(isCargoCompatibleWithVehicle('TANKER', 'LIQUIDS_AND_BULK_FLUID')).toBe(true);

    // Incompatible checks
    expect(isCargoCompatibleWithVehicle('TANKER', 'FURNITURE')).toBe(false);
    expect(isCargoCompatibleWithVehicle('REFRIGERATED', 'SAND_AND_GRAVEL')).toBe(false);
  });
});
