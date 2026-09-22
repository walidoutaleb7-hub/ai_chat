import 'package:flutter/material.dart';

import '../../components/UI/weura_background.dart';
import '../../core/Theme/weura_theme.dart';
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

  final TextEditingController _controller = TextEditingController();
  final FocusNode _focusNode = FocusNode();

  static const List<String> _suggestions = [
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

    _controller.addListener(_refresh);
  }

  @override
  void dispose() {
    _animationController.dispose();
    _controller.removeListener(_refresh);
    _controller.dispose();
    _focusNode.dispose();
    super.dispose();
  }

  void _refresh() {
    if (mounted) setState(() {});
  }

  bool get _canSend => _controller.text.trim().isNotEmpty;

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
        builder: (_) => ChatScreen(initialMessage: text),
      ),
    );
  }

  void _openHistory() {
    Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => const HistoryScreen()),
    );
  }

  void _openMemory() {
    Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => const MemoryScreen()),
    );
  }

  void _openSettings() {
    Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => const SettingsScreen()),
    );
  }

  @override
  Widget build(BuildContext context) {
    final colors = WeuraColors.of(context);

    return Scaffold(
      backgroundColor: colors.background,
      body: WeuraScreenBackground(
        colors: colors,
        child: SafeArea(
          child: FadeTransition(
            opacity: CurvedAnimation(
              parent: _animationController,
              curve: Curves.easeOut,
            ),
            child: Column(
              children: [
                _topBar(colors),
                Expanded(child: _mainContent(colors)),
                _composer(colors),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _topBar(WeuraColors colors) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
      child: Row(
        children: [
          _iconButton(
            colors: colors,
            icon: Icons.history_rounded,
            tooltip: 'History',
            onTap: _openHistory,
          ),
          const SizedBox(width: 4),
          _iconButton(
            colors: colors,
            icon: Icons.person_outline_rounded,
            tooltip: 'Memory',
            onTap: _openMemory,
          ),
          const Spacer(),
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 27,
                height: 27,
                decoration: BoxDecoration(
                  color: colors.accentSoft,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(
                    color: colors.accentGlow.withValues(alpha: 0.35),
                  ),
                ),
                child: Center(
                  child: Text(
                    'W',
                    style: TextStyle(
                      color: colors.accentGlow,
                      fontSize: 15,
                      fontWeight: FontWeight.w900,
                      height: 1,
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 9),
              Text(
                'WEURA',
                style: TextStyle(
                  color: colors.textPrimary,
                  fontSize: 18,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 1.4,
                ),
              ),
            ],
          ),
          const Spacer(),
          _iconButton(
            colors: colors,
            icon: Icons.settings_outlined,
            tooltip: 'Settings',
            onTap: _openSettings,
          ),
        ],
      ),
    );
  }

  Widget _mainContent(WeuraColors colors) {
    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(22, 20, 22, 20),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            _heroLogo(colors),
            const SizedBox(height: 26),
            Text(
              'Think Beyond.',
              textAlign: TextAlign.center,
              style: TextStyle(
                color: colors.textPrimary,
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
                color: colors.textSecondary,
                fontSize: 15,
                height: 1.45,
              ),
            ),
            const SizedBox(height: 34),
            Wrap(
              alignment: WrapAlignment.center,
              spacing: 9,
              runSpacing: 9,
              children: _suggestions
                  .map((s) => _suggestionChip(colors, s))
                  .toList(),
            ),
          ],
        ),
      ),
    );
  }

  Widget _heroLogo(WeuraColors colors) {
    return Container(
      width: 86,
      height: 86,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: colors.surface,
        border: Border.all(
          color: colors.accentGlow.withValues(alpha: 0.20),
        ),
        boxShadow: [
          BoxShadow(
            color: colors.accent.withValues(alpha: 0.18),
            blurRadius: 45,
            spreadRadius: 5,
          ),
        ],
      ),
      child: Center(
        child: Text(
          'W',
          style: TextStyle(
            color: colors.accentGlow,
            fontSize: 40,
            fontWeight: FontWeight.w900,
            height: 1,
          ),
        ),
      ),
    );
  }

  Widget _suggestionChip(WeuraColors colors, String text) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: () => _openChat(text),
        borderRadius: BorderRadius.circular(15),
        child: Container(
          padding: const EdgeInsets.symmetric(
            horizontal: 15,
            vertical: 11,
          ),
          decoration: BoxDecoration(
            color: colors.surface,
            borderRadius: BorderRadius.circular(15),
            border: Border.all(color: colors.border),
          ),
          child: Text(
            text,
            style: TextStyle(
              color: colors.textSecondary,
              fontSize: 13,
            ),
          ),
        ),
      ),
    );
  }

  Widget _composer(WeuraColors colors) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(14, 4, 14, 14),
      child: Container(
        decoration: BoxDecoration(
          color: colors.surface,
          borderRadius: BorderRadius.circular(22),
          border: Border.all(color: colors.border),
        ),
        child: Row(
          children: [
            const SizedBox(width: 7),
            IconButton(
              tooltip: 'New chat',
              onPressed: () => _openChat(),
              icon: Icon(
                Icons.add_rounded,
                size: 24,
                color: colors.textPrimary,
              ),
            ),
            Expanded(
              child: TextField(
                controller: _controller,
                focusNode: _focusNode,
                minLines: 1,
                maxLines: 5,
                keyboardType: TextInputType.multiline,
                textInputAction: TextInputAction.newline,
                textCapitalization: TextCapitalization.sentences,
                style: TextStyle(
                  color: colors.textPrimary,
                  fontSize: 15,
                ),
                cursorColor: colors.accent,
                decoration: InputDecoration(
                  hintText: 'Message WEURA...',
                  hintStyle: TextStyle(color: colors.textFaint),
                  border: InputBorder.none,
                ),
              ),
            ),
            AnimatedScale(
              scale: _canSend ? 1 : 0.92,
              duration: const Duration(milliseconds: 140),
              child: Material(
                color: Colors.transparent,
                child: InkWell(
                  onTap: _canSend ? () => _openChat() : null,
                  borderRadius: BorderRadius.circular(21),
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 160),
                    width: 42,
                    height: 42,
                    margin: const EdgeInsets.only(right: 7),
                    decoration: BoxDecoration(
                      color: _canSend
                          ? colors.accent
                          : colors.surfaceAlt,
                      shape: BoxShape.circle,
                    ),
                    child: Center(
                      child: Opacity(
                        opacity: _canSend ? 1 : 0.3,
                        child: const Icon(
                          Icons.arrow_upward_rounded,
                          size: 22,
                          color: Colors.white,
                        ),
                      ),
                    ),
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
    required WeuraColors colors,
    required IconData icon,
    required String tooltip,
    required VoidCallback onTap,
  }) {
    return IconButton(
      tooltip: tooltip,
      onPressed: onTap,
      splashRadius: 22,
      icon: Icon(
        icon,
        size: 23,
        color: colors.textPrimary,
      ),
    );
  }
}