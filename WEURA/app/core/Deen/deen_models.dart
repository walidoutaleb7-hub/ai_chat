/// WEURA Deen — Models
///
/// نماذج البيانات للقرآن الكريم
class SurahMeta {
  const SurahMeta({
    required this.number,
    required this.arabicName,
    required this.englishName,
    required this.ayahCount,
    required this.isMadinah,
  });

  final int number;
  final String arabicName;
  final String englishName;
  final int ayahCount;
  final bool isMadinah;

  String get place => isMadinah ? 'مدنية' : 'مكية';

  String get displayName => '$number. $arabicName';
}

class QuranVerse {
  const QuranVerse({
    required this.surahNumber,
    required this.ayahNumber,
    required this.text,
    this.translation,
    this.tafsir,
  });

  final int surahNumber;
  final int ayahNumber;
  final String text;
  final String? translation;
  final String? tafsir;

  QuranVerse copyWith({
    String? text,
    String? translation,
    String? tafsir,
  }) {
    return QuranVerse(
      surahNumber: surahNumber,
      ayahNumber: ayahNumber,
      text: text ?? this.text,
      translation: translation ?? this.translation,
      tafsir: tafsir ?? this.tafsir,
    );
  }

  Map<String, dynamic> toJson() => {
        'surah': surahNumber,
        'ayah': ayahNumber,
        'text': text,
        'translation': translation,
      };

  factory QuranVerse.fromJson(Map<String, dynamic> json) {
    return QuranVerse(
      surahNumber: json['surah'] as int,
      ayahNumber: json['ayah'] as int,
      text: json['text']?.toString() ?? '',
      translation: json['translation']?.toString(),
    );
  }
}