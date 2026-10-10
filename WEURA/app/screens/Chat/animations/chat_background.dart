import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../../core/Theme/weura_theme.dart';


class ChatBackground extends StatefulWidget {
  const ChatBackground({required this.colors});

  final WeuraColors colors;

  @override
  State<ChatBackground> createState() => ChatBackgroundState();
}

class ChatBackgroundState extends State<ChatBackground>
    with WidgetsBindingObserver {
  // 30 fps tick — smooth enough, light on Mali-G57.
  static const Duration _tick = Duration(milliseconds: 33);
  Timer? _timer;
  double _aurora = 0.0;
  double _stars = 0.0;
  double _twinkle = 0.0;
  int _frame = 0;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _startTimer();
  }

  @override
  void dispose() {
    _stopTimer();
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _startTimer();
    } else {
      _stopTimer();
    }
  }

  void _startTimer() {
    _timer?.cancel();
    _timer = Timer.periodic(_tick, (_) {
      if (!mounted) return;
      _frame++;
      // Aurora only updates every 6 frames (~5fps) — it's slow blobs.
      final updateAurora = _frame % 6 == 0;
      setState(() {
        if (updateAurora) {
          _aurora = (_aurora + 6 / (18 * 30)) % 1.0;
        }
        _stars = (_stars + 1 / (60 * 30)) % 1.0;
        _twinkle = (_twinkle + 1 / (3 * 30)) % 1.0;
      });
    });
  }

  void _stopTimer() {
    _timer?.cancel();
    _timer = null;
  }

  @override
  Widget build(BuildContext context) {
    final colors = widget.colors;
    final isDark = Theme.of(context).brightness == Brightness.dark;

    final gradientTop = isDark
        ? const Color(0xFF04060B)
        : const Color(0xFFF8FAFF);
    final gradientMid = isDark
        ? const Color(0xFF060912)
        : const Color(0xFFF0F4FF);
    final gradientBottom = isDark
        ? const Color(0xFF04060B)
        : const Color(0xFFF8FAFF);

    final starColor = isDark
        ? Colors.white
        : const Color(0xFF1A2540);

    final glowOpacity = isDark ? 1.0 : 0.55;
    final vignetteOpacity = isDark ? 0.35 : 0.06;

    return RepaintBoundary(
      child: Container(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [
              gradientTop,
              gradientMid,
              colors.background,
              gradientBottom,
            ],
            stops: const [0.0, 0.3, 0.65, 1.0],
          ),
        ),
        child: Stack(
          children: [
            // Aurora blobs (2) — updated at ~5fps (slow, no need for 30)
            CustomPaint(
              size: Size.infinite,
              painter: AuroraPainter(
                progress: _aurora,
                blue: colors.accent,
                glow: colors.accentGlow,
                intensity: isDark ? 1.0 : 0.55,
              ),
            ),

            // Stars (15) — 30fps tick
            RepaintBoundary(
              child: CustomPaint(
                size: Size.infinite,
                painter: StarsPainter(
                  drift: _stars,
                  twinkle: _twinkle,
                  color: starColor,
                  intensity: isDark ? 1.0 : 0.45,
                ),
              ),
            ),

            // Bottom glow
            Positioned(
              left: 0,
              right: 0,
              bottom: 0,
              height: 240,
              child: IgnorePointer(
                child: Container(
                  decoration: BoxDecoration(
                    gradient: RadialGradient(
                      center: const Alignment(0, 1.2),
                      radius: 0.9,
                      colors: [
                        colors.accent
                            .withValues(alpha: 0.18 * glowOpacity),
                        colors.accent
                            .withValues(alpha: 0.06 * glowOpacity),
                        Colors.transparent,
                      ],
                      stops: const [0.0, 0.5, 1.0],
                    ),
                  ),
                ),
              ),
            ),

            // Top glow
            Positioned(
              left: 0,
              right: 0,
              top: 0,
              height: 180,
              child: IgnorePointer(
                child: Container(
                  decoration: BoxDecoration(
                    gradient: RadialGradient(
                      center: const Alignment(0, -1.5),
                      radius: 1.1,
                      colors: [
                        colors.accentGlow
                            .withValues(alpha: 0.10 * glowOpacity),
                        Colors.transparent,
                      ],
                    ),
                  ),
                ),
              ),
            ),

            // Vignette
            Positioned.fill(
              child: IgnorePointer(
                child: Container(
                  decoration: BoxDecoration(
                    gradient: RadialGradient(
                      center: Alignment.center,
                      radius: 1.0,
                      colors: [
                        Colors.transparent,
                        Colors.black.withValues(alpha: vignetteOpacity),
                      ],
                      stops: const [0.55, 1.0],
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class AuroraPainter extends CustomPainter {
  AuroraPainter({
    required this.progress,
    required this.blue,
    required this.glow,
    this.intensity = 1.0,
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
      cx: size.width * (0.30 + 0.15 * math.sin(t)),
      cy: size.height * (0.20 + 0.10 * math.cos(t * 0.8)),
      radius: size.width * 0.60,
      color: blue.withValues(alpha: 0.16 * intensity),
    );

    _blob(
      canvas,
      size,
      cx: size.width * (0.75 + 0.10 * math.cos(t * 0.7)),
      cy: size.height * (0.45 + 0.12 * math.sin(t * 0.9)),
      radius: size.width * 0.55,
      color: glow.withValues(alpha: 0.14 * intensity),
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
        colors: [
          color,
          color.withValues(alpha: 0.0),
        ],
      ).createShader(
        Rect.fromCircle(center: Offset(cx, cy), radius: radius),
      );

    canvas.drawCircle(Offset(cx, cy), radius, paint);
  }

  @override
  bool shouldRepaint(covariant AuroraPainter oldDelegate) {
    return oldDelegate.progress != progress ||
        oldDelegate.intensity != intensity;
  }
}

class StarsPainter extends CustomPainter {
  StarsPainter({
    required this.drift,
    required this.twinkle,
    required this.color,
    this.intensity = 1.0,
  });

  final double drift;
  final double twinkle;
  final Color color;
  final double intensity;

  // 15 stars — smooth 60fps target.
  static final List<StarSeed> _stars = _generateStars();

  static List<StarSeed> _generateStars() {
    final rnd = math.Random(42);
    return List.generate(15, (i) {
      return StarSeed(
        x: rnd.nextDouble(),
        y: rnd.nextDouble(),
        size: 1.2 + rnd.nextDouble() * 1.6,
        phase: rnd.nextDouble(),
      );
    });
  }

  @override
  void paint(Canvas canvas, Size size) {
    for (final star in _stars) {
      // Gentle vertical drift.
      final y = (star.y - drift * 0.5 + 1.0) % 1.0;

      final tw = 0.4 +
          0.6 *
              math.sin(
                (twinkle + star.phase) * 2 * math.pi,
              );

      final pos = Offset(star.x * size.width, y * size.height);

      // Outer halo — soft, breathing.
      canvas.drawCircle(
        pos,
        star.size * 3.0,
        Paint()
          ..color = color.withValues(alpha: 0.12 * tw * intensity),
      );

      // Mid glow — adds depth.
      canvas.drawCircle(
        pos,
        star.size * 1.6,
        Paint()
          ..color = color.withValues(alpha: 0.35 * tw * intensity),
      );

      // Bright core — visible.
      canvas.drawCircle(
        pos,
        star.size * 0.55,
        Paint()
          ..color = color.withValues(alpha: 0.95 * tw * intensity),
      );
    }
  }

  @override
  bool shouldRepaint(covariant StarsPainter oldDelegate) {
    return oldDelegate.drift != drift ||
        oldDelegate.twinkle != twinkle ||
        oldDelegate.intensity != intensity;
  }
}

class StarSeed {
  const StarSeed({
    required this.x,
    required this.y,
    required this.size,
    required this.phase,
  });

  final double x;
  final double y;
  final double size;
  final double phase;
}
