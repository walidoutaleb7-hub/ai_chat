import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

import 'core/Settings/app_settings.dart';
import 'core/Theme/weura_theme.dart';
import 'screens/Home/home.dart';
import 'screens/Splash/splash.dart';
import 'services/Storage/storage_service.dart';

const List<String> _kSvgIcons = [
  'assets/icons/menu.svg',
  'assets/icons/mode.svg',
  'assets/icons/send.svg',
  'assets/icons/attachment.svg',
  'assets/icons/microphone.svg',
  'assets/icons/camera.svg',
  'assets/icons/file.svg',
  'assets/icons/plus.svg',
  'assets/icons/history.svg',
  'assets/icons/settings.svg',
  'assets/icons/user.svg',
  'assets/icons/check.svg',
  'assets/icons/close.svg',
  'assets/icons/back.svg',
  'assets/icons/search.svg',
  'assets/icons/home.svg',
  'assets/icons/stop.svg',
  'assets/logo/weura.svg',
];

Future<void> _precacheSvgIcons() async {
  for (final path in _kSvgIcons) {
    try {
      final loader = SvgAssetLoader(path);
      await svg.cache.putIfAbsent(
        loader.cacheKey(null),
        () => loader.loadBytes(null),
      );
    } catch (e) {
      debugPrint('[WEURA] Failed to precache $path: $e');
    }
  }
}

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  try {
    await StorageService.init();
    await AppSettingsManager.instance.load();
    await _precacheSvgIcons();
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

        return MaterialApp(
          debugShowCheckedModeBanner: false,
          title: 'WEURA AI',
          themeMode: settings.themeMode,
          theme: weuraLightTheme(),
          darkTheme: weuraDarkTheme(),
          home: const _WeuraEntry(),
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