import 'package:flutter/material.dart';

enum WeuraSidebarPage {
  home,
  chat,
  history,
  memory,
  settings,
}

class WeuraSidebar extends StatelessWidget {
  const WeuraSidebar({
    super.key,
    required this.selectedPage,
    this.onHome,
    this.onChat,
    this.onHistory,
    this.onMemory,
    this.onSettings,
    this.onNewChat,
  });

  final WeuraSidebarPage selectedPage;

  final VoidCallback? onHome;
  final VoidCallback? onChat;
  final VoidCallback? onHistory;
  final VoidCallback? onMemory;
  final VoidCallback? onSettings;
  final VoidCallback? onNewChat;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 270,
      decoration: BoxDecoration(
        color: const Color(0xFF08080F),
        border: Border(
          right: BorderSide(
            color: Colors.white.withValues(alpha: 0.06),
          ),
        ),
      ),
      child: SafeArea(
        child: Column(
          children: [
            _buildHeader(),
            const SizedBox(height: 18),
            _buildNewChatButton(),
            const SizedBox(height: 18),
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.symmetric(
                  horizontal: 12,
                ),
                child: Column(
                  children: [
                    _item(
                      page: WeuraSidebarPage.home,
                      icon: Icons.home_outlined,
                      label: 'Home',
                      onTap: onHome,
                    ),
                    _item(
                      page: WeuraSidebarPage.chat,
                      icon: Icons.chat_bubble_outline_rounded,
                      label: 'Chat',
                      onTap: onChat,
                    ),
                    const SizedBox(height: 12),
                    _sectionTitle('Workspace'),
                    _item(
                      page: WeuraSidebarPage.history,
                      icon: Icons.history_rounded,
                      label: 'History',
                      onTap: onHistory,
                    ),
                    _item(
                      page: WeuraSidebarPage.memory,
                      icon: Icons.psychology_outlined,
                      label: 'Memory',
                      onTap: onMemory,
                    ),
                  ],
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(
                12,
                8,
                12,
                14,
              ),
              child: _item(
                page: WeuraSidebarPage.settings,
                icon: Icons.settings_outlined,
                label: 'Settings',
                onTap: onSettings,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildHeader() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 20, 16, 0),
      child: Row(
        children: [
          Container(
            width: 38,
            height: 38,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(12),
              gradient: const LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [
                  Color(0xFF4C7DFF),
                  Color(0xFF1C39B8),
                ],
              ),
            ),
            child: const Center(
              child: Text(
                'W',
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 20,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ),
          ),
          const SizedBox(width: 11),
          const Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'WEURA',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 16,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 1.2,
                  ),
                ),
                SizedBox(height: 2),
                Text(
                  'Think Beyond.',
                  style: TextStyle(
                    color: Colors.white38,
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

  Widget _buildNewChatButton() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onNewChat,
          borderRadius: BorderRadius.circular(13),
          child: Ink(
            height: 48,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(13),
              color: const Color(0xFF11131D),
              border: Border.all(
                color: Colors.white.withValues(alpha: 0.07),
              ),
            ),
            child: const Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(
                  Icons.add_rounded,
                  color: Colors.white,
                  size: 20,
                ),
                SizedBox(width: 8),
                Text(
                  'New Chat',
                  style: TextStyle(
                    color: Colors.white,
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

  Widget _sectionTitle(String title) {
    return Align(
      alignment: Alignment.centerLeft,
      child: Padding(
        padding: const EdgeInsets.only(
          left: 13,
          bottom: 7,
        ),
        child: Text(
          title.toUpperCase(),
          style: const TextStyle(
            color: Colors.white24,
            fontSize: 10,
            fontWeight: FontWeight.w700,
            letterSpacing: 1.2,
          ),
        ),
      ),
    );
  }

  Widget _item({
    required WeuraSidebarPage page,
    required IconData icon,
    required String label,
    VoidCallback? onTap,
  }) {
    final selected = page == selectedPage;

    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(11),
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 180),
            curve: Curves.easeOut,
            height: 46,
            padding: const EdgeInsets.symmetric(horizontal: 13),
            decoration: BoxDecoration(
              color: selected
                  ? const Color(0xFF151C35)
                  : Colors.transparent,
              borderRadius: BorderRadius.circular(11),
              border: selected
                  ? Border.all(
                      color: const Color(0xFF315DFF)
                          .withValues(alpha: 0.20),
                    )
                  : null,
            ),
            child: Row(
              children: [
                Icon(
                  icon,
                  size: 20,
                  color: selected
                      ? const Color(0xFF6D8DFF)
                      : Colors.white54,
                ),
                const SizedBox(width: 12),
                Text(
                  label,
                  style: TextStyle(
                    color: selected
                        ? Colors.white
                        : Colors.white60,
                    fontSize: 14,
                    fontWeight: selected
                        ? FontWeight.w600
                        : FontWeight.w400,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}