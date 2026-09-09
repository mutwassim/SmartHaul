import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/constants/app_constants.dart';
import '../../core/models/payment_record_model.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_typography.dart';
import '../../core/theme/app_shapes.dart';
import '../../core/services/app_state_provider.dart';
import '../../common/widgets/smart_haul_app_bar.dart';

class AuditLedgerWalletScreen extends StatelessWidget {
  const AuditLedgerWalletScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final state = Provider.of<AppStateProvider>(context);
    final records = state.paymentRecords;

    return Scaffold(
      appBar: const SmartHaulAppBar(
        title: 'Non-Custodial Audit Ledger',
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: AppShapes.screenPadding,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Header Financial Summary Card
              Container(
                padding: AppShapes.cardPadding,
                decoration: BoxDecoration(
                  color: AppColors.primary,
                  borderRadius: AppShapes.roundedLarge,
                  boxShadow: AppColors.elevationLevel2,
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Row(
                          children: [
                            const Icon(Icons.lock_outline, color: AppColors.secondaryFixed, size: 18),
                            const SizedBox(width: 6),
                            Text(
                              'DIRECT CARRIER SETTLEMENT',
                              style: AppTypography.labelSmall(color: AppColors.secondaryFixed).copyWith(
                                letterSpacing: 1.0,
                              ),
                            ),
                          ],
                        ),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                          decoration: BoxDecoration(
                            color: AppColors.secondary,
                            borderRadius: AppShapes.roundedPill,
                          ),
                          child: const Text(
                            'AUDITED',
                            style: TextStyle(
                              color: Colors.white,
                              fontSize: 10,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    Text(
                      'Monthly Direct Turnover',
                      style: AppTypography.bodySmall(color: AppColors.primaryFixedDim),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      'PKR 475,000',
                      style: AppTypography.telematicCode(
                        color: AppColors.onPrimary,
                        fontSize: 28,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const SizedBox(height: 14),

                    // 3-Column Metrics Breakdown
                    Row(
                      children: [
                        Expanded(
                          child: Container(
                            padding: const EdgeInsets.all(8),
                            decoration: BoxDecoration(
                              color: Colors.white.withValues(alpha: 0.08),
                              borderRadius: AppShapes.roundedMedium,
                            ),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  'PENDING',
                                  style: AppTypography.labelSmall(
                                    color: AppColors.tertiaryFixedDim,
                                    fontSize: 9,
                                  ),
                                ),
                                const SizedBox(height: 2),
                                Text(
                                  'Rs. 95,000',
                                  style: AppTypography.telematicCode(
                                    color: Colors.white,
                                    fontSize: 12,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Container(
                            padding: const EdgeInsets.all(8),
                            decoration: BoxDecoration(
                              color: Colors.white.withValues(alpha: 0.08),
                              borderRadius: AppShapes.roundedMedium,
                            ),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  'ADVANCE SLIP',
                                  style: AppTypography.labelSmall(
                                    color: AppColors.secondaryFixed,
                                    fontSize: 9,
                                  ),
                                ),
                                const SizedBox(height: 2),
                                Text(
                                  'Rs. 40,000',
                                  style: AppTypography.telematicCode(
                                    color: Colors.white,
                                    fontSize: 12,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Container(
                            padding: const EdgeInsets.all(8),
                            decoration: BoxDecoration(
                              color: Colors.white.withValues(alpha: 0.08),
                              borderRadius: AppShapes.roundedMedium,
                            ),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  'CLEARED PAID',
                                  style: AppTypography.labelSmall(
                                    color: AppColors.secondaryFixed,
                                    fontSize: 9,
                                  ),
                                ),
                                const SizedBox(height: 2),
                                Text(
                                  'Rs. 380,000',
                                  style: AppTypography.telematicCode(
                                    color: Colors.white,
                                    fontSize: 12,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 14),

              // Operational Legal / Trust Disclaimer Pill
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: AppColors.surfaceContainerLow,
                  borderRadius: AppShapes.roundedMedium,
                  border: Border.all(color: AppColors.outlineVariant),
                ),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Icon(Icons.info_outline, color: AppColors.textSecondary, size: 18),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        'SmartHaul records settlement statuses for audit purposes only. Payments are conducted directly via shipper bank transfer or fuel voucher. SmartHaul does not hold custodial balances.',
                        style: AppTypography.bodySmall(fontSize: 11),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 20),

              Text('Audited Transaction Records', style: AppTypography.titleMedium()),
              const SizedBox(height: 10),

              // Transaction Records List
              ...records.map((rec) => _buildRecordCard(context, rec)),

              const SizedBox(height: 20),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildRecordCard(BuildContext context, PaymentRecordModel rec) {
    Color statusColor = AppColors.primary;
    String statusLabel = 'PENDING';

    switch (rec.status) {
      case PaymentStatus.recordedPaid:
        statusColor = AppColors.secondary;
        statusLabel = 'SETTLED & CONFIRMED';
        break;
      case PaymentStatus.partialAdvance:
        statusColor = AppColors.tertiary;
        statusLabel = 'PARTIAL ADVANCE RELEASED';
        break;
      case PaymentStatus.pending:
        statusColor = AppColors.primary;
        statusLabel = 'PENDING DELIVERY';
        break;
      case PaymentStatus.disputed:
        statusColor = AppColors.error;
        statusLabel = 'DISPUTED';
        break;
    }

    return Container(
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
              Text(
                rec.trackingNumber,
                style: AppTypography.telematicCode(
                  color: AppColors.primary,
                  fontWeight: FontWeight.bold,
                  fontSize: 13,
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                decoration: BoxDecoration(
                  color: statusColor.withValues(alpha: 0.15),
                  borderRadius: AppShapes.roundedPill,
                ),
                child: Text(
                  statusLabel,
                  style: TextStyle(
                    color: statusColor,
                    fontSize: 9,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Expanded(
                child: Text(
                  rec.route,
                  style: AppTypography.titleMedium(),
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              const SizedBox(width: 8),
              Text(
                'Rs. ${rec.agreedFare.toInt().toString().replaceAllMapped(RegExp(r'(\d{1,3})(?=(\d{3})+(?!\d))'), (Match m) => '${m[1]},')}',
                style: AppTypography.telematicCode(
                  color: AppColors.textPrimary,
                  fontWeight: FontWeight.bold,
                  fontSize: 14,
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            rec.note,
            style: AppTypography.bodySmall(fontSize: 11),
          ),
          const SizedBox(height: 8),
          Divider(color: AppColors.outlineVariant.withValues(alpha: 0.5)),
          const SizedBox(height: 4),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                'Audit Hash: ${rec.cryptographicHash}',
                style: AppTypography.telematicCode(
                  color: AppColors.textMuted,
                  fontSize: 10,
                ),
              ),
              Text(
                'Verified on Grid',
                style: AppTypography.labelSmall(color: AppColors.secondary).copyWith(fontSize: 10),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
