import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math' as math;
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:flutter_highlight/flutter_highlight.dart';
import 'package:flutter_highlight/themes/atom-one-dark.dart';
import 'package:flutter_markdown_plus/flutter_markdown_plus.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:gal/gal.dart';
import 'package:http/http.dart' as http;
import 'package:image_picker/image_picker.dart';
import 'package:markdown/markdown.dart' as md;
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../components/Composer/comppser.dart';
import '../../components/Player/player_card.dart';
import '../../components/Voice/voice_input_sheet.dart';
import '../../../config/environment/environment.dart';
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
import 'models/chat_message.dart';
import 'blocks/typed_markdown.dart';
import 'blocks/writing_block.dart';
import 'blocks/source_link_builder.dart';
import 'blocks/latex_block.dart';
import 'blocks/dialogue_block.dart';
import 'blocks/code_block.dart';
import 'widgets/collapsible_user_text.dart';
import 'animations/chat_background.dart';
import 'animations/football_thinking.dart';
import 'animations/image_loader.dart';
import 'animations/thinking.dart';
import 'viewers/image_zoom_viewer.dart';

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

  final List<ChatMessage> _messages = [];
  final Map<int, String> _ratings = {};
  final Set<int> _typingIndices = {};

  AIMode _mode = AIMode.auto;
  bool _isLoading = false;
  bool _showScrollArrow = false;
  bool _requestCancelled = false;
  bool _isFootballQuestion = false;
  ChatSession? _session;
  WeuraFile? _attachedFile;
  final List<XFile> _attachedImages = [];
  static const int _maxImages = 10;

  static final String _serverUrl = EnvironmentConfig.production.apiBaseUrl;
      
  static const String _feedbackKey = 'weura_message_feedback';

  static const List<String> _footballKeywords = [
    'كرة القدم', 'كرة قدم', 'مباراة', 'ماتش', 'لاعب', 'فريق',
    'هدف', 'أهداف', 'دوري', 'كأس', 'ملعب', 'بطولة', 'انتقال',
    'مدرب', 'تشكيلة', 'نتيجة', 'ترتيب', 'تصفيات', 'منتخب',
    'الدوري', 'الكأس', 'الهداف', 'صانع ألعاب',
    'ريال مدريد', 'برشلونة', 'ليفربول', 'مانشستر', 'تشيلسي',
    'أرسنال', 'بايرن', 'يوفنتوس', 'ميلان', 'إنتر', 'سان جيرمان',
    'ميسي', 'رونالدو', 'مبابي', 'هالاند', 'بنزيمة', 'صلاح',
    'نيمار', 'حكيمي', 'محرز', 'زياش', 'بونو', 'أوناحي',
    'فينيسيوس', 'بيلينغهام', 'رودري', 'رافينيا', 'موسيالا',
    'كأس العالم', 'يورو', 'كوبا أمريكا',
    'football', 'soccer', 'match', 'player', 'team', 'goal',
    'league', 'cup', 'stadium', 'transfer', 'coach', 'manager',
    'lineup', 'result', 'standings', 'premier league', 'la liga',
    'serie a', 'bundesliga', 'ligue 1', 'champions league',
    'world cup', 'messi', 'ronaldo', 'mbappe', 'haaland',
  ];

  @override
  void initState() {
    super.initState();
    _grok = GrokService(baseUrl: _serverUrl);
    _voiceOut.addListener(_onVoiceChanged);

    // Show scroll-to-bottom arrow when user scrolls up.
    _scrollController.addListener(_onScrollChanged);

    _initialize();
  }

  void _onScrollChanged() {
    if (!_scrollController.hasClients) return;
    final pos = _scrollController.position;
    final distanceFromBottom = pos.maxScrollExtent - pos.pixels;
    final shouldShow = distanceFromBottom > 250;
    if (shouldShow != _showScrollArrow) {
      setState(() => _showScrollArrow = shouldShow);
    }
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

  bool _detectFootball(String message) {
    final t = message.toLowerCase();
    for (final kw in _footballKeywords) {
      if (t.contains(kw.toLowerCase())) return true;
    }
    return false;
  }

  Future<void> _initialize() async {
    await Future.wait([_history.load(), _memory.load()]);
    await _loadRatings();

    // Scroll to bottom after loading history (opening chat)
    if (mounted) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (!_scrollController.hasClients) return;
          _scrollController.jumpTo(
            _scrollController.position.maxScrollExtent,
          );
        });
      });
    }

    if (widget.sessionId != null) {
      final existing = _history.findById(widget.sessionId!);
      if (existing != null) {
        _session = existing;
        for (final msg in existing.messages) {
          if (msg.text.trim().isEmpty &&
              msg.imageUrl == null &&
              msg.playerData == null &&
              msg.visionImagePath == null) {
            continue;
          }
          _messages.add(
            ChatMessage(
              text: msg.text,
              isUser: msg.isUser,
              imageUrl: msg.imageUrl,
              imagePrompt: msg.imagePrompt,
              playerData: msg.playerData,
              visionImagePaths: msg.visionImagePaths,
              imageLocalPath: msg.imageLocalPath,
            ),
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

  Future<void> _saveImageToGallery(
    String imageUrl, {
    String? localPath,
  }) async {
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

      if (localPath == null) {
        _showMessage('Image file not available.');
        return;
      }

      final file = File(localPath);
      if (!await file.exists()) {
        _showMessage('Image file not found.');
        return;
      }

      final bytes = await file.readAsBytes();
      await Gal.putImageBytes(bytes, album: 'WEURA');

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

      session.messages.add(
        ChatMessageData(
          text: msg.text,
          isUser: msg.isUser,
          timestamp: DateTime.now(),
          imageUrl: msg.imageUrl,
          imagePrompt: msg.imagePrompt,
          playerData: msg.playerData,
          visionImagePaths: msg.visionImagePaths,
          imageLocalPath: msg.imageLocalPath,
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

  void _autoScrollDuringTyping() {
    if (!_scrollController.hasClients) return;

    // Always follow the AI as it types. Defer to next frame to
    // avoid feedback loops (which caused shaking before).
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!_scrollController.hasClients) return;
      final p2 = _scrollController.position;
      if (p2.pixels < p2.maxScrollExtent) {
        _scrollController.jumpTo(p2.maxScrollExtent);
      }
    });
  }

  Future<void> _editUserMessage(int index, WeuraColors colors) async {
    if (_isLoading) {
      _showMessage('Wait for the current request to finish.');
      return;
    }
    if (index < 0 || index >= _messages.length) return;
    if (!_messages[index].isUser) return;

    final currentText = _messages[index].text;
    final controller = TextEditingController(text: currentText);
    controller.selection = TextSelection.fromPosition(
      TextPosition(offset: currentText.length),
    );

    final result = await showDialog<String>(
      context: context,
      builder: (dialogContext) {
        return AlertDialog(
          backgroundColor: colors.surfaceAlt,
          title: Text(
            'Edit message',
            style: TextStyle(color: colors.textPrimary),
          ),
          content: TextField(
            controller: controller,
            autofocus: true,
            minLines: 1,
            maxLines: 6,
            maxLength: 2000,
            style: TextStyle(color: colors.textPrimary),
            decoration: InputDecoration(
              hintText: 'Your message',
              hintStyle: TextStyle(color: colors.textFaint),
              filled: true,
              fillColor: colors.surface,
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(14),
                borderSide: BorderSide.none,
              ),
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogContext),
              child: const Text('Cancel'),
            ),
            TextButton(
              onPressed: () =>
                  Navigator.pop(dialogContext, controller.text),
              child: const Text('Save & Send'),
            ),
          ],
        );
      },
    );

    if (result == null) return;
    final newText = result.trim();
    if (newText.isEmpty || newText == currentText) return;

    _messages[index] = ChatMessage(text: newText, isUser: true);
    _messages.removeRange(index + 1, _messages.length);
    _ratings.removeWhere((key, _) => key > index);
    _typingIndices.clear();

    setState(() {});

    await _sendMessage(newText, addUserMessage: false);
  }

  Future<void> _pickFile() async {
    if (_isLoading) {
      _showMessage('Wait for the current request to finish.');
      return;
    }

    if (_attachedImages.isNotEmpty) {
      _showMessage('Remove the attached images first.');
      return;
    }

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
        ChatMessage(
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
        _messages.add(ChatMessage(text: content, isUser: false));
        _typingIndices.add(_messages.length - 1);
        _attachedFile = null;
      });

      await _persistMessages();
      _scrollToBottom();
    } catch (error) {
      if (!mounted || _requestCancelled) return;
      setState(() {
        _messages.add(
          ChatMessage(
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

  String? _detectPlayerIntent(String message) {
    final text = message.trim();
    final lower = text.toLowerCase();

    const triggers = [
      'بطاقة ', 'بطاقه ', 'معلومات عن ', 'بروفايل ',
      'profile of ', 'card of ', 'player card ',
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
      _messages.add(ChatMessage(text: userMessage, isUser: true));
      _isLoading = true;
      _isFootballQuestion = true;
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
          ChatMessage(
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
          ChatMessage(
            text: _cleanError(error),
            isUser: false,
            isError: true,
          ),
        );
      });

      _scrollToBottom();
    } finally {
      if (mounted) {
        setState(() {
          _isLoading = false;
          _isFootballQuestion = false;
        });
      }
    }
  }

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

  // ============================================================
  // IMAGE SEARCH (Pexels) — detect intent
  // ============================================================

  /// Detects "find real photos of X" intent.
  /// Returns the search query, or null if not a search request.
  String? _detectImageSearchIntent(String message) {
    final text = message.trim();
    final lower = text.toLowerCase();

    // Arabic triggers for SEARCH (not generate)
    const arabicSearchTriggers = [
      'حبيت فوطو لـ ', 'حبيت فوطو ل', 'حبيت فوطو ',
      'حبيت صورة لـ ', 'حبيت صورة ل', 'حبيت صورة ',
      'حبيت صور لـ ', 'حبيت صور ',
      'بغيت فوطو لـ ', 'بغيت فوطو ', 'بغيت صورة ', 'بغيت صور ',
      'وريني صور لـ ', 'وريني صور ', 'وريني صورة ', 'وريني فوطو ',
      'ورّيني صور لـ ', 'ورّيني صور ',
      'هات لي صور لـ ', 'هات لي صور ', 'هاتلي صور ',
      'جيب لي صور لـ ', 'جيب لي صور ', 'جيبلي صور ',
      'ابحث عن صور لـ ', 'ابحث عن صور ', 'ابحثلي على صور ',
      'لقّي لي صور لـ ', 'لقّي لي صور ', 'لقّيلي صور ',
      'عطيني صور لـ ', 'عطيني صور ', 'عطيني فوطو ',
      'أريد صور لـ ', 'اريد صور لـ ', 'أريد صور ', 'اريد صور ',
      'صور حقيقية لـ ', 'صور حقيقية ل',
    ];

    const englishSearchTriggers = [
      'find photos of ', 'find photos ',
      'find pictures of ', 'find pictures ',
      'find images of ', 'find images ',
      'show me photos of ', 'show me photos ',
      'show me pictures of ', 'show me pictures ',
      'show me images of ', 'show me images ',
      'search for photos of ', 'search for photos ',
      'search for images of ', 'search for images ',
      'search images of ', 'search images ',
      'get me photos of ', 'get me photos ',
      'get me images of ', 'get me images ',
      'i want photos of ', 'i want pictures of ', 'i want images of ',
      'real photos of ', 'real pictures of ',
    ];

    // Arabic — check longest first
    final sortedArabic = [...arabicSearchTriggers]
      ..sort((a, b) => b.length.compareTo(a.length));

    for (final trigger in sortedArabic) {
      final idx = text.indexOf(trigger);
      if (idx != -1) {
        // Allow letter-after when trigger ends with "ل" (لـ + word)
        // e.g. "حبيت فوطو لامبابي" → trigger "حبيت فوطو ل" + "امبابي"
        final endsWithLam = trigger.trimRight().endsWith('ل');
        final beforeOk = !_isArabicLetterBefore(text, idx);
        final afterOk = endsWithLam ||
            !_isArabicLetterAfter(text, idx + trigger.length);

        if (beforeOk && afterOk) {
          final query = text.substring(idx + trigger.length).trim();
          final cleaned = query
              .replaceFirst(RegExp(r'^[\s:\-,\.]+'), '')
              .trim();
          if (cleaned.length >= 2) return cleaned;
        }
      }
    }

    // English — check longest first
    final sortedEnglish = [...englishSearchTriggers]
      ..sort((a, b) => b.length.compareTo(a.length));

    for (final trigger in sortedEnglish) {
      final idx = lower.indexOf(trigger);
      if (idx != -1) {
        final query = text.substring(idx + trigger.length).trim();
        final cleaned = query
            .replaceFirst(RegExp(r'^[\s:\-,\.]+'), '')
            .trim();
        if (cleaned.length >= 2) return cleaned;
      }
    }

    return null;
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
        final endsWithLam = trigger.trimRight().endsWith('ل');
        final beforeOk = !_isArabicLetterBefore(text, idx);
        final afterOk = endsWithLam ||
            !_isArabicLetterAfter(text, idx + trigger.length);

        if (beforeOk && afterOk) {
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

  String _buildImageUrl(String prompt, {int? seed}) {
    final encoded = Uri.encodeComponent(prompt);
    final seedPart = (seed != null) ? '&seed=$seed' : '';
    return '$_serverUrl/api/image?prompt=$encoded$seedPart';
  }

  // ============================================================
  // IMAGE SEARCH (Pexels) — handler
  // ============================================================

  Future<void> _handleImageSearch(
    String userMessage,
    String query,
  ) async {
    await _ensureSession(userMessage);

    setState(() {
      _messages.add(ChatMessage(text: userMessage, isUser: true));
      _messages.add(
        ChatMessage(
          text: '',
          isUser: false,
          searchQuery: query,
          isSearching: true,
        ),
      );
      _isLoading = false;
    });

    await _persistMessages();
    _scrollToBottom();

    try {
      // 1) Classify intent first (to confirm it's a search)
      final classifyResp = await http
          .post(
            Uri.parse('$_serverUrl/api/image/classify'),
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode({'prompt': query}),
          )
          .timeout(const Duration(seconds: 15));

      String intent = 'search';
      String searchQuery = query;

      if (classifyResp.statusCode == 200) {
        final classifyData =
            jsonDecode(classifyResp.body) as Map<String, dynamic>;
        intent = (classifyData['intent'] as String?) ?? 'search';
        final sq = (classifyData['search_query'] as String?)?.trim() ?? '';
        if (sq.isNotEmpty) searchQuery = sq;
      }

      // If classifier says "generate", redirect to generation
      if (intent == 'generate') {
        setState(() {
          _messages.removeLast(); // remove the searching placeholder
        });
        await _handleImageGeneration(userMessage, query);
        return;
      }

      // 2) Search Pexels
      final searchResp = await http
          .post(
            Uri.parse('$_serverUrl/api/image/search'),
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode({
              'query': query,
              'count': 12,
            }),
          )
          .timeout(const Duration(seconds: 25));

      if (searchResp.statusCode != 200) {
        throw Exception('Search failed (HTTP ${searchResp.statusCode})');
      }

      final data = jsonDecode(searchResp.body) as Map<String, dynamic>;

      if (data['success'] != true) {
        throw Exception(data['error'] ?? 'Search failed');
      }

      final results = (data['results'] as List?)
              ?.whereType<Map>()
              .map((e) => e.cast<String, dynamic>())
              .toList() ??
          [];

      final translatedQuery =
          (data['translated_query'] as String?)?.trim() ?? query;

      setState(() {
        _messages.removeLast(); // remove placeholder
        _messages.add(
          ChatMessage(
            text: '',
            isUser: false,
            searchResults: results,
            searchQuery: translatedQuery,
          ),
        );
      });

      await _persistMessages();
      _scrollToBottom();
    } catch (e) {
      setState(() {
        _messages.removeLast();
        _messages.add(
          ChatMessage(
            text: 'فشل البحث عن الصور. حاول مرة أخرى.',
            isUser: false,
            isError: true,
          ),
        );
      });
    }
  }

  Future<void> _handleImageGeneration(
    String userMessage,
    String prompt,
  ) async {
    await _ensureSession(userMessage);

    final imageUrl = _buildImageUrl(prompt);

    setState(() {
      _messages.add(ChatMessage(text: userMessage, isUser: true));
      _messages.add(
        ChatMessage(
          text: '',
          isUser: false,
          imageUrl: imageUrl,
          imagePrompt: prompt,
          isImageLoading: true,
        ),
      );
      _isLoading = false;
    });

    await _persistMessages();
    _scrollToBottom();

    final idx = _messages.length - 1;

    final localPath = await _downloadImageLocally(imageUrl);

    if (!mounted) return;

    setState(() {
      if (localPath != null) {
        _messages[idx] = ChatMessage(
          text: '',
          isUser: false,
          imageUrl: imageUrl,
          imagePrompt: prompt,
          imageLocalPath: localPath,
          isImageLoading: false,
        );
      } else {
        _messages[idx] = ChatMessage(
          text: 'تعذر إنشاء الصورة. جرّب مرة أخرى.',
          isUser: false,
          isError: true,
          imagePrompt: prompt,
        );
      }
    });

    await _persistMessages();
    _scrollToBottom();
  }

  Future<void> _regenerateImage(int index) async {
    if (index < 0 || index >= _messages.length) return;
    final original = _messages[index];
    if (original.imagePrompt == null) return;

    final seed = DateTime.now().millisecondsSinceEpoch;
    final newUrl = _buildImageUrl(original.imagePrompt!, seed: seed);

    setState(() {
      _messages[index] = ChatMessage(
        text: '',
        isUser: false,
        imageUrl: newUrl,
        imagePrompt: original.imagePrompt,
        isImageLoading: true,
      );
    });

    _scrollToBottom();

    final localPath = await _downloadImageLocally(newUrl);

    if (!mounted) return;

    setState(() {
      if (localPath != null) {
        _messages[index] = ChatMessage(
          text: '',
          isUser: false,
          imageUrl: newUrl,
          imagePrompt: original.imagePrompt,
          imageLocalPath: localPath,
        );
      } else {
        _messages[index] = ChatMessage(
          text: 'تعذر إنشاء الصورة. جرّب مرة أخرى.',
          isUser: false,
          isError: true,
          imagePrompt: original.imagePrompt,
        );
      }
    });

    await _persistMessages();
  }

  Future<String?> _downloadImageLocally(String url) async {
    try {
      final response = await http
          .get(Uri.parse(url))
          .timeout(const Duration(seconds: 90));

      if (response.statusCode != 200) {
        debugPrint(
          '[WEURA] image download HTTP ${response.statusCode}',
        );
        return null;
      }

      final dir = await getApplicationDocumentsDirectory();
      final weuraDir = Directory('${dir.path}/weura_images');
      if (!await weuraDir.exists()) {
        await weuraDir.create(recursive: true);
      }

      final fileName =
          'img_${DateTime.now().microsecondsSinceEpoch}.jpg';
      final file = File('${weuraDir.path}/$fileName');
      await file.writeAsBytes(response.bodyBytes);

      return file.path;
    } catch (e) {
      debugPrint('[WEURA] download image error: $e');
      return null;
    }
  }

  Future<void> _pickImage(ImageSource source) async {
    if (_isLoading) {
      _showMessage('Wait for the current request to finish.');
      return;
    }
    if (_attachedFile != null) {
      _showMessage('Remove the attached file first.');
      return;
    }
    if (_attachedImages.length >= _maxImages) {
      _showMessage('Maximum $_maxImages images.');
      return;
    }

    try {
      final List<XFile> picked = [];

      if (source == ImageSource.gallery) {
        final remaining = _maxImages - _attachedImages.length;
        final files = await _imagePicker.pickMultiImage(
          maxWidth: 1024,
          maxHeight: 1024,
          imageQuality: 55,
          limit: remaining,
        );
        picked.addAll(files);
      } else {
        final file = await _imagePicker.pickImage(
          source: source,
          maxWidth: 1024,
          maxHeight: 1024,
          imageQuality: 55,
        );
        if (file != null) picked.add(file);
      }

      if (picked.isEmpty) return;

      final remaining = _maxImages - _attachedImages.length;
      final toAdd = picked.take(remaining).toList();

      setState(() {
        _attachedImages.addAll(toAdd);
      });

      if (picked.length > remaining) {
        _showMessage('Only $remaining added (max $_maxImages).');
      }
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

  bool _isEditRequest(String text) {
    final t = text.toLowerCase();
    const editWords = [
      'غير', 'بدل', 'حول', 'خلي', 'عدل', 'زيد', 'حيد', 'رجع',
      'خليه', 'خليها', 'رجعو', 'رجعها',
      'make', 'change', 'turn', 'edit', 'modify', 'add', 'remove',
      'convert', 'transform', 'replace', 'swap',
    ];
    return editWords.any(t.contains);
  }

  Future<void> _analyzeImages(
    List<XFile> images, {
    bool addUserMessage = true,
    String? customQuestion,
  }) async {
    if (_isLoading || images.isEmpty) return;

    final defaultQuestion = (customQuestion?.trim().isNotEmpty ?? false)
        ? customQuestion!.trim()
        : (images.length > 1
            ? 'قارن بين هذه الصور واشرح كل واحدة بالتفصيل.'
            : 'اشرح هذه الصورة بالتفصيل.');

    await _ensureSession('🖼️ Image analysis');

    if (addUserMessage) {
      setState(() {
        _messages.add(
          ChatMessage(
            text: defaultQuestion,
            isUser: true,
            visionImagePaths: images.map((i) => i.path).toList(),
          ),
        );
        _isLoading = true;
        _requestCancelled = false;
      });

      await _persistMessages();
      _scrollToBottom();
    } else {
      setState(() {
        _isLoading = true;
        _requestCancelled = false;
      });
    }

    try {
      final dataUrls = <String>[];
      for (final image in images) {
        final bytes = await image.readAsBytes();
        final sizeKB = bytes.length / 1024;

        if (sizeKB > 4000) {
          throw const GrokException(
            'إحدى الصور كبيرة بزاف (أكثر من 4 ميغا). جرّب صورة أصغر.',
          );
        }

        dataUrls.add('data:image/jpeg;base64,${base64Encode(bytes)}');
      }

      debugPrint(
        '[WEURA] Vision payload: ${images.length} image(s)',
      );

      final uri = Uri.parse('$_serverUrl/api/vision');

      final response = await http
          .post(
            uri,
            headers: const {
              'Content-Type': 'application/json',
              'Accept': 'application/json',
            },
            body: jsonEncode({
              'images': dataUrls,
              'question': defaultQuestion,
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
        final msg = data['error']?.toString();
        throw GrokException(
          msg != null && msg.isNotEmpty
              ? msg
              : 'Vision failed (HTTP ${response.statusCode})',
          statusCode: response.statusCode,
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
        _messages.add(ChatMessage(text: content, isUser: false));
        _typingIndices.add(_messages.length - 1);
      });

      await _persistMessages();
      _scrollToBottom();
    } catch (error) {
      if (!mounted || _requestCancelled) return;

      setState(() {
        _messages.add(
          ChatMessage(
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

  Future<void> _editImage(XFile image, String instruction) async {
    if (_isLoading) return;

    final title = instruction.length > 30
        ? '${instruction.substring(0, 30)}...'
        : instruction;

    await _ensureSession('🎨 $title');

    setState(() {
      _messages.add(
        ChatMessage(
          text: instruction,
          isUser: true,
          visionImagePaths: [image.path],
        ),
      );
      _messages.add(
        ChatMessage(
          text: '',
          isUser: false,
          imagePrompt: instruction,
          isImageLoading: true,
        ),
      );
      _isLoading = true;
      _requestCancelled = false;
    });

    await _persistMessages();
    _scrollToBottom();

    final idx = _messages.length - 1;

    try {
      final bytes = await image.readAsBytes();
      final base64Data = base64Encode(bytes);
      final dataUrl = 'data:image/jpeg;base64,$base64Data';

      final sizeKB = bytes.length / 1024;
      if (sizeKB > 4000) {
        throw const GrokException(
          'الصورة كبيرة بزاف (أكثر من 4 ميغا). جرّب صورة أصغر.',
        );
      }

      final uri = Uri.parse('$_serverUrl/api/image/edit');

      final response = await http
          .post(
            uri,
            headers: const {
              'Content-Type': 'application/json',
              'Accept': 'image/*, application/json',
            },
            body: jsonEncode({
              'image': dataUrl,
              'prompt': instruction,
            }),
          )
          .timeout(const Duration(seconds: 120));

      if (!mounted || _requestCancelled) return;

      final contentType = response.headers['content-type'] ?? '';

      if (contentType.contains('application/json')) {
        Map<String, dynamic> data;
        try {
          data = jsonDecode(response.body) as Map<String, dynamic>;
        } catch (_) {
          throw Exception('فشل تعديل الصورة.');
        }
        throw Exception(
          data['error']?.toString() ?? 'فشل تعديل الصورة.',
        );
      }

      if (response.statusCode != 200) {
        throw Exception(
          'فشل تعديل الصورة (HTTP ${response.statusCode}).',
        );
      }

      final dir = await getApplicationDocumentsDirectory();
      final weuraDir = Directory('${dir.path}/weura_images');
      if (!await weuraDir.exists()) {
        await weuraDir.create(recursive: true);
      }

      final fileName =
          'edit_${DateTime.now().microsecondsSinceEpoch}.jpg';
      final file = File('${weuraDir.path}/$fileName');
      await file.writeAsBytes(response.bodyBytes);

      setState(() {
        _messages[idx] = ChatMessage(
          text: '',
          isUser: false,
          imagePrompt: instruction,
          imageLocalPath: file.path,
          isImageLoading: false,
        );
      });

      await _persistMessages();
      _scrollToBottom();
    } catch (error) {
      if (!mounted || _requestCancelled) return;

      setState(() {
        _messages[idx] = ChatMessage(
          text: _cleanError(error),
          isUser: false,
          isError: true,
          imagePrompt: instruction,
        );
      });

      _scrollToBottom();
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  Future<void> _sendMessage(
    String text, {
    bool addUserMessage = true,
  }) async {
    if (_isLoading) return;

    final message = text.trim();

    if (_attachedImages.isNotEmpty) {
      final imgs = List<XFile>.from(_attachedImages);
      setState(() => _attachedImages.clear());

      if (imgs.length == 1 &&
          message.isNotEmpty &&
          _isEditRequest(message)) {
        await _editImage(imgs.first, message);
      } else {
        await _analyzeImages(
          imgs,
          customQuestion: message.isEmpty ? null : message,
        );
      }
      return;
    }

    if (_attachedFile != null) {
      final file = _attachedFile!;
      await _sendFileToServer(file, message);
      return;
    }

    if (message.isEmpty) return;

    final isFootball = _detectFootball(message);

    final playerName = _detectPlayerIntent(message);
    if (playerName != null) {
      await _maybeStoreMemory(message);
      await _handlePlayerCard(message, playerName);
      return;
    }

    // 1) Check for IMAGE SEARCH intent first (find real photos)
    final imageSearchQuery = _detectImageSearchIntent(message);
    if (imageSearchQuery != null) {
      await _maybeStoreMemory(message);
      await _handleImageSearch(message, imageSearchQuery);
      return;
    }

    // 2) Then check for IMAGE GENERATION intent (draw/create)
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

    if (addUserMessage) {
      setState(() {
        _messages.add(ChatMessage(text: message, isUser: true));
        _isLoading = true;
        _isFootballQuestion = isFootball;
        _requestCancelled = false;
      });

      await _persistMessages();
      _scrollToBottom();
    } else {
      setState(() {
        _isLoading = true;
        _isFootballQuestion = isFootball;
        _requestCancelled = false;
      });
    }

    try {
      final memoryContext =
          _memory.buildRelevantContext(message, maxItems: 5);
      final userName = _memory.getUserName();

      final enrichedMemory = _composeMemoryPayload(
        memoryContext: memoryContext,
        userName: userName,
      );

      // Build a CLEAN history:
      // 1. Skip special messages (player cards, images) AND the user
      //    message that triggered them.
      // 2. Guarantee no consecutive user messages.
      final history = <GrokMessage>[];
      final buffer = <ChatMessage>[];

      for (final m in _messages) {
        // Reset buffer when we hit a special feature message.
        if (m.imageUrl != null ||
            m.visionImagePath != null ||
            m.playerData != null ||
            m.isError) {
          buffer.clear();
          continue;
        }

        if (m.text.trim().isEmpty) continue;

        buffer.add(m);
      }

      // Take last 6 from the clean buffer.
      final recent = buffer.length > 6
          ? buffer.sublist(buffer.length - 6)
          : buffer;

      // Build the messages, ensuring no two user messages in a row.
      for (final m in recent) {
        final role = m.isUser ? 'user' : 'assistant';
        if (history.isNotEmpty && history.last.role == role) {
          // Skip duplicate role (merge with previous).
          continue;
        }
        history.add(GrokMessage(role: role, content: m.text));
      }

      final result = await _grok.sendMessage(
        messages: history,
        memory: enrichedMemory,
        mode: resolvedMode.name,
      );

      if (!mounted || _requestCancelled) return;

      if (result.content.trim().isEmpty) {
        setState(() {
          _messages.add(
            const ChatMessage(
              text: 'WEURA did not return an answer. Please try again.',
              isUser: false,
              isError: true,
            ),
          );
        });
      } else {
        setState(() {
          _messages.add(
            ChatMessage(text: result.content, isUser: false),
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
          ChatMessage(
            text: _cleanError(error),
            isUser: false,
            isError: true,
          ),
        );
      });

      _scrollToBottom();
    } finally {
      if (mounted) {
        setState(() {
          _isLoading = false;
          _isFootballQuestion = false;
        });
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
    _grok.cancelActiveRequest();  // actually abort the HTTP request
    setState(() {
      _requestCancelled = true;
      _isLoading = false;
      _isFootballQuestion = false;
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

    final lastUser = _messages[lastUserIndex];
    final userText = lastUser.text;
    final visionPath = lastUser.visionImagePath;

    _messages.removeRange(lastUserIndex + 1, _messages.length);
    _ratings.removeWhere((key, _) => key > lastUserIndex);
    _typingIndices.removeWhere((i) => i > lastUserIndex);

    setState(() {});

    if (visionPath != null && visionPath.isNotEmpty) {
      final file = File(visionPath);
      if (file.existsSync()) {
        _analyzeImages([XFile(visionPath)], addUserMessage: false);
        return;
      }
    }

    _sendMessage(userText, addUserMessage: false);
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

  /// Jumps to bottom repeatedly across frames.
  /// Needed because ListView.builder's maxScrollExtent grows lazily,
  /// so a single jump lands partway.
  /// Instant + robust scroll to bottom.
  /// Uses jumpTo in a short burst (no timer, no animation).
  bool _isAutoScrolling = false;

  Future<void> _scrollToBottomRepeated() async {
    if (_isAutoScrolling) return;
    if (!_scrollController.hasClients) return;
    _isAutoScrolling = true;

    try {
      // 20 iterations × 35ms ≈ 700ms of continuous jumping.
      // No early return — we keep jumping because maxScrollExtent
      // grows as ListView.builder renders new items.
      for (int i = 0; i < 20; i++) {
        if (!mounted || !_scrollController.hasClients) return;
        _scrollController.jumpTo(
          _scrollController.position.maxScrollExtent,
        );
        await Future<void>.delayed(const Duration(milliseconds: 35));
      }
    } finally {
      _isAutoScrolling = false;
    }
  }

  void _scrollToBottom({bool animated = true}) {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!_scrollController.hasClients) return;
      final maxExtent = _scrollController.position.maxScrollExtent;

      // Don't force-scroll if user scrolled up manually.
      final distanceFromBottom = maxExtent - _scrollController.position.pixels;
      if (distanceFromBottom > 400) return;

      if (animated) {
        _scrollController.animateTo(
          maxExtent,
          duration: const Duration(milliseconds: 200),
          curve: Curves.easeOut,
        );
      } else {
        _scrollController.jumpTo(maxExtent);
      }
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

  void _openImageZoom(String imageUrl, {String? localPath}) {
    Navigator.of(context).push(
      PageRouteBuilder<void>(
        opaque: false,
        barrierColor: Colors.black,
        transitionDuration: const Duration(milliseconds: 250),
        reverseTransitionDuration: const Duration(milliseconds: 200),
        pageBuilder: (_, __, ___) => ImageZoomViewer(
          imageUrl: imageUrl,
          localPath: localPath,
          onSave: () => _saveImageToGallery(
            imageUrl,
            localPath: localPath,
          ),
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

  // ===========================================================================
  // DRAWER
  // ===========================================================================

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
              icon: Icons.history_rounded,
              label: 'History',
              onTap: _openHistory,
            ),
            _drawerItem(
              colors: colors,
              icon: Icons.memory_rounded,
              label: 'Memory',
              onTap: _openMemory,
            ),
            const SizedBox(height: 18),
            _drawerSectionTitle(colors, 'App'),
            _drawerItem(
              colors: colors,
              icon: Icons.settings_outlined,
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
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(13),
              boxShadow: [
                BoxShadow(
                  color: colors.accent.withValues(alpha: 0.25),
                  blurRadius: 14,
                  spreadRadius: 1,
                ),
              ],
            ),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(13),
              child: Image.asset(
                'assets/logo/app_icon.png',
                width: 44,
                height: 44,
                fit: BoxFit.cover,
              ),
            ),
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
                Icon(
                  Icons.add_rounded,
                  size: 22,
                  color: colors.textPrimary,
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
    required IconData icon,
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
                Icon(icon, size: 22, color: colors.textPrimary),
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

  // ===========================================================================
  // SHEETS
  // ===========================================================================

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
                  icon: Icons.photo_library_outlined,
                  title: 'Photos',
                  subtitle: 'Attach an image (analyze or edit)',
                  onTap: () {
                    Navigator.pop(sheetContext);
                    _pickImage(ImageSource.gallery);
                  },
                ),
                _attachmentOption(
                  colors: colors,
                  icon: Icons.camera_alt_outlined,
                  title: 'Camera',
                  subtitle: 'Capture and attach an image',
                  onTap: () {
                    Navigator.pop(sheetContext);
                    _pickImage(ImageSource.camera);
                  },
                ),
                _attachmentOption(
                  colors: colors,
                  icon: Icons.insert_drive_file_outlined,
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
    required IconData icon,
    required String title,
    required String subtitle,
    required VoidCallback onTap,
  }) {
    return ListTile(
      onTap: onTap,
      contentPadding:
          const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
      leading: Container(
        width: 40,
        height: 40,
        decoration: BoxDecoration(
          color: colors.accentSoft,
          borderRadius: BorderRadius.circular(11),
        ),
        child: Icon(
          icon,
          size: 22,
          color: colors.accentGlow,
        ),
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
      trailing: Icon(
        Icons.arrow_forward_ios_rounded,
        size: 16,
        color: colors.textMuted,
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
                    leading: Icon(
                      _modeIcon(mode),
                      size: 22,
                      color: selected
                          ? colors.accentGlow
                          : colors.textPrimary,
                    ),
                    title: Text(
                      _modeName(mode),
                      style: TextStyle(
                        color: colors.textPrimary,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                    trailing: selected
                        ? Icon(
                            Icons.check_rounded,
                            size: 22,
                            color: colors.accentGlow,
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

  IconData _modeIcon(AIMode mode) {
    switch (mode) {
      case AIMode.auto:
        return Icons.auto_awesome_rounded;
      case AIMode.smart:
        return Icons.psychology_rounded;
      case AIMode.fast:
        return Icons.flash_on_rounded;
      case AIMode.research:
        return Icons.travel_explore_rounded;
      case AIMode.code:
        return Icons.code_rounded;
      case AIMode.creative:
        return Icons.brush_rounded;
      case AIMode.vision:
        return Icons.visibility_rounded;
      case AIMode.files:
        return Icons.folder_open_rounded;
      case AIMode.translation:
        return Icons.translate_rounded;
    }
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

  // ===========================================================================
  // BUILD
  // ===========================================================================

  @override
  Widget build(BuildContext context) {
    final colors = WeuraColors.of(context);

    return Scaffold(
      key: _scaffoldKey,
      backgroundColor: colors.background,
      resizeToAvoidBottomInset: false,
      drawer: _buildDrawer(colors),
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        leading: IconButton(
          tooltip: 'Menu',
          onPressed: () {
            _scaffoldKey.currentState?.openDrawer();
          },
          icon: Icon(
            Icons.menu_rounded,
            size: 24,
            color: colors.textPrimary,
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
            icon: Icon(
              Icons.tune_rounded,
              size: 24,
              color: colors.textPrimary,
            ),
          ),
        ],
      ),
      extendBodyBehindAppBar: true,
      floatingActionButton: _showScrollArrow
          ? Padding(
              padding: EdgeInsets.only(
                bottom: 100 + MediaQuery.viewInsetsOf(context).bottom,
              ),
              child: FloatingActionButton(
                mini: true,
                backgroundColor: colors.accentGlow,
                elevation: 4,
                onPressed: _scrollToBottomRepeated,
                child: Icon(
                  Icons.keyboard_arrow_down_rounded,
                  color: colors.background,
                  size: 26,
                ),
              ),
            )
          : null,
      floatingActionButtonLocation: FloatingActionButtonLocation.endFloat,
      body: Stack(
        children: [
          Positioned.fill(
            child: TickerMode(
              enabled: _messages.isNotEmpty || _isLoading,
              child: ChatBackground(colors: colors),
            ),
          ),
          Column(
            children: [
              SizedBox(
                height: MediaQuery.paddingOf(context).top + kToolbarHeight,
              ),
              Expanded(
                child: _messages.isEmpty
                    ? _emptyState(colors)
                    : ListView.builder(
                        controller: _scrollController,
                        keyboardDismissBehavior:
                            ScrollViewKeyboardDismissBehavior.onDrag,
                        padding: const EdgeInsets.fromLTRB(18, 22, 18, 100),
                        itemCount: _messages.length + (_isLoading ? 1 : 0),
                        itemBuilder: (context, index) {
                          if (_isLoading && index == _messages.length) {
                            return _isFootballQuestion
                                ? FootballThinking(colors: colors)
                                : WeuraThinking(colors: colors);
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
              if (_attachedImages.isNotEmpty)
                _attachedImagesRow(colors),
              if (_attachedFile != null)
                _attachedFileChip(colors, _attachedFile!),
              // Isolated composer: uses viewInsetsOf (not MediaQuery.of)
              // so the keyboard animation only repaints the composer,
              // not the whole screen tree.
              RepaintBoundary(
                child: Stack(
                  clipBehavior: Clip.none,
                  children: [
                    Padding(
                      padding: EdgeInsets.only(
                        bottom: MediaQuery.viewInsetsOf(context).bottom,
                      ),
                      child: WeuraComposer(
                        enabled: true,
                        isLoading: _isLoading,
                        onSend: _sendMessage,
                        onAttach: () => _showAttachmentSheet(colors),
                        onMode: () => _showModePicker(colors),
                        onVoice: () => _handleVoice(colors),
                        onStop: _cancelRequest,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _attachedImagesRow(WeuraColors colors) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(14, 4, 14, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.only(left: 4, bottom: 6),
            child: Row(
              children: [
                Icon(
                  Icons.image_rounded,
                  size: 14,
                  color: colors.accentGlow,
                ),
                const SizedBox(width: 6),
                Text(
                  '${_attachedImages.length} / $_maxImages',
                  style: TextStyle(
                    color: colors.textMuted,
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const Spacer(),
                if (_attachedImages.length > 1)
                  TextButton.icon(
                    onPressed: () =>
                        setState(() => _attachedImages.clear()),
                    style: TextButton.styleFrom(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 2,
                      ),
                      minimumSize: Size.zero,
                      tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                    ),
                    icon: Icon(
                      Icons.close_rounded,
                      size: 14,
                      color: colors.danger,
                    ),
                    label: Text(
                      'Clear all',
                      style: TextStyle(
                        color: colors.danger,
                        fontSize: 11.5,
                      ),
                    ),
                  ),
              ],
            ),
          ),
          SizedBox(
            height: 72,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 2),
              itemCount: _attachedImages.length,
              separatorBuilder: (_, __) => const SizedBox(width: 8),
              itemBuilder: (context, i) {
                final image = _attachedImages[i];
                return Stack(
                  clipBehavior: Clip.none,
                  children: [
                    ClipRRect(
                      borderRadius: BorderRadius.circular(12),
                      child: Container(
                        width: 72,
                        height: 72,
                        decoration: BoxDecoration(
                          color: colors.surface,
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(
                            color: colors.accentGlow
                                .withValues(alpha: 0.30),
                          ),
                        ),
                        child: Image.file(
                          File(image.path),
                          fit: BoxFit.cover,
                          errorBuilder: (_, __, ___) => Icon(
                            Icons.broken_image_outlined,
                            color: colors.textMuted,
                            size: 22,
                          ),
                        ),
                      ),
                    ),
                    Positioned(
                      top: -6,
                      right: -6,
                      child: Material(
                        color: colors.danger,
                        shape: const CircleBorder(),
                        child: InkWell(
                          onTap: () {
                            setState(() => _attachedImages.removeAt(i));
                          },
                          customBorder: const CircleBorder(),
                          child: const Padding(
                            padding: EdgeInsets.all(4),
                            child: Icon(
                              Icons.close_rounded,
                              size: 12,
                              color: Colors.white,
                            ),
                          ),
                        ),
                      ),
                    ),
                  ],
                );
              },
            ),
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
              decoration: BoxDecoration(
                color: colors.accentSoft,
                borderRadius: BorderRadius.circular(10),
              ),
              child: Icon(
                Icons.insert_drive_file_outlined,
                size: 20,
                color: colors.accentGlow,
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
    final isAr = AppSettingsManager.instance.effectiveLanguage == 'Arabic';

    final suggestions = isAr
        ? const [
            'اشرحلي حاجة',
            'ساعدني نكتب',
            'حلّل هذه الفكرة',
            'ساعدني في الكود',
          ]
        : const [
            'Explain something',
            'Help me write',
            'Analyze an idea',
            'Help me code',
          ];

    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 20),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            // ─── Glowing logo ───
            Container(
              width: 88,
              height: 88,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(24),
                boxShadow: [
                  BoxShadow(
                    color: colors.accent.withValues(alpha: 0.35),
                    blurRadius: 50,
                    spreadRadius: 6,
                  ),
                ],
              ),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(24),
                child: Image.asset(
                  'assets/logo/app_icon.png',
                  width: 88,
                  height: 88,
                  fit: BoxFit.cover,
                ),
              ),
            ),
            const SizedBox(height: 32),

            // ─── Gradient title ───
            ShaderMask(
              blendMode: BlendMode.srcIn,
              shaderCallback: (bounds) => LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [
                  colors.textPrimary,
                  colors.accentGlow,
                  colors.accent,
                ],
                stops: const [0.0, 0.6, 1.0],
              ).createShader(bounds),
              child: Text(
                isAr ? 'فكّر أبعد.' : 'Think Beyond.',
                textAlign: TextAlign.center,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 42,
                  fontWeight: FontWeight.w800,
                  letterSpacing: -1.0,
                  height: 1.1,
                ),
              ),
            ),
            const SizedBox(height: 14),

            Text(
              isAr
                  ? 'مساحتك الذكية للأفكار، الأجوبة والإبداع.'
                  : 'Your intelligent space for ideas, answers and creation.',
              textAlign: TextAlign.center,
              style: TextStyle(
                color: colors.textSecondary,
                fontSize: 15.5,
                height: 1.5,
              ),
            ),
            const SizedBox(height: 48),

            // ─── Suggestion chips ───
            Wrap(
              alignment: WrapAlignment.center,
              spacing: 10,
              runSpacing: 10,
              children: suggestions.map((s) {
                return _suggestionChip(colors, s);
              }).toList(),
            ),
          ],
        ),
      ),
    );
  }

  Widget _suggestionChip(WeuraColors colors, String text) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: () {
          if (_isLoading) return;
          _sendMessage(text);
        },
        borderRadius: BorderRadius.circular(16),
        child: Container(
          padding: const EdgeInsets.symmetric(
            horizontal: 18,
            vertical: 13,
          ),
          decoration: BoxDecoration(
            color: colors.surface.withValues(alpha: 0.85),
            borderRadius: BorderRadius.circular(16),
            border: Border.all(
              color: colors.accentGlow.withValues(alpha: 0.20),
            ),
            boxShadow: [
              BoxShadow(
                color: colors.accent.withValues(alpha: 0.08),
                blurRadius: 16,
                offset: const Offset(0, 4),
              ),
            ],
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                Icons.auto_awesome_rounded,
                size: 15,
                color: colors.accentGlow,
              ),
              const SizedBox(width: 8),
              Text(
                text,
                style: TextStyle(
                  color: colors.textPrimary,
                  fontSize: 14,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ],
          ),
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
    // Flexible markers: with or without colon, optional ## prefix.
    final markerRegex = RegExp(
      r'(?:^|\n)\s*#{0,6}\s*(المصادر|المصدر|Sources?|References?)\s*:?\s*\n',
      multiLine: true,
    );
    final matches = markerRegex.allMatches(raw).toList();
    if (matches.isEmpty) {
      return (raw, const []);
    }
    final match = matches.last;
    final mainText = raw.substring(0, match.start).trimRight();
    final sourcesBlock = raw.substring(match.end);

    // Extract URLs from the whole raw text (main + sources).
    final urlRegex = RegExp(r'https?://[^\s\)\]\>,]+');
    final urlMatches = urlRegex.allMatches(raw);
    final urls = urlMatches
        .map((m) => m.group(0)!)
        .map((u) => u.replaceAll(RegExp(r'[.,;:]+$'), ''))
        .where((u) => u.isNotEmpty)
        .toList();

    // If no URLs found, fall back to non-URL source titles.
    if (urls.isEmpty) {
      final lines = sourcesBlock
          .split('\n')
          .map((l) => l.replaceAll(RegExp(r'^\s*\[\d+\]\s*'), '').trim())
          .where((l) => l.isNotEmpty)
          .take(10)
          .toList();
      return (mainText, lines);
    }

    final seen = <String>{};
    final uniqueUrls = <String>[];
    for (final url in urls) {
      if (seen.add(url)) uniqueUrls.add(url);
    }
    return (mainText, uniqueUrls);
  }

  /// Converts inline [N] references to markdown links pointing
  /// to the actual source URLs so they render as tappable icons.
  String _linkifySourceRefs(String text, List<String> sources) {
    if (sources.isEmpty) {
      // No sources at all → strip [N] markers to keep the text clean.
      return text.replaceAll(RegExp(r'\s*\[(\d+)\]'), '');
    }
    return text.replaceAllMapped(
      RegExp(r'\[(\d+)\](?!\()'),
      (match) {
        final n = int.tryParse(match.group(1)!);
        if (n == null || n < 1 || n > sources.length) {
          return match.group(0)!;
        }
        final source = sources[n - 1];
        if (source.startsWith('http')) {
          return '[${match.group(1)}]($source)';
        }
        // No URL → just remove the marker (title shown in sources list).
        return '[${match.group(1)}](#)';
      },
    );
  }

  // ============================================================
  // IMAGE SEARCH — bubble (grid of Pexels results)
  // ============================================================

  Widget _imageSearchBubble(WeuraColors colors, ChatMessage message) {
    // Loading state
    if (message.isSearching) {
      return Align(
        alignment: Alignment.centerLeft,
        child: Padding(
          padding: const EdgeInsets.only(bottom: 24, right: 8),
          child: Container(
            constraints: BoxConstraints(
              maxWidth: MediaQuery.of(context).size.width * 0.85,
            ),
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: colors.surface,
              borderRadius: BorderRadius.circular(20),
              border: Border.all(
                color: colors.accentGlow.withValues(alpha: 0.30),
              ),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: colors.accentGlow,
                  ),
                ),
                const SizedBox(width: 12),
                Flexible(
                  child: Text(
                    'أبحث عن صور...',
                    style: TextStyle(
                      color: colors.textSecondary,
                      fontSize: 13.5,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      );
    }

    final results = message.searchResults ?? const <Map<String, dynamic>>[];

    if (results.isEmpty) {
      return Align(
        alignment: Alignment.centerLeft,
        child: Padding(
          padding: const EdgeInsets.only(bottom: 24, right: 8),
          child: Text(
            'لم أجد صوراً لهذا البحث. جرّب كلمات أخرى.',
            style: TextStyle(color: colors.textMuted, fontSize: 13.5),
          ),
        ),
      );
    }

    return Align(
      alignment: Alignment.centerLeft,
      child: Padding(
        padding: const EdgeInsets.only(bottom: 24, right: 8),
        child: Container(
          constraints: BoxConstraints(
            maxWidth: MediaQuery.of(context).size.width * 0.90,
          ),
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: colors.surface,
            borderRadius: BorderRadius.circular(20),
            border: Border.all(
              color: colors.accentGlow.withValues(alpha: 0.25),
            ),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Header
              Row(
                children: [
                  Icon(
                    Icons.image_search_rounded,
                    size: 16,
                    color: colors.accentGlow,
                  ),
                  const SizedBox(width: 6),
                  Flexible(
                    child: Text(
                      message.searchQuery ?? 'نتائج البحث',
                      style: TextStyle(
                        color: colors.textPrimary,
                        fontSize: 13.5,
                        fontWeight: FontWeight.w700,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              // Grid
              GridView.builder(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                gridDelegate:
                    const SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: 3,
                  crossAxisSpacing: 6,
                  mainAxisSpacing: 6,
                  childAspectRatio: 1.0,
                ),
                itemCount: results.length,
                itemBuilder: (context, idx) {
                  final img = results[idx];
                  final thumb = (img['thumbnail'] ?? img['preview'] ?? '')
                      .toString();
                  final full = (img['preview'] ??
                          img['full'] ??
                          img['thumbnail'] ??
                          '')
                      .toString();
                  final photographer =
                      (img['photographer'] ?? '').toString();

                  if (thumb.isEmpty) {
                    return Container(
                      decoration: BoxDecoration(
                        color: colors.surfaceAlt,
                        borderRadius: BorderRadius.circular(10),
                      ),
                    );
                  }

                  return GestureDetector(
                    onTap: () => _openImagePreview(
                      full,
                      photographer: photographer,
                      colors: colors,
                    ),
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(10),
                      child: Image.network(
                        thumb,
                        fit: BoxFit.cover,
                        loadingBuilder: (_, child, progress) {
                          if (progress == null) return child;
                          return Container(
                            color: colors.surfaceAlt,
                            child: Center(
                              child: SizedBox(
                                width: 18,
                                height: 18,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                  color: colors.accentGlow,
                                ),
                              ),
                            ),
                          );
                        },
                        errorBuilder: (_, __, ___) => Container(
                          color: colors.surfaceAlt,
                          child: Icon(
                            Icons.broken_image_outlined,
                            size: 22,
                            color: colors.textFaint,
                          ),
                        ),
                      ),
                    ),
                  );
                },
              ),
              const SizedBox(height: 10),
              // Footer
              Row(
                children: [
                  Icon(
                    Icons.photo_library_outlined,
                    size: 13,
                    color: colors.textFaint,
                  ),
                  const SizedBox(width: 5),
                  Text(
                    '${results.length} صورة من Pexels',
                    style: TextStyle(
                      color: colors.textFaint,
                      fontSize: 11.5,
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  /// Full-screen preview when tapping an image.
  void _openImagePreview(
    String url, {
    required String photographer,
    required WeuraColors colors,
  }) {
    if (url.isEmpty) return;

    Navigator.of(context).push(
      PageRouteBuilder(
        opaque: false,
        barrierColor: Colors.black87,
        pageBuilder: (_, __, ___) => Scaffold(
          backgroundColor: Colors.transparent,
          body: GestureDetector(
            onTap: () => Navigator.of(context).pop(),
            child: SafeArea(
              child: Stack(
                children: [
                  Center(
                    child: InteractiveViewer(
                      minScale: 1,
                      maxScale: 4,
                      child: Image.network(
                        url,
                        fit: BoxFit.contain,
                        loadingBuilder: (_, child, progress) {
                          if (progress == null) return child;
                          return const Center(
                            child: CircularProgressIndicator(
                              color: Colors.white,
                            ),
                          );
                        },
                        errorBuilder: (_, __, ___) => const Center(
                          child: Icon(
                            Icons.broken_image_outlined,
                            color: Colors.white54,
                            size: 48,
                          ),
                        ),
                      ),
                    ),
                  ),
                  // Close button
                  Positioned(
                    top: 12,
                    right: 12,
                    child: Material(
                      color: Colors.black54,
                      shape: const CircleBorder(),
                      child: InkWell(
                        onTap: () => Navigator.of(context).pop(),
                        customBorder: const CircleBorder(),
                        child: const Padding(
                          padding: EdgeInsets.all(10),
                          child: Icon(
                            Icons.close_rounded,
                            color: Colors.white,
                            size: 22,
                          ),
                        ),
                      ),
                    ),
                  ),
                  // Photographer credit
                  if (photographer.isNotEmpty)
                    Positioned(
                      bottom: 20,
                      left: 20,
                      right: 20,
                      child: Text(
                        '📷 $photographer  •  Pexels',
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                          color: Colors.white70,
                          fontSize: 12.5,
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ),
        ),
        transitionDuration: const Duration(milliseconds: 220),
      ),
    );
  }

  Widget _messageBubble(
    WeuraColors colors,
    ChatMessage message,
    int index,
    bool isLastAssistant,
  ) {
    // Image search results (Pexels)
    if (message.isSearching || message.searchResults != null) {
      return _imageSearchBubble(colors, message);
    }

    if (message.imageUrl != null || message.isImageLoading) {
      return _imageBubble(colors, message, index);
    }

    if (message.playerData != null) {
      return Align(
        alignment: Alignment.centerLeft,
        child: Padding(
          padding: const EdgeInsets.only(bottom: 24, right: 8),
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
      return _userBubble(colors, message, index);
    }

    return _assistantMessage(colors, message, index, isLastAssistant);
  }

  Future<void> _showUserMessageMenu(int index, WeuraColors colors) async {
    if (index < 0 || index >= _messages.length) return;
    final msg = _messages[index];
    if (!msg.isUser) return;

    await showModalBottomSheet<void>(
      context: context,
      backgroundColor: colors.surfaceAlt,
      showDragHandle: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
      ),
      builder: (sheetCtx) {
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(12, 0, 12, 20),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                _menuTile(
                  colors: colors,
                  icon: Icons.copy_rounded,
                  label: 'نسخ',
                  onTap: () {
                    Navigator.pop(sheetCtx);
                    _copyMessage(msg.text);
                    _showMessage('تم النسخ');
                  },
                ),
                _menuTile(
                  colors: colors,
                  icon: Icons.edit_rounded,
                  label: 'تعديل',
                  onTap: () {
                    Navigator.pop(sheetCtx);
                    _editUserMessage(index, colors);
                  },
                ),
                _menuTile(
                  colors: colors,
                  icon: Icons.share_outlined,
                  label: 'مشاركة',
                  onTap: () {
                    Navigator.pop(sheetCtx);
                    Share.share(msg.text);
                  },
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _menuTile({
    required WeuraColors colors,
    required IconData icon,
    required String label,
    required VoidCallback onTap,
  }) {
    return Material(
      color: Colors.transparent,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 16),
          child: Row(
            children: [
              Icon(icon, color: colors.accentGlow, size: 22),
              const SizedBox(width: 14),
              Text(
                label,
                style: TextStyle(
                  color: colors.textPrimary,
                  fontSize: 15.5,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _userImagesGrid(WeuraColors colors, List<String> paths) {
    final count = paths.length;

    // Single image → show large.
    if (count == 1) {
      return _userImageTile(colors, paths.first, 280, 200);
    }

    // 2 images → side by side, bigger.
    if (count == 2) {
      return Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Flexible(child: _userImageTile(colors, paths[0], 130, 130)),
          const SizedBox(width: 6),
          Flexible(child: _userImageTile(colors, paths[1], 130, 130)),
        ],
      );
    }

    // 3+ images → grid (3 per row).
    return SizedBox(
      width: 280,
      child: Wrap(
        spacing: 6,
        runSpacing: 6,
        children: paths.map((p) {
          return _userImageTile(colors, p, 88, 88);
        }).toList(),
      ),
    );
  }

  Widget _userImageTile(
    WeuraColors colors,
    String path,
    double width,
    double height,
  ) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(12),
      child: Image.file(
        File(path),
        width: width,
        height: height,
        fit: BoxFit.cover,
        errorBuilder: (_, __, ___) => Container(
          width: width,
          height: height,
          decoration: BoxDecoration(
            color: Colors.black.withValues(alpha: 0.15),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Center(
            child: Icon(
              Icons.broken_image_outlined,
              color: colors.userBubbleText.withValues(alpha: 0.7),
              size: 20,
            ),
          ),
        ),
      ),
    );
  }

  Widget _userBubble(
    WeuraColors colors,
    ChatMessage message,
    int index,
  ) {
    final bubbleDirection = _detectDirection(message.text);
    final msgIndex = index;

    return Align(
      alignment: Alignment.centerRight,
      child: GestureDetector(
        onLongPress: msgIndex == -1
            ? null
            : () => _showUserMessageMenu(msgIndex, colors),
        onTap: msgIndex == -1
            ? null
            : () => _showUserMessageMenu(msgIndex, colors),
        child: Padding(
          padding: const EdgeInsets.only(
            bottom: 24,
            left: 40,
            top: 4,
          ),
          child: Container(
            constraints: BoxConstraints(
              maxWidth: MediaQuery.of(context).size.width * 0.82,
            ),
            padding: const EdgeInsets.symmetric(
              horizontal: 20,
              vertical: 16,
            ),
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [
                  colors.userBubble,
                  colors.userBubble.withValues(alpha: 0.88),
                ],
              ),
              borderRadius: const BorderRadius.only(
                topLeft: Radius.circular(24),
                topRight: Radius.circular(24),
                bottomLeft: Radius.circular(24),
                bottomRight: Radius.circular(6),
              ),
              boxShadow: [
                BoxShadow(
                  color: colors.userBubble.withValues(alpha: 0.28),
                  blurRadius: 22,
                  offset: const Offset(0, 8),
                ),
              ],
            ),
            child: Directionality(
              textDirection: bubbleDirection,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if ((message.visionImagePaths?.isNotEmpty ?? false)) ...[
                    _userImagesGrid(
                      colors,
                      message.visionImagePaths!,
                    ),
                    if (message.text.trim().isNotEmpty)
                      const SizedBox(height: 10),
                  ],
                  if (message.text.trim().isNotEmpty)

                    CollapsibleUserText(

                      text: message.text,

                      colors: colors,

                    ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }



  // Renders images inside Markdown for the assistant message body.
  Widget _buildMarkdownImage(
      WeuraColors colors, Uri uri, String? title, String? alt) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 12),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(14),
        child: Image.network(
          uri.toString(),
          fit: BoxFit.cover,
          loadingBuilder: (_, child, progress) {
            if (progress == null) return child;
            return Container(
              height: 200,
              color: colors.surfaceAlt,
              child: Center(
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  color: colors.accentGlow,
                ),
              ),
            );
          },
          errorBuilder: (_, __, ___) => Container(
            height: 120,
            color: colors.surfaceAlt,
            child: Center(
              child: Icon(
                Icons.broken_image_outlined,
                color: colors.textFaint,
                size: 32,
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _assistantMessage(
    WeuraColors colors,
    ChatMessage message,
    int index,
    bool isLastAssistant,
  ) {
    final bubbleDirection = _detectDirection(message.text);
    final parsed = !message.isError
        ? _splitSources(message.text)
        : (message.text, const <String>[]);
    final mainText = parsed.$1;
    final sources = parsed.$2;

    final linkedText = sources.isNotEmpty
        ? _linkifySourceRefs(mainText, sources)
        : mainText;

    final isTyping = _typingIndices.contains(index);

    return Container(
      margin: const EdgeInsets.only(bottom: 32, right: 8, top: 6),
      child: Directionality(
        textDirection: bubbleDirection,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (message.isError)
              _errorMessage(colors, mainText)
            else if (isTyping)
              TypedMarkdown(
                fullText: linkedText,
                styleSheet: _markdownStyle(colors),
                builders: {
                  'code': CodeBlockBuilder(colors: colors),
                  'a': SourceLinkBuilder(
                    colors: colors,
                    onTap: (url) { _openUrl(url); },
                  ),
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
                data: linkedText,
                selectable: true,
                styleSheet: _markdownStyle(colors),
                builders: {
                  'code': CodeBlockBuilder(colors: colors),
                  'a': SourceLinkBuilder(
                    colors: colors,
                    onTap: (url) { _openUrl(url); },
                  ),
                },
                imageBuilder: (uri, title, alt) =>
                    _buildMarkdownImage(colors, uri, title, alt),
              ),

            if (sources.isNotEmpty && !isTyping)
              Padding(
                padding: const EdgeInsets.only(top: 18),
                child: _sourcesSection(colors, sources),
              ),

            if (!message.isError && !isTyping)
              Padding(
                padding: const EdgeInsets.only(top: 14),
                child: _actionBar(
                  colors,
                  message,
                  index,
                  isLastAssistant,
                ),
              ),

            if (message.isError)
              Padding(
                padding: const EdgeInsets.only(top: 14),
                child: GestureDetector(
                  onTap: _retryLastMessage,
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(
                        Icons.refresh_rounded,
                        size: 18,
                        color: colors.accentGlow,
                      ),
                      const SizedBox(width: 6),
                      Text(
                        'Retry',
                        style: TextStyle(
                          color: colors.accentGlow,
                          fontSize: 13.5,
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
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: colors.danger.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: colors.danger.withValues(alpha: 0.25),
        ),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.only(top: 2, right: 10),
            child: Icon(
              Icons.warning_amber_rounded,
              size: 20,
              color: colors.danger,
            ),
          ),
          Expanded(
            child: Text(
              text,
              style: TextStyle(
                color: colors.danger,
                fontSize: 15.5,
                height: 1.65,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _imageBubble(
    WeuraColors colors,
    ChatMessage message,
    int index,
  ) {
    final isLoading = message.isImageLoading;
    final hasLocal = message.imageLocalPath != null &&
        File(message.imageLocalPath!).existsSync();

    return Align(
      alignment: Alignment.centerLeft,
      child: Container(
        constraints: const BoxConstraints(maxWidth: 650),
        margin: const EdgeInsets.only(bottom: 24, right: 8, top: 6),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (message.imagePrompt != null &&
                message.imagePrompt!.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(left: 2, bottom: 12),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(
                      width: 24,
                      height: 24,
                      decoration: BoxDecoration(
                        color: colors.accentSoft,
                        borderRadius: BorderRadius.circular(7),
                      ),
                      child: Icon(
                        Icons.image_outlined,
                        size: 15,
                        color: colors.accentGlow,
                      ),
                    ),
                    const SizedBox(width: 8),
                    Flexible(
                      child: Text(
                        message.imagePrompt!,
                        style: TextStyle(
                          color: colors.textSecondary,
                          fontSize: 14,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            if (isLoading)
              ClipRRect(
                borderRadius: BorderRadius.circular(20),
                child: Container(
                  width: 320,
                  height: 320,
                  decoration: BoxDecoration(
                    color: colors.surface,
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(color: colors.border),
                  ),
                  child: ImageGeneratingLoader(colors: colors),
                ),
              )
            else if (hasLocal)
              GestureDetector(
                onTap: () => _openImageZoom(
                  message.imageUrl ?? '',
                  localPath: message.imageLocalPath,
                ),
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(20),
                  child: Container(
                    width: 320,
                    height: 320,
                    decoration: BoxDecoration(
                      color: colors.surface,
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(color: colors.border),
                      boxShadow: [
                        BoxShadow(
                          color: Colors.black.withValues(alpha: 0.08),
                          blurRadius: 28,
                          offset: const Offset(0, 10),
                        ),
                      ],
                    ),
                    child: Image.file(
                      File(message.imageLocalPath!),
                      width: 320,
                      height: 320,
                      fit: BoxFit.cover,
                      errorBuilder: (_, __, ___) => Container(
                        width: 320,
                        height: 320,
                        alignment: Alignment.center,
                        child: Icon(
                          Icons.broken_image_outlined,
                          size: 52,
                          color: colors.danger,
                        ),
                      ),
                    ),
                  ),
                ),
              )
            else
              ClipRRect(
                borderRadius: BorderRadius.circular(20),
                child: Container(
                  width: 320,
                  height: 320,
                  decoration: BoxDecoration(
                    color: colors.surface,
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(color: colors.border),
                  ),
                  alignment: Alignment.center,
                  child: Text(
                    'الصورة غير متوفرة',
                    style: TextStyle(
                      color: colors.textMuted,
                      fontSize: 13,
                    ),
                  ),
                ),
              ),

            if (!isLoading && hasLocal)
              Padding(
                padding: const EdgeInsets.only(top: 10),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    _actionIcon(
                      colors: colors,
                      icon: Icons.save_alt_rounded,
                      tooltip: 'Save to gallery',
                      onPressed: () => _saveImageToGallery(
                        message.imageUrl ?? '',
                        localPath: message.imageLocalPath,
                      ),
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
                      onPressed: () => _openImageZoom(
                        message.imageUrl ?? '',
                        localPath: message.imageLocalPath,
                      ),
                    ),
                    _actionIcon(
                      colors: colors,
                      icon: Icons.refresh_rounded,
                      tooltip: 'Regenerate',
                      onPressed: () => _regenerateImage(index),
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
          padding: const EdgeInsets.only(left: 2, bottom: 10),
          child: Text(
            'المصادر',
            style: TextStyle(
              color: colors.textMuted,
              fontSize: 12,
              fontWeight: FontWeight.w700,
              letterSpacing: 1.2,
            ),
          ),
        ),
        ...urls.asMap().entries.map((entry) {
          return Padding(
            padding: const EdgeInsets.only(bottom: 8),
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
    final displayDomain = domain.startsWith('www.')
        ? domain.substring(4)
        : domain;
    final type = _domainType(displayDomain);
    final (icon, baseColor) = _iconForType(type);
    final shortPath = path.length > 30 ? '${path.substring(0, 30)}...' : path;

    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Material(
        color: Colors.transparent,
        borderRadius: BorderRadius.circular(14),
        child: InkWell(
          borderRadius: BorderRadius.circular(14),
          onTap: () => _openUrl(url),
          onLongPress: () => _copyMessage(url),
          child: Container(
            padding: const EdgeInsets.fromLTRB(12, 10, 10, 10),
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [baseColor.withValues(alpha: 0.08), colors.surface],
              ),
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: baseColor.withValues(alpha: 0.25)),
            ),
            child: Row(
              children: [
                Stack(
                  clipBehavior: Clip.none,
                  children: [
                    Container(
                      width: 44,
                      height: 44,
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          begin: Alignment.topLeft,
                          end: Alignment.bottomRight,
                          colors: [
                            baseColor.withValues(alpha: 0.22),
                            baseColor.withValues(alpha: 0.10),
                          ],
                        ),
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: baseColor.withValues(alpha: 0.35)),
                      ),
                      child: Icon(icon, color: baseColor, size: 22),
                    ),
                    Positioned(
                      top: -4,
                      right: -4,
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                        decoration: BoxDecoration(
                          color: baseColor,
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(color: colors.background, width: 1.5),
                        ),
                        child: Text(
                          '$index',
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 10,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Flexible(
                            child: Text(
                              displayDomain,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(
                                color: colors.textPrimary,
                                fontSize: 14,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ),
                          const SizedBox(width: 6),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                            decoration: BoxDecoration(
                              color: baseColor.withValues(alpha: 0.15),
                              borderRadius: BorderRadius.circular(5),
                            ),
                            child: Text(
                              type,
                              style: TextStyle(
                                color: baseColor,
                                fontSize: 9.5,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ),
                        ],
                      ),
                      if (shortPath.isNotEmpty && shortPath != '/') ...[
                        const SizedBox(height: 3),
                        Text(
                          shortPath,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            color: colors.textMuted,
                            fontSize: 11.5,
                            height: 1.2,
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                Container(
                  width: 30,
                  height: 30,
                  decoration: BoxDecoration(
                    color: baseColor.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(9),
                  ),
                  child: Icon(Icons.arrow_outward_rounded, size: 16, color: baseColor),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  String _domainType(String domain) {
    final d = domain.toLowerCase();
    if (d.contains('wikipedia') || d.contains('wiki')) return 'wiki';
    if (d.contains('reuters') || d.contains('apnews') || d.contains('bbc') ||
        d.contains('cnn') || d.contains('aljazeera') || d.contains('guardian') ||
        d.contains('nytimes') || d.contains('france24') || d.contains('lemonde')) return 'news';
    if (d.endsWith('.gov') || d.contains('gov.') || d.contains('who.int') ||
        d.contains('un.org') || d.contains('nasa.gov') || d.contains('unicef')) return 'official';
    if (d.contains('statista') || d.contains('worldbank') || d.contains('ourworldindata') ||
        d.contains('worldometers') || d.contains('census')) return 'stats';
    if (d.contains('youtube') || d.contains('vimeo') || d.contains('dailymotion')) return 'video';
    if (d.contains('nature.com') || d.contains('science.org') || d.contains('pubmed') ||
        d.contains('ncbi') || d.contains('thelancet') || d.contains('nejm') ||
        d.contains('arxiv') || d.contains('doi.org')) return 'science';
    if (d.contains('github') || d.contains('stackoverflow') || d.contains('medium.com') ||
        d.contains('dev.to')) return 'tech';
    if (d.contains('britannica') || d.contains('britishmuseum') || d.contains('louvre')) return 'ref';
    return 'other';
  }

  (IconData, Color) _iconForType(String type) {
    switch (type) {
      case 'wiki': return (Icons.menu_book_rounded, const Color(0xFF7E8CA0));
      case 'news': return (Icons.newspaper_rounded, const Color(0xFFE05252));
      case 'official': return (Icons.account_balance_rounded, const Color(0xFF4A7FE0));
      case 'stats': return (Icons.bar_chart_rounded, const Color(0xFF3BA776));
      case 'video': return (Icons.play_circle_fill_rounded, const Color(0xFFE53935));
      case 'science': return (Icons.science_rounded, const Color(0xFF8E5BD6));
      case 'tech': return (Icons.code_rounded, const Color(0xFFE08F3A));
      case 'ref': return (Icons.library_books_rounded, const Color(0xFFB89968));
      default: return (Icons.language_rounded, const Color(0xFF8E8E93));
    }
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
    ChatMessage message,
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
          borderRadius: BorderRadius.circular(9),
          child: Tooltip(
            message: tooltip,
            child: Padding(
              padding: const EdgeInsets.all(8),
              child: Icon(icon, size: 19, color: color),
            ),
          ),
        ),
      ),
    );
  }

  MarkdownStyleSheet _markdownStyle(WeuraColors colors) {
    return MarkdownStyleSheet(
      p: GoogleFonts.inter(
        color: colors.textPrimary,
        fontSize: 17,
        height: 1.85,
        letterSpacing: 0.15,
      ),
      h1: GoogleFonts.inter(
        color: colors.textPrimary,
        fontSize: 28,
        fontWeight: FontWeight.w800,
        height: 1.4,
        letterSpacing: -0.5,
      ),
      h2: GoogleFonts.inter(
        color: colors.textPrimary,
        fontSize: 23,
        fontWeight: FontWeight.w700,
        height: 1.45,
        letterSpacing: -0.3,
      ),
      h3: GoogleFonts.inter(
        color: colors.textPrimary,
        fontSize: 19.5,
        fontWeight: FontWeight.w700,
        height: 1.5,
      ),
      strong: TextStyle(
        color: colors.textPrimary,
        fontWeight: FontWeight.w800,
      ),
      em: TextStyle(
        color: colors.textPrimary,
        fontStyle: FontStyle.italic,
      ),
      a: TextStyle(
        color: colors.accentGlow,
        decoration: TextDecoration.underline,
        decorationColor: colors.accentGlow.withValues(alpha: 0.5),
      ),
      code: TextStyle(
        color: colors.accentGlow,
        backgroundColor: colors.surface,
        fontFamily: 'monospace',
        fontSize: 15,
      ),
      codeblockDecoration: const BoxDecoration(color: Colors.transparent),
      codeblockPadding: EdgeInsets.zero,
      blockquote: TextStyle(
        color: colors.textSecondary,
        fontSize: 16.5,
        fontStyle: FontStyle.italic,
        height: 1.85,
      ),
      blockquoteDecoration: BoxDecoration(
        color: colors.accentSoft,
        border: Border(
          left: BorderSide(color: colors.accentGlow, width: 3.5),
        ),
        borderRadius: BorderRadius.circular(6),
      ),
      blockquotePadding: const EdgeInsets.fromLTRB(18, 14, 18, 14),
      listBullet: TextStyle(
        color: colors.textPrimary,
        fontSize: 17,
        height: 1.85,
      ),
      listIndent: 26,
      horizontalRuleDecoration: BoxDecoration(
        border: Border(
          top: BorderSide(color: colors.borderStrong),
        ),
      ),
      tableHead: TextStyle(
        color: colors.textPrimary,
        fontWeight: FontWeight.w700,
        fontSize: 15.5,
      ),
      tableBody: TextStyle(
        color: colors.textSecondary,
        fontSize: 15,
      ),
      tableBorder: TableBorder.all(color: colors.borderStrong),
      tableCellsPadding: const EdgeInsets.all(12),
    );
  }
}

// ---------------------------------------------------------------------------
// Typing markdown
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Code block builder
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Image Zoom Viewer
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Image generating loader
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Thinking indicator — cinematic animation
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Football thinking indicator — cinematic animation (English only)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Cinematic chat background — aurora + stars + glow + vignette
// (Theme-aware, performance-optimized: 40 stars, 2 aurora blobs, no grid)
// ---------------------------------------------------------------------------

