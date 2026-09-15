import 'package:flutter/material.dart';

import '../../core/Theme/weura_theme.dart';

/// WEURA Player Card — premium football player card.
class PlayerCard extends StatefulWidget {
  const PlayerCard({
    super.key,
    required this.data,
    this.onShare,
  });

  final Map<String, dynamic> data;
  final VoidCallback? onShare;

  @override
  State<PlayerCard> createState() => _PlayerCardState();
}

class _PlayerCardState extends State<PlayerCard> {
  @override
  Widget build(BuildContext context) {
    final colors = WeuraColors.of(context);
    final player =
        (widget.data['player'] as Map?)?.cast<String, dynamic>() ?? {};
    final current =
        (widget.data['current'] as Map?)?.cast<String, dynamic>() ?? {};
    final sources =
        (widget.data['sources'] as List?)?.cast<Map>() ?? [];

    final photo = _pickPhoto(player);
    final name = _str(player['name'], 'Unknown');
    final flag = _str(player['flag']);
    final nationality = _str(player['nationality']);
    final position = _str(player['position']);
    final number = _str(player['number']);
    final height = _cleanHeight(_str(player['height']));
    final age = _calcAge(_str(player['birthDate']));
    final foot = _str(player['side']);

    final currentClub = _str(current['currentClub']);
    final lastTransfer = _str(current['lastTransfer']);
    final marketValue = _str(current['marketValue']);
    final stats = (current['stats'] as Map?)?.cast<String, dynamic>() ?? {};
    final goals = _str(stats['goals']);
    final assists = _str(stats['assists']);
    final season = _str(stats['season']);
    final latestNews = _str(current['latestNews']);
    final trophies = (current['trophies'] as List?) ?? [];

    return Container(
      margin: const EdgeInsets.symmetric(vertical: 8),
      constraints: const BoxConstraints(maxWidth: 420),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            Color(0xFF0F1524),
            Color(0xFF0A0D18),
          ],
        ),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
          color: colors.accentGlow.withValues(alpha: 0.35),
          width: 1,
        ),
        boxShadow: [
          BoxShadow(
            color: colors.accent.withValues(alpha: 0.20),
            blurRadius: 30,
            spreadRadius: 2,
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // ─── Header: Photo + Basic Info ───────────────────────────────
          Container(
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [
                  colors.accent.withValues(alpha: 0.10),
                  Colors.transparent,
                ],
              ),
              borderRadius: const BorderRadius.only(
                topLeft: Radius.circular(20),
                topRight: Radius.circular(20),
              ),
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                Container(
                  width: 96,
                  height: 96,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: colors.surface,
                    border: Border.all(
                      color: colors.accentGlow.withValues(alpha: 0.45),
                      width: 2,
                    ),
                    boxShadow: [
                      BoxShadow(
                        color:
                            colors.accentGlow.withValues(alpha: 0.30),
                        blurRadius: 18,
                        spreadRadius: 1,
                      ),
                    ],
                  ),
                  child: ClipOval(
                    child: photo.isNotEmpty
                        ? Image.network(
                            photo,
                            fit: BoxFit.cover,
                            errorBuilder: (_, __, ___) =>
                                _fallbackAvatar(colors, name),
                          )
                        : _fallbackAvatar(colors, name),
                  ),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          if (flag.isNotEmpty) ...[
                            Text(
                              flag,
                              style: const TextStyle(fontSize: 20),
                            ),
                            const SizedBox(width: 6),
                          ],
                          Flexible(
                            child: Text(
                              name,
                              style: TextStyle(
                                color: colors.textPrimary,
                                fontSize: 20,
                                fontWeight: FontWeight.w800,
                                letterSpacing: -0.3,
                              ),
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                        ],
                      ),
                      if (nationality.isNotEmpty) ...[
                        const SizedBox(height: 3),
                        Text(
                          nationality,
                          style: TextStyle(
                            color: colors.textMuted,
                            fontSize: 12.5,
                          ),
                        ),
                      ],
                      const SizedBox(height: 8),
                      Wrap(
                        spacing: 6,
                        runSpacing: 4,
                        children: [
                          if (position.isNotEmpty)
                            _chip(colors, position),
                          if (number.isNotEmpty)
                            _chip(colors, '#$number'),
                          if (age.isNotEmpty) _chip(colors, age),
                          if (height.isNotEmpty) _chip(colors, height),
                          if (foot.isNotEmpty)
                            _chip(colors, '$foot foot'),
                        ],
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),

          // ─── Body ────────────────────────────────────────────────────
          Padding(
            padding: const EdgeInsets.fromLTRB(18, 0, 18, 18),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (currentClub.isNotEmpty) ...[
                  _infoRow(
                    colors,
                    icon: Icons.shield_outlined,
                    label: 'Current club',
                    value: currentClub,
                    highlight: true,
                  ),
                  const SizedBox(height: 10),
                ],
                if (lastTransfer.isNotEmpty) ...[
                  _infoRow(
                    colors,
                    icon: Icons.swap_horiz_rounded,
                    label: 'Last transfer',
                    value: lastTransfer,
                  ),
                  const SizedBox(height: 10),
                ],
                if (marketValue.isNotEmpty) ...[
                  _infoRow(
                    colors,
                    icon: Icons.trending_up_rounded,
                    label: 'Market value',
                    value: marketValue,
                  ),
                  const SizedBox(height: 10),
                ],
                if (goals.isNotEmpty ||
                    assists.isNotEmpty ||
                    season.isNotEmpty) ...[
                  const SizedBox(height: 4),
                  _statsBox(
                    colors,
                    season: season,
                    goals: goals,
                    assists: assists,
                  ),
                  const SizedBox(height: 12),
                ],
                if (trophies.isNotEmpty) ...[
                  _miniSection(
                    colors,
                    'Trophies',
                    trophies.join(' • '),
                  ),
                  const SizedBox(height: 10),
                ],
                if (latestNews.isNotEmpty) ...[
                  _miniSection(
                    colors,
                    'Latest',
                    latestNews.length > 220
                        ? '${latestNews.substring(0, 220)}...'
                        : latestNews,
                  ),
                  const SizedBox(height: 10),
                ],
                const SizedBox(height: 4),
                Row(
                  children: [
                    if (sources.isNotEmpty)
                      Expanded(
                        child: Text(
                          '${sources.length} sources',
                          style: TextStyle(
                            color: colors.textFaint,
                            fontSize: 11,
                          ),
                        ),
                      ),
                    if (widget.onShare != null)
                      InkWell(
                        onTap: widget.onShare,
                        borderRadius: BorderRadius.circular(8),
                        child: Padding(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 8,
                            vertical: 6,
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(
                                Icons.share_outlined,
                                size: 14,
                                color: colors.textMuted,
                              ),
                              const SizedBox(width: 5),
                              Text(
                                'Share',
                                style: TextStyle(
                                  color: colors.textMuted,
                                  fontSize: 12,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  // ─── Helpers ────────────────────────────────────────────────────────

  String _str(dynamic value, [String fallback = '']) {
    if (value == null) return fallback;
    final s = value.toString().trim();
    return s.isEmpty ? fallback : s;
  }

  Widget _fallbackAvatar(WeuraColors colors, String name) {
    final letter = name.isNotEmpty ? name[0].toUpperCase() : '?';
    return Container(
      color: colors.surface,
      child: Center(
        child: Text(
          letter,
          style: TextStyle(
            color: colors.accentGlow,
            fontSize: 36,
            fontWeight: FontWeight.w800,
          ),
        ),
      ),
    );
  }

  Widget _chip(WeuraColors colors, String label) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: colors.accentSoft,
        borderRadius: BorderRadius.circular(7),
        border: Border.all(
          color: colors.accentGlow.withValues(alpha: 0.22),
        ),
      ),
      child: Text(
        label,
        style: TextStyle(
          color: colors.accentGlow,
          fontSize: 11,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }

  Widget _infoRow(
    WeuraColors colors, {
    required IconData icon,
    required String label,
    required String value,
    bool highlight = false,
  }) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(top: 2),
          child: Icon(
            icon,
            size: 16,
            color: highlight ? colors.accentGlow : colors.textMuted,
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                label,
                style: TextStyle(
                  color: colors.textFaint,
                  fontSize: 11,
                  letterSpacing: 0.4,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                value,
                style: TextStyle(
                  color: highlight
                      ? colors.textPrimary
                      : colors.textSecondary,
                  fontSize: 14,
                  fontWeight:
                      highlight ? FontWeight.w700 : FontWeight.w500,
                  height: 1.4,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _statsBox(
    WeuraColors colors, {
    required String season,
    required String goals,
    required String assists,
  }) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 8),
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: colors.accentGlow.withValues(alpha: 0.18),
        ),
      ),
      child: Row(
        children: [
          if (season.isNotEmpty)
            Expanded(child: _statItem(colors, season, 'Season')),
          if (goals.isNotEmpty)
            Expanded(child: _statItem(colors, goals, 'Goals')),
          if (assists.isNotEmpty)
            Expanded(child: _statItem(colors, assists, 'Assists')),
        ],
      ),
    );
  }

  Widget _statItem(WeuraColors colors, String value, String label) {
    return Column(
      children: [
        Text(
          value,
          style: TextStyle(
            color: colors.accentGlow,
            fontSize: 18,
            fontWeight: FontWeight.w800,
          ),
        ),
        const SizedBox(height: 3),
        Text(
          label,
          style: TextStyle(
            color: colors.textMuted,
            fontSize: 11,
            letterSpacing: 0.3,
          ),
        ),
      ],
    );
  }

  Widget _miniSection(WeuraColors colors, String title, String body) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title,
          style: TextStyle(
            color: colors.textFaint,
            fontSize: 11,
            letterSpacing: 0.4,
          ),
        ),
        const SizedBox(height: 3),
        Text(
          body,
          style: TextStyle(
            color: colors.textSecondary,
            fontSize: 13,
            height: 1.5,
          ),
        ),
      ],
    );
  }

  String _pickPhoto(Map<String, dynamic> player) {
    final candidates = [
      player['cutout'],
      player['render'],
      player['thumb'],
    ];
    for (final c in candidates) {
      final s = c?.toString().trim() ?? '';
      if (s.isNotEmpty) return s;
    }
    return '';
  }

  String _cleanHeight(String raw) {
    if (raw.isEmpty) return '';
    final match = RegExp(r'([\d.]+)\s*m').firstMatch(raw);
    if (match != null) return '${match.group(1)}m';
    return raw.length > 8 ? raw.substring(0, 8) : raw;
  }

  String _calcAge(String birthDate) {
    if (birthDate.isEmpty) return '';
    try {
      final d = DateTime.parse(birthDate);
      final now = DateTime.now();
      int age = now.year - d.year;
      if (now.month < d.month ||
          (now.month == d.month && now.day < d.day)) {
        age--;
      }
      if (age <= 0 || age > 120) return '';
      return '$age y';
    } catch (_) {
      return '';
    }
  }
}
