import 'package:flutter/material.dart';

import '../../core/Theme/weura_theme.dart';

/// WEURA Player Card — premium football player card (Arabic).
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
  // ─── Translation Maps ───────────────────────────────────────────────

  static const Map<String, String> _positions = {
    'goalkeeper': 'حارس مرمى',
    'defender': 'مدافع',
    'centre-back': 'قلب دفاع',
    'center-back': 'قلب دفاع',
    'left-back': 'ظهير أيسر',
    'right-back': 'ظهير أيمن',
    'wing-back': 'ظهير جناح',
    'midfielder': 'وسط ميدان',
    'defensive midfielder': 'وسط دفاعي',
    'central midfielder': 'وسط ميدان',
    'attacking midfielder': 'صانع ألعاب',
    'winger': 'جناح',
    'left winger': 'جناح أيسر',
    'right winger': 'جناح أيمن',
    'forward': 'مهاجم',
    'striker': 'مهاجم صريح',
    'centre-forward': 'رأس حربة',
    'center-forward': 'رأس حربة',
    'second striker': 'مهاجم ثاني',
  };

  static const Map<String, String> _countries = {
    'france': 'فرنسا',
    'argentina': 'الأرجنتين',
    'portugal': 'البرتغال',
    'brazil': 'البرازيل',
    'spain': 'إسبانيا',
    'england': 'إنجلترا',
    'germany': 'ألمانيا',
    'italy': 'إيطاليا',
    'netherlands': 'هولندا',
    'belgium': 'بلجيكا',
    'algeria': 'الجزائر',
    'morocco': 'المغرب',
    'tunisia': 'تونس',
    'egypt': 'مصر',
    'norway': 'النرويج',
    'croatia': 'كرواتيا',
    'poland': 'بولندا',
    'usa': 'الولايات المتحدة',
    'united states': 'الولايات المتحدة',
    'uruguay': 'أوروغواي',
    'senegal': 'السنغال',
    'cameroon': 'الكاميرون',
    'nigeria': 'نيجيريا',
    'ghana': 'غانا',
    'ivory coast': 'ساحل العاج',
    'japan': 'اليابان',
    'south korea': 'كوريا الجنوبية',
    'australia': 'أستراليا',
    'mexico': 'المكسيك',
    'canada': 'كندا',
    'sweden': 'السويد',
    'denmark': 'الدنمارك',
    'switzerland': 'سويسرا',
    'turkey': 'تركيا',
    'greece': 'اليونان',
    'russia': 'روسيا',
    'serbia': 'صربيا',
    'colombia': 'كولومبيا',
    'chile': 'تشيلي',
    'peru': 'بيرو',
    'ecuador': 'الإكوادور',
  };

  static const Map<String, String> _foot = {
    'right': 'اليمنى',
    'left': 'اليسرى',
    'both': 'كلتاهما',
  };

  // ─── Build ──────────────────────────────────────────────────────────

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
    final name = _str(player['name'], 'غير معروف');
    final flag = _str(player['flag']);
    final nationalityRaw = _str(player['nationality']);
    final nationality = _translateCountry(nationalityRaw);
    final positionRaw = _str(player['position']);
    final position = _translatePosition(positionRaw);
    final number = _str(player['number']);
    final height = _cleanHeight(_str(player['height']));
    final age = _calcAge(_str(player['birthDate']));
    final footRaw = _str(player['side']);
    final foot = _translateFoot(footRaw);

    final currentClub = _translateClub(_str(current['currentClub']));
    final lastTransfer = _translateTransfer(_str(current['lastTransfer']));
    final marketValue = _str(current['marketValue']);
    final stats = (current['stats'] as Map?)?.cast<String, dynamic>() ?? {};
    final goals = _cleanStatValue(_str(stats['goals']));
    final assists = _cleanStatValue(_str(stats['assists']));
    final appearances = _cleanStatValue(_str(stats['appearances']));
    final season = _str(stats['season']);
    final latestNews = _str(current['latestNews']);
    final trophies = (current['trophies'] as List?) ?? [];

    return Directionality(
      textDirection: TextDirection.rtl,
      child: Container(
        margin: const EdgeInsets.symmetric(vertical: 8),
        constraints: const BoxConstraints(maxWidth: 420),
        decoration: BoxDecoration(
          gradient: const LinearGradient(
            begin: Alignment.topRight,
            end: Alignment.bottomLeft,
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
            // ─── Header ────────────────────────────────────────────────
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
                              _chip(colors, 'قدم $foot'),
                          ],
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),

            // ─── Body ──────────────────────────────────────────────────
            Padding(
              padding: const EdgeInsets.fromLTRB(18, 0, 18, 18),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (currentClub.isNotEmpty) ...[
                    _infoRow(
                      colors,
                      icon: Icons.shield_outlined,
                      label: 'النادي الحالي',
                      value: currentClub,
                      highlight: true,
                    ),
                    const SizedBox(height: 10),
                  ],
                  if (lastTransfer.isNotEmpty) ...[
                    _infoRow(
                      colors,
                      icon: Icons.swap_horiz_rounded,
                      label: 'آخر انتقال',
                      value: lastTransfer,
                    ),
                    const SizedBox(height: 10),
                  ],
                  if (marketValue.isNotEmpty) ...[
                    _infoRow(
                      colors,
                      icon: Icons.trending_up_rounded,
                      label: 'القيمة السوقية',
                      value: marketValue,
                    ),
                    const SizedBox(height: 10),
                  ],
                  if (goals.isNotEmpty ||
                      assists.isNotEmpty ||
                      appearances.isNotEmpty ||
                      season.isNotEmpty) ...[
                    const SizedBox(height: 4),
                    _statsBox(
                      colors,
                      season: season,
                      goals: goals,
                      assists: assists,
                      appearances: appearances,
                    ),
                    const SizedBox(height: 12),
                  ],
                  if (trophies.isNotEmpty) ...[
                    _miniSection(
                      colors,
                      'الألقاب',
                      trophies.join(' • '),
                    ),
                    const SizedBox(height: 10),
                  ],
                  if (latestNews.isNotEmpty) ...[
                    _miniSection(
                      colors,
                      'آخر الأخبار',
                      _translateNews(latestNews),
                    ),
                    const SizedBox(height: 10),
                  ],
                  const SizedBox(height: 4),
                  Row(
                    children: [
                      if (sources.isNotEmpty)
                        Expanded(
                          child: Text(
                            '${sources.length} مصادر',
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
                                  'مشاركة',
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
      ),
    );
  }

  // ─── Helpers ────────────────────────────────────────────────────────

  String _str(dynamic value, [String fallback = '']) {
    if (value == null) return fallback;
    final s = value.toString().trim();
    return s.isEmpty ? fallback : s;
  }

  String _translatePosition(String raw) {
    if (raw.isEmpty) return '';
    final key = raw.toLowerCase().trim();
    if (_positions.containsKey(key)) return _positions[key]!;
    for (final entry in _positions.entries) {
      if (key.contains(entry.key)) return entry.value;
    }
    return raw;
  }

  String _translateCountry(String raw) {
    if (raw.isEmpty) return '';
    final key = raw.toLowerCase().trim();
    if (_countries.containsKey(key)) return _countries[key]!;
    for (final entry in _countries.entries) {
      if (key.contains(entry.key)) return entry.value;
    }
    return raw;
  }

  String _translateFoot(String raw) {
    if (raw.isEmpty) return '';
    final key = raw.toLowerCase().trim();
    return _foot[key] ?? raw;
  }

  /// Cleans a stats value by removing English unit words.
  /// "32 goals" -> "32"
  /// "8 assists" -> "8"
  /// "25 appearances" -> "25"
  String _cleanStatValue(String raw) {
    if (raw.isEmpty) return '';
    var s = raw;
    s = s.replaceAll(
      RegExp(r'\s*goals?\s*', caseSensitive: false),
      ' ',
    );
    s = s.replaceAll(
      RegExp(r'\s*assists?\s*', caseSensitive: false),
      ' ',
    );
    s = s.replaceAll(
      RegExp(r'\s*appearances?\s*', caseSensitive: false),
      ' ',
    );
    s = s.replaceAll(
      RegExp(r'\s*apps?\s*', caseSensitive: false),
      ' ',
    );
    s = s.replaceAll(
      RegExp(r'\s*games?\s*', caseSensitive: false),
      ' ',
    );
    s = s.replaceAll(
      RegExp(r'\s*matches?\s*', caseSensitive: false),
      ' ',
    );
    s = s.replaceAll(
      RegExp(r'\s*played\s*', caseSensitive: false),
      ' ',
    );
    return s.trim();
  }

  /// Translates common English club names to Arabic.
  String _translateClub(String raw) {
    if (raw.isEmpty) return '';
    const clubs = {
      'real madrid': 'ريال مدريد',
      'fc barcelona': 'برشلونة',
      'barcelona': 'برشلونة',
      'paris saint-germain': 'باريس سان جيرمان',
      'paris saint germain': 'باريس سان جيرمان',
      'psg': 'باريس سان جيرمان',
      'manchester city': 'مانشستر سيتي',
      'manchester united': 'مانشستر يونايتد',
      'liverpool': 'ليفربول',
      'chelsea': 'تشيلسي',
      'arsenal': 'آرسنال',
      'tottenham': 'توتنهام',
      'bayern munich': 'بايرن ميونخ',
      'bayern': 'بايرن ميونخ',
      'borussia dortmund': 'بوروسيا دورتموند',
      'dortmund': 'بوروسيا دورتموند',
      'juventus': 'يوفنتوس',
      'inter milan': 'إنتر ميلان',
      'ac milan': 'ميلان',
      'napoli': 'نابولي',
      'atletico madrid': 'أتلتيكو مدريد',
      'atlético madrid': 'أتلتيكو مدريد',
      'sevilla': 'إشبيلية',
      'valencia': 'فالنسيا',
      'benfica': 'بنفيكا',
      'fc porto': 'بورتو',
      'porto': 'بورتو',
      'ajax': 'أياكس',
      'inter miami': 'إنتر ميامي',
      'al hilal': 'الهلال',
      'al nassr': 'النصر',
      'al ahly': 'الأهلي',
      'zamalek': 'الزمالك',
      'esperance': 'الترجي',
      'as monaco': 'موناكو',
      'monaco': 'موناكو',
      'olympique lyonnais': 'ليون',
      'lyon': 'ليون',
      'marseille': 'مارسيليا',
      'rb leipzig': 'لايبزيغ',
      'leipzig': 'لايبزيغ',
      'bayer leverkusen': 'باير ليفركوزن',
      'leverkusen': 'باير ليفركوزن',
      'atalanta': 'أتالانتا',
      'roma': 'روما',
      'as roma': 'روما',
      'lazio': 'لاتسيو',
      'fiorentina': 'فيورنتينا',
      'newcastle': 'نيوكاسل',
      'aston villa': 'أستون فيلا',
      'west ham': 'وست هام',
      'everton': 'إيفرتون',
      'leicester': 'ليستر سيتي',
      'wolves': 'وولفرهامبتون',
      'brighton': 'برايتون',
      'nottingham': 'نوتنغهام فورست',
      'crystal palace': 'كريستال بالاس',
    };

    var result = raw;
    for (final entry in clubs.entries) {
      final pattern = RegExp(
        RegExp.escape(entry.key),
        caseSensitive: false,
      );
      result = result.replaceAll(pattern, entry.value);
    }
    return result;
  }

  /// Translates a transfer line: "PSG to Real Madrid (2024)"
  /// -> "باريس سان جيرمان ← ريال مدريد (2024)"
  String _translateTransfer(String raw) {
    if (raw.isEmpty) return '';
    var s = raw;
    // Replace " to " with arrow
    s = s.replaceAll(RegExp(r'\s+to\s+', caseSensitive: false), ' ← ');
    // Also replace " -> "
    s = s.replaceAll(' -> ', ' ← ');
    // Translate club names
    s = _translateClub(s);
    // Translate "from"
    s = s.replaceAll(
      RegExp(r'\bfrom\s+', caseSensitive: false),
      'من ',
    );
    // Translate "free transfer"
    s = s.replaceAll(
      RegExp(r'\bfree\s+transfer', caseSensitive: false),
      'انتقال مجاني',
    );
    // Translate "loan"
    s = s.replaceAll(
      RegExp(r'\bloan\b', caseSensitive: false),
      'إعارة',
    );
    // Translate "fee"
    s = s.replaceAll(
      RegExp(r'\bfee\b', caseSensitive: false),
      'مقابل',
    );
    return s;
  }

  /// Simple news translation fallback (limits to first sentence).
  String _translateNews(String raw) {
    if (raw.isEmpty) return '';
    var s = raw;

    // Common English phrases → Arabic
    const phrases = {
      'signs': 'يوقّع',
      'signed': 'وقّع',
      'joins': 'ينضم إلى',
      'joined': 'انضم إلى',
      'leaves': 'يترك',
      'left': 'ترك',
      'wins': 'يفوز بـ',
      'won': 'فاز بـ',
      'scores': 'يسجل',
      'scored': 'سجل',
      'becomes': 'يصبح',
      'became': 'أصبح',
      'Real Madrid': 'ريال مدريد',
      'PSG': 'باريس سان جيرمان',
      'Paris Saint-Germain': 'باريس سان جيرمان',
      'Barcelona': 'برشلونة',
      'World Cup': 'كأس العالم',
      'Ballon d\'Or': 'الكرة الذهبية',
      'Champions League': 'دوري أبطال أوروبا',
    };

    for (final entry in phrases.entries) {
      s = s.replaceAll(entry.key, entry.value);
    }

    // Truncate
    if (s.length > 220) {
      s = '${s.substring(0, 220)}...';
    }

    return s;
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
    required String appearances,
  }) {
    final items = <Widget>[];
    if (season.isNotEmpty) {
      items.add(_statItem(colors, season, 'الموسم'));
    }
    if (appearances.isNotEmpty) {
      items.add(_statItem(colors, appearances, 'مباريات'));
    }
    if (goals.isNotEmpty) {
      items.add(_statItem(colors, goals, 'أهداف'));
    }
    if (assists.isNotEmpty) {
      items.add(_statItem(colors, assists, 'تمريرات'));
    }

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
        children: items
            .map((w) => Expanded(child: w))
            .toList(growable: false),
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
    if (match != null) return '${match.group(1)}م';
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
      return '$age سنة';
    } catch (_) {
      return '';
    }
  }
}
