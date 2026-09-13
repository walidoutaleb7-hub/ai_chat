import 'dart:math' as math;

enum WeuraTool {
  search,
  calculator,
  files,
  vision,
  memory,
}

class ToolResult {
  const ToolResult({
    required this.success,
    required this.tool,
    this.output = '',
    this.error,
  });

  final bool success;
  final WeuraTool tool;
  final String output;
  final String? error;

  factory ToolResult.success(
    WeuraTool tool,
    String output,
  ) {
    return ToolResult(
      success: true,
      tool: tool,
      output: output,
    );
  }

  factory ToolResult.failure(
    WeuraTool tool,
    String error,
  ) {
    return ToolResult(
      success: false,
      tool: tool,
      error: error,
    );
  }
}

class ToolManager {
  const ToolManager();

  List<WeuraTool> availableTools() {
    return WeuraTool.values;
  }

  bool supports(WeuraTool tool) {
    return availableTools().contains(tool);
  }

  Future<ToolResult> execute(
    WeuraTool tool, {
    String input = '',
  }) async {
    switch (tool) {
      case WeuraTool.search:
        return _search(input);

      case WeuraTool.calculator:
        return _calculate(input);

      case WeuraTool.files:
        return ToolResult.success(
          tool,
          'File tool is ready for document processing.',
        );

      case WeuraTool.vision:
        return ToolResult.success(
          tool,
          'Vision tool is ready for image analysis.',
        );

      case WeuraTool.memory:
        return ToolResult.success(
          tool,
          'Memory tool is ready.',
        );
    }
  }

  Future<ToolResult> _search(String query) async {
    if (query.trim().isEmpty) {
      return ToolResult.failure(
        WeuraTool.search,
        'Search query cannot be empty.',
      );
    }

    // Real search provider will be connected here.
    // WEURA never invents search results or fake sources.
    return ToolResult.failure(
      WeuraTool.search,
      'No search provider is configured.',
    );
  }

  Future<ToolResult> _calculate(String expression) async {
    try {
      final result = _evaluate(expression);

      if (!result.isFinite) {
        throw const FormatException();
      }

      return ToolResult.success(
        WeuraTool.calculator,
        _formatNumber(result),
      );
    } catch (_) {
      return ToolResult.failure(
        WeuraTool.calculator,
        'Invalid mathematical expression.',
      );
    }
  }

  double _evaluate(String input) {
    final parser = _ExpressionParser(input);
    final result = parser.parse();

    if (!parser.isAtEnd) {
      throw const FormatException();
    }

    return result;
  }

  String _formatNumber(double value) {
    if (value == value.truncateToDouble()) {
      return value.toInt().toString();
    }

    return value
        .toStringAsFixed(10)
        .replaceFirst(RegExp(r'0+$'), '')
        .replaceFirst(RegExp(r'\.$'), '');
  }
}

class _ExpressionParser {
  _ExpressionParser(String input)
      : _input = input.replaceAll(' ', '');

  final String _input;
  int _position = 0;

  bool get isAtEnd => _position >= _input.length;

  double parse() {
    if (_input.isEmpty) {
      throw const FormatException();
    }

    return _parseExpression();
  }

  double _parseExpression() {
    var value = _parseTerm();

    while (!isAtEnd) {
      final char = _input[_position];

      if (char == '+') {
        _position++;
        value += _parseTerm();
      } else if (char == '-') {
        _position++;
        value -= _parseTerm();
      } else {
        break;
      }
    }

    return value;
  }

  double _parseTerm() {
    var value = _parsePower();

    while (!isAtEnd) {
      final char = _input[_position];

      if (char == '*') {
        _position++;
        value *= _parsePower();
      } else if (char == '/') {
        _position++;

        final divisor = _parsePower();

        if (divisor == 0) {
          throw const FormatException();
        }

        value /= divisor;
      } else {
        break;
      }
    }

    return value;
  }

  double _parsePower() {
    var value = _parseUnary();

    if (!isAtEnd && _input[_position] == '^') {
      _position++;
      final exponent = _parsePower();
      value = math.pow(value, exponent).toDouble();
    }

    return value;
  }

  double _parseUnary() {
    if (!isAtEnd && _input[_position] == '+') {
      _position++;
      return _parseUnary();
    }

    if (!isAtEnd && _input[_position] == '-') {
      _position++;
      return -_parseUnary();
    }

    return _parsePrimary();
  }

  double _parsePrimary() {
    if (isAtEnd) {
      throw const FormatException();
    }

    if (_input[_position] == '(') {
      _position++;

      final value = _parseExpression();

      if (isAtEnd || _input[_position] != ')') {
        throw const FormatException();
      }

      _position++;
      return value;
    }

    final start = _position;

    while (!isAtEnd) {
      final char = _input[_position];

      if (RegExp(r'[0-9.]').hasMatch(char)) {
        _position++;
      } else {
        break;
      }
    }

    if (start == _position) {
      throw const FormatException();
    }

    final number = double.tryParse(
      _input.substring(start, _position),
    );

    if (number == null) {
      throw const FormatException();
    }

    return number;
  }
}