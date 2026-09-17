import 'package:flutter/material.dart';

import '../../services/Storage/storage_service.dart';
import '../AI/ai_router.dart';

enum ResponseDetail {
  auto,
  concise,
  balanced,
  detailed,
}

class AppSettingsManager extends ChangeNotifier {
  AppSettingsManager._();

  static final AppSettingsManager instance = AppSettingsManager._();

  // ---------------------------------------------------------------------------
  // Storage keys
  // ---------------------------------------------------------------------------

  static const String _themeKey = 'weura_theme_mode';
  static const String _languageKey = 'weura_language';
  static const String _directionKey = 'weura_text_direction';
  static const String _responseDetailKey = 'weura_response_detail';
  static const String _userNameKey = 'weura_user_name';
  static const String _modeKey = 'weura_ai_mode';
  static const String _memoryEnabledKey = 'weura_memory_enabled';
  static const String _voiceInputKey = 'weura_voice_input';
  static const String _voiceOutputKey = 'weura_voice_output';
  static const String _autoSaveKey = 'weura_auto_save';
  static const String _sendOnEnterKey = 'weura_send_on_enter';

  // ---------------------------------------------------------------------------
  // Fields
  // ---------------------------------------------------------------------------

  ThemeMode _themeMode = ThemeMode.dark;
  String _language = 'English';
  String _direction = 'Auto';
  ResponseDetail _responseDetail = ResponseDetail.auto;
  String _userName = '';
  AIMode _mode = AIMode.auto;
  bool _memoryEnabled = true;
  bool _voiceInputEnabled = true;
  bool _voiceOutputEnabled = false;
  bool _autoSaveHistory = true;
  bool _sendOnEnter = true;
  bool _isLoaded = false;

  // ---------------------------------------------------------------------------
  // Getters
  // ---------------------------------------------------------------------------

  ThemeMode get themeMode => _themeMode;
  String get language => _language;
  String get direction => _direction;
  ResponseDetail get responseDetail => _responseDetail;
  String get userName => _userName.trim();
  bool get hasUserName => _userName.trim().isNotEmpty;
  AIMode get mode => _mode;
  bool get memoryEnabled => _memoryEnabled;
  bool get voiceInputEnabled => _voiceInputEnabled;
  bool get voiceOutputEnabled => _voiceOutputEnabled;
  bool get autoSaveHistory => _autoSaveHistory;
  bool get sendOnEnter => _sendOnEnter;
  bool get isLoaded => _isLoaded;

  TextDirection get textDirection {
    if (_direction == 'RTL') return TextDirection.rtl;
    if (_direction == 'LTR') return TextDirection.ltr;
    if (_language == 'Arabic') return TextDirection.rtl;
    return TextDirection.ltr;
  }

  // ---------------------------------------------------------------------------
  // Load
  // ---------------------------------------------------------------------------

  Future<void> load() async {
    final storage = StorageService.instance;

    final themeRaw = await storage.read<String>(_themeKey);
    _themeMode = _parseTheme(themeRaw);

    final lang = await storage.read<String>(_languageKey);
    if (lang != null && lang.isNotEmpty) _language = lang;

    final dir = await storage.read<String>(_directionKey);
    if (dir != null && dir.isNotEmpty) _direction = dir;

    final detailRaw = await storage.read<String>(_responseDetailKey);
    _responseDetail = _parseDetail(detailRaw);

    final nameRaw = await storage.read<String>(_userNameKey);
    if (nameRaw != null) _userName = nameRaw.trim();

    final modeRaw = await storage.read<String>(_modeKey);
    _mode = _parseMode(modeRaw);

    final mem = await storage.read<bool>(_memoryEnabledKey);
    if (mem != null) _memoryEnabled = mem;

    final vIn = await storage.read<bool>(_voiceInputKey);
    if (vIn != null) _voiceInputEnabled = vIn;

    final vOut = await storage.read<bool>(_voiceOutputKey);
    if (vOut != null) _voiceOutputEnabled = vOut;

    final auto = await storage.read<bool>(_autoSaveKey);
    if (auto != null) _autoSaveHistory = auto;

    final send = await storage.read<bool>(_sendOnEnterKey);
    if (send != null) _sendOnEnter = send;

    _isLoaded = true;
    notifyListeners();
  }

  // ---------------------------------------------------------------------------
  // Setters
  // ---------------------------------------------------------------------------

  Future<void> setThemeMode(ThemeMode mode) async {
    if (_themeMode == mode) return;
    _themeMode = mode;
    notifyListeners();
    await StorageService.instance.write(_themeKey, _themeToString(mode));
  }

  Future<void> setLanguage(String value) async {
    if (_language == value) return;
    _language = value;
    notifyListeners();
    await StorageService.instance.write(_languageKey, value);
  }

  Future<void> setDirection(String value) async {
    if (_direction == value) return;
    _direction = value;
    notifyListeners();
    await StorageService.instance.write(_directionKey, value);
  }

  Future<void> setResponseDetail(ResponseDetail value) async {
    if (_responseDetail == value) return;
    _responseDetail = value;
    notifyListeners();
    await StorageService.instance
        .write(_responseDetailKey, _nameOfDetail(value));
  }

