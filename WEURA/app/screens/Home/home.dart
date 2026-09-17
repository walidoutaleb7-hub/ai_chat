import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

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

  // ---------------------------------------------------------------------------
  // Navigation
  // ---------------------------------------------------------------------------

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

  // ---------------------------------------------------------------------------
  // Build
  // ---------------------------------------------------------------------------

  @override
  Widget build(BuildContext context) {
    final colors = WeuraColors.of(context);

    return Scaffold(
      backgroundColor: colors.background,
      body: SafeArea(
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
    );
  }

  // ---------------------------------------------------------------------------
  // Top bar
  // ---------------------------------------------------------------------------

  Widget _topBar(WeuraColors colors) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
      child: Row(
        children: [
          _iconButton(
            colors: colors,
            asset: 'assets/icons/history.svg',
            tooltip: 'History',
            onTap: _openHistory,
          ),
          const SizedBox(width: 4),
          _iconButton(
            colors: colors,
            asset: 'assets/icons/user.svg',
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
            asset: 'assets/icons/settings.svg',
            tooltip: 'Settings',
            onTap: _openSettings,
          ),
        ],
      ),
    );
  }

  // ---------------------------------------------------------------------------
  // Main content
  // ---------------------------------------------------------------------------

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
      padding: const EdgeInsets.all(20),
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
      child: SvgPicture.asset(
        'assets/logo/weura.svg',
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

  // ---------------------------------------------------------------------------
  // Composer
  // ---------------------------------------------------------------------------

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
                        child: SvgPicture.asset(
                          'assets/icons/send.svg',
                          width: 22,
                          height: 22,
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

  // ---------------------------------------------------------------------------
  // Icon button
  // ---------------------------------------------------------------------------

  Widget _iconButton({
    required WeuraColors colors,
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