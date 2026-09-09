import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_typography.dart';
import '../../core/theme/app_shapes.dart';
import '../../core/services/app_state_provider.dart';
import '../../core/models/shipment_model.dart';
import '../../common/widgets/smart_haul_app_bar.dart';

class ProofOfDeliveryScreen extends StatefulWidget {
  final ShipmentModel shipment;

  const ProofOfDeliveryScreen({
    super.key,
    required this.shipment,
  });

  @override
  State<ProofOfDeliveryScreen> createState() => _ProofOfDeliveryScreenState();
}

class _ProofOfDeliveryScreenState extends State<ProofOfDeliveryScreen> {
  final bool _isBiltyUploaded = true;
  final bool _isCargoUnloadUploaded = true;
  final _receiverNameController = TextEditingController(text: 'Kamran Ashraf (Warehouse In-charge)');
  final _notesController = TextEditingController(text: 'Consignment received in intact seal condition. No physical damages observed.');

  @override
  void dispose() {
    _receiverNameController.dispose();
    _notesController.dispose();
    super.dispose();
  }

  void _submitDeliveryCompletion() {
    final state = Provider.of<AppStateProvider>(context, listen: false);
    state.advanceMilestone();

    Navigator.of(context).pop();
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        backgroundColor: AppColors.secondary,
        content: Text(
          '🎉 Delivery Confirmed! Proof of Delivery uploaded. Escrow settlement of Rs. ${widget.shipment.agreedFare.toInt()} cleared in Audit Ledger.',
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: const SmartHaulAppBar(
        title: 'Electronic Proof of Delivery (POD)',
        showBackButton: true,
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: AppShapes.screenPadding,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Shipment Reference Card
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
                          widget.shipment.trackingNumber,
                          style: AppTypography.telematicCode(
                            color: AppColors.secondaryFixed,
                            fontSize: 13,
                          ),
                        ),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                          decoration: BoxDecoration(
                            color: AppColors.secondary,
                            borderRadius: AppShapes.roundedPill,
                          ),
                          child: const Text(
                            'ARRIVED AT DESTINATION',
                            style: TextStyle(
                              color: Colors.white,
                              fontSize: 10,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Text(
                      widget.shipment.cargoTitle,
                      style: AppTypography.titleLarge(color: AppColors.onPrimary),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'Destination Hub: ${widget.shipment.destinationHub}',
                      style: AppTypography.bodySmall(color: AppColors.primaryFixedDim),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),

              Text('1. Upload Signed Bilty (LR) Document', style: AppTypography.titleMedium()),
              const SizedBox(height: 6),
              Container(
                padding: AppShapes.cardPadding,
                decoration: BoxDecoration(
                  color: AppColors.surfaceContainerLowest,
                  borderRadius: AppShapes.roundedLarge,
                  border: Border.all(
                    color: _isBiltyUploaded ? AppColors.secondary : AppColors.outlineVariant,
                    width: _isBiltyUploaded ? 1.5 : 1.0,
                  ),
                ),
                child: Row(
                  children: [
                    Container(
                      width: 48,
                      height: 48,
                      decoration: BoxDecoration(
                        color: AppColors.secondaryContainer,
                        borderRadius: AppShapes.roundedMedium,
                      ),
                      child: const Icon(
                        Icons.document_scanner,
                        color: AppColors.onSecondaryContainer,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('Bilty_LR_${widget.shipment.biltyNumber ?? "8820"}.jpg',
                              style: AppTypography.labelMedium().copyWith(fontWeight: FontWeight.bold)),
                          Text('Uploaded • GPS Stamp: Sector I-9 Dry Port',
                              style: AppTypography.bodySmall(fontSize: 11)),
                        ],
                      ),
                    ),
                    const Icon(Icons.check_circle, color: AppColors.secondary),
                  ],
                ),
              ),
              const SizedBox(height: 16),

              Text('2. Cargo Unloaded Photo Condition', style: AppTypography.titleMedium()),
              const SizedBox(height: 6),
              Container(
                padding: AppShapes.cardPadding,
                decoration: BoxDecoration(
                  color: AppColors.surfaceContainerLowest,
                  borderRadius: AppShapes.roundedLarge,
                  border: Border.all(
                    color: _isCargoUnloadUploaded ? AppColors.secondary : AppColors.outlineVariant,
                    width: _isCargoUnloadUploaded ? 1.5 : 1.0,
                  ),
                ),
                child: Row(
                  children: [
                    Container(
                      width: 48,
                      height: 48,
                      decoration: BoxDecoration(
                        color: AppColors.secondaryContainer,
                        borderRadius: AppShapes.roundedMedium,
                      ),
                      child: const Icon(
                        Icons.camera_alt,
                        color: AppColors.onSecondaryContainer,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('Unload_Verification_Photo.jpg',
                              style: AppTypography.labelMedium().copyWith(fontWeight: FontWeight.bold)),
                          Text('Uploaded • Timestamp: Today 5:42 PM',
                              style: AppTypography.bodySmall(fontSize: 11)),
                        ],
                      ),
                    ),
                    const Icon(Icons.check_circle, color: AppColors.secondary),
                  ],
                ),
              ),
              const SizedBox(height: 16),

              Text('3. Consignee Receiver Acknowledgment', style: AppTypography.titleMedium()),
              const SizedBox(height: 8),
              TextFormField(
                controller: _receiverNameController,
                decoration: const InputDecoration(
                  labelText: 'Receiver Name & Designation',
                  prefixIcon: Icon(Icons.badge),
                ),
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _notesController,
                maxLines: 2,
                decoration: const InputDecoration(
                  labelText: 'Delivery Remarks / Gate Pass Ref',
                  prefixIcon: Icon(Icons.notes),
                ),
              ),
              const SizedBox(height: 24),

              ElevatedButton.icon(
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.secondary,
                  foregroundColor: AppColors.onSecondary,
                  minimumSize: const Size(double.infinity, AppShapes.dominantActionHeight),
                ),
                icon: const Icon(Icons.check_circle_outline),
                label: const Text(
                  'CONFIRM DELIVERY & RELEASE ESCROW',
                  style: TextStyle(fontWeight: FontWeight.bold),
                ),
                onPressed: _submitDeliveryCompletion,
              ),
              const SizedBox(height: 24),
            ],
          ),
        ),
      ),
    );
  }
}
