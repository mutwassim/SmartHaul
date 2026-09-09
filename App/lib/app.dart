import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:provider/provider.dart';
import 'core/constants/app_constants.dart';
import 'core/theme/app_theme.dart';
import 'core/localization/app_localizations.dart';
import 'core/services/app_state_provider.dart';
import 'common/widgets/smart_haul_app_bar.dart';
import 'common/widgets/smart_haul_bottom_nav.dart';
import 'features/onboarding/welcome_language_role_screen.dart';
import 'features/cargo_owner/cargo_home_screen.dart';
import 'features/cargo_owner/create_shipment_screen.dart';
import 'features/driver/driver_home_screen.dart';
import 'features/driver/available_loads_screen.dart';
import 'features/tracking/live_tracking_map_screen.dart';
import 'features/payments/audit_ledger_wallet_screen.dart';

class SmartHaulApp extends StatelessWidget {
  const SmartHaulApp({super.key});

  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider(
      create: (_) => AppStateProvider(),
      child: Consumer<AppStateProvider>(
        builder: (context, state, child) {
          return MaterialApp(
            title: AppConstants.appName,
            debugShowCheckedModeBanner: false,
            theme: AppTheme.lightTheme,
            locale: state.locale,
            supportedLocales: AppLocalizations.supportedLocales,
            localizationsDelegates: const [
              AppLocalizations.delegate,
              GlobalMaterialLocalizations.delegate,
              GlobalWidgetsLocalizations.delegate,
              GlobalCupertinoLocalizations.delegate,
            ],
            home: const _AppRootShell(),
          );
        },
      ),
    );
  }
}

class _AppRootShell extends StatefulWidget {
  const _AppRootShell();

  @override
  State<_AppRootShell> createState() => _AppRootShellState();
}

class _AppRootShellState extends State<_AppRootShell> {
  bool _isOnboarded = false;

  @override
  Widget build(BuildContext context) {
    final state = Provider.of<AppStateProvider>(context);
    final isUrdu = state.isUrdu;
    final isCargoOwner = state.currentRole == UserRole.cargoOwner;

    if (!_isOnboarded) {
      return WelcomeLanguageRoleScreen(
        onContinue: () {
          setState(() => _isOnboarded = true);
        },
      );
    }

    final String appBarTitle = isCargoOwner
        ? (isUrdu ? 'کارگو ہوم (Cargo Home)' : 'Cargo Home Dashboard')
        : (isUrdu ? 'ڈرائیور ہوم (Driver Home)' : 'Driver Home Dashboard');

    return Scaffold(
      appBar: SmartHaulAppBar(
        title: appBarTitle,
      ),
      body: IndexedStack(
        index: state.selectedNavIndex,
        children: [
          // Index 0: Home (Cargo Owner or Driver)
          isCargoOwner ? const CargoHomeScreen() : const DriverHomeScreen(),

          // Index 1: Loads Marketplace
          const AvailableLoadsScreen(),

          // Index 2: Live GPS Tracking
          const LiveTrackingMapScreen(),

          // Index 3: Non-Custodial Ledger / Wallet
          const AuditLedgerWalletScreen(),
        ],
      ),
      bottomNavigationBar: SmartHaulBottomNav(
        onCenterActionPressed: () {
          if (isCargoOwner) {
            Navigator.of(context).push(
              MaterialPageRoute(builder: (_) => const CreateShipmentScreen()),
            );
          } else {
            state.setNavIndex(2); // Go to Live GPS
          }
        },
      ),
    );
  }
}
