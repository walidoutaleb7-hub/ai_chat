import 'package:flutter/material.dart';

import 'screens/Home/home.dart';
import 'screens/Chat/chat.dart';
import 'screens/History/history.dart';
import 'screens/Memory/memory.dart';
import 'screens/Settings/settings.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const WeuraApp());
}

class WeuraApp extends StatelessWidget {
  const WeuraApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'WEURA AI',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        brightness: Brightness.dark,
        scaffoldBackgroundColor: const Color(0xFF05030D),
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFF1677FF),
          brightness: Brightness.dark,
        ),
        useMaterial3: true,
      ),
      home: const WeuraShell(),
    );
  }
}

enum WeuraPage {
  home,
  chat,
  history,
  memory,
  settings,
}

class WeuraShell extends StatefulWidget {
  const WeuraShell({super.key});

  @override
  State<WeuraShell> createState() => _WeuraShellState();
}

class _WeuraShellState extends State<WeuraShell> {
  WeuraPage _page = WeuraPage.home;

  void _goTo(WeuraPage page) {
    setState(() {
      _page = page;
    });
  }

  void _newChat() {
    _goTo(WeuraPage.chat);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: AnimatedSwitcher(
        duration: const Duration(milliseconds: 220),
        switchInCurve: Curves.easeOut,
        switchOutCurve: Curves.easeIn,
        child: _buildPage(),
      ),
    );
  }

  Widget _buildPage() {
    switch (_page) {
      case WeuraPage.home:
        return HomeScreen(
          key: const ValueKey('home'),
          onOpenChat: () => _goTo(WeuraPage.chat),
          onOpenHistory: () => _goTo(WeuraPage.history),
          onOpenMemory: () => _goTo(WeuraPage.memory),
          onOpenSettings: () => _goTo(WeuraPage.settings),
        );

      case WeuraPage.chat:
        return ChatScreen(
          key: const ValueKey('chat'),
        );

      case WeuraPage.history:
        return HistoryScreen(
          key: const ValueKey('history'),
          onOpenChat: () => _goTo(WeuraPage.chat),
        );

      case WeuraPage.memory:
        return MemoryScreen(
          key: const ValueKey('memory'),
        );

      case WeuraPage.settings:
        return SettingsScreen(
          key: const ValueKey('settings'),
        );
    }
  }
}