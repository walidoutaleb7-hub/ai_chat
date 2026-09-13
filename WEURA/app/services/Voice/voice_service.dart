import 'dart:async';

enum VoiceState {
  idle,
  listening,
  processing,
  error,
}

class VoiceResult {
  const VoiceResult({
    required this.text,
    this.isFinal = true,
  });

  final String text;
  final bool isFinal;
}

class VoiceService {
  VoiceState _state = VoiceState.idle;

  VoiceState get state => _state;

  final StreamController<VoiceState> _stateController =
      StreamController<VoiceState>.broadcast();

  Stream<VoiceState> get stateStream => _stateController.stream;

  bool get isListening => _state == VoiceState.listening;

  Future<bool> initialize() async {
    // The real speech-recognition provider can be connected here.
    _setState(VoiceState.idle);
    return true;
  }

  Future<void> startListening({
    Duration timeout = const Duration(seconds: 30),
    void Function(VoiceResult result)? onResult,
    void Function(Object error)? onError,
  }) async {
    if (_state == VoiceState.listening) {
      return;
    }

    try {
      _setState(VoiceState.listening);

      // Provider-independent placeholder.
      // No fake transcript is generated.
      await Future<void>.delayed(timeout);

      if (_state == VoiceState.listening) {
        await stopListening();
      }
    } catch (error) {
      _setState(VoiceState.error);
      onError?.call(error);
    }
  }

  Future<void> stopListening() async {
    if (_state != VoiceState.listening) {
      return;
    }

    _setState(VoiceState.processing);

    // A real speech-to-text provider will return the transcript here.
    // Until one is configured, WEURA does not invent a transcript.
    _setState(VoiceState.idle);
  }

  Future<void> cancel() async {
    _setState(VoiceState.idle);
  }

  void _setState(VoiceState value) {
    _state = value;

    if (!_stateController.isClosed) {
      _stateController.add(value);
    }
  }

  void dispose() {
    _stateController.close();
  }
}