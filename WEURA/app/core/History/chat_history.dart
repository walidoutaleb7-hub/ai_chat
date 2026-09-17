import 'dart:math' as math;

import '../../services/Storage/storage_service.dart';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

class ChatMessageData {
  const ChatMessageData({
    required this.text,
    required this.isUser,
    required this.timestamp,
    this.imageUrl,
    this.imagePrompt,
    this.playerData,
    this.visionImagePath,
  });

  final String text;
  final bool isUser;
  final DateTime timestamp;
  final String? imageUrl;
  final String? imagePrompt;
  final Map<String, dynamic>? playerData;
  final String? visionImagePath;

  Map<String, dynamic> toJson() {
    return {
      'text': text,
      'isUser': isUser,
      'timestamp': timestamp.toIso8601String(),
      if (imageUrl != null) 'imageUrl': imageUrl,
      if (imagePrompt != null) 'imagePrompt': imagePrompt,
      if (playerData != null) 'playerData': playerData,
      if (visionImagePath != null) 'visionImagePath': visionImagePath,
    };
  }

  factory ChatMessageData.fromJson(Map<String, dynamic> json) {
    return ChatMessageData(
      text: json['text']?.toString() ?? '',
      isUser: json['isUser'] == true,
      timestamp: DateTime.tryParse(
            json['timestamp']?.toString() ?? '',
          ) ??
          DateTime.now(),
      imageUrl: json['imageUrl']?.toString(),
      imagePrompt: json['imagePrompt']?.toString(),
      playerData: json['playerData'] is Map
          ? Map<String, dynamic>.from(json['playerData'] as Map)
          : null,
      visionImagePath: json['visionImagePath']?.toString(),
    );
  }

  ChatMessageData copyWith({
    String? text,
    bool? isUser,
    DateTime? timestamp,
    String? imageUrl,
    String? imagePrompt,
    Map<String, dynamic>? playerData,
    String? visionImagePath,
  }) {
    return ChatMessageData(
      text: text ?? this.text,
      isUser: isUser ?? this.isUser,
      timestamp: timestamp ?? this.timestamp,
      imageUrl: imageUrl ?? this.imageUrl,
      imagePrompt: imagePrompt ?? this.imagePrompt,
      playerData: playerData ?? this.playerData,
      visionImagePath: visionImagePath ?? this.visionImagePath,
    );
  }
}

class ChatSession {
  ChatSession({
    required this.id,
    required this.title,
    required this.createdAt,
    required this.updatedAt,
    required this.messages,
  });

  final String id;
  String title;
  final DateTime createdAt;
  DateTime updatedAt;
  final List<ChatMessageData> messages;

  int get messageCount => messages.length;

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'title': title,
      'createdAt': createdAt.toIso8601String(),
      'updatedAt': updatedAt.toIso8601String(),
      'messages': messages.map((m) => m.toJson()).toList(),
    };
  }

  factory ChatSession.fromJson(Map<String, dynamic> json) {
    final rawMessages = json['messages'];

    final messages = <ChatMessageData>[];

    if (rawMessages is List) {
      for (final item in rawMessages) {
        if (item is Map) {
          messages.add(
            ChatMessageData.fromJson(
              Map<String, dynamic>.from(item),
            ),
          );
        }
      }
    }

    return ChatSession(
      id: json['id']?.toString() ?? '',
      title: json['title']?.toString() ?? 'محادثة جديدة',
      createdAt: DateTime.tryParse(
            json['createdAt']?.toString() ?? '',
          ) ??
          DateTime.now(),
      updatedAt: DateTime.tryParse(
            json['updatedAt']?.toString() ?? '',
          ) ??
          DateTime.now(),
      messages: messages,
    );
  }
}

// ---------------------------------------------------------------------------
// HistoryManager
// ---------------------------------------------------------------------------

class HistoryManager {
  HistoryManager({
    StorageService? storage,
  }) : _storage = storage ?? StorageService.instance;

  static const String _storageKey = 'weura_chat_history';
  static const int _maxSessions = 200;
  static const int _maxMessagesPerSession = 500;

  final StorageService _storage;
  final List<ChatSession> _sessions = [];

  List<ChatSession> get sessions => List.unmodifiable(_sessions);

