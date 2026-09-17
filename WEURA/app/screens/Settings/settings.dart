import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

import '../../core/AI/ai_router.dart';
import '../../core/Settings/app_settings.dart';
import '../../core/Theme/weura_theme.dart';
import '../../services/Storage/storage_service.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({
    super.key,
    this.onClearLocalData,
    this.onBack,
  });

  final VoidCallback? onClearLocalData;
  final VoidCallback? onBack;

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  final AppSettingsManager _settings = AppSettingsManager.instance;

  @override
  void initState() {
    super.initState();
    _settings.addListener(_refresh);
  }

  @override
  void dispose() {
    _settings.removeListener(_refresh);
    super.dispose();
  }

  void _refresh() {
    if (mounted) setState(() {});
  }

  // ---------------------------------------------------------------------------
  // Names
  // ---------------------------------------------------------------------------

  String get _themeName {
    switch (_settings.themeMode) {
      case ThemeMode.system:
        return 'System';
      case ThemeMode.light:
        return 'Light';
      case ThemeMode.dark:
        return 'Dark';
    }
  }

  String get _responseDetailName {
    switch (_settings.responseDetail) {
      case ResponseDetail.auto:
        return 'Auto';
      case ResponseDetail.concise:
        return 'Concise';
      case ResponseDetail.balanced:
        return 'Balanced';
      case ResponseDetail.detailed:
        return 'Detailed';
    }
  }

  String _modeName(AIMode mode) {
    switch (mode) {
      case AIMode.auto:
        return 'Auto';
      case AIMode.smart:
        return 'Smart';
      case AIMode.fast:
        return 'Fast';
      case AIMode.research:
        return 'Research';
      case AIMode.code:
        return 'Code';
      case AIMode.creative:
        return 'Creative';
      case AIMode.vision:
        return 'Vision';
      case AIMode.files:
        return 'Files';
      case AIMode.translation:
        return 'Translation';
    }
  }

  // ---------------------------------------------------------------------------
  // Pickers
  // ---------------------------------------------------------------------------

  Future<void> _selectTheme(WeuraColors colors) async {
    final result = await showModalBottomSheet<ThemeMode>(
      context: context,
      backgroundColor: colors.surfaceAlt,
      showDragHandle: true,
      builder: (_) {
        return _SelectionSheet<ThemeMode>(
          colors: colors,
          title: 'Appearance',
          value: _settings.themeMode,
          options: const [
            _SelectionOption(value: ThemeMode.system, title: 'System'),
            _SelectionOption(value: ThemeMode.dark, title: 'Dark'),
            _SelectionOption(value: ThemeMode.light, title: 'Light'),
          ],
        );
      },
    );
    if (result == null) return;
    await _settings.setThemeMode(result);
  }

  Future<void> _selectLanguage(WeuraColors colors) async {
    final result = await showModalBottomSheet<String>(
      context: context,
      backgroundColor: colors.surfaceAlt,
      showDragHandle: true,
      builder: (_) {
        return _SelectionSheet<String>(
          colors: colors,
          title: 'Language',
          value: _settings.language,
          options: const [
            _SelectionOption(value: 'English', title: 'English'),
            _SelectionOption(value: 'Arabic', title: 'العربية'),
            _SelectionOption(value: 'Auto', title: 'Auto'),
          ],
        );
      },
    );
    if (result == null) return;
    await _settings.setLanguage(result);
  }

  Future<void> _selectDirection(WeuraColors colors) async {
    final result = await showModalBottomSheet<String>(
      context: context,
      backgroundColor: colors.surfaceAlt,
      showDragHandle: true,
      builder: (_) {
        return _SelectionSheet<String>(
          colors: colors,
          title: 'Text direction',
          value: _settings.direction,
          options: const [
            _SelectionOption(value: 'Auto', title: 'Auto'),
            _SelectionOption(value: 'LTR', title: 'Left to right'),
            _SelectionOption(value: 'RTL', title: 'Right to left'),
          ],
        );
      },
    );
    if (result == null) return;
    await _settings.setDirection(result);
  }

  Future<void> _selectResponseDetail(WeuraColors colors) async {
    final result = await showModalBottomSheet<ResponseDetail>(
      context: context,
      backgroundColor: colors.surfaceAlt,
      showDragHandle: true,
      builder: (_) {
        return _SelectionSheet<ResponseDetail>(
          colors: colors,
          title: 'Response detail',
          value: _settings.responseDetail,
          options: const [
            _SelectionOption(value: ResponseDetail.auto, title: 'Auto'),
            _SelectionOption(value: ResponseDetail.concise, title: 'Concise'),
            _SelectionOption(
              value: ResponseDetail.balanced,
              title: 'Balanced',
            ),
            _SelectionOption(
              value: ResponseDetail.detailed,
              title: 'Detailed',
            ),
          ],
        );
      },
    );
    if (result == null) return;
    await _settings.setResponseDetail(result);
  }

  Future<void> _selectMode(WeuraColors colors) async {
    final result = await showModalBottomSheet<AIMode>(
      context: context,
      backgroundColor: colors.surfaceAlt,
      showDragHandle: true,
      isScrollControlled: true,
      constraints: BoxConstraints(
        maxHeight: MediaQuery.of(context).size.height * 0.85,
      ),
      builder: (_) {
        return _SelectionSheet<AIMode>(
          colors: colors,
          title: 'Default AI mode',
          value: _settings.mode,
          options: AIMode.values
              .map((m) => _SelectionOption(value: m, title: _modeName(m)))
              .toList(),
        );
      },
    );
    if (result == null) return;
    await _settings.setMode(result);
  }

  Future<void> _editUserName(WeuraColors colors) async {
    final controller = TextEditingController(text: _settings.userName);

    final result = await showDialog<String>(
      context: context,
      builder: (dialogContext) {
        return AlertDialog(
          backgroundColor: colors.surfaceAlt,
          title: Text(
            'Your name',
            style: TextStyle(color: colors.textPrimary),
          ),
          content: TextField(
            controller: controller,
            autofocus: true,
            maxLength: 40,
            style: TextStyle(color: colors.textPrimary),
            decoration: InputDecoration(
              hintText: 'e.g. Walid',
              hintStyle: TextStyle(color: colors.textFaint),
              filled: true,
              fillColor: colors.surface,
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(14),
                borderSide: BorderSide.none,
              ),
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogContext),
              child: const Text('Cancel'),
            ),
            TextButton(
              onPressed: () =>
                  Navigator.pop(dialogContext, controller.text),
              child: const Text('Save'),
            ),
          ],
        );
      },
    );

    if (result == null) return;
    await _settings.setUserName(result);
    _showChanged(
      result.trim().isEmpty ? 'Name cleared' : 'Name saved',
    );
  }

  // ---------------------------------------------------------------------------
  // Dialogs
  // ---------------------------------------------------------------------------

  void _showChanged(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          content: Text(message),
          duration: const Duration(milliseconds: 1400),
        ),
      );
  }

  void _confirmResetSettings(WeuraColors colors) {
    showDialog<void>(
      context: context,
      builder: (dialogContext) {
        return AlertDialog(
          backgroundColor: colors.surfaceAlt,
          title: Text(
            'Reset settings?',
            style: TextStyle(color: colors.textPrimary),
          ),
          content: Text(
            'All WEURA preferences will return to their defaults.',
            style: TextStyle(color: colors.textSecondary, height: 1.4),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogContext),
              child: const Text('Cancel'),
            ),
            TextButton(
              onPressed: () async {
                Navigator.pop(dialogContext);
                await _settings.reset();
                if (!mounted) return;
                _showChanged('Settings reset');
              },
              child: Text(
                'Reset',
                style: TextStyle(color: colors.danger),
              ),
            ),
          ],
        );
      },
    );
  }

  void _confirmClearData(WeuraColors colors) {
    showDialog<void>(
      context: context,
      builder: (dialogContext) {
        return AlertDialog(
          backgroundColor: colors.surfaceAlt,
          title: Text(
            'Clear local data?',
            style: TextStyle(color: colors.textPrimary),
          ),
          content: Text(
            'This will remove locally stored conversations, memory and preferences.',
            style: TextStyle(color: colors.textSecondary, height: 1.4),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogContext),
              child: const Text('Cancel'),
            ),
            TextButton(
              onPressed: () async {
                Navigator.pop(dialogContext);
                await StorageService.instance.clear();
                await _settings.reset();
                if (!mounted) return;
                widget.onClearLocalData?.call();
                _showChanged('Local data cleared');
              },
              child: Text(
                'Clear',
                style: TextStyle(color: colors.danger),
              ),
            ),
          ],
        );
      },
    );
  }

  void _showAbout(WeuraColors colors) {
    showAboutDialog(
      context: context,
      applicationName: 'WEURA AI',
      applicationVersion: '1.0.0',
      applicationLegalese: 'Think Beyond. • Walid Out',
      applicationIcon: Container(
        width: 48,
        height: 48,
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(
          color: colors.accent,
          borderRadius: BorderRadius.circular(14),
        ),
        child: SvgPicture.asset('assets/logo/weura.svg'),
      ),
      children: const [
        Text(
          'WEURA AI is an intelligent AI assistant '
          'built to think, create and help you go beyond.',
        ),
      ],
    );
  }

  void _showConnectionInfo(WeuraColors colors) {
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: colors.surfaceAlt,
      showDragHandle: true,
      builder: (_) {
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(22),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Connection',
                  style: TextStyle(
                    color: colors.textPrimary,
                    fontSize: 20,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 16),
                _infoRow(colors, 'AI Engine', 'Groq (primary)'),
                _infoRow(colors, 'Fallback', 'Cerebras'),
                _infoRow(colors, 'Search', 'Tavily'),
                _infoRow(colors, 'Images', 'Cloudflare FLUX'),
                _infoRow(colors, 'API key', 'Server-side'),
                const SizedBox(height: 10),
                Text(
                  'Connection availability depends on the WEURA backend configuration.',
                  style: TextStyle(
                    color: colors.textMuted,
                    height: 1.4,
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _infoRow(WeuraColors colors, String title, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        children: [
          Expanded(
            child: Text(
              title,
              style: TextStyle(color: colors.textSecondary),
            ),
          ),
          Text(
            value,
            style: TextStyle(
              color: colors.textPrimary,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
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
      appBar: AppBar(
        backgroundColor: colors.background,
        elevation: 0,
        leading: IconButton(
          onPressed: () {
            if (widget.onBack != null) {
              widget.onBack!();
            } else if (Navigator.canPop(context)) {
              Navigator.pop(context);
            }
          },
          icon: SvgPicture.asset(
            'assets/icons/back.svg',
            width: 23,
            height: 23,
          ),
        ),
        title: Text(
          'Settings',
          style: TextStyle(
            color: colors.textPrimary,
            fontWeight: FontWeight.w700,
          ),
        ),
        actions: [
          IconButton(
            tooltip: 'Reset settings',
            onPressed: () => _confirmResetSettings(colors),
            icon: SvgPicture.asset(
              'assets/icons/history.svg',
              width: 22,
              height: 22,
            ),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 10, 16, 40),
        children: [
          // ─── Appearance ───────────────────────────────────────────────
          _sectionTitle(colors, 'Appearance'),
          _card(colors, [
            _settingTile(
              colors,
              title: 'Appearance',
              subtitle: _themeName,
              onTap: () => _selectTheme(colors),
            ),
            _divider(colors),
            _settingTile(
              colors,
              title: 'Language',
              subtitle: _settings.language,
              onTap: () => _selectLanguage(colors),
            ),
            _divider(colors),
            _settingTile(
              colors,
              title: 'Text direction',
              subtitle: _settings.direction,
              onTap: () => _selectDirection(colors),
            ),
          ]),
          const SizedBox(height: 24),

          // ─── AI ───────────────────────────────────────────────────────
          _sectionTitle(colors, 'AI'),
          _card(colors, [
            _settingTile(
              colors,
              title: 'Your name',
              subtitle: _settings.hasUserName
                  ? _settings.userName
                  : 'Not set',
              onTap: () => _editUserName(colors),
            ),
            _divider(colors),
            _settingTile(
              colors,
              title: 'Default AI mode',
              subtitle: _modeName(_settings.mode),
              onTap: () => _selectMode(colors),
            ),
            _divider(colors),
            _settingTile(
              colors,
              title: 'Response detail',
              subtitle: _responseDetailName,
              onTap: () => _selectResponseDetail(colors),
            ),
            _divider(colors),
            _switchTile(
              colors,
              title: 'Memory',
              subtitle: 'Allow WEURA to use saved memories',
              value: _settings.memoryEnabled,
              onChanged: _settings.setMemoryEnabled,
            ),
          ]),
          const SizedBox(height: 24),

          // ─── Voice ────────────────────────────────────────────────────
          _sectionTitle(colors, 'Voice'),
          _card(colors, [
            _switchTile(
              colors,
              title: 'Voice input',
              subtitle: 'Use your microphone for messages',
              value: _settings.voiceInputEnabled,
              onChanged: _settings.setVoiceInputEnabled,
            ),
            _divider(colors),
            _switchTile(
              colors,
              title: 'Voice output',
              subtitle: 'Read AI responses aloud',
              value: _settings.voiceOutputEnabled,
              onChanged: _settings.setVoiceOutputEnabled,
            ),
          ]),
          const SizedBox(height: 24),

          // ─── Chat ─────────────────────────────────────────────────────
          _sectionTitle(colors, 'Chat'),
          _card(colors, [
            _switchTile(
              colors,
              title: 'Auto-save history',
              subtitle: 'Automatically save conversations',
              value: _settings.autoSaveHistory,
              onChanged: _settings.setAutoSaveHistory,
            ),
            _divider(colors),
            _switchTile(
              colors,
              title: 'Send on Enter',
              subtitle: 'Press Enter to send a message',
              value: _settings.sendOnEnter,
              onChanged: _settings.setSendOnEnter,
            ),
          ]),
          const SizedBox(height: 24),

          // ─── Connection ───────────────────────────────────────────────
          _sectionTitle(colors, 'Connection'),
          _card(colors, [
            _settingTile(
              colors,
              title: 'AI connection',
              subtitle: 'Groq • Cerebras • Tavily',
              onTap: () => _showConnectionInfo(colors),
            ),
          ]),
          const SizedBox(height: 24),

          // ─── Privacy ──────────────────────────────────────────────────
          _sectionTitle(colors, 'Privacy'),
          _card(colors, [
            _settingTile(
              colors,
              title: 'Clear local data',
              subtitle: 'Remove locally stored WEURA data',
              destructive: true,
              onTap: () => _confirmClearData(colors),
            ),
          ]),
          const SizedBox(height: 24),

          // ─── About ────────────────────────────────────────────────────
          _sectionTitle(colors, 'About'),
          _card(colors, [
            _settingTile(
              colors,
              title: 'About WEURA',
              subtitle: 'WEURA AI • Version 1.0.0',
              onTap: () => _showAbout(colors),
            ),
          ]),
        ],
      ),
    );
  }

  // ---------------------------------------------------------------------------
  // Widgets
  // ---------------------------------------------------------------------------

  Widget _sectionTitle(WeuraColors colors, String title) {
    return Padding(
      padding: const EdgeInsets.only(left: 4, bottom: 9),
      child: Text(
        title.toUpperCase(),
        style: TextStyle(
          color: colors.textMuted,
          fontSize: 11,
          fontWeight: FontWeight.w700,
          letterSpacing: 1.2,
        ),
      ),
    );
  }

  Widget _card(WeuraColors colors, List<Widget> children) {
    return Container(
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: colors.border),
      ),
      child: Column(children: children),
    );
  }

  Widget _settingTile(
    WeuraColors colors, {
    required String title,
    required String subtitle,
    required VoidCallback onTap,
    bool destructive = false,
  }) {
    return ListTile(
      onTap: onTap,
      contentPadding:
          const EdgeInsets.symmetric(horizontal: 15, vertical: 4),
      title: Text(
        title,
        style: TextStyle(
          color: destructive ? colors.danger : colors.textPrimary,
          fontWeight: FontWeight.w600,
        ),
      ),
      subtitle: Text(
        subtitle,
        style: TextStyle(color: colors.textMuted, fontSize: 12),
      ),
      trailing: Icon(
        Icons.chevron_right,
        color: colors.textFaint,
      ),
    );
  }

  Widget _switchTile(
    WeuraColors colors, {
    required String title,
    required String subtitle,
    required bool value,
    required Future<void> Function(bool) onChanged,
  }) {
    return ListTile(
      contentPadding:
          const EdgeInsets.symmetric(horizontal: 15, vertical: 4),
      title: Text(
        title,
        style: TextStyle(
          color: colors.textPrimary,
          fontWeight: FontWeight.w600,
        ),
      ),
      subtitle: Text(
        subtitle,
        style: TextStyle(color: colors.textMuted, fontSize: 12),
      ),
      trailing: Switch(
        value: value,
        onChanged: (v) {
          onChanged(v);
        },
      ),
    );
  }

  Widget _divider(WeuraColors colors) {
    return Divider(
      height: 1,
      indent: 16,
      endIndent: 16,
      color: colors.border,
    );
  }
}

// ---------------------------------------------------------------------------
// Selection sheet
// ---------------------------------------------------------------------------

class _SelectionOption<T> {
  const _SelectionOption({
    required this.value,
    required this.title,
  });

  final T value;
  final String title;
}

class _SelectionSheet<T> extends StatelessWidget {
  const _SelectionSheet({
    required this.colors,
    required this.title,
    required this.value,
    required this.options,
  });

  final WeuraColors colors;
  final String title;
  final T value;
  final List<_SelectionOption<T>> options;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(20, 10, 20, 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              title,
              style: TextStyle(
                color: colors.textPrimary,
                fontSize: 18,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 12),
            ...options.map(
              (option) => ListTile(
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
                title: Text(
                  option.title,
                  style: TextStyle(color: colors.textPrimary),
                ),
                trailing: option.value == value
                    ? Icon(Icons.check, color: colors.accentGlow)
                    : null,
                onTap: () {
                  Navigator.pop(context, option.value);
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}