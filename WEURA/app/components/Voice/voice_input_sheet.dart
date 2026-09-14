import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

import '../../core/Settings/app_settings.dart';
import '../../core/Theme/weura_theme.dart';
import '../../services/Voice/voice_service.dart';

/// Bottom sheet that listens to the microphone and shows a live
/// transcript. When the user confirms, [onSend] is called with the
/// final text.
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

  @override
  void initState() {
    super.initState();

    _pulseController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1400),
    )..repeat();

    _start();
  }

  @override
  void dispose() {
    _pulseController.dispose();
    _controller.dispose();
    _voice.cancel();
    super.dispose();
  }

  String? _localeId() {
    final language = AppSettingsManager.instance.language;

    if (language == 'Arabic') return 'ar-SA';
    if (language == 'English') return 'en-US';

    // Auto: let the platform pick.
    return null;
  }

  Future<void> _start() async {
    final ok = await _voice.init();

    if (!ok) {
      if (mounted) {
        setState(() {
          _isAvailable = false;
          _error = 'Voice recognition is not available on this device.';
        });
      }
      return;
    }

    if (!mounted) return;

    setState(() {
      _isListening = true;
      _error = null;
    });

    await _voice.startListening(
      localeId: _localeId(),
      onResult: (text, isFinal) {
        if (!mounted) return;

        setState(() {
          _controller.text = text;
        });

        if (isFinal) {
          _isListening = false;
        }
      },
      onError: (message) {
        if (!mounted) return;
        setState(() {
          _error = message;
          _isListening = false;
        });
      },
    );
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

  @override
  Widget build(BuildContext context) {
    final colors = WeuraColors.of(context);
    final canSend = _controller.text.trim().isNotEmpty;

    return Padding(
      padding: EdgeInsets.only(
        bottom: MediaQuery.of(context).viewInsets.bottom,
      ),
      child: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 16, 20, 20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              // Title
              Text(
                _isListening ? 'Listening...' : 'Voice input',
                style: TextStyle(
                  color: colors.textPrimary,
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 24),

              // Animated mic
              _buildMic(colors),

              const SizedBox(height: 24),

              // Live transcript
              if (_controller.text.isNotEmpty)
                Container(
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
                )
              else if (_error != null)
                Text(
                  _error!,
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color: colors.danger,
                    fontSize: 13,
                  ),
                )
              else
                Text(
                  _isListening
                      ? 'Speak now...'
                      : 'No speech detected.',
                  style: TextStyle(
                    color: colors.textMuted,
                    fontSize: 13,
                  ),
                ),

              const SizedBox(height: 20),

              // Actions
              Row(
                children: [
                  Expanded(
                    child: _outlinedButton(
                      colors: colors,
                      label: 'Cancel',
                      onTap: _cancel,
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: _filledButton(
                      colors: colors,
                      label: canSend ? 'Send' : 'Stop',
                      icon: canSend
                          ? Icons.send_rounded
                          : Icons.stop_rounded,
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
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildMic(WeuraColors colors) {
    final baseColor = _error != null
        ? colors.danger
        : (_isListening ? colors.accentGlow : colors.textMuted);

    return SizedBox(
      width: 120,
      height: 120,
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
                  size: 120,
                ),
                _ring(
                  color: baseColor,
                  progress: (_pulseController.value + 0.5) % 1.0,
                  size: 120,
                ),
              ],
              Container(
                width: 68,
                height: 68,
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
                    width: 30,
                    height: 30,
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
    required IconData icon,
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
              Icon(icon, size: 18, color: fg),
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
}
