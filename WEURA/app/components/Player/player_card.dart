import 'package:flutter/material.dart';
import '../../core/Theme/weura_theme.dart';

class PlayerCard extends StatelessWidget {
  const PlayerCard({super.key, required this.data, this.onShare});
  final Map<String, dynamic> data;
  final VoidCallback? onShare;

  @override
  Widget build(BuildContext context) {
    final colors = WeuraColors.of(context);
    final t = _Strings.of(context);
    final dir = Directionality.of(context);
    final isRtl = dir == TextDirection.rtl;

    final player = (data['player'] as Map?)?.cast<String, dynamic>() ?? {};
    final current = (data['current'] as Map?)?.cast<String, dynamic>() ?? {};
    final sources = (data['sources'] as List?)?.whereType<Map>().toList() ?? [];

    final photo = _pickPhoto(player);
    final name = _str(player['name'], 'لاعب');
    final nameAlternate = _str(player['nameAlternate']);
    final flag = _str(player['flag']);
    final nationality = _translateNationality(_str(player['nationality']), t);
    final position = _translatePosition(_str(player['position']), t);
    final number = _str(player['number']);
    final height = _cleanHeight(_str(player['height']));
    final age = _calcAge(_str(player['birthDate']), t);
    final foot = _translateFoot(_str(player['side']), t);
    final description = _str(player['description']);
    final currentClub = _translateClub(_str(current['currentClub']), t);
    final lastTransfer = _formatTransfer(_str(current['lastTransfer']), t);
    final marketValue = _str(current['marketValue']);
    final stats = (current['stats'] as Map?)?.cast<String, dynamic>() ?? {};
    final goals = _str(stats['goals']);
    final assists = _str(stats['assists']);
    final season = _str(stats['season']);
    final latestNews = _str(current['latestNews']);
    final trophies = _trophiesList(current['trophies']);

    return Directionality(
      textDirection: dir,
      child: Container(
        margin: const EdgeInsets.symmetric(vertical: 10),
        constraints: const BoxConstraints(maxWidth: 480),
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: isRtl ? Alignment.topRight : Alignment.topLeft,
            end: isRtl ? Alignment.bottomLeft : Alignment.bottomRight,
            colors: [colors.surfaceAlt, colors.surface],
          ),
          borderRadius: BorderRadius.circular(22),
          border: Border.all(color: colors.accentGlow.withValues(alpha: 0.30), width: 1),
          boxShadow: [
            BoxShadow(color: colors.accent.withValues(alpha: 0.18), blurRadius: 32, spreadRadius: 2),
            BoxShadow(color: Colors.black.withValues(alpha: 0.10), blurRadius: 12, offset: const Offset(0, 6)),
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _buildHeader(colors: colors, t: t, photo: photo, name: name, nameAlternate: nameAlternate, flag: flag, nationality: nationality, position: position, number: number, age: age, height: height, foot: foot),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 4, 20, 20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (currentClub.isNotEmpty) ...[_infoRow(colors, icon: Icons.stadium_rounded, label: t.currentClub, value: currentClub, highlight: true), const SizedBox(height: 12)],
                  if (lastTransfer.isNotEmpty) ...[_infoRow(colors, icon: Icons.swap_horiz_rounded, label: t.lastTransfer, value: lastTransfer), const SizedBox(height: 12)],
                  if (marketValue.isNotEmpty) ...[_infoRow(colors, icon: Icons.attach_money_rounded, label: t.marketValue, value: marketValue), const SizedBox(height: 12)],
                  if (goals.isNotEmpty || assists.isNotEmpty || season.isNotEmpty) ...[const SizedBox(height: 4), _statsBox(colors, t: t, season: season, goals: goals, assists: assists), const SizedBox(height: 14)],
                  if (trophies.isNotEmpty) ...[_miniSection(colors, icon: Icons.emoji_events_rounded, title: t.trophies, body: trophies.join(' • ')), const SizedBox(height: 12)],
                  if (latestNews.isNotEmpty && !_isDuplicateOf(latestNews, description)) ...[_englishSection(colors, t: t, title: t.latestNews, body: _trimNews(latestNews)), const SizedBox(height: 12)],
                  if (description.isNotEmpty) ...[_englishSection(colors, t: t, title: t.bio, body: _trimBio(description)), const SizedBox(height: 12)],
                  const SizedBox(height: 4),
                  _footer(colors, t, sources),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildHeader({
    required WeuraColors colors, required _Strings t, required String photo,
    required String name, required String nameAlternate, required String flag,
    required String nationality, required String position, required String number,
    required String age, required String height, required String foot,
  }) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [colors.accent.withValues(alpha: 0.12), Colors.transparent]),
        borderRadius: const BorderRadius.only(topLeft: Radius.circular(22), topRight: Radius.circular(22)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          _buildPhoto(colors, photo, name),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(children: [
                  if (flag.isNotEmpty) ...[Text(flag, style: const TextStyle(fontSize: 22)), const SizedBox(width: 8)],
                  Flexible(child: Text(name, style: TextStyle(color: colors.textPrimary, fontSize: 22, fontWeight: FontWeight.w800, letterSpacing: -0.3, height: 1.2), maxLines: 2, overflow: TextOverflow.ellipsis)),
                ]),
                if (nameAlternate.isNotEmpty) ...[const SizedBox(height: 4), Text(nameAlternate, style: TextStyle(color: colors.textFaint, fontSize: 12), maxLines: 1, overflow: TextOverflow.ellipsis)],
                if (nationality.isNotEmpty) ...[const SizedBox(height: 6), Text(nationality, style: TextStyle(color: colors.textMuted, fontSize: 13))],
                const SizedBox(height: 10),
                Wrap(spacing: 7, runSpacing: 6, children: [
                  if (position.isNotEmpty) _chip(colors, Icons.sports_soccer_rounded, position),
                  if (number.isNotEmpty) _chip(colors, Icons.tag_rounded, '#$number'),
                  if (age.isNotEmpty) _chip(colors, Icons.cake_rounded, age),
                  if (height.isNotEmpty) _chip(colors, Icons.height_rounded, height),
                  if (foot.isNotEmpty) _chip(colors, Icons.directions_walk_rounded, foot),
                ]),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildPhoto(WeuraColors colors, String photo, String name) {
    return Container(
      width: 100, height: 100,
      decoration: BoxDecoration(
        shape: BoxShape.circle, color: colors.surface,
        border: Border.all(color: colors.accentGlow.withValues(alpha: 0.50), width: 2),
        boxShadow: [BoxShadow(color: colors.accentGlow.withValues(alpha: 0.35), blurRadius: 20, spreadRadius: 1)],
      ),
      child: ClipOval(child: photo.isNotEmpty
        ? Image.network(photo, fit: BoxFit.cover, errorBuilder: (_, __, ___) => _fallbackAvatar(colors, name))
        : _fallbackAvatar(colors, name)),
    );
  }

  Widget _footer(WeuraColors colors, _Strings t, List<Map> sources) {
    return Row(children: [
      if (sources.isNotEmpty) Expanded(child: Row(children: [
        Icon(Icons.article_outlined, size: 14, color: colors.textFaint),
        const SizedBox(width: 4),
        Text(t.sourcesCount(sources.length), style: TextStyle(color: colors.textFaint, fontSize: 11.5)),
      ])),
      if (onShare != null) Material(color: Colors.transparent, child: InkWell(
        onTap: onShare, borderRadius: BorderRadius.circular(10),
        child: Padding(padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7), child: Row(mainAxisSize: MainAxisSize.min, children: [
          Icon(Icons.share_outlined, size: 15, color: colors.textMuted),
          const SizedBox(width: 6),
          Text(t.share, style: TextStyle(color: colors.textMuted, fontSize: 12.5, fontWeight: FontWeight.w600)),
        ])),
      )),
    ]);
  }

  Widget _englishSection(WeuraColors colors, {required _Strings t, required String title, required String body}) {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Row(children: [
        Icon(Icons.info_outline_rounded, size: 13, color: colors.textFaint),
        const SizedBox(width: 6),
        Text(title, style: TextStyle(color: colors.textFaint, fontSize: 11.5, fontWeight: FontWeight.w600, letterSpacing: 0.4)),
        const SizedBox(width: 8),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
          decoration: BoxDecoration(color: colors.surfaceAlt, borderRadius: BorderRadius.circular(6), border: Border.all(color: colors.border)),
          child: Text('EN', style: TextStyle(color: colors.textMuted, fontSize: 9, fontWeight: FontWeight.w800, letterSpacing: 0.6)),
        ),
      ]),
      const SizedBox(height: 6),
      Directionality(textDirection: TextDirection.ltr, child: Text(body, style: TextStyle(color: colors.textSecondary, fontSize: 13, height: 1.55))),
    ]);
  }

  Widget _chip(WeuraColors colors, IconData icon, String label) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
      decoration: BoxDecoration(color: colors.accentSoft, borderRadius: BorderRadius.circular(8), border: Border.all(color: colors.accentGlow.withValues(alpha: 0.22))),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(icon, size: 12, color: colors.accentGlow),
        const SizedBox(width: 4),
        Text(label, style: TextStyle(color: colors.accentGlow, fontSize: 11.5, fontWeight: FontWeight.w600)),
      ]),
    );
  }

  Widget _infoRow(WeuraColors colors, {required IconData icon, required String label, required String value, bool highlight = false}) {
    return Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Padding(padding: const EdgeInsets.only(top: 2), child: Icon(icon, size: 16, color: colors.accentGlow)),
      const SizedBox(width: 10),
      Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(label, style: TextStyle(color: colors.textFaint, fontSize: 11, fontWeight: FontWeight.w600, letterSpacing: 0.4)),
        const SizedBox(height: 3),
        Text(value, style: TextStyle(color: highlight ? colors.textPrimary : colors.textSecondary, fontSize: 14.5, fontWeight: highlight ? FontWeight.w700 : FontWeight.w500, height: 1.4)),
      ])),
    ]);
  }

  Widget _statsBox(WeuraColors colors, {required _Strings t, required String season, required String goals, required String assists}) {
    final items = <Widget>[];
    if (season.isNotEmpty) items.add(_statItem(colors, season, t.season, Icons.calendar_month_rounded));
    if (goals.isNotEmpty) items.add(_statItem(colors, goals, t.goals, Icons.sports_score_rounded));
    if (assists.isNotEmpty) items.add(_statItem(colors, assists, t.assists, Icons.handshake_rounded));
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 8),
      decoration: BoxDecoration(color: colors.surface, borderRadius: BorderRadius.circular(16), border: Border.all(color: colors.accentGlow.withValues(alpha: 0.18))),
      child: Row(mainAxisAlignment: MainAxisAlignment.center, children: items.map((w) => Padding(padding: const EdgeInsets.symmetric(horizontal: 12), child: w)).toList()),
    );
  }

  Widget _statItem(WeuraColors colors, String value, String label, IconData icon) {
    return Column(mainAxisSize: MainAxisSize.min, children: [
      Icon(icon, size: 18, color: colors.accentGlow),
      const SizedBox(height: 6),
      Text(value, style: TextStyle(color: colors.accentGlow, fontSize: 19, fontWeight: FontWeight.w800)),
      const SizedBox(height: 4),
      Text(label, style: TextStyle(color: colors.textMuted, fontSize: 11.5, fontWeight: FontWeight.w500, letterSpacing: 0.3)),
    ]);
  }

  Widget _miniSection(WeuraColors colors, {required IconData icon, required String title, required String body}) {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Row(children: [
        Icon(icon, size: 13, color: colors.textFaint),
        const SizedBox(width: 6),
        Text(title, style: TextStyle(color: colors.textFaint, fontSize: 11.5, fontWeight: FontWeight.w600, letterSpacing: 0.4)),
      ]),
      const SizedBox(height: 5),
      Text(body, style: TextStyle(color: colors.textSecondary, fontSize: 13.5, height: 1.5)),
    ]);
  }

  String _pickPhoto(Map<String, dynamic> player) {
    final candidates = [player['cutout'], player['render'], player['thumb'], player['photo']];
    for (final c in candidates) {
      final s = c?.toString().trim() ?? '';
      if (s.isNotEmpty) return s;
    }
    return '';
  }

  String _str(dynamic value, [String fallback = '']) {
    if (value == null) return fallback;
    final s = value.toString().trim();
    return s.isEmpty ? fallback : s;
  }

  String _trimNews(String raw) {
    if (raw.length > 220) return '${raw.substring(0, 220)}...';
    return raw;
  }

  String _trimBio(String raw) {
    const maxLen = 350;
    if (raw.length <= maxLen) return raw;
    final sliced = raw.substring(0, maxLen);
    final lastDot = sliced.lastIndexOf('. ');
    if (lastDot > 150) return sliced.substring(0, lastDot + 1).trim();
    return '$sliced...';
  }

  bool _isDuplicateOf(String text, String other) {
    if (text.isEmpty || other.isEmpty) return false;
    final a = text.toLowerCase().trim();
    final b = other.toLowerCase().trim();
    final sampleLength = a.length > 60 ? 60 : a.length;
    if (sampleLength < 20) return b.contains(a);
    return b.contains(a.substring(0, sampleLength));
  }

  List<String> _trophiesList(dynamic raw) {
    if (raw is! List) return const [];
    return raw.map((t) {
      if (t is String) return t.trim();
      if (t is Map) return _str(t['name'] ?? t['title'] ?? t['trophy']);
      return '';
    }).where((s) => s.isNotEmpty).toList();
  }

  String _translatePosition(String raw, _Strings t) {
    if (raw.isEmpty) return '';
    final lower = raw.toLowerCase();
    if (lower.contains('goalkeeper') || lower == 'gk') return t.posGK;
    if (lower.contains('centre-back') || lower.contains('center-back') || lower.contains('centre back') || lower.contains('center back') || lower == 'cb') return t.posCB;
    if (lower.contains('left-back') || lower == 'lb') return t.posLB;
    if (lower.contains('right-back') || lower == 'rb') return t.posRB;
    if (lower.contains('full-back') || lower.contains('full back')) return t.posFB;
    if (lower.contains('defender') || lower.contains('defence') || lower.contains('defense')) return t.posDF;
    if (lower.contains('defensive midfield') || lower.contains('holding midfield')) return t.posDM;
    if (lower.contains('attacking midfield')) return t.posAM;
    if (lower.contains('midfielder') || lower.contains('midfield')) return t.posMF;
    if (lower.contains('left wing') || lower == 'lw') return t.posLW;
    if (lower.contains('right wing') || lower == 'rw') return t.posRW;
    if (lower.contains('striker') || lower.contains('centre-forward') || lower.contains('center-forward') || lower.contains('forward') || lower.contains('attacker')) return t.posST;
    return raw;
  }

  String _translateFoot(String raw, _Strings t) {
    if (raw.isEmpty) return '';
    final lower = raw.toLowerCase();
    if (lower.contains('left')) return t.footLeft;
    if (lower.contains('right')) return t.footRight;
    if (lower.contains('both')) return t.footBoth;
    return raw;
  }

  String _translateNationality(String raw, _Strings t) {
    if (raw.isEmpty) return '';
    return t._nationalities[raw.toLowerCase()] ?? raw;
  }

  String _translateClub(String raw, _Strings t) {
    if (raw.isEmpty) return '';
    return t._clubs[raw.toLowerCase()] ?? raw;
  }

  String _cleanHeight(String raw) {
    if (raw.isEmpty) return '';
    final clean = raw.trim().toLowerCase();
    final metersMatch = RegExp(r'([\d.]+)\s*m\b').firstMatch(clean);
    if (metersMatch != null) {
      final v = double.tryParse(metersMatch.group(1)!);
      if (v != null && v >= 1.0 && v <= 2.5) return '${v.toStringAsFixed(2)} م';
    }
    final cmMatch = RegExp(r'([\d.]+)\s*cm\b').firstMatch(clean);
    if (cmMatch != null) {
      final v = double.tryParse(cmMatch.group(1)!);
      if (v != null && v >= 100 && v <= 250) return '${(v / 100).toStringAsFixed(2)} م';
    }
    final numberMatch = RegExp(r'^(\d{3})$').firstMatch(clean);
    if (numberMatch != null) {
      final v = double.tryParse(numberMatch.group(1)!);
      if (v != null && v >= 100 && v <= 250) return '${(v / 100).toStringAsFixed(2)} م';
    }
    if (raw.length > 10) return raw.substring(0, 10);
    return raw;
  }

  String _calcAge(String birthDate, _Strings t) {
    if (birthDate.isEmpty) return '';
    try {
      final d = DateTime.parse(birthDate);
      final now = DateTime.now();
      int age = now.year - d.year;
      if (now.month < d.month || (now.month == d.month && now.day < d.day)) age--;
      if (age <= 0 || age > 120) return '';
      return t.ageYears(age);
    } catch (_) {
      return '';
    }
  }

  String _formatTransfer(String raw, _Strings t) {
    if (raw.isEmpty) return '';
    final match = RegExp(r'^(.+?)\s+to\s+(.+?)(\s*\((\d{4})\))?$', caseSensitive: false).firstMatch(raw);
    if (match != null) {
      final from = _translateClub(match.group(1)!.trim(), t);
      final to = _translateClub(match.group(2)!.trim(), t);
      final year = match.group(4);
      if (from.isNotEmpty && to.isNotEmpty) {
        return year != null ? t.transferFromToYear(from, to, year) : t.transferFromTo(from, to);
      }
    }
    final singleMatch = RegExp(r'^(.+?)(\s*\((\d{4})\))?$').firstMatch(raw);
    if (singleMatch != null) {
      final club = _translateClub(singleMatch.group(1)!.trim(), t);
      final year = singleMatch.group(3);
      if (club.isNotEmpty) {
        return year != null ? t.transferToYear(club, year) : t.transferTo(club);
      }
    }
    return raw;
  }

  Widget _fallbackAvatar(WeuraColors colors, String name) {
    final letter = name.isNotEmpty ? name[0].toUpperCase() : '?';
    return Container(color: colors.surface, child: Center(child: Text(letter, style: TextStyle(color: colors.accentGlow, fontSize: 38, fontWeight: FontWeight.w800))));
  }
}

