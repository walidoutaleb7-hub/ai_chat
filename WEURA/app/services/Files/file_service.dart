import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:archive/archive.dart';
import 'package:excel/excel.dart';
import 'package:file_picker/file_picker.dart' as picker;
import 'package:path_provider/path_provider.dart';
import 'package:syncfusion_flutter_pdf/pdf.dart';
import 'package:xml/xml.dart';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

enum WeuraFileType {
  pdf,
  docx,
  xlsx,
  csv,
  txt,
  unknown,
}

extension WeuraFileTypeLabel on WeuraFileType {
  String get label {
    switch (this) {
      case WeuraFileType.pdf:
        return 'PDF';
      case WeuraFileType.docx:
        return 'DOCX';
      case WeuraFileType.xlsx:
        return 'XLSX';
      case WeuraFileType.csv:
        return 'CSV';
      case WeuraFileType.txt:
        return 'TXT';
      case WeuraFileType.unknown:
        return 'File';
    }
  }
}

class WeuraFile {
  const WeuraFile({
    required this.path,
    required this.name,
    required this.type,
    required this.size,
    required this.extractedText,
    this.wasTruncated = false,
  });

  final String path;
  final String name;
  final WeuraFileType type;
  final int size;
  final String extractedText;
  final bool wasTruncated;

  bool get isEmpty => extractedText.trim().isEmpty;

  String get sizeLabel {
    if (size < 1024) return '$size B';
    if (size < 1024 * 1024) {
      return '${(size / 1024).toStringAsFixed(1)} KB';
    }
    return '${(size / (1024 * 1024)).toStringAsFixed(1)} MB';
  }
}

class FileExtractionException implements Exception {
  const FileExtractionException(this.message);
  final String message;

  @override
  String toString() => message;
}

// ---------------------------------------------------------------------------
// FileService
// ---------------------------------------------------------------------------

class FileService {
  static const int maxFileSizeBytes = 10 * 1024 * 1024;
  static const int maxExtractedChars = 15000;

  static const Set<String> supportedExtensions = {
    'pdf',
    'docx',
    'xlsx',
    'csv',
    'txt',
  };

  Future<WeuraFile?> pickAndExtract() async {
    final result = await picker.FilePicker.platform.pickFiles(
      type: picker.FileType.custom,
      allowedExtensions: supportedExtensions.toList(),
      allowMultiple: false,
      withData: false,
    );

    if (result == null || result.files.isEmpty) return null;

    final picked = result.files.first;
    final path = picked.path;

    if (path == null || path.isEmpty) {
      throw const FileExtractionException('Cannot read the selected file.');
    }

    return extractFromPath(path);
  }

  Future<WeuraFile> extractFromPath(String path) async {
    final file = File(path);

    if (!await file.exists()) {
      throw const FileExtractionException('File not found.');
    }

    final name = _fileName(path);
    final extension = _extension(name);

    if (!supportedExtensions.contains(extension)) {
      throw FileExtractionException(
        'Unsupported file type: .$extension\n'
        'Supported: PDF, DOCX, XLSX, CSV, TXT.',
      );
    }

    final size = await file.length();

    if (size == 0) {
      throw const FileExtractionException('The file is empty.');
    }

    if (size > maxFileSizeBytes) {
      final mb = (size / (1024 * 1024)).toStringAsFixed(1);
      throw FileExtractionException(
        'File is too large ($mb MB). Maximum is 10 MB.',
      );
    }

    final type = _detectType(extension);

    String raw;
    try {
      switch (type) {
        case WeuraFileType.pdf:
          raw = await _extractPdf(file);
          break;
        case WeuraFileType.docx:
          raw = await _extractDocx(file);
          break;
        case WeuraFileType.xlsx:
          raw = await _extractXlsx(file);
          break;
        case WeuraFileType.csv:
          raw = await _extractCsv(file);
          break;
        case WeuraFileType.txt:
          raw = await _extractTxt(file);
          break;
        case WeuraFileType.unknown:
          throw const FileExtractionException('Unsupported file type.');
      }
    } on FileExtractionException {
      rethrow;
    } catch (_) {
      throw const FileExtractionException(
        'Could not read this file. It may be corrupted or password-protected.',
      );
    }

    final cleaned = _cleanText(raw);

    if (cleaned.isEmpty) {
      throw const FileExtractionException(
        'No readable text was found in this file.',
      );
    }

    final truncated = cleaned.length > maxExtractedChars;
    final finalText = truncated
        ? '${cleaned.substring(0, maxExtractedChars)}\n\n'
            '[... document truncated to $maxExtractedChars characters ...]'
        : cleaned;

    return WeuraFile(
      path: path,
      name: name,
      type: type,
      size: size,
      extractedText: finalText,
      wasTruncated: truncated,
    );
  }

  // ---------------------------------------------------------------------------
  // PDF
  // ---------------------------------------------------------------------------

  Future<String> _extractPdf(File file) async {
    final bytes = await file.readAsBytes();
    final document = PdfDocument(inputBytes: bytes);

    try {
      final buffer = StringBuffer();
      final extractor = PdfTextExtractor(document);

      for (int i = 0; i < document.pages.count; i++) {
        final pageText = extractor.extractText(
          startPageIndex: i,
          endPageIndex: i,
        );
        if (pageText.trim().isNotEmpty) {
          buffer.writeln('--- Page ${i + 1} ---');
          buffer.writeln(pageText);
          buffer.writeln();
        }
      }

      return buffer.toString();
    } finally {
      document.dispose();
    }
  }

