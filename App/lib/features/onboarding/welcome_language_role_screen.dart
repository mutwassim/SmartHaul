import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/constants/app_constants.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_typography.dart';
import '../../core/theme/app_shapes.dart';
import '../../core/services/app_state_provider.dart';
import '../../core/localization/app_localizations.dart';

class WelcomeLanguageRoleScreen extends StatefulWidget {
  final VoidCallback onContinue;

  const WelcomeLanguageRoleScreen({
    super.key,
    required this.onContinue,
  });

  @override
  State<WelcomeLanguageRoleScreen> createState() =>
      _WelcomeLanguageRoleScreenState();
}

class _WelcomeLanguageRoleScreenState extends State<WelcomeLanguageRoleScreen> {
  @override
  Widget build(BuildContext context) {
    final state = Provider.of<AppStateProvider>(context);
    final l10n = AppLocalizations.of(context);
    final isUrdu = state.isUrdu;
    final selectedRole = state.currentRole;

    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 20.0, vertical: 16.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              const SizedBox(height: 12),
              // Brand Mark & Identity
              Container(
                width: 72,
                height: 72,
                decoration: BoxDecoration(
                  color: AppColors.primary,
                  borderRadius: AppShapes.roundedLarge,
                  boxShadow: const [
                    BoxShadow(
                      color: Color.fromRGBO(15, 41, 66, 0.25),
                      offset: Offset(0, 4),
                      blurRadius: 16,
                    ),
                  ],
                ),
                child: const Center(
                  child: Icon(
                    Icons.local_shipping,
                    color: AppColors.secondaryFixed,
                    size: 38,
                  ),
                ),
              ),
              const SizedBox(height: 14),
              Text(
                AppConstants.appName,
                style: AppTypography.displaySmall(color: AppColors.primary),
              ),
              const SizedBox(height: 6),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                decoration: BoxDecoration(
                  color: AppColors.surfaceContainer,
                  borderRadius: AppShapes.roundedPill,
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(
                      width: 6,
                      height: 6,
                      decoration: const BoxDecoration(
                        color: AppColors.primary,
                        shape: BoxShape.circle,
                      ),
                    ),
                    const SizedBox(width: 6),
                    Text(
                      l10n.translate('gridSubtitle'),
                      style: AppTypography.telematicCode(
                        color: AppColors.primary,
                        fontSize: 11,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 10),
              Text(
                l10n.translate('tagline'),
                textAlign: TextAlign.center,
                style: isUrdu
                    ? AppTypography.urduBody(color: AppColors.textSecondary)
                    : AppTypography.bodyMedium(color: AppColors.textSecondary),
              ),
              const SizedBox(height: 28),

              // Language Selection Section
              Align(
                alignment: isUrdu ? Alignment.centerRight : Alignment.centerLeft,
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Expanded(
                      child: Text(
                        'Select Language / زبان منتخب کریں',
                        style: AppTypography.titleMedium(),
                      ),
                    ),
                    const SizedBox(width: 8),
                    const Icon(
                      Icons.translate,
                      size: 20,
                      color: AppColors.textSecondary,
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 4),
              Align(
                alignment: isUrdu ? Alignment.centerRight : Alignment.centerLeft,
                child: Text(
                  l10n.translate('selectLanguageSub'),
                  style: AppTypography.bodySmall(color: AppColors.textMuted),
                ),
              ),
              const SizedBox(height: 12),

              // Language Cards Stack
              Row(
                children: [
                  Expanded(
                    child: _buildOptionCard(
                      isSelected: !isUrdu,
                      onTap: () => state.setLocale(const Locale('en')),
                      leadingBadge: 'EN',
                      title: 'English',
                      subtitle: 'Standard logistics',
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: _buildOptionCard(
                      isSelected: isUrdu,
                      onTap: () => state.setLocale(const Locale('ur')),
                      leadingBadge: 'اردو',
                      title: 'اردو (Urdu)',
                      subtitle: 'مکمل اردو انٹرفیس',
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 24),

              // Role Selection Section
              Align(
                alignment: isUrdu ? Alignment.centerRight : Alignment.centerLeft,
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Expanded(
                      child: Text(
                        'Select Role / کردار کا انتخاب',
                        style: AppTypography.titleMedium(),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Text(
                      l10n.translate('stepOneOfTwo'),
                      style: AppTypography.telematicCode(
                        color: AppColors.textSecondary,
                        fontSize: 11,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 12),

              // Role Cards
              Row(
                children: [
                  Expanded(
                    child: _buildRoleCard(
                      key: const Key('cargoOwnerRoleCard'),
                      isSelected: selectedRole == UserRole.cargoOwner,
                      onTap: () => state.setRole(UserRole.cargoOwner),
                      icon: Icons.inventory_2,
                      title: 'Cargo Owner',
                      titleUrdu: 'کارگو مالک',
                      description: 'Book & Track Loads',
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: _buildRoleCard(
                      key: const Key('truckDriverRoleCard'),
                      isSelected: selectedRole == UserRole.driver,
                      onTap: () => state.setRole(UserRole.driver),
                      icon: Icons.local_shipping,
                      title: 'Truck Driver',
                      titleUrdu: 'ٹرک ڈرائیور',
                      description: 'Find Loads & Earn',
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 20),

              // Trust & Verification Metric Strip
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                decoration: BoxDecoration(
                  color: AppColors.surfaceContainerLowest,
                  borderRadius: AppShapes.roundedLarge,
                  border: Border.all(color: AppColors.outlineVariant),
                  boxShadow: AppColors.cardShadow,
                ),
                child: Row(
                  children: [
                    const Icon(
                      Icons.verified_user,
                      color: AppColors.primary,
                      size: 24,
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            l10n.translate('securityTrustBadge'),
                            style: AppTypography.labelMedium().copyWith(
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                          Text(
                            l10n.translate('securitySub'),
                            style: AppTypography.telematicCode(
                              color: AppColors.textSecondary,
                              fontSize: 11,
                            ),
                          ),
                        ],
                      ),
                    ),
                    Text(
                      l10n.translate('secure100'),
                      style: AppTypography.telematicCode(
                        color: AppColors.primary,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 28),

              // Pinned Continue CTA
              ElevatedButton(
                key: const Key('welcomeContinueButton'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.primary,
                  foregroundColor: AppColors.onPrimary,
                  minimumSize: const Size(double.infinity, AppShapes.dominantActionHeight),
                  shape: RoundedRectangleBorder(
                    borderRadius: AppShapes.roundedLarge,
                  ),
                  elevation: 2,
                ),
                onPressed: widget.onContinue,
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(
                      isUrdu ? 'آگے بڑھیں / Continue' : 'Continue / آگے بڑھیں',
                      style: const TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 0.5,
                      ),
                    ),
                    const SizedBox(width: 8),
                    Icon(
                      isUrdu ? Icons.arrow_back : Icons.arrow_forward,
                      size: 20,
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 12),
              Text(
                l10n.translate('termsNotice'),
                textAlign: TextAlign.center,
                style: AppTypography.telematicCode(
                  color: AppColors.textMuted,
                  fontSize: 10,
                ),
              ),
              const SizedBox(height: 16),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildOptionCard({
    required bool isSelected,
    required VoidCallback onTap,
    required String leadingBadge,
    required String title,
    required String subtitle,
  }) {
    return InkWell(
      onTap: onTap,
      borderRadius: AppShapes.roundedLarge,
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: isSelected
              ? AppColors.primaryContainer.withValues(alpha: 0.6)
              : AppColors.surfaceContainerLowest,
          borderRadius: AppShapes.roundedLarge,
          border: Border.all(
            color: isSelected ? AppColors.primary : AppColors.outlineVariant,
            width: isSelected ? 1.5 : 1.0,
          ),
          boxShadow: isSelected ? AppColors.cardShadow : null,
        ),
        child: Row(
          children: [
            Container(
              width: 36,
              height: 36,
              decoration: BoxDecoration(
                color: isSelected ? AppColors.primary : AppColors.surfaceContainer,
                borderRadius: AppShapes.roundedMedium,
              ),
              child: Center(
                child: Text(
                  leadingBadge,
                  style: TextStyle(
                    color: isSelected ? AppColors.onPrimary : AppColors.textPrimary,
                    fontWeight: FontWeight.bold,
                    fontSize: 12,
                  ),
                ),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: AppTypography.labelMedium().copyWith(
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  Text(
                    subtitle,
                    style: AppTypography.bodySmall(fontSize: 10),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildRoleCard({
    Key? key,
    required bool isSelected,
    required VoidCallback onTap,
    required IconData icon,
    required String title,
    required String titleUrdu,
    required String description,
  }) {
    return GestureDetector(
      key: key,
      behavior: HitTestBehavior.opaque,
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: isSelected
              ? AppColors.primaryContainer.withValues(alpha: 0.5)
              : AppColors.surfaceContainerLowest,
          borderRadius: AppShapes.roundedLarge,
          border: Border.all(
            color: isSelected ? AppColors.primary : AppColors.outlineVariant,
            width: isSelected ? 1.8 : 1.0,
          ),
          boxShadow: isSelected ? AppColors.cardShadow : null,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Container(
                  width: 38,
                  height: 38,
                  decoration: BoxDecoration(
                    color: isSelected ? AppColors.primary : AppColors.surfaceContainer,
                    borderRadius: AppShapes.roundedMedium,
                  ),
                  child: Icon(
                    icon,
                    color: isSelected ? AppColors.onPrimary : AppColors.textSecondary,
                    size: 20,
                  ),
                ),
                Container(
                  width: 20,
                  height: 20,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: isSelected ? AppColors.primary : Colors.transparent,
                    border: Border.all(
                      color: isSelected ? AppColors.primary : AppColors.outline,
                      width: 1.5,
                    ),
                  ),
                  child: isSelected
                      ? const Center(
                          child: Icon(
                            Icons.check,
                            size: 14,
                            color: AppColors.onPrimary,
                          ),
                        )
                      : null,
                ),
              ],
            ),
            const SizedBox(height: 12),
            Text(
              title,
              style: AppTypography.titleMedium(),
            ),
            Text(
              titleUrdu,
              style: AppTypography.urduBody(color: AppColors.primary).copyWith(
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              description,
              style: AppTypography.telematicCode(
                color: AppColors.textSecondary,
                fontSize: 10,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
