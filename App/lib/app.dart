import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:provider/provider.dart';

import 'common/widgets/smart_haul_app_bar.dart';
import 'common/widgets/smart_haul_bottom_nav.dart';
import 'core/app_services.dart';
import 'core/constants/app_constants.dart';
import 'core/localization/app_localizations.dart';
import 'core/state/app_state_provider.dart';
import 'core/state/auth_provider.dart';
import 'core/state/cargo_provider.dart';
import 'core/state/document_provider.dart';
import 'core/state/driver_provider.dart';
import 'core/state/notification_provider.dart';
import 'core/state/payment_provider.dart';
import 'core/state/tracking_provider.dart';
import 'core/theme/app_theme.dart';
import 'features/auth/auth_screen.dart';
import 'features/cargo_owner/cargo_home_screen.dart';
import 'features/cargo_owner/create_shipment_screen.dart';
import 'features/cargo_owner/my_shipments_screen.dart';
import 'features/driver/available_loads_screen.dart';
import 'features/driver/driver_home_screen.dart';
import 'features/onboarding/welcome_language_role_screen.dart';
import 'features/payments/audit_ledger_wallet_screen.dart';
import 'features/tracking/live_tracking_map_screen.dart';

class SmartHaulApp extends StatelessWidget {
  const SmartHaulApp({super.key, required this.services});

  final AppServices services;

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        ChangeNotifierProvider<AppStateProvider>.value(value: services.appState),
        ChangeNotifierProvider<AuthProvider>.value(value: services.auth),
        ChangeNotifierProvider<CargoProvider>.value(value: services.cargo),
        ChangeNotifierProvider<DriverProvider>.value(value: services.driver),
        ChangeNotifierProvider<DocumentProvider>.value(value: services.documents),
        ChangeNotifierProvider<PaymentProvider>.value(value: services.payments),
        ChangeNotifierProvider<NotificationProvider>.value(value: services.notifications),
        ChangeNotifierProvider<TrackingProvider>.value(value: services.tracking),
      ],
      child: Consumer<AppStateProvider>(
        builder: (context, state, child) => MaterialApp(
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
        ),
      ),
    );
  }
}

/// Chooses between the splash, the sign-in flow and the signed-in app.
class _AppRootShell extends StatefulWidget {
  const _AppRootShell();

  @override
  State<_AppRootShell> createState() => _AppRootShellState();
}

class _AppRootShellState extends State<_AppRootShell> {
  bool _roleChosen = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => context.read<AuthProvider>().restore());
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();

    switch (auth.status) {
      case AuthStatus.unknown:
        return const Scaffold(body: Center(child: CircularProgressIndicator()));
      case AuthStatus.signedOut:
        return _roleChosen
            ? AuthScreen(onBack: () => setState(() => _roleChosen = false))
            : WelcomeLanguageRoleScreen(onContinue: () => setState(() => _roleChosen = true));
      case AuthStatus.signedIn:
        return const _SignedInShell();
    }
  }
}

class _SignedInShell extends StatefulWidget {
  const _SignedInShell();

  @override
  State<_SignedInShell> createState() => _SignedInShellState();
}

class _SignedInShellState extends State<_SignedInShell> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _loadForRole());
  }

  void _loadForRole() {
    final auth = context.read<AuthProvider>();
    context.read<NotificationProvider>().load();
    context.read<PaymentProvider>().load();
    if (auth.role == UserRole.cargoOwner) {
      context.read<CargoProvider>().load();
    } else {
      context.read<DriverProvider>().loadHome();
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppStateProvider>();
    final role = context.watch<AuthProvider>().role;
    final isUrdu = state.isUrdu;
    final isCargoOwner = role == UserRole.cargoOwner;

    final String appBarTitle = isCargoOwner
        ? (isUrdu ? 'کارگو ہوم (Cargo Home)' : 'Cargo Home Dashboard')
        : (isUrdu ? 'ڈرائیور ہوم (Driver Home)' : 'Driver Home Dashboard');

    return Scaffold(
      appBar: SmartHaulAppBar(title: appBarTitle),
      body: IndexedStack(
        index: state.selectedNavIndex,
        children: [
          isCargoOwner ? const CargoHomeScreen() : const DriverHomeScreen(),
          isCargoOwner ? const MyShipmentsScreen() : const AvailableLoadsScreen(),
          const LiveTrackingMapScreen(),
          const AuditLedgerWalletScreen(),
        ],
      ),
      bottomNavigationBar: SmartHaulBottomNav(
        onCenterActionPressed: () {
          if (isCargoOwner) {
            Navigator.of(context).push(MaterialPageRoute(builder: (_) => const CreateShipmentScreen()));
          } else {
            state.setNavIndex(2);
          }
        },
      ),
    );
  }
}
