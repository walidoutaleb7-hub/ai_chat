import 'package:flutter/material.dart';

import 'core/Settings/app_settings.dart';
import 'core/Theme/weura_theme.dart';
import 'screens/Home/home.dart';
import 'screens/Splash/splash.dart';
import 'services/Storage/storage_service.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  await StorageService.init();
  await AppSettingsManager.instance.load();

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

        return MaterialApp(
          debugShowCheckedModeBanner: false,
          title: 'WEURA AI',
          themeMode: settings.themeMode,
          theme: weuraLightTheme(),
          darkTheme: weuraDarkTheme(),
          builder: (context, child) {
            return Directionality(
              textDirection: settings.textDirection,
              child: child ?? const SizedBox.shrink(),
            );
          },
          home: const _WeuraEntry(),
        );
      },
    );
  }
}

class _WeuraEntry extends StatefulWidget {
  const _WeuraEntry();

  @override
  State<_WeuraEntry> createState() => _WeuraEntryState();
}

class _WeuraEntryState extends State<_WeuraEntry> {
  bool _showSplash = true;

  void _finishSplash() {
    if (!mounted) return;

    setState(() {
      _showSplash = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    if (_showSplash) {
      return SplashScreen(onFinished: _finishSplash);
    }

    return const HomeScreen();
  }
}
