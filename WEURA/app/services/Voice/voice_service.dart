import 'package:speech_to_text/speech_recognition_result.dart';
import 'package:speech_to_text/speech_to_text.dart';

/// WEURA AI — Voice Input Service.
///
/// Wraps the platform speech-to-text engine (Google on Android,
/// Apple on iOS). Handles initialization, permission request,
/// live transcription and cleanup.
class VoiceService {
  VoiceService._();

  static final VoiceService instance = VoiceService._();

  final SpeechToText _speech = SpeechToText();

  bool _initialized = false;
  bool _available = false;

  bool get isAvailable => _available;
  bool get isListening => _speech.isListening;

  /// Initializes the engine. Safe to call many times — only the
  /// first call touches the platform.
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

  /// Starts listening.
  ///
  /// [onResult] is called repeatedly with the live transcript.
  /// The second argument is `true` when the engine is confident
  /// this is the final result.
  ///
  /// [onError] receives a short, user-safe message.
  ///
  /// [localeId] is a BCP-47 tag like 'ar-SA' or 'en-US'. When null,
  /// the device's default locale is used.
  Future<bool> startListening({
    required void Function(String text, bool isFinal) onResult,
    void Function(String message)? onError,
    String? localeId,
  }) async {
    if (!_initialized) await init();

    if (!_available) {
      onError?.call(
        'Voice recognition is not available on this device.',
      );
      return false;
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

  /// Stops listening and keeps whatever has been recognized.
  Future<void> stop() async {
    try {
      await _speech.stop();
    } catch (_) {
      // Ignore.
    }
  }

  /// Cancels listening and discards the current transcript.
  Future<void> cancel() async {
    try {
      await _speech.cancel();
    } catch (_) {
      // Ignore.
    }
  }
}
