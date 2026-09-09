import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/constants/app_constants.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_typography.dart';
import '../../core/theme/app_shapes.dart';
import '../../core/services/app_state_provider.dart';

class SmartHaulAppBar extends StatelessWidget implements PreferredSizeWidget {
  final String title;
  final bool showBackButton;
  final VoidCallback? onBackPressed;
  final List<Widget>? actions;

  const SmartHaulAppBar({
    super.key,
    required this.title,
    this.showBackButton = false,
    this.onBackPressed,
    this.actions,
  });

  @override
  Size get preferredSize => const Size.fromHeight(64);

  @override
  Widget build(BuildContext context) {
    final state = Provider.of<AppStateProvider>(context);
    final isUrdu = state.isUrdu;

    return AppBar(
      backgroundColor: AppColors.primary,
      elevation: 0,
      automaticallyImplyLeading: false,
      titleSpacing: 16,
      toolbarHeight: 64,
      title: Row(
        children: [
          if (showBackButton)
            IconButton(
              icon: Icon(
                isUrdu ? Icons.arrow_forward : Icons.arrow_back,
                color: AppColors.onPrimary,
              ),
              onPressed: onBackPressed ?? () => Navigator.of(context).pop(),
            )
          else ...[
            // SmartHaul Icon mark
            Container(
              width: 34,
              height: 34,
              decoration: BoxDecoration(
                color: AppColors.primaryContainer.withValues(alpha: 0.2),
                borderRadius: AppShapes.roundedMedium,
              ),
              child: const Icon(
                Icons.local_shipping,
                color: AppColors.secondaryFixed,
                size: 20,
              ),
            ),
            const SizedBox(width: 8),
          ],
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Row(
                  children: [
                    Text(
                      AppConstants.appName,
                      style: AppTypography.labelSmall(
                        color: AppColors.primaryFixedDim,
                      ).copyWith(letterSpacing: 1.2),
                    ),
                    const SizedBox(width: 6),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 6,
                        vertical: 1,
                      ),
                      decoration: BoxDecoration(
                        color: AppColors.secondary,
                        borderRadius: AppShapes.roundedPill,
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Container(
                            width: 5,
                            height: 5,
                            decoration: const BoxDecoration(
                              color: AppColors.secondaryFixed,
                              shape: BoxShape.circle,
                            ),
                          ),
                          const SizedBox(width: 3),
                          Text(
                            isUrdu ? 'آن لائن' : 'Online',
                            style: const TextStyle(
                              color: AppColors.onSecondary,
                              fontSize: 9,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                Text(
                  title,
                  style: isUrdu
                      ? AppTypography.urduTitle(color: AppColors.onPrimary)
                      : AppTypography.titleMedium(color: AppColors.onPrimary),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
        ],
      ),
      actions: [
        if (actions != null) ...actions!,
        // Language Toggle
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 12),
          child: Material(
            color: AppColors.primaryDark,
            borderRadius: AppShapes.roundedMedium,
            child: InkWell(
              borderRadius: AppShapes.roundedMedium,
              onTap: () => state.toggleLanguage(),
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 10),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      'ENG',
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: isUrdu ? FontWeight.normal : FontWeight.bold,
                        color: isUrdu
                            ? AppColors.primaryFixedDim
                            : AppColors.onPrimary,
                      ),
                    ),
                    const Padding(
                      padding: EdgeInsets.symmetric(horizontal: 4),
                      child: Text(
                        '|',
                        style: TextStyle(color: AppColors.outline, fontSize: 10),
                      ),
                    ),
                    Text(
                      'اردو',
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: isUrdu ? FontWeight.bold : FontWeight.normal,
                        color: isUrdu
                            ? AppColors.onPrimary
                            : AppColors.primaryFixedDim,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
        const SizedBox(width: 8),
        // Role Switcher Avatar
        Padding(
          padding: const EdgeInsets.only(right: 16, top: 12, bottom: 12),
          child: PopupMenuButton<UserRole>(
            tooltip: 'Switch User Mode',
            offset: const Offset(0, 48),
            shape: RoundedRectangleBorder(borderRadius: AppShapes.roundedLarge),
            onSelected: (role) => state.setRole(role),
            itemBuilder: (context) => [
              PopupMenuItem(
                value: UserRole.cargoOwner,
                child: Row(
                  children: [
                    Icon(
                      Icons.factory,
                      color: state.currentRole == UserRole.cargoOwner
                          ? AppColors.primary
                          : AppColors.textSecondary,
                    ),
                    const SizedBox(width: 10),
                    const Text('Cargo Owner (کارگو مالک)'),
                  ],
                ),
              ),
              PopupMenuItem(
                value: UserRole.driver,
                child: Row(
                  children: [
                    Icon(
                      Icons.local_shipping,
                      color: state.currentRole == UserRole.driver
                          ? AppColors.primary
                          : AppColors.textSecondary,
                    ),
                    const SizedBox(width: 10),
                    const Text('Truck Driver (ٹرک ڈرائیور)'),
                  ],
                ),
              ),
            ],
            child: Container(
              width: 38,
              height: 38,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                border: Border.all(color: AppColors.primaryFixedDim, width: 1.5),
                color: AppColors.primaryDark,
              ),
              child: Center(
                child: Icon(
                  state.currentRole == UserRole.cargoOwner
                      ? Icons.business
                      : Icons.person,
                  color: AppColors.onPrimary,
                  size: 20,
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }
}
