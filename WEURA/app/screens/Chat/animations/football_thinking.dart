import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../../core/Theme/weura_theme.dart';


class FootballThinking extends StatefulWidget {
  const FootballThinking({required this.colors});

  final WeuraColors colors;

  @override
  State<FootballThinking> createState() => FootballThinkingState();
}

class FootballThinkingState extends State<FootballThinking>
    with TickerProviderStateMixin {
  late final AnimationController _ballController;
  late final AnimationController _pulseController;
  late final AnimationController _grassController;
  late final AnimationController _lightController;
  late final AnimationController _shimmerController;

  @override
  void initState() {
    super.initState();

    _ballController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1600),
    )..repeat();

    _pulseController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1200),
    )..repeat(reverse: true);

    _grassController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 2400),
    )..repeat();

    _lightController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 900),
    )..repeat(reverse: true);

    _shimmerController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 2200),
    )..repeat();
  }

  @override
  void dispose() {
    _ballController.dispose();
    _pulseController.dispose();
    _grassController.dispose();
    _lightController.dispose();
    _shimmerController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final colors = widget.colors;

    return Align(
      alignment: Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.only(
          bottom: 28,
          left: 4,
          right: 40,
          top: 8,
        ),
        padding: const EdgeInsets.symmetric(
          horizontal: 22,
          vertical: 20,
        ),
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [
              const Color(0xFF08150C).withValues(alpha: 0.92),
              const Color(0xFF0A1018).withValues(alpha: 0.92),
              colors.surface.withValues(alpha: 0.92),
            ],
            stops: const [0.0, 0.5, 1.0],
          ),
          borderRadius: BorderRadius.circular(24),
          border: Border.all(
            color: const Color(0xFF34D399).withValues(alpha: 0.40),
            width: 1.2,
          ),
          boxShadow: [
            BoxShadow(
              color: const Color(0xFF10B981).withValues(alpha: 0.28),
              blurRadius: 36,
              spreadRadius: 3,
              offset: const Offset(0, 8),
            ),
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.22),
              blurRadius: 20,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SizedBox(
              height: 110,
              width: 240,
              child: RepaintBoundary(
                child: Stack(
                  clipBehavior: Clip.none,
                  children: [
                    Positioned(
                      left: 0,
                      right: 0,
                      bottom: 0,
                      child: AnimatedBuilder(
                        animation: _grassController,
                        builder: (context, _) {
                          return CustomPaint(
                            size: const Size(double.infinity, 22),
                            painter: GrassPainter(
                              progress: _grassController.value,
                              color1: const Color(0xFF047857),
                              color2: const Color(0xFF10B981),
                            ),
                          );
                        },
                      ),
                    ),
                    Positioned(
                      left: 0,
                      top: 4,
                      child: AnimatedBuilder(
                        animation: _lightController,
                        builder: (context, _) => _lightBeam(
                          opacity: _lightController.value,
                          color: const Color(0xFFFBBF24),
                          alignLeft: true,
                        ),
                      ),
                    ),
                    Positioned(
                      right: 0,
                      top: 4,
                      child: AnimatedBuilder(
                        animation: _lightController,
                        builder: (context, _) => _lightBeam(
                          opacity: 1.0 - _lightController.value,
                          color: const Color(0xFFFBBF24),
                          alignLeft: false,
                        ),
                      ),
                    ),
                    Align(
                      alignment: Alignment.bottomCenter,
                      child: Padding(
                        padding: const EdgeInsets.only(bottom: 14),
                        child: AnimatedBuilder(
                          animation: _ballController,
                          builder: (context, _) {
                            final t = _ballController.value;
                            return Transform.translate(
                              offset: Offset(
                                0,
                                -6 * math.sin(t * 2 * math.pi),
                              ),
                              child: Transform.rotate(
                                angle: t * 2 * math.pi,
                                child: Transform.scale(
                                  scale: 1.0 +
                                      0.06 * math.sin(t * 2 * math.pi),
                                  child: SizedBox(
                                    width: 52,
                                    height: 52,
                                    child: CustomPaint(
                                      painter: FootballPainter(),
                                    ),
                                  ),
                                ),
                              ),
                            );
                          },
                        ),
                      ),
                    ),
                    Align(
                      alignment: Alignment.bottomCenter,
                      child: Padding(
                        padding: const EdgeInsets.only(bottom: 14),
                        child: AnimatedBuilder(
                          animation: _pulseController,
                          builder: (context, _) {
                            return Opacity(
                              opacity: 1.0 - _pulseController.value,
                              child: Transform.scale(
                                scale: 1.0 + _pulseController.value * 1.1,
                                child: Container(
                                  width: 52,
                                  height: 52,
                                  decoration: BoxDecoration(
                                    shape: BoxShape.circle,
                                    border: Border.all(
                                      color: const Color(0xFF34D399)
                                          .withValues(alpha: 0.65),
                                      width: 1.6,
                                    ),
                                  ),
                                ),
                              ),
                            );
                          },
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 14),
            AnimatedBuilder(
              animation: _shimmerController,
              builder: (context, _) {
                return ShaderMask(
                  blendMode: BlendMode.srcIn,
                  shaderCallback: (bounds) {
                    final t = _shimmerController.value;
                    return LinearGradient(
                      begin: Alignment(-1.0 - t * 2, 0),
                      end: Alignment(1.0 - t * 2, 0),
                      colors: [
                        const Color(0xFF34D399).withValues(alpha: 0.45),
                        Colors.white,
                        const Color(0xFF34D399),
                        Colors.white,
                        const Color(0xFF34D399).withValues(alpha: 0.45),
                      ],
                      stops: const [0.0, 0.3, 0.5, 0.7, 1.0],
                    ).createShader(bounds);
                  },
                  child: const Text(
                    'Football thinking...',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 15.5,
                      fontWeight: FontWeight.w800,
                      letterSpacing: 0.5,
                    ),
                  ),
                );
              },
            ),
            const SizedBox(height: 6),
            Row(
              mainAxisSize: MainAxisSize.min,
              children: List.generate(3, (i) {
                return AnimatedBuilder(
                  animation: _pulseController,
                  builder: (context, _) {
                    final offset = i * 0.18;
                    final v = (_pulseController.value + offset) % 1.0;
                    final opacity = 0.25 + (math.sin(v * math.pi) * 0.75);
                    final scale = 0.85 + (math.sin(v * math.pi) * 0.35);
                    return Padding(
                      padding: EdgeInsets.only(right: i < 2 ? 6 : 0),
                      child: Transform.scale(
                        scale: scale,
                        child: Container(
                          width: 6,
                          height: 6,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            color: const Color(0xFF34D399)
                                .withValues(alpha: opacity),
                            boxShadow: [
                              BoxShadow(
                                color: const Color(0xFF34D399)
                                    .withValues(alpha: opacity * 0.7),
                                blurRadius: 8,
                                spreadRadius: 1,
                              ),
                            ],
                          ),
                        ),
                      ),
                    );
                  },
                );
              }),
            ),
          ],
        ),
      ),
    );
  }

  Widget _lightBeam({
    required double opacity,
    required Color color,
    required bool alignLeft,
  }) {
    return Opacity(
      opacity: opacity.clamp(0.15, 1.0),
      child: Transform.rotate(
        angle: alignLeft ? 0.6 : -0.6,
        child: Container(
          width: 26,
          height: 40,
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: alignLeft
                  ? Alignment.topRight
                  : Alignment.topLeft,
              end: alignLeft
                  ? Alignment.bottomLeft
                  : Alignment.bottomRight,
              colors: [
                color.withValues(alpha: 0.90),
                color.withValues(alpha: 0.0),
              ],
            ),
            borderRadius: BorderRadius.circular(6),
          ),
        ),
      ),
    );
  }
}

