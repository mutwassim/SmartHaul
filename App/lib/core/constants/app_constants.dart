/// SmartHaul Enumerated types matching SRS Appendix C and backend Prisma schema
enum UserRole {
  cargoOwner,
  driver,
  fleetOwner,
  admin,
}

enum VerificationStatus {
  pending,
  verified,
  rejected,
  suspended,
}

enum ShipmentStatus {
  pending,
  accepted,
  assigned,
  atPickup,
  loaded,
  inTransit,
  atDestination,
  delivered,
  completed,
  cancelled,
}

enum PaymentStatus {
  pending,
  partialAdvance,
  recordedPaid,
  disputed,
}

class AppConstants {
  static const String appName = 'SmartHaul';
  static const String currency = 'PKR';
  static const String currencySymbol = 'Rs.';
}
