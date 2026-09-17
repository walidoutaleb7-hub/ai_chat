import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

import '../../core/Theme/weura_theme.dart';

class PlayerCard extends StatelessWidget {
  const PlayerCard({
    super.key,
    required this.data,
    this.onShare,
  });

  final Map<String, dynamic> data;
  final VoidCallback? onShare;

  // ---------------------------------------------------------------------------
  // Build
  // ---------------------------------------------------------------------------

  @override
  Widget build(BuildContext context) {
    final colors = WeuraColors.of(context);

    final player = (data['player'] as Map?)?.cast<String, dynamic>() ?? {};
    final current = (data['current'] as Map?)?.cast<String, dynamic>() ?? {};
    final sources =
        (data['sources'] as List?)?.whereType<Map>().toList() ?? [];

    final photo = _pickPhoto(player);
    final name = _str(player['name'], 'لاعب');
    final nameAlternate = _str(player['nameAlternate']);
    final flag = _str(player['flag']);
    final nationality = _translateNationality(_str(player['nationality']));
    final position = _translatePosition(_str(player['position']));
    final number = _str(player['number']);
    final height = _cleanHeight(_str(player['height']));
    final age = _calcAge(_str(player['birthDate']));
    final foot = _translateFoot(_str(player['side']));

    final currentClub = _translateClub(_str(current['currentClub']));
    final lastTransfer = _translateTransfer(_str(current['lastTransfer']));
    final marketValue = _str(current['marketValue']);
    final stats = (current['stats'] as Map?)?.cast<String, dynamic>() ?? {};
    final goals = _str(stats['goals']);
    final assists = _str(stats['assists']);
    final season = _str(stats['season']);
    final latestNews = _translateNews(_str(current['latestNews']));
    final trophies = _trophiesList(current['trophies']);

    return Directionality(
      textDirection: TextDirection.rtl,
      child: Container(
        margin: const EdgeInsets.symmetric(vertical: 8),
        constraints: const BoxConstraints(maxWidth: 460),
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topRight,
            end: Alignment.bottomLeft,
            colors: [
              colors.surfaceAlt,
              colors.surface,
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
                  // Photo
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
                          color: colors.accentGlow.withValues(alpha: 0.30),
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
                  // Name + Info
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
                        if (nameAlternate.isNotEmpty) ...[
                          const SizedBox(height: 2),
                          Text(
                            nameAlternate,
                            style: TextStyle(
                              color: colors.textFaint,
                              fontSize: 11.5,
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ],
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
                            if (foot.isNotEmpty) _chip(colors, foot),
                          ],
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),

            // ─── Body ─────────────────────────────────────────────────────
            Padding(
              padding: const EdgeInsets.fromLTRB(18, 0, 18, 18),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (currentClub.isNotEmpty) ...[
                    _infoRow(
                      colors,
                      asset: 'assets/icons/home.svg',
                      label: 'النادي الحالي',
                      value: currentClub,
                      highlight: true,
                    ),
                    const SizedBox(height: 10),
                  ],
                  if (lastTransfer.isNotEmpty) ...[
                    _infoRow(
                      colors,
                      asset: 'assets/icons/mode.svg',
                      label: 'آخر انتقال',
                      value: lastTransfer,
                    ),
                    const SizedBox(height: 10),
                  ],
                  if (marketValue.isNotEmpty) ...[
                    _infoRow(
                      colors,
                      asset: 'assets/icons/plus.svg',
                      label: 'القيمة السوقية',
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
                      'الألقاب',
                      trophies.join(' • '),
                    ),
                    const SizedBox(height: 10),
                  ],
                  if (latestNews.isNotEmpty) ...[
                    _miniSection(
                      colors,
                      'آخر الأخبار',
                      latestNews.length > 240
                          ? '${latestNews.substring(0, 240)}...'
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
                            '${sources.length} مصادر',
                            style: TextStyle(
                              color: colors.textFaint,
                              fontSize: 11,
                            ),
                          ),
                        ),
                      if (onShare != null)
                        Material(
                          color: Colors.transparent,
                          child: InkWell(
                            onTap: onShare,
                            borderRadius: BorderRadius.circular(8),
                            child: Padding(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 8,
                                vertical: 6,
                              ),
                              child: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  SvgPicture.asset(
                                    'assets/icons/send.svg',
                                    width: 14,
                                    height: 14,
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

  // ---------------------------------------------------------------------------
  // Helpers — strings
  // ---------------------------------------------------------------------------

  String _str(dynamic value, [String fallback = '']) {
    if (value == null) return fallback;
    final s = value.toString().trim();
    return s.isEmpty ? fallback : s;
  }

  List<String> _trophiesList(dynamic raw) {
    if (raw is! List) return const [];
    return raw
        .map((t) {
          if (t is String) return t.trim();
          if (t is Map) {
            return _str(t['name'] ?? t['title'] ?? t['trophy']);
          }
          return '';
        })
        .where((s) => s.isNotEmpty)
        .toList();
  }

  // ---------------------------------------------------------------------------
  // Translations
  // ---------------------------------------------------------------------------

  String _translatePosition(String raw) {
    if (raw.isEmpty) return '';
    final lower = raw.toLowerCase();

    if (lower.contains('goalkeeper') || lower == 'gk') {
      return 'حارس مرمى';
    }
    if (lower.contains('centre-back') ||
        lower.contains('center-back') ||
        lower.contains('centre back') ||
        lower.contains('center back') ||
        lower == 'cb') {
      return 'قلب دفاع';
    }
    if (lower.contains('full-back') ||
        lower.contains('full back') ||
        lower == 'lb' ||
        lower == 'rb') {
      return 'ظهير';
    }
    if (lower.contains('left-back') || lower == 'lb') {
      return 'ظهير أيسر';
    }
    if (lower.contains('right-back') || lower == 'rb') {
      return 'ظهير أيمن';
    }
    if (lower.contains('defender') ||
        lower.contains('defence') ||
        lower.contains('defense')) {
      return 'مدافع';
    }
    if (lower.contains('defensive midfield') ||
        lower.contains('holding midfield')) {
      return 'وسط دفاعي';
    }
    if (lower.contains('attacking midfield')) {
      return 'وسط هجومي';
    }
    if (lower.contains('midfielder') || lower.contains('midfield')) {
      return 'وسط ميدان';
    }
    if (lower.contains('left wing') || lower == 'lw') {
      return 'جناح أيسر';
    }
    if (lower.contains('right wing') || lower == 'rw') {
      return 'جناح أيمن';
    }
    if (lower.contains('striker') ||
        lower.contains('centre-forward') ||
        lower.contains('center-forward') ||
        lower.contains('forward') ||
        lower.contains('attacker')) {
      return 'مهاجم';
    }

    return raw;
  }

  String _translateFoot(String raw) {
    if (raw.isEmpty) return '';
    final lower = raw.toLowerCase();
    if (lower.contains('left')) return 'قدم يسرى';
    if (lower.contains('right')) return 'قدم يمنى';
    if (lower.contains('both')) return 'كلتا القدمين';
    return raw;
  }

  String _translateNationality(String raw) {
    if (raw.isEmpty) return '';
    final map = <String, String>{
      'france': 'فرنسا',
      'french': 'فرنسي',
      'argentina': 'الأرجنتين',
      'argentinian': 'أرجنتيني',
      'portugal': 'البرتغال',
      'portuguese': 'برتغالي',
      'brazil': 'البرازيل',
      'brazilian': 'برازيلي',
      'spain': 'إسبانيا',
      'spanish': 'إسباني',
      'england': 'إنجلترا',
      'english': 'إنجليزي',
      'germany': 'ألمانيا',
      'german': 'ألماني',
      'italy': 'إيطاليا',
      'italian': 'إيطالي',
      'netherlands': 'هولندا',
      'dutch': 'هولندي',
      'belgium': 'بلجيكا',
      'belgian': 'بلجيكي',
      'algeria': 'الجزائر',
      'algerian': 'جزائري',
      'morocco': 'المغرب',
      'moroccan': 'مغربي',
      'tunisia': 'تونس',
      'tunisian': 'تونسي',
      'egypt': 'مصر',
      'egyptian': 'مصري',
      'norway': 'النرويج',
      'norwegian': 'نرويجي',
      'croatia': 'كرواتيا',
      'croatian': 'كرواتي',
      'poland': 'بولندا',
      'polish': 'بولندي',
      'usa': 'الولايات المتحدة',
      'united states': 'الولايات المتحدة',
      'american': 'أمريكي',
      'uruguay': 'أوروغواي',
      'uruguayan': 'أوروغواياني',
      'senegal': 'السنغال',
      'senegalese': 'سنغالي',
      'cameroon': 'الكاميرون',
      'cameroonian': 'كاميروني',
      'nigeria': 'نيجيريا',
      'nigerian': 'نيجيري',
      'ghana': 'غانا',
      'ghanaian': 'غاني',
      'ivory coast': 'ساحل العاج',
      'japan': 'اليابان',
      'japanese': 'ياباني',
      'south korea': 'كوريا الجنوبية',
      'korean': 'كوري',
      'australia': 'أستراليا',
      'australian': 'أسترالي',
      'mexico': 'المكسيك',
      'mexican': 'مكسيكي',
      'canada': 'كندا',
      'canadian': 'كندي',
      'sweden': 'السويد',
      'swedish': 'سويدي',
      'denmark': 'الدنمارك',
      'danish': 'دنماركي',
      'switzerland': 'سويسرا',
      'swiss': 'سويسري',
      'turkey': 'تركيا',
      'turkish': 'تركي',
      'greece': 'اليونان',
      'greek': 'يوناني',
      'russia': 'روسيا',
      'russian': 'روسي',
      'serbia': 'صربيا',
      'serbian': 'صربي',
      'colombia': 'كولومبيا',
      'colombian': 'كولومبي',
      'chile': 'تشيلي',
      'chilean': 'تشيلي',
      'peru': 'بيرو',
      'peruvian': 'بيروفي',
      'ecuador': 'الإكوادور',
      'ecuadorian': 'إكوادوري',
    };
    return map[raw.toLowerCase()] ?? raw;
  }

  String _translateClub(String raw) {
    if (raw.isEmpty) return '';
    final map = <String, String>{
      'real madrid': 'ريال مدريد',
      'fc barcelona': 'برشلونة',
      'barcelona': 'برشلونة',
      'paris saint-germain': 'باريس سان جيرمان',
      'paris saint germain': 'باريس سان جيرمان',
      'psg': 'باريس سان جيرمان',
      'manchester city': 'مانشستر سيتي',
      'manchester united': 'مانشستر يونايتد',
      'man utd': 'مانشستر يونايتد',
      'liverpool': 'ليفربول',
      'chelsea': 'تشيلسي',
      'arsenal': 'أرسنال',
      'tottenham': 'توتنهام',
      'tottenham hotspur': 'توتنهام',
      'bayern munich': 'بايرن ميونخ',
      'bayern': 'بايرن ميونخ',
      'borussia dortmund': 'بوروسيا دورتموند',
      'dortmund': 'بوروسيا دورتموند',
      'juventus': 'يوفنتوس',
      'inter milan': 'إنتر ميلان',
      'inter': 'إنتر ميلان',
      'ac milan': 'ميلان',
      'milan': 'ميلان',
      'napoli': 'نابولي',
      'atletico madrid': 'أتلتيكو مدريد',
      'atlético madrid': 'أتلتيكو مدريد',
      'atletico': 'أتلتيكو مدريد',
      'sevilla': 'إشبيلية',
      'valencia': 'فالنسيا',
      'benfica': 'بنفيكا',
      'porto': 'بورتو',
      'fc porto': 'بورتو',
      'ajax': 'أياكس',
      'inter miami': 'إنتر ميامي',
      'al hilal': 'الهلال',
      'al nassr': 'النصر',
      'al ahly': 'الأهلي',
      'zamalek': 'الزمالك',
      'esperance': 'الترجي',
      'algeria': 'الجزائر',
      'newcastle': 'نيوكاسل',
      'newcastle united': 'نيوكاسل',
      'aston villa': 'أستون فيلا',
      'west ham': 'وست هام',
      'everton': 'إيفرتون',
      'leeds': 'ليدز',
      'celtic': 'سيلتيك',
      'rangers': 'رينجرز',
      'real betis': 'ريال بيتيس',
      'real sociedad': 'ريال سوسييداد',
      'villarreal': 'فياريال',
      'athletic bilbao': 'أتلتيك بلباو',
      'monaco': 'موناكو',
      'marseille': 'مارسيليا',
      'lyon': 'ليون',
      'lille': 'ليل',
      'nice': 'نيس',
      'roma': 'روما',
      'lazio': 'لاتسيو',
      'atalanta': 'أتالانتا',
      'fiorentina': 'فيورنتينا',
      'leipzig': 'لايبزيغ',
      'bayer leverkusen': 'باير ليفركوزن',
      'leverkusen': 'باير ليفركوزن',
      'frankfurt': 'فرانكفورت',
      'wolfsburg': 'فولفسبورغ',
      'monchengladbach': 'مونشنغلادباخ',
    };
    return map[raw.toLowerCase()] ?? raw;
  }

  String _translateTransfer(String raw) {
    if (raw.isEmpty) return '';

    // Handle format "FromClub to ToClub (Year)"
    final match = RegExp(r'^(.+?)\s+to\s+(.+?)(\s*\((\d{4})\))?$')
        .firstMatch(raw);
    if (match != null) {
      final from = _translateClub(match.group(1)!.trim());
      final to = _translateClub(match.group(2)!.trim());
      final year = match.group(4);
      if (year != null) {
        return 'من $from إلى $to ($year)';
      }
      return 'من $from إلى $to';
    }

    // Fallback: translate clubs found in the string.
    String result = raw;
    for (final entry in {
      'Real Madrid': 'ريال مدريد',
      'FC Barcelona': 'برشلونة',
      'Barcelona': 'برشلونة',
      'Paris Saint-Germain': 'باريس سان جيرمان',
      'Manchester City': 'مانشستر سيتي',
      'Manchester United': 'مانشستر يونايتد',
      'Liverpool': 'ليفربول',
      'Chelsea': 'تشيلسي',
      'Arsenal': 'أرسنال',
      'Bayern Munich': 'بايرن ميونخ',
      'Juventus': 'يوفنتوس',
      'Inter Milan': 'إنتر ميلان',
      'AC Milan': 'ميلان',
      'Al Hilal': 'الهلال',
      'Al Nassr': 'النصر',
      'Inter Miami': 'إنتر ميامي',
    }.entries) {
      result = result.replaceAll(entry.key, entry.value);
    }
    return result;
  }

  String _translateNews(String raw) {
    if (raw.isEmpty) return '';
    // News often comes in English. Translate common football terms.
    return raw
        .replaceAll('signs', 'يوقع')
        .replaceAll('signed', 'وقع')
        .replaceAll('joins', 'ينضم إلى')
        .replaceAll('joined', 'انضم إلى')
        .replaceAll('transfer', 'انتقال')
        .replaceAll('contract', 'عقد')
        .replaceAll('goals', 'أهداف')
        .replaceAll('assists', 'صناعة أهداف')
        .replaceAll('injury', 'إصابة')
        .replaceAll('injured', 'مصاب')
        .replaceAll('match', 'مباراة')
        .replaceAll('season', 'موسم');
  }

  // ---------------------------------------------------------------------------
  // Helpers — formats
  // ---------------------------------------------------------------------------

  String _cleanHeight(String raw) {
    if (raw.isEmpty) return '';
    final match = RegExp(r'([\d.]+)\s*m').firstMatch(raw);
    if (match != null) return '${match.group(1)} م';
    if (raw.length > 8) return raw.substring(0, 8);
    return raw;
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

  // ---------------------------------------------------------------------------
  // Helpers — widgets
  // ---------------------------------------------------------------------------

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
    required String asset,
    required String label,
    required String value,
    bool highlight = false,
  }) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(top: 2),
          child: SvgPicture.asset(
            asset,
            width: 16,
            height: 16,
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
                  fontWeight: highlight
                      ? FontWeight.w700
                      : FontWeight.w500,
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
            Expanded(child: _statItem(colors, season, 'الموسم')),
          if (goals.isNotEmpty)
            Expanded(child: _statItem(colors, goals, 'أهداف')),
          if (assists.isNotEmpty)
            Expanded(child: _statItem(colors, assists, 'صناعة')),
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

  // ---------------------------------------------------------------------------
  // Helpers — photo
  // ---------------------------------------------------------------------------

  String _pickPhoto(Map<String, dynamic> player) {
    final candidates = [
      player['cutout'],
      player['render'],
      player['thumb'],
      player['photo'],
    ];
    for (final c in candidates) {
      final s = c?.toString().trim() ?? '';
      if (s.isNotEmpty) return s;
    }
    return '';
  }
}