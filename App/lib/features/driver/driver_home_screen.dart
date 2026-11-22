import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../common/widgets/error_banner.dart';
import '../../common/widgets/verification_banner.dart';
import '../../common/widgets/shipment_card.dart';
import '../../core/constants/app_constants.dart';
import '../../core/constants/freight_catalog.dart';
import '../../core/localization/app_localizations.dart';
import '../../core/services/location_reporter.dart';
import '../../core/state/app_state_provider.dart';
import '../../core/state/auth_provider.dart';
import '../../core/state/driver_provider.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_shapes.dart';
import '../../core/theme/app_typography.dart';
import 'driver_trip_progress_screen.dart';
import 'vehicle_screen.dart';

/// Driver dashboard: vehicle and availability, earnings, penalties and the
/// active trip (FR-DR-2, FR-DR-8, FR-DR-15, FR-DR-16).
class DriverHomeScreen extends StatelessWidget {
  const DriverHomeScreen({super.key});

  static String _fleetName(Map<String, dynamic> invitation) {
    final owner = invitation['fleetOwner'];
    if (owner is! Map) return '';
    return '${owner['businessName'] ?? owner['name'] ?? ''}';
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final isUrdu = context.watch<AppStateProvider>().isUrdu;
    final user = context.watch<AuthProvider>().user;
    final driver = context.watch<DriverProvider>();
    final vehicle = driver.vehicle;
    final trip = driver.activeTrip;
    final earnings = driver.earnings;
    final penalties = driver.penalties;

    return RefreshIndicator(
      onRefresh: driver.loadHome,
      child: ListView(
        padding: AppShapes.screenPadding,
        children: [
          Row(children: [
            Flexible(
              child: Text(user?.fullName ?? '',
                  style: isUrdu ? AppTypography.urduHeadlineLarge() : AppTypography.headlineLarge(),
                  overflow: TextOverflow.ellipsis),
            ),
            if (user?.isVerified ?? false) ...[
              const SizedBox(width: 6),
              const Icon(Icons.verified, size: 18, color: AppColors.secondary),
            ],
          ]),
          const SizedBox(height: 12),
          const VerificationBanner(),
          if (driver.error != null) ErrorBanner(message: driver.error!, onRetry: driver.loadHome),
          if (driver.pendingUpdates > 0)
            ErrorBanner(
              message: '${driver.pendingUpdates} ${l10n.translate('updatesWaiting')}',
              onRetry: driver.syncQueued,
            ),
          if (driver.locationProblem != null)
            ErrorBanner(
              message: l10n.translate(driver.locationProblem == LocationStartResult.serviceOff
                  ? 'locationServiceOff'
                  : 'locationPermissionDenied'),
            ),
          for (final invitation in driver.invitations)
            Card(
              child: ListTile(
                leading: const Icon(Icons.group_add),
                title: Text('${l10n.translate('fleetInvitation')}: ${_fleetName(invitation)}'),
                trailing: Row(mainAxisSize: MainAxisSize.min, children: [
                  TextButton(
                    onPressed: driver.isLoading ? null : () => driver.answerInvitation('${invitation['id']}', accept: false),
                    child: Text(l10n.translate('decline')),
                  ),
                  FilledButton(
                    onPressed: driver.isLoading ? null : () => driver.answerInvitation('${invitation['id']}', accept: true),
                    child: Text(l10n.translate('accept')),
                  ),
                ]),
              ),
            ),
          Card(
            child: ListTile(
              leading: const Icon(Icons.local_shipping),
              title: Text(vehicle == null
                  ? l10n.translate('addVehicle')
                  : '${FreightCatalog.vehicleLabel(vehicle.vehicleType)} · ${vehicle.ratedCapacity} MT'),
              subtitle: vehicle == null ? null : Text(vehicle.isAvailable ? l10n.translate('available') : l10n.translate('onBreak')),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const VehicleScreen())),
            ),
          ),
          const SizedBox(height: 12),
          if (earnings != null)
            Row(children: [
              Expanded(child: _Stat(label: l10n.translate('completedTrips'), value: '${earnings.completedTrips}')),
              const SizedBox(width: 8),
              Expanded(child: _Stat(label: l10n.translate('totalEarned'), value: '${AppConstants.currencySymbol} ${earnings.totalEarned.toStringAsFixed(0)}')),
              const SizedBox(width: 8),
              Expanded(child: _Stat(label: l10n.translate('pendingSettlement'), value: '${AppConstants.currencySymbol} ${earnings.pendingSettlement.toStringAsFixed(0)}')),
            ]),
          if (penalties != null) ...[
            const SizedBox(height: 8),
            Text('${l10n.translate('penaltiesThisMonth')}: ${penalties.activeThisMonth} / ${penalties.limit}',
                style: AppTypography.bodySmall(color: penalties.activeThisMonth > 0 ? AppColors.error : AppColors.textSecondary)),
          ],
          const SizedBox(height: 16),
          if (driver.isLoading && trip == null && vehicle == null)
            const Center(child: CircularProgressIndicator())
          else if (trip != null) ...[
            Text(l10n.translate('activeAssignment'), style: AppTypography.titleMedium()),
            const SizedBox(height: 8),
            ShipmentCard(
              shipment: trip,
              onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const DriverTripProgressScreen())),
              footer: Text(l10n.translate('openTrip'), style: AppTypography.labelLarge(color: AppColors.secondary)),
            ),
          ] else
            Card(
              child: ListTile(
                leading: const Icon(Icons.search),
                title: Text(l10n.translate('availableLoads')),
                subtitle: Text('${driver.matched.length}'),
                onTap: () => context.read<AppStateProvider>().setNavIndex(1),
              ),
            ),
        ],
      ),
    );
  }
}

class _Stat extends StatelessWidget {
  const _Stat({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: AppColors.surfaceContainerLowest,
          borderRadius: AppShapes.roundedLarge,
          border: Border.all(color: AppColors.outlineVariant),
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(label, style: AppTypography.labelSmall()),
          const SizedBox(height: 4),
          Text(value, style: AppTypography.titleMedium(color: AppColors.primary)),
        ]),
      );
}
