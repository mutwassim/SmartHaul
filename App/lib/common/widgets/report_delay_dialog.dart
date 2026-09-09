import 'package:flutter/material.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_typography.dart';
import '../../core/theme/app_shapes.dart';

class ReportDelayDialog extends StatefulWidget {
  const ReportDelayDialog({super.key});

  @override
  State<ReportDelayDialog> createState() => _ReportDelayDialogState();
}

class _ReportDelayDialogState extends State<ReportDelayDialog> {
  String _selectedReason = 'Severe Highway Traffic / Fog';
  final List<String> _reasons = [
    'Severe Highway Traffic / Fog',
    'Weighbridge Queue / Scale Inspection',
    'Tire Puncture / Mechanical Check',
    'Toll Plaza Congestion',
    'Customer Gate Check Waiting',
  ];

  @override
  Widget build(BuildContext context) {
    return Dialog(
      shape: RoundedRectangleBorder(borderRadius: AppShapes.roundedLarge),
      backgroundColor: AppColors.surfaceContainerLowest,
      child: Padding(
        padding: const EdgeInsets.all(20.0),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(
                    color: AppColors.tertiaryContainer,
                    borderRadius: AppShapes.roundedMedium,
                  ),
                  child: const Center(
                    child: Icon(
                      Icons.timer_off,
                      color: AppColors.tertiary,
                      size: 24,
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Report Delay (تاخیر کی اطلاع)',
                        style: AppTypography.titleMedium(),
                      ),
                      Text(
                        'Updates ETA and informs Shipper automatically',
                        style: AppTypography.bodySmall(fontSize: 11),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            Text(
              'Select Cause:',
              style: AppTypography.labelMedium(),
            ),
            const SizedBox(height: 8),
            ..._reasons.map((reason) {
              final isSelected = _selectedReason == reason;
              return Container(
                margin: const EdgeInsets.only(bottom: 6),
                decoration: BoxDecoration(
                  color: isSelected
                      ? AppColors.primaryContainer.withValues(alpha: 0.5)
                      : AppColors.surfaceContainerLow,
                  borderRadius: AppShapes.roundedMedium,
                  border: Border.all(
                    color: isSelected ? AppColors.primary : AppColors.outlineVariant,
                  ),
                ),
                child: RadioListTile<String>(
                  dense: true,
                  value: reason,
                  groupValue: _selectedReason,
                  title: Text(
                    reason,
                    style: AppTypography.bodySmall(
                      color: isSelected ? AppColors.textPrimary : AppColors.textSecondary,
                    ),
                  ),
                  activeColor: AppColors.primary,
                  onChanged: (val) {
                    if (val != null) {
                      setState(() => _selectedReason = val);
                    }
                  },
                ),
              );
            }),
            const SizedBox(height: 16),
            ElevatedButton(
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.primary,
                foregroundColor: AppColors.onPrimary,
                minimumSize: const Size(double.infinity, 48),
              ),
              onPressed: () {
                Navigator.of(context).pop();
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(
                    content: Text('⚠️ Delay reported: "$_selectedReason". Shipper dispatch desk notified.'),
                    backgroundColor: AppColors.primaryDark,
                  ),
                );
              },
              child: const Text('SUBMIT DELAY LOG'),
            ),
          ],
        ),
      ),
    );
  }
}
