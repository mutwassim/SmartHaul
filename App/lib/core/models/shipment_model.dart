import '../constants/app_constants.dart';
import '../constants/freight_catalog.dart';
import 'bid_model.dart';
import 'enum_codec.dart';
import 'json_utils.dart';
import 'user_model.dart';

class ShipmentModel {
  final String id;
  final String trackingNumber;
  final String cargoTitle;
  final String cargoTypeCode;
  final double weightTonnes;
  final String vehicleRequired;
  final String vehicleTypeCode;
  final String originCity;
  final double pickupLat;
  final double pickupLng;
  final String destinationCity;
  final double dropoffLat;
  final double dropoffLng;
  final double totalDistanceKm;
  final int durationMinutes;
  final double agreedFare;
  final ShipmentStatus status;
  final bool isDraft;
  final DateTime createdAt;
  final DateTime? expectedDeliveryDate;
  final String expectedEta;
  final String? tripId;
  final UserModel? assignedDriver;
  final List<BidModel> bids;
  final BidModel? myBid;
  final int activeMilestoneIndex; // -1 before pickup, then 0 At Pickup .. 4 Delivered
  final double progressPercentage;

  const ShipmentModel({
    required this.id,
    required this.trackingNumber,
    required this.cargoTitle,
    this.cargoTypeCode = '',
    required this.weightTonnes,
    required this.vehicleRequired,
    this.vehicleTypeCode = '',
    required this.originCity,
    this.pickupLat = 0,
    this.pickupLng = 0,
    required this.destinationCity,
    this.dropoffLat = 0,
    this.dropoffLng = 0,
    required this.totalDistanceKm,
    this.durationMinutes = 0,
    required this.agreedFare,
    required this.status,
    this.isDraft = false,
    required this.createdAt,
    this.expectedDeliveryDate,
    this.expectedEta = '',
    this.tripId,
    this.assignedDriver,
    this.bids = const [],
    this.myBid,
    this.activeMilestoneIndex = -1,
    this.progressPercentage = 0,
  });

  /// Reads a shipment from any of the backend's shipment payloads (list,
  /// detail, matched load, active trip).
  factory ShipmentModel.fromJson(Map<String, dynamic> json) {
    final status = shipmentStatusFromApi(json['status'] as String?);
    final pickup = asString(json['pickupAddress']);
    final dropoff = asString(json['dropoffAddress']);
    final cargoCode = asString(json['cargoType']);
    final weight = asDouble(json['cargoWeight']);
    final duration = asInt(json['durationMinutes']);
    final trip = asMap(json['trip']);
    final driver = asMap(trip['driver']);
    final payment = asMap(json['paymentRecord']);

    var bids = asMapList(json['bids']).map(BidModel.fromJson).toList();
    final fares = bids.where((b) => b.status == 'ACTIVE').map((b) => b.amount);
    if (fares.isNotEmpty) {
      final lowest = fares.reduce((a, b) => a < b ? a : b);
      bids = [for (final b in bids) b.copyWith(isLowestBid: b.status == 'ACTIVE' && b.amount == lowest)];
    }
    BidModel? accepted;
    for (final bid in bids) {
      if (bid.status == 'ACCEPTED') accepted = bid;
    }

    final myBidJson = asMap(json['myBid']);
    final milestone = milestoneIndexOf(status);

    return ShipmentModel(
      id: asString(json['id']),
      trackingNumber: asString(json['shipmentNumber']),
      cargoTitle: '${FreightCatalog.cargoLabel(cargoCode)} (${_trimWeight(weight)} t)',
      cargoTypeCode: cargoCode,
      weightTonnes: weight,
      vehicleRequired: FreightCatalog.vehicleLabel(json['requiredVehicleType'] as String?),
      vehicleTypeCode: asString(json['requiredVehicleType']),
      originCity: _cityOf(pickup),
      pickupLat: asDouble(json['pickupLat']),
      pickupLng: asDouble(json['pickupLng']),
      destinationCity: _cityOf(dropoff),
      dropoffLat: asDouble(json['dropoffLat']),
      dropoffLng: asDouble(json['dropoffLng']),
      totalDistanceKm: asDouble(json['distanceKm']),
      durationMinutes: duration,
      agreedFare: asDouble(payment['agreedFare'], accepted?.amount ?? 0),
      status: status,
      isDraft: json['isDraft'] == true,
      createdAt: asDate(json['createdAt']),
      expectedDeliveryDate:
          json['expectedDeliveryDate'] is String ? asDate(json['expectedDeliveryDate']) : null,
      expectedEta: duration > 0 ? _formatDuration(duration) : '',
      tripId: trip['id'] as String?,
      assignedDriver: driver.isEmpty
          ? null
          : UserModel(
              id: asString(driver['id']),
              fullName: asString(driver['name']),
              phone: asString(driver['phone']),
              role: UserRole.driver,
            ),
      bids: bids,
      myBid: myBidJson.isEmpty
          ? null
          : BidModel(
              id: asString(myBidJson['id']),
              shipmentId: asString(json['id']),
              bidderId: '',
              bidderName: '',
              amount: asDouble(myBidJson['proposedFare']),
              estimatedDeliveryTime: '',
              estimatedDeliveryAt: DateTime.fromMillisecondsSinceEpoch(0),
              status: asString(myBidJson['status'], 'ACTIVE'),
              createdAt: DateTime.fromMillisecondsSinceEpoch(0),
            ),
      activeMilestoneIndex: milestone,
      progressPercentage: milestone < 0 ? 0 : (milestone + 1) / 5,
    );
  }

  ShipmentModel copyWith({
    ShipmentStatus? status,
    List<BidModel>? bids,
    double? agreedFare,
    double? progressPercentage,
  }) {
    return ShipmentModel(
      id: id,
      trackingNumber: trackingNumber,
      cargoTitle: cargoTitle,
      cargoTypeCode: cargoTypeCode,
      weightTonnes: weightTonnes,
      vehicleRequired: vehicleRequired,
      vehicleTypeCode: vehicleTypeCode,
      originCity: originCity,
      pickupLat: pickupLat,
      pickupLng: pickupLng,
      destinationCity: destinationCity,
      dropoffLat: dropoffLat,
      dropoffLng: dropoffLng,
      totalDistanceKm: totalDistanceKm,
      durationMinutes: durationMinutes,
      agreedFare: agreedFare ?? this.agreedFare,
      status: status ?? this.status,
      isDraft: isDraft,
      createdAt: createdAt,
      expectedDeliveryDate: expectedDeliveryDate,
      expectedEta: expectedEta,
      tripId: tripId,
      assignedDriver: assignedDriver,
      bids: bids ?? this.bids,
      myBid: myBid,
      activeMilestoneIndex: status == null ? activeMilestoneIndex : milestoneIndexOf(status),
      progressPercentage: progressPercentage ?? this.progressPercentage,
    );
  }

  /// True while a driver can bid, the owner can compare bids and cancel freely.
  bool get isOpenForBids => status == ShipmentStatus.pending && !isDraft;

  /// Pakistani addresses end with the city: "Sundar Industrial Estate, Lahore".
  static String _cityOf(String address) {
    final parts = address.split(',');
    return parts.last.trim();
  }

  static String _trimWeight(double tonnes) =>
      tonnes == tonnes.roundToDouble() ? tonnes.toInt().toString() : tonnes.toStringAsFixed(2);

  static String _formatDuration(int minutes) {
    final hours = minutes ~/ 60;
    final rest = minutes % 60;
    return hours == 0 ? '${rest}m' : '${hours}h ${rest}m';
  }
}
