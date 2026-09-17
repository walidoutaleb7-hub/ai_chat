import 'package:flutter/material.dart';

/// WEURA AI — Theme tokens.
///
/// All UI colors are defined here for both Dark and Light modes.
/// Screens read them via `WeuraColors.of(context)` so that switching
/// the theme instantly updates the whole app.
class WeuraColors extends ThemeExtension<WeuraColors> {
  const WeuraColors({
    required this.background,
    required this.surface,
    required this.surfaceAlt,
    required this.surfaceElevated,
    required this.border,
    required this.borderStrong,
    required this.textPrimary,
    required this.textSecondary,
    required this.textMuted,
    required this.textFaint,
    required this.accent,
    required this.accentGlow,
    required this.accentSoft,
    required this.danger,
    required this.userBubble,
    required this.userBubbleText,
  });

  final Color background;
  final Color surface;
  final Color surfaceAlt;
  final Color surfaceElevated;
  final Color border;
  final Color borderStrong;
  final Color textPrimary;
  final Color textSecondary;
  final Color textMuted;
  final Color textFaint;
  final Color accent;
  final Color accentGlow;
  final Color accentSoft;
  final Color danger;
  final Color userBubble;
  final Color userBubbleText;

  // ---------------------------------------------------------------------------
  // Dark theme (WEURA default)
  // ---------------------------------------------------------------------------

  static const WeuraColors dark = WeuraColors(
    background: Color(0xFF07070C),
    surface: Color(0xFF111119),
    surfaceAlt: Color(0xFF15151D),
    surfaceElevated: Color(0xFF0A0B12),
    border: Color(0x1AFFFFFF),
    borderStrong: Color(0x2EFFFFFF),
    textPrimary: Color(0xFFFFFFFF),
    textSecondary: Color(0xB3FFFFFF),
    textMuted: Color(0x61FFFFFF),
    textFaint: Color(0x3DFFFFFF),
    accent: Color(0xFF315DFF),
    accentGlow: Color(0xFF3B82F6),
    accentSoft: Color(0x1F315DFF),
    danger: Color(0xFFFF6B6B),
    userBubble: Color(0xFF1D4ED8),
    userBubbleText: Color(0xFFFFFFFF),
  );

  // ---------------------------------------------------------------------------
  // Light theme
  // ---------------------------------------------------------------------------

  static const WeuraColors light = WeuraColors(
    background: Color(0xFFF5F6FA),
    surface: Color(0xFFFFFFFF),
    surfaceAlt: Color(0xFFEFF2F7),
    surfaceElevated: Color(0xFFFFFFFF),
    border: Color(0x14000000),
    borderStrong: Color(0x24000000),
    textPrimary: Color(0xFF0A0B12),
    textSecondary: Color(0xB34A4E5A),
    textMuted: Color(0x8A8A8E9A),
    textFaint: Color(0x61B8BCC8),
    accent: Color(0xFF2563EB),
    accentGlow: Color(0xFF3B82F6),
    accentSoft: Color(0x142563EB),
    danger: Color(0xFFDC2626),
    userBubble: Color(0xFF2563EB),
    userBubbleText: Color(0xFFFFFFFF),
  );

  static WeuraColors of(BuildContext context) {
    final colors = Theme.of(context).extension<WeuraColors>();
    return colors ?? dark;
  }

  @override
  WeuraColors copyWith({
    Color? background,
    Color? surface,
    Color? surfaceAlt,
    Color? surfaceElevated,
    Color? border,
    Color? borderStrong,
    Color? textPrimary,
    Color? textSecondary,
    Color? textMuted,
    Color? textFaint,
    Color? accent,
    Color? accentGlow,
    Color? accentSoft,
    Color? danger,
    Color? userBubble,
    Color? userBubbleText,
  }) {
    return WeuraColors(
      background: background ?? this.background,
      surface: surface ?? this.surface,
      surfaceAlt: surfaceAlt ?? this.surfaceAlt,
      surfaceElevated: surfaceElevated ?? this.surfaceElevated,
      border: border ?? this.border,
      borderStrong: borderStrong ?? this.borderStrong,
      textPrimary: textPrimary ?? this.textPrimary,
      textSecondary: textSecondary ?? this.textSecondary,
      textMuted: textMuted ?? this.textMuted,
      textFaint: textFaint ?? this.textFaint,
      accent: accent ?? this.accent,
      accentGlow: accentGlow ?? this.accentGlow,
      accentSoft: accentSoft ?? this.accentSoft,
      danger: danger ?? this.danger,
      userBubble: userBubble ?? this.userBubble,
      userBubbleText: userBubbleText ?? this.userBubbleText,
    );
  }

