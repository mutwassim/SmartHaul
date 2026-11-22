import 'dart:io';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';

import '../../common/widgets/error_banner.dart';
import '../../common/widgets/smart_haul_app_bar.dart';
import '../../core/config/app_config.dart';
import '../../core/localization/app_localizations.dart';
import '../../core/state/driver_provider.dart';
import '../../core/theme/app_shapes.dart';

/// Photograph the delivery (1 to 5 images, 1 MB each), upload them, then mark
/// the trip Delivered (FR-DR-14, BR-15).
class ProofOfDeliveryScreen extends StatefulWidget {
  const ProofOfDeliveryScreen({super.key});

  @override
  State<ProofOfDeliveryScreen> createState() => _ProofOfDeliveryScreenState();
}

class _ProofOfDeliveryScreenState extends State<ProofOfDeliveryScreen> {
  static const int _maxBytes = 1024 * 1024;

  final _picker = ImagePicker();
  final _note = TextEditingController();
  final List<File> _images = [];
  String? _problem;

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  Future<void> _add(ImageSource source) async {
    final l10n = AppLocalizations.of(context);
    if (_images.length >= AppConfig.podMaxImages) return;
    // The picker shrinks the photograph so it stays under the 1 MB limit.
    final picked = await _picker.pickImage(
      source: source,
      maxWidth: AppConfig.podImageMaxWidth.toDouble(),
      imageQuality: AppConfig.podImageQuality,
    );
    if (picked == null) return;
    final file = File(picked.path);
    if (await file.length() > _maxBytes) {
      setState(() => _problem = l10n.translate('imageTooLarge'));
      return;
    }
    setState(() {
      _problem = null;
      _images.add(file);
    });
  }

  Future<void> _submit() async {
    final driver = context.read<DriverProvider>();
    final uploaded = await driver.uploadProof(_images, note: _note.text.trim());
    if (!uploaded) return;
    await driver.advance();
    if (mounted && driver.error == null) Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final driver = context.watch<DriverProvider>();
    final error = _problem ?? driver.error;

    return Scaffold(
      appBar: SmartHaulAppBar(title: l10n.translate('podTitle'), showBackButton: true),
      body: SafeArea(
        child: ListView(
          padding: AppShapes.screenPadding,
          children: [
            if (error != null) ErrorBanner(message: error),
            Wrap(spacing: 8, runSpacing: 8, children: [
              for (final image in _images)
                Stack(children: [
                  Image.file(image, width: 96, height: 96, fit: BoxFit.cover),
                  Positioned(
                    right: 0,
                    top: 0,
                    child: InkWell(
                      onTap: () => setState(() => _images.remove(image)),
                      child: const CircleAvatar(radius: 12, child: Icon(Icons.close, size: 14)),
                    ),
                  ),
                ]),
            ]),
            const SizedBox(height: 12),
            Row(children: [
              Expanded(
                child: OutlinedButton.icon(
                  icon: const Icon(Icons.photo_camera),
                  label: Text(l10n.translate('takePhoto')),
                  onPressed: _images.length >= AppConfig.podMaxImages ? null : () => _add(ImageSource.camera),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: OutlinedButton.icon(
                  icon: const Icon(Icons.photo_library),
                  label: Text(l10n.translate('fromGallery')),
                  onPressed: _images.length >= AppConfig.podMaxImages ? null : () => _add(ImageSource.gallery),
                ),
              ),
            ]),
            const SizedBox(height: 12),
            TextField(
              controller: _note,
              decoration: InputDecoration(labelText: l10n.translate('deliveryNote'), border: const OutlineInputBorder()),
            ),
            const SizedBox(height: 16),
            FilledButton(
              onPressed: driver.isLoading || _images.isEmpty ? null : _submit,
              child: Text(l10n.translate('confirmDeliveryCompletion')),
            ),
          ],
        ),
      ),
    );
  }
}
