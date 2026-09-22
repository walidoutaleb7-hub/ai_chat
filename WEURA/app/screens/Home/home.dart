import 'package:flutter/material.dart';

import '../../components/UI/screen_background.dart';
import '../../core/Theme/weura_theme.dart';
import '../Chat/chat.dart';
import '../Deen/quran_screen.dart';
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

  final GlobalKey<ScaffoldState> _scaffoldKey =
      GlobalKey<ScaffoldState>();

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

  void _openQuran() {
    Navigator.of(context).pop();
    Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => const QuranScreen()),
    );
  }

  void _openHistory() {
    Navigator.of(context).pop();
    Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => const HistoryScreen()),
    );
  }

  void _openMemory() {
    Navigator.of(context).pop();
    Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => const MemoryScreen()),
    );
  }

  void _openSettings() {
    Navigator.of(context).pop();
    Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => const SettingsScreen()),
    );
  }

  @override
  Widget build(BuildContext context) {
    final colors = WeuraColors.of(context);

    return Scaffold(
      key: _scaffoldKey,
      backgroundColor: colors.background,
      drawer: _buildDrawer(colors),
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

  // ===========================================================================
  // DRAWER
  // ===========================================================================

  Widget _buildDrawer(WeuraColors colors) {
    return Drawer(
      backgroundColor: colors.surfaceElevated,
      width: 285,
      child: SafeArea(
        child: Column(
          children: [
            _drawerHeader(colors),
            const SizedBox(height: 14),
            _drawerNewChatButton(colors),
            const SizedBox(height: 18),
            _drawerSectionTitle(colors, 'Workspace'),
            _drawerItem(
              colors: colors,
              icon: Icons.menu_book_rounded,
              label: 'Quran',
              onTap: _openQuran,
            ),
            _drawerItem(
              colors: colors,
              icon: Icons.history_rounded,
              label: 'History',
              onTap: _openHistory,
            ),
            _drawerItem(
              colors: colors,
              icon: Icons.memory_rounded,
              label: 'Memory',
              onTap: _openMemory,
            ),
            const SizedBox(height: 18),
            _drawerSectionTitle(colors, 'App'),
            _drawerItem(
              colors: colors,
              icon: Icons.settings_outlined,
              label: 'Settings',
              onTap: _openSettings,
            ),
            const Spacer(),
            Padding(
              padding: const EdgeInsets.all(16),
              child: Text(
                'WEURA AI • v1.0.0\nThink Beyond.',
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: colors.textFaint,
                  fontSize: 11,
                  height: 1.5,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _drawerHeader(WeuraColors colors) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 18, 20, 0),
      child: Row(
        children: [
          Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(
              color: colors.surface,
              borderRadius: BorderRadius.circular(13),
              border: Border.all(
                color: colors.accentGlow.withValues(alpha: 0.22),
              ),
            ),
            child: Center(
              child: Text(
                'W',
                style: TextStyle(
                  color: colors.accentGlow,
                  fontSize: 22,
                  fontWeight: FontWeight.w900,
                  height: 1,
                ),
              ),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'WEURA',
                  style: TextStyle(
                    color: colors.textPrimary,
                    fontSize: 17,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 1.2,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  'Think Beyond.',
                  style: TextStyle(
                    color: colors.textMuted,
                    fontSize: 11,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _drawerNewChatButton(WeuraColors colors) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 14),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: () {
            Navigator.of(context).pop();
            _openChat();
          },
          borderRadius: BorderRadius.circular(13),
          child: Ink(
            height: 48,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(13),
              color: colors.surface,
              border: Border.all(color: colors.border),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(
                  Icons.add_rounded,
                  size: 22,
                  color: colors.textPrimary,
                ),
                const SizedBox(width: 8),
                Text(
                  'New Chat',
                  style: TextStyle(
                    color: colors.textPrimary,
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _drawerSectionTitle(WeuraColors colors, String title) {
    return Align(
      alignment: Alignment.centerLeft,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 6, 20, 8),
        child: Text(
          title.toUpperCase(),
          style: TextStyle(
            color: colors.textFaint,
            fontSize: 10,
            fontWeight: FontWeight.w700,
            letterSpacing: 1.2,
          ),
        ),
      ),
    );
  }

  Widget _drawerItem({
    required WeuraColors colors,
    required IconData icon,
    required String label,
    required VoidCallback onTap,
  }) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 2),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(11),
          child: Padding(
            padding: const EdgeInsets.symmetric(
              horizontal: 12,
              vertical: 13,
            ),
            child: Row(
              children: [
                Icon(icon, size: 22, color: colors.textPrimary),
                const SizedBox(width: 14),
                Text(
                  label,
                  style: TextStyle(
                    color: colors.textSecondary,
                    fontSize: 14,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  // ===========================================================================
  // TOP BAR
  // ===========================================================================

  Widget _topBar(WeuraColors colors) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 12, 12, 8),
      child: Row(
        children: [
          // Menu (drawer)
          IconButton(
            tooltip: 'Menu',
            onPressed: () {
              _scaffoldKey.currentState?.openDrawer();
            },
            splashRadius: 22,
            icon: Icon(
              Icons.menu_rounded,
              size: 24,
              color: colors.textPrimary,
            ),
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
          // Settings quick access
          IconButton(
            tooltip: 'Settings',
            onPressed: () {
              Navigator.of(context).push(
                MaterialPageRoute(
                  builder: (_) => const SettingsScreen(),
                ),
              );
            },
            splashRadius: 22,
            icon: Icon(
              Icons.settings_outlined,
              size: 23,
              color: colors.textPrimary,
            ),
          ),
        ],
      ),
    );
  }

  // ===========================================================================
  // MAIN CONTENT
  // ===========================================================================

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

  // ===========================================================================
  // COMPOSER
  // ===========================================================================

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
}