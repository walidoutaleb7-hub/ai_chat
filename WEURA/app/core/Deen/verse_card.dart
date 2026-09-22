import 'package:flutter/material.dart';

import '../../core/Deen/deen_models.dart';

/// بطاقة آية قرآنية — عرض أنيق بخط عربي
class VerseCard extends StatelessWidget {
  const VerseCard({
    super.key,
    required this.verse,
    this.onTap,
    this.onLongPress,
    this.highlighted = false,
  });

  final QuranVerse verse;
  final VoidCallback? onTap;
  final VoidCallback? onLongPress;
  final bool highlighted;

  @override
  Widget build(BuildContext context) {
    const gold = Color(0xFFD4AF37);
    const cream = Color(0xFFF5F0E1);
    const darkBg = Color(0xFF0A1F17);

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        onLongPress: onLongPress,
        borderRadius: BorderRadius.circular(16),
        child: Container(
          margin: const EdgeInsets.only(bottom: 14),
          padding: const EdgeInsets.all(18),
          decoration: BoxDecoration(
            color: highlighted
                ? gold.withValues(alpha: 0.10)
                : darkBg.withValues(alpha: 0.55),
            borderRadius: BorderRadius.circular(16),
            border: Border.all(
              color: highlighted
                  ? gold.withValues(alpha: 0.55)
                  : gold.withValues(alpha: 0.15),
              width: highlighted ? 1.5 : 1.0,
            ),
            boxShadow: highlighted
                ? [
                    BoxShadow(
                      color: gold.withValues(alpha: 0.20),
                      blurRadius: 20,
                      spreadRadius: 1,
                    ),
                  ]
                : null,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // رقم الآية
              Align(
                alignment: Alignment.centerRight,
                child: Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 5,
                  ),
                  decoration: BoxDecoration(
                    color: gold.withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(
                      color: gold.withValues(alpha: 0.35),
                    ),
                  ),
                  child: Text(
                    verse.ayahNumber.toString(),
                    style: const TextStyle(
                      color: gold,
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 14),

              // نص الآية
              Directionality(
                textDirection: TextDirection.rtl,
                child: Text(
                  verse.text,
                  textAlign: TextAlign.right,
                  style: TextStyle(
                    color: cream,
                    fontSize: 24,
                    height: 2.0,
                    letterSpacing: 0.0,
                    fontFamily: 'serif',
                  ),
                ),
              ),

              // الترجمة إن وجدت
              if (verse.translation != null &&
                  verse.translation!.isNotEmpty) ...[
                const SizedBox(height: 14),
                Divider(
                  color: gold.withValues(alpha: 0.15),
                  height: 1,
                ),
                const SizedBox(height: 14),
                Directionality(
                  textDirection: TextDirection.ltr,
                  child: Text(
                    verse.translation!,
                    style: TextStyle(
                      color: cream.withValues(alpha: 0.65),
                      fontSize: 14,
                      height: 1.6,
                      fontStyle: FontStyle.italic,
                    ),
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}