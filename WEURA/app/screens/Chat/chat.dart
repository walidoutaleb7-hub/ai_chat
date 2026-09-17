import 'dart:convert';
import 'dart:io';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_highlight/flutter_highlight.dart';
import 'package:flutter_highlight/themes/atom-one-dark.dart';
import 'package:flutter_markdown_plus/flutter_markdown_plus.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:gal/gal.dart';
import 'package:http/http.dart' as http;
import 'package:image_picker/image_picker.dart';
import 'package:markdown/markdown.dart' as md;
import 'package:share_plus/share_plus.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../components/Composer/comppser.dart';
import '../../components/Player/player_card.dart';
import '../../components/Voice/voice_input_sheet.dart';
import '../../core/AI/ai_router.dart';
import '../../core/History/chat_history.dart';
import '../../core/Memory/memory_manager.dart';
import '../../core/Settings/app_settings.dart';
import '../../core/Theme/weura_theme.dart';
import '../../services/Files/file_service.dart';
import '../../services/Grok/grok_service.dart';
import '../../services/Storage/storage_service.dart';
import '../../services/Voice/voice_output_service.dart';
import '../History/history.dart';
import '../Memory/memory.dart';
import '../Settings/settings.dart';

class ChatScreen extends StatefulWidget {
  const ChatScreen({
    super.key,
    this.initialMessage,
    this.sessionId,
    this.onBack,
  });

