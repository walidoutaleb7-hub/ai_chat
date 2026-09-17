import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:archive/archive.dart';
import 'package:excel/excel.dart';
import 'package:file_picker/file_picker.dart';
import 'package:path_provider/path_provider.dart';
import 'package:syncfusion_flutter_pdf/pdf.dart';
import 'package:xml/xml.dart';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

enum FileType {
  pdf,
  docx,
  xlsx,
  csv,
  txt,
  unknown,
}

extension FileTypeLabel on FileType {
  String get label {
    switch (this) {
      case FileType.pdf:
        return 'PDF';
      case FileType.docx:
        return 'DOCX';
      case FileType.xlsx:
        return 'XLSX';
      case FileType.csv:
        return 'CSV';
      case FileType.txt:
        return 'TXT';
      case FileType.unknown:
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
  final FileType type;
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
  // ---------------------------------------------------------------------------
  // Limits
  // ---------------------------------------------------------------------------

  /// Maximum file size (10 MB).
  static const int maxFileSizeBytes = 10 * 1024 * 1024;

  /// Maximum characters extracted from a single file.
  /// Groq accepts ~30k tokens, so 15k chars is safe + costs less.
  static const int maxExtractedChars = 15000;

  /// Supported extensions.
  static const Set<String> supportedExtensions = {
    'pdf',
    'docx',
    'xlsx',
    'csv',
    'txt',
  };

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /// Opens the system file picker and returns the selected file,
  /// or null if the user cancelled.
  ///
  /// Throws [FileExtractionException] on error.
  Future<WeuraFile?> pickAndExtract() async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType,
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

  /// Extracts text from a file at [path].
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
        case FileType.pdf:
          raw = await _extractPdf(file);
          break;
        case FileType.docx:
          raw = await _extractDocx(file);
          break;
        case FileType.xlsx:
          raw = await _extractXlsx(file);
          break;
        case FileType.csv:
          raw = await _extractCsv(file);
          break;
        case FileType.txt:
          raw = await _extractTxt(file);
          break;
        case FileType.unknown:
          throw const FileExtractionException('Unsupported file type.');
      }
    } on FileExtractionException {
      rethrow;
    } catch (error) {
      throw FileExtractionException(
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
  // DOCX (ZIP → word/document.xml)
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

    final content = entry.content;
    final xmlBytes = content is List<int> ? content : content as List<int>;
    final xmlString = utf8.decode(xmlBytes, allowMalformed: true);

    final document = XmlDocument.parse(xmlString);
    final buffer = StringBuffer();

    // Extract every <w:t> text node, insert line breaks on <w:p>.
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
        // Skip fully empty rows.
        if (cells.every((c) => c.isEmpty)) continue;
        buffer.writeln(cells.join(' | '));
      }

      buffer.writeln();
    }

    return buffer.toString();
  }

  // ---------------------------------------------------------------------------
  // CSV
  // ---------------------------------------------------------------------------

  Future<String> _extractCsv(File file) async {
    final bytes = await file.readAsBytes();
    return _decodeText(bytes);
  }

  // ---------------------------------------------------------------------------
  // TXT
  // ---------------------------------------------------------------------------

  Future<String> _extractTxt(File file) async {
    final bytes = await file.readAsBytes();
    return _decodeText(bytes);
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /// Decodes bytes as UTF-8, falling back to Latin-1 for non-UTF8 files.
  String _decodeText(List<int> bytes) {
    try {
      return utf8.decode(bytes);
    } catch (_) {
      return latin1.decode(bytes, allowInvalid: true);
    }
  }

  String _cleanText(String raw) {
    return raw
        // Normalize newlines.
        .replaceAll('\r\n', '\n')
        .replaceAll('\r', '\n')
        // Remove NUL and other control characters (except \n and \t).
        .replaceAll(RegExp(r'[\u0000-\u0008\u000B\u000C\u000E-\u001F]'), '')
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

  FileType _detectType(String extension) {
    switch (extension) {
      case 'pdf':
        return FileType.pdf;
      case 'docx':
        return FileType.docx;
      case 'xlsx':
        return FileType.xlsx;
      case 'csv':
        return FileType.csv;
      case 'txt':
        return FileType.txt;
      default:
        return FileType.unknown;
    }
  }

  // ---------------------------------------------------------------------------
  // Temp file utility (reserved for future use)
  // ---------------------------------------------------------------------------

  /// Returns the app's temp directory (created on first access).
  Future<Directory> getTempDir() async {
    final dir = await getTemporaryDirectory();
    final weuraDir = Directory('${dir.path}/weura_files');
    if (!await weuraDir.exists()) {
      await weuraDir.create(recursive: true);
    }
    return weuraDir;
  }

  /// Deletes all cached temp files. Called on app reset.
  Future<void> clearTemp() async {
    try {
      final dir = await getTempDir();
      if (await dir.exists()) {
        await dir.delete(recursive: true);
      }
    } catch (_) {}
  }
}