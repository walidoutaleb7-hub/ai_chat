import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../../core/Theme/weura_theme.dart';


class ImageGeneratingLoader extends StatefulWidget {
  const ImageGeneratingLoader({required this.colors});

  final WeuraColors colors;

  @override
  State<ImageGeneratingLoader> createState() =>
      ImageGeneratingLoaderState();
}

class ImageGeneratingLoaderState extends State<ImageGeneratingLoader>
    with TickerProviderStateMixin {
  late final AnimationController _pulseController;
  late final AnimationController _rotateController;
  late final AnimationController _sparkleController;
  late final AnimationController _progressController;

  @override
  void initState() {
    super.initState();

    _pulseController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1400),
    );
    _pulseController.value = 0.5;
    _pulseController.repeat(reverse: true);

    _rotateController = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 5),
    );
    _rotateController.value = 0.3;
    _rotateController.repeat();

    _sparkleController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1800),
    );
    _sparkleController.value = 0.4;
    _sparkleController.repeat();

    _progressController = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 4),
    );
    _progressController.value = 0.5;
    _progressController.repeat();
  }

  @override
  void dispose() {
    _pulseController.dispose();
    _rotateController.dispose();
    _sparkleController.dispose();
    _progressController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final colors = widget.colors;

    return RepaintBoundary(
      child: Container(
        width: 320,
        height: 320,
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          color: colors.surfaceAlt,
          borderRadius: BorderRadius.circular(16),
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            SizedBox(
              width: 170,
              height: 170,
              child: AnimatedBuilder(
                animation: Listenable.merge([
                  _pulseController,
                  _rotateController,
                  _sparkleController,
                ]),
                builder: (context, _) {
                  return CustomPaint(
                    painter: ImageLoadingPainter(
                      progress: _pulseController.value,
                      rotation: _rotateController.value,
                      sparkle: _sparkleController.value,
                      glow: colors.accentGlow,
                      accent: colors.accent,
                    ),
                  );
                },
              ),
            ),
            const SizedBox(height: 22),
            Text(
              'Creating your image',
              style: TextStyle(
                color: colors.textPrimary,
                fontSize: 14,
                fontWeight: FontWeight.w700,
                letterSpacing: 0.4,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              'This can take 5-15 seconds',
              style: TextStyle(
                color: colors.textMuted,
                fontSize: 12,
              ),
            ),
            const SizedBox(height: 16),
            SizedBox(
              width: 160,
              height: 4,
              child: AnimatedBuilder(
                animation: _progressController,
                builder: (context, _) {
                  return ClipRRect(
                    borderRadius: BorderRadius.circular(2),
                    child: Stack(
                      children: [
                        Container(color: colors.surface),
                        FractionallySizedBox(
                          widthFactor: 0.35,
                          alignment: Alignment(
                            -1.0 + (_progressController.value * 2.4),
                            0,
                          ),
                          child: Container(
                            decoration: BoxDecoration(
                              gradient: LinearGradient(
                                colors: [
                                  colors.accentGlow
                                      .withValues(alpha: 0.0),
                                  colors.accentGlow,
                                  colors.accentGlow
                                      .withValues(alpha: 0.0),
                                ],
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class ImageLoadingPainter extends CustomPainter {
  ImageLoadingPainter({
    required this.progress,
    required this.rotation,
    required this.sparkle,
    required this.glow,
    required this.accent,
  });

  final double progress;
  final double rotation;
  final double sparkle;
  final Color glow;
  final Color accent;

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final baseRadius = size.width / 2;

    _paintDashedRing(
      canvas,
      center,
      baseRadius * 0.95,
      rotation,
      accent.withValues(alpha: 0.85),
      strokeWidth: 3,
    );

    _paintDashedRing(
      canvas,
      center,
      baseRadius * 0.72,
      -rotation * 1.4,
      glow.withValues(alpha: 0.6),
      strokeWidth: 2.5,
    );

    final pulseRadius = baseRadius * (0.55 + progress * 0.22);
    final haloPaint = Paint()
      ..shader = RadialGradient(
        colors: [
          glow.withValues(alpha: 0.55 * (0.6 + progress * 0.4)),
          glow.withValues(alpha: 0.0),
        ],
      ).createShader(
        Rect.fromCircle(center: center, radius: pulseRadius),
      );
    canvas.drawCircle(center, pulseRadius, haloPaint);

    final corePaint = Paint()..color = accent.withValues(alpha: 1.0);
    canvas.drawCircle(center, baseRadius * 0.40, corePaint);

    final highlightPaint = Paint()
      ..color = Colors.white.withValues(alpha: 0.55);
    canvas.drawCircle(
      Offset(
        center.dx - baseRadius * 0.08,
        center.dy - baseRadius * 0.08,
      ),
      baseRadius * 0.20,
      highlightPaint,
    );

    _paintBrushIcon(canvas, center, baseRadius * 0.45);
    _paintSparkles(canvas, center, baseRadius * 0.88, sparkle);
  }

  void _paintDashedRing(
    Canvas canvas,
    Offset center,
    double radius,
    double rotation,
    Color color, {
    double strokeWidth = 2.5,
  }) {
    const segments = 24;
    const gapFactor = 0.55;

    final paint = Paint()
      ..color = color
      ..strokeWidth = strokeWidth
      ..strokeCap = StrokeCap.round
      ..style = PaintingStyle.stroke;

    for (int i = 0; i < segments; i++) {
      final startAngle =
          (i / segments) * 2 * math.pi + rotation * 2 * math.pi;
      final sweep = (2 * math.pi / segments) * gapFactor;

      canvas.drawArc(
        Rect.fromCircle(center: center, radius: radius),
        startAngle,
        sweep,
        false,
        paint,
      );
    }
  }

  void _paintSparkles(
    Canvas canvas,
    Offset center,
    double radius,
    double progress,
  ) {
    const sparkleCount = 8;

    for (int i = 0; i < sparkleCount; i++) {
      final baseAngle = (i / sparkleCount) * 2 * math.pi;
      final phase = (progress + i / sparkleCount) % 1.0;
      final scale = phase < 0.5 ? phase * 2 : (1 - phase) * 2;

      if (scale < 0.15) continue;

      final offset = Offset(
        center.dx + radius * math.cos(baseAngle),
        center.dy + radius * math.sin(baseAngle),
      );

      final sparklePaint = Paint()
        ..color = glow.withValues(alpha: scale * 1.0)
        ..strokeWidth = 2.5
        ..strokeCap = StrokeCap.round;

      final armLength = 5.0 * scale;

      canvas.drawLine(
        Offset(offset.dx - armLength, offset.dy),
        Offset(offset.dx + armLength, offset.dy),
        sparklePaint,
      );
      canvas.drawLine(
        Offset(offset.dx, offset.dy - armLength),
        Offset(offset.dx, offset.dy + armLength),
        sparklePaint,
      );
    }
  }

  void _paintBrushIcon(Canvas canvas, Offset center, double size) {
    final paint = Paint()
      ..color = Colors.white
      ..style = PaintingStyle.fill;

    final handleRect = Rect.fromCenter(
      center: Offset(center.dx, center.dy + size * 0.20),
      width: size * 0.20,
      height: size * 0.70,
    );
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        handleRect,
        Radius.circular(size * 0.08),
      ),
      paint,
    );

    final bristlesPath = Path()
      ..moveTo(center.dx - size * 0.28, center.dy - size * 0.30)
      ..lineTo(center.dx + size * 0.28, center.dy - size * 0.30)
      ..lineTo(center.dx, center.dy - size * 0.85)
      ..close();
    canvas.drawPath(bristlesPath, paint);
  }

  @override
  bool shouldRepaint(covariant ImageLoadingPainter oldDelegate) {
    return oldDelegate.progress != progress ||
        oldDelegate.rotation != rotation ||
        oldDelegate.sparkle != sparkle;
  }
}
