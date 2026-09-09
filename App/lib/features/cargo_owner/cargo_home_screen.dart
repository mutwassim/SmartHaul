import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/constants/app_constants.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_typography.dart';
import '../../core/theme/app_shapes.dart';
import '../../core/services/app_state_provider.dart';
import '../../core/localization/app_localizations.dart';
import '../../common/widgets/status_pill.dart';
import 'create_shipment_screen.dart';
import 'bids_comparison_screen.dart';

class CargoHomeScreen extends StatelessWidget {
  const CargoHomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final state = Provider.of<AppStateProvider>(context);
    final l10n = AppLocalizations.of(context);
    final isUrdu = state.isUrdu;
    final primaryShipment = state.activeShipment;

    return SingleChildScrollView(
      padding: AppShapes.screenPadding,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Welcome & Identity Block
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Text(
                          l10n.translate('verifiedShipper'),
                          style: AppTypography.labelSmall(
                            color: AppColors.secondary,
                          ).copyWith(fontWeight: FontWeight.w700),
                        ),
                        const SizedBox(width: 4),
                        const Icon(
                          Icons.verified,
                          color: AppColors.secondary,
                          size: 14,
                        ),
                      ],
                    ),
                    const SizedBox(height: 2),
                    Text(
                      l10n.translate('companyName'),
                      style: isUrdu
                          ? AppTypography.urduHeadlineLarge()
                          : AppTypography.headlineLarge(),
                    ),
                    Text(
                      l10n.translate('companyDesc'),
                      style: AppTypography.bodySmall(color: AppColors.textSecondary),
                    ),
                  ],
                ),
              ),
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: AppColors.surfaceContainerLow,
                  borderRadius: AppShapes.roundedMedium,
                  border: Border.all(color: AppColors.outlineVariant),
                ),
                child: const Icon(
                  Icons.notifications_none,
                  color: AppColors.textPrimary,
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),

          // Primary Floating Action: Dispatch Requisition Launcher
          Container(
            padding: AppShapes.cardPadding,
            decoration: BoxDecoration(
              color: AppColors.inverseSurface,
              borderRadius: AppShapes.roundedLarge,
              boxShadow: AppColors.elevationLevel2,
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'IMMEDIATE DISPATCH',
                            style: AppTypography.labelSmall(
                              color: AppColors.inversePrimary,
                            ).copyWith(letterSpacing: 1.2),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            l10n.translate('postFreightRequisition'),
                            style: isUrdu
                                ? AppTypography.urduHeadlineMedium(
                                    color: AppColors.inverseOnSurface,
                                  )
                                : AppTypography.headlineSmall(
                                    color: AppColors.inverseOnSurface,
                                  ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 8),
                    Container(
                      width: 40,
                      height: 40,
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.1),
                        borderRadius: AppShapes.roundedMedium,
                      ),
                      child: const Icon(
                        Icons.alt_route,
                        color: AppColors.inversePrimary,
                        size: 22,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 6),
                Text(
                  l10n.translate('instantQuoteBroadcast'),
                  style: AppTypography.bodySmall(
                    color: AppColors.primaryFixedDim,
                  ),
                ),
                const SizedBox(height: 16),
                ElevatedButton.icon(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.primaryContainer,
                    foregroundColor: AppColors.onPrimaryContainer,
                    minimumSize: const Size(double.infinity, 48),
                    elevation: 0,
                  ),
                  icon: const Icon(Icons.add_circle_outline, size: 20),
                  label: Text(
                    l10n.translate('createNewShipment'),
                    style: const TextStyle(fontWeight: FontWeight.bold),
                  ),
                  onPressed: () {
                    Navigator.of(context).push(
                      MaterialPageRoute(
                        builder: (_) => const CreateShipmentScreen(),
                      ),
                    );
                  },
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),

          // Operational Telemetry Grid (Active Trucks & Open Loads)
          Row(
            children: [
              Expanded(
                child: Container(
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
                            l10n.translate('activeFleet'),
                            style: AppTypography.labelMedium(),
                          ),
                          Container(
                            width: 8,
                            height: 8,
                            decoration: const BoxDecoration(
                              color: AppColors.secondary,
                              shape: BoxShape.circle,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      Text(
                        '2 Trucks',
                        style: AppTypography.titleLarge(color: AppColors.textPrimary),
                      ),
                      const SizedBox(height: 4),
                      Row(
                        children: [
                          const Icon(Icons.local_shipping,
                              size: 14, color: AppColors.secondary),
                          const SizedBox(width: 4),
                          Flexible(
                            child: Text(
                              l10n.translate('trucksInTransit'),
                              style: AppTypography.labelSmall(
                                color: AppColors.secondary,
                              ),
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Container(
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
                            l10n.translate('openLoads'),
                            style: AppTypography.labelMedium(),
                          ),
                          const Icon(Icons.folder_open,
                              size: 16, color: AppColors.textSecondary),
                        ],
                      ),
                      const SizedBox(height: 8),
                      Text(
                        '4 Loads',
                        style: AppTypography.titleLarge(color: AppColors.textPrimary),
                      ),
                      const SizedBox(height: 4),
                      Row(
                        children: [
                          const Icon(Icons.gavel, size: 14, color: AppColors.tertiary),
                          const SizedBox(width: 4),
                          Flexible(
                            child: Text(
                              '14 ${l10n.translate('bidsReceived')}',
                              style: AppTypography.labelSmall(
                                color: AppColors.tertiary,
                              ),
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 20),

          // Active Shipment Section
          if (primaryShipment != null) ...[
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  l10n.translate('activeShipment'),
                  style: AppTypography.titleMedium(),
                ),
                Text(
                  '1 OF 2 LIVE',
                  style: AppTypography.telematicCode(
                    color: AppColors.textSecondary,
                    fontSize: 11,
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
                border: Border.all(color: AppColors.outlineVariant),
                boxShadow: AppColors.cardShadow,
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      StatusPill(
                        status: primaryShipment.status,
                        customText: '${primaryShipment.trackingNumber} • IN TRANSIT',
                      ),
                      Row(
                        children: [
                          Container(
                            width: 6,
                            height: 6,
                            decoration: const BoxDecoration(
                              color: AppColors.tertiary,
                              shape: BoxShape.circle,
                            ),
                          ),
                          const SizedBox(width: 4),
                          Text(
                            'ETA ${primaryShipment.expectedEta}',
                            style: AppTypography.telematicCode(
                              color: AppColors.tertiary,
                              fontSize: 11,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                  const SizedBox(height: 14),

                  // Route Architecture
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: AppColors.surfaceContainerLow,
                      borderRadius: AppShapes.roundedMedium,
                    ),
                    child: Row(
                      children: [
                        Column(
                          children: [
                            Container(
                              width: 10,
                              height: 10,
                              decoration: const BoxDecoration(
                                color: AppColors.primary,
                                shape: BoxShape.circle,
                              ),
                            ),
                            Container(
                              width: 2,
                              height: 32,
                              color: AppColors.outline,
                            ),
                            Container(
                              width: 10,
                              height: 10,
                              decoration: const BoxDecoration(
                                color: AppColors.inverseSurface,
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
                              Row(
                                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                children: [
                                  Text(
                                    primaryShipment.originCity,
                                    style: AppTypography.titleMedium(),
                                  ),
                                  const SizedBox(width: 8),
                                  Flexible(
                                    child: Text(
                                      primaryShipment.originHub,
                                      style: AppTypography.bodySmall(fontSize: 11),
                                      overflow: TextOverflow.ellipsis,
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 16),
                              Row(
                                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                children: [
                                  Text(
                                    primaryShipment.destinationCity,
                                    style: AppTypography.titleMedium(),
                                  ),
                                  const SizedBox(width: 8),
                                  Flexible(
                                    child: Text(
                                      primaryShipment.destinationHub,
                                      style: AppTypography.bodySmall(fontSize: 11),
                                      overflow: TextOverflow.ellipsis,
                                    ),
                                  ),
                                ],
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 12),

                  // Telemetry Progress Bar
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Expanded(
                        child: Text(
                          l10n.translate('progressMotorway'),
                          style: AppTypography.telematicCode(
                            color: AppColors.textSecondary,
                            fontSize: 11,
                          ),
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      const SizedBox(width: 8),
                      Text(
                        '127 km remaining',
                        style: AppTypography.telematicCode(
                          color: AppColors.textPrimary,
                          fontWeight: FontWeight.bold,
                          fontSize: 11,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 6),
                  ClipRRect(
                    borderRadius: AppShapes.roundedPill,
                    child: LinearProgressIndicator(
                      value: primaryShipment.progressPercentage,
                      backgroundColor: AppColors.surfaceContainer,
                      valueColor: const AlwaysStoppedAnimation<Color>(
                        AppColors.primary,
                      ),
                      minHeight: 6,
                    ),
                  ),
                  const SizedBox(height: 14),

                  // Assigned Driver Card
                  Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: AppColors.surfaceContainerLow,
                      borderRadius: AppShapes.roundedMedium,
                    ),
                    child: Row(
                      children: [
                        CircleAvatar(
                          radius: 20,
                          backgroundColor: AppColors.primary,
                          child: Text(
                            (primaryShipment.assignedDriver?.fullName ?? 'Ahmad Khan').substring(0, 1),
                            style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  Text(
                                    primaryShipment.assignedDriver?.fullName ?? 'Ahmad Khan',
                                    style: AppTypography.labelMedium().copyWith(
                                      fontWeight: FontWeight.bold,
                                    ),
                                  ),
                                  const SizedBox(width: 4),
                                  const Text(
                                    '★ 4.9',
                                    style: TextStyle(
                                      fontSize: 11,
                                      fontWeight: FontWeight.bold,
                                      color: AppColors.tertiary,
                                    ),
                                  ),
                                ],
                              ),
                              Text(
                                '${primaryShipment.assignedDriver?.vehicleInfo ?? "Hino 500 Prime"} • ${primaryShipment.assignedDriver?.vehiclePlate ?? "LES-8942"}',
                                style: AppTypography.bodySmall(fontSize: 11),
                              ),
                            ],
                          ),
                        ),
                        const Icon(
                          Icons.verified_user,
                          color: AppColors.secondary,
                          size: 20,
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 14),

                  // Action Buttons
                  Row(
                    children: [
                      Expanded(
                        child: ElevatedButton.icon(
                          style: ElevatedButton.styleFrom(
                            backgroundColor: AppColors.primary,
                            foregroundColor: AppColors.onPrimary,
                            minimumSize: const Size(0, 44),
                          ),
                          icon: const Icon(Icons.navigation, size: 16),
                          label: Text(l10n.translate('trackLiveGps')),
                          onPressed: () => state.setNavIndex(2),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: OutlinedButton.icon(
                          style: OutlinedButton.styleFrom(
                            minimumSize: const Size(0, 44),
                          ),
                          icon: const Icon(Icons.chat_bubble_outline, size: 16),
                          label: Text(l10n.translate('messageDriver')),
                          onPressed: () {
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(
                                content: Text('Connecting to in-app dispatch channel with Driver...'),
                              ),
                            );
                          },
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
          const SizedBox(height: 20),

          // Bids & Marketplace Tenders Section
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                l10n.translate('marketplaceBids'),
                style: AppTypography.titleMedium(),
              ),
              InkWell(
                onTap: () {
                  Navigator.of(context).push(
                    MaterialPageRoute(
                      builder: (_) => const BidsComparisonScreen(),
                    ),
                  );
                },
                child: Text(
                  '${l10n.translate('viewAll')} (4)',
                  style: AppTypography.labelMedium(color: AppColors.primary).copyWith(
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),

          // Tender Card (SH-2055)
          Container(
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
                    Row(
                      children: [
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                          decoration: BoxDecoration(
                            color: AppColors.surfaceContainerLow,
                            borderRadius: AppShapes.roundedSmall,
                          ),
                          child: Text(
                            'SH-2055',
                            style: AppTypography.telematicCode(fontSize: 11),
                          ),
                        ),
                        const SizedBox(width: 6),
                        const StatusPill(
                          status: ShipmentStatus.pending,
                          customText: 'ACTIVE TENDER',
                        ),
                      ],
                    ),
                    const Icon(Icons.local_shipping, color: AppColors.primary),
                  ],
                ),
                const SizedBox(height: 8),
                Text(
                  'Raw Cotton Bales (32 MT)',
                  style: AppTypography.titleMedium(),
                ),
                Text(
                  'Multan Industrial Estate → Karachi Port SAPT',
                  style: AppTypography.bodySmall(),
                ),
                const SizedBox(height: 12),
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: AppColors.surfaceContainerLow,
                    borderRadius: AppShapes.roundedMedium,
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('Carrier Proposals', style: AppTypography.bodySmall(fontSize: 11)),
                          Text(
                            '6 Bids Received',
                            style: AppTypography.labelMedium().copyWith(fontWeight: FontWeight.bold),
                          ),
                        ],
                      ),
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          Text(l10n.translate('lowestOffer'), style: AppTypography.bodySmall(fontSize: 11)),
                          Text(
                            'PKR 145,000',
                            style: AppTypography.telematicCode(
                              color: AppColors.primary,
                              fontWeight: FontWeight.bold,
                              fontSize: 14,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 12),
                OutlinedButton.icon(
                  style: OutlinedButton.styleFrom(
                    backgroundColor: AppColors.surfaceContainerHigh,
                    minimumSize: const Size(double.infinity, 44),
                  ),
                  icon: const Icon(Icons.swap_horiz, size: 18),
                  label: Text('${l10n.translate('compareBids')} (6)'),
                  onPressed: () {
                    Navigator.of(context).push(
                      MaterialPageRoute(
                        builder: (_) => const BidsComparisonScreen(),
                      ),
                    );
                  },
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),

          // Non-Custodial Ledger Summary
          Container(
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
                      child: Row(
                        children: [
                          const Icon(Icons.lock_outline, size: 18, color: AppColors.textSecondary),
                          const SizedBox(width: 6),
                          Expanded(
                            child: Text(
                              l10n.translate('nonCustodialLedger'),
                              style: AppTypography.titleMedium(),
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 8),
                    Text(
                      'SYNCED',
                      style: AppTypography.telematicCode(
                        color: AppColors.secondary,
                        fontWeight: FontWeight.bold,
                        fontSize: 11,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                      child: Container(
                        padding: const EdgeInsets.all(10),
                        decoration: BoxDecoration(
                          color: AppColors.surfaceContainerLow,
                          borderRadius: AppShapes.roundedMedium,
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(l10n.translate('pendingClearance'), style: AppTypography.labelSmall(fontSize: 10)),
                            const SizedBox(height: 4),
                            Text('PKR 95,000', style: AppTypography.telematicCode(fontSize: 13)),
                            const SizedBox(height: 2),
                            Text('1 load in gate check', style: AppTypography.bodySmall(fontSize: 10)),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Container(
                        padding: const EdgeInsets.all(10),
                        decoration: BoxDecoration(
                          color: AppColors.surfaceContainerLow,
                          borderRadius: AppShapes.roundedMedium,
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(l10n.translate('recordedSettled'), style: AppTypography.labelSmall(fontSize: 10)),
                            const SizedBox(height: 4),
                            Text(
                              'PKR 380,000',
                              style: AppTypography.telematicCode(
                                color: AppColors.secondary,
                                fontSize: 13,
                              ),
                            ),
                            const SizedBox(height: 2),
                            Text('POD confirmed', style: AppTypography.bodySmall(fontSize: 10)),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      'Hash: 8f4b...c912',
                      style: AppTypography.telematicCode(
                        color: AppColors.textMuted,
                        fontSize: 11,
                      ),
                    ),
                    InkWell(
                      onTap: () => state.setNavIndex(3),
                      child: Row(
                        children: [
                          Text(
                            l10n.translate('viewStatements'),
                            style: AppTypography.labelSmall(color: AppColors.primary).copyWith(
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                          const Icon(Icons.chevron_right, size: 16, color: AppColors.primary),
                        ],
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),
        ],
      ),
    );
  }
}
