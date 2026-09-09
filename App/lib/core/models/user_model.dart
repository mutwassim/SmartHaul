import '../constants/app_constants.dart';

class UserModel {
  final String id;
  final String fullName;
  final String phone;
  final String? email;
  final UserRole role;
  final VerificationStatus verificationStatus;
  final double rating;
  final int totalTripsCompleted;
  final String? companyName;
  final String? vehicleInfo;
  final String? vehiclePlate;
  final String? avatarUrl;
  final bool isAvailable;

  const UserModel({
    required this.id,
    required this.fullName,
    required this.phone,
    this.email,
    required this.role,
    this.verificationStatus = VerificationStatus.verified,
    this.rating = 5.0,
    this.totalTripsCompleted = 0,
    this.companyName,
    this.vehicleInfo,
    this.vehiclePlate,
    this.avatarUrl,
    this.isAvailable = true,
  });

  UserModel copyWith({
    String? id,
    String? fullName,
    String? phone,
    String? email,
    UserRole? role,
    VerificationStatus? verificationStatus,
    double? rating,
    int? totalTripsCompleted,
    String? companyName,
    String? vehicleInfo,
    String? vehiclePlate,
    String? avatarUrl,
    bool? isAvailable,
  }) {
    return UserModel(
      id: id ?? this.id,
      fullName: fullName ?? this.fullName,
      phone: phone ?? this.phone,
      email: email ?? this.email,
      role: role ?? this.role,
      verificationStatus: verificationStatus ?? this.verificationStatus,
      rating: rating ?? this.rating,
      totalTripsCompleted: totalTripsCompleted ?? this.totalTripsCompleted,
      companyName: companyName ?? this.companyName,
      vehicleInfo: vehicleInfo ?? this.vehicleInfo,
      vehiclePlate: vehiclePlate ?? this.vehiclePlate,
      avatarUrl: avatarUrl ?? this.avatarUrl,
      isAvailable: isAvailable ?? this.isAvailable,
    );
  }
}
