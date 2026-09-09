import 'package:flutter/material.dart';
import 'en_strings.dart';
import 'ur_strings.dart';

class AppLocalizations {
  final Locale locale;

  AppLocalizations(this.locale);

  static AppLocalizations of(BuildContext context) {
    return Localizations.of<AppLocalizations>(context, AppLocalizations) ??
        AppLocalizations(const Locale('en'));
  }

  static const LocalizationsDelegate<AppLocalizations> delegate =
      _AppLocalizationsDelegate();

  static const List<Locale> supportedLocales = [
    Locale('en', ''),
    Locale('ur', ''),
  ];

  bool get isUrdu => locale.languageCode == 'ur';

  String translate(String key) {
    if (isUrdu) {
      return UrStrings.values[key] ?? EnStrings.values[key] ?? key;
    }
    return EnStrings.values[key] ?? key;
  }

  // Common quick getters
  String get appName => translate('appName');
  String get tagline => translate('tagline');
  String get selectLanguage => translate('selectLanguage');
  String get selectRole => translate('selectRole');
  String get cargoOwner => translate('cargoOwner');
  String get truckDriver => translate('truckDriver');
  String get continueBtn => translate('continueBtn');
  String get continueUrdu => translate('continueUrdu');
  String get securityTrustBadge => translate('securityTrustBadge');
  String get navHome => translate('navHome');
  String get navLoads => translate('navLoads');
  String get navTracking => translate('navTracking');
  String get navLedger => translate('navLedger');
  String get navAccount => translate('navAccount');
}

class _AppLocalizationsDelegate
    extends LocalizationsDelegate<AppLocalizations> {
  const _AppLocalizationsDelegate();

  @override
  bool isSupported(Locale locale) => ['en', 'ur'].contains(locale.languageCode);

  @override
  Future<AppLocalizations> load(Locale locale) async {
    return AppLocalizations(locale);
  }

  @override
  bool shouldReload(_AppLocalizationsDelegate old) => false;
}
