import 'package:flutter/material.dart';
import '../constants/app_constants.dart';
import '../models/user_model.dart';
import '../models/shipment_model.dart';
import '../models/bid_model.dart';
import '../models/payment_record_model.dart';

class AppStateProvider extends ChangeNotifier {
  // Locale & Directionality
  Locale _locale = const Locale('en');
  Locale get locale => _locale;
  bool get isUrdu => _locale.languageCode == 'ur';

  // Role & Navigation
  UserRole _currentRole = UserRole.cargoOwner;
  UserRole get currentRole => _currentRole;

  int _selectedNavIndex = 0;
  int get selectedNavIndex => _selectedNavIndex;

  // Active Users (Cargo Owner & Driver)
  late UserModel _cargoOwnerUser;
  late UserModel _driverUser;

  UserModel get currentUser =>
      _currentRole == UserRole.cargoOwner ? _cargoOwnerUser : _driverUser;

  // Driver Duty Status
  bool _isDriverAvailable = true;
  bool get isDriverAvailable => _isDriverAvailable;

  // Active Trip Simulation State
  bool _isTransitStarted = false;
  bool get isTransitStarted => _isTransitStarted;

  // Datasets
  List<ShipmentModel> _shipments = [];
  List<ShipmentModel> get shipments => _shipments;

  List<ShipmentModel> _marketplaceLoads = [];
  List<ShipmentModel> get marketplaceLoads => _marketplaceLoads;

  List<PaymentRecordModel> _paymentRecords = [];
  List<PaymentRecordModel> get paymentRecords => _paymentRecords;

  ShipmentModel? _activeShipment;
  ShipmentModel? get activeShipment => _activeShipment;

  AppStateProvider() {
    _initializeData();
  }

