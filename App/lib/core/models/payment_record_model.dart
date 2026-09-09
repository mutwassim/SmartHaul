import '../constants/app_constants.dart';

class PaymentRecordModel {
  final String id;
  final String shipmentId;
  final String trackingNumber;
  final String route;
  final double agreedFare;
  final double amountPaid;
  final double advanceAmount;
  final PaymentStatus status;
  final String cryptographicHash;
  final DateTime date;
  final String note;

  const PaymentRecordModel({
    required this.id,
    required this.shipmentId,
    required this.trackingNumber,
    required this.route,
    required this.agreedFare,
    required this.amountPaid,
    required this.advanceAmount,
    required this.status,
    required this.cryptographicHash,
    required this.date,
    required this.note,
  });
}
