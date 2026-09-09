import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/constants/app_constants.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_typography.dart';
import '../../core/services/app_state_provider.dart';
import '../../core/localization/app_localizations.dart';

class SmartHaulBottomNav extends StatelessWidget {
  final VoidCallback? onCenterActionPressed;

  const SmartHaulBottomNav({
    super.key,
    this.onCenterActionPressed,
  });

  @override
  Widget build(BuildContext context) {
    final state = Provider.of<AppStateProvider>(context);
    final l10n = AppLocalizations.of(context);
    final isCargoOwner = state.currentRole == UserRole.cargoOwner;

    return Container(
      decoration: BoxDecoration(
        color: AppColors.surfaceContainerLowest.withValues(alpha: 0.95),
        boxShadow: const [
          BoxShadow(
            color: Color.fromRGBO(0, 0, 0, 0.06),
            offset: Offset(0, -2),
            blurRadius: 12,
          ),
        ],
        border: const Border(
          top: BorderSide(color: AppColors.outlineVariant, width: 0.8),
        ),
      ),
      child: SafeArea(
        top: false,
        child: SizedBox(
          height: 68,
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceAround,
            children: [
              _buildNavItem(
                context,
                index: 0,
                icon: Icons.dashboard_outlined,
                activeIcon: Icons.dashboard,
                label: l10n.translate('navHome'),
                isSelected: state.selectedNavIndex == 0,
                onTap: () => state.setNavIndex(0),
              ),
              _buildNavItem(
                context,
                index: 1,
                icon: Icons.inventory_2_outlined,
                activeIcon: Icons.inventory_2,
                label: l10n.translate('navLoads'),
                isSelected: state.selectedNavIndex == 1,
                onTap: () => state.setNavIndex(1),
              ),
              // Center Action FAB
              GestureDetector(
                onTap: onCenterActionPressed ?? () => state.setNavIndex(isCargoOwner ? 1 : 2),
                child: Container(
                  width: 50,
                  height: 50,
                  margin: const EdgeInsets.only(bottom: 6),
                  decoration: const BoxDecoration(
                    color: AppColors.primary,
                    shape: BoxShape.circle,
                    boxShadow: [
                      BoxShadow(
                        color: Color.fromRGBO(15, 41, 66, 0.35),
                        offset: Offset(0, 4),
                        blurRadius: 10,
                      ),
                    ],
                  ),
                  child: Icon(
                    isCargoOwner ? Icons.add : Icons.explore,
                    color: AppColors.onPrimary,
                    size: 26,
                  ),
                ),
              ),
              _buildNavItem(
                context,
                index: 2,
                icon: Icons.near_me_outlined,
                activeIcon: Icons.near_me,
                label: l10n.translate('navTracking'),
                isSelected: state.selectedNavIndex == 2,
                onTap: () => state.setNavIndex(2),
              ),
              _buildNavItem(
                context,
                index: 3,
                icon: Icons.receipt_long_outlined,
                activeIcon: Icons.receipt_long,
                label: l10n.translate('navLedger'),
                isSelected: state.selectedNavIndex == 3,
                onTap: () => state.setNavIndex(3),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildNavItem(
    BuildContext context, {
    required int index,
    required IconData icon,
    required IconData activeIcon,
    required String label,
    required bool isSelected,
    required VoidCallback onTap,
  }) {
    final color = isSelected ? AppColors.primary : AppColors.textSecondary;

    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Container(
        constraints: const BoxConstraints(minWidth: 56, minHeight: 48),
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              isSelected ? activeIcon : icon,
              color: color,
              size: 22,
            ),
            const SizedBox(height: 3),
            Text(
              label,
              style: AppTypography.labelSmall(color: color).copyWith(
                fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
                fontSize: 10,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
