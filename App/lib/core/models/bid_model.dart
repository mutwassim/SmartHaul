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
  final String vehicleType;
  final String vehiclePlate;
  final bool isVerified;
  final bool isLowestBid;
  final DateTime createdAt;

  const BidModel({
    required this.id,
    required this.shipmentId,
    required this.bidderId,
    required this.bidderName,
    required this.bidderCompany,
    required this.bidderRating,
    required this.bidderTotalTrips,
    required this.amount,
    required this.estimatedDeliveryTime,
    required this.vehicleType,
    required this.vehiclePlate,
    this.isVerified = true,
    this.isLowestBid = false,
    required this.createdAt,
  });
}
