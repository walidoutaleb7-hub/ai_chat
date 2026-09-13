import 'package:flutter/material.dart';

enum WeuraMessageRole {
  user,
  assistant,
}

class WeuraMessageBubble extends StatelessWidget {
  const WeuraMessageBubble({
    super.key,
    required this.message,
    required this.role,
    this.onCopy,
    this.onRetry,
  });

  final String message;
  final WeuraMessageRole role;
  final VoidCallback? onCopy;
  final VoidCallback? onRetry;

  bool get isUser => role == WeuraMessageRole.user;

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment:
          isUser ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        constraints: const BoxConstraints(
          maxWidth: 720,
        ),
        margin: const EdgeInsets.only(
          left: 10,
          right: 10,
          bottom: 14,
        ),
        child: Column(
          crossAxisAlignment: isUser
              ? CrossAxisAlignment.end
              : CrossAxisAlignment.start,
          children: [
            Container(
              padding: const EdgeInsets.symmetric(
                horizontal: 16,
                vertical: 13,
              ),
              decoration: BoxDecoration(
                color: isUser
                    ? const Color(0xFF315DFF)
                    : const Color(0xFF111119),
                borderRadius: BorderRadius.only(
                  topLeft: const Radius.circular(18),
                  topRight: const Radius.circular(18),
                  bottomLeft: Radius.circular(
                    isUser ? 18 : 5,
                  ),
                  bottomRight: Radius.circular(
                    isUser ? 5 : 18,
                  ),
                ),
                border: isUser
                    ? null
                    : Border.all(
                        color: Colors.white.withValues(
                          alpha: 0.06,
                        ),
                      ),
              ),
              child: SelectableText(
                message,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 15.5,
                  height: 1.55,
                ),
              ),
            ),
            if (!isUser)
              Padding(
                padding: const EdgeInsets.only(
                  left: 4,
                  top: 4,
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    _smallAction(
                      icon: Icons.copy_outlined,
                      tooltip: 'Copy',
                      onPressed: onCopy,
                    ),
                    _smallAction(
                      icon: Icons.refresh_rounded,
                      tooltip: 'Regenerate',
                      onPressed: onRetry,
                    ),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _smallAction({
    required IconData icon,
    required String tooltip,
    VoidCallback? onPressed,
  }) {
    return IconButton(
      tooltip: tooltip,
      onPressed: onPressed,
      splashRadius: 18,
      iconSize: 17,
      padding: const EdgeInsets.all(6),
      constraints: const BoxConstraints(
        minWidth: 32,
        minHeight: 32,
      ),
      icon: Icon(
        icon,
        color: onPressed == null
            ? Colors.white.withValues(alpha: 0.18)
            : Colors.white.withValues(alpha: 0.38),
      ),
    );
  }
}