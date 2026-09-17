import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

import '../../core/History/chat_history.dart';
import '../../core/Settings/app_settings.dart';
import '../../core/Theme/weura_theme.dart';
import '../Chat/chat.dart';

class HistoryScreen extends StatefulWidget {
  const HistoryScreen({super.key});

  @override
  State<HistoryScreen> createState() => _HistoryScreenState();
}

class _HistoryScreenState extends State<HistoryScreen> {
  final HistoryManager _manager = HistoryManager();
  final TextEditingController _searchController = TextEditingController();

  bool _isLoading = true;
  String _search = '';

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  bool get _isArabic =>
      AppSettingsManager.instance.language == 'Arabic';

  String _t(String en, String ar) => _isArabic ? ar : en;

  Future<void> _load() async {
    await _manager.load();
    if (!mounted) return;
    setState(() => _isLoading = false);
  }

  List<ChatSession> get _filteredChats => _manager.search(_search);

  Future<void> _openChat(ChatSession chat) async {
    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => ChatScreen(sessionId: chat.id),
      ),
    );
    if (!mounted) return;
    await _load();
  }

  Future<void> _confirmDelete(ChatSession chat, WeuraColors colors) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) {
        return AlertDialog(
          backgroundColor: colors.surfaceAlt,
          title: Text(
            _t('Delete chat?', 'حذف المحادثة؟'),
            style: TextStyle(color: colors.textPrimary),
          ),
          content: Text(
            _t(
              'This conversation will be removed from history.',
              'سيتم إزالة هذه المحادثة من السجل.',
            ),
            style: TextStyle(color: colors.textSecondary),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogContext, false),
              child: Text(_t('Cancel', 'إلغاء')),
            ),
            TextButton(
              onPressed: () => Navigator.pop(dialogContext, true),
              child: Text(
                _t('Delete', 'حذف'),
                style: TextStyle(color: colors.danger),
              ),
            ),
          ],
        );
      },
    );

    if (confirmed != true) return;
    await _manager.delete(chat.id);
    if (mounted) setState(() {});
  }

  Future<void> _renameChat(ChatSession chat, WeuraColors colors) async {
    final controller = TextEditingController(text: chat.title);

    final result = await showDialog<String>(
      context: context,
      builder: (dialogContext) {
        return AlertDialog(
          backgroundColor: colors.surfaceAlt,
          title: Text(
            _t('Rename chat', 'إعادة تسمية'),
            style: TextStyle(color: colors.textPrimary),
          ),
          content: TextField(
            controller: controller,
            autofocus: true,
            maxLength: 60,
            style: TextStyle(color: colors.textPrimary),
            decoration: InputDecoration(
              hintText: _t('Chat name', 'اسم المحادثة'),
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
              child: Text(_t('Cancel', 'إلغاء')),
            ),
            TextButton(
              onPressed: () =>
                  Navigator.pop(dialogContext, controller.text),
              child: Text(_t('Save', 'حفظ')),
            ),
          ],
        );
      },
    );

    if (result == null) return;
    final title = result.trim();
    if (title.isEmpty) return;

    await _manager.rename(chat.id, title);
    if (mounted) setState(() {});
  }

  Future<void> _deleteAll(WeuraColors colors) async {
    if (_manager.sessions.isEmpty) return;

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) {
        return AlertDialog(
          backgroundColor: colors.surfaceAlt,
          title: Text(
            _t('Delete all chats?', 'حذف كل المحادثات؟'),
            style: TextStyle(color: colors.textPrimary),
          ),
          content: Text(
            _t(
              'This will remove all conversations from this history.',
              'سيتم إزالة كل المحادثات من السجل.',
            ),
            style: TextStyle(color: colors.textSecondary),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogContext, false),
              child: Text(_t('Cancel', 'إلغاء')),
            ),
            TextButton(
              onPressed: () => Navigator.pop(dialogContext, true),
              child: Text(
                _t('Delete all', 'حذف الكل'),
                style: TextStyle(color: colors.danger),
              ),
            ),
          ],
        );
      },
    );

    if (confirmed != true) return;
    await _manager.clear();
    if (mounted) setState(() {});
  }

  String _formatDate(DateTime date) {
    final now = DateTime.now();

    if (date.year == now.year &&
        date.month == now.month &&
        date.day == now.day) {
      return _t('Today', 'اليوم');
    }

    final yesterday = now.subtract(const Duration(days: 1));

    if (date.year == yesterday.year &&
        date.month == yesterday.month &&
        date.day == yesterday.day) {
      return _t('Yesterday', 'أمس');
    }

    return '${date.day}/${date.month}/${date.year}';
  }

  @override
  Widget build(BuildContext context) {
    final colors = WeuraColors.of(context);
    final chats = _filteredChats;

    return Scaffold(
      backgroundColor: colors.background,
      appBar: AppBar(
        backgroundColor: colors.background,
        elevation: 0,
        leading: IconButton(
          tooltip: _t('Back', 'رجوع'),
          onPressed: () => Navigator.pop(context),
          icon: SvgPicture.asset(
            'assets/icons/back.svg',
            width: 23,
            height: 23,
          ),
        ),
        title: Text(
          _t('History', 'السجل'),
          style: TextStyle(
            color: colors.textPrimary,
            fontWeight: FontWeight.w700,
          ),
        ),
        actions: [
          if (_manager.sessions.isNotEmpty)
            IconButton(
              tooltip: _t('Delete all', 'حذف الكل'),
              onPressed: () => _deleteAll(colors),
              icon: SvgPicture.asset(
                'assets/icons/close.svg',
                width: 22,
                height: 22,
              ),
            ),
        ],
      ),
      body: _isLoading
          ? Center(
              child: SizedBox(
                width: 28,
                height: 28,
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  color: colors.accentGlow,
                ),
              ),
            )
          : Column(
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
                  child: TextField(
                    controller: _searchController,
                    onChanged: (value) {
                      setState(() => _search = value);
                    },
                    style: TextStyle(color: colors.textPrimary),
                    decoration: InputDecoration(
                      hintText: _t(
                        'Search conversations...',
                        'ابحث في المحادثات...',
                      ),
                      hintStyle: TextStyle(color: colors.textFaint),
                      prefixIcon: Padding(
                        padding: const EdgeInsets.all(12),
                        child: SvgPicture.asset(
                          'assets/icons/search.svg',
                          width: 20,
                          height: 20,
                        ),
                      ),
                      suffixIcon: _search.isNotEmpty
                          ? IconButton(
                              onPressed: () {
                                _searchController.clear();
                                setState(() => _search = '');
                              },
                              icon: SvgPicture.asset(
                                'assets/icons/close.svg',
                                width: 18,
                                height: 18,
                              ),
                            )
                          : null,
                      filled: true,
                      fillColor: colors.surface,
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(16),
                        borderSide: BorderSide.none,
                      ),
                    ),
                  ),
                ),
                Expanded(
                  child: chats.isEmpty
                      ? _emptyState(colors)
                      : ListView.separated(
                          padding: const EdgeInsets.fromLTRB(
                            16,
                            4,
                            16,
                            24,
                          ),
                          itemCount: chats.length,
                          separatorBuilder: (_, __) =>
                              const SizedBox(height: 8),
                          itemBuilder: (context, index) {
                            return _chatTile(colors, chats[index]);
                          },
                        ),
                ),
              ],
            ),
    );
  }

  Widget _chatTile(WeuraColors colors, ChatSession chat) {
    final count = chat.messageCount;
    final dateLabel = _formatDate(chat.updatedAt);

    return Material(
      color: colors.surface,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: () => _openChat(chat),
        child: Padding(
          padding: const EdgeInsets.all(15),
          child: Row(
            children: [
              Container(
                width: 42,
                height: 42,
                decoration: BoxDecoration(
                  color: colors.accentSoft,
                  borderRadius: BorderRadius.circular(13),
                ),
                child: Padding(
                  padding: const EdgeInsets.all(11),
                  child: SvgPicture.asset(
                    'assets/icons/history.svg',
                  ),
                ),
              ),
              const SizedBox(width: 13),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      chat.title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        color: colors.textPrimary,
                        fontSize: 15,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 5),
                    Row(
                      children: [
                        Text(
                          dateLabel,
                          style: TextStyle(
                            color: colors.textMuted,
                            fontSize: 12,
                          ),
                        ),
                        if (count > 0) ...[
                          Text(
                            ' • ',
                            style: TextStyle(
                              color: colors.textFaint,
                              fontSize: 12,
                            ),
                          ),
                          Text(
                            _t('$count messages', '$count رسالة'),
                            style: TextStyle(
                              color: colors.textMuted,
                              fontSize: 12,
                            ),
                          ),
                        ],
                      ],
                    ),
                  ],
                ),
              ),
              PopupMenuButton<String>(
                color: colors.surfaceAlt,
                icon: Icon(
                  Icons.more_vert,
                  color: colors.textMuted,
                ),
                onSelected: (value) {
                  if (value == 'rename') {
                    _renameChat(chat, colors);
                  } else if (value == 'delete') {
                    _confirmDelete(chat, colors);
                  }
                },
                itemBuilder: (_) => [
                  PopupMenuItem(
                    value: 'rename',
                    child: Text(
                      _t('Rename', 'إعادة تسمية'),
                      style: TextStyle(color: colors.textPrimary),
                    ),
                  ),
                  PopupMenuItem(
                    value: 'delete',
                    child: Text(
                      _t('Delete', 'حذف'),
                      style: TextStyle(color: colors.danger),
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

  Widget _emptyState(WeuraColors colors) {
    final isSearching = _search.trim().isNotEmpty;

    return Center(
      child: Padding(
        padding: const EdgeInsets.all(30),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Opacity(
              opacity: 0.3,
              child: SvgPicture.asset(
                'assets/icons/history.svg',
                width: 55,
                height: 55,
              ),
            ),
            const SizedBox(height: 18),
            Text(
              isSearching
                  ? _t('No results found', 'لا توجد نتائج')
                  : _t('No conversations yet', 'لا توجد محادثات بعد'),
              style: TextStyle(
                color: colors.textPrimary,
                fontSize: 19,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              isSearching
                  ? _t(
                      'Try a different search term.',
                      'جرب كلمة بحث أخرى.',
                    )
                  : _t(
                      'Your conversations will appear here.',
                      'ستظهر محادثاتك هنا.',
                    ),
              textAlign: TextAlign.center,
              style: TextStyle(
                color: colors.textMuted,
                fontSize: 14,
              ),
            ),
          ],
        ),
      ),
    );
  }
}