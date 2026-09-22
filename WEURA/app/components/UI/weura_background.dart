import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../core/Theme/weura_theme.dart';

/// Subtle, theme-aware background for WEURA screens.
///
/// Performance:
///   - 1 AnimationController only (slow aurora, 30s)
///   - Static gradient + 2 slow glows + vignette
///   - No stars, no grid → cheap on low-end devices
///
/// Usage:
///   Scaffold(
///     body: WeuraScreenBackground(
///       colors: WeuraColors.of(context),
///       child: SafeArea(child: ...),
///     ),
///   )
class WeuraScreenBackground extends StatefulWidget {
  const WeuraScreenBackground({
    super.key,
    required this.colors,
    this.child,
    this.intensity = 1.0,
  });

  final WeuraColors colors;
  final Widget? child;
  final double intensity;

  @override
  State<WeuraScreenBackground> createState() => _WeuraScreenBackgroundState();
}

class _WeuraScreenBackgroundState extends State<WeuraScreenBackground>
    with SingleTickerProviderStateMixin {
  late final AnimationController _auroraController;

  @override
  void initState() {
    super.initState();
    _auroraController = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 30),
    )..repeat();
  }

  @override
  void dispose() {
    _auroraController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final colors = widget.colors;
    final isDark = Theme.of(context).brightness == Brightness.dark;

    final top = isDark ? const Color(0xFF04060B) : const Color(0xFFF8FAFF);
    final mid = isDark ? const Color(0xFF060912) : const Color(0xFFF0F4FF);
    final bottom = colors.background;

    final glowOpacity = (isDark ? 1.0 : 0.45) * widget.intensity;
    final vignetteOpacity = isDark ? 0.25 : 0.04;

    return RepaintBoundary(
      child: DecoratedBox(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [top, mid, bottom],
            stops: const [0.0, 0.35, 1.0],
          ),
        ),
        child: Stack(
          children: [
            // Single slow-moving aurora glow (only 2 blobs)
            AnimatedBuilder(
              animation: _auroraController,
              builder: (context, _) {
                return CustomPaint(
                  size: Size.infinite,
                  painter: _ScreenGlowPainter(
                    progress: _auroraController.value,
                    blue: colors.accent,
                    glow: colors.accentGlow,
                    intensity: glowOpacity,
                  ),
                );
              },
            ),

            // Subtle vignette
            Positioned.fill(
              child: IgnorePointer(
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    gradient: RadialGradient(
                      center: Alignment.center,
                      radius: 1.0,
                      colors: [
                        Colors.transparent,
                        Colors.black.withValues(alpha: vignetteOpacity),
                      ],
                      stops: const [0.6, 1.0],
                    ),
                  ),
                ),
              ),
            ),

            if (widget.child != null) Positioned.fill(child: widget.child!),
          ],
        ),
      ),
    );
  }
}

class _ScreenGlowPainter extends CustomPainter {
  _ScreenGlowPainter({
    required this.progress,
    required this.blue,
    required this.glow,
    required this.intensity,
  });

  final double progress;
  final Color blue;
  final Color glow;
  final double intensity;

  @override
  void paint(Canvas canvas, Size size) {
    final t = progress * 2 * math.pi;

    _blob(
      canvas,
      size,
      cx: size.width * (0.20 + 0.20 * math.sin(t)),
      cy: size.height * (0.15 + 0.10 * math.cos(t * 0.8)),
      radius: size.width * 0.70,
      color: blue.withValues(alpha: 0.12 * intensity),
    );

    _blob(
      canvas,
      size,
      cx: size.width * (0.85 + 0.10 * math.cos(t * 0.7)),
      cy: size.height * (0.75 + 0.10 * math.sin(t * 0.9)),
      radius: size.width * 0.65,
      color: glow.withValues(alpha: 0.10 * intensity),
    );
  }

  void _blob(
    Canvas canvas,
    Size size, {
    required double cx,
    required double cy,
    required double radius,
    required Color color,
  }) {
    final paint = Paint()
      ..shader = RadialGradient(
        colors: [color, color.withValues(alpha: 0.0)],
      ).createShader(
        Rect.fromCircle(center: Offset(cx, cy), radius: radius),
      );

    canvas.drawCircle(Offset(cx, cy), radius, paint);
  }

  @override
  bool shouldRepaint(covariant _ScreenGlowPainter oldDelegate) {
    return oldDelegate.progress != progress;
  }
}