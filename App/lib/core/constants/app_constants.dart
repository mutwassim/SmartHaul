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

enum VehicleType {
  flatbed,
  dryBox,
  lowbed,
  container20ft,
  container40ft,
  tenWheeler,
  twentyTwoWheeler,
  oilTanker,
  dumper,
}

enum PaymentStatus {
  pending,
  partialAdvance,
  recordedPaid,
  disputed,
}

class AppConstants {
  static const String appName = 'SmartHaul';
  static const String appTagline = "Pakistan's Digital Heavy Freight Grid";
  static const String currency = 'PKR';
  static const String currencySymbol = 'Rs.';
  static const String weightUnit = 'MT';
  static const String distanceUnit = 'km';
  static const String speedUnit = 'km/h';

  // Branding asset URLs from Stitch project
  static const String logoUrl =
      'https://lh3.googleusercontent.com/aida/AEtjO1Xh9Us3J6u-aSRlsMu9x1EMcpk4Zxd0Pmxh_I7h5LqtQj4Yo0IRuXnMc-4Clqi4tCJQgijfiS6TZTTVIq4iPeoAN4qWBUQBwQgOuCwsbZdYi_nbYGFxhYCog09KJSNiRCHsQAcmhdDCPhbQuC6bM75bVdur9Yk0Q5ggsL4kXnRU8x2kcbK0jgVwyBmnu057eibMQj2X9bR8Ap9v01948FvWofn5Tzxmoyxq6k-3kW38VaMpBl6pVo3FZQ';

  static const String driverAvatarUrl =
      'https://lh3.googleusercontent.com/aida-public/AB6AXuBMeR27unCvhmMH1hL3z6rgIvUwQzi93aDKxyKP_gAHYtcSSz-ux7UBnNly11-kVZK45rBnTYxshM1IdZzwWbDu8xAk0rvpM46qRMKoHaDDKptUz-bY4htOJ4cZCqSooLnqXRY8iNi5407NHMKxgcnSQ2RrDZjswLSk9_eB6GcJL15H1531TGH6bqcK_Y3uGWSdVvwQhkkefY54AkP0FCeo7dCi-SqXZZSyWn0oDUXp-z4Y3V2AVvM';

  static const String driverPortraitAlternativeUrl =
      'https://lh3.googleusercontent.com/aida-public/AB6AXuCm0AO5sidh2Tr_u5qk_FDFYrNoa7uan121wDSPpj9V5tAAN0s14Gh4LKALIjBkTa7Fep-KtAxCKr68QGsjiAQ1tNQVLbeICMACPogfcVYUIzZahbFkTgq4CYS_z8frJtR2Z_Fdr8NoLgXXqEjefQXe2OUIIi6DFgWFaioRrKhwCQxkoGrMMfmzZDxVs22RPN1ypwWBOSG0Jfxs_UNSDJFojkXdCcX-1u7pfTj9mFzvuVLIf3p3in8';

  static const String shipperLogoUrl =
      'https://lh3.googleusercontent.com/aida-public/AB6AXuBDcWPyowOyqwLWw8z5y_yrC2R8ga70VZHOsMWXL9uWNlvhLCpqEHr4GU0CmJGA9Q40YSEQQzfMB9pRpVbMhpPhMxdpHIOFYYTCEtitNtaOR7yst5PHBWlxcugLj3ioco3voZVEGWO5IDlMW6jh4Aaopo7CUQsJQMuqi7IqRdn9ncmI_Zi43ZDWvUUi1NK2qJJuDz2a1PdROS06edaz1EX1NPmP07-L7rSURu1uxzucmVMFtTzS0DM';
}
