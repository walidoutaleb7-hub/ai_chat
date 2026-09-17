import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

import '../../core/Theme/weura_theme.dart';

class SplashScreen extends StatefulWidget {
  const SplashScreen({
    super.key,
    this.onFinished,
  });

  final VoidCallback? onFinished;

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen>
    with TickerProviderStateMixin {
  late final AnimationController _logoController;
  late final AnimationController _orbController;
  late final AnimationController _fadeController;

  late final Animation<double> _logoScale;
  late final Animation<double> _logoOpacity;
  late final Animation<double> _fadeOpacity;

  bool _completed = false;

  @override
  void initState() {
    super.initState();

    _logoController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1200),
    );

    _orbController = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 5),
    )..repeat();

    _fadeController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 600),
    );

    _logoScale = CurvedAnimation(
      parent: _logoController,
      curve: Curves.easeOutBack,
    );

    _logoOpacity = CurvedAnimation(
      parent: _logoController,
      curve: const Interval(
        0.0,
        0.65,
        curve: Curves.easeOut,
      ),
    );

    _fadeOpacity = CurvedAnimation(
      parent: _fadeController,
      curve: Curves.easeInOut,
    );

    _start();
  }

  Future<void> _start() async {
    if (_completed) return;

    try {
      await _logoController.forward();

      await Future<void>.delayed(
        const Duration(milliseconds: 700),
      );

      if (!mounted || _completed) return;

      await _fadeController.forward();

      if (!mounted || _completed) return;

      _completed = true;
      widget.onFinished?.call();
    } catch (_) {
      // Fail-safe: go to home screen even if animation fails.
      if (!mounted || _completed) return;
      _completed = true;
      widget.onFinished?.call();
    }
  }

  @override
  void dispose() {
    _completed = true;
    _logoController.dispose();
    _orbController.dispose();
    _fadeController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final colors = WeuraColors.of(context);
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Scaffold(
      backgroundColor: colors.background,
      body: Stack(
        fit: StackFit.expand,
        children: [
          _BackgroundGlow(colors: colors, isDark: isDark),

          // Orbiting glow
          AnimatedBuilder(
            animation: _orbController,
            builder: (context, child) {
              final angle = _orbController.value * math.pi * 2;

              return Transform.translate(
                offset: Offset(
                  math.cos(angle) * 18,
                  math.sin(angle) * 12,
                ),
                child: child,
              );
            },
            child: Center(
              child: Container(
                width: 190,
                height: 190,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  boxShadow: [
                    BoxShadow(
                      color: colors.accent.withValues(alpha: 0.12),
                      blurRadius: 90,
                      spreadRadius: 25,
                    ),
                  ],
                ),
              ),
            ),
          ),

          // Logo
          Center(
            child: AnimatedBuilder(
              animation: _logoController,
              builder: (context, child) {
                return Opacity(
                  opacity: _logoOpacity.value,
                  child: Transform.scale(
                    scale: 0.72 + (_logoScale.value * 0.28),
                    child: child,
                  ),
                );
              },
              child: _buildLogo(colors),
            ),
          ),

          // Fade-out overlay
          AnimatedBuilder(
            animation: _fadeController,
            builder: (context, child) {
              return IgnorePointer(
                child: Opacity(
                  opacity: _fadeOpacity.value,
                  child: child,
                ),
              );
            },
            child: Container(color: colors.background),
          ),
        ],
      ),
    );
  }

  Widget _buildLogo(WeuraColors colors) {
    return Container(
      width: 104,
      height: 104,
      padding: const EdgeInsets.all(22),
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: colors.surface,
        border: Border.all(
          color: colors.accentGlow.withValues(alpha: 0.22),
          width: 1,
        ),
        boxShadow: [
          BoxShadow(
            color: colors.accent.withValues(alpha: 0.20),
            blurRadius: 45,
            spreadRadius: 4,
          ),
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.15),
            blurRadius: 30,
          ),
        ],
      ),
      child: SvgPicture.asset(
        'assets/logo/weura.svg',
        fit: BoxFit.contain,
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Background glow
// ---------------------------------------------------------------------------

class _BackgroundGlow extends StatelessWidget {
  const _BackgroundGlow({
    required this.colors,
    required this.isDark,
  });

  final WeuraColors colors;
  final bool isDark;

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        Positioned(
          top: -180,
          left: -120,
          child: _glow(size: 360, opacity: isDark ? 0.10 : 0.14),
        ),
        Positioned(
          bottom: -200,
          right: -130,
          child: _glow(size: 390, opacity: isDark ? 0.08 : 0.12),
        ),
        Positioned.fill(
          child: CustomPaint(
            painter: _GridPainter(
              color: colors.accentGlow.withValues(
                alpha: isDark ? 0.018 : 0.035,
              ),
            ),
          ),
        ),
      ],
    );
  }

  Widget _glow({required double size, required double opacity}) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        boxShadow: [
          BoxShadow(
            color: colors.accent.withValues(alpha: opacity),
            blurRadius: 150,
            spreadRadius: 20,
          ),
        ],
      ),
    );
  }
}

class _GridPainter extends CustomPainter {
  _GridPainter({required this.color});

  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..strokeWidth = 1;

    const spacing = 42.0;

    for (double x = 0; x <= size.width; x += spacing) {
      canvas.drawLine(
        Offset(x, 0),
        Offset(x, size.height),
        paint,
      );
    }

    for (double y = 0; y <= size.height; y += spacing) {
      canvas.drawLine(
        Offset(0, y),
        Offset(size.width, y),
        paint,
      );
    }
  }

  @override
  bool shouldRepaint(covariant _GridPainter oldDelegate) {
    return oldDelegate.color != color;
  }
}