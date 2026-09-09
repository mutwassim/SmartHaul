import '../constants/app_constants.dart';
import 'bid_model.dart';
import 'user_model.dart';

class ShipmentModel {
  final String id;
  final String trackingNumber;
  final String cargoTitle;
  final String cargoCategory;
  final double weightTonnes;
  final String vehicleRequired;
  final String originCity;
  final String originHub;
  final String destinationCity;
  final String destinationHub;
  final double totalDistanceKm;
  final String routeHighway;
  final double agreedFare;
  final ShipmentStatus status;
  final DateTime createdAt;
  final String expectedEta;
  final UserModel? assignedDriver;
  final List<BidModel> bids;
  final String? biltyNumber;
  final int activeMilestoneIndex; // 0: At Pickup, 1: Loaded, 2: In Transit, 3: At Destination, 4: Delivered
  final double progressPercentage;
  final double currentSpeed;
  final String currentLocationName;

  const ShipmentModel({
    required this.id,
    required this.trackingNumber,
    required this.cargoTitle,
    required this.cargoCategory,
    required this.weightTonnes,
    required this.vehicleRequired,
    required this.originCity,
    required this.originHub,
    required this.destinationCity,
    required this.destinationHub,
    required this.totalDistanceKm,
    required this.routeHighway,
    required this.agreedFare,
    required this.status,
    required this.createdAt,
    required this.expectedEta,
    this.assignedDriver,
    this.bids = const [],
    this.biltyNumber,
    this.activeMilestoneIndex = 2,
    this.progressPercentage = 0.68,
    this.currentSpeed = 78.0,
    this.currentLocationName = 'M-2 Kallar Kahar Salt Range',
  });

  ShipmentModel copyWith({
    String? id,
    String? trackingNumber,
    String? cargoTitle,
    String? cargoCategory,
    double? weightTonnes,
    String? vehicleRequired,
    String? originCity,
    String? originHub,
    String? destinationCity,
    String? destinationHub,
    double? totalDistanceKm,
    String? routeHighway,
    double? agreedFare,
    ShipmentStatus? status,
    DateTime? createdAt,
    String? expectedEta,
    UserModel? assignedDriver,
    List<BidModel>? bids,
    String? biltyNumber,
    int? activeMilestoneIndex,
    double? progressPercentage,
    double? currentSpeed,
    String? currentLocationName,
  }) {
    return ShipmentModel(
      id: id ?? this.id,
      trackingNumber: trackingNumber ?? this.trackingNumber,
      cargoTitle: cargoTitle ?? this.cargoTitle,
      cargoCategory: cargoCategory ?? this.cargoCategory,
      weightTonnes: weightTonnes ?? this.weightTonnes,
      vehicleRequired: vehicleRequired ?? this.vehicleRequired,
      originCity: originCity ?? this.originCity,
      originHub: originHub ?? this.originHub,
      destinationCity: destinationCity ?? this.destinationCity,
      destinationHub: destinationHub ?? this.destinationHub,
      totalDistanceKm: totalDistanceKm ?? this.totalDistanceKm,
      routeHighway: routeHighway ?? this.routeHighway,
      agreedFare: agreedFare ?? this.agreedFare,
      status: status ?? this.status,
      createdAt: createdAt ?? this.createdAt,
      expectedEta: expectedEta ?? this.expectedEta,
      assignedDriver: assignedDriver ?? this.assignedDriver,
      bids: bids ?? this.bids,
      biltyNumber: biltyNumber ?? this.biltyNumber,
      activeMilestoneIndex: activeMilestoneIndex ?? this.activeMilestoneIndex,
      progressPercentage: progressPercentage ?? this.progressPercentage,
      currentSpeed: currentSpeed ?? this.currentSpeed,
      currentLocationName: currentLocationName ?? this.currentLocationName,
    );
  }
}
