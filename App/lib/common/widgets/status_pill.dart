import 'package:flutter/material.dart';
import '../../core/constants/app_constants.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_typography.dart';
import '../../core/theme/app_shapes.dart';

class StatusPill extends StatelessWidget {
  final ShipmentStatus status;
  final String? customText;

  const StatusPill({
    super.key,
    required this.status,
    this.customText,
  });

  @override
  Widget build(BuildContext context) {
    Color bg;
    Color fg;
    IconData icon;
    String label;

    switch (status) {
      case ShipmentStatus.inTransit:
        bg = AppColors.secondaryContainer;
        fg = AppColors.onSecondaryContainer;
        icon = Icons.local_shipping;
        label = customText ?? 'IN TRANSIT';
        break;
      case ShipmentStatus.loaded:
        bg = AppColors.secondaryContainer;
        fg = AppColors.onSecondaryContainer;
        icon = Icons.inventory_2;
        label = customText ?? 'CARGO LOADED';
        break;
      case ShipmentStatus.atPickup:
        bg = AppColors.tertiaryContainer;
        fg = AppColors.onTertiaryContainer;
        icon = Icons.schedule;
        label = customText ?? 'AT PICKUP';
        break;
      case ShipmentStatus.atDestination:
        bg = AppColors.primaryContainer;
        fg = AppColors.primary;
        icon = Icons.location_on;
        label = customText ?? 'AT DESTINATION';
        break;
      case ShipmentStatus.delivered:
      case ShipmentStatus.completed:
        bg = AppColors.secondaryFixed;
        fg = AppColors.onSecondaryContainer;
        icon = Icons.check_circle;
        label = customText ?? 'DELIVERED';
        break;
      case ShipmentStatus.pending:
        bg = AppColors.tertiaryContainer;
        fg = AppColors.onTertiaryContainer;
        icon = Icons.gavel;
        label = customText ?? 'ACTIVE TENDER';
        break;
      case ShipmentStatus.assigned:
      case ShipmentStatus.accepted:
        bg = AppColors.primaryContainer;
        fg = AppColors.onPrimaryContainer;
        icon = Icons.assignment_turned_in;
        label = customText ?? 'BOOKED';
        break;
      case ShipmentStatus.cancelled:
        bg = AppColors.errorContainer;
        fg = AppColors.onErrorContainer;
        icon = Icons.cancel;
        label = customText ?? 'CANCELLED';
        break;
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: AppShapes.roundedPill,
        border: Border.all(color: fg.withValues(alpha: 0.3), width: 1),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: fg),
          const SizedBox(width: 4),
          Text(
            label,
            style: AppTypography.labelSmall(color: fg).copyWith(
              fontWeight: FontWeight.w700,
              letterSpacing: 0.5,
            ),
          ),
        ],
      ),
    );
  }
}
