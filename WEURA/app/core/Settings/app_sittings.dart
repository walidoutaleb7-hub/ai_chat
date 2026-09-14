import 'package:flutter/material.dart';

import '../../services/Storage/storage_service.dart';

enum ResponseDetail {
  auto,
  concise,
  balanced,
  detailed,
}

class AppSettingsManager extends ChangeNotifier {
  AppSettingsManager._();

  static final AppSettingsManager instance = AppSettingsManager._();

  static const String _themeKey = 'weura_theme_mode';
  static const String _languageKey = 'weura_language';
  static const String _directionKey = 'weura_text_direction';
  static const String _responseDetailKey = 'weura_response_detail';

  ThemeMode _themeMode = ThemeMode.dark;
  String _language = 'English';
  String _direction = 'Auto';
  ResponseDetail _responseDetail = ResponseDetail.auto;

  ThemeMode get themeMode => _themeMode;
  String get language => _language;
  String get direction => _direction;
  ResponseDetail get responseDetail => _responseDetail;

  TextDirection get textDirection {
    if (_direction == 'RTL') return TextDirection.rtl;
    if (_direction == 'LTR') return TextDirection.ltr;
    if (_language == 'Arabic') return TextDirection.rtl;
    return TextDirection.ltr;
  }

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
  }

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

  Future<void> reset() async {
    _themeMode = ThemeMode.dark;
    _language = 'English';
    _direction = 'Auto';
    _responseDetail = ResponseDetail.auto;
    notifyListeners();

    await Future.wait([
      StorageService.instance.delete(_themeKey),
      StorageService.instance.delete(_languageKey),
      StorageService.instance.delete(_directionKey),
      StorageService.instance.delete(_responseDetailKey),
    ]);
  }

  /// System-prompt fragment injected based on the user's chosen
  /// response detail level. Empty when "Auto" is selected.
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

  /// System-prompt fragment for the user's language preference.
  String languagePrompt() {
    if (_language == 'Arabic') {
      return 'Always respond in Arabic.';
    }
    if (_language == 'English') {
      return 'Always respond in English.';
    }
    return '';
  }

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
}