  int get count => _sessions.length;

  bool get isEmpty => _sessions.isEmpty;

  // ---------------------------------------------------------------------------
  // Persistence
  // ---------------------------------------------------------------------------

  Future<void> load() async {
    final data = await _storage.read<List<dynamic>>(_storageKey);

    _sessions.clear();

    if (data == null) return;

    for (final item in data) {
      if (item is Map) {
        final session = ChatSession.fromJson(
          Map<String, dynamic>.from(item),
        );

        if (session.id.isNotEmpty) {
          _sessions.add(session);
        }
      }
    }

    _sort();
  }

  Future<void> _save() async {
    await _storage.write(
      _storageKey,
      _sessions.map((s) => s.toJson()).toList(),
    );
  }

  void _sort() {
    _sessions.sort((a, b) => b.updatedAt.compareTo(a.updatedAt));
  }

  // ---------------------------------------------------------------------------
  // CRUD
  // ---------------------------------------------------------------------------

  Future<ChatSession> create({
    String title = 'محادثة جديدة',
  }) async {
    final session = ChatSession(
      id: _generateId(),
      title: title,
      createdAt: DateTime.now(),
      updatedAt: DateTime.now(),
      messages: [],
    );

    _sessions.insert(0, session);

    if (_sessions.length > _maxSessions) {
      _sessions.removeRange(_maxSessions, _sessions.length);
    }

    await _save();
    return session;
  }

  Future<void> save(ChatSession session) async {
    session.updatedAt = DateTime.now();

    if (session.messages.length > _maxMessagesPerSession) {
      session.messages.removeRange(
        0,
        session.messages.length - _maxMessagesPerSession,
      );
    }

    final index = _sessions.indexWhere((s) => s.id == session.id);

    if (index == -1) {
      _sessions.insert(0, session);
    } else {
      _sessions[index] = session;
    }

    _sort();
    await _save();
  }

  Future<bool> delete(String id) async {
    final before = _sessions.length;
    _sessions.removeWhere((s) => s.id == id);

    if (_sessions.length == before) return false;

    await _save();
    return true;
  }

  Future<bool> rename(String id, String title) async {
    final index = _sessions.indexWhere((s) => s.id == id);
    if (index == -1) return false;

    final cleanTitle = title.trim();
    if (cleanTitle.isEmpty) return false;

    _sessions[index].title = cleanTitle;
    _sessions[index].updatedAt = DateTime.now();

    _sort();
    await _save();
    return true;
  }

  Future<void> clear() async {
    _sessions.clear();
    await _storage.delete(_storageKey);
  }

  // ---------------------------------------------------------------------------
  // Query
  // ---------------------------------------------------------------------------

  ChatSession? findById(String id) {
    for (final session in _sessions) {
      if (session.id == id) return session;
    }
    return null;
  }

  List<ChatSession> search(String query) {
    final cleanQuery = query.trim().toLowerCase();

    if (cleanQuery.isEmpty) return sessions;

    return _sessions.where((session) {
      if (session.title.toLowerCase().contains(cleanQuery)) {
        return true;
      }

      for (final message in session.messages) {
        if (message.text.toLowerCase().contains(cleanQuery)) {
          return true;
        }
      }

      return false;
    }).toList();
  }

  // ---------------------------------------------------------------------------
  // Export / Import
  // ---------------------------------------------------------------------------

  List<Map<String, dynamic>> exportJson() {
    return _sessions.map((s) => s.toJson()).toList();
  }

  Future<void> importJson(List<dynamic> data) async {
    _sessions.clear();

    for (final item in data) {
      if (item is Map) {
        final session = ChatSession.fromJson(
          Map<String, dynamic>.from(item),
        );
        if (session.id.isNotEmpty) {
          _sessions.add(session);
        }
      }
    }

    if (_sessions.length > _maxSessions) {
      _sessions.removeRange(_maxSessions, _sessions.length);
    }

    _sort();
    await _save();
  }

  // ---------------------------------------------------------------------------
  // ID
  // ---------------------------------------------------------------------------

  String _generateId() {
    final now = DateTime.now().microsecondsSinceEpoch;
    final rand = _randomSuffix();
    return '${now}_$rand';
  }

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