  final String? initialMessage;
  final String? sessionId;
  final VoidCallback? onBack;

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatMessage {
  const _ChatMessage({
    required this.text,
    required this.isUser,
    this.isError = false,
    this.imageUrl,
    this.imagePrompt,
    this.visionImagePath,
    this.playerData,
  });

  final String text;
  final bool isUser;
  final bool isError;
  final String? imageUrl;
  final String? imagePrompt;
  final String? visionImagePath;
  final Map<String, dynamic>? playerData;
}

class _ChatScreenState extends State<ChatScreen>
    with TickerProviderStateMixin {
  final GlobalKey<ScaffoldState> _scaffoldKey =
      GlobalKey<ScaffoldState>();

  final ScrollController _scrollController = ScrollController();
  final AIRouter _router = const AIRouter();
  final HistoryManager _history = HistoryManager();
  final MemoryManager _memory = MemoryManager();
  final VoiceOutputService _voiceOut = VoiceOutputService.instance;
  final ImagePicker _imagePicker = ImagePicker();
  final FileService _fileService = FileService();

  late final GrokService _grok;

  final List<_ChatMessage> _messages = [];
  final Map<int, String> _ratings = {};
  final Set<int> _typingIndices = {};

  AIMode _mode = AIMode.auto;
  bool _isLoading = false;
  bool _requestCancelled = false;
  ChatSession? _session;
  WeuraFile? _attachedFile;

  static const String _serverUrl =
      'https://ai-chat-tlol.onrender.com';
  static const String _feedbackKey = 'weura_message_feedback';

  @override
  void initState() {
    super.initState();
    _grok = GrokService(baseUrl: _serverUrl);
    _voiceOut.addListener(_onVoiceChanged);
    _initialize();
  }

  @override
  void dispose() {
    _voiceOut.removeListener(_onVoiceChanged);
    _scrollController.dispose();
    _grok.dispose();
    _voiceOut.stop();
    super.dispose();
  }

  void _onVoiceChanged() {
    if (mounted) setState(() {});
  }

  Future<void> _initialize() async {
    await Future.wait([_history.load(), _memory.load()]);
    await _loadRatings();

    if (widget.sessionId != null) {
      final existing = _history.findById(widget.sessionId!);
      if (existing != null) {
        _session = existing;
        for (final msg in existing.messages) {
          if (msg.text.trim().isEmpty) continue;
          _messages.add(
            _ChatMessage(text: msg.text, isUser: msg.isUser),
          );
        }
        if (mounted) setState(() {});
      }
    }

    if (widget.initialMessage != null &&
        widget.initialMessage!.trim().isNotEmpty) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        _sendMessage(widget.initialMessage!);
      });
    }
  }

  Future<void> _loadRatings() async {
    try {
      final data = await StorageService.instance
          .read<Map<String, dynamic>>(_feedbackKey);
      if (data != null) {
        data.forEach((key, value) {
          final index = int.tryParse(key);
          if (index != null && value is String) {
            _ratings[index] = value;
          }
        });
      }
    } catch (_) {}
  }

  Future<void> _saveRatings() async {
    final map = <String, dynamic>{};
    _ratings.forEach((key, value) {
      map[key.toString()] = value;
    });
    await StorageService.instance.write(_feedbackKey, map);
  }

  void _rateMessage(int index, String rating) {
    setState(() {
      if (_ratings[index] == rating) {
        _ratings.remove(index);
      } else {
        _ratings[index] = rating;
      }
    });
    _saveRatings();
    HapticFeedback.selectionClick();
  }

  Future<void> _copyMessage(String text) async {
    await Clipboard.setData(ClipboardData(text: text));
    if (!mounted) return;
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        const SnackBar(
          content: Text('Copied'),
          duration: Duration(milliseconds: 1200),
        ),
      );
  }

  Future<void> _saveImageToGallery(String imageUrl) async {
    try {
      final hasAccess = await Gal.hasAccess();
      if (!hasAccess) {
        final granted = await Gal.requestAccess();
        if (!granted) {
          if (!mounted) return;
          _showMessage('Gallery permission denied.');
          return;
        }
      }

      final response = await http
          .get(Uri.parse(imageUrl))
          .timeout(const Duration(seconds: 60));

      if (response.statusCode != 200) {
        throw Exception('Download failed: HTTP ${response.statusCode}');
      }

      await Gal.putImageBytes(
        response.bodyBytes,
        album: 'WEURA',
      );

      if (!mounted) return;
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(
          const SnackBar(
            content: Text('Saved to WEURA album'),
            duration: Duration(milliseconds: 1600),
          ),
        );
    } catch (error) {
      debugPrint('[WEURA] Save image error: $error');
      if (!mounted) return;
      _showMessage('Could not save image.');
    }
  }

  Future<void> _shareMessage(String text) async {
    try {
      await Share.share(text);
    } catch (_) {
      if (!mounted) return;
      _showMessage('Could not share.');
    }
  }

  Future<void> _toggleSpeak(int index, String text) async {
    final id = 'msg_$index';
    if (_voiceOut.speakingId == id) {
      await _voiceOut.stop();
      return;
    }
    await _voiceOut.speak(id: id, text: text);
  }

  Future<void> _ensureSession(String firstMessage) async {
    if (_session != null) return;
    final title = firstMessage.length > 40
        ? '${firstMessage.substring(0, 40)}...'
        : firstMessage;
    _session = await _history.create(title: title);
  }

  Future<void> _persistMessages() async {
    final session = _session;
    if (session == null) return;
    session.messages.clear();
    for (final msg in _messages) {
      if (msg.isError) continue;
      if (msg.text.trim().isEmpty &&
          msg.imageUrl == null &&
          msg.visionImagePath == null &&
          msg.playerData == null) {
        continue;
      }

      final storedText = msg.playerData != null
          ? '⚽ ${msg.playerData!['player']?['name'] ?? 'Player'}'
          : msg.visionImagePath != null
              ? '🖼️ ${msg.text}'
              : msg.imageUrl != null
                  ? '🖼️ ${msg.imagePrompt ?? ''}'
                  : msg.text;

      session.messages.add(
        ChatMessageData(
          text: storedText,
          isUser: msg.isUser,
          timestamp: DateTime.now(),
        ),
      );
    }
    await _history.save(session);
  }

  Future<void> _maybeStoreMemory(String userMessage) async {
    final text = userMessage.toLowerCase().trim();
    final triggers = [
      'remember that', 'remember:', 'remember ', 'note that', 'save this',
      'تذكر أن', 'تذكر ان', 'تذكر:', 'احفظ أن', 'احفظ ان', 'احفظ:',
      'خلي في بالك', 'خليك فاكر', 'سجل أن', 'سجل ان',
    ];

    String? content;
    for (final trigger in triggers) {
      final index = text.indexOf(trigger);
      if (index != -1) {
        content = userMessage.substring(index + trigger.length).trim();
        break;
      }
    }

    if (content == null || content.isEmpty) return;
    try {
      await _memory.add(content);
    } catch (_) {}
  }

  // ---------------------------------------------------------------------------
  // Auto-scroll during typing
  // ---------------------------------------------------------------------------

  void _autoScrollDuringTyping() {
    if (!_scrollController.hasClients) return;
    final pos = _scrollController.position;
    final distanceFromBottom = pos.maxScrollExtent - pos.pixels;
    // Only auto-scroll if the user is already near the bottom.
    if (distanceFromBottom < 120) {
      _scrollController.jumpTo(pos.maxScrollExtent);
    }
  }

  // ---------------------------------------------------------------------------
  // File picker + analysis
  // ---------------------------------------------------------------------------

  Future<void> _pickFile() async {
    try {
      final file = await _fileService.pickAndExtract();

      if (file == null) return;
      if (!mounted) return;

      setState(() {
        _attachedFile = file;
      });

      if (file.wasTruncated) {
        _showMessage(
          'File was large — first part will be analyzed.',
        );
      }
    } on FileExtractionException catch (e) {
      if (!mounted) return;
      _showMessage(e.message);
    } catch (e) {
      debugPrint('[WEURA] Pick file error: $e');
      if (!mounted) return;
      _showMessage('Could not read the file.');
    }
  }

  Future<void> _sendFileToServer(WeuraFile file, String question) async {
    await _ensureSession(
      question.isNotEmpty ? question : '📄 ${file.name}',
    );

    setState(() {
      _messages.add(
        _ChatMessage(
          text: question.isEmpty
              ? 'حلل هذا الملف: ${file.name}'
              : question,
          isUser: true,
        ),
      );
      _isLoading = true;
      _requestCancelled = false;
    });

    await _persistMessages();
    _scrollToBottom();

    try {
      final memoryContext = _memory.buildRelevantContext(question);
      final userName = _memory.getUserName();
      final enrichedMemory = _composeMemoryPayload(
        memoryContext: memoryContext,
        userName: userName,
      );

      final uri = Uri.parse('$_serverUrl/api/files/analyze');

      final response = await http
          .post(
            uri,
            headers: const {
              'Content-Type': 'application/json',
              'Accept': 'application/json',
            },
            body: jsonEncode({
              'fileName': file.name,
              'fileType': file.type.name,
              'fileSize': file.size,
              'text': file.extractedText,
              'question': question,
              'memory': enrichedMemory,
            }),
          )
          .timeout(const Duration(seconds: 120));

      if (!mounted || _requestCancelled) return;

      Map<String, dynamic> data;
      try {
        data = jsonDecode(response.body) as Map<String, dynamic>;
      } catch (_) {
        throw Exception('Invalid server response.');
      }

      if (response.statusCode < 200 || response.statusCode >= 300) {
        throw Exception(
          data['error']?.toString() ?? 'File analysis failed.',
        );
      }

      if (data['success'] != true) {
        throw Exception(
          data['error']?.toString() ?? 'File analysis failed.',
        );
      }

      final content = data['content']?.toString().trim() ?? '';
      if (content.isEmpty) {
        throw Exception('AI returned an empty response.');
      }

      setState(() {
        _messages.add(_ChatMessage(text: content, isUser: false));
        _typingIndices.add(_messages.length - 1);
      });

      await _persistMessages();
      _scrollToBottom();
    } catch (error) {
      if (!mounted || _requestCancelled) return;
      setState(() {
        _messages.add(
          _ChatMessage(
            text: _cleanError(error),
            isUser: false,
            isError: true,
          ),
        );
      });
      _scrollToBottom();
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Player Card
  // ---------------------------------------------------------------------------

  String? _detectPlayerIntent(String message) {
    final text = message.trim();
    final lower = text.toLowerCase();

    const triggers = [
      'بطاقة ',
      'بطاقه ',
      'معلومات عن ',
      'بروفايل ',
      'profile of ',
      'card of ',
      'player card ',
    ];

    for (final t in triggers) {
      final idx = lower.indexOf(t);
      if (idx != -1) {
        final rest = text.substring(idx + t.length).trim();
        if (rest.length >= 2 && rest.length <= 50) {
          return rest;
        }
      }
    }

    final infoMatch = RegExp(
      r'^(?:بطاقة|بطاقه|بروفايل|معلومات)\s+(.+)$',
    ).firstMatch(text);
    if (infoMatch != null) {
      final name = infoMatch.group(1)?.trim() ?? '';
      if (name.isNotEmpty && name.length <= 50) return name;
    }

    return null;
  }

  Future<void> _handlePlayerCard(
    String userMessage,
    String playerName,
  ) async {
    await _ensureSession('بطاقة $playerName');

    setState(() {
      _messages.add(_ChatMessage(text: userMessage, isUser: true));
      _isLoading = true;
      _requestCancelled = false;
    });

    await _persistMessages();
    _scrollToBottom();

    try {
      final uri = Uri.parse(
        '$_serverUrl/api/player',
      ).replace(queryParameters: {'name': playerName});

      final response = await http
          .get(uri, headers: const {'Accept': 'application/json'})
          .timeout(const Duration(seconds: 90));

      if (!mounted || _requestCancelled) return;

      Map<String, dynamic> data;
      try {
        data = jsonDecode(response.body) as Map<String, dynamic>;
      } catch (_) {
        throw Exception('Invalid server response.');
      }

      if (response.statusCode < 200 || response.statusCode >= 300) {
        throw Exception(
          data['error']?.toString() ??
              'Player service returned an error.',
        );
      }

      if (data['success'] != true) {
        throw Exception(
          data['error']?.toString() ?? 'Player not found.',
        );
      }

      setState(() {
        _messages.add(
          _ChatMessage(
            text: '',
            isUser: false,
            playerData: data,
          ),
        );
      });

      await _persistMessages();
      _scrollToBottom();
    } catch (error) {
      if (!mounted || _requestCancelled) return;

      setState(() {
        _messages.add(
          _ChatMessage(
            text: _cleanError(error),
            isUser: false,
            isError: true,
          ),
        );
      });

      _scrollToBottom();
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Image generation
  // ---------------------------------------------------------------------------

  bool _isArabicLetterBefore(String text, int index) {
    if (index <= 0) return false;
    final code = text.codeUnitAt(index - 1);
    return (code >= 0x0600 && code <= 0x06FF) ||
        (code >= 0x0750 && code <= 0x077F) ||
        (code >= 0x08A0 && code <= 0x08FF);
  }

  bool _isArabicLetterAfter(String text, int index) {
    if (index >= text.length) return false;
    final code = text.codeUnitAt(index);
    return (code >= 0x0600 && code <= 0x06FF) ||
        (code >= 0x0750 && code <= 0x077F) ||
        (code >= 0x08A0 && code <= 0x08FF);
  }

  String? _detectImageIntent(String message) {
    final text = message.trim();
    final lower = text.toLowerCase();

    const arabicTriggers = [
      'ارسم لي', 'ارسملي', 'ارسم لنا', 'ارسمي لي', 'ارسميلي',
      'رسم لي', 'رسملي',
      'أنشئ لي صورة', 'انشئ لي صورة', 'أنشئلي صورة', 'انشئلي صورة',
      'أنشئ صورة', 'انشئ صورة',
      'أنشئ لي رسمة', 'انشئ لي رسمة',
      'أنشئ لي تصميم', 'انشئ لي تصميم',
      'أنشئ لي خلفية', 'انشئ لي خلفية',
      'أنشئ لي شعار', 'انشئ لي شعار',
      'صمم لي', 'صمملي', 'صمم لنا', 'صممي لي', 'صمميلي',
      'اعمل لي صورة', 'اعمللي صورة', 'اعمل صورة',
      'اعمل لي رسمة', 'اعمللي رسمة',
      'اعمل لي تصميم', 'اعمللي تصميم',
      'اعمل لي شعار', 'اعمللي شعار',
      'اعمل لي خلفية', 'اعمللي خلفية',
      'اعملي صورة', 'اعمليلي صورة',
      'سوي لي صورة', 'سويلي صورة', 'سوي صورة',
      'سوي لي رسمة', 'سويلي رسمة',
      'سوي لي تصميم', 'سويلي تصميم',
      'دير لي صورة', 'ديرلي صورة', 'دير صورة',
      'دير لي رسمة', 'ديرلي رسمة',
      'ولد لي صورة', 'ولدي صورة', 'ولد صورة', 'ولدلي صورة',
      'ولد لي رسمة', 'ولدي رسمة', 'ولد رسمة',
      'ولد لي تصميم', 'ولدي تصميم',
      'وريني صورة', 'ورينيلي صورة', 'وريني رسمة', 'ورينيلي رسمة',
      'صورة لـ', 'صورة عن', 'صورة من',
      'رسمة لـ', 'رسمة عن',
      'تصميم لـ', 'تصميم عن',
      'شعار لـ', 'خلفية لـ',
      'تقدر ترسم', 'تقدر ترسملي', 'تقدر تصمملي', 'تقدر تعملي صورة',
      'تقدر تعمل لي صورة', 'تقدر تولد', 'تقدر تسويلي',
      'واش تقدر ترسم', 'واش تقدر تصمم',
      'حضّرلي صورة', 'حضرلي صورة',
      'جيبلي صورة', 'جيب لي صورة',
    ];

    const englishTriggers = [
      'draw me ', 'draw us ', 'draw a ', 'draw an ',
      'generate an image of ', 'generate an image ', 'generate a picture of ',
      'generate image of ', 'generate image ', 'generate a photo of ',
      'generate a picture ',
      'create an image of ', 'create an image ', 'create a picture of ',
      'create image of ', 'create image ', 'create a photo of ',
      'create a picture ',
      'make me an image of ', 'make me an image ', 'make me a picture of ',
      'make me a picture ', 'make an image of ', 'make a picture of ',
      'make a picture ', 'make me a drawing of ', 'make me a drawing ',
      'make me a wallpaper ', 'make me a logo of ', 'make me a logo ',
      'show me an image of ', 'show me a picture of ',
      'design me a ', 'design me an ', 'design a logo ',
      'design an image ', 'design a picture ',
      'paint me ', 'sketch me ', 'illustrate ',
      'can you draw ', 'can you generate ', 'can you create an image ',
    ];

    final sortedArabic = [...arabicTriggers]
      ..sort((a, b) => b.length.compareTo(a.length));

    for (final trigger in sortedArabic) {
      final idx = text.indexOf(trigger);
      if (idx != -1) {
        if (!_isArabicLetterBefore(text, idx) &&
            !_isArabicLetterAfter(text, idx + trigger.length)) {
          final prompt = text.substring(idx + trigger.length).trim();
          final cleaned = prompt
              .replaceFirst(RegExp(r'^[\s:\-,\.]+'), '')
              .trim();
          if (cleaned.length >= 2) return cleaned;
        }
      }
    }

    final sortedEnglish = [...englishTriggers]
      ..sort((a, b) => b.length.compareTo(a.length));

    for (final trigger in sortedEnglish) {
      final idx = lower.indexOf(trigger);
      if (idx != -1) {
        final prompt = text.substring(idx + trigger.length).trim();
        final cleaned = prompt
            .replaceFirst(RegExp(r'^[\s:\-,\.]+'), '')
            .trim();
        if (cleaned.length >= 2) return cleaned;
      }
    }

    return null;
  }

  String _buildImageUrl(String prompt) {
    final encoded = Uri.encodeComponent(prompt);
    return '$_serverUrl/api/image?prompt=$encoded';
  }

  Future<void> _handleImageGeneration(
    String userMessage,
    String prompt,
  ) async {
    await _ensureSession(userMessage);

    final imageUrl = _buildImageUrl(prompt);

    setState(() {
      _messages.add(_ChatMessage(text: userMessage, isUser: true));
      _messages.add(
        _ChatMessage(
          text: '',
          isUser: false,
          imageUrl: imageUrl,
          imagePrompt: prompt,
        ),
      );
      _isLoading = false;
    });

    await _persistMessages();
    _scrollToBottom();
  }

  // ---------------------------------------------------------------------------
  // Vision
  // ---------------------------------------------------------------------------

  Future<void> _pickImage(ImageSource source) async {
    try {
      final XFile? picked = await _imagePicker.pickImage(
        source: source,
        maxWidth: 1600,
        maxHeight: 1600,
        imageQuality: 85,
      );

      if (picked == null) return;

      await _analyzeImage(picked);
    } catch (error) {
      debugPrint('[WEURA] Pick image error: $error');
      if (!mounted) return;
      _showMessage(
        source == ImageSource.camera
            ? 'Could not open camera.'
            : 'Could not open gallery.',
      );
    }
  }

  Future<void> _analyzeImage(XFile image) async {
    if (_isLoading) return;

    const defaultQuestion = 'اشرح هذه الصورة بالتفصيل.';

    await _ensureSession('🖼️ Image analysis');

    setState(() {
      _messages.add(
        _ChatMessage(
          text: defaultQuestion,
          isUser: true,
          visionImagePath: image.path,
        ),
      );
      _isLoading = true;
      _requestCancelled = false;
    });

    await _persistMessages();
    _scrollToBottom();

    try {
      final bytes = await image.readAsBytes();

      final lowerPath = image.path.toLowerCase();
      String mimeType = 'image/jpeg';
      if (lowerPath.endsWith('.png')) {
        mimeType = 'image/png';
      } else if (lowerPath.endsWith('.webp')) {
        mimeType = 'image/webp';
      } else if (lowerPath.endsWith('.gif')) {
        mimeType = 'image/gif';
      }

      final base64Data = base64Encode(bytes);
      final dataUrl = 'data:$mimeType;base64,$base64Data';

      final uri = Uri.parse('$_serverUrl/api/vision');

      final response = await http
          .post(
            uri,
            headers: const {
              'Content-Type': 'application/json',
              'Accept': 'application/json',
            },
            body: jsonEncode({
              'image': dataUrl,
              'question': defaultQuestion,
            }),
          )
          .timeout(const Duration(seconds: 90));

      if (!mounted || _requestCancelled) return;

      Map<String, dynamic> data;
      try {
        data = jsonDecode(response.body) as Map<String, dynamic>;
      } catch (_) {
        throw Exception('Invalid server response.');
      }

      if (response.statusCode < 200 || response.statusCode >= 300) {
        throw Exception(
          data['error']?.toString() ??
              'Vision request failed (HTTP ${response.statusCode}).',
        );
      }

      if (data['success'] != true) {
        throw Exception(
          data['error']?.toString() ?? 'Vision analysis failed.',
        );
      }

      final content = data['content']?.toString().trim() ?? '';

      if (content.isEmpty) {
        throw Exception('Vision model returned an empty response.');
      }

      setState(() {
        _messages.add(
          _ChatMessage(text: content, isUser: false),
        );
        _typingIndices.add(_messages.length - 1);
      });

      await _persistMessages();
      _scrollToBottom();
    } catch (error) {
      if (!mounted || _requestCancelled) return;

      setState(() {
        _messages.add(
          _ChatMessage(
            text: _cleanError(error),
            isUser: false,
            isError: true,
          ),
        );
      });

      _scrollToBottom();
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Send
  // ---------------------------------------------------------------------------

  Future<void> _sendMessage(String text) async {
    if (_isLoading) return;

    final message = text.trim();

    if (_attachedFile != null) {
      final file = _attachedFile!;
      setState(() => _attachedFile = null);
      await _sendFileToServer(file, message);
      return;
    }

    if (message.isEmpty) return;

    final playerName = _detectPlayerIntent(message);
    if (playerName != null) {
      await _maybeStoreMemory(message);
      await _handlePlayerCard(message, playerName);
      return;
    }

    final imagePrompt = _detectImageIntent(message);
    if (imagePrompt != null) {
      await _maybeStoreMemory(message);
      await _handleImageGeneration(message, imagePrompt);
      return;
    }

    final resolvedMode = _router.resolve(
      message: message,
      selectedMode: _mode,
    );

    await _ensureSession(message);
    await _maybeStoreMemory(message);

    setState(() {
      _messages.add(_ChatMessage(text: message, isUser: true));
      _isLoading = true;
      _requestCancelled = false;
    });

    await _persistMessages();
    _scrollToBottom();

    try {
      final memoryContext =
          _memory.buildRelevantContext(message, maxItems: 5);
      final userName = _memory.getUserName();

      final enrichedMemory = _composeMemoryPayload(
        memoryContext: memoryContext,
        userName: userName,
      );

      final recent = _messages
          .where((m) => !m.isError && m.imageUrl == null)
          .where((m) => m.visionImagePath == null)
          .where((m) => m.playerData == null)
          .where((m) => m.text.trim().isNotEmpty)
          .toList();

      final trimmed = recent.length > 10
          ? recent.sublist(recent.length - 10)
          : recent;

      final history = trimmed
          .map(
            (m) => GrokMessage(
              role: m.isUser ? 'user' : 'assistant',
              content: m.text,
            ),
          )
          .toList();

      final result = await _grok.sendMessage(
        messages: history,
        memory: enrichedMemory,
        mode: resolvedMode.name,
      );

      if (!mounted || _requestCancelled) return;

      if (result.content.trim().isEmpty) {
        setState(() {
          _messages.add(
            const _ChatMessage(
              text: 'WEURA did not return an answer. Please try again.',
              isUser: false,
              isError: true,
            ),
          );
        });
      } else {
        setState(() {
          _messages.add(
            _ChatMessage(text: result.content, isUser: false),
          );
          _typingIndices.add(_messages.length - 1);
        });

        if (AppSettingsManager.instance.voiceOutputEnabled) {
          final newIndex = _messages.length - 1;
          _voiceOut.speak(id: 'msg_$newIndex', text: result.content);
        }
      }

      await _persistMessages();
      _scrollToBottom();
    } catch (error) {
      if (!mounted || _requestCancelled) return;

      setState(() {
        _messages.add(
          _ChatMessage(
            text: _cleanError(error),
            isUser: false,
            isError: true,
          ),
        );
      });

      _scrollToBottom();
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  String _composeMemoryPayload({
    required String memoryContext,
    required String? userName,
  }) {
    final buffer = StringBuffer();

    if (userName != null && userName.trim().isNotEmpty) {
      buffer.writeln('User name: ${userName.trim()}');
    }

    if (memoryContext.trim().isNotEmpty) {
      buffer.writeln(memoryContext.trim());
    }

    return buffer.toString().trim();
  }

  void _cancelRequest() {
    if (!_isLoading) return;
    setState(() {
      _requestCancelled = true;
      _isLoading = false;
    });
  }

  String _cleanError(Object error) {
    if (error is GrokException) return error.message;
    return 'WEURA could not complete the request. '
        'Please check the connection and try again.';
  }

  void _regenerateLast() {
    if (_isLoading || _messages.isEmpty) return;

    int lastUserIndex = -1;
    for (int i = _messages.length - 1; i >= 0; i--) {
      if (_messages[i].isUser) {
        lastUserIndex = i;
        break;
      }
    }

    if (lastUserIndex == -1) return;

    final userText = _messages[lastUserIndex].text;

    _messages.removeRange(lastUserIndex + 1, _messages.length);
    _ratings.removeWhere((key, _) => key > lastUserIndex);
    _typingIndices.removeWhere((i) => i > lastUserIndex);

    setState(() {});
    _sendMessage(userText);
  }

  void _retryLastMessage() {
    if (_isLoading || _messages.isEmpty) return;

    final userMessages = _messages.where((m) => m.isUser).toList();
    if (userMessages.isEmpty) return;

    _messages.removeWhere((m) => !m.isUser && m.isError);
    _typingIndices.clear();
    setState(() {});

    _regenerateLast();
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!_scrollController.hasClients) return;
      _scrollController.animateTo(
        _scrollController.position.maxScrollExtent,
        duration: const Duration(milliseconds: 200),
        curve: Curves.easeOutCubic,
      );
    });
  }

  void _showMessage(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          content: Text(message),
          duration: const Duration(milliseconds: 1600),
        ),
      );
  }

  void _startNewChat() {
    Navigator.of(context).pop();
    if (_messages.isEmpty) return;
    Navigator.of(context).pushReplacement(
      MaterialPageRoute(builder: (_) => const ChatScreen()),
    );
  }

  void _openHistory() {
    Navigator.of(context).pop();
    Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => const HistoryScreen()),
    );
  }

  void _openMemory() {
    Navigator.of(context).pop();
    Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => const MemoryScreen()),
    );
  }

  void _openSettings() {
    Navigator.of(context).pop();
    Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => const SettingsScreen()),
    );
  }

  // ---------------------------------------------------------------------------
  // Image Zoom
  // ---------------------------------------------------------------------------

  void _openImageZoom(String imageUrl) {
    Navigator.of(context).push(
      PageRouteBuilder<void>(
        opaque: false,
        barrierColor: Colors.black,
        transitionDuration: const Duration(milliseconds: 250),
        reverseTransitionDuration: const Duration(milliseconds: 200),
        pageBuilder: (_, __, ___) => _ImageZoomViewer(
          imageUrl: imageUrl,
          onSave: () => _saveImageToGallery(imageUrl),
          onCopyUrl: () => _copyMessage(imageUrl),
        ),
        transitionsBuilder: (_, animation, __, child) {
          return FadeTransition(
            opacity: animation,
            child: ScaleTransition(
              scale: Tween<double>(begin: 0.92, end: 1.0).animate(
                CurvedAnimation(
                  parent: animation,
                  curve: Curves.easeOutCubic,
                ),
              ),
              child: child,
            ),
          );
        },
      ),
    );
  }

  // ---------------------------------------------------------------------------
  // Drawer
  // ---------------------------------------------------------------------------

  Widget _buildDrawer(WeuraColors colors) {
    return Drawer(
      backgroundColor: colors.surfaceElevated,
      width: 285,
      child: SafeArea(
        child: Column(
          children: [
            _drawerHeader(colors),
            const SizedBox(height: 14),
            _drawerNewChatButton(colors),
            const SizedBox(height: 18),
            _drawerSectionTitle(colors, 'Workspace'),
            _drawerItem(
              colors: colors,
              icon: 'assets/icons/history.svg',
              label: 'History',
              onTap: _openHistory,
            ),
            _drawerItem(
              colors: colors,
              icon: 'assets/icons/mode.svg',
              label: 'Memory',
              onTap: _openMemory,
            ),
            const SizedBox(height: 18),
            _drawerSectionTitle(colors, 'App'),
            _drawerItem(
              colors: colors,
              icon: 'assets/icons/settings.svg',
              label: 'Settings',
              onTap: _openSettings,
            ),
            const Spacer(),
            Padding(
              padding: const EdgeInsets.all(16),
              child: Text(
                'WEURA AI • v1.0.0\nThink Beyond.',
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: colors.textFaint,
                  fontSize: 11,
                  height: 1.5,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _drawerHeader(WeuraColors colors) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 18, 20, 0),
      child: Row(
        children: [
          Container(
            width: 44,
            height: 44,
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: colors.surface,
              borderRadius: BorderRadius.circular(13),
              border: Border.all(
                color: colors.accentGlow.withValues(alpha: 0.22),
              ),
            ),
            child: SvgPicture.asset('assets/logo/weura.svg'),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'WEURA',
                  style: TextStyle(
                    color: colors.textPrimary,
                    fontSize: 17,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 1.2,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  'Think Beyond.',
                  style: TextStyle(
                    color: colors.textMuted,
                    fontSize: 11,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _drawerNewChatButton(WeuraColors colors) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 14),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: _startNewChat,
          borderRadius: BorderRadius.circular(13),
          child: Ink(
            height: 48,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(13),
              color: colors.surface,
              border: Border.all(color: colors.border),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                SvgPicture.asset(
                  'assets/icons/plus.svg',
                  width: 20,
                  height: 20,
                ),
                const SizedBox(width: 8),
                Text(
                  'New Chat',
                  style: TextStyle(
                    color: colors.textPrimary,
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _drawerSectionTitle(WeuraColors colors, String title) {
    return Align(
      alignment: Alignment.centerLeft,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 6, 20, 8),
        child: Text(
          title.toUpperCase(),
          style: TextStyle(
            color: colors.textFaint,
            fontSize: 10,
            fontWeight: FontWeight.w700,
            letterSpacing: 1.2,
          ),
        ),
      ),
    );
  }

  Widget _drawerItem({
    required WeuraColors colors,
    required String icon,
    required String label,
    required VoidCallback onTap,
  }) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 2),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(11),
          child: Padding(
            padding: const EdgeInsets.symmetric(
              horizontal: 12,
              vertical: 13,
            ),
            child: Row(
              children: [
                SvgPicture.asset(icon, width: 22, height: 22),
                const SizedBox(width: 14),
                Text(
                  label,
                  style: TextStyle(
                    color: colors.textSecondary,
                    fontSize: 14,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  // ---------------------------------------------------------------------------
  // Sheets
  // ---------------------------------------------------------------------------

  void _showAttachmentSheet(WeuraColors colors) {
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: colors.surfaceAlt,
      showDragHandle: true,
      isScrollControlled: true,
      constraints: BoxConstraints(
        maxHeight: MediaQuery.of(context).size.height * 0.85,
      ),
      builder: (sheetContext) {
        return SafeArea(
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(18, 8, 18, 24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  'Add to WEURA',
                  style: TextStyle(
                    color: colors.textPrimary,
                    fontSize: 18,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 14),
                _attachmentOption(
                  colors: colors,
                  asset: 'assets/icons/home.svg',
                  title: 'Photos',
                  subtitle: 'Analyze an image from gallery',
                  onTap: () {
                    Navigator.pop(sheetContext);
                    _pickImage(ImageSource.gallery);
                  },
                ),
                _attachmentOption(
                  colors: colors,
                  asset: 'assets/icons/camera.svg',
                  title: 'Camera',
                  subtitle: 'Capture and analyze an image',
                  onTap: () {
                    Navigator.pop(sheetContext);
                    _pickImage(ImageSource.camera);
                  },
                ),
                _attachmentOption(
                  colors: colors,
                  asset: 'assets/icons/file.svg',
                  title: 'Files',
                  subtitle: 'PDF, DOCX, XLSX, TXT, CSV',
                  onTap: () {
                    Navigator.pop(sheetContext);
                    _pickFile();
                  },
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _attachmentOption({
    required WeuraColors colors,
    required String asset,
    required String title,
    required String subtitle,
    required VoidCallback onTap,
  }) {
    return ListTile(
      onTap: onTap,
      contentPadding:
          const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
      leading: SizedBox(
        width: 40,
        height: 40,
        child: SvgPicture.asset(asset),
      ),
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
      trailing: SvgPicture.asset(
        'assets/icons/send.svg',
        width: 18,
        height: 18,
      ),
    );
  }

  void _showModePicker(WeuraColors colors) {
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: colors.surfaceAlt,
      showDragHandle: true,
      isScrollControlled: true,
      constraints: BoxConstraints(
        maxHeight: MediaQuery.of(context).size.height * 0.85,
      ),
      builder: (sheetContext) {
        return SafeArea(
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(14, 8, 14, 24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  'AI Mode',
                  style: TextStyle(
                    color: colors.textPrimary,
                    fontSize: 19,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 12),
                ...AIMode.values.map((mode) {
                  final selected = _mode == mode;
                  return ListTile(
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(16),
                    ),
                    tileColor: selected
                        ? colors.accent.withValues(alpha: 0.10)
                        : null,
                    leading: SvgPicture.asset(
                      'assets/icons/mode.svg',
                      width: 23,
                      height: 23,
                    ),
                    title: Text(
                      _modeName(mode),
                      style: TextStyle(
                        color: colors.textPrimary,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                    trailing: selected
                        ? SvgPicture.asset(
                            'assets/icons/check.svg',
                            width: 21,
                            height: 21,
                          )
                        : null,
                    onTap: () {
                      setState(() => _mode = mode);
                      Navigator.pop(sheetContext);
                    },
                  );
                }),
              ],
            ),
          ),
        );
      },
    );
  }

  String _modeName(AIMode mode) {
    switch (mode) {
      case AIMode.auto:
        return 'Auto';
      case AIMode.smart:
        return 'Smart';
      case AIMode.fast:
        return 'Fast';
      case AIMode.research:
        return 'Research';
      case AIMode.code:
        return 'Code';
      case AIMode.creative:
        return 'Creative';
      case AIMode.vision:
        return 'Vision';
      case AIMode.files:
        return 'Files';
      case AIMode.translation:
        return 'Translation';
    }
  }

  void _handleVoice(WeuraColors colors) {
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: colors.surfaceAlt,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (_) {
        return VoiceInputSheet(
          onSend: (text) {
            if (text.trim().isEmpty) return;
            _sendMessage(text);
          },
        );
      },
    );
  }

  // ---------------------------------------------------------------------------
  // Build
  // ---------------------------------------------------------------------------

  @override
  Widget build(BuildContext context) {
    final colors = WeuraColors.of(context);

    return Scaffold(
      key: _scaffoldKey,
      backgroundColor: colors.background,
      drawer: _buildDrawer(colors),
      appBar: AppBar(
        backgroundColor: colors.background,
        elevation: 0,
        leading: IconButton(
          tooltip: 'Menu',
          onPressed: () {
            _scaffoldKey.currentState?.openDrawer();
          },
          icon: SvgPicture.asset(
            'assets/icons/menu.svg',
            width: 23,
            height: 23,
          ),
        ),
        title: Text(
          'WEURA',
          style: TextStyle(
            color: colors.textPrimary,
            fontWeight: FontWeight.w700,
            letterSpacing: 1.2,
          ),
        ),
        actions: [
          IconButton(
            tooltip: 'AI Mode',
            onPressed: () => _showModePicker(colors),
            icon: SvgPicture.asset(
              'assets/icons/mode.svg',
              width: 23,
              height: 23,
            ),
          ),
        ],
      ),
      body: Column(
        children: [
          Expanded(
            child: _messages.isEmpty
                ? _emptyState(colors)
                : ListView.builder(
                    controller: _scrollController,
                    keyboardDismissBehavior:
                        ScrollViewKeyboardDismissBehavior.onDrag,
                    padding: const EdgeInsets.fromLTRB(20, 24, 20, 24),
                    itemCount: _messages.length + (_isLoading ? 1 : 0),
                    itemBuilder: (context, index) {
                      if (_isLoading && index == _messages.length) {
                        return _WeuraThinking(colors: colors);
                      }
                      final message = _messages[index];
                      final isLastAssistant = !message.isUser &&
                          index == _messages.length - 1;
                      return _messageBubble(
                        colors,
                        message,
                        index,
                        isLastAssistant,
                      );
                    },
                  ),
          ),
          if (_attachedFile != null)
            _attachedFileChip(colors, _attachedFile!),
          WeuraComposer(
            enabled: true,
            isLoading: _isLoading,
            onSend: _sendMessage,
            onAttach: () => _showAttachmentSheet(colors),
            onMode: () => _showModePicker(colors),
            onVoice: () => _handleVoice(colors),
            onStop: _cancelRequest,
          ),
        ],
      ),
    );
  }

  Widget _attachedFileChip(WeuraColors colors, WeuraFile file) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(14, 4, 14, 0),
      child: Container(
        padding: const EdgeInsets.symmetric(
          horizontal: 12,
          vertical: 10,
        ),
        decoration: BoxDecoration(
          color: colors.surface,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
            color: colors.accentGlow.withValues(alpha: 0.30),
          ),
        ),
        child: Row(
          children: [
            Container(
              width: 36,
              height: 36,
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: colors.accentSoft,
                borderRadius: BorderRadius.circular(10),
              ),
              child: SvgPicture.asset(
                'assets/icons/file.svg',
                width: 20,
                height: 20,
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    file.name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      color: colors.textPrimary,
                      fontSize: 13.5,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    '${file.type.label} • ${file.sizeLabel}',
                    style: TextStyle(
                      color: colors.textMuted,
                      fontSize: 11,
                    ),
                  ),
                ],
              ),
            ),
            InkWell(
              onTap: () => setState(() => _attachedFile = null),
              borderRadius: BorderRadius.circular(8),
              child: Padding(
                padding: const EdgeInsets.all(6),
                child: Icon(
                  Icons.close_rounded,
                  size: 18,
                  color: colors.textMuted,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _emptyState(WeuraColors colors) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(28),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              width: 68,
              height: 68,
              decoration: BoxDecoration(
                color: colors.accentSoft,
                borderRadius: BorderRadius.circular(22),
                border: Border.all(
                  color: colors.accentGlow.withValues(alpha: 0.18),
                ),
              ),
              child: SvgPicture.asset(
                'assets/icons/mode.svg',
                width: 31,
                height: 31,
              ),
            ),
            const SizedBox(height: 20),
            Text(
              'Think Beyond.',
              textAlign: TextAlign.center,
              style: TextStyle(
                color: colors.textPrimary,
                fontSize: 30,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 10),
            Text(
              'Ask WEURA anything.',
              style: TextStyle(
                color: colors.textSecondary,
                fontSize: 16,
              ),
            ),
          ],
        ),
      ),
    );
  }

  TextDirection _detectDirection(String text) {
    for (final rune in text.runes) {
      if ((rune >= 0x0600 && rune <= 0x06FF) ||
          (rune >= 0x0750 && rune <= 0x077F) ||
          (rune >= 0x08A0 && rune <= 0x08FF) ||
          (rune >= 0xFB50 && rune <= 0xFDFF) ||
          (rune >= 0xFE70 && rune <= 0xFEFF)) {
        return TextDirection.rtl;
      }
      if ((rune >= 0x0041 && rune <= 0x005A) ||
          (rune >= 0x0061 && rune <= 0x007A) ||
          (rune >= 0x00C0 && rune <= 0x024F)) {
        return TextDirection.ltr;
      }
    }
    return TextDirection.ltr;
  }

  (String, List<String>) _splitSources(String raw) {
    final markers = <String>['المصادر:', 'المصدر:', 'Sources:', 'Source:'];
    int splitIndex = -1;
    String? matchedMarker;
    for (final marker in markers) {
      final idx = raw.lastIndexOf(marker);
      if (idx != -1 && idx > splitIndex) {
        splitIndex = idx;
        matchedMarker = marker;
      }
    }
    if (splitIndex == -1 || matchedMarker == null) {
      return (raw, const []);
    }
    final mainText = raw.substring(0, splitIndex).trimRight();
    final sourcesBlock = raw.substring(splitIndex + matchedMarker.length);
    final urlRegex = RegExp(r'https?://[^\s\)\]\>,]+');
    final matches = urlRegex.allMatches(sourcesBlock);
    final urls = matches
        .map((m) => m.group(0)!)
        .map((u) => u.replaceAll(RegExp(r'[.,;:]+$'), ''))
        .where((u) => u.isNotEmpty)
        .toList();
    final seen = <String>{};
    final uniqueUrls = <String>[];
    for (final url in urls) {
      if (seen.add(url)) uniqueUrls.add(url);
    }
    return (mainText, uniqueUrls);
  }

  // ---------------------------------------------------------------------------
  // Message rendering
  // ---------------------------------------------------------------------------

  Widget _messageBubble(
    WeuraColors colors,
    _ChatMessage message,
    int index,
    bool isLastAssistant,
  ) {
    if (message.imageUrl != null) {
      return _imageBubble(colors, message, index);
    }

    if (message.playerData != null) {
      return Align(
        alignment: Alignment.centerLeft,
        child: Padding(
          padding: const EdgeInsets.only(bottom: 18, right: 16),
          child: PlayerCard(
            data: message.playerData!,
            onShare: () {
              final p = message.playerData!['player'] as Map? ?? {};
              final name = p['name']?.toString() ?? '';
              if (name.isNotEmpty) _shareMessage('Player: $name');
            },
          ),
        ),
      );
    }

    if (message.isUser) {
      return _userBubble(colors, message);
    }

    return _assistantMessage(colors, message, index, isLastAssistant);
  }

  Widget _userBubble(WeuraColors colors, _ChatMessage message) {
    final bubbleDirection = _detectDirection(message.text);

    return Align(
      alignment: Alignment.centerRight,
      child: Container(
        constraints: BoxConstraints(
          maxWidth: MediaQuery.of(context).size.width * 0.78,
        ),
        margin: const EdgeInsets.only(
          bottom: 18,
          left: 40,
        ),
        padding: const EdgeInsets.symmetric(
          horizontal: 16,
          vertical: 12,
        ),
        decoration: BoxDecoration(
          color: colors.userBubble,
          borderRadius: const BorderRadius.only(
            topLeft: Radius.circular(20),
            topRight: Radius.circular(20),
            bottomLeft: Radius.circular(20),
            bottomRight: Radius.circular(6),
          ),
        ),
        child: Directionality(
          textDirection: bubbleDirection,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (message.visionImagePath != null) ...[
                ClipRRect(
                  borderRadius: BorderRadius.circular(12),
                  child: Image.file(
                    File(message.visionImagePath!),
                    width: 240,
                    fit: BoxFit.cover,
                  ),
                ),
                if (message.text.trim().isNotEmpty)
                  const SizedBox(height: 8),
              ],
              if (message.text.trim().isNotEmpty)
                SelectableText(
                  message.text,
                  style: TextStyle(
                    color: colors.userBubbleText,
                    fontSize: 15.5,
                    height: 1.5,
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _assistantMessage(
    WeuraColors colors,
    _ChatMessage message,
    int index,
    bool isLastAssistant,
  ) {
    final bubbleDirection = _detectDirection(message.text);
    final parsed = !message.isError
        ? _splitSources(message.text)
        : (message.text, const <String>[]);
    final mainText = parsed.$1;
    final sources = parsed.$2;

    final isTyping = _typingIndices.contains(index);

    return Container(
      margin: const EdgeInsets.only(bottom: 24, right: 16),
      child: Directionality(
        textDirection: bubbleDirection,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (message.isError)
              _errorMessage(colors, mainText)
            else if (isTyping)
              _TypedMarkdown(
                fullText: mainText,
                styleSheet: _markdownStyle(colors),
                builders: {
                  'code': _CodeBlockBuilder(colors: colors),
                },
                onComplete: () {
                  if (mounted) {
                    setState(() => _typingIndices.remove(index));
                  }
                },
                onTick: _autoScrollDuringTyping,
              )
            else
              MarkdownBody(
                data: mainText,
                selectable: true,
                styleSheet: _markdownStyle(colors),
                builders: {
                  'code': _CodeBlockBuilder(colors: colors),
                },
              ),

            if (sources.isNotEmpty && !isTyping)
              Padding(
                padding: const EdgeInsets.only(top: 14),
                child: _sourcesSection(colors, sources),
              ),

            if (!message.isError && !isTyping)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: _actionBar(
                  colors,
                  message,
                  index,
                  isLastAssistant,
                ),
              ),

            if (message.isError)
              Padding(
                padding: const EdgeInsets.only(top: 12),
                child: GestureDetector(
                  onTap: _retryLastMessage,
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      SvgPicture.asset(
                        'assets/icons/history.svg',
                        width: 16,
                        height: 16,
                      ),
                      const SizedBox(width: 6),
                      Text(
                        'Retry',
                        style: TextStyle(
                          color: colors.accentGlow,
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _errorMessage(WeuraColors colors, String text) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(top: 3, right: 10),
          child: Icon(
            Icons.warning_amber_rounded,
            size: 18,
            color: colors.danger,
          ),
        ),
        Expanded(
          child: Text(
            text,
            style: TextStyle(
              color: colors.danger,
              fontSize: 14.5,
              height: 1.55,
            ),
          ),
        ),
      ],
    );
  }

  Widget _imageBubble(
    WeuraColors colors,
    _ChatMessage message,
    int index,
  ) {
    return Align(
      alignment: Alignment.centerLeft,
      child: Container(
        constraints: const BoxConstraints(maxWidth: 650),
        margin: const EdgeInsets.only(bottom: 20, right: 16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (message.imagePrompt != null &&
                message.imagePrompt!.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(left: 2, bottom: 10),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(
                      width: 22,
                      height: 22,
                      decoration: BoxDecoration(
                        color: colors.accentSoft,
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Icon(
                        Icons.image_outlined,
                        size: 14,
                        color: colors.accentGlow,
                      ),
                    ),
                    const SizedBox(width: 8),
                    Flexible(
                      child: Text(
                        message.imagePrompt!,
                        style: TextStyle(
                          color: colors.textSecondary,
                          fontSize: 13,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            GestureDetector(
              onTap: () => _openImageZoom(message.imageUrl!),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(16),
                child: Container(
                  width: 320,
                  height: 320,
                  decoration: BoxDecoration(
                    color: colors.surface,
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: colors.border),
                  ),
                  child: _NetworkImageWithLoader(
                    url: message.imageUrl!,
                    colors: colors,
                  ),
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  _actionIcon(
                    colors: colors,
                    icon: Icons.save_alt_rounded,
                    tooltip: 'Save to gallery',
                    onPressed: () =>
                        _saveImageToGallery(message.imageUrl ?? ''),
                  ),
                  _actionIcon(
                    colors: colors,
                    icon: Icons.link_rounded,
                    tooltip: 'Copy image URL',
                    onPressed: () =>
                        _copyMessage(message.imageUrl ?? ''),
                  ),
                  _actionIcon(
                    colors: colors,
                    icon: Icons.zoom_in_rounded,
                    tooltip: 'View fullscreen',
                    onPressed: () =>
                        _openImageZoom(message.imageUrl ?? ''),
                  ),
                  _actionIcon(
                    colors: colors,
                    icon: Icons.refresh_rounded,
                    tooltip: 'Regenerate',
                    onPressed: () {
                      if (message.imagePrompt == null) return;
                      final idx = _messages.indexOf(message);
                      if (idx == -1) return;

                      final newUrl =
                          _buildImageUrl(message.imagePrompt!);

                      setState(() {
                        _messages[idx] = _ChatMessage(
                          text: '',
                          isUser: false,
                          imageUrl: newUrl,
                          imagePrompt: message.imagePrompt,
                        );
                      });
                    },
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _sourcesSection(WeuraColors colors, List<String> urls) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(left: 2, bottom: 8),
          child: Text(
            'المصادر',
            style: TextStyle(
              color: colors.textMuted,
              fontSize: 11,
              fontWeight: FontWeight.w700,
              letterSpacing: 1.2,
            ),
          ),
        ),
        ...urls.asMap().entries.map((entry) {
          return Padding(
            padding: const EdgeInsets.only(bottom: 6),
            child: _sourceCard(colors, entry.key + 1, entry.value),
          );
        }),
      ],
    );
  }

  Widget _sourceCard(WeuraColors colors, int index, String url) {
    final uri = Uri.tryParse(url);
    final domain = uri?.host ?? url;
    final path = uri?.path ?? '';
    final displayDomain =
        domain.startsWith('www.') ? domain.substring(4) : domain;
    final letter =
        displayDomain.isNotEmpty ? displayDomain[0].toUpperCase() : '?';
    final color = _colorForDomain(displayDomain);
    final shortPath =
        path.length > 28 ? '${path.substring(0, 28)}...' : path;

    return Material(
      color: colors.surface,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: () => _openUrl(url),
        onLongPress: () => _copyMessage(url),
        child: Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: colors.border),
          ),
          child: Row(
            children: [
              Container(
                width: 38,
                height: 38,
                decoration: BoxDecoration(
                  color: color.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(
                    color: color.withValues(alpha: 0.30),
                  ),
                ),
                child: Center(
                  child: Text(
                    letter,
                    style: TextStyle(
                      color: color,
                      fontSize: 17,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      displayDomain,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        color: colors.textPrimary,
                        fontSize: 14,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    if (shortPath.isNotEmpty && shortPath != '/') ...[
                      const SizedBox(height: 2),
                      Text(
                        shortPath,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          color: colors.textMuted,
                          fontSize: 11,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Container(
                width: 26,
                height: 26,
                decoration: BoxDecoration(
                  color: colors.surfaceAlt,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Icon(
                  Icons.arrow_outward_rounded,
                  size: 15,
                  color: colors.textSecondary,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _openUrl(String url) async {
    final uri = Uri.tryParse(url);
    if (uri == null) return;
    try {
      final ok = await launchUrl(
        uri,
        mode: LaunchMode.externalApplication,
      );
      if (!ok && mounted) _showMessage('Could not open link.');
    } catch (_) {
      if (mounted) _showMessage('Could not open link.');
    }
  }

  Color _colorForDomain(String domain) {
    const palette = <Color>[
      Color(0xFF3B82F6),
      Color(0xFF8B5CF6),
      Color(0xFFEC4899),
      Color(0xFFEF4444),
      Color(0xFFF59E0B),
      Color(0xFF10B981),
      Color(0xFF06B6D4),
      Color(0xFF6366F1),
    ];
    if (domain.isEmpty) return palette[0];
    int hash = 0;
    for (final code in domain.codeUnits) {
      hash = (hash * 31 + code) & 0x7FFFFFFF;
    }
    return palette[hash % palette.length];
  }

  Widget _actionBar(
    WeuraColors colors,
    _ChatMessage message,
    int index,
    bool isLastAssistant,
  ) {
    final rating = _ratings[index];
    final isSpeaking = _voiceOut.speakingId == 'msg_$index';

    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        _actionIcon(
          colors: colors,
          icon: Icons.copy_rounded,
          tooltip: 'Copy',
          onPressed: () => _copyMessage(message.text),
        ),
        _actionIcon(
          colors: colors,
          icon: Icons.share_outlined,
          tooltip: 'Share',
          onPressed: () => _shareMessage(message.text),
        ),
        _actionIcon(
          colors: colors,
          icon: isSpeaking
              ? Icons.stop_circle_outlined
              : Icons.volume_up_outlined,
          tooltip: isSpeaking ? 'Stop' : 'Read aloud',
          active: isSpeaking,
          onPressed: () => _toggleSpeak(index, message.text),
        ),
        _actionIcon(
          colors: colors,
          icon: Icons.thumb_up_outlined,
          tooltip: 'Good response',
          active: rating == 'up',
          onPressed: () => _rateMessage(index, 'up'),
        ),
        _actionIcon(
          colors: colors,
          icon: Icons.thumb_down_outlined,
          tooltip: 'Bad response',
          active: rating == 'down',
          onPressed: () => _rateMessage(index, 'down'),
        ),
        if (isLastAssistant)
          _actionIcon(
            colors: colors,
            icon: Icons.refresh_rounded,
            tooltip: 'Regenerate',
            onPressed: _regenerateLast,
          ),
      ],
    );
  }

  Widget _actionIcon({
    required WeuraColors colors,
    required IconData icon,
    required String tooltip,
    required VoidCallback onPressed,
    bool active = false,
  }) {
    final color = active ? colors.accentGlow : colors.textMuted;
    return Padding(
      padding: const EdgeInsets.only(right: 2),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onPressed,
          borderRadius: BorderRadius.circular(8),
          child: Tooltip(
            message: tooltip,
            child: Padding(
              padding: const EdgeInsets.all(6),
              child: Icon(icon, size: 17, color: color),
            ),
          ),
        ),
      ),
    );
  }

  MarkdownStyleSheet _markdownStyle(WeuraColors colors) {
    return MarkdownStyleSheet(
      p: TextStyle(
        color: colors.textPrimary,
        fontSize: 15.5,
        height: 1.6,
      ),
      h1: TextStyle(
        color: colors.textPrimary,
        fontSize: 24,
        fontWeight: FontWeight.w700,
        height: 1.4,
      ),
      h2: TextStyle(
        color: colors.textPrimary,
        fontSize: 20,
        fontWeight: FontWeight.w700,
        height: 1.4,
      ),
      h3: TextStyle(
        color: colors.textPrimary,
        fontSize: 17,
        fontWeight: FontWeight.w700,
        height: 1.4,
      ),
      strong: TextStyle(
        color: colors.textPrimary,
        fontWeight: FontWeight.w700,
      ),
      em: TextStyle(
        color: colors.textPrimary,
        fontStyle: FontStyle.italic,
      ),
      a: TextStyle(
        color: colors.accentGlow,
        decoration: TextDecoration.underline,
      ),
      code: TextStyle(
        color: colors.accentGlow,
        backgroundColor: colors.surface,
        fontFamily: 'monospace',
        fontSize: 14,
      ),
      codeblockDecoration:
          const BoxDecoration(color: Colors.transparent),
      codeblockPadding: EdgeInsets.zero,
      blockquote: TextStyle(
        color: colors.textSecondary,
        fontSize: 15,
        fontStyle: FontStyle.italic,
      ),
      blockquoteDecoration: BoxDecoration(
        color: colors.accentSoft,
        border: Border(
          left: BorderSide(color: colors.accentGlow, width: 3),
        ),
      ),
      blockquotePadding: const EdgeInsets.fromLTRB(14, 10, 14, 10),
      listBullet: TextStyle(
        color: colors.textPrimary,
        fontSize: 15.5,
        height: 1.6,
      ),
      listIndent: 22,
      horizontalRuleDecoration: BoxDecoration(
        border: Border(
          top: BorderSide(color: colors.borderStrong),
        ),
      ),
      tableHead: TextStyle(
        color: colors.textPrimary,
        fontWeight: FontWeight.w700,
      ),
      tableBody: TextStyle(
        color: colors.textSecondary,
        fontSize: 14,
      ),
      tableBorder: TableBorder.all(color: colors.borderStrong),
      tableCellsPadding: const EdgeInsets.all(8),
    );
  }
}

// ---------------------------------------------------------------------------
// Typing markdown widget — reveals text progressively
// ---------------------------------------------------------------------------

class _TypedMarkdown extends StatefulWidget {
  const _TypedMarkdown({
    required this.fullText,
    required this.styleSheet,
    this.builders = const {},
    this.onComplete,
    this.onTick,
  });

  final String fullText;
  final MarkdownStyleSheet styleSheet;
  final Map<String, MarkdownElementBuilder> builders;
  final VoidCallback? onComplete;
  final VoidCallback? onTick;

  @override
  State<_TypedMarkdown> createState() => _TypedMarkdownState();
}

class _TypedMarkdownState extends State<_TypedMarkdown>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;
  late String _visibleText;
  bool _done = false;

  @override
  void initState() {
    super.initState();

    final len = widget.fullText.length;

    // Skip animation for very long texts.
    if (len > 4000) {
      _visibleText = widget.fullText;
      _done = true;
      _controller = AnimationController(vsync: this);
      WidgetsBinding.instance.addPostFrameCallback((_) {
        widget.onComplete?.call();
      });
      return;
    }

    // Duration: 15ms per char, clamped between 400ms and 6000ms.
    final durationMs = (len * 15).clamp(400, 6000);

    _controller = AnimationController(
      vsync: this,
      duration: Duration(milliseconds: durationMs),
    );

    _visibleText = '';

    _controller.addListener(_onTick);
    _controller.forward().whenComplete(() {
      if (!mounted) return;
      _done = true;
      widget.onComplete?.call();
    });
  }

  void _onTick() {
    final len = widget.fullText.length;
    final chars = (_controller.value * len).floor();
    if (chars == _visibleText.length) return;

    setState(() {
      _visibleText = widget.fullText.substring(0, chars.clamp(0, len));
    });

    widget.onTick?.call();
  }

  @override
  void dispose() {
    _controller.removeListener(_onTick);
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final display = _done ? _visibleText : '$_visibleText ▌';

    return MarkdownBody(
      data: display,
      selectable: _done,
      styleSheet: widget.styleSheet,
      builders: widget.builders,
    );
  }
}

// ---------------------------------------------------------------------------
// Code block builder — colored + copyable
// ---------------------------------------------------------------------------

class _CodeBlockBuilder extends MarkdownElementBuilder {
  _CodeBlockBuilder({required this.colors});

  final WeuraColors colors;

  @override
  Widget? visitElementAfter(md.Element element, TextStyle? preferredStyle) {
    final cls = element.attributes['class'];

    if (cls == null || !cls.startsWith('language-')) {
      return null;
    }

    final language = cls.substring('language-'.length).trim();
    final code = element.textContent.trimRight();

    return _CodeBlock(
      code: code,
      language: language,
      colors: colors,
    );
  }
}

class _CodeBlock extends StatefulWidget {
  const _CodeBlock({
    required this.code,
    required this.language,
    required this.colors,
  });

  final String code;
  final String language;
  final WeuraColors colors;

  @override
  State<_CodeBlock> createState() => _CodeBlockState();
}

class _CodeBlockState extends State<_CodeBlock> {
  bool _copied = false;

  Future<void> _copy() async {
    await Clipboard.setData(ClipboardData(text: widget.code));
    if (!mounted) return;
    setState(() => _copied = true);
    await Future<void>.delayed(const Duration(seconds: 2));
    if (mounted) setState(() => _copied = false);
  }

  Map<String, TextStyle> _theme() {
    final base = Map<String, TextStyle>.from(atomOneDarkTheme);
    base['root'] = const TextStyle(
      backgroundColor: Colors.transparent,
      color: Color(0xFFE6E6E6),
    );
    return base;
  }

  String _normalizeLanguage(String raw) {
    final l = raw.toLowerCase().trim();
    if (l.isEmpty) return 'plaintext';
    if (l == 'js') return 'javascript';
    if (l == 'ts') return 'typescript';
    if (l == 'py') return 'python';
    if (l == 'rb') return 'ruby';
    if (l == 'sh' || l == 'shell') return 'bash';
    if (l == 'yml') return 'yaml';
    if (l == 'html') return 'xml';
    if (l == 'c++') return 'cpp';
    if (l == 'c#') return 'cs';
    return l;
  }

  @override
  Widget build(BuildContext context) {
    final colors = widget.colors;
    final displayLang =
        widget.language.isEmpty ? 'code' : widget.language;

    return Container(
      margin: const EdgeInsets.symmetric(vertical: 10),
      decoration: BoxDecoration(
        color: const Color(0xFF0A0B12),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: colors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(
            padding: const EdgeInsets.fromLTRB(14, 8, 8, 8),
            decoration: BoxDecoration(
              color: const Color(0xFF0F1119),
              borderRadius: const BorderRadius.only(
                topLeft: Radius.circular(12),
                topRight: Radius.circular(12),
              ),
              border: Border(
                bottom: BorderSide(color: colors.border),
              ),
            ),
            child: Row(
              children: [
                Container(
                  width: 8,
                  height: 8,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: colors.accentGlow,
                  ),
                ),
                const SizedBox(width: 8),
                Text(
                  displayLang,
                  style: TextStyle(
                    color: colors.textMuted,
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    letterSpacing: 0.4,
                  ),
                ),
                const Spacer(),
                InkWell(
                  onTap: _copy,
                  borderRadius: BorderRadius.circular(6),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 8,
                      vertical: 5,
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(
                          _copied
                              ? Icons.check_rounded
                              : Icons.copy_rounded,
                          size: 14,
                          color: _copied
                              ? colors.accentGlow
                              : colors.textMuted,
                        ),
                        const SizedBox(width: 5),
                        Text(
                          _copied ? 'Copied' : 'Copy',
                          style: TextStyle(
                            color: _copied
                                ? colors.accentGlow
                                : colors.textMuted,
                            fontSize: 11.5,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(12),
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: HighlightView(
                widget.code,
                language: _normalizeLanguage(widget.language),
                theme: _theme(),
                padding: EdgeInsets.zero,
                textStyle: const TextStyle(
                  fontFamily: 'monospace',
                  fontSize: 13,
                  height: 1.55,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Network image with loader
// ---------------------------------------------------------------------------

class _NetworkImageWithLoader extends StatelessWidget {
  const _NetworkImageWithLoader({
    required this.url,
    required this.colors,
  });

  final String url;
  final WeuraColors colors;

  @override
  Widget build(BuildContext context) {
    return Image.network(
      url,
      width: 320,
      height: 320,
      fit: BoxFit.cover,
      loadingBuilder: (context, child, progress) {
        if (progress == null) return child;
        return _ImageGeneratingLoader(colors: colors);
      },
      errorBuilder: (context, error, stackTrace) {
        return Container(
          width: 320,
          height: 320,
          padding: const EdgeInsets.all(24),
          child: Center(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(
                  Icons.broken_image_outlined,
                  size: 52,
                  color: colors.danger,
                ),
                const SizedBox(height: 14),
                Text(
                  'Image generation failed',
                  style: TextStyle(
                    color: colors.danger,
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  'The model may be loading.\nTap refresh to retry.',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color: colors.textMuted,
                    fontSize: 12,
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
}

// ---------------------------------------------------------------------------
// Fullscreen Image Zoom Viewer (browser-like)
// ---------------------------------------------------------------------------

class _ImageZoomViewer extends StatefulWidget {
  const _ImageZoomViewer({
    required this.imageUrl,
    this.onSave,
    this.onCopyUrl,
  });

  final String imageUrl;
  final VoidCallback? onSave;
  final VoidCallback? onCopyUrl;

  @override
  State<_ImageZoomViewer> createState() => _ImageZoomViewerState();
}

class _ImageZoomViewerState extends State<_ImageZoomViewer>
    with SingleTickerProviderStateMixin {
  final TransformationController _transformController =
      TransformationController();

  late final AnimationController _animController;
  late Animation<Matrix4> _animation;

  bool _isZoomed = false;

  static const double _doubleTapScale = 2.5;

  @override
  void initState() {
    super.initState();

    _animController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 220),
    );

    _animation = Matrix4Tween(
      begin: Matrix4.identity(),
      end: Matrix4.identity(),
    ).animate(
      CurvedAnimation(
        parent: _animController,
        curve: Curves.easeOutCubic,
      ),
    );

    _animController.addListener(_onTick);
    _transformController.addListener(_onTransformChanged);
  }

  @override
  void dispose() {
    _animController.removeListener(_onTick);
    _animController.dispose();
    _transformController.removeListener(_onTransformChanged);
    _transformController.dispose();
    super.dispose();
  }

  void _onTick() {
    _transformController.value = _animation.value;
  }

  void _onTransformChanged() {
    final scale = _transformController.value.getMaxScaleOnAxis();
    final zoomed = scale > 1.05;
    if (zoomed != _isZoomed) {
      setState(() => _isZoomed = zoomed);
    }
  }

  void _animateTo(Matrix4 target) {
    _animation = Matrix4Tween(
      begin: _transformController.value,
      end: target,
    ).animate(
      CurvedAnimation(
        parent: _animController,
        curve: Curves.easeOutCubic,
      ),
    );
    _animController.forward(from: 0);
  }

  void _resetZoom() {
    _animateTo(Matrix4.identity());
  }

  void _handleDoubleTap() {
    if (_isZoomed) {
      _resetZoom();
    } else {
      final target = Matrix4.identity()
        ..scale(_doubleTapScale, _doubleTapScale, 1.0);
      _animateTo(target);
    }
  }

  void _close() {
    Navigator.of(context).maybePop();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        children: [
          Positioned.fill(
            child: GestureDetector(
              onDoubleTap: _handleDoubleTap,
              child: InteractiveViewer(
                transformationController: _transformController,
                minScale: 1.0,
                maxScale: 6.0,
                boundaryMargin: EdgeInsets.zero,
                constrained: true,
                panEnabled: true,
                scaleEnabled: true,
                clipBehavior: Clip.hardEdge,
                child: Center(
                  child: Image.network(
                    widget.imageUrl,
                    fit: BoxFit.contain,
                    loadingBuilder: (context, child, progress) {
                      if (progress == null) return child;
                      return const Center(
                        child: SizedBox(
                          width: 32,
                          height: 32,
                          child: CircularProgressIndicator(
                            color: Colors.white,
                            strokeWidth: 2.5,
                          ),
                        ),
                      );
                    },
                    errorBuilder: (_, __, ___) {
                      return const Center(
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(
                              Icons.broken_image_outlined,
                              color: Colors.white54,
                              size: 60,
                            ),
                            SizedBox(height: 14),
                            Text(
                              'Could not load image',
                              style: TextStyle(
                                color: Colors.white70,
                                fontSize: 14,
                              ),
                            ),
                          ],
                        ),
                      );
                    },
                  ),
                ),
              ),
            ),
          ),
          Positioned(
            top: 0,
            left: 0,
            right: 0,
            child: SafeArea(
              bottom: false,
              child: Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 8,
                  vertical: 8,
                ),
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [
                      Colors.black.withValues(alpha: 0.65),
                      Colors.transparent,
                    ],
                  ),
                ),
                child: Row(
                  children: [
                    _iconAction(
                      icon: Icons.close_rounded,
                      tooltip: 'Close',
                      onTap: _close,
                    ),
                    const Spacer(),
                    if (_isZoomed)
                      _iconAction(
                        icon: Icons.center_focus_strong_rounded,
                        tooltip: 'Reset zoom',
                        onTap: _resetZoom,
                      ),
                    if (widget.onCopyUrl != null)
                      _iconAction(
                        icon: Icons.link_rounded,
                        tooltip: 'Copy URL',
                        onTap: () {
                          widget.onCopyUrl!();
                          _close();
                        },
                      ),
                    if (widget.onSave != null)
                      _iconAction(
                        icon: Icons.save_alt_rounded,
                        tooltip: 'Save to gallery',
                        onTap: widget.onSave!,
                      ),
                  ],
                ),
              ),
            ),
          ),
          Positioned(
            bottom: 0,
            left: 0,
            right: 0,
            child: SafeArea(
              top: false,
              child: AnimatedOpacity(
                opacity: _isZoomed ? 0.0 : 1.0,
                duration: const Duration(milliseconds: 300),
                child: Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 20,
                    vertical: 16,
                  ),
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.bottomCenter,
                      end: Alignment.topCenter,
                      colors: [
                        Colors.black.withValues(alpha: 0.65),
                        Colors.transparent,
                      ],
                    ),
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(
                        Icons.pinch_rounded,
                        size: 16,
                        color: Colors.white.withValues(alpha: 0.65),
                      ),
                      const SizedBox(width: 8),
                      Text(
                        'Pinch to zoom • Double-tap to enlarge',
                        style: TextStyle(
                          color: Colors.white.withValues(alpha: 0.75),
                          fontSize: 12,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _iconAction({
    required IconData icon,
    required String tooltip,
    required VoidCallback onTap,
  }) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(24),
        child: Tooltip(
          message: tooltip,
          child: Padding(
            padding: const EdgeInsets.all(10),
            child: Icon(
              icon,
              size: 24,
              color: Colors.white,
            ),
          ),
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Image generating loader
// ---------------------------------------------------------------------------

class _ImageGeneratingLoader extends StatefulWidget {
  const _ImageGeneratingLoader({required this.colors});

  final WeuraColors colors;

  @override
  State<_ImageGeneratingLoader> createState() =>
      _ImageGeneratingLoaderState();
}

class _ImageGeneratingLoaderState extends State<_ImageGeneratingLoader>
    with TickerProviderStateMixin {
  late final AnimationController _pulseController;
  late final AnimationController _rotateController;
  late final AnimationController _sparkleController;
  late final AnimationController _progressController;

  @override
  void initState() {
    super.initState();

    _pulseController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1400),
    )..repeat(reverse: true);

    _rotateController = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 5),
    )..repeat();

    _sparkleController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1800),
    )..repeat();

    _progressController = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 4),
    )..repeat();
  }

  @override
  void dispose() {
    _pulseController.dispose();
    _rotateController.dispose();
    _sparkleController.dispose();
    _progressController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final colors = widget.colors;

    return Container(
      width: 320,
      height: 320,
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: colors.surfaceAlt,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          SizedBox(
            width: 170,
            height: 170,
            child: AnimatedBuilder(
              animation: Listenable.merge([
                _pulseController,
                _rotateController,
                _sparkleController,
              ]),
              builder: (context, _) {
                return CustomPaint(
                  painter: _ImageLoadingPainter(
                    progress: _pulseController.value,
                    rotation: _rotateController.value,
                    sparkle: _sparkleController.value,
                    glow: colors.accentGlow,
                    accent: colors.accent,
                  ),
                );
              },
            ),
          ),
          const SizedBox(height: 22),
          Text(
            'Creating your image',
            style: TextStyle(
              color: colors.textPrimary,
              fontSize: 14,
              fontWeight: FontWeight.w700,
              letterSpacing: 0.4,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            'This can take 5-15 seconds',
            style: TextStyle(
              color: colors.textMuted,
              fontSize: 12,
            ),
          ),
          const SizedBox(height: 16),
          SizedBox(
            width: 160,
            height: 4,
            child: AnimatedBuilder(
              animation: _progressController,
              builder: (context, _) {
                return ClipRRect(
                  borderRadius: BorderRadius.circular(2),
                  child: Stack(
                    children: [
                      Container(color: colors.surface),
                      FractionallySizedBox(
                        widthFactor: 0.35,
                        alignment: Alignment(
                          -1.0 + (_progressController.value * 2.4),
                          0,
                        ),
                        child: Container(
                          decoration: BoxDecoration(
                            gradient: LinearGradient(
                              colors: [
                                colors.accentGlow
                                    .withValues(alpha: 0.0),
                                colors.accentGlow,
                                colors.accentGlow
                                    .withValues(alpha: 0.0),
                              ],
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _ImageLoadingPainter extends CustomPainter {
  _ImageLoadingPainter({
    required this.progress,
    required this.rotation,
    required this.sparkle,
    required this.glow,
    required this.accent,
  });

  final double progress;
  final double rotation;
  final double sparkle;
  final Color glow;
  final Color accent;

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final baseRadius = size.width / 2;

    _paintDashedRing(
      canvas,
      center,
      baseRadius * 0.95,
      rotation,
      accent.withValues(alpha: 0.85),
      strokeWidth: 3,
    );

    _paintDashedRing(
      canvas,
      center,
      baseRadius * 0.72,
      -rotation * 1.4,
      glow.withValues(alpha: 0.6),
      strokeWidth: 2.5,
    );

    final pulseRadius = baseRadius * (0.55 + progress * 0.22);
    final haloPaint = Paint()
      ..shader = RadialGradient(
        colors: [
          glow.withValues(alpha: 0.55 * (0.6 + progress * 0.4)),
          glow.withValues(alpha: 0.0),
        ],
      ).createShader(
        Rect.fromCircle(center: center, radius: pulseRadius),
      );
    canvas.drawCircle(center, pulseRadius, haloPaint);

    final corePaint = Paint()
      ..color = accent.withValues(alpha: 1.0);
    canvas.drawCircle(center, baseRadius * 0.40, corePaint);

    final highlightPaint = Paint()
      ..color = Colors.white.withValues(alpha: 0.55);
    canvas.drawCircle(
      Offset(
        center.dx - baseRadius * 0.08,
        center.dy - baseRadius * 0.08,
      ),
      baseRadius * 0.20,
      highlightPaint,
    );

    _paintBrushIcon(canvas, center, baseRadius * 0.45);
    _paintSparkles(canvas, center, baseRadius * 0.88, sparkle);
  }

  void _paintDashedRing(
    Canvas canvas,
    Offset center,
    double radius,
    double rotation,
    Color color, {
    double strokeWidth = 2.5,
  }) {
    const segments = 24;
    const gapFactor = 0.55;

    final paint = Paint()
      ..color = color
      ..strokeWidth = strokeWidth
      ..strokeCap = StrokeCap.round
      ..style = PaintingStyle.stroke;

    for (int i = 0; i < segments; i++) {
      final startAngle =
          (i / segments) * 2 * math.pi + rotation * 2 * math.pi;
      final sweep = (2 * math.pi / segments) * gapFactor;

      canvas.drawArc(
        Rect.fromCircle(center: center, radius: radius),
        startAngle,
        sweep,
        false,
        paint,
      );
    }
  }

  void _paintSparkles(
    Canvas canvas,
    Offset center,
    double radius,
    double progress,
  ) {
    const sparkleCount = 8;

    for (int i = 0; i < sparkleCount; i++) {
      final baseAngle = (i / sparkleCount) * 2 * math.pi;
      final phase = (progress + i / sparkleCount) % 1.0;
      final scale = phase < 0.5 ? phase * 2 : (1 - phase) * 2;

      if (scale < 0.15) continue;

      final offset = Offset(
        center.dx + radius * math.cos(baseAngle),
        center.dy + radius * math.sin(baseAngle),
      );

      final sparklePaint = Paint()
        ..color = glow.withValues(alpha: scale * 1.0)
        ..strokeWidth = 2.5
        ..strokeCap = StrokeCap.round;

      final armLength = 5.0 * scale;

      canvas.drawLine(
        Offset(offset.dx - armLength, offset.dy),
        Offset(offset.dx + armLength, offset.dy),
        sparklePaint,
      );
      canvas.drawLine(
        Offset(offset.dx, offset.dy - armLength),
        Offset(offset.dx, offset.dy + armLength),
        sparklePaint,
      );
    }
  }

  void _paintBrushIcon(Canvas canvas, Offset center, double size) {
    final paint = Paint()
      ..color = Colors.white
      ..style = PaintingStyle.fill;

    final handleRect = Rect.fromCenter(
      center: Offset(center.dx, center.dy + size * 0.20),
      width: size * 0.20,
      height: size * 0.70,
    );
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        handleRect,
        Radius.circular(size * 0.08),
      ),
      paint,
    );

    final bristlesPath = Path()
      ..moveTo(center.dx - size * 0.28, center.dy - size * 0.30)
      ..lineTo(center.dx + size * 0.28, center.dy - size * 0.30)
      ..lineTo(center.dx, center.dy - size * 0.85)
      ..close();
    canvas.drawPath(bristlesPath, paint);
  }

  @override
  bool shouldRepaint(covariant _ImageLoadingPainter oldDelegate) {
    return oldDelegate.progress != progress ||
        oldDelegate.rotation != rotation ||
        oldDelegate.sparkle != sparkle;
  }
}

// ---------------------------------------------------------------------------
// Thinking indicator
// ---------------------------------------------------------------------------

class _WeuraThinking extends StatefulWidget {
  const _WeuraThinking({required this.colors});

  final WeuraColors colors;

  @override
  State<_WeuraThinking> createState() => _WeuraThinkingState();
}

class _WeuraThinkingState extends State<_WeuraThinking>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1500),
    )..repeat();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: Alignment.centerLeft,
      child: Container(
        width: 66,
        height: 44,
        margin: const EdgeInsets.only(bottom: 12),
        decoration: BoxDecoration(
          color: widget.colors.surface,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(
            color: widget.colors.accentGlow.withValues(alpha: 0.10),
          ),
        ),
        child: AnimatedBuilder(
          animation: _controller,
          builder: (context, child) {
            return Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: List.generate(3, (index) {
                final value =
                    (_controller.value * 3 - index).clamp(0.0, 1.0);
                final scale = 0.65 + (value * 0.45);
                return Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 3),
                  child: Transform.scale(
                    scale: scale,
                    child: Container(
                      width: 6,
                      height: 6,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: widget.colors.accentGlow,
                      ),
                    ),
                  ),
                );
              }),
            );
          },
        ),
      ),
    );
  }
}