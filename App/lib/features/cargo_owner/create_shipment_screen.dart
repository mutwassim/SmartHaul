import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_typography.dart';
import '../../core/theme/app_shapes.dart';
import '../../core/services/app_state_provider.dart';
import '../../core/localization/app_localizations.dart';
import '../../common/widgets/smart_haul_app_bar.dart';

class CreateShipmentScreen extends StatefulWidget {
  const CreateShipmentScreen({super.key});

  @override
  State<CreateShipmentScreen> createState() => _CreateShipmentScreenState();
}

class _CreateShipmentScreenState extends State<CreateShipmentScreen> {
  final _formKey = GlobalKey<FormState>();

  final _cargoTitleController = TextEditingController(text: 'Textile Fabric Bales & Yarn');
  final _originHubController = TextEditingController(text: 'Sundar Industrial Estate, Gate 2');
  final _destinationHubController = TextEditingController(text: 'I-9 Industrial Area Warehouse 4');
  final _targetFareController = TextEditingController(text: '95000');

  String _originCity = 'Lahore';
  String _destinationCity = 'Islamabad';
  String _cargoCategory = 'Textiles & Garments';
  String _vehicleRequired = '10-Wheeler Flatbed';
  String _routeHighway = 'M-2 Motorway';
  double _weightTonnes = 14.5;
  double _distanceKm = 376.0;

  final List<String> _cities = [
    'Lahore',
    'Islamabad',
    'Karachi',
    'Faisalabad',
    'Multan',
    'Rawalpindi',
    'Peshawar',
    'Gujranwala',
    'Sialkot',
    'Quetta',
    'Gwadar Port',
  ];

  final List<String> _categories = [
    'Textiles & Garments',
    'Machinery & Equipment',
    'Agricultural & Fertilizer',
    'Building Materials & Cement',
    'Steel & Metal Coils',
    'FMCG & Packaged Goods',
    'Chemicals & Industrial Liquids',
  ];

  final List<String> _vehicles = [
    '10-Wheeler Flatbed',
    '22-Wheeler Trailer',
    'Dry Box 40ft',
    'Lowbed Heavy Machinery',
    '6-Wheeler Mazda T3500',
    'Oil Tanker 40,000L',
  ];

  @override
  void dispose() {
    _cargoTitleController.dispose();
    _originHubController.dispose();
    _destinationHubController.dispose();
    _targetFareController.dispose();
    super.dispose();
  }

  void _calculateRouteDistance() {
    if (_originCity == 'Lahore' && _destinationCity == 'Islamabad') {
      _distanceKm = 376.0;
      _routeHighway = 'M-2 Motorway';
    } else if (_originCity == 'Multan' && _destinationCity == 'Karachi') {
      _distanceKm = 924.0;
      _routeHighway = 'M-5 / M-9 Motorway';
    } else if (_originCity == 'Rawalpindi' && _destinationCity == 'Peshawar') {
      _distanceKm = 174.0;
      _routeHighway = 'M-1 Motorway';
    } else if (_originCity == 'Karachi' && _destinationCity == 'Lahore') {
      _distanceKm = 1210.0;
      _routeHighway = 'N-5 / M-5 Highway';
    } else {
      _distanceKm = 240.0;
      _routeHighway = 'National Highway Network';
    }
  }

  void _handleSubmit() {
    if (_formKey.currentState?.validate() ?? false) {
      final state = Provider.of<AppStateProvider>(context, listen: false);
      final double fare = double.tryParse(_targetFareController.text) ?? 85000.0;

      state.createShipment(
        cargoTitle: _cargoTitleController.text,
        cargoCategory: _cargoCategory,
        weightTonnes: _weightTonnes,
        vehicleRequired: _vehicleRequired,
        originCity: _originCity,
        originHub: _originHubController.text,
        destinationCity: _destinationCity,
        destinationHub: _destinationHubController.text,
        targetRate: fare,
        routeHighway: _routeHighway,
        distanceKm: _distanceKm,
      );

      Navigator.of(context).pop();

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            '✅ Freight Requisition Published! Broadcasted to eligible verified $_vehicleRequired carriers.',
          ),
          backgroundColor: AppColors.secondary,
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);

