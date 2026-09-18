import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../core/Theme/weura_theme.dart';

/// Animated aurora mesh background for WEURA.
/// Uses 3 soft moving blobs of color that blend together.
class WeuraBackground extends StatefulWidget {
  const WeuraBackground({
    super.key,
    required this.child,
    this.intensity = 1.0,
  });

  final Widget child;
  final double intensity;

  @override
  State<WeuraBackground> createState() => _WeuraBackgroundState();
}

class _WeuraBackgroundState extends State<WeuraBackground>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 30),
    )..repeat();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final colors = WeuraColors.of(context);
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Stack(
      children: [
        // Base background color
        Positioned.fill(
          child: Container(color: colors.background),
        ),

        // Animated aurora
        Positioned.fill(
          child: RepaintBoundary(
            child: AnimatedBuilder(
              animation: _controller,
              builder: (context, _) {
                return CustomPaint(
                  painter: _AuroraPainter(
                    progress: _controller.value,
                    accent: colors.accent,
                    glow: colors.accentGlow,
                    intensity: widget.intensity,
                    isDark: isDark,
                  ),
                );
              },
            ),
          ),
        ),

        // Content
        widget.child,
      ],
    );
  }
}

class _AuroraPainter extends CustomPainter {
  _AuroraPainter({
    required this.progress,
    required this.accent,
    required this.glow,
    required this.intensity,
    required this.isDark,
  });

  final double progress;
  final Color accent;
  final Color glow;
  final double intensity;
  final bool isDark;

  @override
  void paint(Canvas canvas, Size size) {
    final t = progress * 2 * math.pi;

    // Base intensity (lighter in light mode)
    final baseOpacity = (isDark ? 0.28 : 0.16) * intensity;

    // ── Blob 1: top-left, moves slowly right ──
    _paintBlob(
      canvas: canvas,
      center: Offset(
        size.width * (0.15 + 0.10 * math.sin(t)),
        size.height * (0.10 + 0.05 * math.cos(t * 0.7)),
      ),
      radius: size.width * 0.65,
      color: glow.withValues(alpha: baseOpacity),
    );

    // ── Blob 2: bottom-right, opposite motion ──
    _paintBlob(
      canvas: canvas,
      center: Offset(
        size.width * (0.85 + 0.10 * math.cos(t * 0.9)),
        size.height * (0.90 + 0.06 * math.sin(t * 0.6)),
      ),
      radius: size.width * 0.75,
      color: accent.withValues(alpha: baseOpacity * 0.9),
    );

    // ── Blob 3: center-top, tiny accent ──
    _paintBlob(
      canvas: canvas,
      center: Offset(
        size.width * (0.55 + 0.15 * math.sin(t * 0.5 + 1.2)),
        size.height * (0.35 + 0.10 * math.cos(t * 0.8)),
      ),
      radius: size.width * 0.55,
      color: glow.withValues(alpha: baseOpacity * 0.5),
    );
  }

  void _paintBlob({
    required Canvas canvas,
    required Offset center,
    required double radius,
    required Color color,
  }) {
    final paint = Paint()
      ..shader = RadialGradient(
        colors: [
          color,
          color.withValues(alpha: color.a * 0.4),
          color.withValues(alpha: 0.0),
        ],
        stops: const [0.0, 0.5, 1.0],
      ).createShader(
        Rect.fromCircle(center: center, radius: radius),
      );

    canvas.drawCircle(center, radius, paint);
  }

  @override
  bool shouldRepaint(covariant _AuroraPainter oldDelegate) {
    return oldDelegate.progress != progress ||
        oldDelegate.isDark != isDark;
  }
}