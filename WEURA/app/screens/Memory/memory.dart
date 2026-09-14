import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

import '../../core/Memory/memory_manager.dart';
import '../../core/Theme/weura_theme.dart';

class MemoryScreen extends StatefulWidget {
  const MemoryScreen({super.key});

  @override
  State<MemoryScreen> createState() => _MemoryScreenState();
}

class _MemoryScreenState extends State<MemoryScreen> {
  final MemoryManager _manager = MemoryManager();
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    await _manager.load();
    if (!mounted) return;
    setState(() => _isLoading = false);
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
            memory == null ? 'Add memory' : 'Edit memory',
            style: TextStyle(color: colors.textPrimary),
          ),
          content: TextField(
            controller: controller,
            autofocus: true,
            maxLines: 5,
            style: TextStyle(color: colors.textPrimary),
            decoration: InputDecoration(
              hintText: 'What should WEURA remember?',
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
              onPressed: () => Navigator.pop(dialogContext, controller.text),
              child: const Text('Save'),
            ),
          ],
        );
      },
    );

    if (result == null || result.trim().isEmpty) return;

    if (memory == null) {
      await _manager.add(result.trim());
    } else {
      await _manager.update(memory.id, result.trim());
    }

    if (mounted) setState(() {});
  }

  Future<void> _deleteMemory(WeuraMemory memory) async {
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
            'Clear memory?',
            style: TextStyle(color: colors.textPrimary),
          ),
          content: Text(
            'All saved memories will be removed.',
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
                'Clear',
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
    final memories = _manager.memories;

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
          'Memory',
          style: TextStyle(
            color: colors.textPrimary,
            fontWeight: FontWeight.w700,
          ),
        ),
        actions: [
          if (memories.isNotEmpty)
            IconButton(
              tooltip: 'Clear memory',
              onPressed: () => _clearMemory(colors),
              icon: SvgPicture.asset(
                'assets/icons/close.svg',
                width: 22,
                height: 22,
              ),
            ),
        ],
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: () => _showMemoryDialog(colors),
        backgroundColor: colors.accent,
        child: SvgPicture.asset(
          'assets/icons/plus.svg',
          width: 22,
          height: 22,
          colorFilter: const ColorFilter.mode(
            Colors.white,
            BlendMode.srcIn,
          ),
        ),
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
          : memories.isEmpty
              ? _emptyState(colors)
              : ListView.separated(
                  padding: const EdgeInsets.fromLTRB(16, 18, 16, 100),
                  itemCount: memories.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 10),
                  itemBuilder: (context, index) {
                    return _memoryCard(colors, memories[index]);
                  },
                ),
    );
  }

  Widget _memoryCard(WeuraColors colors, WeuraMemory memory) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: colors.surface,
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
            child: Padding(
              padding: const EdgeInsets.all(10),
              child: SvgPicture.asset('assets/icons/mode.svg'),
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
                _deleteMemory(memory);
              }
            },
            itemBuilder: (_) => [
              PopupMenuItem(
                value: 'edit',
                child: Text(
                  'Edit',
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
                'assets/icons/mode.svg',
                width: 56,
                height: 56,
              ),
            ),
            const SizedBox(height: 18),
            Text(
              'WEURA remembers what matters.',
              textAlign: TextAlign.center,
              style: TextStyle(
                color: colors.textPrimary,
                fontSize: 19,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 9),
            Text(
              'Add useful preferences or information that '
              'you want WEURA to remember.',
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
}
