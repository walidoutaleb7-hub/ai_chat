import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';

import 'core/Settings/app_settings.dart';
import 'core/Theme/weura_theme.dart';
import 'screens/Auth/auth_gate.dart';
import 'services/Storage/storage_service.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  String? initError;

  try {
    await Firebase.initializeApp();
  } catch (e, st) {
    initError = 'Firebase: $e';
    debugPrint('[WEURA] Firebase init error: $e');
    debugPrint('$st');
  }

  try {
    await StorageService.init();
    await AppSettingsManager.instance.load();
  } catch (e, st) {
    debugPrint('[WEURA] Storage/Settings error: $e');
    debugPrint('$st');
  }

  runApp(WeuraApp(initError: initError));
}

class WeuraApp extends StatelessWidget {
  const WeuraApp({super.key, this.initError});

  final String? initError;

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: AppSettingsManager.instance,
      builder: (context, _) {
        final settings = AppSettingsManager.instance;

        return MaterialApp(
          key: ValueKey(
            '${settings.effectiveLanguage}-${settings.direction}-${settings.themeMode}',
          ),
          debugShowCheckedModeBanner: false,
          title: 'WEURA AI',
          themeMode: settings.themeMode,
          theme: weuraLightTheme(),
          darkTheme: weuraDarkTheme(),
          home: initError != null
              ? _InitErrorScreen(error: initError!)
              : const AuthGate(),
          builder: (context, child) {
            return Directionality(
              textDirection: settings.textDirection,
              child: child ?? const SizedBox.shrink(),
            );
          },
        );
      },
    );
  }
}

class _InitErrorScreen extends StatelessWidget {
  const _InitErrorScreen({required this.error});

  final String error;

  @override
  Widget build(BuildContext context) {
    final colors = WeuraColors.of(context);
    return Scaffold(
      backgroundColor: colors.background,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Icon(
                Icons.error_outline_rounded,
                color: colors.danger,
                size: 56,
              ),
              const SizedBox(height: 20),
              Text(
                'Initialization failed',
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: colors.textPrimary,
                  fontSize: 22,
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(height: 14),
              Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: colors.surface,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: colors.border),
                ),
                child: SelectableText(
                  error,
                  style: TextStyle(
                    color: colors.textSecondary,
                    fontSize: 12,
                    height: 1.5,
                    fontFamily: 'monospace',
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
