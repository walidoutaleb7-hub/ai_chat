import 'package:flutter/material.dart';

enum ResponseDetail {
  auto,
  concise,
  balanced,
  detailed,
}

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
  ThemeMode _themeMode = ThemeMode.dark;
  String _language = 'English';
  String _direction = 'Auto';
  ResponseDetail _responseDetail = ResponseDetail.auto;

  bool _memoryEnabled = true;
  bool _voiceInput = true;
  bool _voiceOutput = false;
  bool _autoSaveHistory = true;
  bool _sendOnEnter = true;
  bool _hapticFeedback = true;
  bool _streamResponses = true;
  bool _showStatusMessages = true;

  String get _responseDetailName {
    switch (_responseDetail) {
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

  String get _themeName {
    switch (_themeMode) {
      case ThemeMode.system:
        return 'System';
      case ThemeMode.light:
        return 'Light';
      case ThemeMode.dark:
        return 'Dark';
    }
  }

  Future<void> _selectTheme() async {
    final result = await showModalBottomSheet<ThemeMode>(
      context: context,
      backgroundColor: const Color(0xFF15151D),
      builder: (_) {
        return _SelectionSheet<ThemeMode>(
          title: 'Appearance',
          value: _themeMode,
          options: const [
            _SelectionOption(
              value: ThemeMode.system,
              title: 'System',
            ),
            _SelectionOption(
              value: ThemeMode.dark,
              title: 'Dark',
            ),
            _SelectionOption(
              value: ThemeMode.light,
              title: 'Light',
            ),
          ],
        );
      },
    );

    if (result != null && mounted) {
      setState(() => _themeMode = result);
      _showChanged('Appearance changed');
    }
  }

  Future<void> _selectLanguage() async {
    final result = await showModalBottomSheet<String>(
      context: context,
      backgroundColor: const Color(0xFF15151D),
      builder: (_) {
        return _SelectionSheet<String>(
          title: 'Language',
          value: _language,
          options: const [
            _SelectionOption(
              value: 'English',
              title: 'English',
            ),
            _SelectionOption(
              value: 'Arabic',
              title: 'العربية',
            ),
            _SelectionOption(
              value: 'Auto',
              title: 'Auto',
            ),
          ],
        );
      },
    );

    if (result != null && mounted) {
      setState(() => _language = result);
      _showChanged('Language changed');
    }
  }

  Future<void> _selectDirection() async {
    final result = await showModalBottomSheet<String>(
      context: context,
      backgroundColor: const Color(0xFF15151D),
      builder: (_) {
        return _SelectionSheet<String>(
          title: 'Text direction',
          value: _direction,
          options: const [
            _SelectionOption(
              value: 'Auto',
              title: 'Auto',
            ),
            _SelectionOption(
              value: 'LTR',
              title: 'Left to right',
            ),
            _SelectionOption(
              value: 'RTL',
              title: 'Right to left',
            ),
          ],
        );
      },
    );

    if (result != null && mounted) {
      setState(() => _direction = result);
      _showChanged('Text direction changed');
    }
  }

  Future<void> _selectResponseDetail() async {
    final result =
        await showModalBottomSheet<ResponseDetail>(
      context: context,
      backgroundColor: const Color(0xFF15151D),
      builder: (_) {
        return _SelectionSheet<ResponseDetail>(
          title: 'Response detail',
          value: _responseDetail,
          options: const [
            _SelectionOption(
              value: ResponseDetail.auto,
              title: 'Auto',
            ),
            _SelectionOption(
              value: ResponseDetail.concise,
              title: 'Concise',
            ),
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

    if (result != null && mounted) {
      setState(() => _responseDetail = result);
      _showChanged('Response detail changed');
    }
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

  void _confirmResetSettings() {
    showDialog<void>(
      context: context,
      builder: (dialogContext) {
        return AlertDialog(
          backgroundColor: const Color(0xFF15151D),
          title: const Text(
            'Reset settings?',
            style: TextStyle(color: Colors.white),
          ),
          content: const Text(
            'All WEURA preferences will return to their defaults.',
            style: TextStyle(
              color: Colors.white70,
              height: 1.4,
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogContext),
              child: const Text('Cancel'),
            ),
            TextButton(
              onPressed: () {
                Navigator.pop(dialogContext);

                setState(() {
                  _themeMode = ThemeMode.dark;
                  _language = 'English';
                  _direction = 'Auto';
                  _responseDetail = ResponseDetail.auto;

                  _memoryEnabled = true;
                  _voiceInput = true;
                  _voiceOutput = false;
                  _autoSaveHistory = true;
                  _sendOnEnter = true;
                  _hapticFeedback = true;
                  _streamResponses = true;
                  _showStatusMessages = true;
                });

                _showChanged('Settings reset');
              },
              child: const Text(
                'Reset',
                style: TextStyle(color: Colors.redAccent),
              ),
            ),
          ],
        );
      },
    );
  }

  void _confirmClearData() {
    showDialog<void>(
      context: context,
      builder: (dialogContext) {
        return AlertDialog(
          backgroundColor: const Color(0xFF15151D),
          title: const Text(
            'Clear local data?',
            style: TextStyle(color: Colors.white),
          ),
          content: const Text(
            'This can remove locally stored conversations, '
            'memory and preferences.',
            style: TextStyle(
              color: Colors.white70,
              height: 1.4,
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogContext),
              child: const Text('Cancel'),
            ),
            TextButton(
              onPressed: () {
                widget.onClearLocalData?.call();
                Navigator.pop(dialogContext);
                _showChanged('Local data cleared');
              },
              child: const Text(
                'Clear',
                style: TextStyle(color: Colors.redAccent),
              ),
            ),
          ],
        );
      },
    );
  }

  void _showAbout() {
    showAboutDialog(
      context: context,
      applicationName: 'WEURA AI',
      applicationVersion: '1.0.0',
      applicationLegalese: 'Think Beyond. • Walid Out',
      applicationIcon: Container(
        width: 48,
        height: 48,
        decoration: BoxDecoration(
          color: const Color(0xFF1D4ED8),
          borderRadius: BorderRadius.circular(14),
        ),
        child: const Icon(
          Icons.auto_awesome,
          color: Colors.white,
        ),
      ),
      children: const [
        Text(
          'WEURA AI is an intelligent AI assistant '
          'built to think, create and help you go beyond.',
        ),
      ],
    );
  }

  void _showConnectionInfo() {
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: const Color(0xFF15151D),
      builder: (_) {
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(22),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Connection',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 20,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 16),
                _infoRow(
                  Icons.cloud_done_outlined,
                  'AI Engine',
                  'Grok',
                ),
                _infoRow(
                  Icons.security_outlined,
                  'API key',
                  'Server-side',
                ),
                _infoRow(
                  Icons.shield_outlined,
                  'Security',
                  'Protected',
                ),
                const SizedBox(height: 10),
                const Text(
                  'Connection availability depends on the '
                  'WEURA backend configuration.',
                  style: TextStyle(
                    color: Colors.white54,
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

  Widget _infoRow(
    IconData icon,
    String title,
    String value,
  ) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        children: [
          Icon(icon, color: Colors.white60),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              title,
              style: const TextStyle(color: Colors.white70),
            ),
          ),
          Text(
            value,
            style: const TextStyle(
              color: Colors.white,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF07070C),
      appBar: AppBar(
        backgroundColor: const Color(0xFF07070C),
        elevation: 0,
        leading: IconButton(
          icon: const Icon(
            Icons.arrow_back_ios_new,
            color: Colors.white,
            size: 20,
          ),
          onPressed: () {
            if (widget.onBack != null) {
              widget.onBack!();
            } else if (Navigator.canPop(context)) {
              Navigator.pop(context);
            }
          },
        ),
        title: const Text(
          'Settings',
          style: TextStyle(
            color: Colors.white,
            fontWeight: FontWeight.w700,
          ),
        ),
        actions: [
          IconButton(
            tooltip: 'Reset settings',
            onPressed: _confirmResetSettings,
            icon: const Icon(
              Icons.restart_alt,
              color: Colors.white70,
            ),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(
          16,
          10,
          16,
          40,
        ),
        children: [
          _sectionTitle('Appearance'),
          _card([
            _settingTile(
              icon: Icons.dark_mode_outlined,
              title: 'Appearance',
              subtitle: _themeName,
              onTap: _selectTheme,
            ),
            _divider(),
            _settingTile(
              icon: Icons.language,
              title: 'Language',
              subtitle: _language,
              onTap: _selectLanguage,
            ),
            _divider(),
            _settingTile(
              icon: Icons.format_textdirection_l_to_r,
              title: 'Text direction',
              subtitle: _direction,
              onTap: _selectDirection,
            ),
          ]),
          const SizedBox(height: 24),

          _sectionTitle('AI'),
          _card([
            _settingTile(
              icon: Icons.tune,
              title: 'Response detail',
              subtitle: _responseDetailName,
              onTap: _selectResponseDetail,
            ),
            _divider(),
            _switchTile(
              icon: Icons.psychology_outlined,
              title: 'Memory',
              subtitle: 'Allow WEURA to use saved memories',
              value: _memoryEnabled,
              onChanged: (value) {
                setState(() => _memoryEnabled = value);
              },
            ),
            _divider(),
            _switchTile(
              icon: Icons.bolt_outlined,
              title: 'Stream responses',
              subtitle: 'Show responses as they are generated',
              value: _streamResponses,
              onChanged: (value) {
                setState(() => _streamResponses = value);
              },
            ),
            _divider(),
            _switchTile(
              icon: Icons.sync_outlined,
              title: 'Status messages',
              subtitle: 'Show analyzing and processing states',
              value: _showStatusMessages,
              onChanged: (value) {
                setState(() => _showStatusMessages = value);
              },
            ),
          ]),
          const SizedBox(height: 24),

          _sectionTitle('Voice'),
          _card([
            _switchTile(
              icon: Icons.mic_none,
              title: 'Voice input',
              subtitle: 'Use your microphone for messages',
              value: _voiceInput,
              onChanged: (value) {
                setState(() => _voiceInput = value);
              },
            ),
            _divider(),
            _switchTile(
              icon: Icons.volume_up_outlined,
              title: 'Voice output',
              subtitle: 'Read AI responses aloud',
              value: _voiceOutput,
              onChanged: (value) {
                setState(() => _voiceOutput = value);
              },
            ),
          ]),
          const SizedBox(height: 24),

          _sectionTitle('Chat'),
          _card([
            _switchTile(
              icon: Icons.save_outlined,
              title: 'Auto-save history',
              subtitle: 'Automatically save conversations',
              value: _autoSaveHistory,
              onChanged: (value) {
                setState(() => _autoSaveHistory = value);
              },
            ),
            _divider(),
            _switchTile(
              icon: Icons.keyboard_return,
              title: 'Send on Enter',
              subtitle: 'Press Enter to send a message',
              value: _sendOnEnter,
              onChanged: (value) {
                setState(() => _sendOnEnter = value);
              },
            ),
            _divider(),
            _switchTile(
              icon: Icons.vibration_outlined,
              title: 'Haptic feedback',
              subtitle: 'Use subtle vibration for interactions',
              value: _hapticFeedback,
              onChanged: (value) {
                setState(() => _hapticFeedback = value);
              },
            ),
          ]),
          const SizedBox(height: 24),

          _sectionTitle('Connection'),
          _card([
            _settingTile(
              icon: Icons.cloud_outlined,
              title: 'AI connection',
              subtitle: 'Grok • Server-side API',
              onTap: _showConnectionInfo,
            ),
          ]),
          const SizedBox(height: 24),

          _sectionTitle('Privacy'),
          _card([
            _settingTile(
              icon: Icons.delete_outline,
              title: 'Clear local data',
              subtitle: 'Remove locally stored WEURA data',
              destructive: true,
              onTap: _confirmClearData,
            ),
          ]),
          const SizedBox(height: 24),

          _sectionTitle('About'),
          _card([
            _settingTile(
              icon: Icons.info_outline,
              title: 'About WEURA',
              subtitle: 'WEURA AI • Version 1.0.0',
              onTap: _showAbout,
            ),
          ]),
        ],
      ),
    );
  }

  Widget _sectionTitle(String title) {
    return Padding(
      padding: const EdgeInsets.only(
        left: 4,
        bottom: 9,
      ),
      child: Text(
        title.toUpperCase(),
        style: const TextStyle(
          color: Colors.white38,
          fontSize: 11,
          fontWeight: FontWeight.w700,
          letterSpacing: 1.2,
        ),
      ),
    );
  }

  Widget _card(List<Widget> children) {
    return Container(
      decoration: BoxDecoration(
        color: const Color(0xFF111119),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(
          color: Colors.white.withValues(alpha: 0.06),
        ),
      ),
      child: Column(children: children),
    );
  }

  Widget _settingTile({
    required IconData icon,
    required String title,
    required String subtitle,
    required VoidCallback onTap,
    bool destructive = false,
  }) {
    return ListTile(
      onTap: onTap,
      contentPadding: const EdgeInsets.symmetric(
        horizontal: 15,
        vertical: 4,
      ),
      leading: Icon(
        icon,
        color: destructive
            ? Colors.redAccent
            : Colors.white70,
      ),
      title: Text(
        title,
        style: TextStyle(
          color: destructive
              ? Colors.redAccent
              : Colors.white,
          fontWeight: FontWeight.w600,
        ),
      ),
      subtitle: Text(
        subtitle,
        style: const TextStyle(
          color: Colors.white38,
          fontSize: 12,
        ),
      ),
      trailing: const Icon(
        Icons.chevron_right,
        color: Colors.white30,
      ),
    );
  }

  Widget _switchTile({
    required IconData icon,
    required String title,
    required String subtitle,
    required bool value,
    required ValueChanged<bool> onChanged,
  }) {
    return ListTile(
      contentPadding: const EdgeInsets.symmetric(
        horizontal: 15,
        vertical: 4,
      ),
      leading: Icon(
        icon,
        color: Colors.white70,
      ),
      title: Text(
        title,
        style: const TextStyle(
          color: Colors.white,
          fontWeight: FontWeight.w600,
        ),
      ),
      subtitle: Text(
        subtitle,
        style: const TextStyle(
          color: Colors.white38,
          fontSize: 12,
        ),
      ),
      trailing: Switch(
        value: value,
        onChanged: onChanged,
      ),
    );
  }

  Widget _divider() {
    return Divider(
      height: 1,
      indent: 60,
      color: Colors.white.withValues(alpha: 0.05),
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
    required this.title,
    required this.value,
    required this.options,
  });

  final String title;
  final T value;
  final List<_SelectionOption<T>> options;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(
          20,
          18,
          20,
          20,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              title,
              style: const TextStyle(
                color: Colors.white,
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
                  style: const TextStyle(
                    color: Colors.white,
                  ),
                ),
                trailing: option.value == value
                    ? const Icon(
                        Icons.check,
                        color: Colors.blueAccent,
                      )
                    : null,
                onTap: () {
                  Navigator.pop(
                    context,
                    option.value,
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}