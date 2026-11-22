import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../common/widgets/error_banner.dart';
import '../../common/widgets/smart_haul_app_bar.dart';
import '../../core/constants/app_constants.dart';
import '../../core/localization/app_localizations.dart';
import '../../core/models/bid_model.dart';
import '../../core/models/shipment_model.dart';
import '../../core/state/cargo_provider.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_shapes.dart';
import '../../core/theme/app_typography.dart';

/// Compares the bids on one shipment and books the chosen carrier
/// (FR-CO-6, FR-CO-7, USE-9).
class BidsComparisonScreen extends StatefulWidget {
  const BidsComparisonScreen({super.key, required this.shipmentId});

  final String shipmentId;

  @override
  State<BidsComparisonScreen> createState() => _BidsComparisonScreenState();
}

class _BidsComparisonScreenState extends State<BidsComparisonScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => context.read<CargoProvider>().open(widget.shipmentId));
  }

  Future<void> _confirmAndAccept(ShipmentModel shipment, BidModel bid) async {
    final l10n = AppLocalizations.of(context);
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialog) => AlertDialog(
        title: Text(l10n.translate('confirmBooking')),
        content: Text(
          '${bid.bidderName}\n${AppConstants.currencySymbol} ${bid.amount.toStringAsFixed(0)}\n\n'
          '${l10n.translate('confirmBookingNote')}',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(dialog).pop(false), child: Text(l10n.translate('cancel'))),
          FilledButton(onPressed: () => Navigator.of(dialog).pop(true), child: Text(l10n.translate('bookCarrier'))),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    final cargo = context.read<CargoProvider>();
    final messenger = ScaffoldMessenger.of(context);
    final ok = await cargo.acceptBid(shipment, bid.id, bid.amount);
    if (!mounted) return;
    if (ok) {
      messenger.showSnackBar(SnackBar(content: Text(l10n.translate('carrierBooked'))));
      Navigator.of(context).pop();
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final cargo = context.watch<CargoProvider>();
    final shipment = cargo.selected?.id == widget.shipmentId ? cargo.selected : null;
    final bids = shipment?.bids.where((b) => b.status == 'ACTIVE').toList() ?? const <BidModel>[];

    return Scaffold(
      appBar: SmartHaulAppBar(title: l10n.translate('compareBids'), showBackButton: true),
      body: SafeArea(
        child: shipment == null
            ? Center(
                child: cargo.error != null
                    ? ErrorBanner(message: cargo.error!, onRetry: () => cargo.open(widget.shipmentId))
                    : const CircularProgressIndicator(),
              )
            : ListView(
                padding: AppShapes.screenPadding,
                children: [
                  _Summary(shipment: shipment, activeBids: bids.length),
                  const SizedBox(height: 16),
                  if (cargo.error != null) ErrorBanner(message: cargo.error!),
                  if (bids.isEmpty)
                    Padding(
                      padding: const EdgeInsets.all(24),
                      child: Center(child: Text(l10n.translate('noBidsYet'))),
                    ),
                  for (final bid in bids)
                    _BidCard(
                      bid: bid,
                      busy: cargo.isLoading,
                      onAccept: () => _confirmAndAccept(shipment, bid),
                    ),
                ],
              ),
      ),
    );
  }
}

class _Summary extends StatelessWidget {
  const _Summary({required this.shipment, required this.activeBids});

  final ShipmentModel shipment;
  final int activeBids;

  @override
  Widget build(BuildContext context) => Container(
        padding: AppShapes.cardPadding,
        decoration: BoxDecoration(color: AppColors.primary, borderRadius: AppShapes.roundedLarge),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(shipment.trackingNumber,
              style: AppTypography.telematicCode(color: AppColors.secondaryFixed, fontSize: 12)),
          const SizedBox(height: 8),
          Text(shipment.cargoTitle, style: AppTypography.titleLarge(color: AppColors.onPrimary)),
          const SizedBox(height: 4),
          Text(
            '${shipment.originCity} → ${shipment.destinationCity} (${shipment.totalDistanceKm.toInt()} km)',
            style: AppTypography.bodySmall(color: AppColors.primaryFixedDim),
          ),
          const SizedBox(height: 4),
          Text('${shipment.weightTonnes} MT • ${shipment.vehicleRequired} • $activeBids bids',
              style: AppTypography.telematicCode(color: AppColors.onPrimary, fontSize: 11)),
        ]),
      );
}

class _BidCard extends StatelessWidget {
  const _BidCard({required this.bid, required this.busy, required this.onAccept});

  final BidModel bid;
  final bool busy;
  final VoidCallback onAccept;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: AppShapes.cardPadding,
      decoration: BoxDecoration(
        color: AppColors.surfaceContainerLowest,
        borderRadius: AppShapes.roundedLarge,
        border: Border.all(
          color: bid.isLowestBid ? AppColors.secondary : AppColors.outlineVariant,
          width: bid.isLowestBid ? 1.8 : 1.0,
        ),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Flexible(child: Text(bid.bidderName, style: AppTypography.titleMedium())),
                if (bid.isVerified) ...[
                  const SizedBox(width: 4),
                  const Icon(Icons.verified, color: AppColors.secondary, size: 16),
                ],
              ]),
              if (bid.bidderCompany.isNotEmpty) Text(bid.bidderCompany, style: AppTypography.bodySmall()),
            ]),
          ),
          Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
            Text(
              '${AppConstants.currencySymbol} ${bid.amount.toStringAsFixed(0)}',
              style: AppTypography.telematicCode(
                color: bid.isLowestBid ? AppColors.secondary : AppColors.primary,
                fontSize: 16,
                fontWeight: FontWeight.bold,
              ),
            ),
            if (bid.isLowestBid)
              Text(l10n.translate('lowestOffer'), style: AppTypography.labelSmall(color: AppColors.secondary)),
          ]),
        ]),
        const SizedBox(height: 12),
        Wrap(spacing: 16, runSpacing: 4, children: [
          _Fact(Icons.star, '${bid.bidderRating} (${bid.bidderTotalTrips})'),
          _Fact(Icons.schedule, bid.estimatedDeliveryTime),
          if (bid.vehicleType.isNotEmpty) _Fact(Icons.local_shipping, bid.vehicleType),
        ]),
        const SizedBox(height: 12),
        ElevatedButton(
          style: ElevatedButton.styleFrom(
            backgroundColor: bid.isLowestBid ? AppColors.secondary : AppColors.primary,
            foregroundColor: AppColors.onPrimary,
            minimumSize: const Size(double.infinity, 44),
          ),
          onPressed: busy ? null : onAccept,
          child: Text(l10n.translate('bookCarrier')),
        ),
      ]),
    );
  }
}

class _Fact extends StatelessWidget {
  const _Fact(this.icon, this.text);

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) => Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(icon, size: 16, color: AppColors.textSecondary),
        const SizedBox(width: 4),
        Text(text, style: AppTypography.labelSmall()),
      ]);
}
