import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_typography.dart';
import '../../core/theme/app_shapes.dart';
import '../../core/services/app_state_provider.dart';
import '../../core/models/shipment_model.dart';
import '../../common/widgets/smart_haul_app_bar.dart';

class AvailableLoadsScreen extends StatefulWidget {
  const AvailableLoadsScreen({super.key});

  @override
  State<AvailableLoadsScreen> createState() => _AvailableLoadsScreenState();
}

class _AvailableLoadsScreenState extends State<AvailableLoadsScreen> {
  String _selectedFilter = 'All';

  @override
  Widget build(BuildContext context) {
    final state = Provider.of<AppStateProvider>(context);
    final loads = state.marketplaceLoads;

    return Scaffold(
      appBar: const SmartHaulAppBar(
        title: 'Available Freight Marketplace',
        showBackButton: true,
      ),
      body: SafeArea(
        child: Column(
          children: [
            // Filter Chips Bar
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
              color: AppColors.surfaceContainerLowest,
              child: SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(
                  children: ['All', 'Flatbed', 'M-2 Corridor', 'Return Loads (Karachi)', 'Heavy (20T+)'].map((filter) {
                    final isSelected = _selectedFilter == filter;
                    return Padding(
                      padding: const EdgeInsets.only(right: 8.0),
                      child: FilterChip(
                        selected: isSelected,
                        label: Text(filter),
                        labelStyle: TextStyle(
                          color: isSelected ? AppColors.onPrimaryContainer : AppColors.textSecondary,
                          fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
                          fontSize: 12,
                        ),
                        selectedColor: AppColors.primaryContainer,
                        backgroundColor: AppColors.surfaceContainerLow,
                        side: BorderSide(
                          color: isSelected ? AppColors.primary : AppColors.outlineVariant,
                        ),
                        onSelected: (val) {
                          setState(() => _selectedFilter = filter);
                        },
                      ),
                    );
                  }).toList(),
                ),
              ),
            ),
            const Divider(height: 1),

            // Loads List
            Expanded(
              child: loads.isEmpty
                  ? Center(
                      child: Text(
                        'No additional matching loads at this moment.',
                        style: AppTypography.bodyMedium(),
                      ),
                    )
                  : ListView.builder(
                      padding: AppShapes.screenPadding,
                      itemCount: loads.length,
                      itemBuilder: (context, index) {
                        final load = loads[index];
                        return _buildLoadCard(context, state, load);
                      },
                    ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildLoadCard(
    BuildContext context,
    AppStateProvider state,
    ShipmentModel load,
  ) {
    return Container(
      margin: const EdgeInsets.only(bottom: 14),
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
                      color: AppColors.primaryContainer,
                      borderRadius: AppShapes.roundedSmall,
                    ),
                    child: Text(
                      load.trackingNumber,
                      style: AppTypography.telematicCode(fontSize: 11),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Text(
                    '${load.originCity} → ${load.destinationCity}',
                    style: AppTypography.titleMedium(),
                  ),
                ],
              ),
              Text(
                'Rs. ${load.agreedFare.toInt().toString().replaceAllMapped(RegExp(r'(\d{1,3})(?=(\d{3})+(?!\d))'), (Match m) => '${m[1]},')}',
                style: AppTypography.telematicCode(
                  color: AppColors.primary,
                  fontWeight: FontWeight.bold,
                  fontSize: 15,
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            '${load.totalDistanceKm.toInt()} km • ${load.cargoTitle} (${load.cargoCategory})',
            style: AppTypography.bodySmall(),
          ),
          const SizedBox(height: 10),
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: AppColors.surfaceContainerLow,
              borderRadius: AppShapes.roundedMedium,
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Row(
                  children: [
                    const Icon(Icons.scale, size: 16, color: AppColors.textSecondary),
                    const SizedBox(width: 4),
                    Text('${load.weightTonnes} MT', style: AppTypography.labelSmall()),
                  ],
                ),
                Row(
                  children: [
                    const Icon(Icons.local_shipping, size: 16, color: AppColors.textSecondary),
                    const SizedBox(width: 4),
                    Text(load.vehicleRequired, style: AppTypography.labelSmall()),
                  ],
                ),
                Row(
                  children: [
                    const Icon(Icons.route, size: 16, color: AppColors.textSecondary),
                    const SizedBox(width: 4),
                    Text(load.routeHighway, style: AppTypography.labelSmall()),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: ElevatedButton.icon(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.primary,
                    foregroundColor: AppColors.onPrimary,
                    minimumSize: const Size(0, 44),
                  ),
                  icon: const Icon(Icons.check, size: 18),
                  label: const Text('Instant Accept'),
                  onPressed: () {
                    state.instantAcceptMarketplaceLoad(load.id);
                    Navigator.of(context).pop();
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(
                        content: Text('🎉 Load ${load.trackingNumber} Accepted! Added to Active Assignment.'),
                        backgroundColor: AppColors.secondary,
                      ),
                    );
                  },
                ),
              ),
              const SizedBox(width: 8),
              OutlinedButton.icon(
                style: OutlinedButton.styleFrom(
                  minimumSize: const Size(0, 44),
                ),
                icon: const Icon(Icons.gavel, size: 18),
                label: const Text('Counter Bid'),
                onPressed: () {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      content: Text('Submitting counter proposal of Rs. 70,000 to Shipper...'),
                    ),
                  );
                },
              ),
            ],
          ),
        ],
      ),
    );
  }
}
