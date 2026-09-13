import 'package:flutter/material.dart';

/// WEURA AI — Home Screen
/// Product: WEURA AI
/// Tagline: Think Beyond.
/// Developer: Walid Out — وليد

class HomeScreen extends StatefulWidget {
  const HomeScreen({
    super.key,
    this.onOpenChat,
    this.onOpenHistory,
    this.onOpenMemory,
    this.onOpenSettings,
  });

  final VoidCallback? onOpenChat;
  final VoidCallback? onOpenHistory;
  final VoidCallback? onOpenMemory;
  final VoidCallback? onOpenSettings;

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen>
    with SingleTickerProviderStateMixin {
  late final AnimationController _animationController;
  late final Animation<double> _fadeAnimation;
  late final Animation<Offset> _slideAnimation;

  final TextEditingController _composerController =
      TextEditingController();

  final FocusNode _composerFocusNode = FocusNode();

  bool _isComposerFocused = false;

  @override
  void initState() {
    super.initState();

    _animationController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 700),
    );

    _fadeAnimation = CurvedAnimation(
      parent: _animationController,
      curve: Curves.easeOutCubic,
    );

    _slideAnimation = Tween<Offset>(
      begin: const Offset(0, 0.035),
      end: Offset.zero,
    ).animate(
      CurvedAnimation(
        parent: _animationController,
        curve: Curves.easeOutCubic,
      ),
    );

    _composerFocusNode.addListener(_handleComposerFocus);

