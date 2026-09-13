import 'package:flutter/material.dart';

class MemoryItem {
  final String id;
  String content;
  DateTime updatedAt;

  MemoryItem({
    required this.id,
    required this.content,
    required this.updatedAt,
  });
}

class MemoryScreen extends StatefulWidget {
  const MemoryScreen({super.key});

  @override
  State<MemoryScreen> createState() => _MemoryScreenState();
}

class _MemoryScreenState extends State<MemoryScreen> {
  final List<MemoryItem> _memories = [];

  void _addMemory() {
    _showMemoryDialog();
  }

  void _editMemory(MemoryItem memory) {
    _showMemoryDialog(memory: memory);
  }

  void _showMemoryDialog({MemoryItem? memory}) {
    final controller = TextEditingController(
      text: memory?.content ?? '',
    );

    showDialog<void>(
      context: context,
      builder: (context) {
        return AlertDialog(
          backgroundColor: const Color(0xFF15151D),
          title: Text(
            memory == null ? 'Add memory' : 'Edit memory',
            style: const TextStyle(color: Colors.white),
          ),
          content: TextField(
            controller: controller,
            autofocus: true,
            maxLines: 5,
            style: const TextStyle(color: Colors.white),
            decoration: InputDecoration(
              hintText: 'What should WEURA remember?',
              hintStyle: const TextStyle(color: Colors.white38),
              filled: true,
              fillColor: const Color(0xFF0D0D13),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(14),
                borderSide: BorderSide.none,
              ),
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Cancel'),
            ),
            TextButton(
              onPressed: () {
                final text = controller.text.trim();

                if (text.isEmpty) return;

                setState(() {
                  if (memory == null) {
                    _memories.insert(
                      0,
                      MemoryItem(
                        id: DateTime.now()
                            .microsecondsSinceEpoch
                            .toString(),
                        content: text,
                        updatedAt: DateTime.now(),
                      ),
                    );
                  } else {
                    memory.content = text;
                    memory.updatedAt = DateTime.now();
                  }
                });

                Navigator.pop(context);
              },
              child: const Text('Save'),
            ),
          ],
        );
      },
    );
  }

  void _deleteMemory(MemoryItem memory) {
    setState(() {
      _memories.removeWhere((item) => item.id == memory.id);
    });
  }

  void _clearMemory() {
    if (_memories.isEmpty) return;

    showDialog<void>(
      context: context,
      builder: (context) {
        return AlertDialog(
          backgroundColor: const Color(0xFF15151D),
          title: const Text(
            'Clear memory?',
            style: TextStyle(color: Colors.white),
          ),
          content: const Text(
            'All saved memories will be removed.',
            style: TextStyle(color: Colors.white70),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Cancel'),
            ),
            TextButton(
              onPressed: () {
                setState(() {
                  _memories.clear();
                });

                Navigator.pop(context);
              },
              child: const Text(
                'Clear',
                style: TextStyle(color: Colors.redAccent),
              ),
            ),
          ],
        );
      },
    );
  }

  String _date(DateTime value) {
    final hour = value.hour.toString().padLeft(2, '0');
    final minute = value.minute.toString().padLeft(2, '0');

    return '${value.day}/${value.month}/${value.year} • $hour:$minute';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF07070C),
      appBar: AppBar(
        backgroundColor: const Color(0xFF07070C),
        elevation: 0,
        title: const Text(
          'Memory',
          style: TextStyle(
            color: Colors.white,
            fontWeight: FontWeight.w700,
          ),
        ),
        actions: [
          if (_memories.isNotEmpty)
            IconButton(
              tooltip: 'Clear memory',
              onPressed: _clearMemory,
              icon: const Icon(
                Icons.delete_sweep_outlined,
                color: Colors.white70,
              ),
            ),
        ],
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: _addMemory,
        backgroundColor: const Color(0xFF1D4ED8),
        child: const Icon(
          Icons.add,
          color: Colors.white,
        ),
      ),
      body: _memories.isEmpty
          ? _emptyState()
          : ListView.separated(
              padding: const EdgeInsets.fromLTRB(
                16,
                18,
                16,
                100,
              ),
              itemCount: _memories.length,
              separatorBuilder: (_, __) =>
                  const SizedBox(height: 10),
              itemBuilder: (context, index) {
                return _memoryCard(_memories[index]);
              },
            ),
    );
  }

  Widget _memoryCard(MemoryItem memory) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFF111119),
        borderRadius: BorderRadius.circular(17),
        border: Border.all(
          color: Colors.white.withValues(alpha: 0.06),
        ),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: const Color(0xFF1D4ED8).withValues(
                alpha: 0.14,
              ),
              borderRadius: BorderRadius.circular(12),
            ),
            child: const Icon(
              Icons.psychology_outlined,
              color: Colors.blueAccent,
            ),
          ),
          const SizedBox(width: 13),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  memory.content,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 15,
                    height: 1.45,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  _date(memory.updatedAt),
                  style: const TextStyle(
                    color: Colors.white38,
                    fontSize: 11,
                  ),
                ),
              ],
            ),
          ),
          PopupMenuButton<String>(
            color: const Color(0xFF181820),
            icon: const Icon(
              Icons.more_vert,
              color: Colors.white54,
            ),
            onSelected: (value) {
              if (value == 'edit') {
                _editMemory(memory);
              } else if (value == 'delete') {
                _deleteMemory(memory);
              }
            },
            itemBuilder: (_) => const [
              PopupMenuItem(
                value: 'edit',
                child: Text(
                  'Edit',
                  style: TextStyle(color: Colors.white),
                ),
              ),
              PopupMenuItem(
                value: 'delete',
                child: Text(
                  'Delete',
                  style: TextStyle(color: Colors.redAccent),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _emptyState() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(30),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              Icons.psychology_outlined,
              size: 58,
              color: Colors.white.withValues(alpha: 0.18),
            ),
            const SizedBox(height: 18),
            const Text(
              'WEURA remembers what matters.',
              textAlign: TextAlign.center,
              style: TextStyle(
                color: Colors.white,
                fontSize: 19,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 9),
            const Text(
              'Add useful preferences or information that '
              'you want WEURA to remember.',
              textAlign: TextAlign.center,
              style: TextStyle(
                color: Colors.white38,
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