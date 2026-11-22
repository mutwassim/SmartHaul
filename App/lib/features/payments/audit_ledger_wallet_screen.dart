import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../common/utils/dispose_later.dart';
import '../../common/widgets/error_banner.dart';
import '../../core/constants/app_constants.dart';
import '../../core/localization/app_localizations.dart';
import '../../core/models/payment_record_model.dart';
import '../../core/state/auth_provider.dart';
import '../../core/state/payment_provider.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_shapes.dart';
import '../../core/theme/app_typography.dart';

/// Payment records. SmartHaul holds no money: the driver records what was
/// received and either party can dispute a record (FR-PM-2, FR-PM-5 to FR-PM-9).
class AuditLedgerWalletScreen extends StatelessWidget {
  const AuditLedgerWalletScreen({super.key});

  Future<void> _record(BuildContext context, PaymentRecordModel record) async {
    final l10n = AppLocalizations.of(context);
    final provider = context.read<PaymentProvider>();
    final amount = TextEditingController(text: record.balance.toStringAsFixed(0));
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialog) => AlertDialog(
        title: Text(l10n.translate('recordPayment')),
        content: TextField(
          controller: amount,
          keyboardType: TextInputType.number,
          decoration: InputDecoration(labelText: '${l10n.translate('amountReceived')} (${AppConstants.currency})'),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(dialog).pop(false), child: Text(l10n.translate('cancel'))),
          FilledButton(onPressed: () => Navigator.of(dialog).pop(true), child: Text(l10n.translate('submit'))),
        ],
      ),
    );
    final received = double.tryParse(amount.text);
    disposeLater([amount]);
    if (confirmed != true || received == null || received <= 0) return;
    await provider.record(record.id, fullyPaid: received >= record.balance, amountReceived: received);
  }

  Future<void> _dispute(BuildContext context, PaymentRecordModel record) async {
    final l10n = AppLocalizations.of(context);
    final provider = context.read<PaymentProvider>();
    final description = TextEditingController();
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialog) => AlertDialog(
        title: Text(l10n.translate('raiseDispute')),
        content: TextField(controller: description, maxLines: 3, decoration: InputDecoration(labelText: l10n.translate('disputeDescription'))),
        actions: [
          TextButton(onPressed: () => Navigator.of(dialog).pop(false), child: Text(l10n.translate('cancel'))),
          FilledButton(onPressed: () => Navigator.of(dialog).pop(true), child: Text(l10n.translate('submit'))),
        ],
      ),
    );
    final text = description.text.trim();
    disposeLater([description]);
    if (confirmed != true || text.isEmpty) return;
    await provider.dispute(record.id, text);
  }

  String _statusKey(PaymentStatus status) {
    switch (status) {
      case PaymentStatus.pending:
        return 'paymentPending';
      case PaymentStatus.partialAdvance:
        return 'paymentPartial';
      case PaymentStatus.recordedPaid:
        return 'paymentRecordedPaid';
      case PaymentStatus.disputed:
        return 'paymentDisputed';
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final payments = context.watch<PaymentProvider>();
    final isDriver = context.watch<AuthProvider>().role == UserRole.driver;

    return RefreshIndicator(
      onRefresh: payments.load,
      child: ListView(
        padding: AppShapes.screenPadding,
        children: [
          Text(l10n.translate('paymentsNotice'), style: AppTypography.bodySmall(color: AppColors.textSecondary)),
          const SizedBox(height: 12),
          if (payments.error != null) ErrorBanner(message: payments.error!, onRetry: payments.load),
          if (payments.records.isEmpty && !payments.isLoading)
            Padding(
              padding: const EdgeInsets.all(24),
              child: Center(child: Text(l10n.translate('noPayments'))),
            ),
          for (final record in payments.records)
            Card(
              child: Padding(
                padding: AppShapes.cardPadding,
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                    Text(record.trackingNumber, style: AppTypography.telematicCode(color: AppColors.primary)),
                    Text(l10n.translate(_statusKey(record.status)), style: AppTypography.labelLarge()),
                  ]),
                  const SizedBox(height: 4),
                  Text(record.route, style: AppTypography.titleMedium()),
                  const SizedBox(height: 8),
                  Text(
                    '${l10n.translate('agreedFare')}: ${AppConstants.currencySymbol} ${record.agreedFare.toStringAsFixed(0)}\n'
                    '${l10n.translate('recordedReceived')}: ${AppConstants.currencySymbol} ${record.amountPaid.toStringAsFixed(0)}\n'
                    '${l10n.translate('balance')}: ${AppConstants.currencySymbol} ${record.balance.toStringAsFixed(0)}',
                    style: AppTypography.bodySmall(),
                  ),
                  if (record.status != PaymentStatus.disputed)
                    Row(mainAxisAlignment: MainAxisAlignment.end, children: [
                      TextButton(onPressed: payments.isLoading ? null : () => _dispute(context, record), child: Text(l10n.translate('raiseDispute'))),
                      if (isDriver && record.status != PaymentStatus.recordedPaid)
                        FilledButton(onPressed: payments.isLoading ? null : () => _record(context, record), child: Text(l10n.translate('recordPayment'))),
                    ]),
                ]),
              ),
            ),
        ],
      ),
    );
  }
}
