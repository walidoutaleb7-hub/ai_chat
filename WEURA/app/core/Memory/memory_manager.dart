String buildRelevantContext(
  String query, {
  int maxItems = 5,
}) {
  final cleanQuery = query.trim().toLowerCase();

  if (_memories.isEmpty) return '';

  // Split the query into meaningful words.
  final words = cleanQuery
      .split(RegExp(r'\s+'))
      .where((w) => w.length >= 2)
      .toList();

  // Score each memory by how many query words it contains.
  final scored = <MapEntry<WeuraMemory, int>>[];

  for (final memory in _memories) {
    final content = memory.content.toLowerCase();
    int score = 0;

    for (final word in words) {
      if (content.contains(word)) score++;
    }

    if (score > 0) {
      scored.add(MapEntry(memory, score));
    }
  }

  // Highest score first.
  scored.sort((a, b) => b.value.compareTo(a.value));

  final selected = <WeuraMemory>[];

  for (final entry in scored) {
    if (selected.length >= maxItems) break;
    selected.add(entry.key);
  }

  // Fallback: if nothing matched, use the most recent memories.
  // This ensures WEURA still has useful context for short questions
  // like "ما اسمي؟" where the memory contains different wording.
  if (selected.isEmpty) {
    selected.addAll(_memories.take(maxItems));
  }

  if (selected.isEmpty) return '';

  final buffer = StringBuffer();
  buffer.writeln('Relevant user memory:');

  for (final memory in selected) {
    buffer.writeln('- ${memory.content}');
  }

  return buffer.toString().trim();
}
