import 'dart:math' as math;

import '../../services/Storage/storage_service.dart';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

class WeuraMemory {
  const WeuraMemory({
    required this.id,
    required this.content,
    required this.createdAt,
    this.updatedAt,
  });

  final String id;
  final String content;
  final DateTime createdAt;
  final DateTime? updatedAt;

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'content': content,
      'createdAt': createdAt.toIso8601String(),
      'updatedAt': updatedAt?.toIso8601String(),
    };
  }

  factory WeuraMemory.fromJson(Map<String, dynamic> json) {
    return WeuraMemory(
      id: json['id']?.toString() ?? '',
      content: json['content']?.toString() ?? '',
      createdAt: DateTime.tryParse(
            json['createdAt']?.toString() ?? '',
          ) ??
          DateTime.now(),
      updatedAt: DateTime.tryParse(
        json['updatedAt']?.toString() ?? '',
      ),
    );
  }

  WeuraMemory copyWith({
    String? id,
    String? content,
    DateTime? createdAt,
    DateTime? updatedAt,
  }) {
    return WeuraMemory(
      id: id ?? this.id,
      content: content ?? this.content,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
    );
  }
}

class MemoryManager {
  MemoryManager({StorageService? storage})
      : _storage = storage ?? StorageService.instance;

  static const String _storageKey = 'weura_memory';
  static const int _maxMemories = 500;
  static const int _maxContentLength = 2000;

  final StorageService _storage;
  final List<WeuraMemory> _memories = [];

  List<WeuraMemory> get memories => List.unmodifiable(_memories);

  int get count => _memories.length;

  static const Set<String> _stopWords = {
    'من', 'ما', 'هل', 'في', 'على', 'عن', 'إلى', 'الى', 'هذا', 'هذه',
    'ذلك', 'التي', 'الذي', 'كان', 'كانت', 'هو', 'هي', 'أنا', 'انا',
    'أنت', 'انت', 'نحن', 'هم', 'لا', 'نعم', 'و', 'أو', 'او', 'ثم',
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been',
    'of', 'in', 'on', 'at', 'to', 'for', 'with', 'and', 'or',
    'i', 'you', 'he', 'she', 'it', 'we', 'they', 'do', 'does',
    'did', 'my', 'your', 'his', 'her', 'its', 'our', 'their',
    'what', 'who', 'when', 'where', 'why', 'how', 'this', 'that',
  };

  static final List<RegExp> _namePatterns = [
    RegExp(
      r"(?:my name is|call me)\s+([A-Za-z\u0600-\u06FF][A-Za-z\u0600-\u06FF\s\-]{1,30})",
      caseSensitive: false,
    ),
    RegExp(
      r"(?:اسمي|إسمي|نادني|نادى علي|ناديني)\s+([A-Za-z\u0600-\u06FF][A-Za-z\u0600-\u06FF\s\-]{1,30})",
      caseSensitive: false,
    ),
  ];

  static const Set<String> _notNames = {
    'tired', 'sad', 'happy', 'hungry', 'busy', 'here', 'there',
    'good', 'fine', 'okay', 'ok', 'ready', 'sorry', 'learning',
    'thinking', 'working', 'going', 'coming', 'waiting',
    'هنا', 'هناك', 'بخير', 'لاباس', 'تعبان', 'فرحان', 'زعفان',
    'جاهز', 'مشغول', 'رايح', 'جاي', 'نستنى',
  };

  Future<void> load() async {
    final data = await _storage.read<List<dynamic>>(_storageKey);

    _memories.clear();

    if (data == null) return;

    for (final item in data) {
      if (item is Map) {
        final memory = WeuraMemory.fromJson(
          Map<String, dynamic>.from(item),
        );

        if (memory.content.trim().isNotEmpty) {
          _memories.add(memory);
        }
      }
    }
  }

  Future<void> _save() async {
    await _storage.write(
      _storageKey,
      _memories.map((memory) => memory.toJson()).toList(),
    );
  }

  Future<WeuraMemory> add(String content) async {
    final cleanContent = content.trim();

    if (cleanContent.isEmpty) {
      throw ArgumentError('Memory cannot be empty.');
    }

    if (cleanContent.length > _maxContentLength) {
      throw ArgumentError(
        'Memory is too long (max $_maxContentLength characters).',
      );
    }

    final memory = WeuraMemory(
      id: _generateId(),
      content: cleanContent,
      createdAt: DateTime.now(),
    );

    _memories.insert(0, memory);

    if (_memories.length > _maxMemories) {
      _memories.removeRange(_maxMemories, _memories.length);
    }

    await _save();
    return memory;
  }

