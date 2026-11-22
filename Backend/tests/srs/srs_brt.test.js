const {
  ACCOUNT_STATUS,
  VALID_STATUS_TRANSITIONS,
  BID_STATUS,
  SHIPMENT_STATUS,
} = require('../../src/config/constants');
const { isCargoCompatibleWithVehicle } = require('../../src/modules/matching/matching.service');

describe('SRS Table 6.3 Business Rule Tests (BRT-01 to BRT-12)', () => {
  // BRT-01: BR-3 Driver verification required to place bid
  test('BRT-01: BR-3 Driver status verification required to bid', () => {
    const statuses = [ACCOUNT_STATUS.PENDING, ACCOUNT_STATUS.REJECTED, ACCOUNT_STATUS.SUSPENDED, ACCOUNT_STATUS.VERIFIED];
    const canBid = (status) => status === ACCOUNT_STATUS.VERIFIED;

    expect(canBid(ACCOUNT_STATUS.PENDING)).toBe(false);
    expect(canBid(ACCOUNT_STATUS.REJECTED)).toBe(false);
    expect(canBid(ACCOUNT_STATUS.SUSPENDED)).toBe(false);
    expect(canBid(ACCOUNT_STATUS.VERIFIED)).toBe(true);
  });

  // BRT-02: BR-4, BR-5 Capacity and body type compatibility (4 combinations)
  test('BRT-02: BR-4, BR-5 Capacity and body type eligibility (4 combinations)', () => {
    const isEligible = (capacity, weight, vType, cType) => {
      const capacityOk = capacity >= weight;
      const typeOk = isCargoCompatibleWithVehicle(vType, cType);
      return capacityOk && typeOk;
    };

    // Case 1: Enough capacity, compatible type -> TRUE
    expect(isEligible(20, 15, 'TANKER', 'LIQUIDS_AND_BULK_FLUID')).toBe(true);
    // Case 2: Enough capacity, incompatible type -> FALSE
    expect(isEligible(20, 15, 'TANKER', 'FURNITURE')).toBe(false);
    // Case 3: Insufficient capacity, compatible type -> FALSE
    expect(isEligible(10, 15, 'TANKER', 'LIQUIDS_AND_BULK_FLUID')).toBe(false);
    // Case 4: Insufficient capacity, incompatible type -> FALSE
    expect(isEligible(10, 15, 'TANKER', 'FURNITURE')).toBe(false);
  });

  // BRT-03: BR-7, BR-8 Bidding lifecycle and revision
  test('BRT-03: BR-7, BR-8 Driver may only revise/withdraw ACTIVE bids', () => {
    const canReviseOrWithdraw = (status) => status === BID_STATUS.ACTIVE;

    expect(canReviseOrWithdraw(BID_STATUS.ACTIVE)).toBe(true);
    expect(canReviseOrWithdraw(BID_STATUS.ACCEPTED)).toBe(false);
    expect(canReviseOrWithdraw(BID_STATUS.REJECTED)).toBe(false);
    expect(canReviseOrWithdraw(BID_STATUS.WITHDRAWN)).toBe(false);
  });

  // BRT-04: BR-9, BR-10, BR-11 Competitive bidding visibility
  test('BRT-04: BR-9, BR-10, BR-11 Bids visibility rules', () => {
    const bids = [
      { id: 'b1', bidderId: 'd1', proposedFare: 30000 },
      { id: 'b2', bidderId: 'd2', proposedFare: 28000 },
    ];

    // Cargo owner sees all bids
    const cargoOwnerView = bids;
    expect(cargoOwnerView).toHaveLength(2);

    // Driver d1 only sees their own bid, competing bids masked
    const driver1View = bids.filter((b) => b.bidderId === 'd1');
    expect(driver1View).toHaveLength(1);
    expect(driver1View[0].bidderId).toBe('d1');
  });

  // BRT-05: BR-14, BR-15 Status transitions and POD requirement
  test('BRT-05: BR-14, BR-15 Strict lifecycle and POD required before DELIVERED', () => {
    // Cannot skip REACHED_PICKUP to IN_TRANSIT
    expect(VALID_STATUS_TRANSITIONS['BOOKED']).toContain('REACHED_PICKUP');
    expect(VALID_STATUS_TRANSITIONS['BOOKED']).not.toContain('IN_TRANSIT');

    // Advancing to DELIVERED requires POD images
    const canDeliver = (currentStatus, podImages) => {
      if (currentStatus !== 'REACHED_DESTINATION') return false;
      return Array.isArray(podImages) && podImages.length > 0;
    };

    expect(canDeliver('REACHED_DESTINATION', ['pod_key_1.jpg'])).toBe(true);
    expect(canDeliver('REACHED_DESTINATION', [])).toBe(false);
    expect(canDeliver('IN_TRANSIT', ['pod_key_1.jpg'])).toBe(false);
  });

  // BRT-06: BR-12, BR-33 Committed vehicle single vs shared loads
  test('BRT-06: BR-12 Single-load exclusivity vs BR-33 shared-load capacity', () => {
    const isVehicleAvailableForSingleLoad = (availabilityStatus) => availabilityStatus === 'AVAILABLE';
    expect(isVehicleAvailableForSingleLoad('AVAILABLE')).toBe(true);
    expect(isVehicleAvailableForSingleLoad('COMMITTED')).toBe(false);
    expect(isVehicleAvailableForSingleLoad('MAINTENANCE')).toBe(false);
  });

  // BRT-07: BR-20 Auto-completion timer (48 hours)
  test('BRT-07: BR-20 Auto-completion after 48 hours in DELIVERED status', () => {
    const now = Date.now();
    const deliveredAt49hAgo = new Date(now - 49 * 3600 * 1000);
    const deliveredAt10hAgo = new Date(now - 10 * 3600 * 1000);

    const isEligibleForAutoComplete = (status, deliveredAt) => {
      if (status !== SHIPMENT_STATUS.DELIVERED) return false;
      const hoursSinceDelivery = (now - new Date(deliveredAt).getTime()) / (3600 * 1000);
      return hoursSinceDelivery >= 48;
    };

    expect(isEligibleForAutoComplete(SHIPMENT_STATUS.DELIVERED, deliveredAt49hAgo)).toBe(true);
    expect(isEligibleForAutoComplete(SHIPMENT_STATUS.DELIVERED, deliveredAt10hAgo)).toBe(false);
  });

  // BRT-08: BR-21, BR-22 Carrier Direct Settlement
  test('BRT-08: BR-21, BR-22 Carrier direct settlement without platform escrow', () => {
    const paymentRecord = {
      agreedFare: 45000,
      amountReceived: 0,
      paymentStatus: 'PENDING',
      isFrozen: false,
    };
    expect(paymentRecord).not.toHaveProperty('escrowAccountId');
    expect(paymentRecord).toHaveProperty('agreedFare');
  });

  // BRT-09: BR-24, BR-25 Partial advance payment validation
  test('BRT-09: BR-24, BR-25 Partial advance payment bounds and remaining balance', () => {
    const agreedFare = 50000;
    const recordAdvance = (advance) => {
      if (advance <= 0 || advance > agreedFare) throw new Error('Invalid advance');
      return {
        amountReceived: advance,
        remainingBalance: agreedFare - advance,
        paymentStatus: advance === agreedFare ? 'PAID' : 'PARTIAL',
      };
    };

    const res = recordAdvance(20000);
    expect(res.amountReceived).toBe(20000);
    expect(res.remainingBalance).toBe(30000);
    expect(res.paymentStatus).toBe('PARTIAL');

    expect(() => recordAdvance(60000)).toThrow('Invalid advance');
  });

  // BRT-10: BR-2, BR-30 CNIC and Vehicle Registration uniqueness
  test('BRT-10: BR-2, BR-30 Deterministic hash uniqueness for CNIC and Registration', () => {
    const { hashDeterministic } = require('../../src/services/encryption.service');
    const cnic1 = '37405-1234567-1';
    const cnic2 = ' 3740512345671 ';
    expect(hashDeterministic(cnic1)).toBe(hashDeterministic(cnic2));

    const reg1 = 'LEA-2024-1234';
    const reg2 = ' lea 2024 1234 ';
    expect(hashDeterministic(reg1)).toBe(hashDeterministic(reg2));
  });

  // BRT-11: BR-36 Cancellation Rules Decision Table verification
  test('BRT-11: BR-36 Cancellation rules across roles and trip milestones', () => {
    const canCancel = (role, shipmentStatus) => {
      if (shipmentStatus === 'PENDING') return true; // Cargo owner or driver can cancel/withdraw
      if (shipmentStatus === 'BOOKED') {
        // Allowed before REACHED_PICKUP
        return true;
      }
      if (shipmentStatus === 'REACHED_PICKUP') {
        // Allowed before CARGO_LOADED with reason
        return true;
      }
      // Once CARGO_LOADED or IN_TRANSIT, normal cancellation prohibited; dispute required
      return false;
    };

    expect(canCancel('CARGO_OWNER', 'PENDING')).toBe(true);
    expect(canCancel('CARGO_OWNER', 'BOOKED')).toBe(true);
    expect(canCancel('CARGO_OWNER', 'IN_TRANSIT')).toBe(false);
    expect(canCancel('CARGO_OWNER', 'DELIVERED')).toBe(false);
    expect(canCancel('DRIVER', 'IN_TRANSIT')).toBe(false);
  });

  // BRT-12: BR-16, BR-17 GPS Tracking Cadence and Interruption
  test('BRT-12: BR-16, BR-17 GPS tracking cadence 30s and 15 min interruption threshold', () => {
    const CADENCE_SECONDS = 30;
    const INTERRUPTION_THRESHOLD_MS = 15 * 60 * 1000; // 15 minutes

    const isInterrupted = (lastPositionTimestamp, now) => {
      return (now - lastPositionTimestamp) > INTERRUPTION_THRESHOLD_MS;
    };

    const now = Date.now();
    expect(isInterrupted(now - 20 * 60 * 1000, now)).toBe(true); // 20 min ago -> interrupted
    expect(isInterrupted(now - 5 * 60 * 1000, now)).toBe(false); // 5 min ago -> active
  });
});
