import 'dart:io';

enum FileType {
  pdf,
  docx,
  xlsx,
  txt,
  csv,
  image,
  unknown,
}

class WeuraFile {
  const WeuraFile({
    required this.path,
    required this.name,
    required this.type,
    required this.size,
  });

  final String path;
  final String name;
  final FileType type;
  final int size;

  bool get isImage => type == FileType.image;
  bool get isDocument =>
      type == FileType.pdf ||
      type == FileType.docx ||
      type == FileType.xlsx ||
      type == FileType.txt ||
      type == FileType.csv;
}

class FileService {
  static const Set<String> _supportedExtensions = {
    'pdf',
    'docx',
    'xlsx',
    'txt',
    'csv',
    'png',
    'jpg',
    'jpeg',
    'webp',
    'gif',
  };

  Future<WeuraFile?> inspectFile(String path) async {
    final file = File(path);

    if (!await file.exists()) {
      throw Exception('File not found.');
    }

    final name = path.split(Platform.pathSeparator).last;
    final extension = _extension(name);

    if (!_supportedExtensions.contains(extension)) {
      throw Exception(
        'Unsupported file type: .$extension',
      );
    }

    return WeuraFile(
      path: path,
      name: name,
      type: _detectType(extension),
      size: await file.length(),
    );
  }

  Future<List<WeuraFile>> inspectFiles(
    List<String> paths,
  ) async {
    final files = <WeuraFile>[];

    for (final path in paths) {
      try {
        final file = await inspectFile(path);

        if (file != null) {
          files.add(file);
        }
      } catch (_) {
        // Invalid files are skipped without crashing the app.
      }
    }

    return files;
  }

  Future<List<int>> readBytes(String path) async {
    final file = File(path);

    if (!await file.exists()) {
      throw Exception('File not found.');
    }

    return file.readAsBytes();
  }

  Future<String> readText(String path) async {
    final file = File(path);

    if (!await file.exists()) {
      throw Exception('File not found.');
    }

    return file.readAsString();
  }

  String _extension(String name) {
    final index = name.lastIndexOf('.');

    if (index == -1 || index == name.length - 1) {
      return '';
    }

    return name.substring(index + 1).toLowerCase();
  }

  FileType _detectType(String extension) {
    switch (extension) {
      case 'pdf':
        return FileType.pdf;

      case 'docx':
        return FileType.docx;

      case 'xlsx':
        return FileType.xlsx;

      case 'txt':
        return FileType.txt;

      case 'csv':
        return FileType.csv;

      case 'png':
      case 'jpg':
      case 'jpeg':
      case 'webp':
      case 'gif':
        return FileType.image;

      default:
        return FileType.unknown;
    }
  }
}