import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

import '../../core/History/chat_history.dart';
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

  Future<void> _deleteChat(ChatSession chat) async {
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
            'Rename chat',
            style: TextStyle(color: colors.textPrimary),
          ),
          content: TextField(
            controller: controller,
            autofocus: true,
            style: TextStyle(color: colors.textPrimary),
            decoration: InputDecoration(
              hintText: 'Chat name',
              hintStyle: TextStyle(color: colors.textFaint),
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogContext),
              child: const Text('Cancel'),
            ),
            TextButton(
              onPressed: () => Navigator.pop(dialogContext, controller.text),
              child: const Text('Save'),
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
            'Delete all chats?',
            style: TextStyle(color: colors.textPrimary),
          ),
          content: Text(
            'This will remove all conversations from this history.',
            style: TextStyle(color: colors.textSecondary),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogContext, false),
              child: const Text('Cancel'),
            ),
            TextButton(
              onPressed: () => Navigator.pop(dialogContext, true),
              child: Text(
                'Delete all',
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
      return 'Today';
    }

    final yesterday = now.subtract(const Duration(days: 1));

    if (date.year == yesterday.year &&
        date.month == yesterday.month &&
        date.day == yesterday.day) {
      return 'Yesterday';
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
          tooltip: 'Back',
          onPressed: () => Navigator.pop(context),
          icon: SvgPicture.asset(
            'assets/icons/back.svg',
            width: 23,
            height: 23,
          ),
        ),
        title: Text(
          'History',
          style: TextStyle(
            color: colors.textPrimary,
            fontWeight: FontWeight.w700,
          ),
        ),
        actions: [
          if (_manager.sessions.isNotEmpty)
            IconButton(
              tooltip: 'Delete all',
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
                      hintText: 'Search conversations...',
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
                    'assets/icons/mode.svg',
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
                    Text(
                      _formatDate(chat.updatedAt),
                      style: TextStyle(
                        color: colors.textMuted,
                        fontSize: 12,
                      ),
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
                    _deleteChat(chat);
                  }
                },
                itemBuilder: (_) => [
                  PopupMenuItem(
                    value: 'rename',
                    child: Text(
                      'Rename',
                      style: TextStyle(color: colors.textPrimary),
                    ),
                  ),
                  PopupMenuItem(
                    value: 'delete',
                    child: Text(
                      'Delete',
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
              'No conversations yet',
              style: TextStyle(
                color: colors.textPrimary,
                fontSize: 19,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'Your conversations will appear here.',
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
