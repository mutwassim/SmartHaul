import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../common/widgets/error_banner.dart';
import '../../common/widgets/verification_banner.dart';
import '../../common/widgets/shipment_card.dart';
import '../../core/constants/app_constants.dart';
import '../../core/localization/app_localizations.dart';
import '../../core/models/shipment_model.dart';
import '../../core/state/app_state_provider.dart';
import '../../core/state/auth_provider.dart';
import '../../core/state/cargo_provider.dart';
import '../../core/state/payment_provider.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_shapes.dart';
import '../../core/theme/app_typography.dart';
import 'bids_comparison_screen.dart';
import 'create_shipment_screen.dart';

/// Cargo owner dashboard: what is moving, what is waiting for bids, and what
/// has been recorded as paid (FR-CO-6, FR-CO-12, FR-PM-2).
class CargoHomeScreen extends StatelessWidget {
  const CargoHomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final isUrdu = context.watch<AppStateProvider>().isUrdu;
    final user = context.watch<AuthProvider>().user;
    final cargo = context.watch<CargoProvider>();
    final payments = context.watch<PaymentProvider>();
    final moving = cargo.inProgress;
    final awaitingBids = cargo.shipments.where((s) => s.isOpenForBids).toList();
    final openBids = awaitingBids.fold<int>(0, (sum, s) => sum + s.bids.where((b) => b.status == 'ACTIVE').length);

    return RefreshIndicator(
      onRefresh: () async {
        await cargo.load();
        await payments.load();
      },
      child: ListView(
        padding: AppShapes.screenPadding,
        children: [
          const VerificationBanner(),
          if (user?.isVerified ?? false)
            Row(children: [
              Text(l10n.translate('verifiedShipper'),
                  style: AppTypography.labelSmall(color: AppColors.secondary).copyWith(fontWeight: FontWeight.w700)),
              const SizedBox(width: 4),
              const Icon(Icons.verified, color: AppColors.secondary, size: 14),
            ]),
          Text(
            user?.companyName ?? user?.fullName ?? '',
            style: isUrdu ? AppTypography.urduHeadlineLarge() : AppTypography.headlineLarge(),
          ),
          const SizedBox(height: 16),
          if (cargo.error != null) ErrorBanner(message: cargo.error!, onRetry: cargo.load),
          ElevatedButton.icon(
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.primary,
              foregroundColor: AppColors.onPrimary,
              minimumSize: const Size(double.infinity, AppShapes.dominantActionHeight),
            ),
            icon: const Icon(Icons.add_circle_outline),
            label: Text(l10n.translate('createNewShipment'), style: const TextStyle(fontWeight: FontWeight.bold)),
            onPressed: () =>
                Navigator.of(context).push(MaterialPageRoute(builder: (_) => const CreateShipmentScreen())),
          ),
          const SizedBox(height: 16),
          Row(children: [
            Expanded(child: _Stat(label: l10n.translate('activeShipments'), value: '${cargo.active.length}')),
            const SizedBox(width: 12),
            Expanded(child: _Stat(label: l10n.translate('openBids'), value: '$openBids')),
          ]),
          const SizedBox(height: 16),
          if (cargo.isLoading && cargo.shipments.isEmpty)
            const Padding(padding: EdgeInsets.all(24), child: Center(child: CircularProgressIndicator())),
          if (moving != null) ...[
            Text(l10n.translate('trackLiveGps'), style: AppTypography.titleMedium()),
            const SizedBox(height: 8),
            ShipmentCard(
              shipment: moving,
              onTap: () => context.read<AppStateProvider>().setNavIndex(2),
              footer: _MovingFooter(shipment: moving),
            ),
          ],
          if (awaitingBids.isNotEmpty) ...[
            Text(l10n.translate('marketplaceBids'), style: AppTypography.titleMedium()),
            const SizedBox(height: 8),
            for (final shipment in awaitingBids)
              ShipmentCard(
                shipment: shipment,
                onTap: () => Navigator.of(context).push(
                  MaterialPageRoute(builder: (_) => BidsComparisonScreen(shipmentId: shipment.id)),
                ),
                footer: Text(
                  '${l10n.translate('compareBids')} (${shipment.bids.where((b) => b.status == 'ACTIVE').length})',
                  style: AppTypography.labelLarge(color: AppColors.secondary),
                ),
              ),
          ],
          if (!cargo.isLoading && cargo.shipments.isEmpty && cargo.error == null)
            Padding(
              padding: const EdgeInsets.all(24),
              child: Center(
                child: Text(l10n.translate('noShipmentsYet'),
                    style: AppTypography.bodyMedium(color: AppColors.textSecondary)),
              ),
            ),
          const SizedBox(height: 8),
          InkWell(
            onTap: () => context.read<AppStateProvider>().setNavIndex(3),
            child: Container(
              padding: AppShapes.cardPadding,
              decoration: BoxDecoration(
                color: AppColors.surfaceContainerLowest,
                borderRadius: AppShapes.roundedLarge,
                border: Border.all(color: AppColors.outlineVariant),
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(l10n.translate('nonCustodialLedger'), style: AppTypography.labelMedium()),
                      const SizedBox(height: 4),
                      Text('${AppConstants.currencySymbol} ${payments.totalPaid.toStringAsFixed(0)} / ${payments.totalAgreed.toStringAsFixed(0)}',
                          style: AppTypography.titleMedium()),
                    ]),
                  ),
                  Text(l10n.translate('viewStatements'), style: AppTypography.labelLarge(color: AppColors.secondary)),
                ],
              ),
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
        padding: AppShapes.cardPadding,
        decoration: BoxDecoration(
          color: AppColors.surfaceContainerLowest,
          borderRadius: AppShapes.roundedLarge,
          border: Border.all(color: AppColors.outlineVariant),
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(label, style: AppTypography.labelMedium()),
          const SizedBox(height: 4),
          Text(value, style: AppTypography.headlineMedium(color: AppColors.primary)),
        ]),
      );
}

class _MovingFooter extends StatelessWidget {
  const _MovingFooter({required this.shipment});

  final ShipmentModel shipment;

  @override
  Widget build(BuildContext context) {
    final driver = shipment.assignedDriver;
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      LinearProgressIndicator(value: shipment.progressPercentage, color: AppColors.secondary),
      const SizedBox(height: 8),
      Text(
        [if (driver != null) driver.fullName, if (shipment.status == ShipmentStatus.inTransit) shipment.expectedEta]
            .join(' · '),
        style: AppTypography.bodySmall(color: AppColors.textSecondary),
      ),
    ]);
  }
}
