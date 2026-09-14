import 'package:flutter_tts/flutter_tts.dart';

/// WEURA AI — Text-to-Speech Service.
///
/// Speaks assistant replies aloud. Tracks which message is currently
/// being spoken so the UI can render a stop button on the right
/// bubble only.
class VoiceOutputService {
  VoiceOutputService._();

  static final VoiceOutputService instance = VoiceOutputService._();

  final FlutterTts _tts = FlutterTts();

  bool _initialized = false;
  String? _speakingId;

  /// ID of the message currently being spoken, or null.
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
        _speakingId = null;
      });

      _tts.setCancelHandler(() {
        _speakingId = null;
      });

      _tts.setErrorHandler((_) {
        _speakingId = null;
      });
    } catch (_) {
      // Ignore init errors on unsupported platforms.
    }
  }

  /// Starts speaking [text]. [id] is used to track which bubble owns
  /// this utterance.
  ///
  /// [language] is 'ar', 'en' or null for auto-detect.
  Future<void> speak({
    required String id,
    required String text,
    String? language,
  }) async {
    await _ensureInit();

    // Stop whatever was being spoken before.
    await stop();

    try {
      if (language != null) {
        await _tts.setLanguage(language);
      } else {
        // Auto detect: 'ar' if there is Arabic, else 'en'.
        final hasArabic = text.runes.any(
          (r) =>
              (r >= 0x0600 && r <= 0x06FF) ||
              (r >= 0x0750 && r <= 0x077F) ||
              (r >= 0xFB50 && r <= 0xFDFF),
        );

        await _tts.setLanguage(hasArabic ? 'ar' : 'en-US');
      }

      _speakingId = id;
      await _tts.speak(text);
    } catch (_) {
      _speakingId = null;
    }
  }

  /// Stops any current playback.
  Future<void> stop() async {
    try {
      await _tts.stop();
    } catch (_) {
      // Ignore.
    } finally {
      _speakingId = null;
    }
  }
}
