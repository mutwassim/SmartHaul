import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/constants/app_constants.dart';
import '../../core/localization/app_localizations.dart';
import '../../core/models/shipment_model.dart';
import '../../core/state/auth_provider.dart';
import '../../core/state/cargo_provider.dart';
import '../../core/state/driver_provider.dart';
import '../../core/state/tracking_provider.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_shapes.dart';
import '../../core/theme/app_typography.dart';
import '../../common/widgets/error_banner.dart';
import '../../common/widgets/status_pill.dart';

/// Live tracking. The owner follows the booked driver (FR-RT-1, FR-RT-7,
/// FR-RT-8); the driver sees the trip being shared (FR-DR-12).
class LiveTrackingMapScreen extends StatefulWidget {
  const LiveTrackingMapScreen({super.key});

  @override
  State<LiveTrackingMapScreen> createState() => _LiveTrackingMapScreenState();
}

class _LiveTrackingMapScreenState extends State<LiveTrackingMapScreen> {
  String? _watching;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final auth = context.read<AuthProvider>();
    if (auth.role != UserRole.cargoOwner) return;
    final shipment = context.watch<CargoProvider>().inProgress;
    if (shipment?.id == _watching) return;
    _watching = shipment?.id;
    final tracking = context.read<TrackingProvider>();
    if (shipment == null) {
      tracking.stopWatching();
    } else {
      final token = auth.token;
      if (token != null) {
        WidgetsBinding.instance.addPostFrameCallback((_) => tracking.watch(shipment.id, token, tripId: shipment.tripId));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final isOwner = context.watch<AuthProvider>().role == UserRole.cargoOwner;
    final ShipmentModel? shipment =
        isOwner ? context.watch<CargoProvider>().inProgress : context.watch<DriverProvider>().activeTrip;

    if (shipment == null) {
      return Center(child: Text(l10n.translate('nothingToTrack'), style: AppTypography.bodyMedium(color: AppColors.textSecondary)));
    }

    return ListView(
      padding: AppShapes.screenPadding,
      children: [
        Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
          Text(shipment.trackingNumber, style: AppTypography.telematicCode(color: AppColors.primary)),
          StatusPill(status: shipment.status),
        ]),
        const SizedBox(height: 4),
        Text('${shipment.originCity} → ${shipment.destinationCity}', style: AppTypography.headlineSmall()),
        const SizedBox(height: 12),
        LinearProgressIndicator(value: shipment.progressPercentage, color: AppColors.secondary, minHeight: 8),
        const SizedBox(height: 16),
        isOwner ? const _OwnerLive() : _DriverSharing(),
      ],
    );
  }
}

class _OwnerLive extends StatelessWidget {
  const _OwnerLive();

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final tracking = context.watch<TrackingProvider>();
    final snapshot = tracking.snapshot;

    if (tracking.error != null) return ErrorBanner(message: tracking.error!);
    if (snapshot == null) return const Center(child: CircularProgressIndicator());

    final hasPosition = tracking.latitude != null && tracking.longitude != null;
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      if (snapshot.isInterrupted || !tracking.isLive)
        ErrorBanner(message: l10n.translate('trackingUnavailable')),
      if (hasPosition)
        Text('${tracking.latitude!.toStringAsFixed(5)}, ${tracking.longitude!.toStringAsFixed(5)}', style: AppTypography.telematicCode())
      else
        Text(l10n.translate('noPositionYet'), style: AppTypography.bodyMedium(color: AppColors.textSecondary)),
      const SizedBox(height: 8),
      Text(
        '${tracking.remainingDistanceKm.toStringAsFixed(0)} km · ${tracking.estimatedArrivalMinutes ~/ 60} h ${tracking.estimatedArrivalMinutes % 60} min',
        style: AppTypography.titleMedium(color: AppColors.primary),
      ),
    ]);
  }
}

class _DriverSharing extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final driver = context.watch<DriverProvider>();
    return ListTile(
      leading: Icon(
        driver.locationProblem == null ? Icons.my_location : Icons.location_disabled,
        color: driver.locationProblem == null ? AppColors.secondary : AppColors.error,
      ),
      title: Text(l10n.translate(driver.locationProblem == null ? 'sharingLocation' : 'locationPermissionDenied')),
    );
  }
}