class _Strings {
  final bool isAr;
  _Strings(this.isAr);

  static _Strings of(BuildContext context) {
    final code = Localizations.localeOf(context).languageCode;
    return _Strings(code == 'ar');
  }

  String _s(String ar, String en) => isAr ? ar : en;

  String get currentClub => _s('النادي الحالي', 'Current Club');
  String get lastTransfer => _s('آخر انتقال', 'Last Transfer');
  String get marketValue => _s('القيمة السوقية', 'Market Value');
  String get trophies => _s('الألقاب', 'Trophies');
  String get latestNews => _s('آخر الأخبار', 'Latest News');
  String get bio => _s('نبذة', 'Bio');
  String get share => _s('مشاركة', 'Share');
  String get season => _s('الموسم', 'Season');
  String get goals => _s('أهداف', 'Goals');
  String get assists => _s('صناعة', 'Assists');

  String sourcesCount(int n) => _s('$n مصادر', n == 1 ? '1 source' : '$n sources');
  String ageYears(int n) => _s('$n سنة', '$n years');
  String transferFromTo(String from, String to) => _s('من $from إلى $to', 'From $from to $to');
  String transferFromToYear(String from, String to, String year) => _s('من $from إلى $to ($year)', 'From $from to $to ($year)');
  String transferTo(String club) => _s('انتقل إلى $club', 'Joined $club');
  String transferToYear(String club, String year) => _s('انتقل إلى $club ($year)', 'Joined $club ($year)');