  Future<void> setUserName(String value) async {
    final clean = value.trim();
    if (_userName == clean) return;
    _userName = clean;
    notifyListeners();
    if (clean.isEmpty) {
      await StorageService.instance.delete(_userNameKey);
    } else {
      await StorageService.instance.write(_userNameKey, clean);
    }
  }

  Future<void> setMode(AIMode value) async {
    if (_mode == value) return;
    _mode = value;
    notifyListeners();
    await StorageService.instance.write(_modeKey, value.name);
  }

  Future<void> setMemoryEnabled(bool value) async {
    if (_memoryEnabled == value) return;
    _memoryEnabled = value;
    notifyListeners();
    await StorageService.instance.write(_memoryEnabledKey, value);
  }

  Future<void> setVoiceInputEnabled(bool value) async {
    if (_voiceInputEnabled == value) return;
    _voiceInputEnabled = value;
    notifyListeners();
    await StorageService.instance.write(_voiceInputKey, value);
  }

  Future<void> setVoiceOutputEnabled(bool value) async {
    if (_voiceOutputEnabled == value) return;
    _voiceOutputEnabled = value;
    notifyListeners();
    await StorageService.instance.write(_voiceOutputKey, value);
  }

  Future<void> setAutoSaveHistory(bool value) async {
    if (_autoSaveHistory == value) return;
    _autoSaveHistory = value;
    notifyListeners();
    await StorageService.instance.write(_autoSaveKey, value);
  }

  Future<void> setSendOnEnter(bool value) async {
    if (_sendOnEnter == value) return;
    _sendOnEnter = value;
    notifyListeners();
    await StorageService.instance.write(_sendOnEnterKey, value);
  }

  // ---------------------------------------------------------------------------
  // Reset
  // ---------------------------------------------------------------------------

  Future<void> reset() async {
    _themeMode = ThemeMode.dark;
    _language = 'English';
    _direction = 'Auto';
    _responseDetail = ResponseDetail.auto;
    _userName = '';
    _mode = AIMode.auto;
    _memoryEnabled = true;
    _voiceInputEnabled = true;
    _voiceOutputEnabled = false;
    _autoSaveHistory = true;
    _sendOnEnter = true;

    notifyListeners();

    await Future.wait([
      StorageService.instance.delete(_themeKey),
      StorageService.instance.delete(_languageKey),
      StorageService.instance.delete(_directionKey),
      StorageService.instance.delete(_responseDetailKey),
      StorageService.instance.delete(_userNameKey),
      StorageService.instance.delete(_modeKey),
      StorageService.instance.delete(_memoryEnabledKey),
      StorageService.instance.delete(_voiceInputKey),
      StorageService.instance.delete(_voiceOutputKey),
      StorageService.instance.delete(_autoSaveKey),
      StorageService.instance.delete(_sendOnEnterKey),
    ]);

    notifyListeners();
  }

  // ---------------------------------------------------------------------------
  // Prompt fragments
  // ---------------------------------------------------------------------------

  /// Response-detail fragment injected into the system prompt.
  /// Empty when "Auto" is selected.
  String responseDetailPrompt() {
    switch (_responseDetail) {
      case ResponseDetail.auto:
        return '';
      case ResponseDetail.concise:
        return 'Keep answers short, direct and to the point. '
            'Avoid unnecessary detail.';
      case ResponseDetail.balanced:
        return 'Provide balanced answers with enough detail to be useful, '
            'without being excessive.';
      case ResponseDetail.detailed:
        return 'Provide thorough, detailed and well-structured explanations.';
    }
  }

  /// Language fragment injected into the system prompt.
  ///
  /// - "Arabic"  -> force Arabic output regardless of input.
  /// - "English" -> match the user's message language.
  /// - "Auto"    -> match the user's message language.
  String languagePrompt() {
    if (_language == 'Arabic') {
      return 'Always respond in Arabic, regardless of the language the '
          'user writes in.';
    }
    return 'Always match the language and dialect of the user\'s last '
        'message.';
  }

  // ---------------------------------------------------------------------------
  // Parsers
  // ---------------------------------------------------------------------------

  static ThemeMode _parseTheme(String? raw) {
    switch (raw) {
      case 'light':
        return ThemeMode.light;
      case 'system':
        return ThemeMode.system;
      default:
        return ThemeMode.dark;
    }
  }

  static String _themeToString(ThemeMode mode) {
    switch (mode) {
      case ThemeMode.light:
        return 'light';
      case ThemeMode.system:
        return 'system';
      case ThemeMode.dark:
        return 'dark';
    }
  }

  static ResponseDetail _parseDetail(String? raw) {
    switch (raw) {
      case 'concise':
        return ResponseDetail.concise;
      case 'balanced':
        return ResponseDetail.balanced;
      case 'detailed':
        return ResponseDetail.detailed;
      default:
        return ResponseDetail.auto;
    }
  }

  static String _nameOfDetail(ResponseDetail detail) {
    switch (detail) {
      case ResponseDetail.auto:
        return 'auto';
      case ResponseDetail.concise:
        return 'concise';
      case ResponseDetail.balanced:
        return 'balanced';
      case ResponseDetail.detailed:
        return 'detailed';
    }
  }

  static AIMode _parseMode(String? raw) {
    if (raw == null) return AIMode.auto;
    for (final mode in AIMode.values) {
      if (mode.name == raw) return mode;
    }
    return AIMode.auto;
  }
}