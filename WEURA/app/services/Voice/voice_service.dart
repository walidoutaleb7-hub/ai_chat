import 'package:speech_to_text/speech_recognition_result.dart';
import 'package:speech_to_text/speech_to_text.dart';

/// WEURA AI — Voice Input Service.
///
/// Wraps the platform speech-to-text engine.
class VoiceService {
  VoiceService._();

  static final VoiceService instance = VoiceService._();

  final SpeechToText _speech = SpeechToText();

  bool _initialized = false;
  bool _available = false;

  bool get isAvailable => _available;
  bool get isListening => _speech.isListening;

  Future<bool> init() async {
    if (_initialized) return _available;

    _initialized = true;

    try {
      _available = await _speech.initialize();
    } catch (_) {
      _available = false;
    }

    return _available;
  }

  /// Returns the locales supported by the device's speech engine.
  Future<List<LocaleName>> getLocales() async {
    if (!_initialized) await init();
    if (!_available) return [];

    try {
      return await _speech.locales();
    } catch (_) {
      return [];
    }
  }

  /// Finds the best available locale for the given BCP-47 prefix,
  /// e.g. "ar" for Arabic, "en" for English.
  ///
  /// Returns the full locale ID (like "ar-SA") or null if not found.
  Future<String?> findBestLocale(String prefix) async {
    final locales = await getLocales();
    if (locales.isEmpty) return null;

    final lowerPrefix = prefix.toLowerCase();

    // 1. Exact prefix match.
    for (final locale in locales) {
      if (locale.localeId.toLowerCase().startsWith(lowerPrefix)) {
        return locale.localeId;
      }
    }

    return null;
  }

  /// Starts listening in the given language.
  ///
  /// [languagePrefix] is "ar", "en", or null for the device default.
  Future<bool> startListening({
    required void Function(String text, bool isFinal) onResult,
    void Function(String message)? onError,
    String? languagePrefix,
  }) async {
    if (!_initialized) await init();

    if (!_available) {
      onError?.call(
        'Voice recognition is not available on this device.',
      );
      return false;
    }

    String? localeId;

    if (languagePrefix != null && languagePrefix.isNotEmpty) {
      localeId = await findBestLocale(languagePrefix);

      if (localeId == null) {
        onError?.call(
          'This language is not supported by your device voice engine.',
        );
        return false;
      }
    }

    try {
      await _speech.listen(
        localeId: localeId,
        onResult: (SpeechRecognitionResult result) {
          onResult(result.recognizedWords, result.finalResult);
        },
        listenOptions: SpeechListenOptions(
          partialResults: true,
          cancelOnError: true,
          listenMode: ListenMode.dictation,
        ),
      );

      return true;
    } catch (_) {
      onError?.call('Could not start listening.');
      return false;
    }
  }

  Future<void> stop() async {
    try {
      await _speech.stop();
    } catch (_) {}
  }

  Future<void> cancel() async {
    try {
      await _speech.cancel();
    } catch (_) {}
  }
}
