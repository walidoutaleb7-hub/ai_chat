import 'package:flutter/material.dart';

import '../../components/UI/weura_background.dart';
import '../../core/Memory/memory_manager.dart';
import '../../core/Settings/app_settings.dart';
import '../../core/Theme/weura_theme.dart';

class MemoryScreen extends StatefulWidget {
  const MemoryScreen({super.key});

  @override
  State<MemoryScreen> createState() => _MemoryScreenState();
}

class _MemoryScreenState extends State<MemoryScreen> {
  final MemoryManager _manager = MemoryManager();
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

  bool get _isArabic => AppSettingsManager.instance.language == 'Arabic';

  String _t(String en, String ar) => _isArabic ? ar : en;

  Future<void> _load() async {
    await _manager.load();
    if (!mounted) return;
    setState(() => _isLoading = false);
  }

  List<WeuraMemory> get _filtered {
    if (_search.trim().isEmpty) return _manager.memories;
    return _manager.search(_search);
  }

  Future<void> _showMemoryDialog(
    WeuraColors colors, {
    WeuraMemory? memory,
  }) async {
    final controller = TextEditingController(text: memory?.content ?? '');

    final result = await showDialog<String>(
      context: context,
      builder: (dialogContext) {
        return AlertDialog(
          backgroundColor: colors.surfaceAlt,
          title: Text(
            memory == null
                ? _t('Add memory', 'إضافة ذكرى')
                : _t('Edit memory', 'تعديل الذكرى'),
            style: TextStyle(color: colors.textPrimary),
          ),
          content: TextField(
            controller: controller,
            autofocus: true,
            maxLines: 5,
            maxLength: 500,
            style: TextStyle(color: colors.textPrimary),
            decoration: InputDecoration(
              hintText: _t(
                'What should WEURA remember?',
                'شو تحب WEURA يتفكر؟',
              ),
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

    if (result == null || result.trim().isEmpty) return;

    try {
      if (memory == null) {
        await _manager.add(result.trim());
      } else {
        await _manager.update(memory.id, result.trim());
      }
      if (mounted) setState(() {});
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(SnackBar(content: Text(e.toString())));
    }
  }

  Future<void> _confirmDeleteMemory(
    WeuraMemory memory,
    WeuraColors colors,
  ) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) {
        return AlertDialog(
          backgroundColor: colors.surfaceAlt,
          title: Text(
            _t('Delete this memory?', 'حذف هذه الذكرى؟'),
            style: TextStyle(color: colors.textPrimary),
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
    await _manager.delete(memory.id);
    if (mounted) setState(() {});
  }

  Future<void> _clearMemory(WeuraColors colors) async {
    if (_manager.memories.isEmpty) return;

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) {
        return AlertDialog(
          backgroundColor: colors.surfaceAlt,
          title: Text(
            _t('Clear memory?', 'مسح كل الذاكرة؟'),
            style: TextStyle(color: colors.textPrimary),
          ),
          content: Text(
            _t(
              'All saved memories will be removed.',
              'سيتم إزالة كل الذكريات المحفوظة.',
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
                _t('Clear', 'مسح'),
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

  String _date(DateTime value) {
    final hour = value.hour.toString().padLeft(2, '0');
    final minute = value.minute.toString().padLeft(2, '0');
    return '${value.day}/${value.month}/${value.year} • $hour:$minute';
  }

  @override
  Widget build(BuildContext context) {
    final colors = WeuraColors.of(context);
    final items = _filtered;
    final total = _manager.count;

    return Scaffold(
      backgroundColor: colors.background,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        leading: IconButton(
          tooltip: _t('Back', 'رجوع'),
          onPressed: () => Navigator.pop(context),
          icon: Icon(
            Icons.arrow_back_rounded,
            size: 24,
            color: colors.textPrimary,
          ),
        ),
        title: Row(
          children: [
            Text(
              _t('Memory', 'الذاكرة'),
              style: TextStyle(
                color: colors.textPrimary,
                fontWeight: FontWeight.w700,
              ),
            ),
            if (total > 0) ...[
              const SizedBox(width: 8),
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 8,
                  vertical: 2,
                ),
                decoration: BoxDecoration(
                  color: colors.accentSoft,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Text(
                  '$total',
                  style: TextStyle(
                    color: colors.accentGlow,
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ],
          ],
        ),
        actions: [
          if (_manager.memories.isNotEmpty)
            IconButton(
              tooltip: _t('Clear memory', 'مسح الكل'),
              onPressed: () => _clearMemory(colors),
              icon: Icon(
                Icons.delete_outline_rounded,
                size: 24,
                color: colors.textPrimary,
              ),
            ),
        ],
      ),
      extendBodyBehindAppBar: true,
      floatingActionButton: FloatingActionButton(
        onPressed: () => _showMemoryDialog(colors),
        backgroundColor: colors.accent,
        child: const Icon(
          Icons.add_rounded,
          size: 28,
          color: Colors.white,
        ),
      ),
      body: WeuraScreenBackground(
        colors: colors,
        child: _isLoading
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
            : _manager.memories.isEmpty
                ? Padding(
                    padding: EdgeInsets.only(
                      top: MediaQuery.of(context).padding.top +
                          kToolbarHeight,
                    ),
                    child: _emptyState(colors),
                  )
                : Column(
                    children: [
                      SizedBox(
                        height: MediaQuery.of(context).padding.top +
                            kToolbarHeight,
                      ),
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
                              'Search memory...',
                              'ابحث في الذاكرة...',
                            ),
                            hintStyle: TextStyle(color: colors.textFaint),
                            prefixIcon: Icon(
                              Icons.search_rounded,
                              size: 22,
                              color: colors.textMuted,
                            ),
                            suffixIcon: _search.isNotEmpty
                                ? IconButton(
                                    onPressed: () {
                                      _searchController.clear();
                                      setState(() => _search = '');
                                    },
                                    icon: Icon(
                                      Icons.close_rounded,
                                      size: 20,
                                      color: colors.textMuted,
                                    ),
                                  )
                                : null,
                            filled: true,
                            fillColor:
                                colors.surface.withValues(alpha: 0.85),
                            border: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(16),
                              borderSide: BorderSide.none,
                            ),
                          ),
                        ),
                      ),
                      Expanded(
                        child: items.isEmpty
                            ? _noResultsState(colors)
                            : ListView.separated(
                                padding: const EdgeInsets.fromLTRB(
                                  16,
                                  4,
                                  16,
                                  100,
                                ),
                                itemCount: items.length,
                                separatorBuilder: (_, __) =>
                                    const SizedBox(height: 10),
                                itemBuilder: (context, index) {
                                  return _memoryCard(
                                    colors,
                                    items[index],
                                  );
                                },
                              ),
                      ),
                    ],
                  ),
      ),
    );
  }

  Widget _memoryCard(WeuraColors colors, WeuraMemory memory) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: colors.surface.withValues(alpha: 0.85),
        borderRadius: BorderRadius.circular(17),
        border: Border.all(color: colors.border),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: colors.accentSoft,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(
              Icons.lightbulb_outline_rounded,
              size: 22,
              color: colors.accentGlow,
            ),
          ),
          const SizedBox(width: 13),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  memory.content,
                  style: TextStyle(
                    color: colors.textPrimary,
                    fontSize: 15,
                    height: 1.45,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  _date(memory.updatedAt ?? memory.createdAt),
                  style: TextStyle(
                    color: colors.textMuted,
                    fontSize: 11,
                  ),
                ),
              ],
            ),
          ),
          PopupMenuButton<String>(
            color: colors.surfaceAlt,
            icon: Icon(Icons.more_vert, color: colors.textMuted),
            onSelected: (value) {
              if (value == 'edit') {
                _showMemoryDialog(colors, memory: memory);
              } else if (value == 'delete') {
                _confirmDeleteMemory(memory, colors);
              }
            },
            itemBuilder: (_) => [
              PopupMenuItem(
                value: 'edit',
                child: Text(
                  _t('Edit', 'تعديل'),
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
    );
  }

  Widget _emptyState(WeuraColors colors) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(30),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              width: 72,
              height: 72,
              decoration: BoxDecoration(
                color: colors.accentSoft,
                borderRadius: BorderRadius.circular(24),
                border: Border.all(
                  color: colors.accentGlow.withValues(alpha: 0.18),
                ),
              ),
              child: Icon(
                Icons.lightbulb_outline_rounded,
                size: 36,
                color: colors.accentGlow,
              ),
            ),
            const SizedBox(height: 18),
            Text(
              _t(
                'WEURA remembers what matters.',
                'WEURA يتذكر ما يهم.',
              ),
              textAlign: TextAlign.center,
              style: TextStyle(
                color: colors.textPrimary,
                fontSize: 19,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 9),
            Text(
              _t(
                'Add useful preferences or information that you want WEURA to remember.',
                'أضف تفضيلات أو معلومات تريد أن يتذكرها WEURA.',
              ),
              textAlign: TextAlign.center,
              style: TextStyle(
                color: colors.textMuted,
                fontSize: 14,
                height: 1.45,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _noResultsState(WeuraColors colors) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(30),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              Icons.search_off_rounded,
              size: 52,
              color: colors.textMuted,
            ),
            const SizedBox(height: 14),
            Text(
              _t('No results found', 'لا توجد نتائج'),
              style: TextStyle(
                color: colors.textPrimary,
                fontSize: 17,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              _t('Try a different search term.', 'جرب كلمة بحث أخرى.'),
              style: TextStyle(
                color: colors.textMuted,
                fontSize: 13,
              ),
            ),
          ],
        ),
      ),
    );
  }
}