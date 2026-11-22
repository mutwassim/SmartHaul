import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:provider/provider.dart';

import '../../common/widgets/error_banner.dart';
import '../../common/widgets/smart_haul_app_bar.dart';
import '../../core/constants/freight_catalog.dart';
import '../../core/localization/app_localizations.dart';
import '../../core/repositories/shipment_repository.dart';
import '../../core/state/cargo_provider.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_shapes.dart';
import '../../core/theme/app_typography.dart';

/// Create a shipment, preview its route, then save it as a draft or publish it
/// (FR-CO-2 to FR-CO-5).
class CreateShipmentScreen extends StatefulWidget {
  const CreateShipmentScreen({super.key});

  @override
  State<CreateShipmentScreen> createState() => _CreateShipmentScreenState();
}

class _CreateShipmentScreenState extends State<CreateShipmentScreen> {
  final _formKey = GlobalKey<FormState>();
  final _pickupHub = TextEditingController();
  final _dropoffHub = TextEditingController();
  final _weight = TextEditingController();

  CityPoint _pickupCity = FreightCatalog.cities[0];
  CityPoint _dropoffCity = FreightCatalog.cities[1];
  VehicleSpec _vehicle = FreightCatalog.vehicles[2];
  String? _cargo;
  DateTime? _deliveryDate;

  /// Pickup taken from the phone's position instead of the city's centre (FR-CO-2).
  double? _gpsLat;
  double? _gpsLng;

  @override
  void initState() {
    super.initState();
    _cargo = _vehicle.compatibleCargos.first;
    WidgetsBinding.instance.addPostFrameCallback((_) => context.read<CargoProvider>().clearRoutePreview());
  }

  @override
  void dispose() {
    _pickupHub.dispose();
    _dropoffHub.dispose();
    _weight.dispose();
    super.dispose();
  }

  NewShipment _build() => NewShipment(
        pickupAddress: '${_pickupHub.text.trim()}, ${_pickupCity.name}',
        pickupLat: _gpsLat ?? _pickupCity.lat,
        pickupLng: _gpsLng ?? _pickupCity.lng,
        dropoffAddress: '${_dropoffHub.text.trim()}, ${_dropoffCity.name}',
        dropoffLat: _dropoffCity.lat,
        dropoffLng: _dropoffCity.lng,
        cargoType: _cargo!,
        cargoWeight: double.parse(_weight.text),
        requiredVehicleType: _vehicle.code,
        expectedDeliveryDate: _deliveryDate!,
      );

  Future<void> _preview() => context.read<CargoProvider>().previewRoute(
        pickupLat: _gpsLat ?? _pickupCity.lat,
        pickupLng: _gpsLng ?? _pickupCity.lng,
        dropoffLat: _dropoffCity.lat,
        dropoffLng: _dropoffCity.lng,
      );

