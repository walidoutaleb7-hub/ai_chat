import 'package:flutter/material.dart';

import 'core/Settings/app_settings.dart';
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
          theme: _buildLightTheme(),
          darkTheme: _buildDarkTheme(),
          home: const _WeuraEntry(),
        );
      },
    );
  }

  ThemeData _buildDarkTheme() {
    return ThemeData(
      brightness: Brightness.dark,
      scaffoldBackgroundColor: const Color(0xFF07070C),
      fontFamily: 'sans',
      useMaterial3: true,
      colorScheme: ColorScheme.fromSeed(
        seedColor: const Color(0xFF315DFF),
        brightness: Brightness.dark,
      ),
    );
  }

  ThemeData _buildLightTheme() {
    return ThemeData(
      brightness: Brightness.light,
      scaffoldBackgroundColor: const Color(0xFFF5F6FA),
      fontFamily: 'sans',
      useMaterial3: true,
      colorScheme: ColorScheme.fromSeed(
        seedColor: const Color(0xFF315DFF),
        brightness: Brightness.light,
      ),
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
