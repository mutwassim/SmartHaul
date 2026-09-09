import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_typography.dart';
import '../../core/theme/app_shapes.dart';
import '../../core/services/app_state_provider.dart';
import '../../core/localization/app_localizations.dart';
import '../../common/widgets/emergency_sos_dialog.dart';
import 'driver_trip_progress_screen.dart';
import 'available_loads_screen.dart';

class DriverHomeScreen extends StatelessWidget {
  const DriverHomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final state = Provider.of<AppStateProvider>(context);
    final l10n = AppLocalizations.of(context);
    final isUrdu = state.isUrdu;
    final primaryShipment = state.activeShipment;
    final isAvailable = state.isDriverAvailable;
    final isTransitStarted = state.isTransitStarted;

    return SingleChildScrollView(
      padding: AppShapes.screenPadding,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Telemetry & Duty Header Strip
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Flexible(
                          child: Text(
                            l10n.translate('driverGreeting'),
                            style: isUrdu
                                ? AppTypography.urduHeadlineLarge()
                                : AppTypography.headlineLarge(),
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        const SizedBox(width: 6),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                          decoration: BoxDecoration(
                            color: AppColors.secondaryContainer,
                            borderRadius: AppShapes.roundedPill,
                          ),
                          child: const Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(Icons.verified, size: 12, color: AppColors.onSecondaryContainer),
                              SizedBox(width: 2),
                              Text(
                                'VERIFIED',
                                style: TextStyle(
                                  fontSize: 9,
                                  fontWeight: FontWeight.bold,
                                  color: AppColors.onSecondaryContainer,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                    Text(
                      '${l10n.translate('fleetId')} • ${l10n.translate('vehicleModel')}',
                      style: AppTypography.bodySmall(color: AppColors.textSecondary),
                    ),
                  ],
                ),
              ),

              // Duty Availability Toggle
              InkWell(
                onTap: () => state.toggleDutyStatus(),
                borderRadius: AppShapes.roundedPill,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                  decoration: BoxDecoration(
                    color: isAvailable
                        ? AppColors.secondary
                        : AppColors.surfaceContainerLow,
                    borderRadius: AppShapes.roundedPill,
                    border: Border.all(
                      color: isAvailable ? AppColors.secondary : AppColors.outline,
                    ),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Container(
                        width: 8,
                        height: 8,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: isAvailable ? Colors.white : AppColors.textSecondary,
                        ),
                      ),
                      const SizedBox(width: 6),
                      Text(
                        isAvailable
                            ? l10n.translate('available').toUpperCase()
                            : l10n.translate('onBreak').toUpperCase(),
                        style: TextStyle(
                          color: isAvailable ? Colors.white : AppColors.textSecondary,
                          fontWeight: FontWeight.bold,
                          fontSize: 11,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),

          // Key Metrics Spark-strip (Today's Pay, Driving Hours, Safety Score)
          Row(
            children: [
              Expanded(
                child: _buildMetricTile(
                  label: l10n.translate('todaysPay'),
                  value: '42,500',
                  unit: 'PKR',
                  icon: Icons.payments,
                  iconColor: AppColors.secondary,
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _buildMetricTile(
                  label: l10n.translate('drivingHours'),
                  value: '4.2',
                  unit: '/ 8h max',
                  icon: Icons.timelapse,
                  iconColor: AppColors.primary,
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _buildMetricTile(
                  label: l10n.translate('safetyScore'),
                  value: '98%',
                  unit: 'Eco drive',
                  icon: Icons.eco,
                  iconColor: AppColors.secondary,
                ),
              ),
            ],
          ),
          const SizedBox(height: 20),

          // HIGH SALIENCE ACTIVE TRIP CARD (Dominant Surface)
          if (primaryShipment != null) ...[
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Row(
                  children: [
                    Text(
                      l10n.translate('activeAssignment'),
                      style: AppTypography.titleMedium(),
                    ),
                    const SizedBox(width: 6),
                    Container(
                      width: 6,
                      height: 6,
                      decoration: const BoxDecoration(
                        color: AppColors.primary,
                        shape: BoxShape.circle,
                      ),
                    ),
                  ],
                ),
                Text(
                  primaryShipment.trackingNumber,
                  style: AppTypography.telematicCode(
                    color: AppColors.textSecondary,
                    fontSize: 12,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),
            Container(
              padding: AppShapes.cardPadding,
              decoration: BoxDecoration(
                color: AppColors.surfaceContainerLowest,
                borderRadius: AppShapes.roundedLarge,
                border: Border.all(
                  color: isTransitStarted ? AppColors.secondary : AppColors.primary,
                  width: 1.5,
                ),
                boxShadow: AppColors.cardShadow,
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Origin & Destination Nodes
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Column(
                        children: [
                          Container(
                            width: 12,
                            height: 12,
                            decoration: const BoxDecoration(
                              color: AppColors.secondary,
                              shape: BoxShape.circle,
                            ),
                          ),
                          Container(
                            width: 2,
                            height: 48,
                            color: AppColors.outlineVariant,
                          ),
                          Container(
                            width: 12,
                            height: 12,
                            decoration: const BoxDecoration(
                              color: AppColors.primary,
                              shape: BoxShape.circle,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'ORIGIN • DISPATCHED',
                              style: AppTypography.labelSmall(fontSize: 10),
                            ),
                            Text(
                              primaryShipment.originCity,
                              style: AppTypography.titleMedium(),
                            ),
                            Text(
                              primaryShipment.originHub,
                              style: AppTypography.bodySmall(fontSize: 11),
                            ),
                            const SizedBox(height: 14),
                            Text(
                              'DESTINATION • SCHEDULED',
                              style: AppTypography.labelSmall(fontSize: 10),
                            ),
                            Text(
                              primaryShipment.destinationCity,
                              style: AppTypography.titleMedium(),
                            ),
                            Text(
                              primaryShipment.destinationHub,
                              style: AppTypography.bodySmall(fontSize: 11),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 14),

                  // Route Specifications & Escrow Bar
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                    decoration: BoxDecoration(
                      color: AppColors.surfaceContainerLow,
                      borderRadius: AppShapes.roundedMedium,
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Row(
                          children: [
                            const Icon(Icons.route, size: 16, color: AppColors.primary),
                            const SizedBox(width: 4),
                            Text(
                              '${primaryShipment.totalDistanceKm.toInt()} km • ${primaryShipment.routeHighway}',
                              style: AppTypography.telematicCode(fontSize: 11),
                            ),
                          ],
                        ),
                        Row(
                          children: [
                            const Icon(Icons.scale, size: 16, color: AppColors.textSecondary),
                            const SizedBox(width: 4),
                            Text(
                              '${primaryShipment.weightTonnes} MT',
                              style: AppTypography.telematicCode(fontSize: 11),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 10),

                  // Fare Escrow Strip
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                    decoration: BoxDecoration(
                      color: AppColors.secondaryContainer,
                      borderRadius: AppShapes.roundedMedium,
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Row(
                          children: [
                            const Icon(Icons.payments, size: 16, color: AppColors.onSecondaryContainer),
                            const SizedBox(width: 6),
                            Text(
                              'Agreed Fare (Escrowed)',
                              style: AppTypography.labelSmall(
                                color: AppColors.onSecondaryContainer,
                              ).copyWith(fontWeight: FontWeight.bold),
                            ),
                          ],
                        ),
                        Text(
                          'Rs. ${primaryShipment.agreedFare.toInt().toString().replaceAllMapped(RegExp(r'(\d{1,3})(?=(\d{3})+(?!\d))'), (Match m) => '${m[1]},')}',
                          style: AppTypography.telematicCode(
                            color: AppColors.onSecondaryContainer,
                            fontWeight: FontWeight.bold,
                            fontSize: 13,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),

                  // DOMINANT ACTION: START TRANSIT (58dp Height)
                  ElevatedButton(
                    style: ElevatedButton.styleFrom(
                      backgroundColor: isTransitStarted
                          ? AppColors.secondary
                          : AppColors.primary,
                      foregroundColor: AppColors.onPrimary,
                      minimumSize: const Size(double.infinity, 56),
                      shape: RoundedRectangleBorder(
                        borderRadius: AppShapes.roundedLarge,
                      ),
                      elevation: 2,
                    ),
                    onPressed: () {
                      if (!isTransitStarted) {
                        state.startTransit();
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(
                            content: Text('🚛 Transit Started! GPS Telemetry lock engaged.'),
                            backgroundColor: AppColors.secondary,
                          ),
                        );
                      }
                      Navigator.of(context).push(
                        MaterialPageRoute(
                          builder: (_) => const DriverTripProgressScreen(),
                        ),
                      );
                    },
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(
                          isTransitStarted ? Icons.check_circle : Icons.play_arrow,
                          size: 24,
                        ),
                        const SizedBox(width: 8),
                        Flexible(
                          child: Text(
                            isTransitStarted
                                ? l10n.translate('transitInProgress')
                                : '${l10n.translate('startTransit')} (روانہ ہوں)',
                            style: const TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.bold,
                              letterSpacing: 0.8,
                            ),
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 12),

                  // Quick Action Buttons
                  Row(
                    children: [
                      Expanded(
                        child: OutlinedButton.icon(
                          style: OutlinedButton.styleFrom(
                            backgroundColor: AppColors.surfaceContainerLow,
                            side: BorderSide.none,
                            minimumSize: const Size(0, 44),
                          ),
                          icon: const Icon(Icons.navigation, size: 16, color: AppColors.primary),
                          label: Text(
                            l10n.translate('liveNavigation'),
                            style: AppTypography.labelSmall(color: AppColors.textPrimary),
                          ),
                          onPressed: () {
                            Navigator.of(context).push(
                              MaterialPageRoute(
                                builder: (_) => const DriverTripProgressScreen(),
                              ),
                            );
                          },
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: OutlinedButton.icon(
                          style: OutlinedButton.styleFrom(
                            backgroundColor: AppColors.surfaceContainerLow,
                            side: BorderSide.none,
                            minimumSize: const Size(0, 44),
                          ),
                          icon: const Icon(Icons.call, size: 16, color: AppColors.secondary),
                          label: Text(
                            l10n.translate('callShipper'),
                            style: AppTypography.labelSmall(color: AppColors.textPrimary),
                          ),
                          onPressed: () {
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(
                                content: Text('📞 Calling Tariq Mills Shipper Desk (+92 300 8472910)...'),
                              ),
                            );
                          },
                        ),
                      ),
                      const SizedBox(width: 8),
                      IconButton(
                        style: IconButton.styleFrom(
                          backgroundColor: AppColors.errorContainer,
                          shape: RoundedRectangleBorder(borderRadius: AppShapes.roundedMedium),
                        ),
                        icon: const Icon(Icons.report_problem, color: AppColors.error, size: 20),
                        tooltip: 'Delay / SOS',
                        onPressed: () {
                          showDialog(
                            context: context,
                            builder: (_) => const EmergencySosDialog(),
                          );
                        },
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
          const SizedBox(height: 20),

          // Recommended Freight Opportunities Section
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                children: [
                  Text(
                    l10n.translate('availableLoads'),
                    style: AppTypography.titleMedium(),
                  ),
                  const SizedBox(width: 6),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                    decoration: BoxDecoration(
                      color: AppColors.primaryFixed,
                      borderRadius: AppShapes.roundedPill,
                    ),
                    child: Text(
                      '${state.marketplaceLoads.length} Nearby',
                      style: const TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.bold,
                        color: AppColors.primary,
                      ),
                    ),
                  ),
                ],
              ),
              InkWell(
                onTap: () {
                  Navigator.of(context).push(
                    MaterialPageRoute(
                      builder: (_) => const AvailableLoadsScreen(),
                    ),
                  );
                },
                child: Text(
                  l10n.translate('viewAll'),
                  style: AppTypography.labelMedium(color: AppColors.primary).copyWith(
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),

          // Available Load Cards
          ...state.marketplaceLoads.take(2).map(
                (load) => Container(
                  margin: const EdgeInsets.only(bottom: 12),
                  padding: AppShapes.cardPadding,
                  decoration: BoxDecoration(
                    color: AppColors.surfaceContainerLowest,
                    borderRadius: AppShapes.roundedLarge,
                    border: Border.all(color: AppColors.outlineVariant),
                    boxShadow: AppColors.cardShadow,
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Expanded(
                            child: Text(
                              '${load.originCity} → ${load.destinationCity}',
                              style: AppTypography.titleMedium(),
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                          const SizedBox(width: 8),
                          Text(
                            'Rs. ${load.agreedFare.toInt().toString().replaceAllMapped(RegExp(r'(\d{1,3})(?=(\d{3})+(?!\d))'), (Match m) => '${m[1]},')}',
                            style: AppTypography.telematicCode(
                              color: AppColors.primary,
                              fontWeight: FontWeight.bold,
                              fontSize: 14,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 4),
                      Text(
                        '${load.totalDistanceKm.toInt()} km • ${load.cargoTitle}',
                        style: AppTypography.bodySmall(fontSize: 11),
                        overflow: TextOverflow.ellipsis,
                      ),
                      const SizedBox(height: 10),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Flexible(
                            child: Container(
                              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                              decoration: BoxDecoration(
                                color: AppColors.surfaceContainerLow,
                                borderRadius: AppShapes.roundedSmall,
                              ),
                              child: Text(
                                '${load.weightTonnes} MT • ${load.vehicleRequired}',
                                style: AppTypography.telematicCode(fontSize: 10),
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                          ),
                          const SizedBox(width: 8),
                          ElevatedButton(
                            style: ElevatedButton.styleFrom(
                              backgroundColor: AppColors.surfaceContainerLow,
                              foregroundColor: AppColors.primary,
                              elevation: 0,
                              minimumSize: const Size(110, 36),
                              shape: RoundedRectangleBorder(
                                borderRadius: AppShapes.roundedMedium,
                              ),
                            ),
                            onPressed: () {
                              state.instantAcceptMarketplaceLoad(load.id);
                              ScaffoldMessenger.of(context).showSnackBar(
                                SnackBar(
                                  content: Text('🎉 Load ${load.trackingNumber} Accepted! Added to Active Trips.'),
                                  backgroundColor: AppColors.secondary,
                                ),
                              );
                            },
                            child: Text(
                              l10n.translate('instantAccept'),
                              style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),

          // Highway Alert Strip (Bhera Service Area M-2)
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: AppColors.surfaceContainerLow,
              borderRadius: AppShapes.roundedLarge,
              border: Border.all(color: AppColors.outlineVariant),
            ),
            child: Row(
              children: [
                Container(
                  width: 36,
                  height: 36,
                  decoration: BoxDecoration(
                    color: AppColors.surfaceContainer,
                    borderRadius: AppShapes.roundedMedium,
                  ),
                  child: const Icon(Icons.local_gas_station, color: AppColors.primary, size: 20),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        l10n.translate('bheraAlertTitle'),
                        style: AppTypography.labelMedium().copyWith(fontWeight: FontWeight.bold),
                      ),
                      Text(
                        l10n.translate('bheraAlertSub'),
                        style: AppTypography.bodySmall(fontSize: 11),
                      ),
                    ],
                  ),
                ),
                const Icon(Icons.chevron_right, color: AppColors.textSecondary),
              ],
            ),
          ),
          const SizedBox(height: 16),

          // Offline / Telemetry Sync Indicator
          Center(
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
              decoration: BoxDecoration(
                color: AppColors.surfaceContainerLow,
                borderRadius: AppShapes.roundedPill,
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.cloud_done, size: 14, color: AppColors.secondary),
                  const SizedBox(width: 6),
                  Text(
                    l10n.translate('telemetrySynced'),
                    style: AppTypography.telematicCode(
                      color: AppColors.textSecondary,
                      fontSize: 10,
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 24),
        ],
      ),
    );
  }

  Widget _buildMetricTile({
    required String label,
    required String value,
    required String unit,
    required IconData icon,
    required Color iconColor,
  }) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.surfaceContainerLowest,
        borderRadius: AppShapes.roundedMedium,
        border: Border.all(color: AppColors.outlineVariant),
        boxShadow: AppColors.cardShadow,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: AppTypography.labelSmall(fontSize: 10),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
          const SizedBox(height: 4),
          Row(
            crossAxisAlignment: CrossAxisAlignment.baseline,
            textBaseline: TextBaseline.alphabetic,
            children: [
              Text(
                value,
                style: AppTypography.titleMedium().copyWith(fontWeight: FontWeight.bold),
              ),
              const SizedBox(width: 2),
              Text(
                unit,
                style: AppTypography.telematicCode(
                  color: AppColors.textSecondary,
                  fontSize: 9,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
