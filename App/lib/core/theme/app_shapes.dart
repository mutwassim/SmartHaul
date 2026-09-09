import 'package:flutter/material.dart';

class AppShapes {
  static const double radiusSmall = 4.0;
  static const double radiusMedium = 8.0;
  static const double radiusLarge = 12.0;
  static const double radiusExtraLarge = 16.0;
  static const double radiusPill = 9999.0;

  static const double minTouchTarget = 48.0;
  static const double dominantActionHeight = 56.0;

  static final BorderRadius roundedSmall = BorderRadius.circular(radiusSmall);
  static final BorderRadius roundedMedium = BorderRadius.circular(radiusMedium);
  static final BorderRadius roundedLarge = BorderRadius.circular(radiusLarge);
  static final BorderRadius roundedXLarge = BorderRadius.circular(radiusExtraLarge);
  static final BorderRadius roundedPill = BorderRadius.circular(radiusPill);

  static const EdgeInsets screenPadding = EdgeInsets.symmetric(horizontal: 16.0, vertical: 12.0);
  static const EdgeInsets cardPadding = EdgeInsets.all(16.0);
}
