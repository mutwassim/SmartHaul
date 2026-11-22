import '../constants/app_constants.dart';
import 'enum_codec.dart';
import 'json_utils.dart';

/// A record of a payment settled outside SmartHaul (FR-PM-9): the application
/// only records what the payee confirms.
class PaymentRecordModel {
  final String id;
  final String shipmentId;
  final String trackingNumber;
  final String route;
  final double agreedFare;
  final double amountPaid;
  final PaymentStatus status;
  final DateTime date;

  const PaymentRecordModel({
    required this.id,
    required this.shipmentId,
    required this.trackingNumber,
    required this.route,
    required this.agreedFare,
    required this.amountPaid,
    required this.status,
    required this.date,
  });

  factory PaymentRecordModel.fromJson(Map<String, dynamic> json) {
    final shipment = asMap(json['shipment']);
    return PaymentRecordModel(
      id: asString(json['id']),
      shipmentId: asString(json['shipmentId']),
      trackingNumber: asString(shipment['shipmentNumber']),
      route: '${asString(shipment['pickupAddress'])} → ${asString(shipment['dropoffAddress'])}',
      agreedFare: asDouble(json['agreedFare']),
      amountPaid: asDouble(json['amountReceived']),
      status: paymentStatusFromApi(json['status'] as String?, frozen: json['isFrozen'] == true),
      date: asDate(json['updatedAt']),
    );
  }

  double get balance => agreedFare - amountPaid;
}
