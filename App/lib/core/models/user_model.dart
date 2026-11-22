import '../constants/app_constants.dart';
import 'enum_codec.dart';
import 'json_utils.dart';

class UserModel {
  final String id;
  final String fullName;
  final String phone;
  final String? email;
  final UserRole role;
  final VerificationStatus verificationStatus;
  final String? companyName;

  const UserModel({
    required this.id,
    required this.fullName,
    required this.phone,
    this.email,
    required this.role,
    this.verificationStatus = VerificationStatus.pending,
    this.companyName,
  });

  factory UserModel.fromJson(Map<String, dynamic> json) => UserModel(
        id: asString(json['id']),
        fullName: asString(json['name']),
        phone: asString(json['phone']),
        email: json['email'] as String?,
        role: userRoleFromApi(json['role'] as String?),
        verificationStatus: verificationFromApi(json['accountStatus'] as String?),
        companyName: json['businessName'] as String?,
      );

  /// Verified drivers and fleets may bid; cargo owners are Active (BR-3).
  bool get isVerified => verificationStatus == VerificationStatus.verified;
}
