import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

import '../../core/Settings/app_settings.dart';
import '../../core/Theme/weura_theme.dart';
import '../../services/Voice/voice_service.dart';

class VoiceInputSheet extends StatefulWidget {
  const VoiceInputSheet({
    super.key,
    required this.onSend,
  });

  final ValueChanged<String> onSend;

  @override
  State<VoiceInputSheet> createState() => _VoiceInputSheetState();
}

class _VoiceInputSheetState extends State<VoiceInputSheet>
    with SingleTickerProviderStateMixin {
  final VoiceService _voice = VoiceService.instance;
  final TextEditingController _controller = TextEditingController();

  late final AnimationController _pulseController;

  bool _isListening = false;
  bool _isAvailable = true;
  String? _error;
  bool _didComplete = false;

  /// 'ar' or 'en'
  String _requestedLang = 'ar';

  /// The locale actually being used, or null if unavailable.
  String? _activeLocale;

  @override
  void initState() {
    super.initState();

    _pulseController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1400),
    )..repeat();

    final appLang = AppSettingsManager.instance.language;
    if (appLang == 'Arabic') {
      _requestedLang = 'ar';
    } else if (appLang == 'English') {
      _requestedLang = 'en';
    } else {
      _requestedLang = 'ar';
    }

    _start();
  }

  @override
  void dispose() {
    _didComplete = true;
    _pulseController.dispose();
    _controller.dispose();
    // Fire-and-forget cancel (no await in dispose).
    _voice.cancel();
    super.dispose();
  }

  // ---------------------------------------------------------------------------
  // Flow
  // ---------------------------------------------------------------------------

  Future<void> _start() async {
    if (_didComplete) return;

    final ok = await _voice.init();

    if (!mounted || _didComplete) return;

    if (!ok) {
      setState(() {
        _isAvailable = false;
        _error = 'التعرف على الصوت غير متوفر في هذا الجهاز.';
      });
      return;
    }

    final localeId = _voice.findLocale(_requestedLang);

    String? fallbackLocale;
    String? fallbackLang;

    if (localeId == null) {
      final other = _requestedLang == 'ar' ? 'en' : 'ar';
      fallbackLocale = _voice.findLocale(other);
      if (fallbackLocale != null) {
        fallbackLang = other;
      }
    }

    final activeLocale = localeId ?? fallbackLocale;
    final activeLang =
        localeId != null ? _requestedLang : fallbackLang;

    if (activeLocale == null) {
      setState(() {
        _error = 'لا توجد لغة تعرف صوتي متوفرة في هذا الجهاز.\n'
            'ثبّت حزمة الصوت من متجر Play.';
        _isListening = false;
      });
      return;
    }

    setState(() {
      _activeLocale = activeLocale;
      _isListening = true;
      _error = null;

      if (localeId == null && fallbackLang != null) {
        _error = activeLang == 'en'
            ? 'العربية غير مثبتة في جهازك. جاري الاستماع بالإنجليزية.'
            : 'الإنجليزية غير مثبتة. جاري الاستماع بالعربية.';
      }
    });

    await _voice.startListening(
      localeId: activeLocale,
      onResult: (text, isFinal) {
        if (!mounted || _didComplete) return;
        setState(() => _controller.text = text);
        if (isFinal) {
          setState(() => _isListening = false);
        }
      },
      onError: (message) {
        if (!mounted || _didComplete) return;
        setState(() {
          _error = message;
          _isListening = false;
        });
      },
    );
  }

  Future<void> _switchLanguage(String prefix) async {
    if (_requestedLang == prefix) return;

    await _voice.cancel();

    if (!mounted) return;

    setState(() {
      _requestedLang = prefix;
      _controller.clear();
      _error = null;
      _isListening = false;
    });

    await Future<void>.delayed(const Duration(milliseconds: 200));

    if (!mounted) return;

    await _start();
  }

  Future<void> _stopAndKeep() async {
    await _voice.stop();
    if (mounted) setState(() => _isListening = false);
  }

  Future<void> _cancel() async {
    await _voice.cancel();
    if (mounted) Navigator.of(context).pop();
  }

  void _send() {
    final text = _controller.text.trim();
    if (text.isEmpty) return;

    widget.onSend(text);
    Navigator.of(context).pop();
  }

  // ---------------------------------------------------------------------------
  // Build
  // ---------------------------------------------------------------------------

  @override
  Widget build(BuildContext context) {
    final colors = WeuraColors.of(context);
    final canSend = _controller.text.trim().isNotEmpty;

    return Directionality(
      textDirection: TextDirection.rtl,
      child: Padding(
        padding: EdgeInsets.only(
          bottom: MediaQuery.of(context).viewInsets.bottom,
        ),
        child: SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 16, 20, 20),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                _languageToggle(colors),
                const SizedBox(height: 18),
                Text(
                  _isListening
                      ? 'يستمع...'
                      : (_error != null && !_isAvailable
                          ? 'غير متوفر'
                          : 'إدخال صوتي'),
                  style: TextStyle(
                    color: colors.textPrimary,
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 18),
                _buildMic(colors),
                const SizedBox(height: 18),

                if (_controller.text.isNotEmpty)
                  _transcriptBox(colors)
                else if (_error != null)
                  _errorBox(colors)
                else
                  Text(
                    _isListening
                        ? 'اتكلم الآن...'
                        : 'لم يتم التقاط أي صوت.',
                    style: TextStyle(
                      color: colors.textMuted,
                      fontSize: 13,
                    ),
                  ),

                const SizedBox(height: 18),

                Row(
                  children: [
                    Expanded(
                      child: _outlinedButton(
                        colors: colors,
                        label: 'إلغاء',
                        onTap: _cancel,
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: _filledButton(
                        colors: colors,
                        label: canSend ? 'إرسال' : 'إيقاف',
                        asset: canSend
                            ? 'assets/icons/send.svg'
                            : 'assets/icons/stop.svg',
                        enabled: canSend || _isListening,
                        onTap: () {
                          if (canSend) {
                            _send();
                          } else {
                            _stopAndKeep();
                          }
                        },
                      ),
                    ),
                  ],
                ),

                const SizedBox(height: 10),

                // Helper link
                GestureDetector(
                  onTap: () => _showArabicHelp(colors),
                  child: Text(
                    'اللغة العربية غير مثبتة؟ اضغط هنا',
                    style: TextStyle(
                      color: colors.accentGlow,
                      fontSize: 11,
                      decoration: TextDecoration.underline,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  // ---------------------------------------------------------------------------
  // Sub-widgets
  // ---------------------------------------------------------------------------

  Widget _languageToggle(WeuraColors colors) {
    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: colors.border),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          _langChip(
            colors: colors,
            label: 'العربية',
            code: 'ar',
          ),
          const SizedBox(width: 4),
          _langChip(
            colors: colors,
            label: 'English',
            code: 'en',
          ),
        ],
      ),
    );
  }

  Widget _langChip({
    required WeuraColors colors,
    required String label,
    required String code,
  }) {
    final selected = _requestedLang == code;

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: () => _switchLanguage(code),
        borderRadius: BorderRadius.circular(9),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 160),
          padding: const EdgeInsets.symmetric(
            horizontal: 14,
            vertical: 8,
          ),
          decoration: BoxDecoration(
            color: selected ? colors.accent : Colors.transparent,
            borderRadius: BorderRadius.circular(9),
          ),
          child: Text(
            label,
            style: TextStyle(
              color: selected ? Colors.white : colors.textSecondary,
              fontSize: 13,
              fontWeight:
                  selected ? FontWeight.w700 : FontWeight.w500,
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildMic(WeuraColors colors) {
    final baseColor = _error != null && !_isListening
        ? colors.danger
        : (_isListening ? colors.accentGlow : colors.textMuted);

    return SizedBox(
      width: 110,
      height: 110,
      child: AnimatedBuilder(
        animation: _pulseController,
        builder: (context, _) {
          return Stack(
            alignment: Alignment.center,
            children: [
              if (_isListening) ...[
                _ring(
                  color: baseColor,
                  progress: _pulseController.value,
                  size: 110,
                ),
                _ring(
                  color: baseColor,
                  progress: (_pulseController.value + 0.5) % 1.0,
                  size: 110,
                ),
              ],
              Container(
                width: 62,
                height: 62,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: baseColor.withValues(alpha: 0.12),
                  border: Border.all(
                    color: baseColor.withValues(alpha: 0.35),
                    width: 1.5,
                  ),
                ),
                child: Center(
                  child: SvgPicture.asset(
                    'assets/icons/microphone.svg',
                    width: 28,
                    height: 28,
                    colorFilter: ColorFilter.mode(
                      baseColor,
                      BlendMode.srcIn,
                    ),
                  ),
                ),
              ),
            ],
          );
        },
      ),
    );
  }

  Widget _ring({
    required Color color,
    required double progress,
    required double size,
  }) {
    final scale = 0.5 + (progress * 0.5);
    final opacity = (1.0 - progress).clamp(0.0, 1.0) * 0.45;

    return Transform.scale(
      scale: scale,
      child: Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          border: Border.all(
            color: color.withValues(alpha: opacity),
            width: 2,
          ),
        ),
      ),
    );
  }

  Widget _transcriptBox(WeuraColors colors) {
    return Container(
      width: double.infinity,
      constraints: const BoxConstraints(minHeight: 70),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: colors.border),
      ),
      child: Text(
        _controller.text,
        style: TextStyle(
          color: colors.textPrimary,
          fontSize: 15,
          height: 1.5,
        ),
      ),
    );
  }

  Widget _errorBox(WeuraColors colors) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: colors.danger.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: colors.danger.withValues(alpha: 0.30),
        ),
      ),
      child: Text(
        _error!,
        textAlign: TextAlign.center,
        style: TextStyle(
          color: colors.danger,
          fontSize: 12,
          height: 1.4,
        ),
      ),
    );
  }

  Widget _outlinedButton({
    required WeuraColors colors,
    required String label,
    required VoidCallback onTap,
  }) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: Container(
          height: 50,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: colors.border),
          ),
          child: Center(
            child: Text(
              label,
              style: TextStyle(
                color: colors.textSecondary,
                fontSize: 14,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _filledButton({
    required WeuraColors colors,
    required String label,
    required String asset,
    required bool enabled,
    required VoidCallback onTap,
  }) {
    final bg = enabled ? colors.accent : colors.surfaceAlt;
    final fg = enabled ? Colors.white : colors.textFaint;

    return Material(
      color: bg,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        onTap: enabled ? onTap : null,
        borderRadius: BorderRadius.circular(14),
        child: Container(
          height: 50,
          alignment: Alignment.center,
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              ColorFiltered(
                colorFilter: ColorFilter.mode(fg, BlendMode.srcIn),
                child: SvgPicture.asset(
                  asset,
                  width: 18,
                  height: 18,
                ),
              ),
              const SizedBox(width: 8),
              Text(
                label,
                style: TextStyle(
                  color: fg,
                  fontSize: 14,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  // ---------------------------------------------------------------------------
  // Help dialog
  // ---------------------------------------------------------------------------

  void _showArabicHelp(WeuraColors colors) {
    showDialog<void>(
      context: context,
      builder: (dialogContext) {
        return Directionality(
          textDirection: TextDirection.rtl,
          child: AlertDialog(
            backgroundColor: colors.surfaceAlt,
            title: Text(
              'تنشيط اللغة العربية',
              style: TextStyle(color: colors.textPrimary),
            ),
            content: Text(
              'باش يتعرف WEURA على صوتك بالعربية:\n\n'
              '1. افتح إعدادات التلفون\n'
              '2. Google → الإدخال الصوتي\n'
              '3. اللغات → أضف العربية (السعودية)\n'
              '4. حمّل الحزمة (10 MB)\n\n'
              'بعدها رجع للتطبيق وجرب مرة ثانية.',
              style: TextStyle(
                color: colors.textSecondary,
                fontSize: 13,
                height: 1.6,
              ),
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(dialogContext),
                child: const Text('حسناً'),
              ),
            ],
          ),
        );
      },
    );
  }
}