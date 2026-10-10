import 'package:flutter/foundation.dart';

/// Internal model representing a single message in the chat.
///
/// Supports text, image generation, vision analysis, player cards,
/// and image search results.
@immutable
class ChatMessage {
  const ChatMessage({
    required this.text,
    required this.isUser,
    this.isError = false,
    this.imageUrl,
    this.imagePrompt,
    this.visionImagePath,
    this.playerData,
    this.imageLocalPath,
    this.isImageLoading = false,
    this.searchResults,
    this.searchQuery,
    this.isSearching = false,
  });

  final String text;
  final bool isUser;
  final bool isError;

  // Image generation
  final String? imageUrl;
  final String? imagePrompt;
  final String? imageLocalPath;
  final bool isImageLoading;

  // Vision (uploaded image being analyzed)
  final String? visionImagePath;

  // Player card (football)
  final Map<String, dynamic>? playerData;

  // Image search (Pexels)
  final List<Map<String, dynamic>>? searchResults;
  final String? searchQuery;
  final bool isSearching;
}
