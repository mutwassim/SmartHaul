import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_typography.dart';
import '../../core/theme/app_shapes.dart';
import '../../core/services/app_state_provider.dart';
import '../../core/models/bid_model.dart';
import '../../common/widgets/smart_haul_app_bar.dart';

class BidsComparisonScreen extends StatelessWidget {
  const BidsComparisonScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final state = Provider.of<AppStateProvider>(context);
    final tenderShipment = state.shipments.firstWhere(
      (s) => s.id == 'shp_2055',
      orElse: () => state.shipments.first,
    );

    return Scaffold(
      appBar: const SmartHaulAppBar(
        title: 'Compare Carrier Proposals',
        showBackButton: true,
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: AppShapes.screenPadding,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Tender Summary Card
              Container(
                padding: AppShapes.cardPadding,
                decoration: BoxDecoration(
                  color: AppColors.primary,
                  borderRadius: AppShapes.roundedLarge,
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(
                          'TENDER ${tenderShipment.trackingNumber}',
                          style: AppTypography.telematicCode(
                            color: AppColors.secondaryFixed,
                            fontSize: 12,
                          ),
                        ),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                          decoration: BoxDecoration(
                            color: AppColors.secondary,
                            borderRadius: AppShapes.roundedPill,
                          ),
                          child: Text(
                            '${tenderShipment.bids.length} Bids Active',
                            style: const TextStyle(
                              color: AppColors.onSecondary,
                              fontSize: 11,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Text(
                      tenderShipment.cargoTitle,
                      style: AppTypography.titleLarge(color: AppColors.onPrimary),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      '${tenderShipment.originCity} → ${tenderShipment.destinationCity} (${tenderShipment.totalDistanceKm.toInt()} km)',
                      style: AppTypography.bodySmall(color: AppColors.primaryFixedDim),
                    ),
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        const Icon(Icons.scale, color: AppColors.secondaryFixed, size: 16),
                        const SizedBox(width: 4),
                        Text(
                          '${tenderShipment.weightTonnes} MT • ${tenderShipment.vehicleRequired}',
                          style: AppTypography.telematicCode(
                            color: AppColors.onPrimary,
                            fontSize: 11,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),

              Text(
                'Received Proposals (Sorted by Price & Rating)',
                style: AppTypography.titleMedium(),
              ),
              const SizedBox(height: 10),

              // Bids List
              ...tenderShipment.bids.map((bid) => _buildBidItem(context, state, tenderShipment.id, bid)),

              const SizedBox(height: 20),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildBidItem(
    BuildContext context,
    AppStateProvider state,
    String shipmentId,
    BidModel bid,
  ) {
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
        boxShadow: bid.isLowestBid ? AppColors.cardShadow : null,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                children: [
                  CircleAvatar(
                    radius: 18,
                    backgroundColor: AppColors.primary,
                    child: Text(
                      bid.bidderName.substring(0, 1),
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Text(
                            bid.bidderName,
                            style: AppTypography.titleMedium(),
                          ),
                          if (bid.isVerified) ...[
                            const SizedBox(width: 4),
                            const Icon(Icons.verified, color: AppColors.secondary, size: 16),
                          ],
                        ],
                      ),
                      Text(
                        bid.bidderCompany,
                        style: AppTypography.bodySmall(fontSize: 11),
                      ),
                    ],
                  ),
                ],
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    'Rs. ${bid.amount.toInt().toString().replaceAllMapped(RegExp(r'(\d{1,3})(?=(\d{3})+(?!\d))'), (Match m) => '${m[1]},')}',
                    style: AppTypography.telematicCode(
                      color: bid.isLowestBid ? AppColors.secondary : AppColors.primary,
                      fontSize: 16,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  if (bid.isLowestBid)
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                      decoration: BoxDecoration(
                        color: AppColors.secondaryContainer,
                        borderRadius: AppShapes.roundedSmall,
                      ),
                      child: Text(
                        'LOWEST PROPOSAL',
                        style: AppTypography.telematicCode(
                          color: AppColors.onSecondaryContainer,
                          fontSize: 9,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                ],
              ),
            ],
          ),
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
            decoration: BoxDecoration(
              color: AppColors.surfaceContainerLow,
              borderRadius: AppShapes.roundedMedium,
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Row(
                  children: [
                    const Icon(Icons.star, color: Colors.amber, size: 16),
                    const SizedBox(width: 4),
                    Text(
                      '${bid.bidderRating} (${bid.bidderTotalTrips} trips)',
                      style: AppTypography.labelSmall().copyWith(fontWeight: FontWeight.bold),
                    ),
                  ],
                ),
                Row(
                  children: [
                    const Icon(Icons.speed, color: AppColors.primary, size: 16),
                    const SizedBox(width: 4),
                    Text(
                      bid.estimatedDeliveryTime,
                      style: AppTypography.labelSmall(),
                    ),
                  ],
                ),
                Row(
                  children: [
                    const Icon(Icons.local_shipping, color: AppColors.textSecondary, size: 16),
                    const SizedBox(width: 4),
                    Text(
                      bid.vehiclePlate,
                      style: AppTypography.telematicCode(fontSize: 11),
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: bid.isLowestBid ? AppColors.secondary : AppColors.primary,
              foregroundColor: AppColors.onPrimary,
              minimumSize: const Size(double.infinity, 44),
            ),
            onPressed: () {
              state.acceptBid(shipmentId, bid.id);
              Navigator.of(context).pop();
              ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(
                  content: Text(
                    '🎉 Shipment awarded to ${bid.bidderName} for Rs. ${bid.amount.toInt()}! Driver assigned and notified.',
                  ),
                  backgroundColor: AppColors.secondary,
                ),
              );
            },
            child: const Text('ACCEPT & BOOK CARRIER'),
          ),
        ],
      ),
    );
  }
}