  String get posGK => _s('حارس مرمى', 'Goalkeeper');
  String get posCB => _s('قلب دفاع', 'Centre-Back');
  String get posLB => _s('ظهير أيسر', 'Left-Back');
  String get posRB => _s('ظهير أيمن', 'Right-Back');
  String get posFB => _s('ظهير', 'Full-Back');
  String get posDF => _s('مدافع', 'Defender');
  String get posDM => _s('وسط دفاعي', 'Defensive Midfielder');
  String get posAM => _s('وسط هجومي', 'Attacking Midfielder');
  String get posMF => _s('وسط ميدان', 'Midfielder');
  String get posLW => _s('جناح أيسر', 'Left Winger');
  String get posRW => _s('جناح أيمن', 'Right Winger');
  String get posST => _s('مهاجم', 'Forward');

  String get footLeft => _s('قدم يسرى', 'Left foot');
  String get footRight => _s('قدم يمنى', 'Right foot');
  String get footBoth => _s('كلتا القدمين', 'Both feet');

  Map<String, String> get _nationalities {
    if (!isAr) return {};
    return {
      'france': 'فرنسا', 'french': 'فرنسي',
      'argentina': 'الأرجنتين', 'argentinian': 'أرجنتيني',
      'portugal': 'البرتغال', 'portuguese': 'برتغالي',
      'brazil': 'البرازيل', 'brazilian': 'برازيلي',
      'spain': 'إسبانيا', 'spanish': 'إسباني',
      'england': 'إنجلترا', 'english': 'إنجليزي',
      'germany': 'ألمانيا', 'german': 'ألماني',
      'italy': 'إيطاليا', 'italian': 'إيطالي',
      'netherlands': 'هولندا', 'dutch': 'هولندي',
      'belgium': 'بلجيكا', 'belgian': 'بلجيكي',
      'algeria': 'الجزائر', 'algerian': 'جزائري',
      'morocco': 'المغرب', 'moroccan': 'مغربي',
      'tunisia': 'تونس', 'tunisian': 'تونسي',
      'egypt': 'مصر', 'egyptian': 'مصري',
      'norway': 'النرويج', 'norwegian': 'نرويجي',
      'croatia': 'كرواتيا', 'croatian': 'كرواتي',
      'poland': 'بولندا', 'polish': 'بولندي',
      'usa': 'الولايات المتحدة', 'united states': 'الولايات المتحدة',
      'american': 'أمريكي',
      'uruguay': 'أوروغواي', 'uruguayan': 'أوروغواياني',
      'senegal': 'السنغال', 'senegalese': 'سنغالي',
      'cameroon': 'الكاميرون', 'cameroonian': 'كاميروني',
      'nigeria': 'نيجيريا', 'nigerian': 'نيجيري',
      'ghana': 'غانا', 'ghanaian': 'غاني',
      'ivory coast': 'ساحل العاج',
      'japan': 'اليابان', 'japanese': 'ياباني',
      'south korea': 'كوريا الجنوبية', 'korean': 'كوري',
      'australia': 'أستراليا', 'australian': 'أسترالي',
      'mexico': 'المكسيك', 'mexican': 'مكسيكي',
      'canada': 'كندا', 'canadian': 'كندي',
      'sweden': 'السويد', 'swedish': 'سويدي',
      'denmark': 'الدنمارك', 'danish': 'دنماركي',
      'switzerland': 'سويسرا', 'swiss': 'سويسري',
      'turkey': 'تركيا', 'turkish': 'تركي',
      'greece': 'اليونان', 'greek': 'يوناني',
      'russia': 'روسيا', 'russian': 'روسي',
      'serbia': 'صربيا', 'serbian': 'صربي',
      'colombia': 'كولومبيا', 'colombian': 'كولومبي',
      'chile': 'تشيلي', 'chilean': 'تشيلي',
      'peru': 'بيرو', 'peruvian': 'بيروفي',
      'ecuador': 'الإكوادور', 'ecuadorian': 'إكوادوري',
    };
  }

