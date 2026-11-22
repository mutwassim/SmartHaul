import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/constants/app_constants.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_typography.dart';
import '../../core/theme/app_shapes.dart';
import '../../core/state/app_state_provider.dart';
import '../../core/state/auth_provider.dart';
import '../../core/state/notification_provider.dart';
import '../../features/notifications/notifications_screen.dart';
import '../../features/profile/documents_screen.dart';

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
        // Notifications (FR-NC-13)
        Consumer<NotificationProvider>(
          builder: (context, inbox, _) => IconButton(
            tooltip: 'Notifications',
            icon: Badge(
              isLabelVisible: inbox.unreadCount > 0,
              label: Text('${inbox.unreadCount}'),
              child: const Icon(Icons.notifications_none, color: AppColors.onPrimary),
            ),
            onPressed: () => Navigator.of(context).push(
              MaterialPageRoute(builder: (_) => const NotificationsScreen()),
            ),
          ),
        ),
        // Account: signed-in user and sign out (FR-SV-7)
        Padding(
          padding: const EdgeInsets.only(right: 12, top: 12, bottom: 12),
          child: PopupMenuButton<String>(
            tooltip: 'Account',
            offset: const Offset(0, 48),
            shape: RoundedRectangleBorder(borderRadius: AppShapes.roundedLarge),
            onSelected: (value) {
              if (value == 'documents') {
                Navigator.of(context).push(MaterialPageRoute(builder: (_) => const DocumentsScreen()));
              } else {
                context.read<AuthProvider>().logout();
              }
            },
            itemBuilder: (context) => [
              PopupMenuItem(
                enabled: false,
                child: Text(context.read<AuthProvider>().user?.fullName ?? ''),
              ),
              if (context.read<AuthProvider>().role != UserRole.admin)
                PopupMenuItem(
                  value: 'documents',
                  child: Text(isUrdu ? 'میرے دستاویزات' : 'My documents'),
                ),
              PopupMenuItem(
                value: 'logout',
                child: Text(isUrdu ? 'سائن آؤٹ' : 'Sign out'),
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
                  context.watch<AuthProvider>().role == UserRole.cargoOwner ? Icons.business : Icons.person,
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
