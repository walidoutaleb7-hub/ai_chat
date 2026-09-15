import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_markdown_plus/flutter_markdown_plus.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:gal/gal.dart';
import 'package:http/http.dart' as http;
import 'package:share_plus/share_plus.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../components/Composer/comppser.dart';
import '../../components/Voice/voice_input_sheet.dart';
import '../../core/AI/ai_router.dart';
import '../../core/History/chat_history.dart';
import '../../core/Memory/memory_manager.dart';
import '../../core/Settings/app_settings.dart';
import '../../core/Theme/weura_theme.dart';
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
  });

  final String text;
  final bool isUser;
  final bool isError;
  final String? imageUrl;
  final String? imagePrompt;
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

  late final GrokService _grok;

  final List<_ChatMessage> _messages = [];
  final Map<int, String> _ratings = {};

  AIMode _mode = AIMode.auto;
  bool _isLoading = false;
  bool _requestCancelled = false;
  ChatSession? _session;

  static const String _serverUrl =
      'https://ai-chat-tlol.onrender.com';
  static const String _feedbackKey = 'weura_message_feedback';

  @override
  void initState() {
    super.initState();
    _grok = GrokService(baseUrl: _serverUrl);
    _initialize();
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
        throw Exception(
          'Download failed: HTTP ${response.statusCode}',
        );
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
      if (mounted) setState(() {});
      return;
    }
    setState(() {});
    await _voiceOut.speak(id: id, text: text);
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    _scrollController.dispose();
    _grok.dispose();
    _voiceOut.stop();
    super.dispose();
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
      if (msg.text.trim().isEmpty && msg.imageUrl == null) continue;
      session.messages.add(
        ChatMessageData(
          text: msg.imageUrl != null
              ? '🖼️ ${msg.imagePrompt ?? ''}'
              : msg.text,
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

  /// Cloudflare Workers AI only accepts `prompt`. No width/height/seed.
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
  // Send
  // ---------------------------------------------------------------------------

  Future<void> _sendMessage(String text) async {
    if (_isLoading) return;

    final message = text.trim();
    if (message.isEmpty) return;

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
      final settings = AppSettingsManager.instance;
      final baseSystem = _router.systemPromptFor(resolvedMode);
      final languagePrompt = settings.languagePrompt();
      final detailPrompt = settings.responseDetailPrompt();

      final combinedSystem = [
        baseSystem,
        if (languagePrompt.isNotEmpty) languagePrompt,
        if (detailPrompt.isNotEmpty) detailPrompt,
      ].join('\n\n');

      final memoryContext =
          _memory.buildRelevantContext(message, maxItems: 3);

      final conversation = <GrokMessage>[
        GrokMessage(role: 'system', content: combinedSystem),
      ];

      if (memoryContext.isNotEmpty) {
        conversation.add(
          GrokMessage(
            role: 'system',
            content:
                'Relevant memory about the user:\n'
                '$memoryContext\n\n'
                'Use this information only when it is directly '
                'relevant to the current request.',
          ),
        );
      }

      final recent = _messages
          .where((m) => !m.isError && m.imageUrl == null)
          .where((m) => m.text.trim().isNotEmpty)
          .toList();

      final trimmed = recent.length > 8
          ? recent.sublist(recent.length - 8)
          : recent;

      conversation.addAll(
        trimmed.map(
          (m) => GrokMessage(
            role: m.isUser ? 'user' : 'assistant',
            content: m.text,
          ),
        ),
      );

      final result = await _grok.sendMessage(messages: conversation);

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
        });
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

    setState(() {});
    _sendMessage(userText);
  }

  void _retryLastMessage() {
    if (_isLoading || _messages.isEmpty) return;

    final userMessages =
        _messages.where((m) => m.isUser).toList();
    if (userMessages.isEmpty) return;

    _messages.removeWhere((m) => !m.isUser && m.isError);
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
                  subtitle: 'Choose an image',
                  onTap: () {
                    Navigator.pop(sheetContext);
                    _showMessage(
                      'Image tools will be connected in the Vision step.',
                    );
                  },
                ),
                _attachmentOption(
                  colors: colors,
                  asset: 'assets/icons/camera.svg',
                  title: 'Camera',
                  subtitle: 'Capture an image',
                  onTap: () {
                    Navigator.pop(sheetContext);
                    _showMessage(
                      'Camera tools will be connected in the Vision step.',
                    );
                  },
                ),
                _attachmentOption(
                  colors: colors,
                  asset: 'assets/icons/file.svg',
                  title: 'Files',
                  subtitle: 'PDF, DOCX, XLSX, TXT, CSV',
                  onTap: () {
                    Navigator.pop(sheetContext);
                    _showMessage(
                      'File tools will be connected in the Files step.',
                    );
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
                    padding: const EdgeInsets.fromLTRB(16, 20, 16, 20),
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

  Widget _messageBubble(
    WeuraColors colors,
    _ChatMessage message,
    int index,
    bool isLastAssistant,
  ) {
    if (message.imageUrl != null) {
      return _imageBubble(colors, message, index);
    }

    final alignment =
        message.isUser ? Alignment.centerRight : Alignment.centerLeft;
    final background =
        message.isUser ? colors.userBubble : colors.surfaceAlt;
    final bubbleDirection = _detectDirection(message.text);
    final parsed = (!message.isUser && !message.isError)
        ? _splitSources(message.text)
        : (message.text, const <String>[]);
    final mainText = parsed.$1;
    final sources = parsed.$2;

    return Align(
      alignment: alignment,
      child: Container(
        constraints: const BoxConstraints(maxWidth: 650),
        margin: const EdgeInsets.only(bottom: 12),
        child: Column(
          crossAxisAlignment: message.isUser
              ? CrossAxisAlignment.end
              : CrossAxisAlignment.start,
          children: [
            Container(
              padding: const EdgeInsets.symmetric(
                horizontal: 16,
                vertical: 13,
              ),
              decoration: BoxDecoration(
                color: background,
                borderRadius: BorderRadius.circular(18),
                border: message.isUser
                    ? null
                    : Border.all(
                        color: message.isError
                            ? colors.danger.withValues(alpha: 0.35)
                            : colors.border,
                      ),
              ),
              child: Directionality(
                textDirection: bubbleDirection,
                child: message.isUser
                    ? SelectableText(
                        message.text,
                        style: TextStyle(
                          color: colors.userBubbleText,
                          fontSize: 15.5,
                          height: 1.5,
                        ),
                      )
                    : MarkdownBody(
                        data: mainText,
                        selectable: true,
                        styleSheet: _markdownStyle(colors),
                      ),
              ),
            ),
            if (sources.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 10),
                child: _sourcesSection(colors, sources),
              ),
            if (!message.isUser && !message.isError)
              Padding(
                padding: const EdgeInsets.only(top: 6),
                child: _actionBar(
                  colors,
                  message,
                  index,
                  isLastAssistant,
                ),
              ),
            if (message.isError)
              Padding(
                padding: const EdgeInsets.only(top: 10),
                child: GestureDetector(
                  onTap: _retryLastMessage,
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      SvgPicture.asset(
                        'assets/icons/history.svg',
                        width: 18,
                        height: 18,
                      ),
                      const SizedBox(width: 7),
                      Text(
                        'Retry',
                        style: TextStyle(
                          color: colors.accentGlow,
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

  Widget _imageBubble(
    WeuraColors colors,
    _ChatMessage message,
    int index,
  ) {
    return Align(
      alignment: Alignment.centerLeft,
      child: Container(
        constraints: const BoxConstraints(maxWidth: 650),
        margin: const EdgeInsets.only(bottom: 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (message.imagePrompt != null &&
                message.imagePrompt!.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(left: 4, bottom: 8),
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
            ClipRRect(
              borderRadius: BorderRadius.circular(16),
              child: Container(
                width: 340,
                height: 340,
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
          padding: const EdgeInsets.only(left: 4, bottom: 6),
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
        height: 1.55,
      ),
      h1: TextStyle(
        color: colors.textPrimary,
        fontSize: 22,
        fontWeight: FontWeight.w700,
        height: 1.4,
      ),
      h2: TextStyle(
        color: colors.textPrimary,
        fontSize: 19,
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
      codeblockDecoration: BoxDecoration(
        color: colors.surfaceElevated,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: colors.border),
      ),
      codeblockPadding: const EdgeInsets.all(14),
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
        height: 1.55,
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
// Image loading
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
      width: 340,
      height: 340,
      fit: BoxFit.cover,
      loadingBuilder: (context, child, progress) {
        if (progress == null) return child;
        return _ImageGeneratingLoader(colors: colors);
      },
      errorBuilder: (context, error, stackTrace) {
        return Container(
          width: 340,
          height: 340,
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
      width: 340,
      height: 340,
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: colors.surfaceAlt,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          SizedBox(
            width: 180,
            height: 180,
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
          const SizedBox(height: 24),
          Text(
            'Creating your image',
            style: TextStyle(
              color: colors.textPrimary,
              fontSize: 15,
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
          const SizedBox(height: 18),
          SizedBox(
            width: 180,
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
                                colors.accentGlow.withValues(alpha: 0.0),
                                colors.accentGlow,
                                colors.accentGlow.withValues(alpha: 0.0),
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
      Offset(center.dx - baseRadius * 0.08, center.dy - baseRadius * 0.08),
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
