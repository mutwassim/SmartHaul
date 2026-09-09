import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_typography.dart';
import '../../core/theme/app_shapes.dart';
import '../../core/services/app_state_provider.dart';
import '../../common/widgets/smart_haul_app_bar.dart';

class LiveTrackingMapScreen extends StatefulWidget {
  const LiveTrackingMapScreen({super.key});

  @override
  State<LiveTrackingMapScreen> createState() => _LiveTrackingMapScreenState();
}

class _LiveTrackingMapScreenState extends State<LiveTrackingMapScreen> {
  bool _isSatelliteMode = false;

  @override
  Widget build(BuildContext context) {
    final state = Provider.of<AppStateProvider>(context);
    final shipment = state.activeShipment;

    if (shipment == null) {
      return const Scaffold(
        appBar: SmartHaulAppBar(title: 'Live Tracking'),
        body: Center(child: Text('No active shipment to track.')),
      );
    }

    return Scaffold(
      appBar: const SmartHaulAppBar(
        title: 'Live GPS Tracking',
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          child: Column(
            children: [
              // Interactive Vector Map Container
              Container(
                height: 320,
                width: double.infinity,
                color: _isSatelliteMode ? const Color(0xFF1E293B) : const Color(0xFF0F2942),
                child: Stack(
                  children: [
                    // Vector Highway Route Painter
                    Positioned.fill(
                      child: CustomPaint(
                        painter: _LiveRouteMapPainter(isSatellite: _isSatelliteMode),
                      ),
                    ),

                    // Top Left Telemetry HUD Pill
                    Positioned(
                      top: 14,
                      left: 14,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                            decoration: BoxDecoration(
                              color: AppColors.primaryDark.withValues(alpha: 0.9),
                              borderRadius: AppShapes.roundedMedium,
                              border: Border.all(color: AppColors.outlineVariant.withValues(alpha: 0.3)),
                            ),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Container(
                                  width: 8,
                                  height: 8,
                                  decoration: const BoxDecoration(
                                    color: AppColors.secondaryFixed,
                                    shape: BoxShape.circle,
                                  ),
                                ),
                                const SizedBox(width: 6),
                                Text(
                                  'Live GPS • 78 km/h',
                                  style: AppTypography.telematicCode(
                                    color: AppColors.onPrimary,
                                    fontSize: 11,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(height: 4),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                            decoration: BoxDecoration(
                              color: Colors.black.withValues(alpha: 0.6),
                              borderRadius: AppShapes.roundedSmall,
                            ),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                const Icon(Icons.battery_charging_full, color: AppColors.secondaryFixed, size: 12),
                                const SizedBox(width: 4),
                                Text(
                                  'Sensors & 4G Normal',
                                  style: AppTypography.telematicCode(
                                    color: AppColors.primaryFixedDim,
                                    fontSize: 9,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),

                    // Top Right Map Layer Controls
                    Positioned(
                      top: 14,
                      right: 14,
                      child: Column(
                        children: [
                          IconButton(
                            style: IconButton.styleFrom(
                              backgroundColor: AppColors.surfaceContainerLowest,
                              shape: RoundedRectangleBorder(borderRadius: AppShapes.roundedMedium),
                            ),
                            icon: const Icon(Icons.my_location, color: AppColors.primary, size: 20),
                            onPressed: () {
                              ScaffoldMessenger.of(context).showSnackBar(
                                const SnackBar(content: Text('Map centered on Hino 500 Prime (M-2 KM 214)')),
                              );
                            },
                          ),
                          const SizedBox(height: 6),
                          IconButton(
                            style: IconButton.styleFrom(
                              backgroundColor: _isSatelliteMode ? AppColors.secondary : AppColors.surfaceContainerLowest,
                              shape: RoundedRectangleBorder(borderRadius: AppShapes.roundedMedium),
                            ),
                            icon: Icon(
                              Icons.layers,
                              color: _isSatelliteMode ? Colors.white : AppColors.primary,
                              size: 20,
                            ),
                            onPressed: () => setState(() => _isSatelliteMode = !_isSatelliteMode),
                          ),
                        ],
                      ),
                    ),

                    // Origin Pin (Lahore)
                    const Positioned(
                      left: 36,
                      bottom: 30,
                      child: Column(
                        children: [
                          _LocationPin(label: 'Lahore (Origin)', isOrigin: true),
                        ],
                      ),
                    ),

                    // Moving Vehicle Marker (Salt Range / Kallar Kahar)
                    Center(
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Container(
                            width: 44,
                            height: 44,
                            decoration: BoxDecoration(
                              color: AppColors.secondary,
                              shape: BoxShape.circle,
                              boxShadow: [
                                BoxShadow(
                                  color: AppColors.secondaryFixed.withValues(alpha: 0.6),
                                  blurRadius: 18,
                                  spreadRadius: 6,
                                ),
                              ],
                            ),
                            child: const Center(
                              child: Icon(
                                Icons.local_shipping,
                                color: Colors.white,
                                size: 24,
                              ),
                            ),
                          ),
                          const SizedBox(height: 4),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                            decoration: BoxDecoration(
                              color: AppColors.surfaceContainerLowest,
                              borderRadius: AppShapes.roundedPill,
                            ),
                            child: Text(
                              'M-2 Kallar Kahar',
                              style: AppTypography.labelSmall(
                                color: AppColors.textPrimary,
                              ).copyWith(fontWeight: FontWeight.bold, fontSize: 10),
                            ),
                          ),
                        ],
                      ),
                    ),

                    // Destination Pin (Islamabad)
                    const Positioned(
                      right: 44,
                      top: 40,
                      child: _LocationPin(label: 'Islamabad (Dry Port)', isOrigin: false),
                    ),
                  ],
                ),
              ),

              // Drawer / Detailed Lifecycle Stepper Container
              Container(
                padding: AppShapes.screenPadding,
                decoration: const BoxDecoration(
                  color: AppColors.surfaceContainerLowest,
                  borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Sheet Drag Pull Handle
                    Center(
                      child: Container(
                        width: 40,
                        height: 4,
                        margin: const EdgeInsets.only(bottom: 12),
                        decoration: BoxDecoration(
                          color: AppColors.outlineVariant,
                          borderRadius: AppShapes.roundedPill,
                        ),
                      ),
                    ),

                    // Shipment Header
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                shipment.cargoTitle,
                                style: AppTypography.titleLarge(),
                              ),
                              Text(
                                '${shipment.vehicleRequired} • ${shipment.trackingNumber}',
                                style: AppTypography.bodySmall(),
                              ),
                            ],
                          ),
                        ),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                          decoration: BoxDecoration(
                            color: AppColors.secondaryContainer,
                            borderRadius: AppShapes.roundedPill,
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Container(
                                width: 6,
                                height: 6,
                                decoration: const BoxDecoration(
                                  color: AppColors.secondary,
                                  shape: BoxShape.circle,
                                ),
                              ),
                              const SizedBox(width: 4),
                              Text(
                                'Updated 15s ago',
                                style: AppTypography.labelSmall(
                                  color: AppColors.onSecondaryContainer,
                                ).copyWith(fontSize: 10, fontWeight: FontWeight.bold),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 14),

                    // ETA & Distance Stat Tiles (Bento Grid)
                    Row(
                      children: [
                        Expanded(
                          child: Container(
                            padding: const EdgeInsets.all(12),
                            decoration: BoxDecoration(
                              color: AppColors.surfaceContainerLow,
                              borderRadius: AppShapes.roundedMedium,
                            ),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text('Estimated Arrival', style: AppTypography.labelSmall(fontSize: 10)),
                                const SizedBox(height: 4),
                                Text(
                                  shipment.expectedEta,
                                  style: AppTypography.titleLarge(color: AppColors.primary),
                                ),
                                Text(
                                  '1 hr 25 min left',
                                  style: AppTypography.labelSmall(color: AppColors.secondary).copyWith(fontWeight: FontWeight.bold),
                                ),
                              ],
                            ),
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Container(
                            padding: const EdgeInsets.all(12),
                            decoration: BoxDecoration(
                              color: AppColors.surfaceContainerLow,
                              borderRadius: AppShapes.roundedMedium,
                            ),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text('Distance Left', style: AppTypography.labelSmall(fontSize: 10)),
                                const SizedBox(height: 4),
                                Text(
                                  '127 km',
                                  style: AppTypography.titleLarge(color: AppColors.primary),
                                ),
                                Text(
                                  'Total: ${shipment.totalDistanceKm.toInt()} km',
                                  style: AppTypography.bodySmall(fontSize: 11),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 16),

                    // Lifecycle Stepper Timeline
                    Container(
                      padding: AppShapes.cardPadding,
                      decoration: BoxDecoration(
                        color: AppColors.surfaceContainerLow,
                        borderRadius: AppShapes.roundedLarge,
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Expanded(
                                child: Text(
                                  'Trip Milestone Progress',
                                  style: AppTypography.titleMedium(),
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ),
                              const SizedBox(width: 8),
                              Text(
                                '${shipment.activeMilestoneIndex + 1} of 5 Cleared',
                                style: AppTypography.telematicCode(
                                  color: AppColors.secondary,
                                  fontWeight: FontWeight.bold,
                                  fontSize: 11,
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 14),
                          _buildMilestoneStep(
                            stepNumber: 1,
                            title: 'Reached Pickup (${shipment.originCity})',
                            subtitle: 'Verified by loading warehouse agent',
                            time: '10:15 AM',
                            isCompleted: shipment.activeMilestoneIndex >= 0,
                            isActive: shipment.activeMilestoneIndex == 0,
                          ),
                          _buildMilestoneStep(
                            stepNumber: 2,
                            title: 'Cargo Loaded & Weighed',
                            subtitle: 'Bilty #${shipment.biltyNumber ?? "LR-8820"} Approved (14.5 MT)',
                            time: '11:30 AM',
                            isCompleted: shipment.activeMilestoneIndex >= 1,
                            isActive: shipment.activeMilestoneIndex == 1,
                          ),
                          _buildMilestoneStep(
                            stepNumber: 3,
                            title: 'In Transit • Moving on M-2',
                            subtitle: 'Near Salt Range Toll Plaza (78 km/h)',
                            time: 'Active',
                            isCompleted: shipment.activeMilestoneIndex >= 2,
                            isActive: shipment.activeMilestoneIndex == 2,
                          ),
                          _buildMilestoneStep(
                            stepNumber: 4,
                            title: 'Destination Arrival (${shipment.destinationCity})',
                            subtitle: 'Unloading dock assigned at Sector I-9',
                            time: 'Est 5:40 PM',
                            isCompleted: shipment.activeMilestoneIndex >= 3,
                            isActive: shipment.activeMilestoneIndex == 3,
                          ),
                          _buildMilestoneStep(
                            stepNumber: 5,
                            title: 'Delivered & Electronic POD',
                            subtitle: 'Digital sign-off & Escrow audit release',
                            time: 'Pending',
                            isCompleted: shipment.activeMilestoneIndex >= 4,
                            isActive: shipment.activeMilestoneIndex == 4,
                            isLast: true,
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 14),

                    // Driver Quick Identification Card
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: AppColors.surfaceContainerLow,
                        borderRadius: AppShapes.roundedLarge,
                      ),
                      child: Row(
                        children: [
                          CircleAvatar(
                            radius: 22,
                            backgroundColor: AppColors.primary,
                            child: Text(
                              (shipment.assignedDriver?.fullName ?? 'Ahmad Khan').substring(0, 1),
                              style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16),
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Row(
                                  children: [
                                    Text(
                                      shipment.assignedDriver?.fullName ?? 'Ahmad Khan',
                                      style: AppTypography.titleMedium(),
                                    ),
                                    const SizedBox(width: 4),
                                    const Icon(Icons.star, color: Colors.amber, size: 14),
                                    const Text(' 4.9', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold)),
                                  ],
                                ),
                                Text(
                                  'Fleet: ${shipment.assignedDriver?.companyName ?? "Al-Madina Cargo"}',
                                  style: AppTypography.bodySmall(fontSize: 11),
                                ),
                              ],
                            ),
                          ),
                          IconButton(
                            style: IconButton.styleFrom(
                              backgroundColor: AppColors.surfaceContainerLowest,
                            ),
                            icon: const Icon(Icons.call, color: AppColors.primary, size: 20),
                            onPressed: () {
                              ScaffoldMessenger.of(context).showSnackBar(
                                const SnackBar(content: Text('Calling Driver (+92 321 9842911)...')),
                              );
                            },
                          ),
                          const SizedBox(width: 6),
                          IconButton(
                            style: IconButton.styleFrom(
                              backgroundColor: AppColors.primary,
                            ),
                            icon: const Icon(Icons.chat, color: Colors.white, size: 18),
                            onPressed: () {
                              ScaffoldMessenger.of(context).showSnackBar(
                                const SnackBar(content: Text('Opening dispatch messaging channel...')),
                              );
                            },
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 14),

                    // Agreed Fare & Escrow Record Capsule
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                      decoration: BoxDecoration(
                        color: AppColors.primary,
                        borderRadius: AppShapes.roundedLarge,
                      ),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Expanded(
                            child: Row(
                              children: [
                                const Icon(Icons.receipt_long, color: AppColors.secondaryFixed, size: 22),
                                const SizedBox(width: 8),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        'Agreed Fare & Escrow Record',
                                        style: AppTypography.labelMedium(color: AppColors.onPrimary),
                                        overflow: TextOverflow.ellipsis,
                                      ),
                                      Text(
                                        'Non-Custodial Cryptographic Audit',
                                        style: AppTypography.telematicCode(
                                          color: AppColors.primaryFixedDim,
                                          fontSize: 10,
                                        ),
                                        overflow: TextOverflow.ellipsis,
                                      ),
                                    ],
                                  ),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(width: 8),
                          Text(
                            'Rs. ${shipment.agreedFare.toInt().toString().replaceAllMapped(RegExp(r'(\d{1,3})(?=(\d{3})+(?!\d))'), (Match m) => '${m[1]},')}',
                            style: AppTypography.headlineSmall(color: AppColors.onPrimary),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 24),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildMilestoneStep({
    required int stepNumber,
    required String title,
    required String subtitle,
    required String time,
    required bool isCompleted,
    bool isActive = false,
    bool isLast = false,
  }) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Column(
          children: [
            Container(
              width: 28,
              height: 28,
              decoration: BoxDecoration(
                color: isCompleted
                    ? AppColors.secondary
                    : (isActive ? AppColors.primary : AppColors.surfaceContainer),
                shape: BoxShape.circle,
                border: Border.all(
                  color: isCompleted || isActive ? Colors.transparent : AppColors.outline,
                ),
              ),
              child: Center(
                child: isCompleted
                    ? const Icon(Icons.check, size: 16, color: Colors.white)
                    : Text(
                        '$stepNumber',
                        style: TextStyle(
                          color: isActive ? Colors.white : AppColors.textSecondary,
                          fontWeight: FontWeight.bold,
                          fontSize: 12,
                        ),
                      ),
              ),
            ),
            if (!isLast)
              Container(
                width: 2,
                height: 36,
                color: isCompleted ? AppColors.secondary : AppColors.outlineVariant,
              ),
          ],
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Expanded(
                    child: Text(
                      title,
                      style: AppTypography.labelMedium().copyWith(
                        fontWeight: isActive ? FontWeight.bold : FontWeight.normal,
                        color: isCompleted || isActive ? AppColors.textPrimary : AppColors.textMuted,
                      ),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  const SizedBox(width: 8),
                  Text(
                    time,
                    style: AppTypography.telematicCode(
                      color: isActive ? AppColors.secondary : AppColors.textMuted,
                      fontSize: 10,
                      fontWeight: isActive ? FontWeight.bold : FontWeight.normal,
                    ),
                  ),
                ],
              ),
              Text(
                subtitle,
                style: AppTypography.bodySmall(fontSize: 11),
              ),
              const SizedBox(height: 12),
            ],
          ),
        ),
      ],
    );
  }
}

class _LocationPin extends StatelessWidget {
  final String label;
  final bool isOrigin;

  const _LocationPin({required this.label, required this.isOrigin});

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
          decoration: BoxDecoration(
            color: isOrigin ? AppColors.primary : AppColors.surfaceContainerLowest,
            borderRadius: AppShapes.roundedSmall,
            boxShadow: AppColors.cardShadow,
          ),
          child: Text(
            label,
            style: TextStyle(
              fontSize: 10,
              fontWeight: FontWeight.bold,
              color: isOrigin ? Colors.white : AppColors.textPrimary,
            ),
          ),
        ),
        const SizedBox(height: 3),
        Container(
          width: 14,
          height: 14,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: isOrigin ? AppColors.primary : AppColors.error,
            border: Border.all(color: Colors.white, width: 2),
          ),
        ),
      ],
    );
  }
}