class GrassPainter extends CustomPainter {
  GrassPainter({
    required this.progress,
    required this.color1,
    required this.color2,
  });

  final double progress;
  final Color color1;
  final Color color2;

  @override
  void paint(Canvas canvas, Size size) {
    final basePaint = Paint()
      ..shader = LinearGradient(
        begin: Alignment.topCenter,
        end: Alignment.bottomCenter,
        colors: [color1.withValues(alpha: 0.0), color2],
      ).createShader(Rect.fromLTWH(0, 0, size.width, size.height));
    canvas.drawRect(
      Rect.fromLTWH(0, 0, size.width, size.height),
      basePaint,
    );

    final bladePaint = Paint()
      ..color = color2
      ..strokeWidth = 1.4
      ..strokeCap = StrokeCap.round;

    const count = 40;
    for (int i = 0; i < count; i++) {
      final x = (i / count) * size.width;
      final phase = (progress + i / count) % 1.0;
      final h = 4 + (math.sin(phase * math.pi * 2) * 0.5 + 0.5) * 8;
      canvas.drawLine(
        Offset(x, size.height),
        Offset(x + math.sin(phase * math.pi * 2) * 1.2, size.height - h),
        bladePaint,
      );
    }
  }

  @override
  bool shouldRepaint(covariant GrassPainter oldDelegate) {
    return oldDelegate.progress != progress;
  }
}

class FootballPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final radius = size.width / 2;

    final ballPaint = Paint()
      ..shader = RadialGradient(
        colors: [
          Colors.white,
          const Color(0xFFE5E7EB),
        ],
      ).createShader(Rect.fromCircle(center: center, radius: radius));
    canvas.drawCircle(center, radius, ballPaint);

    final blackPaint = Paint()..color = const Color(0xFF111827);

    _drawPentagon(canvas, center, radius * 0.32, blackPaint);

    for (int i = 0; i < 5; i++) {
      final angle = (i / 5) * 2 * math.pi - math.pi / 2;
      final pos = Offset(
        center.dx + radius * 0.62 * math.cos(angle),
        center.dy + radius * 0.62 * math.sin(angle),
      );
      _drawPentagon(canvas, pos, radius * 0.22, blackPaint);
    }

    canvas.drawCircle(
      center,
      radius,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1
        ..color = Colors.black.withValues(alpha: 0.15),
    );
  }

  void _drawPentagon(
    Canvas canvas,
    Offset center,
    double radius,
    Paint paint,
  ) {
    final path = Path();
    for (int i = 0; i < 5; i++) {
      final angle = (i / 5) * 2 * math.pi - math.pi / 2;
      final point = Offset(
        center.dx + radius * math.cos(angle),
        center.dy + radius * math.sin(angle),
      );
      if (i == 0) {
        path.moveTo(point.dx, point.dy);
      } else {
        path.lineTo(point.dx, point.dy);
      }
    }
    path.close();
    canvas.drawPath(path, paint);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
