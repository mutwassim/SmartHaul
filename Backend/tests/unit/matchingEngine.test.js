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

describe('Shared loads and route similarity (FR-RM-7, FR-RM-9, Algorithm 3 (deferred shared loads), BR-33)', () => {
  const {
    computeRemainingCapacity,
    computeRouteSimilarity,
    evaluateSharedLoadEligibility,
  } = require('../../src/modules/matching/matching.service');

  // Committed trip Lahore -> Islamabad
  const committed = {
    pickupLat: 31.47, pickupLng: 74.24,
    dropoffLat: 33.66, dropoffLng: 73.06,
    cargoType: 'CONSTRUCTION_MATERIAL',
    cargoWeight: 4,
    expectedDeliveryDate: new Date(Date.now() + 48 * 3600 * 1000),
  };
  // Candidate Gujranwala-ish -> Rawalpindi-ish, along the same corridor
  const along = {
    pickupLat: 32.16, pickupLng: 74.19,
    dropoffLat: 33.6, dropoffLng: 73.05,
    cargoType: 'CONSTRUCTION_MATERIAL',
    cargoWeight: 3,
    expectedDeliveryDate: new Date(Date.now() + 48 * 3600 * 1000),
  };
  // Candidate going the opposite way (Islamabad -> Karachi)
  const wrongWay = { ...along, pickupLat: 33.66, pickupLng: 73.06, dropoffLat: 24.86, dropoffLng: 67.0 };
  const truck = { vehicleType: 'OPEN_BODY', ratedCapacity: 10 };

  test('remaining capacity is rated capacity less assigned weight, never negative', () => {
    expect(computeRemainingCapacity(10, [4, 2.5])).toBe(3.5);
    expect(computeRemainingCapacity(10, [])).toBe(10);
    expect(computeRemainingCapacity(5, [6])).toBe(0);
  });

  test('route similarity is between 0 and 1, high along the route and zero the wrong way', () => {
    const near = computeRouteSimilarity(committed, along);
    expect(near).toBeGreaterThan(0.8);
    expect(near).toBeLessThanOrEqual(1);
    expect(computeRouteSimilarity(committed, wrongWay)).toBe(0);
  });

  test('shared load accepted when weight, cargo, route and dates all fit', () => {
    const result = evaluateSharedLoadEligibility({ vehicle: truck, activeShipments: [committed], candidate: along });
    expect(result).not.toBeNull();
    expect(result.remainingCapacity).toBe(6);
  });

  test('shared load rejected when combined weight exceeds rated capacity (BR-33)', () => {
    const heavy = { ...along, cargoWeight: 6.5 };
    expect(evaluateSharedLoadEligibility({ vehicle: truck, activeShipments: [committed], candidate: heavy })).toBeNull();
  });

  test('shared load rejected for off-route candidates', () => {
    expect(evaluateSharedLoadEligibility({ vehicle: truck, activeShipments: [committed], candidate: wrongWay })).toBeNull();
  });

  test('refrigerated vehicle will not mix different cargo types (BR-33)', () => {
    const reefer = { vehicleType: 'REFRIGERATED', ratedCapacity: 10 };
    const chilled = { ...committed, cargoType: 'PERISHABLE_GOODS' };
    const sameCargo = { ...along, cargoType: 'PERISHABLE_GOODS' };
    const otherCargo = { ...along, cargoType: 'PHARMACEUTICAL_GOODS' };

    expect(evaluateSharedLoadEligibility({ vehicle: reefer, activeShipments: [chilled], candidate: sameCargo })).not.toBeNull();
    expect(evaluateSharedLoadEligibility({ vehicle: reefer, activeShipments: [chilled], candidate: otherCargo })).toBeNull();
  });

  test('shared load rejected when a delivery window would be breached (BR-33)', () => {
    const tight = { ...along, expectedDeliveryDate: new Date(Date.now() + 60 * 1000) };
    expect(evaluateSharedLoadEligibility({ vehicle: truck, activeShipments: [committed], candidate: tight })).toBeNull();
    const tightCommitted = { ...committed, expectedDeliveryDate: new Date(Date.now() + 60 * 1000) };
    expect(evaluateSharedLoadEligibility({ vehicle: truck, activeShipments: [tightCommitted], candidate: along })).toBeNull();
  });

  test('a vehicle with no active trip is never a shared-load candidate', () => {
    expect(evaluateSharedLoadEligibility({ vehicle: truck, activeShipments: [], candidate: along })).toBeNull();
  });
});
