import 'dart:io';

import 'package:flutter/material.dart';


class ImageZoomViewer extends StatefulWidget {
  const ImageZoomViewer({
    required this.imageUrl,
    this.localPath,
    this.onSave,
    this.onCopyUrl,
  });

  final String imageUrl;
  final String? localPath;
  final VoidCallback? onSave;
  final VoidCallback? onCopyUrl;

  @override
  State<ImageZoomViewer> createState() => ImageZoomViewerState();
}

class ImageZoomViewerState extends State<ImageZoomViewer>
    with SingleTickerProviderStateMixin {
  final TransformationController _transformController =
      TransformationController();

  late final AnimationController _animController;
  late Animation<Matrix4> _animation;
  bool _isZoomed = false;
  static const double _doubleTapScale = 2.5;

  @override
  void initState() {
    super.initState();
    _animController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 220),
    );
    _animation = Matrix4Tween(
      begin: Matrix4.identity(),
      end: Matrix4.identity(),
    ).animate(
      CurvedAnimation(
        parent: _animController,
        curve: Curves.easeOutCubic,
      ),
    );
    _animController.addListener(_onTick);
    _transformController.addListener(_onTransformChanged);
  }

  @override
  void dispose() {
    _animController.removeListener(_onTick);
    _animController.dispose();
    _transformController.removeListener(_onTransformChanged);
    _transformController.dispose();
    super.dispose();
  }

  void _onTick() {
    _transformController.value = _animation.value;
  }

  void _onTransformChanged() {
    final scale = _transformController.value.getMaxScaleOnAxis();
    final zoomed = scale > 1.05;
    if (zoomed != _isZoomed) {
      setState(() => _isZoomed = zoomed);
    }
  }

  void _animateTo(Matrix4 target) {
    _animation = Matrix4Tween(
      begin: _transformController.value,
      end: target,
    ).animate(
      CurvedAnimation(
        parent: _animController,
        curve: Curves.easeOutCubic,
      ),
    );
    _animController.forward(from: 0);
  }

  void _resetZoom() => _animateTo(Matrix4.identity());

  void _handleDoubleTap() {
    if (_isZoomed) {
      _resetZoom();
    } else {
      final size = MediaQuery.of(context).size;
      final cx = size.width / 2;
      final cy = size.height / 2;
      final target = Matrix4.identity()
        ..translate(cx, cy)
        ..scale(_doubleTapScale, _doubleTapScale, 1.0)
        ..translate(-cx, -cy);
      _animateTo(target);
    }
  }

  void _close() => Navigator.of(context).maybePop();

  Widget _buildImageViewerImage() {
    final path = widget.localPath;
    if (path != null) {
      final file = File(path);
      if (file.existsSync()) {
        return Image.file(
          file,
          fit: BoxFit.contain,
          errorBuilder: (_, __, ___) => _errorImage(),
        );
      }
    }
    return Image.network(
      widget.imageUrl,
      fit: BoxFit.contain,
      loadingBuilder: (context, child, progress) {
        if (progress == null) return child;
        return const Center(
          child: SizedBox(
            width: 32,
            height: 32,
            child: CircularProgressIndicator(
              color: Colors.white,
              strokeWidth: 2.5,
            ),
          ),
        );
      },
      errorBuilder: (_, __, ___) => _errorImage(),
    );
  }

  Widget _errorImage() {
    return const Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.broken_image_outlined, color: Colors.white54, size: 60),
          SizedBox(height: 14),
          Text(
            'Could not load image',
            style: TextStyle(color: Colors.white70, fontSize: 14),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        children: [
          Positioned.fill(
            child: GestureDetector(
              onDoubleTap: _handleDoubleTap,
              child: InteractiveViewer(
                transformationController: _transformController,
                minScale: 1.0,
                maxScale: 6.0,
                boundaryMargin: EdgeInsets.zero,
                constrained: true,
                panEnabled: true,
                scaleEnabled: true,
                clipBehavior: Clip.hardEdge,
                child: Center(child: _buildImageViewerImage()),
              ),
            ),
          ),
          Positioned(
            top: 0,
            left: 0,
            right: 0,
            child: SafeArea(
              bottom: false,
              child: Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 8,
                  vertical: 8,
                ),
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [
                      Colors.black.withValues(alpha: 0.65),
                      Colors.transparent,
                    ],
                  ),
                ),
                child: Row(
                  children: [
                    _iconAction(
                      icon: Icons.close_rounded,
                      tooltip: 'Close',
                      onTap: _close,
                    ),
                    const Spacer(),
                    if (_isZoomed)
                      _iconAction(
                        icon: Icons.center_focus_strong_rounded,
                        tooltip: 'Reset zoom',
                        onTap: _resetZoom,
                      ),
                    if (widget.onCopyUrl != null)
                      _iconAction(
                        icon: Icons.link_rounded,
                        tooltip: 'Copy URL',
                        onTap: () {
                          widget.onCopyUrl!();
                          _close();
                        },
                      ),
                    if (widget.onSave != null)
                      _iconAction(
                        icon: Icons.save_alt_rounded,
                        tooltip: 'Save to gallery',
                        onTap: widget.onSave!,
                      ),
                  ],
                ),
              ),
            ),
          ),
          Positioned(
            bottom: 0,
            left: 0,
            right: 0,
            child: SafeArea(
              top: false,
              child: AnimatedOpacity(
                opacity: _isZoomed ? 0.0 : 1.0,
                duration: const Duration(milliseconds: 300),
                child: Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 20,
                    vertical: 16,
                  ),
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.bottomCenter,
                      end: Alignment.topCenter,
                      colors: [
                        Colors.black.withValues(alpha: 0.65),
                        Colors.transparent,
                      ],
                    ),
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(
                        Icons.pinch_rounded,
                        size: 16,
                        color: Colors.white.withValues(alpha: 0.65),
                      ),
                      const SizedBox(width: 8),
                      Text(
                        'Pinch to zoom • Double-tap to enlarge',
                        style: TextStyle(
                          color: Colors.white.withValues(alpha: 0.75),
                          fontSize: 12,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _iconAction({
    required IconData icon,
    required String tooltip,
    required VoidCallback onTap,
  }) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(24),
        child: Tooltip(
          message: tooltip,
          child: Padding(
            padding: const EdgeInsets.all(10),
            child: Icon(icon, size: 24, color: Colors.white),
          ),
        ),
      ),
    );
  }
}
