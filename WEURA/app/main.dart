import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';

import 'core/Settings/app_settings.dart';
import 'core/Theme/weura_theme.dart';
import 'screens/Auth/auth_gate.dart';
import 'services/Storage/storage_service.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  try {
    await Firebase.initializeApp();
    await StorageService.init();
    await AppSettingsManager.instance.load();
  } catch (error, stackTrace) {
    debugPrint('[WEURA] Init error: $error');
    debugPrint('$stackTrace');
  }

  runApp(const WeuraApp());
}

class WeuraApp extends StatelessWidget {
  const WeuraApp({super.key});

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: AppSettingsManager.instance,
      builder: (context, _) {
        final settings = AppSettingsManager.instance;

        // Key forces full rebuild when language/direction/theme changes.
        return MaterialApp(
          key: ValueKey(
            '${settings.effectiveLanguage}-${settings.direction}-${settings.themeMode}',
          ),
          debugShowCheckedModeBanner: false,
          title: 'WEURA AI',
          themeMode: settings.themeMode,
          theme: weuraLightTheme(),
          darkTheme: weuraDarkTheme(),
          home: const AuthGate(),
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