  Map<String, String> get _clubs {
    if (!isAr) return {};
    return {
      'real madrid': 'ريال مدريد',
      'fc barcelona': 'برشلونة', 'barcelona': 'برشلونة',
      'paris saint-germain': 'باريس سان جيرمان',
      'paris saint germain': 'باريس سان جيرمان',
      'psg': 'باريس سان جيرمان',
      'manchester city': 'مانشستر سيتي',
      'manchester united': 'مانشستر يونايتد',
      'man utd': 'مانشستر يونايتد',
      'liverpool': 'ليفربول', 'chelsea': 'تشيلسي',
      'arsenal': 'أرسنال', 'tottenham': 'توتنهام',
      'tottenham hotspur': 'توتنهام',
      'bayern munich': 'بايرن ميونخ', 'bayern': 'بايرن ميونخ',
      'borussia dortmund': 'بوروسيا دورتموند',
      'dortmund': 'بوروسيا دورتموند',
      'juventus': 'يوفنتوس',
      'inter milan': 'إنتر ميلان', 'inter': 'إنتر ميلان',
      'ac milan': 'ميلان', 'milan': 'ميلان',
      'napoli': 'نابولي',
      'atletico madrid': 'أتلتيكو مدريد', 'atlético madrid': 'أتلتيكو مدريد',
      'atletico': 'أتلتيكو مدريد',
      'sevilla': 'إشبيلية', 'valencia': 'فالنسيا',
      'benfica': 'بنفيكا', 'porto': 'بورتو', 'fc porto': 'بورتو',
      'ajax': 'أياكس',
      'inter miami': 'إنتر ميامي',
      'al hilal': 'الهلال', 'al nassr': 'النصر', 'al-nassr': 'النصر',
      'al-ittihad': 'الاتحاد', 'al ittihad': 'الاتحاد',
      'al ahli': 'الأهلي', 'al-ahli': 'الأهلي',
      'al ahly': 'الأهلي', 'zamalek': 'الزمالك',
      'esperance': 'الترجي',
      'newcastle': 'نيوكاسل', 'newcastle united': 'نيوكاسل',
      'aston villa': 'أستون فيلا', 'west ham': 'وست هام',
      'everton': 'إيفرتون', 'leeds': 'ليدز',
      'celtic': 'سيلتيك', 'rangers': 'رينجرز',
      'real betis': 'ريال بيتيس', 'real sociedad': 'ريال سوسييداد',
      'villarreal': 'فياريال', 'athletic bilbao': 'أتلتيك بلباو',
      'monaco': 'موناكو', 'marseille': 'مارسيليا',
      'lyon': 'ليون', 'lille': 'ليل', 'nice': 'نيس',
      'roma': 'روما', 'lazio': 'لاتسيو',
      'atalanta': 'أتالانتا', 'fiorentina': 'فيورنتينا',
      'leipzig': 'لايبزيغ',
      'bayer leverkusen': 'باير ليفركوزن',
      'leverkusen': 'باير ليفركوزن',
      'frankfurt': 'فرانكفورت',
      'wolfsburg': 'فولفسبورغ',
      'monchengladbach': 'مونشنغلادباخ',
    };
  }
}
