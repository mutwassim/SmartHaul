import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../common/utils/dispose_later.dart';
import '../../common/widgets/error_banner.dart';
import '../../common/widgets/shipment_card.dart';
import '../../core/constants/app_constants.dart';
import '../../core/localization/app_localizations.dart';
import '../../core/models/bid_model.dart';
import '../../core/models/shipment_model.dart';
import '../../core/state/driver_provider.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_shapes.dart';
import '../../core/theme/app_typography.dart';
import 'vehicle_screen.dart';

/// Loads matched to the driver's vehicle, with bidding (FR-DR-5 to FR-DR-7).
class AvailableLoadsScreen extends StatefulWidget {
  const AvailableLoadsScreen({super.key});

  @override
  State<AvailableLoadsScreen> createState() => _AvailableLoadsScreenState();
}

class _AvailableLoadsScreenState extends State<AvailableLoadsScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => context.read<DriverProvider>().loadMatched());
  }

  Future<void> _bid(ShipmentModel load, BidModel? existing) async {
    final l10n = AppLocalizations.of(context);
    final driver = context.read<DriverProvider>();
    final fare = TextEditingController(text: existing?.amount.toStringAsFixed(0) ?? '');
    final hours = TextEditingController(text: '24');
    final formKey = GlobalKey<FormState>();

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialog) => AlertDialog(
        title: Text(existing == null ? l10n.translate('placeBid') : l10n.translate('reviseBid')),
        content: Form(
          key: formKey,
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            TextFormField(
              controller: fare,
              keyboardType: TextInputType.number,
              decoration: InputDecoration(labelText: '${l10n.translate('yourFare')} (${AppConstants.currency})'),
              validator: (v) => (double.tryParse(v ?? '') ?? 0) > 0 ? null : l10n.translate('fieldRequired'),
            ),
            TextFormField(
              controller: hours,
              keyboardType: TextInputType.number,
              decoration: InputDecoration(labelText: l10n.translate('deliveryHours')),
              validator: (v) => (int.tryParse(v ?? '') ?? 0) > 0 ? null : l10n.translate('fieldRequired'),
            ),
          ]),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(dialog).pop(false), child: Text(l10n.translate('cancel'))),
          FilledButton(
            onPressed: () {
              if (formKey.currentState!.validate()) Navigator.of(dialog).pop(true);
            },
            child: Text(l10n.translate('submit')),
          ),
        ],
      ),
    );
    final amount = double.tryParse(fare.text) ?? 0;
    final eta = DateTime.now().add(Duration(hours: int.tryParse(hours.text) ?? 24));
    disposeLater([fare, hours]);
    if (confirmed != true) return;

    if (existing != null) {
      await driver.reviseBid(existing.id, fare: amount, estimatedDelivery: eta);
    } else {
      await driver.submitBid(
        shipmentId: load.id,
        fare: amount,
        estimatedDelivery: eta,
        vehicleId: driver.vehicle?.id,
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final driver = context.watch<DriverProvider>();

    if (driver.vehicle == null && !driver.isLoading) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Text(l10n.translate('addVehicleFirst'), textAlign: TextAlign.center),
            const SizedBox(height: 12),
            FilledButton(
              onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const VehicleScreen())),
              child: Text(l10n.translate('addVehicle')),
            ),
          ]),
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: driver.loadMatched,
      child: ListView(
        padding: AppShapes.screenPadding,
        children: [
          if (driver.error != null) ErrorBanner(message: driver.error!, onRetry: driver.loadMatched),
          if (driver.matched.isEmpty && !driver.isLoading)
            Padding(
              padding: const EdgeInsets.all(24),
              child: Center(child: Text(l10n.translate('noMatchingLoads'), style: AppTypography.bodyMedium())),
            ),
          for (final load in driver.matched)
            ShipmentCard(
              shipment: load,
              footer: _BidFooter(
                bid: load.myBid,
                busy: driver.isLoading,
                onBid: () => _bid(load, load.myBid),
                onWithdraw: load.myBid == null ? null : () => driver.withdrawBid(load.myBid!.id),
              ),
            ),
        ],
      ),
    );
  }
}

class _BidFooter extends StatelessWidget {
  const _BidFooter({required this.bid, required this.busy, required this.onBid, this.onWithdraw});

  final BidModel? bid;
  final bool busy;
  final VoidCallback onBid;
  final VoidCallback? onWithdraw;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final mine = bid;
    if (mine != null && mine.status == 'EXPIRED') {
      return Text(l10n.translate('bidExpired'), style: AppTypography.labelLarge(color: AppColors.error));
    }
    return Row(children: [
      if (mine != null)
        Expanded(
          child: Text(
            '${l10n.translate('yourBid')}: ${AppConstants.currencySymbol} ${mine.amount.toStringAsFixed(0)}',
            style: AppTypography.labelLarge(color: AppColors.secondary),
          ),
        )
      else
        const Spacer(),
      if (onWithdraw != null) TextButton(onPressed: busy ? null : onWithdraw, child: Text(l10n.translate('withdraw'))),
      FilledButton(
        onPressed: busy ? null : onBid,
        child: Text(mine == null ? l10n.translate('placeBid') : l10n.translate('reviseBid')),
      ),
    ]);
  }
}
