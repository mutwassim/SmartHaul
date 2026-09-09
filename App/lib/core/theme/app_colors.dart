import 'package:flutter/material.dart';

/// Industrial Logistics Precision Theme Colors
/// Extracted directly from SmartHaul Stitch Project design specifications.
class AppColors {
  // Primary (Deep Heavy-Haul Navy)
  static const Color primary = Color(0xFF0F2942);
  static const Color primaryDark = Color(0xFF001428);
  static const Color onPrimary = Color(0xFFFFFFFF);
  static const Color primaryContainer = Color(0xFFE2EAF4);
  static const Color onPrimaryContainer = Color(0xFF0A1D30);
  static const Color primaryFixed = Color(0xFFD1E4FF);
  static const Color primaryFixedDim = Color(0xFFB0C9E8);

  // Secondary (Rugged Industrial Emerald)
  static const Color secondary = Color(0xFF0A7E64);
  static const Color secondaryDark = Color(0xFF006B55);
  static const Color onSecondary = Color(0xFFFFFFFF);
  static const Color secondaryContainer = Color(0xFFD1FAE5);
  static const Color onSecondaryContainer = Color(0xFF064E3B);
  static const Color secondaryFixed = Color(0xFF95F5D5);
  static const Color secondaryFixedDim = Color(0xFF79D8B9);

  // Tertiary (Deep Amber / Operational Warning & Tenders)
  static const Color tertiary = Color(0xFFB45309);
  static const Color onTertiary = Color(0xFFFFFFFF);
  static const Color tertiaryContainer = Color(0xFFFEF3C7);
  static const Color onTertiaryContainer = Color(0xFF78350F);
  static const Color tertiaryFixed = Color(0xFFFFDBCA);
  static const Color tertiaryFixedDim = Color(0xFFFFB68E);

  // Error / Urgent SOS (Brick Red)
  static const Color error = Color(0xFFDC2626);
  static const Color errorDark = Color(0xFFBA1A1A);
  static const Color onError = Color(0xFFFFFFFF);
  static const Color errorContainer = Color(0xFFFEE2E2);
  static const Color onErrorContainer = Color(0xFF7F1D1D);

  // Surfaces & Backgrounds
  static const Color background = Color(0xFFF8FAFC);
  static const Color surface = Color(0xFFF8FAFC);
  static const Color surfaceBright = Color(0xFFFAF8FF);
  static const Color surfaceDim = Color(0xFFD2D9F4);
  static const Color surfaceContainerLowest = Color(0xFFFFFFFF);
  static const Color surfaceContainerLow = Color(0xFFF1F5F9);
  static const Color surfaceContainer = Color(0xFFEAEDFF);
  static const Color surfaceContainerHigh = Color(0xFFE2E7FF);
  static const Color surfaceContainerHighest = Color(0xFFDAE2FD);

  // Inverse Surfaces
  static const Color inverseSurface = Color(0xFF283044);
  static const Color inverseOnSurface = Color(0xFFEEF0FF);
  static const Color inversePrimary = Color(0xFFB0C9E8);

  // Outlines & Dividers
  static const Color outline = Color(0xFFCBD5E1);
  static const Color outlineVariant = Color(0xFFE2E8F0);
  static const Color surfaceTint = Color(0xFF49607C);

  // Typography & Text Content
  static const Color textPrimary = Color(0xFF0F172A); // Charcoal Black
  static const Color textSecondary = Color(0xFF475569); // Slate Grey
  static const Color textMuted = Color(0xFF64748B); // Caption Grey
  static const Color onSurface = Color(0xFF0F172A);
  static const Color onSurfaceVariant = Color(0xFF475569);

  // Elevation Shadows
  static const List<BoxShadow> cardShadow = [
    BoxShadow(
      color: Color.fromRGBO(15, 23, 42, 0.04),
      offset: Offset(0, 2),
      blurRadius: 8,
      spreadRadius: -2,
    ),
  ];

  static const List<BoxShadow> elevationLevel2 = [
    BoxShadow(
      color: Color.fromRGBO(15, 41, 66, 0.12),
      offset: Offset(0, 3),
      blurRadius: 6,
      spreadRadius: -1,
    ),
    BoxShadow(
      color: Color.fromRGBO(15, 41, 66, 0.08),
      offset: Offset(0, 2),
      blurRadius: 4,
      spreadRadius: -1,
    ),
  ];
}
