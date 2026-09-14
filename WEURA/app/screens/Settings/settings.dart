import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

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

  bool _memoryEnabled = true;
  bool _voiceInput = true;
  bool _voiceOutput = false;
  bool _autoSaveHistory = true;
  bool _sendOnEnter = true;
  bool _streamResponses = true;

  static const String _memoryKey = 'weura_memory_enabled';
  static const String _voiceInputKey = 'weura_voice_input';
  static const String _voiceOutputKey = 'weura_voice_output';
  static const String _autoSaveKey = 'weura_auto_save';
  static const String _sendOnEnterKey = 'weura_send_on_enter';
  static const String _streamKey = 'weura_stream';

  @override
  void initState() {
    super.initState();
    _loadExtras();
  }

  Future<void> _loadExtras() async {
    final storage = StorageService.instance;

    final mem = await storage.read<bool>(_memoryKey);
    final vIn = await storage.read<bool>(_voiceInputKey);
    final vOut = await storage.read<bool>(_voiceOutputKey);
    final auto = await storage.read<bool>(_autoSaveKey);
    final send = await storage.read<bool>(_sendOnEnterKey);
    final strm = await storage.read<bool>(_streamKey);

    if (!mounted) return;

    setState(() {
      if (mem != null) _memoryEnabled = mem;
      if (vIn != null) _voiceInput = vIn;
      if (vOut != null) _voiceOutput = vOut;
      if (auto != null) _autoSaveHistory = auto;
      if (send != null) _sendOnEnter = send;
      if (strm != null) _streamResponses = strm;
    });
  }

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

  Future<void> _selectTheme(WeuraColors colors) async {
    final result = await showModalBottomSheet<ThemeMode>(
      context: context,
      backgroundColor: colors.surfaceAlt,
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
    if (mounted) setState(() {});
  }

  Future<void> _selectLanguage(WeuraColors colors) async {
    final result = await showModalBottomSheet<String>(
      context: context,
      backgroundColor: colors.surfaceAlt,
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
    if (mounted) setState(() {});
  }

  Future<void> _selectDirection(WeuraColors colors) async {
    final result = await showModalBottomSheet<String>(
      context: context,
      backgroundColor: colors.surfaceAlt,
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
    if (mounted) setState(() {});
  }

  Future<void> _selectResponseDetail(WeuraColors colors) async {
    final result = await showModalBottomSheet<ResponseDetail>(
      context: context,
      backgroundColor: colors.surfaceAlt,
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
    if (mounted) setState(() {});
  }

  Future<void> _toggleExtra(
    String key,
    bool value,
    ValueChanged<bool> setter,
  ) async {
    setter(value);
    await StorageService.instance.write(key, value);
  }

  void _showChanged(String message) {
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
                setState(() {
                  _memoryEnabled = true;
                  _voiceInput = true;
                  _voiceOutput = false;
                  _autoSaveHistory = true;
                  _sendOnEnter = true;
                  _streamResponses = true;
                });
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
                await StorageService.instance.clear();
                await _settings.reset();
                widget.onClearLocalData?.call();
                if (!mounted) return;
                Navigator.pop(dialogContext);
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
                _infoRow(colors, 'AI Engine', 'Groq'),
                _infoRow(colors, 'Search', 'Tavily'),
                _infoRow(colors, 'API key', 'Server-side'),
                _infoRow(colors, 'Security', 'Protected'),
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

          _sectionTitle(colors, 'AI'),
          _card(colors, [
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
              value: _memoryEnabled,
              onChanged: (value) {
                _toggleExtra(
                  _memoryKey,
                  value,
                  (v) => setState(() => _memoryEnabled = v),
                );
              },
            ),
            _divider(colors),
            _switchTile(
              colors,
              title: 'Stream responses',
              subtitle: 'Show responses as they are generated',
              value: _streamResponses,
              onChanged: (value) {
                _toggleExtra(
                  _streamKey,
                  value,
                  (v) => setState(() => _streamResponses = v),
                );
              },
            ),
          ]),
          const SizedBox(height: 24),

          _sectionTitle(colors, 'Voice'),
          _card(colors, [
            _switchTile(
              colors,
              title: 'Voice input',
              subtitle: 'Use your microphone for messages',
              value: _voiceInput,
              onChanged: (value) {
                _toggleExtra(
                  _voiceInputKey,
                  value,
                  (v) => setState(() => _voiceInput = v),
                );
              },
            ),
            _divider(colors),
            _switchTile(
              colors,
              title: 'Voice output',
              subtitle: 'Read AI responses aloud',
              value: _voiceOutput,
              onChanged: (value) {
                _toggleExtra(
                  _voiceOutputKey,
                  value,
                  (v) => setState(() => _voiceOutput = v),
                );
              },
            ),
          ]),
          const SizedBox(height: 24),

          _sectionTitle(colors, 'Chat'),
          _card(colors, [
            _switchTile(
              colors,
              title: 'Auto-save history',
              subtitle: 'Automatically save conversations',
              value: _autoSaveHistory,
              onChanged: (value) {
                _toggleExtra(
                  _autoSaveKey,
                  value,
                  (v) => setState(() => _autoSaveHistory = v),
                );
              },
            ),
            _divider(colors),
            _switchTile(
              colors,
              title: 'Send on Enter',
              subtitle: 'Press Enter to send a message',
              value: _sendOnEnter,
              onChanged: (value) {
                _toggleExtra(
                  _sendOnEnterKey,
                  value,
                  (v) => setState(() => _sendOnEnter = v),
                );
              },
            ),
          ]),
          const SizedBox(height: 24),

          _sectionTitle(colors, 'Connection'),
          _card(colors, [
            _settingTile(
              colors,
              title: 'AI connection',
              subtitle: 'Groq • Tavily • Server-side',
              onTap: () => _showConnectionInfo(colors),
            ),
          ]),
          const SizedBox(height: 24),

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
    required ValueChanged<bool> onChanged,
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
      trailing: Switch(value: value, onChanged: onChanged),
    );
  }

  Widget _divider(WeuraColors colors) {
    return Divider(
      height: 1,
      indent: 16,
      color: colors.border,
    );
  }
}

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
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 18, 20, 20),
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