class _LiveRouteMapPainter extends CustomPainter {
  final bool isSatellite;

  _LiveRouteMapPainter({this.isSatellite = false});

  @override
  void paint(Canvas canvas, Size size) {
    final shadowPaint = Paint()
      ..color = Colors.black.withValues(alpha: 0.3)
      ..strokeWidth = 10
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round;

    final roadPaint = Paint()
      ..color = isSatellite ? const Color(0xFF475569) : const Color(0xFF1E3A5F)
      ..strokeWidth = 6
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round;

    final traversedPaint = Paint()
      ..color = AppColors.secondary
      ..strokeWidth = 6
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round;

    final path = Path()
      ..moveTo(size.width * 0.15, size.height * 0.85)
      ..cubicTo(
        size.width * 0.35,
        size.height * 0.70,
        size.width * 0.55,
        size.height * 0.45,
        size.width * 0.85,
        size.height * 0.15,
      );

    final traversedPath = Path()
      ..moveTo(size.width * 0.15, size.height * 0.85)
      ..cubicTo(
        size.width * 0.35,
        size.height * 0.70,
        size.width * 0.50,
        size.height * 0.50,
        size.width * 0.50,
        size.height * 0.50,
      );

    canvas.drawPath(path, shadowPaint);
    canvas.drawPath(path, roadPaint);
    canvas.drawPath(traversedPath, traversedPaint);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