  void _initializeData() {
    _cargoOwnerUser = const UserModel(
      id: 'usr_shipper_01',
      fullName: 'Tariq Mehmood',
      phone: '+92 300 8472910',
      email: 'logistics@tariqmills.com.pk',
      role: UserRole.cargoOwner,
      companyName: 'Tariq Mills Ltd.',
      verificationStatus: VerificationStatus.verified,
      rating: 4.9,
      totalTripsCompleted: 142,
    );

    _driverUser = const UserModel(
      id: 'usr_driver_01',
      fullName: 'Ahmad Khan',
      phone: '+92 321 9842911',
      role: UserRole.driver,
      companyName: 'Al-Madina Cargo Lines',
      vehicleInfo: 'Hino 500 Prime (10-Wheeler)',
      vehiclePlate: 'LES-8942',
      verificationStatus: VerificationStatus.verified,
      rating: 4.9,
      totalTripsCompleted: 126,
      avatarUrl: AppConstants.driverPortraitAlternativeUrl,
      isAvailable: true,
    );

    // Initial Active Shipment (SH-2048: Lahore -> Islamabad)
    final primaryShipment = ShipmentModel(
      id: 'shp_2048',
      trackingNumber: 'SH-2048',
      cargoTitle: 'Industrial Machinery (14.5T)',
      cargoCategory: 'Machinery & Equipment',
      weightTonnes: 14.5,
      vehicleRequired: '10-Wheeler Flatbed',
      originCity: 'Lahore',
      originHub: 'Sundar Industrial Estate / Badami Bagh',
      destinationCity: 'Islamabad',
      destinationHub: 'Sector I-9 / I-10 Dry Port',
      totalDistanceKm: 376.0,
      routeHighway: 'M-2 Motorway',
      agreedFare: 95000.0,
      status: ShipmentStatus.inTransit,
      createdAt: DateTime.now().subtract(const Duration(hours: 4)),
      expectedEta: '5:40 PM',
      assignedDriver: _driverUser,
      biltyNumber: 'LR-8820',
      activeMilestoneIndex: 2, // In Transit
      progressPercentage: 0.68,
      currentSpeed: 78.0,
      currentLocationName: 'M-2 Kallar Kahar Salt Range',
      bids: [
        BidModel(
          id: 'bid_01',
          shipmentId: 'shp_2048',
          bidderId: 'usr_driver_01',
          bidderName: 'Ahmad Khan',
          bidderCompany: 'Al-Madina Cargo Lines',
          bidderRating: 4.9,
          bidderTotalTrips: 126,
          amount: 95000.0,
          estimatedDeliveryTime: '5h 45m',
          vehicleType: 'Hino 500 Flatbed',
          vehiclePlate: 'LES-8942',
          isLowestBid: true,
          createdAt: DateTime.now().subtract(const Duration(hours: 6)),
        ),
      ],
    );

    // Initial Open Tender with 6 Bids (SH-2055: Raw Cotton Bales)
    final tenderShipment = ShipmentModel(
      id: 'shp_2055',
      trackingNumber: 'SH-2055',
      cargoTitle: 'Raw Cotton Bales (32 MT)',
      cargoCategory: 'Agricultural & Textiles',
      weightTonnes: 32.0,
      vehicleRequired: '22-Wheeler Trailer',
      originCity: 'Multan',
      originHub: 'Multan Industrial Estate',
      destinationCity: 'Karachi Port',
      destinationHub: 'SAPT Terminal Gate 2',
      totalDistanceKm: 924.0,
      routeHighway: 'M-5 / M-9 Motorway',
      agreedFare: 145000.0,
      status: ShipmentStatus.pending,
      createdAt: DateTime.now().subtract(const Duration(hours: 2)),
      expectedEta: 'Next Day 8:00 AM',
      bids: [
        BidModel(
          id: 'bid_2055_1',
          shipmentId: 'shp_2055',
          bidderId: 'dr_02',
          bidderName: 'Bilal Goods Transport',
          bidderCompany: 'Bilal Logistics Multan',
          bidderRating: 4.8,
          bidderTotalTrips: 94,
          amount: 145000.0,
          estimatedDeliveryTime: '18h direct',
          vehicleType: 'Volvo FMX 440 (22-Wheeler)',
          vehiclePlate: 'MN-7712',
          isLowestBid: true,
          createdAt: DateTime.now().subtract(const Duration(minutes: 45)),
        ),
        BidModel(
          id: 'bid_2055_2',
          shipmentId: 'shp_2055',
          bidderId: 'dr_03',
          bidderName: 'Khyber Freight Fleet',
          bidderCompany: 'Khyber Express',
          bidderRating: 4.7,
          bidderTotalTrips: 180,
          amount: 152000.0,
          estimatedDeliveryTime: '20h transit',
          vehicleType: 'Hino 700 Prime',
          vehiclePlate: 'P-9014',
          createdAt: DateTime.now().subtract(const Duration(minutes: 30)),
        ),
        BidModel(
          id: 'bid_2055_3',
          shipmentId: 'shp_2055',
          bidderId: 'dr_04',
          bidderName: 'National Freight Hub',
          bidderCompany: 'NFH Fleet',
          bidderRating: 4.9,
          bidderTotalTrips: 310,
          amount: 158000.0,
          estimatedDeliveryTime: '17h rapid',
          vehicleType: 'FAW J5P Heavy Haul',
          vehiclePlate: 'KHI-4421',
          createdAt: DateTime.now().subtract(const Duration(minutes: 20)),
        ),
        BidModel(
          id: 'bid_2055_4',
          shipmentId: 'shp_2055',
          bidderId: 'dr_05',
          bidderName: 'Sardar Transport Co.',
          bidderCompany: 'Sardar Logistics',
          bidderRating: 4.6,
          bidderTotalTrips: 65,
          amount: 162000.0,
          estimatedDeliveryTime: '22h transit',
          vehicleType: 'Isuzu Giga 22W',
          vehiclePlate: 'FD-3390',
          createdAt: DateTime.now().subtract(const Duration(minutes: 15)),
        ),
      ],
    );

    _shipments = [primaryShipment, tenderShipment];
    _activeShipment = primaryShipment;

    // Available Backhaul / Marketplace Loads for Drivers
    _marketplaceLoads = [
      ShipmentModel(
        id: 'load_mk_01',
        trackingNumber: 'SH-3012',
        cargoTitle: 'Cement Bags (Palletized)',
        cargoCategory: 'Building Materials',
        weightTonnes: 16.0,
        vehicleRequired: 'Dry Box / Flatbed',
        originCity: 'Rawalpindi',
        originHub: 'Sangjani Industrial Area',
        destinationCity: 'Peshawar',
        destinationHub: 'Hayatabad Industrial Estate',
        totalDistanceKm: 174.0,
        routeHighway: 'M-1 Motorway',
        agreedFare: 65000.0,
        status: ShipmentStatus.pending,
        createdAt: DateTime.now().subtract(const Duration(hours: 1)),
        expectedEta: '3h 30m',
      ),
      ShipmentModel(
        id: 'load_mk_02',
        trackingNumber: 'SH-3019',
        cargoTitle: 'High Density Cotton Bales',
        cargoCategory: 'Textiles',
        weightTonnes: 18.0,
        vehicleRequired: 'Flatbed Heavy',
        originCity: 'Multan',
        originHub: 'Chowk Nag Shah Goods Hub',
        destinationCity: 'Karachi Port',
        destinationHub: 'Keamari Terminal 1',
        totalDistanceKm: 925.0,
        routeHighway: 'M-5 Multan-Sukkur / M-9',
        agreedFare: 110000.0,
        status: ShipmentStatus.pending,
        createdAt: DateTime.now().subtract(const Duration(hours: 3)),
        expectedEta: '19 hours',
      ),
      ShipmentModel(
        id: 'load_mk_03',
        trackingNumber: 'SH-3044',
        cargoTitle: 'Structural Steel Rebars (24T)',
        cargoCategory: 'Steel & Metals',
        weightTonnes: 24.0,
        vehicleRequired: '22-Wheeler Lowbed',
        originCity: 'Lahore',
        originHub: 'Kot Lakhpat Hub',
        destinationCity: 'Faisalabad',
        destinationHub: 'M-3 Industrial City',
        totalDistanceKm: 145.0,
        routeHighway: 'M-3 Motorway',
        agreedFare: 55000.0,
        status: ShipmentStatus.pending,
        createdAt: DateTime.now().subtract(const Duration(minutes: 30)),
        expectedEta: '2h 45m',
      ),
    ];

    // Non-Custodial Ledger Records
    _paymentRecords = [
      PaymentRecordModel(
        id: 'pay_01',
        shipmentId: 'shp_2048',
        trackingNumber: 'SH-2048',
        route: 'Lahore → Islamabad',
        agreedFare: 95000.0,
        amountPaid: 38000.0,
        advanceAmount: 38000.0, // 40% advance
        status: PaymentStatus.partialAdvance,
        cryptographicHash: '8f4b7a2c91d8e03f',
        date: DateTime.now(),
        note: 'Fuel Slip Voucher #FS-4409 issued at Bhera',
      ),
      PaymentRecordModel(
        id: 'pay_02',
        shipmentId: 'shp_1984',
        trackingNumber: 'SH-1984',
        route: 'Karachi → Faisalabad',
        agreedFare: 185000.0,
        amountPaid: 185000.0,
        advanceAmount: 74000.0,
        status: PaymentStatus.recordedPaid,
        cryptographicHash: '4d91e38a2b7f0c15',
        date: DateTime.now().subtract(const Duration(days: 3)),
        note: 'Direct Bank Settlement (1Link IBFT Ref #992104)',
      ),
      PaymentRecordModel(
        id: 'pay_03',
        shipmentId: 'shp_1920',
        trackingNumber: 'SH-1920',
        route: 'Lahore → Multan',
        agreedFare: 95000.0,
        amountPaid: 95000.0,
        advanceAmount: 38000.0,
        status: PaymentStatus.recordedPaid,
        cryptographicHash: '1a7e64b45309dc26',
        date: DateTime.now().subtract(const Duration(days: 7)),
        note: 'POD Verified & Cleared',
      ),
    ];
  }

