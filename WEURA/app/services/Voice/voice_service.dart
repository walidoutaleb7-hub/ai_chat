import 'package:speech_to_text/speech_recognition_result.dart';
import 'package:speech_to_text/speech_to_text.dart';

/// WEURA AI — Voice Input Service.
class VoiceService {
  VoiceService._();

  static final VoiceService instance = VoiceService._();

  final SpeechToText _speech = SpeechToText();

  bool _initialized = false;
  bool _available = false;
  List<LocaleName> _cachedLocales = [];

  bool get isAvailable => _available;
  bool get isListening => _speech.isListening;
  List<LocaleName> get locales => List.unmodifiable(_cachedLocales);

  Future<bool> init() async {
    if (_initialized) return _available;

    _initialized = true;

    try {
      _available = await _speech.initialize();

      if (_available) {
        _cachedLocales = await _speech.locales();
      }
    } catch (_) {
      _available = false;
    }

    return _available;
  }

  /// Returns the list of Arabic locales available on this device.
  List<String> arabicLocales() {
    return _cachedLocales
        .where((l) => l.localeId.toLowerCase().startsWith('ar'))
        .map((l) => l.localeId)
        .toList();
  }

  /// Returns the list of English locales available on this device.
  List<String> englishLocales() {
    return _cachedLocales
        .where((l) => l.localeId.toLowerCase().startsWith('en'))
        .map((l) => l.localeId)
        .toList();
  }

  /// Picks the best Arabic or English locale for the requested prefix.
  String? findLocale(String prefix) {
    final lowerPrefix = prefix.toLowerCase();

    final preferred = <String>[
      if (prefix == 'ar') ...[
        'ar-sa', 'ar-eg', 'ar-dz', 'ar-ma', 'ar-tn', 'ar-ae', 'ar-qa',
      ],
      if (prefix == 'en') ...[
        'en-us', 'en-gb', 'en-au', 'en-ca', 'en-in',
      ],
    ];

    for (final code in preferred) {
      for (final locale in _cachedLocales) {
        if (locale.localeId.toLowerCase() == code) {
          return locale.localeId;
        }
      }
    }

    for (final locale in _cachedLocales) {
      if (locale.localeId.toLowerCase().startsWith(lowerPrefix)) {
        return locale.localeId;
      }
    }

    return null;
  }

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
        onResult: (SpeechRecognitionResult result) {
          onResult(result.recognizedWords, result.finalResult);
        },
        listenOptions: SpeechListenOptions(
          partialResults: true,
          cancelOnError: false,
          listenMode: ListenMode.dictation,
          localeId: localeId,
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