  // ---------------------------------------------------------------------------
  // DOCX
  // ---------------------------------------------------------------------------

  Future<String> _extractDocx(File file) async {
    final bytes = await file.readAsBytes();
    final archive = ZipDecoder().decodeBytes(bytes, verify: true);

    ArchiveFile? entry;
    for (final f in archive.files) {
      if (f.name == 'word/document.xml') {
        entry = f;
        break;
      }
    }

    if (entry == null) {
      throw const FileExtractionException(
        'Invalid DOCX file (missing document.xml).',
      );
    }

    // Safe cast: archive content can be List<int>, Uint8List, or InputStream.
    final content = entry.content;
    List<int> xmlBytes;

    if (content is Uint8List) {
      xmlBytes = content;
    } else if (content is List<int>) {
      xmlBytes = content;
    } else {
      // Fallback: read via InputStream.
      try {
        xmlBytes = content as dynamic;
        if (xmlBytes is! List<int>) {
          throw const FileExtractionException('Invalid DOCX content.');
        }
      } catch (_) {
        throw const FileExtractionException('Invalid DOCX content.');
      }
    }

    final xmlString = _decodeText(xmlBytes);

    final XmlDocument document;
    try {
      document = XmlDocument.parse(xmlString);
    } catch (_) {
      throw const FileExtractionException(
        'Invalid DOCX XML structure.',
      );
    }

    final buffer = StringBuffer();

    for (final paragraph in document.findAllElements('w:p')) {
      final lineBuffer = StringBuffer();
      for (final text in paragraph.findAllElements('w:t')) {
        lineBuffer.write(text.innerText);
      }
      final line = lineBuffer.toString().trim();
      if (line.isNotEmpty) {
        buffer.writeln(line);
      }
    }

    return buffer.toString();
  }

  // ---------------------------------------------------------------------------
  // XLSX
  // ---------------------------------------------------------------------------

  Future<String> _extractXlsx(File file) async {
    final bytes = await file.readAsBytes();
    final excel = Excel.decodeBytes(bytes);

    final buffer = StringBuffer();

    for (final sheetName in excel.tables.keys) {
      final sheet = excel.tables[sheetName];
      if (sheet == null) continue;

      buffer.writeln('--- Sheet: $sheetName ---');

      for (final row in sheet.rows) {
        final cells = <String>[];
        for (final cell in row) {
          final v = cell?.value;
          if (v == null) {
            cells.add('');
          } else {
            cells.add(v.toString().trim());
          }
        }
        if (cells.every((c) => c.isEmpty)) continue;
        buffer.writeln(cells.join(' | '));
      }

      buffer.writeln();
    }

    return buffer.toString();
  }

  // ---------------------------------------------------------------------------
  // CSV / TXT
  // ---------------------------------------------------------------------------

  Future<String> _extractCsv(File file) async {
    final bytes = await file.readAsBytes();
    return _decodeText(bytes);
  }

  Future<String> _extractTxt(File file) async {
    final bytes = await file.readAsBytes();
    return _decodeText(bytes);
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /// Decodes bytes as UTF-8, falling back to Latin-1 for non-UTF8 files.
  /// Uses strict mode so bad bytes trigger the fallback (instead of silently
  /// producing a corrupted string full of U+FFFD).
  String _decodeText(List<int> bytes) {
    try {
      return utf8.decode(bytes, allowMalformed: false);
    } on FormatException {
      return latin1.decode(bytes, allowInvalid: true);
    }
  }

  String _cleanText(String raw) {
    return raw
        .replaceAll('\r\n', '\n')
        .replaceAll('\r', '\n')
        // Remove control chars + Unicode line separators.
        .replaceAll(
          RegExp(r'[\u0000-\u0008\u000B\u000C\u000E-\u001F\u2028\u2029]'),
          '',
        )
        // Collapse 4+ blank lines into 2.
        .replaceAll(RegExp(r'\n{4,}'), '\n\n\n')
        // Collapse excessive spaces per line.
        .replaceAll(RegExp(r'[ \t]{3,}'), '  ')
        .trim();
  }

  String _fileName(String path) {
    final idx = path.lastIndexOf(Platform.pathSeparator);
    return idx == -1 ? path : path.substring(idx + 1);
  }

  String _extension(String name) {
    final idx = name.lastIndexOf('.');
    if (idx == -1 || idx == name.length - 1) return '';
    return name.substring(idx + 1).toLowerCase();
  }

  WeuraFileType _detectType(String extension) {
    switch (extension) {
      case 'pdf':
        return WeuraFileType.pdf;
      case 'docx':
        return WeuraFileType.docx;
      case 'xlsx':
        return WeuraFileType.xlsx;
      case 'csv':
        return WeuraFileType.csv;
      case 'txt':
        return WeuraFileType.txt;
      default:
        return WeuraFileType.unknown;
    }
  }

  // ---------------------------------------------------------------------------
  // Temp file utilities (reserved)
  // ---------------------------------------------------------------------------

  Future<Directory> getTempDir() async {
    final dir = await getTemporaryDirectory();
    final weuraDir = Directory('${dir.path}/weura_files');
    if (!await weuraDir.exists()) {
      await weuraDir.create(recursive: true);
    }
    return weuraDir;
  }

  Future<void> clearTemp() async {
    try {
      final dir = await getTempDir();
      if (await dir.exists()) {
        await dir.delete(recursive: true);
      }
    } catch (_) {}
  }
}