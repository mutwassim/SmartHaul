import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'app_colors.dart';

class AppTypography {
  // English / Standard Typography Scale (Inter / Hanken Grotesk)
  static TextStyle displaySmall({
    Color color = AppColors.textPrimary,
    double fontSize = 30,
    FontWeight fontWeight = FontWeight.w700,
  }) =>
      GoogleFonts.inter(
        fontSize: fontSize,
        fontWeight: fontWeight,
        height: 38 / 30,
        letterSpacing: -0.02 * 30,
        color: color,
      );

  static TextStyle headlineLarge({
    Color color = AppColors.textPrimary,
    double fontSize = 26,
    FontWeight fontWeight = FontWeight.w700,
  }) =>
      GoogleFonts.inter(
        fontSize: fontSize,
        fontWeight: fontWeight,
        height: 34 / 26,
        letterSpacing: -0.01 * 26,
        color: color,
      );

  static TextStyle headlineMedium({
    Color color = AppColors.textPrimary,
    double fontSize = 22,
    FontWeight fontWeight = FontWeight.w600,
  }) =>
      GoogleFonts.inter(
        fontSize: fontSize,
        fontWeight: fontWeight,
        height: 28 / 22,
        color: color,
      );

  static TextStyle headlineSmall({
    Color color = AppColors.textPrimary,
    double fontSize = 18,
    FontWeight fontWeight = FontWeight.w600,
  }) =>
      GoogleFonts.inter(
        fontSize: fontSize,
        fontWeight: fontWeight,
        height: 24 / 18,
        color: color,
      );

  static TextStyle titleLarge({
    Color color = AppColors.textPrimary,
    double fontSize = 18,
    FontWeight fontWeight = FontWeight.w700,
  }) =>
      GoogleFonts.inter(
        fontSize: fontSize,
        fontWeight: fontWeight,
        height: 24 / 18,
        color: color,
      );

  static TextStyle titleMedium({
    Color color = AppColors.textPrimary,
    double fontSize = 16,
    FontWeight fontWeight = FontWeight.w600,
  }) =>
      GoogleFonts.inter(
        fontSize: fontSize,
        fontWeight: fontWeight,
        height: 22 / 16,
        letterSpacing: 0.01 * 16,
        color: color,
      );

  static TextStyle bodyLarge({
    Color color = AppColors.textPrimary,
    double fontSize = 16,
    FontWeight fontWeight = FontWeight.w400,
  }) =>
      GoogleFonts.inter(
        fontSize: fontSize,
        fontWeight: fontWeight,
        height: 24 / 16,
        color: color,
      );

  static TextStyle bodyMedium({
    Color color = AppColors.textSecondary,
    double fontSize = 15,
    FontWeight fontWeight = FontWeight.w400,
  }) =>
      GoogleFonts.inter(
        fontSize: fontSize,
        fontWeight: fontWeight,
        height: 22 / 15,
        color: color,
      );

  static TextStyle bodySmall({
    Color color = AppColors.textSecondary,
    double fontSize = 14,
    FontWeight fontWeight = FontWeight.w500,
  }) =>
      GoogleFonts.inter(
        fontSize: fontSize,
        fontWeight: fontWeight,
        height: 20 / 14,
        color: color,
      );

  static TextStyle labelLarge({
    Color color = AppColors.textPrimary,
    double fontSize = 15,
    FontWeight fontWeight = FontWeight.w600,
  }) =>
      GoogleFonts.inter(
        fontSize: fontSize,
        fontWeight: fontWeight,
        height: 20 / 15,
        letterSpacing: 0.01 * 15,
        color: color,
      );

  static TextStyle labelMedium({
    Color color = AppColors.textSecondary,
    double fontSize = 13,
    FontWeight fontWeight = FontWeight.w600,
  }) =>
      GoogleFonts.inter(
        fontSize: fontSize,
        fontWeight: fontWeight,
        height: 18 / 13,
        letterSpacing: 0.02 * 13,
        color: color,
      );

  static TextStyle labelSmall({
    Color color = AppColors.textSecondary,
    double fontSize = 11,
    FontWeight fontWeight = FontWeight.w700,
  }) =>
      GoogleFonts.inter(
        fontSize: fontSize,
        fontWeight: fontWeight,
        height: 16 / 11,
        letterSpacing: 0.04 * 11,
        color: color,
      );

  // JetBrains Mono for Telemetry, Codes & Currency amounts
  static TextStyle telematicCode({
    Color color = AppColors.textPrimary,
    double fontSize = 12,
    FontWeight fontWeight = FontWeight.w600,
  }) =>
      GoogleFonts.jetBrainsMono(
        fontSize: fontSize,
        fontWeight: fontWeight,
        color: color,
      );

  // Urdu (Noto Sans Arabic) Typography Scale
  static TextStyle urduHeadlineLarge({
    Color color = AppColors.textPrimary,
    double fontSize = 24,
    FontWeight fontWeight = FontWeight.w700,
  }) =>
      GoogleFonts.notoSansArabic(
        fontSize: fontSize,
        fontWeight: fontWeight,
        height: 1.5,
        color: color,
      );

  static TextStyle urduHeadlineMedium({
    Color color = AppColors.textPrimary,
    double fontSize = 20,
    FontWeight fontWeight = FontWeight.w700,
  }) =>
      GoogleFonts.notoSansArabic(
        fontSize: fontSize,
        fontWeight: fontWeight,
        height: 1.5,
        color: color,
      );

  static TextStyle urduTitle({
    Color color = AppColors.textPrimary,
    double fontSize = 17,
    FontWeight fontWeight = FontWeight.w600,
  }) =>
      GoogleFonts.notoSansArabic(
        fontSize: fontSize,
        fontWeight: fontWeight,
        height: 1.4,
        color: color,
      );

  static TextStyle urduBody({
    Color color = AppColors.textSecondary,
    double fontSize = 14,
    FontWeight fontWeight = FontWeight.w500,
  }) =>
      GoogleFonts.notoSansArabic(
        fontSize: fontSize,
        fontWeight: fontWeight,
        height: 1.5,
        color: color,
      );

  static TextStyle urduLabel({
    Color color = AppColors.textPrimary,
    double fontSize = 12,
    FontWeight fontWeight = FontWeight.w600,
  }) =>
      GoogleFonts.notoSansArabic(
        fontSize: fontSize,
        fontWeight: fontWeight,
        height: 1.3,
        color: color,
      );
}
