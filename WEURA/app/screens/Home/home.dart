import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

import '../Chat/chat.dart';
import '../History/history.dart';
import '../Memory/memory.dart';
import '../Settings/settings.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen>
    with SingleTickerProviderStateMixin {
  late final AnimationController _animationController;

  final TextEditingController _controller =
      TextEditingController();

  final FocusNode _focusNode = FocusNode();

  final List<String> _suggestions = const [
    'Explain something to me',
    'Help me write something',
    'Analyze this idea',
    'Help me code',
  ];

  @override
  void initState() {
    super.initState();

    _animationController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 900),
    )..forward();
  }

  @override
  void dispose() {
    _animationController.dispose();
    _controller.dispose();
    _focusNode.dispose();
    super.dispose();
  }

  void _openChat([String? message]) {
    final text = message ?? _controller.text.trim();

    if (text.isEmpty) {
      Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) => const ChatScreen(),
        ),
      );
      return;
    }

    _controller.clear();

    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => ChatScreen(
          initialMessage: text,
        ),
      ),
    );
  }

  void _openHistory() {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => const HistoryScreen(),
      ),
    );
  }

  void _openMemory() {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => const MemoryScreen(),
      ),
    );
  }

  void _openSettings() {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => const SettingsScreen(),
      ),
    );
  }

  void _useSuggestion(String text) {
    _openChat(text);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF07070C),
      body: SafeArea(
        child: FadeTransition(
          opacity: CurvedAnimation(
            parent: _animationController,
            curve: Curves.easeOut,
          ),
          child: Column(
            children: [
              _topBar(),
              Expanded(
                child: _mainContent(),
              ),
              _composer(),
            ],
          ),
        ),
      ),
    );
  }

  Widget _topBar() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        16,
        12,
        16,
        8,
      ),
      child: Row(
        children: [
          _iconButton(
            asset: 'assets/icons/history.svg',
            tooltip: 'History',
            onTap: _openHistory,
          ),
          const SizedBox(width: 4),
          _iconButton(
            asset: 'assets/icons/mode.svg',
            tooltip: 'Memory',
            onTap: _openMemory,
          ),
          const Spacer(),
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              SizedBox(
                width: 27,
                height: 27,
                child: SvgPicture.asset(
                  'assets/logo/weura.svg',
                ),
              ),
              const SizedBox(width: 9),
              const Text(
                'WEURA',
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 18,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 1.4,
                ),
              ),
            ],
          ),
          const Spacer(),
          _iconButton(
            asset: 'assets/icons/settings.svg',
            tooltip: 'Settings',
            onTap: _openSettings,
          ),
        ],
      ),
    );
  }

  Widget _mainContent() {
    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(
          22,
          20,
          22,
          20,
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            _heroLogo(),
            const SizedBox(height: 26),
            const Text(
              'Think Beyond.',
              textAlign: TextAlign.center,
              style: TextStyle(
                color: Colors.white,
                fontSize: 38,
                fontWeight: FontWeight.w700,
                letterSpacing: -1.2,
              ),
            ),
            const SizedBox(height: 10),
            Text(
              'Your intelligent space for ideas, answers and creation.',
              textAlign: TextAlign.center,
              style: TextStyle(
                color: Colors.white.withValues(alpha: 0.48),
                fontSize: 15,
                height: 1.45,
              ),
            ),
            const SizedBox(height: 34),
            Wrap(
              alignment: WrapAlignment.center,
              spacing: 9,
              runSpacing: 9,
              children: _suggestions.map((suggestion) {
                return _suggestionChip(suggestion);
              }).toList(),
            ),
          ],
        ),
      ),
    );
  }

  Widget _heroLogo() {
    return Container(
      width: 86,
      height: 86,
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: const Color(0xFF0A0D17),
        border: Border.all(
          color: const Color(0xFF3B82F6)
              .withValues(alpha: 0.20),
        ),
        boxShadow: [
          BoxShadow(
            color: const Color(0xFF2563EB)
                .withValues(alpha: 0.18),
            blurRadius: 45,
            spreadRadius: 5,
          ),
        ],
      ),
      child: SvgPicture.asset(
        'assets/logo/weura.svg',
      ),
    );
  }

  Widget _suggestionChip(String text) {
    return GestureDetector(
      onTap: () => _useSuggestion(text),
      child: Container(
        padding: const EdgeInsets.symmetric(
          horizontal: 15,
          vertical: 11,
        ),
        decoration: BoxDecoration(
          color: const Color(0xFF10111A),
          borderRadius: BorderRadius.circular(15),
          border: Border.all(
            color: Colors.white.withValues(alpha: 0.07),
          ),
        ),
        child: Text(
          text,
          style: TextStyle(
            color: Colors.white.withValues(alpha: 0.72),
            fontSize: 13,
          ),
        ),
      ),
    );
  }

  Widget _composer() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        14,
        4,
        14,
        14,
      ),
      child: Container(
        decoration: BoxDecoration(
          color: const Color(0xFF111119),
          borderRadius: BorderRadius.circular(22),
          border: Border.all(
            color: Colors.white.withValues(alpha: 0.07),
          ),
        ),
        child: Row(
          children: [
            const SizedBox(width: 7),
            IconButton(
              tooltip: 'New chat',
              onPressed: () => _openChat(),
              icon: SvgPicture.asset(
                'assets/icons/plus.svg',
                width: 22,
                height: 22,
              ),
            ),
            Expanded(
              child: TextField(
                controller: _controller,
                focusNode: _focusNode,
                minLines: 1,
                maxLines: 5,
                textInputAction: TextInputAction.send,
                onSubmitted: (_) => _openChat(),
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 15,
                ),
                cursorColor: const Color(0xFF5B7CFF),
                decoration: const InputDecoration(
                  hintText: 'Message WEURA...',
                  hintStyle: TextStyle(
                    color: Colors.white30,
                  ),
                  border: InputBorder.none,
                ),
              ),
            ),
            GestureDetector(
              onTap: () => _openChat(),
              child: Container(
                width: 42,
                height: 42,
                margin: const EdgeInsets.only(
                  right: 7,
                ),
                decoration: const BoxDecoration(
                  color: Color(0xFF315DFF),
                  shape: BoxShape.circle,
                ),
                child: Center(
                  child: SvgPicture.asset(
                    'assets/icons/send.svg',
                    width: 22,
                    height: 22,
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _iconButton({
    required String asset,
    required String tooltip,
    required VoidCallback onTap,
  }) {
    return IconButton(
      tooltip: tooltip,
      onPressed: onTap,
      splashRadius: 22,
      icon: SvgPicture.asset(
        asset,
        width: 23,
        height: 23,
      ),
    );
  }
}
