import '../../services/Storage/storage_service.dart';

class ChatMessageData {
  const ChatMessageData({
    required this.text,
    required this.isUser,
    required this.timestamp,
  });

  final String text;
  final bool isUser;
  final DateTime timestamp;

  Map<String, dynamic> toJson() {
    return {
      'text': text,
      'isUser': isUser,
      'timestamp': timestamp.toIso8601String(),
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
      title: json['title']?.toString() ?? 'New chat',
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

class HistoryManager {
  HistoryManager({
    StorageService? storage,
  }) : _storage = storage ?? StorageService.instance;

  static const String _storageKey = 'weura_chat_history';

  final StorageService _storage;

  final List<ChatSession> _sessions = [];

  List<ChatSession> get sessions => List.unmodifiable(_sessions);

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

    _sessions.sort(
      (a, b) => b.updatedAt.compareTo(a.updatedAt),
    );
  }

  Future<ChatSession> create({
    String title = 'New chat',
  }) async {
    final session = ChatSession(
      id: DateTime.now().microsecondsSinceEpoch.toString(),
      title: title,
      createdAt: DateTime.now(),
      updatedAt: DateTime.now(),
      messages: [],
    );

    _sessions.insert(0, session);
    await _save();

    return session;
  }

  Future<void> save(ChatSession session) async {
    session.updatedAt = DateTime.now();

    final index = _sessions.indexWhere(
      (item) => item.id == session.id,
    );

    if (index == -1) {
      _sessions.insert(0, session);
    } else {
      _sessions[index] = session;
    }

    _sessions.sort(
      (a, b) => b.updatedAt.compareTo(a.updatedAt),
    );

    await _save();
  }

  Future<bool> delete(String id) async {
    final before = _sessions.length;

    _sessions.removeWhere((item) => item.id == id);

    if (_sessions.length == before) return false;

    await _save();
    return true;
  }

  Future<bool> rename(String id, String title) async {
    final index = _sessions.indexWhere(
      (item) => item.id == id,
    );

    if (index == -1) return false;

    final cleanTitle = title.trim();
    if (cleanTitle.isEmpty) return false;

    _sessions[index].title = cleanTitle;
    await _save();

    return true;
  }

  Future<void> clear() async {
    _sessions.clear();
    await _storage.delete(_storageKey);
  }

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

  Future<void> _save() async {
    await _storage.write(
      _storageKey,
      _sessions.map((s) => s.toJson()).toList(),
    );
  }
}
