import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_typography.dart';
import '../../core/theme/app_shapes.dart';
import '../../core/services/app_state_provider.dart';
import '../../common/widgets/smart_haul_app_bar.dart';
import '../../common/widgets/emergency_sos_dialog.dart';
import '../../common/widgets/report_delay_dialog.dart';
import 'proof_of_delivery_screen.dart';

class DriverTripProgressScreen extends StatefulWidget {
  const DriverTripProgressScreen({super.key});

  @override
  State<DriverTripProgressScreen> createState() =>
      _DriverTripProgressScreenState();
}

class _DriverTripProgressScreenState extends State<DriverTripProgressScreen> {
  bool _isMapTrafficActive = false;

  void _showNotification(String message, IconData icon) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        backgroundColor: AppColors.inverseSurface,
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: AppShapes.roundedMedium),
        content: Row(
          children: [
            Icon(icon, color: AppColors.secondaryFixed),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                message,
                style: const TextStyle(
                  color: AppColors.inverseOnSurface,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final state = Provider.of<AppStateProvider>(context);
    final shipment = state.activeShipment;

    return Directionality(
      textDirection: TextDirection.rtl,
      child: Scaffold(
        appBar: const SmartHaulAppBar(
          title: 'سفر کی پیش رفت (Trip Progress)',
          showBackButton: true,
        ),
        body: SafeArea(
          child: SingleChildScrollView(
            padding: AppShapes.screenPadding,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Sub-Header Status Banner (RTL)
                Container(
                  padding: AppShapes.cardPadding,
                  decoration: BoxDecoration(
                    color: AppColors.surfaceContainerLow,
                    borderRadius: AppShapes.roundedLarge,
                    border: Border.all(color: AppColors.outlineVariant),
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Row(
                        children: [
                          Container(
                            width: 10,
                            height: 10,
                            decoration: const BoxDecoration(
                              color: AppColors.secondary,
                              shape: BoxShape.circle,
                            ),
                          ),
                          const SizedBox(width: 8),
                          Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'سفر کی پیش رفت - ${shipment?.trackingNumber ?? "SH-2048"}',
                                style: AppTypography.urduTitle(),
                              ),
                              Text(
                                '${shipment?.originCity ?? "لاہور"} تا ${shipment?.destinationCity ?? "اسلام آباد"} (M-2 موٹروے)',
                                style: AppTypography.urduBody(
                                  color: AppColors.textSecondary,
                                ),
                              ),
                            ],
                          ),
                        ],
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
                            const Icon(
                              Icons.near_me,
                              size: 14,
                              color: AppColors.onSecondaryContainer,
                            ),
                            const SizedBox(width: 4),
                            Text(
                              'راستے میں',
                              style: AppTypography.urduLabel(
                                color: AppColors.onSecondaryContainer,
                              ).copyWith(fontWeight: FontWeight.bold),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 12),

                // GPS Status & Daylight Telemetry Strip
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                  decoration: BoxDecoration(
                    color: AppColors.primary,
                    borderRadius: AppShapes.roundedMedium,
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Row(
                        children: [
                          const Icon(
                            Icons.satellite_alt,
                            color: AppColors.secondaryFixed,
                            size: 18,
                          ),
                          const SizedBox(width: 8),
                          Text(
                            'جی پی ایس فعال • سگنل بہترین ہیں',
                            style: AppTypography.urduLabel(
                              color: AppColors.onPrimary,
                            ),
                          ),
                        ],
                      ),
                      Text(
                        'آن لائن موڈ (4G LTE)',
                        style: AppTypography.urduLabel(
                          color: AppColors.primaryFixedDim,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 14),

                // Turn-by-Turn Maneuver Navigation Card with RTL Mirrored Arrow
                Container(
                  padding: AppShapes.cardPadding,
                  decoration: BoxDecoration(
                    color: AppColors.surfaceContainerLowest,
                    borderRadius: AppShapes.roundedLarge,
                    border: Border.all(color: AppColors.outlineVariant),
                    boxShadow: AppColors.cardShadow,
                  ),
                  child: Column(
                    children: [
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Container(
                            width: 52,
                            height: 52,
                            decoration: BoxDecoration(
                              color: AppColors.primary,
                              borderRadius: AppShapes.roundedMedium,
                            ),
                            child: const Center(
                              child: Icon(
                                Icons.turn_left,
                                color: AppColors.onPrimary,
                                size: 32,
                              ),
                            ),
                          ),
                          const SizedBox(width: 14),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Row(
                                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                  children: [
                                    Text(
                                      '25 کلومیٹر',
                                      style: AppTypography.urduHeadlineLarge(
                                        color: AppColors.primary,
                                      ),
                                    ),
                                    Container(
                                      padding: const EdgeInsets.symmetric(
                                        horizontal: 8,
                                        vertical: 2,
                                      ),
                                      decoration: BoxDecoration(
                                        color: AppColors.surfaceContainerLow,
                                        borderRadius: AppShapes.roundedPill,
                                      ),
                                      child: Text(
                                        'موٹروے M-2',
                                        style: AppTypography.urduLabel(
                                          color: AppColors.textSecondary,
                                        ),
                                      ),
                                    ),
                                  ],
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  'کلر کہار انٹرچینج پر بائیں جانب باہر نکلیں',
                                  style: AppTypography.urduTitle().copyWith(
                                    fontWeight: FontWeight.bold,
                                  ),
                                ),
                                Text(
                                  'ڈھلوان کے لیے رفتار 45 کلومیٹر فی گھنٹہ تک محدود رکھیں',
                                  style: AppTypography.urduBody(
                                    color: AppColors.textSecondary,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 14),

                      // Live Simulated Map HUD
                      Container(
                        height: 190,
                        decoration: BoxDecoration(
                          color: AppColors.primaryDark,
                          borderRadius: AppShapes.roundedMedium,
                          gradient: const LinearGradient(
                            colors: [Color(0xFF0F2942), Color(0xFF001428)],
                            begin: Alignment.topCenter,
                            end: Alignment.bottomCenter,
                          ),
                        ),
                        child: Stack(
                          children: [
                            // Vector Highway Graphic Simulation
                            Center(
                              child: CustomPaint(
                                size: const Size(double.infinity, 190),
                                painter: _HighwayPainter(),
                              ),
                            ),
                            // Top Highway Header Tag
                            Positioned(
                              top: 10,
                              right: 10,
                              child: Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 10,
                                  vertical: 4,
                                ),
                                decoration: BoxDecoration(
                                  color: AppColors.primary.withValues(alpha: 0.9),
                                  borderRadius: AppShapes.roundedSmall,
                                ),
                                child: Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    const Icon(
                                      Icons.alt_route,
                                      color: AppColors.secondaryFixed,
                                      size: 16,
                                    ),
                                    const SizedBox(width: 4),
                                    Text(
                                      'M-2 سالٹ رینج زون',
                                      style: AppTypography.urduLabel(
                                        color: AppColors.onPrimary,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                            // Vehicle Marker in Center
                            Center(
                              child: Column(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Container(
                                    width: 42,
                                    height: 42,
                                    decoration: BoxDecoration(
                                      color: AppColors.secondary,
                                      shape: BoxShape.circle,
                                      boxShadow: [
                                        BoxShadow(
                                          color: AppColors.secondaryFixed.withValues(alpha: 0.5),
                                          blurRadius: 16,
                                          spreadRadius: 4,
                                        ),
                                      ],
                                    ),
                                    child: const Center(
                                      child: Icon(
                                        Icons.navigation,
                                        color: Colors.white,
                                        size: 24,
                                      ),
                                    ),
                                  ),
                                  const SizedBox(height: 4),
                                  Container(
                                    padding: const EdgeInsets.symmetric(
                                      horizontal: 8,
                                      vertical: 2,
                                    ),
                                    decoration: BoxDecoration(
                                      color: Colors.black.withValues(alpha: 0.8),
                                      borderRadius: AppShapes.roundedPill,
                                    ),
                                    child: const Text(
                                      'Hino 500 (آپ کا ٹرک)',
                                      style: TextStyle(
                                        color: Colors.white,
                                        fontSize: 10,
                                        fontWeight: FontWeight.bold,
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            // Map Floating Controls
                            Positioned(
                              bottom: 10,
                              left: 10,
                              child: Row(
                                children: [
                                  IconButton(
                                    style: IconButton.styleFrom(
                                      backgroundColor: AppColors.surfaceContainerLowest,
                                      shape: const CircleBorder(),
                                    ),
                                    icon: const Icon(Icons.my_location, color: AppColors.primary, size: 20),
                                    onPressed: () => _showNotification('نقشہ ٹرک کی تازہ ترین پوزیشن پر مرکوز ہے', Icons.gps_fixed),
                                  ),
                                  const SizedBox(width: 6),
                                  IconButton(
                                    style: IconButton.styleFrom(
                                      backgroundColor: _isMapTrafficActive ? AppColors.secondary : AppColors.surfaceContainerLowest,
                                      shape: const CircleBorder(),
                                    ),
                                    icon: Icon(
                                      Icons.traffic,
                                      color: _isMapTrafficActive ? Colors.white : AppColors.secondary,
                                      size: 20,
                                    ),
                                    onPressed: () {
                                      setState(() => _isMapTrafficActive = !_isMapTrafficActive);
                                      _showNotification(_isMapTrafficActive ? 'ٹریفک کی معلومات آن ہیں' : 'ٹریفک کی معلومات بند ہیں', Icons.traffic);
                                    },
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 12),

                      // Triple Cockpit Metrics in Urdu (Speed, Distance, ETA)
                      Row(
                        children: [
                          Expanded(
                            child: _buildUrduMetricTile(
                              icon: Icons.speed,
                              label: 'رفتار',
                              value: '72',
                              unit: 'کلو/گھنٹہ',
                            ),
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: _buildUrduMetricTile(
                              icon: Icons.straighten,
                              label: 'باقی فاصلہ',
                              value: '127',
                              unit: 'کلومیٹر',
                            ),
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: _buildUrduMetricTile(
                              icon: Icons.schedule,
                              label: 'متوقع آمد',
                              value: '5:40',
                              unit: 'شام',
                              valueColor: AppColors.secondary,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 14),

                // Cargo & Consignment Snapshot
                Container(
                  padding: AppShapes.cardPadding,
                  decoration: BoxDecoration(
                    color: AppColors.surfaceContainerLowest,
                    borderRadius: AppShapes.roundedLarge,
                    border: Border.all(color: AppColors.outlineVariant),
                  ),
                  child: Column(
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Row(
                            children: [
                              const Icon(Icons.inventory_2, color: AppColors.primary, size: 20),
                              const SizedBox(width: 8),
                              Text('کارگو تفصیلات و بلٹی', style: AppTypography.urduTitle()),
                            ],
                          ),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                            decoration: BoxDecoration(
                              color: AppColors.surfaceContainerLow,
                              borderRadius: AppShapes.roundedPill,
                            ),
                            child: Text(
                              'بلٹی # ${shipment?.biltyNumber ?? "LR-8820"}',
                              style: AppTypography.telematicCode(fontSize: 11),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 10),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text('سامان کی نوعیت', style: AppTypography.urduLabel(color: AppColors.textMuted)),
                              Text(
                                '${shipment?.cargoTitle ?? "صنعتی مشینری"} (${shipment?.weightTonnes ?? 14.5} ٹن)',
                                style: AppTypography.urduBody(color: AppColors.textPrimary).copyWith(fontWeight: FontWeight.bold),
                              ),
                            ],
                          ),
                          Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text('تحویل دہندہ', style: AppTypography.urduLabel(color: AppColors.textMuted)),
                              Text(
                                shipment?.destinationHub ?? 'الرحیم لاجسٹکس ہب، I-9',
                                style: AppTypography.urduBody(color: AppColors.primary).copyWith(fontWeight: FontWeight.bold),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 14),

                // Dominant Operational Action: "منزل پر پہنچ گئے - ARRIVED" (56dp Height)
                ElevatedButton(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.primary,
                    foregroundColor: AppColors.onPrimary,
                    minimumSize: const Size(double.infinity, AppShapes.dominantActionHeight),
                    shape: RoundedRectangleBorder(borderRadius: AppShapes.roundedLarge),
                    elevation: 3,
                  ),
                  onPressed: () {
                    state.advanceMilestone();
                    Navigator.of(context).push(
                      MaterialPageRoute(
                        builder: (_) => ProofOfDeliveryScreen(
                          shipment: shipment ?? state.shipments.first,
                        ),
                      ),
                    );
                  },
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const Icon(Icons.domain_verification, color: AppColors.secondaryFixed, size: 24),
                      const SizedBox(width: 10),
                      Text(
                        'منزل پر پہنچ گئے - ARRIVED',
                        style: AppTypography.urduTitle(color: AppColors.onPrimary).copyWith(
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 12),

                // Quick Action Grid (Bilingual Mirrored 48dp Targets)
                Row(
                  children: [
                    Expanded(
                      child: _buildActionTile(
                        icon: Icons.timer_off,
                        label: 'تاخیر کی اطلاع',
                        onTap: () {
                          showDialog(
                            context: context,
                            builder: (_) => const ReportDelayDialog(),
                          );
                        },
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: _buildActionTile(
                        icon: Icons.chat,
                        label: 'مالک کارگو رابطہ',
                        iconBg: AppColors.secondaryContainer,
                        iconColor: AppColors.onSecondaryContainer,
                        onTap: () => _showNotification('کارگو ڈسپیچر کو کال ملائی جا رہی ہے...', Icons.call),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: _buildActionTile(
                        icon: Icons.emergency_share,
                        label: 'ایمرجنسی مدد',
                        iconBg: AppColors.errorContainer,
                        iconColor: AppColors.error,
                        onTap: () {
                          showDialog(
                            context: context,
                            builder: (_) => const EmergencySosDialog(),
                          );
                        },
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 24),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildUrduMetricTile({
    required IconData icon,
    required String label,
    required String value,
    required String unit,
    Color? valueColor,
  }) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 6),
      decoration: BoxDecoration(
        color: AppColors.surfaceContainerLow,
        borderRadius: AppShapes.roundedMedium,
      ),
      child: Column(
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(icon, size: 12, color: AppColors.textSecondary),
              const SizedBox(width: 4),
              Text(label, style: AppTypography.urduLabel(color: AppColors.textSecondary)),
            ],
          ),
          const SizedBox(height: 2),
          Text(
            value,
            style: AppTypography.titleLarge(
              color: valueColor ?? AppColors.textPrimary,
            ).copyWith(fontWeight: FontWeight.bold),
          ),
          Text(unit, style: AppTypography.urduLabel(color: AppColors.textMuted)),
        ],
      ),
    );
  }

  Widget _buildActionTile({
    required IconData icon,
    required String label,
    Color iconBg = AppColors.surfaceContainerLow,
    Color iconColor = AppColors.primary,
    required VoidCallback onTap,
  }) {
    return InkWell(
      onTap: onTap,
      borderRadius: AppShapes.roundedMedium,
      child: Container(
        constraints: const BoxConstraints(minHeight: 64),
        padding: const EdgeInsets.all(8),
        decoration: BoxDecoration(
          color: AppColors.surfaceContainerLowest,
          borderRadius: AppShapes.roundedMedium,
          border: Border.all(color: AppColors.outlineVariant),
          boxShadow: AppColors.cardShadow,
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              width: 32,
              height: 32,
              decoration: BoxDecoration(
                color: iconBg,
                shape: BoxShape.circle,
              ),
              child: Icon(icon, size: 18, color: iconColor),
            ),
            const SizedBox(height: 4),
            Text(
              label,
              style: AppTypography.urduLabel().copyWith(fontWeight: FontWeight.bold),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }
}

class _HighwayPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final roadPaint = Paint()
      ..color = AppColors.primary
      ..strokeWidth = 36
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round;

    final roadBorderPaint = Paint()
      ..color = AppColors.outlineVariant.withValues(alpha: 0.3)
      ..strokeWidth = 40
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round;

    final dashPaint = Paint()
      ..color = Colors.amber.withValues(alpha: 0.7)
      ..strokeWidth = 3
      ..style = PaintingStyle.stroke;

    final path = Path()
      ..moveTo(size.width * 0.2, size.height * 0.9)
      ..cubicTo(
        size.width * 0.4,
        size.height * 0.7,
        size.width * 0.6,
        size.height * 0.4,
        size.width * 0.8,
        size.height * 0.1,
      );

    canvas.drawPath(path, roadBorderPaint);
    canvas.drawPath(path, roadPaint);
    canvas.drawPath(path, dashPaint);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