  Future<void> _useCurrentLocation() async {
    final l10n = AppLocalizations.of(context);
    final messenger = ScaffoldMessenger.of(context);
    final cargo = context.read<CargoProvider>();
    try {
      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) permission = await Geolocator.requestPermission();
      if (!await Geolocator.isLocationServiceEnabled() ||
          permission == LocationPermission.denied ||
          permission == LocationPermission.deniedForever) {
        messenger.showSnackBar(SnackBar(content: Text(l10n.translate('locationUnavailable'))));
        return;
      }
      final position = await Geolocator.getCurrentPosition(locationSettings: const LocationSettings(accuracy: LocationAccuracy.high));
      if (!mounted) return;
      setState(() {
        _gpsLat = position.latitude;
        _gpsLng = position.longitude;
      });
      cargo.clearRoutePreview();
      messenger.showSnackBar(SnackBar(content: Text(l10n.translate('locationFilled'))));
    } catch (_) {
      messenger.showSnackBar(SnackBar(content: Text(l10n.translate('locationUnavailable'))));
    }
  }

  Future<void> _pickDate() async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: _deliveryDate ?? now.add(const Duration(days: 2)),
      firstDate: now,
      lastDate: now.add(const Duration(days: 365)),
    );
    if (picked != null) setState(() => _deliveryDate = picked);
  }

  Future<void> _submit({required bool publish}) async {
    final l10n = AppLocalizations.of(context);
    if (!_formKey.currentState!.validate()) return;
    if (_deliveryDate == null) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(l10n.translate('chooseDeliveryDate'))));
      return;
    }
    final cargo = context.read<CargoProvider>();
    final messenger = ScaffoldMessenger.of(context);
    final ok = await cargo.create(_build(), publish: publish);
    if (!mounted || !ok) return;
    messenger.showSnackBar(SnackBar(content: Text(l10n.translate(publish ? 'shipmentPublished' : 'draftSaved'))));
    Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final cargo = context.watch<CargoProvider>();
    final preview = cargo.routePreview;

    return Scaffold(
      appBar: SmartHaulAppBar(title: l10n.translate('newShipmentTitle'), showBackButton: true),
      body: SafeArea(
        child: Form(
          key: _formKey,
          child: ListView(
            padding: AppShapes.screenPadding,
            children: [
              _cityPicker(l10n.translate('pickupCity'), _pickupCity, (c) => setState(() {
                    _pickupCity = c;
                    _gpsLat = null;
                    _gpsLng = null;
                  })),
              _text(_pickupHub, l10n.translate('pickupAddress')),
              Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: OutlinedButton.icon(
                  icon: Icon(_gpsLat == null ? Icons.my_location : Icons.check_circle),
                  label: Text(l10n.translate(_gpsLat == null ? 'useMyLocation' : 'locationFilled')),
                  onPressed: _useCurrentLocation,
                ),
              ),
              _cityPicker(l10n.translate('dropoffCity'), _dropoffCity, (c) => setState(() => _dropoffCity = c)),
              _text(_dropoffHub, l10n.translate('dropoffAddress')),
              DropdownButtonFormField<VehicleSpec>(
                value: _vehicle,
                decoration: InputDecoration(labelText: l10n.translate('vehicleRequired'), border: const OutlineInputBorder()),
                isExpanded: true,
                items: [
                  for (final v in FreightCatalog.vehicles) DropdownMenuItem(value: v, child: Text(v.label, overflow: TextOverflow.ellipsis)),
                ],
                onChanged: (v) => setState(() {
                  _vehicle = v!;
                  _cargo = _vehicle.compatibleCargos.first;
                }),
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                key: ValueKey(_vehicle.code),
                value: _cargo,
                decoration: InputDecoration(labelText: l10n.translate('cargoType'), border: const OutlineInputBorder()),
                isExpanded: true,
                items: [
                  for (final c in _vehicle.compatibleCargos) DropdownMenuItem(value: c, child: Text(FreightCatalog.cargoLabel(c))),
                ],
                onChanged: (c) => setState(() => _cargo = c),
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _weight,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                decoration: InputDecoration(
                  labelText: '${l10n.translate('weightTonnes')} (${_vehicle.minCapacity}–${_vehicle.maxCapacity})',
                  border: const OutlineInputBorder(),
                ),
                validator: (value) {
                  final weight = double.tryParse(value ?? '');
                  if (weight == null || weight <= 0 || weight > _vehicle.maxCapacity) {
                    return '${l10n.translate('weightRange')} ${_vehicle.maxCapacity} MT';
                  }
                  return null;
                },
              ),
              const SizedBox(height: 12),
              OutlinedButton.icon(
                icon: const Icon(Icons.event),
                label: Text(_deliveryDate == null
                    ? l10n.translate('expectedDelivery')
                    : _deliveryDate!.toIso8601String().substring(0, 10)),
                onPressed: _pickDate,
              ),
              const SizedBox(height: 12),
              OutlinedButton.icon(
                icon: const Icon(Icons.alt_route),
                label: Text(l10n.translate('previewRoute')),
                onPressed: cargo.isLoading ? null : _preview,
              ),
              if (preview != null)
                Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: Text(
                    '${preview.distanceKm.toStringAsFixed(0)} km · ${preview.durationMinutes ~/ 60} h ${preview.durationMinutes % 60} min'
                    '${preview.isApproximate ? ' (${l10n.translate('approximate')})' : ''}',
                    style: AppTypography.titleMedium(color: AppColors.primary),
                  ),
                ),
              const SizedBox(height: 16),
              if (cargo.error != null) ErrorBanner(message: cargo.error!),
              ElevatedButton(
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.primary,
                  foregroundColor: AppColors.onPrimary,
                  minimumSize: const Size(double.infinity, AppShapes.dominantActionHeight),
                ),
                onPressed: cargo.isLoading ? null : () => _submit(publish: true),
                child: Text(l10n.translate('publishRequisition')),
              ),
              const SizedBox(height: 8),
              OutlinedButton(
                onPressed: cargo.isLoading ? null : () => _submit(publish: false),
                child: Text(l10n.translate('saveDraft')),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _text(TextEditingController controller, String label) => Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: TextFormField(
          controller: controller,
          decoration: InputDecoration(labelText: label, border: const OutlineInputBorder()),
          validator: (v) => (v == null || v.trim().length < 3) ? AppLocalizations.of(context).translate('fieldRequired') : null,
        ),
      );

  Widget _cityPicker(String label, CityPoint value, ValueChanged<CityPoint> onChanged) => Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: DropdownButtonFormField<CityPoint>(
          value: value,
          decoration: InputDecoration(labelText: label, border: const OutlineInputBorder()),
          items: [for (final c in FreightCatalog.cities) DropdownMenuItem(value: c, child: Text(c.name))],
          onChanged: (c) {
            onChanged(c!);
            context.read<CargoProvider>().clearRoutePreview();
          },
        ),
      );
}
