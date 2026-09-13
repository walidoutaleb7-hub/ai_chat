import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

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

  @override
  void initState() {
    super.initState();

    _logoController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1500),
    );

    _orbController = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 5),
    )..repeat();

    _fadeController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 700),
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
    await _logoController.forward();

    await Future<void>.delayed(
      const Duration(milliseconds: 900),
    );

    if (!mounted) return;

    await _fadeController.forward();

    if (!mounted) return;

    widget.onFinished?.call();
  }

  @override
  void dispose() {
    _logoController.dispose();
    _orbController.dispose();
    _fadeController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF03040A),
      body: Stack(
        fit: StackFit.expand,
        children: [
          const _BackgroundGlow(),

          AnimatedBuilder(
            animation: _orbController,
            builder: (context, child) {
              final angle =
                  _orbController.value * math.pi * 2;

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
                      color: const Color(0xFF2563EB)
                          .withValues(alpha: 0.12),
                      blurRadius: 90,
                      spreadRadius: 25,
                    ),
                  ],
                ),
              ),
            ),
          ),

          Center(
            child: AnimatedBuilder(
              animation: _logoController,
              builder: (context, child) {
                return Opacity(
                  opacity: _logoOpacity.value,
                  child: Transform.scale(
                    scale: 0.72 +
                        (_logoScale.value * 0.28),
                    child: child,
                  ),
                );
              },
              child: _buildLogo(),
            ),
          ),

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
            child: Container(
              color: const Color(0xFF03040A),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildLogo() {
    return Container(
      width: 104,
      height: 104,
      padding: const EdgeInsets.all(22),
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: const Color(0xFF080B14),
        border: Border.all(
          color: const Color(0xFF3B82F6)
              .withValues(alpha: 0.22),
          width: 1,
        ),
        boxShadow: [
          BoxShadow(
            color: const Color(0xFF2563EB)
                .withValues(alpha: 0.20),
            blurRadius: 45,
            spreadRadius: 4,
          ),
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.45),
            blurRadius: 30,
          ),
        ],
      ),
      child: _logoAsset(),
    );
  }

  Widget _logoAsset() {
    // Uses the first available WEURA logo asset.
    // If your logo filename is different, change only this path.
    return SvgPicture.asset(
      'assets/logo/weura.svg',
      fit: BoxFit.contain,
    );
  }
}

class _BackgroundGlow extends StatelessWidget {
  const _BackgroundGlow();

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        Positioned(
          top: -180,
          left: -120,
          child: _glow(
            size: 360,
            opacity: 0.10,
          ),
        ),
        Positioned(
          bottom: -200,
          right: -130,
          child: _glow(
            size: 390,
            opacity: 0.08,
          ),
        ),
        Positioned.fill(
          child: CustomPaint(
            painter: _GridPainter(),
          ),
        ),
      ],
    );
  }

  Widget _glow({
    required double size,
    required double opacity,
  }) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        boxShadow: [
          BoxShadow(
            color: const Color(0xFF2563EB)
                .withValues(alpha: opacity),
            blurRadius: 150,
            spreadRadius: 20,
          ),
        ],
      ),
    );
  }
}

class _GridPainter extends CustomPainter {
  @override
  void paint(
    Canvas canvas,
    Size size,
  ) {
    final paint = Paint()
      ..color = const Color(0xFF3B82F6)
          .withValues(alpha: 0.018)
      ..strokeWidth = 1;

    const spacing = 42.0;

    for (
      double x = 0;
      x <= size.width;
      x += spacing
    ) {
      canvas.drawLine(
        Offset(x, 0),
        Offset(x, size.height),
        paint,
      );
    }

    for (
      double y = 0;
      y <= size.height;
      y += spacing
    ) {
      canvas.drawLine(
        Offset(0, y),
        Offset(size.width, y),
        paint,
      );
    }
  }

  @override
  bool shouldRepaint(
    covariant CustomPainter oldDelegate,
  ) {
    return false;
  }
}