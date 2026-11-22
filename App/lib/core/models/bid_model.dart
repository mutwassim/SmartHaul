import '../constants/freight_catalog.dart';
import 'json_utils.dart';

class BidModel {
  final String id;
  final String shipmentId;
  final String bidderId;
  final String bidderName;
  final String bidderCompany;
  final double bidderRating;
  final int bidderTotalTrips;
  final double amount;
  final String estimatedDeliveryTime;
  final DateTime estimatedDeliveryAt;
  final String vehicleType;
  final String status; // ACTIVE, ACCEPTED, REJECTED, WITHDRAWN, EXPIRED
  final bool isVerified;
  final bool isLowestBid;
  final DateTime createdAt;

  const BidModel({
    required this.id,
    required this.shipmentId,
    required this.bidderId,
    required this.bidderName,
    this.bidderCompany = '',
    this.bidderRating = 0,
    this.bidderTotalTrips = 0,
    required this.amount,
    required this.estimatedDeliveryTime,
    required this.estimatedDeliveryAt,
    this.vehicleType = '',
    this.status = 'ACTIVE',
    this.isVerified = true,
    this.isLowestBid = false,
    required this.createdAt,
  });

  factory BidModel.fromJson(Map<String, dynamic> json) {
    final bidder = asMap(json['bidder']);
    final eta = asDate(json['estimatedDeliveryTime']);
    return BidModel(
      id: asString(json['id']),
      shipmentId: asString(json['shipmentId']),
      bidderId: asString(json['bidderId']),
      bidderName: asString(bidder['name']),
      bidderCompany: asString(bidder['businessName']),
      bidderRating: asDouble(bidder['avgRating']),
      bidderTotalTrips: asInt(bidder['completedTripsCount']),
      amount: asDouble(json['proposedFare']),
      estimatedDeliveryTime: formatEta(eta),
      estimatedDeliveryAt: eta,
      vehicleType: FreightCatalog.vehicleLabel(json['offeredVehicleType'] as String?),
      status: asString(json['status'], 'ACTIVE'),
      createdAt: asDate(json['createdAt']),
    );
  }

  BidModel copyWith({bool? isLowestBid}) => BidModel(
        id: id,
        shipmentId: shipmentId,
        bidderId: bidderId,
        bidderName: bidderName,
        bidderCompany: bidderCompany,
        bidderRating: bidderRating,
        bidderTotalTrips: bidderTotalTrips,
        amount: amount,
        estimatedDeliveryTime: estimatedDeliveryTime,
        estimatedDeliveryAt: estimatedDeliveryAt,
        vehicleType: vehicleType,
        status: status,
        isVerified: isVerified,
        isLowestBid: isLowestBid ?? this.isLowestBid,
        createdAt: createdAt,
      );

  /// 20 Nov, 14:30
  static String formatEta(DateTime value) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    final hour = value.hour.toString().padLeft(2, '0');
    final minute = value.minute.toString().padLeft(2, '0');
    return '${value.day} ${months[value.month - 1]}, $hour:$minute';
  }
}
