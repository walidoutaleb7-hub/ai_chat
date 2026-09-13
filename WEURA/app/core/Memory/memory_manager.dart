import '../../services/Storage/storage_service.dart';

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

  factory WeuraMemory.fromJson(
    Map<String, dynamic> json,
  ) {
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
}

class MemoryManager {
  MemoryManager({
    StorageService? storage,
  }) : _storage = storage ?? StorageService();

  static const String _storageKey = 'weura_memory';

  final StorageService _storage;
  final List<WeuraMemory> _memories = [];

  List<WeuraMemory> get memories =>
      List.unmodifiable(_memories);

  Future<void> load() async {
    final data =
        await _storage.read<List<dynamic>>(_storageKey);

    _memories.clear();

    if (data == null) {
      return;
    }

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

  Future<WeuraMemory> add(String content) async {
    final cleanContent = content.trim();

    if (cleanContent.isEmpty) {
      throw ArgumentError('Memory cannot be empty.');
    }

    final memory = WeuraMemory(
      id: _generateId(),
      content: cleanContent,
      createdAt: DateTime.now(),
    );

    _memories.insert(0, memory);
    await _save();

    return memory;
  }

  Future<bool> update(
    String id,
    String content,
  ) async {
    final index = _memories.indexWhere(
      (memory) => memory.id == id,
    );

    if (index == -1) {
      return false;
    }

    final cleanContent = content.trim();

    if (cleanContent.isEmpty) {
      return false;
    }

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
    final index = _memories.indexWhere(
      (memory) => memory.id == id,
    );

    if (index == -1) {
      return false;
    }

    _memories.removeAt(index);
    await _save();

    return true;
  }

  Future<void> clear() async {
    _memories.clear();
    await _storage.delete(_storageKey);
  }

  List<WeuraMemory> search(String query) {
    final cleanQuery = query.trim().toLowerCase();

    if (cleanQuery.isEmpty) {
      return memories;
    }

    return _memories.where((memory) {
      return memory.content
          .toLowerCase()
          .contains(cleanQuery);
    }).toList();
  }

  String buildRelevantContext(
    String query, {
    int maxItems = 5,
  }) {
    final results = search(query).take(maxItems);

    if (results.isEmpty) {
      return '';
    }

    final buffer = StringBuffer();

    buffer.writeln('Relevant user memory:');

    for (final memory in results) {
      buffer.writeln('- ${memory.content}');
    }

    return buffer.toString().trim();
  }

  Future<void> _save() async {
    await _storage.write(
      _storageKey,
      _memories
          .map((memory) => memory.toJson())
          .toList(),
    );
  }

  String _generateId() {
    return '${DateTime.now().microsecondsSinceEpoch}_${_memories.length}';
  }
}