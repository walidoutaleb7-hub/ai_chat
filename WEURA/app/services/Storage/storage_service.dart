import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

/// WEURA AI — Storage Service
///
/// Persistent local storage backed by SharedPreferences.
/// All values are stored as JSON strings so the service is
/// type-safe for reading maps, lists and primitives.
class StorageService {
  StorageService._(this._prefs);

  final SharedPreferences _prefs;

  static StorageService? _instance;

  /// Returns a ready-to-use StorageService.
  /// Initialization happens once; subsequent calls reuse
  /// the same instance.
  static Future<StorageService> init() async {
    if (_instance != null) return _instance!;

    final prefs = await SharedPreferences.getInstance();
    _instance = StorageService._(prefs);
    return _instance!;
  }

  /// Synchronous accessor for callers that already
  /// called [init].
  static StorageService get instance {
    final instance = _instance;
    if (instance == null) {
      throw StateError(
        'StorageService.init() must be called before accessing instance.',
      );
    }
    return instance;
  }

  Future<void> write(String key, dynamic value) async {
    await _prefs.setString(key, jsonEncode(value));
  }

  Future<T?> read<T>(String key) async {
    final raw = _prefs.getString(key);
    if (raw == null) return null;

    try {
      return jsonDecode(raw) as T;
    } catch (_) {
      return null;
    }
  }

  Future<Map<String, dynamic>> readMap(String key) async {
    final raw = _prefs.getString(key);
    if (raw == null) return {};

    try {
      final decoded = jsonDecode(raw);
      if (decoded is Map<String, dynamic>) return decoded;
      return {};
    } catch (_) {
      return {};
    }
  }

  Future<void> writeMap(
    String key,
    Map<String, dynamic> value,
  ) async {
    await _prefs.setString(key, jsonEncode(value));
  }

  Future<bool> contains(String key) async {
    return _prefs.containsKey(key);
  }

  Future<void> delete(String key) async {
    await _prefs.remove(key);
  }

  Future<void> clear() async {
    await _prefs.clear();
  }
}