  void setLocale(Locale loc) {
    _locale = loc;
    notifyListeners();
  }

  void toggleLanguage() {
    if (_locale.languageCode == 'en') {
      _locale = const Locale('ur');
    } else {
      _locale = const Locale('en');
    }
    notifyListeners();
  }

  void setRole(UserRole role) {
    _currentRole = role;
    _selectedNavIndex = 0;
    notifyListeners();
  }

  void setNavIndex(int index) {
    _selectedNavIndex = index;
    notifyListeners();
  }

  void toggleDutyStatus() {
    _isDriverAvailable = !_isDriverAvailable;
    _driverUser = _driverUser.copyWith(isAvailable: _isDriverAvailable);
    notifyListeners();
  }

  void startTransit() {
    _isTransitStarted = true;
    if (_activeShipment != null) {
      _activeShipment = _activeShipment!.copyWith(
        status: ShipmentStatus.inTransit,
        activeMilestoneIndex: 2,
        currentSpeed: 78.0,
      );
    }
    notifyListeners();
  }

  void advanceMilestone() {
    if (_activeShipment == null) return;
    int current = _activeShipment!.activeMilestoneIndex;
    if (current < 4) {
      current++;
      ShipmentStatus newStatus = _activeShipment!.status;
      if (current == 3) newStatus = ShipmentStatus.atDestination;
      if (current == 4) newStatus = ShipmentStatus.delivered;

      _activeShipment = _activeShipment!.copyWith(
        activeMilestoneIndex: current,
        status: newStatus,
        progressPercentage: current >= 4 ? 1.0 : (current * 0.25 + 0.18),
      );
      notifyListeners();
    }
  }

