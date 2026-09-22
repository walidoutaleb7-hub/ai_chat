import 'dart:math' as math;

import 'package:flutter/material.dart';

/// خلفية إسلامية أنيقة — نقوش هندسية + تدرج أخضر
class IslamicBackground extends StatelessWidget {
  const IslamicBackground({
    super.key,
    required this.child,
  });

  final Widget child;

  @override
  Widget build(BuildContext context) {
    const darkGreen = Color(0xFF0A2A1F);
    const deepGreen = Color(0xFF04160F);
    const gold = Color(0xFFD4AF37);

    return RepaintBoundary(
      child: DecoratedBox(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [deepGreen, darkGreen, deepGreen],
            stops: [0.0, 0.5, 1.0],
          ),
        ),
        child: Stack(
          children: [
            // نقوش هندسية
            Positioned.fill(
              child: IgnorePointer(
                child: CustomPaint(
                  painter: _IslamicPatternPainter(
                    color: gold.withValues(alpha: 0.05),
                  ),
                ),
              ),
            ),

            // توهج ذهبي خفيف
            Positioned(
              top: -100,
              right: -100,
              child: Container(
                width: 300,
                height: 300,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  boxShadow: [
                    BoxShadow(
                      color: gold.withValues(alpha: 0.10),
                      blurRadius: 150,
                      spreadRadius: 30,
                    ),
                  ],
                ),
              ),
            ),

            // توهج أخضر سفلي
            Positioned(
              bottom: -120,
              left: -80,
              child: Container(
                width: 320,
                height: 320,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  boxShadow: [
                    BoxShadow(
                      color: const Color(0xFF0B6E4F)
                          .withValues(alpha: 0.15),
                      blurRadius: 180,
                      spreadRadius: 40,
                    ),
                  ],
                ),
              ),
            ),

            Positioned.fill(child: child),
          ],
        ),
      ),
    );
  }
}

class _IslamicPatternPainter extends CustomPainter {
  _IslamicPatternPainter({required this.color});

  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..strokeWidth = 1.0
      ..style = PaintingStyle.stroke;

    // شبكة نجوم إسلامية (Octagram)
    const spacing = 90.0;

    for (double x = 0; x < size.width + spacing; x += spacing) {
      for (double y = 0; y < size.height + spacing; y += spacing) {
        _drawOctagram(
          canvas,
          Offset(x, y),
          22,
          paint,
        );
      }
    }
  }

  /// نجمة 8 رؤوس
  void _drawOctagram(
    Canvas canvas,
    Offset center,
    double radius,
    Paint paint,
  ) {
    final path = Path();
    const points = 8;
    for (int i = 0; i < points; i++) {
      final angle = (i / points) * 2 * math.pi - math.pi / 2;
      final r = i.isEven ? radius : radius * 0.55;
      final p = Offset(
        center.dx + r * math.cos(angle),
        center.dy + r * math.sin(angle),
      );
      if (i == 0) {
        path.moveTo(p.dx, p.dy);
      } else {
        path.lineTo(p.dx, p.dy);
      }
    }
    path.close();
    canvas.drawPath(path, paint);
  }

  @override
  bool shouldRepaint(covariant _IslamicPatternPainter oldDelegate) {
    return oldDelegate.color != color;
  }
}