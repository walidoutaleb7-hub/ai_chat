import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../../core/Theme/weura_theme.dart';


class WeuraThinking extends StatefulWidget {
  const WeuraThinking({required this.colors});

  final WeuraColors colors;

  @override
  State<WeuraThinking> createState() => WeuraThinkingState();
}

class WeuraThinkingState extends State<WeuraThinking>
    with TickerProviderStateMixin {
  late final AnimationController _rotateController;
  late final AnimationController _pulseController;
  late final AnimationController _waveController;
  late final AnimationController _particleController;
  late final AnimationController _shimmerController;
  late final AnimationController _breatheController;

  @override
  void initState() {
    super.initState();

    _rotateController = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 6),
    )..repeat();

    _pulseController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1400),
    )..repeat(reverse: true);

    _waveController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 2400),
    )..repeat();

    _particleController = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 4),
    )..repeat();

    _shimmerController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 2200),
    )..repeat();

    _breatheController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 2600),
    )..repeat(reverse: true);
  }

  @override
  void dispose() {
    _rotateController.dispose();
    _pulseController.dispose();
    _waveController.dispose();
    _particleController.dispose();
    _shimmerController.dispose();
    _breatheController.dispose();
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
          right: 40,
          top: 8,
          left: 4,
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
              colors.surface.withValues(alpha: 0.85),
              colors.surfaceAlt.withValues(alpha: 0.85),
              colors.surface.withValues(alpha: 0.85),
            ],
            stops: const [0.0, 0.5, 1.0],
          ),
          borderRadius: BorderRadius.circular(24),
          border: Border.all(
            color: colors.accentGlow.withValues(alpha: 0.30),
            width: 1.2,
          ),
          boxShadow: [
            BoxShadow(
              color: colors.accentGlow.withValues(alpha: 0.20),
              blurRadius: 32,
              spreadRadius: 2,
              offset: const Offset(0, 8),
            ),
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.20),
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
              width: 240,
              height: 150,
              child: RepaintBoundary(
                child: AnimatedBuilder(
                  animation: Listenable.merge([
                    _rotateController,
                    _pulseController,
                    _waveController,
                    _particleController,
                    _breatheController,
                  ]),
                  builder: (context, _) {
                    return CustomPaint(
                      painter: WeuraThinkingPainter(
                        rotation: _rotateController.value,
                        pulse: _pulseController.value,
                        wave: _waveController.value,
                        particle: _particleController.value,
                        breathe: _breatheController.value,
                        primary: colors.accent,
                        glow: colors.accentGlow,
                      ),
                    );
                  },
                ),
              ),
            ),
            const SizedBox(height: 10),
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
                        colors.textSecondary.withValues(alpha: 0.45),
                        colors.textPrimary,
                        colors.accentGlow,
                        colors.textPrimary,
                        colors.textSecondary.withValues(alpha: 0.45),
                      ],
                      stops: const [0.0, 0.3, 0.5, 0.7, 1.0],
                    ).createShader(bounds);
                  },
                  child: Text(
                    'WEURA is thinking...',
                    style: TextStyle(
                      color: colors.textPrimary,
                      fontSize: 14.5,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 0.6,
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
                            color: colors.accentGlow
                                .withValues(alpha: opacity),
                            boxShadow: [
                              BoxShadow(
                                color: colors.accentGlow
                                    .withValues(alpha: opacity * 0.6),
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
}

class WeuraThinkingPainter extends CustomPainter {
  WeuraThinkingPainter({
    required this.rotation,
    required this.pulse,
    required this.wave,
    required this.particle,
    required this.breathe,
    required this.primary,
    required this.glow,
  });

  final double rotation;
  final double pulse;
  final double wave;
  final double particle;
  final double breathe;
  final Color primary;
  final Color glow;

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final maxR = math.min(size.width, size.height) / 2;

    for (int i = 0; i < 3; i++) {
      final phase = (wave + i / 3.0) % 1.0;
      final r = maxR * 0.30 + phase * maxR * 0.70;
      final opacity = (1.0 - phase) * 0.35;
      canvas.drawCircle(
        center,
        r,
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = 1.5
          ..color = glow.withValues(alpha: opacity),
      );
    }

    _drawArcRing(
      canvas,
      center,
      maxR * 0.90,
      rotation,
      glow.withValues(alpha: 0.55),
      2.0,
      3,
    );

    _drawArcRing(
      canvas,
      center,
      maxR * 0.70,
      -rotation * 1.5,
      primary.withValues(alpha: 0.75),
      2.5,
      4,
    );

    _drawArcRing(
      canvas,
      center,
      maxR * 0.50,
      rotation * 2.2,
      glow.withValues(alpha: 0.90),
      2.0,
      2,
    );

    const particleCount = 6;
    for (int i = 0; i < particleCount; i++) {
      final angle =
          (i / particleCount) * 2 * math.pi + particle * 2 * math.pi;
      final r = maxR * 0.80;
      final pos = Offset(
        center.dx + r * math.cos(angle),
        center.dy + r * math.sin(angle),
      );
      final s = 2.5 + math.sin(particle * 2 * math.pi + i) * 1.5;

      canvas.drawCircle(
        pos,
        s * 3.0,
        Paint()..color = glow.withValues(alpha: 0.25),
      );
      canvas.drawCircle(
        pos,
        s,
        Paint()..color = Colors.white.withValues(alpha: 0.95),
      );
    }

    final coreR = maxR * (0.30 + pulse * 0.10);
    final corePaint = Paint()
      ..shader = RadialGradient(
        colors: [
          Colors.white.withValues(alpha: 0.95),
          glow,
          primary.withValues(alpha: 0.5),
          primary.withValues(alpha: 0.0),
        ],
        stops: const [0.0, 0.25, 0.55, 1.0],
      ).createShader(
        Rect.fromCircle(center: center, radius: coreR * 2.4),
      );
    canvas.drawCircle(center, coreR * 2.4, corePaint);

    canvas.drawCircle(
      center,
      coreR * 0.55,
      Paint()..color = Colors.white.withValues(alpha: 0.98),
    );

    for (int i = 0; i < 8; i++) {
      final angle = (i / 8) * 2 * math.pi + rotation * 3;
      final r = maxR * 0.55;
      final pos = Offset(
        center.dx + r * math.cos(angle),
        center.dy + r * math.sin(angle),
      );
      final sp = math.sin(breathe * math.pi * 2 + i) * 0.5 + 0.5;
      final len = 3 + sp * 4;

      final sparklePaint = Paint()
        ..color = Colors.white.withValues(alpha: sp * 0.75)
        ..strokeWidth = 1.6
        ..strokeCap = StrokeCap.round;

      canvas.drawLine(
        Offset(pos.dx - len, pos.dy),
        Offset(pos.dx + len, pos.dy),
        sparklePaint,
      );
      canvas.drawLine(
        Offset(pos.dx, pos.dy - len),
        Offset(pos.dx, pos.dy + len),
        sparklePaint,
      );
    }
  }

  void _drawArcRing(
    Canvas canvas,
    Offset center,
    double radius,
    double rotation,
    Color color,
    double strokeWidth,
    int segments,
  ) {
    final paint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = strokeWidth
      ..strokeCap = StrokeCap.round
      ..color = color;

    for (int i = 0; i < segments; i++) {
      final startAngle =
          (i / segments) * 2 * math.pi + rotation * 2 * math.pi;
      final sweep = (2 * math.pi / segments) * 0.70;
      canvas.drawArc(
        Rect.fromCircle(center: center, radius: radius),
        startAngle,
        sweep,
        false,
        paint,
      );
    }
  }

  @override
  bool shouldRepaint(covariant WeuraThinkingPainter oldDelegate) {
    return oldDelegate.rotation != rotation ||
        oldDelegate.pulse != pulse ||
        oldDelegate.wave != wave ||
        oldDelegate.particle != particle ||
        oldDelegate.breathe != breathe;
  }
}
