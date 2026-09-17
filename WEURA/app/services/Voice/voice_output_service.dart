import 'package:flutter/foundation.dart';
import 'package:flutter_tts/flutter_tts.dart';

/// WEURA AI — Text-to-Speech Service.
///
/// Speaks assistant replies aloud. Tracks which message is currently
/// being spoken so the UI can render a stop button on the right
/// bubble only.
class VoiceOutputService extends ChangeNotifier {
  VoiceOutputService._();

  static final VoiceOutputService instance = VoiceOutputService._();

  final FlutterTts _tts = FlutterTts();

  bool _initialized = false;
  String? _speakingId;
  bool _isDisposed = false;

  String? get speakingId => _speakingId;

  bool get isSpeaking => _speakingId != null;

  Future<void> _ensureInit() async {
    if (_initialized) return;
    _initialized = true;

    try {
      await _tts.setSpeechRate(0.5);
      await _tts.setVolume(1.0);
      await _tts.setPitch(1.0);

      _tts.setCompletionHandler(() {
        _clearSpeaking();
      });

      _tts.setCancelHandler(() {
        _clearSpeaking();
      });

      _tts.setErrorHandler((_) {
        _clearSpeaking();
      });
    } catch (_) {}
  }

  void _clearSpeaking() {
    if (_isDisposed) return;
    if (_speakingId == null) return;

    _speakingId = null;
    notifyListeners();
  }

  void _setSpeaking(String id) {
    if (_isDisposed) return;

    _speakingId = id;
    notifyListeners();
  }

  Future<void> speak({
    required String id,
    required String text,
    String? language,
  }) async {
    if (_isDisposed) return;

    await _ensureInit();

    await stop();

    try {
      if (language != null) {
        await _tts.setLanguage(language);
      } else {
        final hasArabic = _hasArabic(text);
        await _tts.setLanguage(hasArabic ? 'ar-SA' : 'en-US');
      }

      _setSpeaking(id);
      await _tts.speak(text);
    } catch (_) {
      _clearSpeaking();
    }
  }

  Future<void> stop() async {
    try {
      await _tts.stop();
    } catch (_) {}
    finally {
      _clearSpeaking();
    }
  }

  Future<void> pause() async {
    try {
      await _tts.pause();
    } catch (_) {}
  }

  bool _hasArabic(String text) {
    for (final rune in text.runes) {
      if ((rune >= 0x0600 && rune <= 0x06FF) ||
          (rune >= 0x0750 && rune <= 0x077F) ||
          (rune >= 0x08A0 && rune <= 0x08FF) ||
          (rune >= 0xFB50 && rune <= 0xFDFF) ||
          (rune >= 0xFE70 && rune <= 0xFEFF)) {
        return true;
      }
    }
    return false;
  }

  @override
  void dispose() {
    _isDisposed = true;
    _tts.stop();
    super.dispose();
  }
}