  Future<bool> update(String id, String content) async {
    final index = _memories.indexWhere((memory) => memory.id == id);
    if (index == -1) return false;

    final cleanContent = content.trim();
    if (cleanContent.isEmpty) return false;
    if (cleanContent.length > _maxContentLength) return false;

    final old = _memories[index];

    _memories[index] = WeuraMemory(
      id: old.id,
      content: cleanContent,
      createdAt: old.createdAt,
      updatedAt: DateTime.now(),
    );

    await _save();
    return true;
  }

  Future<bool> delete(String id) async {
    final index = _memories.indexWhere((memory) => memory.id == id);
    if (index == -1) return false;

    _memories.removeAt(index);
    await _save();
    return true;
  }

  Future<void> clear() async {
    _memories.clear();
    await _storage.delete(_storageKey);
  }

  WeuraMemory? getById(String id) {
    for (final memory in _memories) {
      if (memory.id == id) return memory;
    }
    return null;
  }

  List<WeuraMemory> search(String query) {
    final cleanQuery = query.trim().toLowerCase();
    if (cleanQuery.isEmpty) return memories;

    return _memories.where((memory) {
      return memory.content.toLowerCase().contains(cleanQuery);
    }).toList();
  }

  String buildRelevantContext(String query, {int maxItems = 5}) {
    if (_memories.isEmpty) return '';

    final cleanQuery = query.trim().toLowerCase();

    final words = cleanQuery
        .split(RegExp(r'[\s،,\.\?!]+'))
        .where((w) => w.length >= 2 && !_stopWords.contains(w))
        .toList();

    final scored = <MapEntry<WeuraMemory, int>>[];

    for (final memory in _memories) {
      final content = memory.content.toLowerCase();
      int score = 0;

      for (final word in words) {
        if (content.contains(word)) score++;
      }

      if (_looksLikeNameMemory(content)) score += 1;

      if (score > 0) {
        scored.add(MapEntry(memory, score));
      }
    }

    scored.sort((a, b) => b.value.compareTo(a.value));

    final selected = <WeuraMemory>[];
    for (final entry in scored) {
      if (selected.length >= maxItems) break;
      selected.add(entry.key);
    }

    if (selected.isEmpty) {
      selected.addAll(_memories.take(maxItems));
    }

    if (selected.isEmpty) return '';

    final buffer = StringBuffer();
    for (final memory in selected) {
      buffer.writeln('- ${memory.content}');
    }

    return buffer.toString().trim();
  }

  bool _looksLikeNameMemory(String lowerContent) {
    return lowerContent.contains('اسمي') ||
        lowerContent.contains('إسمي') ||
        lowerContent.contains('my name is') ||
        lowerContent.contains('نادني') ||
        lowerContent.contains('call me');
  }

  String? getUserName() {
    for (final memory in _memories) {
      final content = memory.content.trim();
      for (final pattern in _namePatterns) {
        final match = pattern.firstMatch(content);
        if (match != null && match.groupCount >= 1) {
          final raw = match.group(1)?.trim() ?? '';
          final clean = _cleanName(raw);
          if (clean.isNotEmpty && clean.length <= 40) {
            return clean;
          }
        }
      }
    }
    return null;
  }

  String _cleanName(String raw) {
    var result = raw.split(RegExp(r'[.,!?؟\n]')).first.trim();

    final tokens = result.split(RegExp(r'\s+'));
    final kept = <String>[];
    for (final token in tokens) {
      if (kept.isNotEmpty && _stopWords.contains(token.toLowerCase())) {
        break;
      }
      kept.add(token);
      if (kept.length >= 3) break;
    }

    result = kept.join(' ').trim();

    if (_notNames.contains(result.toLowerCase())) return '';

    if (RegExp(r'[0-9@#$%^&*()_+=\[\]{}|\\/<>~`]').hasMatch(result)) {
      return '';
    }

    if (result.length < 2) return '';

    return result;
  }

  List<Map<String, dynamic>> exportJson() {
    return _memories.map((m) => m.toJson()).toList();
  }

  Future<void> importJson(List<dynamic> data) async {
    _memories.clear();

    for (final item in data) {
      if (item is Map) {
        final memory = WeuraMemory.fromJson(
          Map<String, dynamic>.from(item),
        );
        if (memory.content.trim().isNotEmpty) {
          _memories.add(memory);
        }
      }
    }

    if (_memories.length > _maxMemories) {
      _memories.removeRange(_maxMemories, _memories.length);
    }

    await _save();
  }

  String _generateId() {
    final now = DateTime.now().microsecondsSinceEpoch;
    final rand = _randomSuffix();
    return '${now}_$rand';
  }

  /// Random suffix using [math.Random] — avoids collisions on devices
  /// with low-resolution microsecond clocks.
  String _randomSuffix() {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    final buffer = StringBuffer();
    final random = math.Random();
    for (int i = 0; i < 6; i++) {
      buffer.write(chars[random.nextInt(chars.length)]);
    }
    return buffer.toString();
  }
}