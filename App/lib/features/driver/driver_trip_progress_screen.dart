import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../common/utils/dispose_later.dart';
import '../../common/widgets/error_banner.dart';
import '../../common/widgets/smart_haul_app_bar.dart';
import '../../core/constants/app_constants.dart';
import '../../core/localization/app_localizations.dart';
import '../../core/services/navigation_launcher.dart';
import '../../core/state/driver_provider.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_shapes.dart';
import '../../core/theme/app_typography.dart';
import 'proof_of_delivery_screen.dart';

/// The active trip: the five-step timeline, the one next status and, before
/// the cargo is loaded, cancellation with a reason (FR-DR-8, FR-DR-9).
class DriverTripProgressScreen extends StatelessWidget {
  const DriverTripProgressScreen({super.key});

  static const List<String> _stepKeys = [
    'stepReachedPickup',
    'stepCargoLoaded',
    'stepInTransit',
    'stepReachedDestination',
    'stepDelivered',
  ];

  static const Map<String, String> _nextLabelKey = {
    'REACHED_PICKUP': 'stepReachedPickup',
    'CARGO_LOADED': 'stepCargoLoaded',
    'IN_TRANSIT': 'stepInTransit',
    'REACHED_DESTINATION': 'stepReachedDestination',
    'DELIVERED': 'stepDelivered',
  };

  Future<void> _cancel(BuildContext context) async {
    final l10n = AppLocalizations.of(context);
    final driver = context.read<DriverProvider>();
    final reason = TextEditingController();
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialog) => AlertDialog(
        title: Text(l10n.translate('cancelTrip')),
        content: TextField(controller: reason, decoration: InputDecoration(labelText: l10n.translate('cancelReason'))),
        actions: [
          TextButton(onPressed: () => Navigator.of(dialog).pop(false), child: Text(l10n.translate('cancel'))),
          FilledButton(onPressed: () => Navigator.of(dialog).pop(true), child: Text(l10n.translate('cancelTrip'))),
        ],
      ),
    );
    final text = reason.text.trim();
    disposeLater([reason]);
    if (confirmed != true || text.isEmpty) return;
    await driver.cancelTrip(text);
    if (context.mounted && driver.activeTrip == null) Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final driver = context.watch<DriverProvider>();
    final trip = driver.activeTrip;
    final next = driver.nextStatus;

    return Scaffold(
      appBar: SmartHaulAppBar(title: l10n.translate('activeAssignment'), showBackButton: true),
      body: SafeArea(
        child: trip == null
            ? Center(child: Text(l10n.translate('noActiveTrip')))
            : ListView(
                padding: AppShapes.screenPadding,
                children: [
                  Text(trip.trackingNumber, style: AppTypography.telematicCode(color: AppColors.primary)),
                  Text('${trip.originCity} → ${trip.destinationCity}', style: AppTypography.headlineSmall()),
                  Text('${trip.cargoTitle} · ${trip.weightTonnes} MT', style: AppTypography.bodyMedium(color: AppColors.textSecondary)),
                  const SizedBox(height: 16),
                  if (driver.error != null) ErrorBanner(message: driver.error!),
                  if (driver.pendingUpdates > 0)
                    ErrorBanner(message: '${driver.pendingUpdates} ${l10n.translate('updatesWaiting')}', onRetry: driver.syncQueued),
                  for (var i = 0; i < _stepKeys.length; i++)
                    ListTile(
                      leading: Icon(
                        i <= trip.activeMilestoneIndex ? Icons.check_circle : Icons.radio_button_unchecked,
                        color: i <= trip.activeMilestoneIndex ? AppColors.secondary : AppColors.outline,
                      ),
                      title: Text(l10n.translate(_stepKeys[i])),
                    ),
                  const SizedBox(height: 16),
                  if (next != null)
                    ElevatedButton(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppColors.primary,
                        foregroundColor: AppColors.onPrimary,
                        minimumSize: const Size(double.infinity, AppShapes.dominantActionHeight),
                      ),
                      onPressed: driver.isLoading
                          ? null
                          : () {
                              // Delivered needs the proof photographs first (FR-DR-14).
                              if (trip.status == ShipmentStatus.atDestination) {
                                Navigator.of(context).push(MaterialPageRoute(builder: (_) => const ProofOfDeliveryScreen()));
                              } else {
                                driver.advance();
                              }
                            },
                      child: Text(l10n.translate(_nextLabelKey[next]!)),
                    ),
                  const SizedBox(height: 8),
                  OutlinedButton.icon(
                    icon: const Icon(Icons.navigation),
                    label: Text(l10n.translate(trip.status == ShipmentStatus.assigned ? 'navigateToPickup' : 'navigateToDropoff')),
                    onPressed: () async {
                      final toPickup = trip.status == ShipmentStatus.assigned;
                      final messenger = ScaffoldMessenger.of(context);
                      final opened = await NavigationLauncher.open(
                        toPickup ? trip.pickupLat : trip.dropoffLat,
                        toPickup ? trip.pickupLng : trip.dropoffLng,
                      );
                      if (!opened) messenger.showSnackBar(SnackBar(content: Text(l10n.translate('mapAppUnavailable'))));
                    },
                  ),
                  if (driver.canCancel)
                    TextButton(onPressed: driver.isLoading ? null : () => _cancel(context), child: Text(l10n.translate('cancelTrip'))),
                ],
              ),
      ),
    );
  }
}