    return Scaffold(
      appBar: SmartHaulAppBar(
        title: l10n.translate('newShipmentTitle'),
        showBackButton: true,
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: AppShapes.screenPadding,
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Post Freight Requisition',
                  style: AppTypography.headlineMedium(),
                ),
                Text(
                  'Broadcast your load parameters to verified heavy freight fleets and owner-operators across Pakistan.',
                  style: AppTypography.bodySmall(),
                ),
                const SizedBox(height: 16),

                // Origin & Destination Group Card
                Container(
                  padding: AppShapes.cardPadding,
                  decoration: BoxDecoration(
                    color: AppColors.surfaceContainerLowest,
                    borderRadius: AppShapes.roundedLarge,
                    border: Border.all(color: AppColors.outlineVariant),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          const Icon(Icons.pin_drop, color: AppColors.primary, size: 20),
                          const SizedBox(width: 8),
                          Text('Route Corridors', style: AppTypography.titleMedium()),
                        ],
                      ),
                      const SizedBox(height: 12),
                      Row(
                        children: [
                          Expanded(
                            child: DropdownButtonFormField<String>(
                              value: _originCity,
                              decoration: const InputDecoration(labelText: 'Origin City'),
                              items: _cities
                                  .map((c) => DropdownMenuItem(value: c, child: Text(c)))
                                  .toList(),
                              onChanged: (val) {
                                if (val != null) {
                                  setState(() {
                                    _originCity = val;
                                    _calculateRouteDistance();
                                  });
                                }
                              },
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: DropdownButtonFormField<String>(
                              value: _destinationCity,
                              decoration: const InputDecoration(labelText: 'Destination City'),
                              items: _cities
                                  .map((c) => DropdownMenuItem(value: c, child: Text(c)))
                                  .toList(),
                              onChanged: (val) {
                                if (val != null) {
                                  setState(() {
                                    _destinationCity = val;
                                    _calculateRouteDistance();
                                  });
                                }
                              },
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),
                      TextFormField(
                        controller: _originHubController,
                        decoration: const InputDecoration(
                          labelText: 'Pickup Loading Facility / Hub Address',
                          hintText: 'e.g. Sundar Industrial Estate, Gate 4',
                        ),
                        validator: (val) => val == null || val.isEmpty ? 'Required' : null,
                      ),
                      const SizedBox(height: 12),
                      TextFormField(
                        controller: _destinationHubController,
                        decoration: const InputDecoration(
                          labelText: 'Drop-off Consignee / Dry Port Address',
                          hintText: 'e.g. Sector I-9 Dry Port, Warehouse B',
                        ),
                        validator: (val) => val == null || val.isEmpty ? 'Required' : null,
                      ),
                      const SizedBox(height: 10),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                        decoration: BoxDecoration(
                          color: AppColors.surfaceContainerLow,
                          borderRadius: AppShapes.roundedSmall,
                        ),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Text(
                              'Computed Corridor: $_routeHighway',
                              style: AppTypography.telematicCode(fontSize: 11),
                            ),
                            Text(
                              '${_distanceKm.toStringAsFixed(0)} KM',
                              style: AppTypography.telematicCode(
                                color: AppColors.primary,
                                fontWeight: FontWeight.bold,
                                fontSize: 12,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 16),

                // Consignment Specifications Card
                Container(
                  padding: AppShapes.cardPadding,
                  decoration: BoxDecoration(
                    color: AppColors.surfaceContainerLowest,
                    borderRadius: AppShapes.roundedLarge,
                    border: Border.all(color: AppColors.outlineVariant),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          const Icon(Icons.inventory_2, color: AppColors.primary, size: 20),
                          const SizedBox(width: 8),
                          Text('Consignment Details', style: AppTypography.titleMedium()),
                        ],
                      ),
                      const SizedBox(height: 12),
                      TextFormField(
                        controller: _cargoTitleController,
                        decoration: const InputDecoration(
                          labelText: 'Cargo Title & Description',
                        ),
                        validator: (val) => val == null || val.isEmpty ? 'Required' : null,
                      ),
                      const SizedBox(height: 12),
                      DropdownButtonFormField<String>(
                        value: _cargoCategory,
                        decoration: const InputDecoration(labelText: 'Commodity Category'),
                        items: _categories
                            .map((c) => DropdownMenuItem(value: c, child: Text(c)))
                            .toList(),
                        onChanged: (val) {
                          if (val != null) setState(() => _cargoCategory = val);
                        },
                      ),
                      const SizedBox(height: 12),
                      DropdownButtonFormField<String>(
                        value: _vehicleRequired,
                        decoration: const InputDecoration(labelText: 'Trailer / Vehicle Specification'),
                        items: _vehicles
                            .map((v) => DropdownMenuItem(value: v, child: Text(v)))
                            .toList(),
                        onChanged: (val) {
                          if (val != null) setState(() => _vehicleRequired = val);
                        },
                      ),
                      const SizedBox(height: 14),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text('Weight (Metric Tonnes):', style: AppTypography.labelMedium()),
                          Text(
                            '${_weightTonnes.toStringAsFixed(1)} MT',
                            style: AppTypography.telematicCode(
                              color: AppColors.primary,
                              fontWeight: FontWeight.bold,
                              fontSize: 14,
                            ),
                          ),
                        ],
                      ),
                      Slider(
                        value: _weightTonnes,
                        min: 5.0,
                        max: 60.0,
                        divisions: 110,
                        label: '${_weightTonnes.toStringAsFixed(1)} MT',
                        activeColor: AppColors.primary,
                        onChanged: (val) => setState(() => _weightTonnes = val),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 16),

                // Financial Budget & Target Rate Card
                Container(
                  padding: AppShapes.cardPadding,
                  decoration: BoxDecoration(
                    color: AppColors.surfaceContainerLowest,
                    borderRadius: AppShapes.roundedLarge,
                    border: Border.all(color: AppColors.outlineVariant),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          const Icon(Icons.payments, color: AppColors.primary, size: 20),
                          const SizedBox(width: 8),
                          Text('Target Budget & Settlement', style: AppTypography.titleMedium()),
                        ],
                      ),
                      const SizedBox(height: 12),
                      TextFormField(
                        controller: _targetFareController,
                        keyboardType: TextInputType.number,
                        decoration: const InputDecoration(
                          labelText: 'Target Fare (PKR)',
                          prefixText: 'Rs. ',
                        ),
                        validator: (val) => val == null || val.isEmpty ? 'Required' : null,
                      ),
                      const SizedBox(height: 10),
                      Text(
                        'ℹ️ Carriers will submit competitive bids based on this target fare. You can compare bidder ratings, fleet age, and delivery speed before accepting.',
                        style: AppTypography.bodySmall(fontSize: 11),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 24),

                // Submit Button
                ElevatedButton.icon(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.primary,
                    foregroundColor: AppColors.onPrimary,
                    minimumSize: const Size(double.infinity, AppShapes.dominantActionHeight),
                  ),
                  icon: const Icon(Icons.send),
                  label: Text(
                    l10n.translate('publishRequisition'),
                    style: const TextStyle(fontWeight: FontWeight.bold),
                  ),
                  onPressed: _handleSubmit,
                ),
                const SizedBox(height: 24),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