  @override
  WeuraColors lerp(
    ThemeExtension<WeuraColors>? other,
    double t,
  ) {
    if (other is! WeuraColors) return this;

    return WeuraColors(
      background: Color.lerp(background, other.background, t)!,
      surface: Color.lerp(surface, other.surface, t)!,
      surfaceAlt: Color.lerp(surfaceAlt, other.surfaceAlt, t)!,
      surfaceElevated:
          Color.lerp(surfaceElevated, other.surfaceElevated, t)!,
      border: Color.lerp(border, other.border, t)!,
      borderStrong: Color.lerp(borderStrong, other.borderStrong, t)!,
      textPrimary: Color.lerp(textPrimary, other.textPrimary, t)!,
      textSecondary:
          Color.lerp(textSecondary, other.textSecondary, t)!,
      textMuted: Color.lerp(textMuted, other.textMuted, t)!,
      textFaint: Color.lerp(textFaint, other.textFaint, t)!,
      accent: Color.lerp(accent, other.accent, t)!,
      accentGlow: Color.lerp(accentGlow, other.accentGlow, t)!,
      accentSoft: Color.lerp(accentSoft, other.accentSoft, t)!,
      danger: Color.lerp(danger, other.danger, t)!,
      userBubble: Color.lerp(userBubble, other.userBubble, t)!,
      userBubbleText:
          Color.lerp(userBubbleText, other.userBubbleText, t)!,
    );
  }
}

// ---------------------------------------------------------------------------
// ThemeData builders
// ---------------------------------------------------------------------------

ThemeData weuraDarkTheme() {
  const colors = WeuraColors.dark;

  return ThemeData(
    brightness: Brightness.dark,
    scaffoldBackgroundColor: colors.background,
    useMaterial3: true,
    colorScheme: ColorScheme.fromSeed(
      seedColor: colors.accent,
      brightness: Brightness.dark,
    ).copyWith(
      surface: colors.surface,
      error: colors.danger,
    ),
    extensions: const [colors],
    appBarTheme: AppBarTheme(
      backgroundColor: colors.background,
      foregroundColor: colors.textPrimary,
      elevation: 0,
      centerTitle: false,
      titleTextStyle: TextStyle(
        color: colors.textPrimary,
        fontSize: 18,
        fontWeight: FontWeight.w700,
        letterSpacing: 1.0,
      ),
    ),
    dialogTheme: DialogThemeData(
      backgroundColor: colors.surfaceAlt,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(20),
      ),
    ),
    bottomSheetTheme: BottomSheetThemeData(
      backgroundColor: colors.surfaceAlt,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(
          top: Radius.circular(24),
        ),
      ),
    ),
    snackBarTheme: SnackBarThemeData(
      backgroundColor: colors.surfaceAlt,
      contentTextStyle: TextStyle(color: colors.textPrimary),
      behavior: SnackBarBehavior.floating,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
      ),
    ),
    dividerTheme: DividerThemeData(
      color: colors.border,
      thickness: 1,
    ),
    splashColor: colors.accent.withValues(alpha: 0.08),
    highlightColor: colors.accent.withValues(alpha: 0.04),
  );
}

ThemeData weuraLightTheme() {
  const colors = WeuraColors.light;

  return ThemeData(
    brightness: Brightness.light,
    scaffoldBackgroundColor: colors.background,
    useMaterial3: true,
    colorScheme: ColorScheme.fromSeed(
      seedColor: colors.accent,
      brightness: Brightness.light,
    ).copyWith(
      surface: colors.surface,
      error: colors.danger,
    ),
    extensions: const [colors],
    appBarTheme: AppBarTheme(
      backgroundColor: colors.background,
      foregroundColor: colors.textPrimary,
      elevation: 0,
      centerTitle: false,
      titleTextStyle: TextStyle(
        color: colors.textPrimary,
        fontSize: 18,
        fontWeight: FontWeight.w700,
        letterSpacing: 1.0,
      ),
    ),
    dialogTheme: DialogThemeData(
      backgroundColor: colors.surfaceAlt,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(20),
      ),
    ),
    bottomSheetTheme: BottomSheetThemeData(
      backgroundColor: colors.surfaceAlt,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(
          top: Radius.circular(24),
        ),
      ),
    ),
    snackBarTheme: SnackBarThemeData(
      backgroundColor: colors.surfaceAlt,
      contentTextStyle: TextStyle(color: colors.textPrimary),
      behavior: SnackBarBehavior.floating,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
      ),
    ),
    dividerTheme: DividerThemeData(
      color: colors.border,
      thickness: 1,
    ),
    splashColor: colors.accent.withValues(alpha: 0.08),
    highlightColor: colors.accent.withValues(alpha: 0.04),
  );
}