  void createShipment({
    required String cargoTitle,
    required String cargoCategory,
    required double weightTonnes,
    required String vehicleRequired,
    required String originCity,
    required String originHub,
    required String destinationCity,
    required String destinationHub,
    required double targetRate,
    required String routeHighway,
    required double distanceKm,
  }) {
    final newShipment = ShipmentModel(
      id: 'shp_${DateTime.now().millisecondsSinceEpoch}',
      trackingNumber: 'SH-${(1000 + _shipments.length + 1)}',
      cargoTitle: cargoTitle,
      cargoCategory: cargoCategory,
      weightTonnes: weightTonnes,
      vehicleRequired: vehicleRequired,
      originCity: originCity,
      originHub: originHub,
      destinationCity: destinationCity,
      destinationHub: destinationHub,
      totalDistanceKm: distanceKm,
      routeHighway: routeHighway,
      agreedFare: targetRate,
      status: ShipmentStatus.pending,
      createdAt: DateTime.now(),
      expectedEta: 'Scheduled',
      bids: [],
    );

    _shipments.insert(0, newShipment);
    notifyListeners();
  }

  void acceptBid(String shipmentId, String bidId) {
    final shipmentIndex = _shipments.indexWhere((s) => s.id == shipmentId);
    if (shipmentIndex != -1) {
      final shipment = _shipments[shipmentIndex];
      final bid = shipment.bids.firstWhere((b) => b.id == bidId,
          orElse: () => shipment.bids.first);

      final updated = shipment.copyWith(
        status: ShipmentStatus.assigned,
        agreedFare: bid.amount,
        assignedDriver: UserModel(
          id: bid.bidderId,
          fullName: bid.bidderName,
          phone: '+92 300 1234567',
          role: UserRole.driver,
          companyName: bid.bidderCompany,
          vehicleInfo: bid.vehicleType,
          vehiclePlate: bid.vehiclePlate,
          rating: bid.bidderRating,
          totalTripsCompleted: bid.bidderTotalTrips,
        ),
      );

      _shipments[shipmentIndex] = updated;
      _activeShipment = updated;
      notifyListeners();
    }
  }

  void instantAcceptMarketplaceLoad(String loadId) {
    final loadIndex = _marketplaceLoads.indexWhere((l) => l.id == loadId);
    if (loadIndex != -1) {
      final load = _marketplaceLoads[loadIndex];
      final assigned = load.copyWith(
        status: ShipmentStatus.assigned,
        assignedDriver: _driverUser,
      );
      _marketplaceLoads.removeAt(loadIndex);
      _shipments.insert(0, assigned);
      _activeShipment = assigned;
      notifyListeners();
    }
  }
}
