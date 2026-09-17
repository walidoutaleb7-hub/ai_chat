import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

import '../../core/Settings/app_settings.dart';
import '../../core/Theme/weura_theme.dart';

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

  bool get _isArabic =>
      AppSettingsManager.instance.language == 'Arabic';

  String _t(String en, String ar) => _isArabic ? ar : en;

  @override
  Widget build(BuildContext context) {
    final colors = WeuraColors.of(context);

    return Container(
      width: 270,
      decoration: BoxDecoration(
        color: colors.surfaceElevated,
        border: Border(
          left: BorderSide(
            color: colors.border,
          ),
        ),
      ),
      child: SafeArea(
        child: Column(
          children: [
            _buildHeader(colors),
            const SizedBox(height: 18),
            _buildNewChatButton(colors),
            const SizedBox(height: 18),
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.symmetric(
                  horizontal: 12,
                ),
                child: Column(
                  children: [
                    _item(
                      colors: colors,
                      page: WeuraSidebarPage.home,
                      asset: 'assets/icons/home.svg',
                      label: _t('Home', 'الرئيسية'),
                      onTap: onHome,
                    ),
                    _item(
                      colors: colors,
                      page: WeuraSidebarPage.chat,
                      asset: 'assets/icons/message.svg',
                      label: _t('Chat', 'المحادثة'),
                      onTap: onChat,
                    ),
                    const SizedBox(height: 12),
                    _sectionTitle(colors, _t('Workspace', 'مساحة العمل')),
                    _item(
                      colors: colors,
                      page: WeuraSidebarPage.history,
                      asset: 'assets/icons/history.svg',
                      label: _t('History', 'السجل'),
                      onTap: onHistory,
                    ),
                    _item(
                      colors: colors,
                      page: WeuraSidebarPage.memory,
                      asset: 'assets/icons/mode.svg',
                      label: _t('Memory', 'الذاكرة'),
                      onTap: onMemory,
                    ),
                  ],
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 14),
              child: _item(
                colors: colors,
                page: WeuraSidebarPage.settings,
                asset: 'assets/icons/settings.svg',
                label: _t('Settings', 'الإعدادات'),
                onTap: onSettings,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildHeader(WeuraColors colors) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 20, 16, 0),
      child: Row(
        children: [
          Container(
            width: 38,
            height: 38,
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(12),
              color: colors.surface,
              border: Border.all(
                color: colors.accentGlow.withValues(alpha: 0.25),
              ),
            ),
            child: SvgPicture.asset('assets/logo/weura.svg'),
          ),
          const SizedBox(width: 11),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'WEURA',
                  style: TextStyle(
                    color: colors.textPrimary,
                    fontSize: 16,
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

  Widget _buildNewChatButton(WeuraColors colors) {
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
              color: colors.surface,
              border: Border.all(color: colors.border),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                SvgPicture.asset(
                  'assets/icons/plus.svg',
                  width: 20,
                  height: 20,
                ),
                const SizedBox(width: 8),
                Text(
                  _t('New Chat', 'محادثة جديدة'),
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

  Widget _sectionTitle(WeuraColors colors, String title) {
    return Align(
      alignment: AlignmentDirectional.centerStart,
      child: Padding(
        padding: const EdgeInsets.only(
          left: 13,
          right: 13,
          bottom: 7,
        ),
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

  Widget _item({
    required WeuraColors colors,
    required WeuraSidebarPage page,
    required String asset,
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
              color: selected ? colors.accentSoft : Colors.transparent,
              borderRadius: BorderRadius.circular(11),
              border: selected
                  ? Border.all(
                      color: colors.accentGlow.withValues(alpha: 0.30),
                    )
                  : null,
            ),
            child: Row(
              children: [
                ColorFiltered(
                  colorFilter: ColorFilter.mode(
                    selected ? colors.accentGlow : colors.textMuted,
                    BlendMode.srcIn,
                  ),
                  child: SvgPicture.asset(
                    asset,
                    width: 20,
                    height: 20,
                  ),
                ),
                const SizedBox(width: 12),
                Text(
                  label,
                  style: TextStyle(
                    color: selected
                        ? colors.textPrimary
                        : colors.textSecondary,
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