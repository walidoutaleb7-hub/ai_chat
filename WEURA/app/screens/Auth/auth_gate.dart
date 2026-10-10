import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

import '../../core/Theme/weura_theme.dart';
import '../Home/home.dart';
import '../Splash/splash.dart';
import 'login_screen.dart';

/// Listens to Firebase auth state and shows:
///   - Splash first (once)
///   - LoginScreen if user signed out
///   - HomeScreen if user signed in
class AuthGate extends StatefulWidget {
  const AuthGate({super.key});

  @override
  State<AuthGate> createState() => _AuthGateState();
}

class _AuthGateState extends State<AuthGate> {
  bool _showSplash = true;

  @override
  Widget build(BuildContext context) {
    if (_showSplash) {
      return SplashScreen(
        onFinished: () {
          if (mounted) setState(() => _showSplash = false);
        },
      );
    }

    return StreamBuilder<User?>(
      stream: FirebaseAuth.instance.authStateChanges(),
      builder: (context, snapshot) {
        // Still loading → show dark empty screen
        if (snapshot.connectionState == ConnectionState.waiting) {
          final colors = WeuraColors.of(context);
          return Scaffold(
            backgroundColor: colors.background,
            body: Center(
              child: SizedBox(
                width: 26,
                height: 26,
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  color: colors.accentGlow,
                ),
              ),
            ),
          );
        }

        if (snapshot.hasData) {
          return const HomeScreen();
        }

        return const LoginScreen();
      },
    );
  }
}
