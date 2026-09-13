import 'dart:convert';

class StorageService {
  final Map<String, String> _memory = {};

  Future<void> write(String key, dynamic value) async {
    _memory[key] = jsonEncode(value);
  }

  Future<T?> read<T>(String key) async {
    final raw = _memory[key];

    if (raw == null) {
      return null;
    }

    try {
      return jsonDecode(raw) as T;
    } catch (_) {
      return null;
    }
  }

  Future<void> delete(String key) async {
    _memory.remove(key);
  }

  Future<void> clear() async {
    _memory.clear();
  }

  Future<bool> contains(String key) async {
    return _memory.containsKey(key);
  }

  Future<Map<String, dynamic>> readMap(String key) async {
    final raw = _memory[key];

    if (raw == null) {
      return {};
    }

    try {
      final decoded = jsonDecode(raw);

      if (decoded is Map<String, dynamic>) {
        return decoded;
      }

      return {};
    } catch (_) {
      return {};
    }
  }

  Future<void> writeMap(
    String key,
    Map<String, dynamic> value,
  ) async {
    _memory[key] = jsonEncode(value);
  }
}