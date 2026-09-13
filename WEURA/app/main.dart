import 'package:flutter/material.dart';

import 'screens/Home/home.dart';
import 'screens/Splash/splash.dart';
import 'services/Storage/storage_service.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  await StorageService.init();

  runApp(const WeuraApp());
}

class WeuraApp extends StatelessWidget {
  const WeuraApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'WEURA AI',
      theme: ThemeData(
        brightness: Brightness.dark,
        scaffoldBackgroundColor: const Color(0xFF07070C),
        fontFamily: 'sans',
        useMaterial3: true,
      ),
      home: const _WeuraEntry(),
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