    _animationController.forward();
  }

  void _handleComposerFocus() {
    if (!mounted) return;

    setState(() {
      _isComposerFocused = _composerFocusNode.hasFocus;
    });
  }

  @override
  void dispose() {
    _animationController.dispose();
    _composerController.dispose();
    _composerFocusNode
      ..removeListener(_handleComposerFocus)
      ..dispose();

    super.dispose();
  }

  void _submitPrompt() {
    final prompt = _composerController.text.trim();

    if (prompt.isEmpty) {
      widget.onOpenChat?.call();
      return;
    }

    widget.onOpenChat?.call();
  }

  void _selectSuggestion(String text) {
    _composerController
      ..text = text
      ..selection = TextSelection.collapsed(
        offset: text.length,
      );

    _composerFocusNode.requestFocus();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final media = MediaQuery.of(context);

    return Scaffold(
      backgroundColor: theme.scaffoldBackgroundColor,
      body: SafeArea(
        child: FadeTransition(
          opacity: _fadeAnimation,
          child: SlideTransition(
            position: _slideAnimation,
            child: LayoutBuilder(
              builder: (context, constraints) {
                final isWide = constraints.maxWidth >= 900;

                return CustomScrollView(
                  physics: const BouncingScrollPhysics(),
                  slivers: [
                    SliverToBoxAdapter(
                      child: _buildTopBar(
                        context,
                        isWide: isWide,
                      ),
                    ),
                    SliverToBoxAdapter(
                      child: SizedBox(
                        height: isWide ? 90 : 56,
                      ),
                    ),
                    SliverToBoxAdapter(
                      child: Center(
                        child: ConstrainedBox(
                          constraints: const BoxConstraints(
                            maxWidth: 920,
                          ),
                          child: Padding(
                            padding: EdgeInsets.symmetric(
                              horizontal: isWide ? 32 : 20,
                            ),
                            child: Column(
                              children: [
                                _buildHero(context),
                                const SizedBox(height: 42),
                                _buildComposer(context),
                                const SizedBox(height: 22),
                                _buildSuggestions(context),
                                SizedBox(
                                  height: media.viewInsets.bottom > 0
                                      ? 24
                                      : 56,
                                ),
                              ],
                            ),
                          ),
                        ),
                      ),
                    ),
                  ],
                );
              },
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildTopBar(
    BuildContext context, {
    required bool isWide,
  }) {
    final theme = Theme.of(context);

    return Padding(
      padding: EdgeInsets.fromLTRB(
        isWide ? 32 : 18,
        16,
        isWide ? 32 : 18,
        0,
      ),
      child: Row(
        children: [
          _buildLogo(context),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'WEURA AI',
                  style: theme.textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w800,
                    letterSpacing: 0.8,
                  ),
                ),
                Text(
                  'Think Beyond.',
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: theme.textTheme.bodySmall?.color?.withValues(
                      alpha: 0.55,
                    ),
                    letterSpacing: 0.2,
                  ),
                ),
              ],
            ),
          ),
          _buildTopBarButton(
            context,
            icon: Icons.history_rounded,
            tooltip: 'History',
            onPressed: widget.onOpenHistory,
          ),
          const SizedBox(width: 8),
          _buildTopBarButton(
            context,
            icon: Icons.settings_outlined,
            tooltip: 'Settings',
            onPressed: widget.onOpenSettings,
          ),
        ],
      ),
    );
  }

  Widget _buildLogo(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    return Container(
      width: 46,
      height: 46,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: isDark ? Colors.white : Colors.black,
        boxShadow: [
          BoxShadow(
            color: Colors.blueAccent.withValues(alpha: 0.16),
            blurRadius: 24,
            spreadRadius: 1,
          ),
        ],
      ),
      alignment: Alignment.center,
      child: Text(
        'W',
        style: TextStyle(
          color: isDark ? Colors.black : Colors.white,
          fontSize: 21,
          fontWeight: FontWeight.w900,
          letterSpacing: -1,
        ),
      ),
    );
  }

  Widget _buildTopBarButton(
    BuildContext context, {
    required IconData icon,
    required String tooltip,
    VoidCallback? onPressed,
  }) {
    final theme = Theme.of(context);

    return Tooltip(
      message: tooltip,
      child: Material(
        color: theme.colorScheme.surface.withValues(alpha: 0.75),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(14),
          side: BorderSide(
            color: theme.dividerColor.withValues(alpha: 0.10),
          ),
        ),
        child: InkWell(
          onTap: onPressed,
          borderRadius: BorderRadius.circular(14),
          child: SizedBox(
            width: 44,
            height: 44,
            child: Icon(
              icon,
              size: 20,
              color: theme.iconTheme.color,
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildHero(BuildContext context) {
    final theme = Theme.of(context);

    return Column(
      children: [
        Container(
          width: 72,
          height: 72,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [
                theme.colorScheme.primary.withValues(alpha: 0.95),
                theme.colorScheme.primary.withValues(alpha: 0.48),
              ],
            ),
            boxShadow: [
              BoxShadow(
                color: theme.colorScheme.primary.withValues(alpha: 0.20),
                blurRadius: 42,
                spreadRadius: 4,
              ),
            ],
          ),
          child: const Center(
            child: Text(
              'W',
              style: TextStyle(
                color: Colors.white,
                fontSize: 32,
                fontWeight: FontWeight.w900,
                letterSpacing: -2,
              ),
            ),
          ),
        ),
        const SizedBox(height: 26),
        Text(
          'Think beyond.',
          textAlign: TextAlign.center,
          style: theme.textTheme.headlineLarge?.copyWith(
            fontSize: 38,
            height: 1.08,
            fontWeight: FontWeight.w800,
            letterSpacing: -1.2,
          ),
        ),
        const SizedBox(height: 12),
        ConstrainedBox(
          constraints: const BoxConstraints(
            maxWidth: 610,
          ),
          child: Text(
            'Ask questions, explore ideas, create, code, and solve problems with WEURA AI.',
            textAlign: TextAlign.center,
            style: theme.textTheme.bodyLarge?.copyWith(
              height: 1.55,
              color: theme.textTheme.bodyLarge?.color?.withValues(
                alpha: 0.58,
              ),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildComposer(BuildContext context) {
    final theme = Theme.of(context);
    final primary = theme.colorScheme.primary;

    return AnimatedContainer(
      duration: const Duration(milliseconds: 220),
      curve: Curves.easeOut,
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(
          color: _isComposerFocused
              ? primary.withValues(alpha: 0.55)
              : theme.dividerColor.withValues(alpha: 0.12),
          width: _isComposerFocused ? 1.2 : 1,
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(
              alpha: theme.brightness == Brightness.dark ? 0.18 : 0.06,
            ),
            blurRadius: 30,
            offset: const Offset(0, 12),
          ),
          if (_isComposerFocused)
            BoxShadow(
              color: primary.withValues(alpha: 0.08),
              blurRadius: 35,
              spreadRadius: 1,
            ),
        ],
      ),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(18, 14, 12, 12),
        child: Column(
          children: [
            TextField(
              controller: _composerController,
              focusNode: _composerFocusNode,
              minLines: 1,
              maxLines: 6,
              textInputAction: TextInputAction.newline,
              onSubmitted: (_) => _submitPrompt(),
              decoration: InputDecoration(
                hintText: 'Ask WEURA anything...',
                hintStyle: TextStyle(
                  color: theme.hintColor.withValues(alpha: 0.65),
                ),
                border: InputBorder.none,
                enabledBorder: InputBorder.none,
                focusedBorder: InputBorder.none,
                contentPadding: const EdgeInsets.symmetric(
                  vertical: 4,
                ),
              ),
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                _ComposerActionButton(
                  icon: Icons.add_rounded,
                  label: 'Attach',
                  onPressed: () {},
                ),
                const SizedBox(width: 6),
                _ComposerActionButton(
                  icon: Icons.tune_rounded,
                  label: 'Mode',
                  onPressed: () {},
                ),
                const Spacer(),
                Material(
                  color: primary,
                  shape: const CircleBorder(),
                  child: InkWell(
                    onTap: _submitPrompt,
                    customBorder: const CircleBorder(),
                    child: const SizedBox(
                      width: 46,
                      height: 46,
                      child: Icon(
                        Icons.arrow_upward_rounded,
                        color: Colors.white,
                        size: 22,
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSuggestions(BuildContext context) {
    return Wrap(
      alignment: WrapAlignment.center,
      spacing: 9,
      runSpacing: 9,
      children: [
        _SuggestionChip(
          icon: Icons.lightbulb_outline_rounded,
          label: 'Help me think',
          onTap: () => _selectSuggestion(
            'Help me think through an idea.',
          ),
        ),
        _SuggestionChip(
          icon: Icons.code_rounded,
          label: 'Write code',
          onTap: () => _selectSuggestion(
            'Help me write and improve some code.',
          ),
        ),
        _SuggestionChip(
          icon: Icons.search_rounded,
          label: 'Research',
          onTap: () => _selectSuggestion(
            'Research this topic and explain the important points.',
          ),
        ),
        _SuggestionChip(
          icon: Icons.auto_awesome_rounded,
          label: 'Create',
          onTap: () => _selectSuggestion(
            'Help me create something original.',
          ),
        ),
      ],
    );
  }
}

class _ComposerActionButton extends StatelessWidget {
  const _ComposerActionButton({
    required this.icon,
    required this.label,
    required this.onPressed,
  });

  final IconData icon;
  final String label;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Tooltip(
      message: label,
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onPressed,
          borderRadius: BorderRadius.circular(12),
          child: Padding(
            padding: const EdgeInsets.symmetric(
              horizontal: 10,
              vertical: 9,
            ),
            child: Icon(
              icon,
              size: 20,
              color: theme.iconTheme.color?.withValues(
                alpha: 0.72,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _SuggestionChip extends StatelessWidget {
  const _SuggestionChip({
    required this.icon,
    required this.label,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Material(
      color: theme.colorScheme.surface,
      borderRadius: BorderRadius.circular(15),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(15),
        child: Container(
          padding: const EdgeInsets.symmetric(
            horizontal: 13,
            vertical: 10,
          ),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(15),
            border: Border.all(
              color: theme.dividerColor.withValues(alpha: 0.10),
            ),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                icon,
                size: 17,
                color: theme.colorScheme.primary,
              ),
              const SizedBox(width: 7),
              Text(
                label,
                style: theme.textTheme.bodySmall?.copyWith(
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}