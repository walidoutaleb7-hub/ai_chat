import 'dart:async';

enum CameraState {
  idle,
  initializing,
  ready,
  capturing,
  error,
  disposed,
}

class CameraResult {
  const CameraResult({
    required this.path,
    required this.timestamp,
  });

  final String path;
  final DateTime timestamp;
}

class CameraService {
  CameraState _state = CameraState.idle;

  CameraState get state => _state;

  bool get isReady => _state == CameraState.ready;

  final StreamController<CameraState> _stateController =
      StreamController<CameraState>.broadcast();

  Stream<CameraState> get stateStream => _stateController.stream;

  Future<bool> initialize() async {
    if (_state == CameraState.disposed) {
      return false;
    }

    _setState(CameraState.initializing);

    try {
      // Camera provider/permission layer will be connected here.
      // No fake camera preview or fake capture is generated.
      _setState(CameraState.ready);
      return true;
    } catch (_) {
      _setState(CameraState.error);
      return false;
    }
  }

  Future<CameraResult?> capture() async {
    if (!isReady) {
      return null;
    }

    _setState(CameraState.capturing);

    try {
      // A real camera provider will return the captured file path.
      // This service intentionally does not invent an image.
      _setState(CameraState.ready);
      return null;
    } catch (_) {
      _setState(CameraState.error);
      return null;
    }
  }

  Future<void> close() async {
    if (_state == CameraState.disposed) {
      return;
    }

    _setState(CameraState.idle);
  }

  void _setState(CameraState value) {
    _state = value;

    if (!_stateController.isClosed) {
      _stateController.add(value);
    }
  }

  void dispose() {
    _state = CameraState.disposed;
    _stateController.close();
  }
}