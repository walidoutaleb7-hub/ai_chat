enum WeuraEnvironment {
  development,
  staging,
  production,
}

class EnvironmentConfig {
  const EnvironmentConfig({
    required this.environment,
    required this.apiBaseUrl,
    this.appName = 'WEURA AI',
    this.appVersion = '1.0.0',
    this.defaultLanguage = 'en',
    this.enableDebugLogs = false,
  });

  final WeuraEnvironment environment;
  final String apiBaseUrl;
  final String appName;
  final String appVersion;
  final String defaultLanguage;
  final bool enableDebugLogs;

  bool get isDevelopment =>
      environment == WeuraEnvironment.development;

  bool get isStaging =>
      environment == WeuraEnvironment.staging;

  bool get isProduction =>
      environment == WeuraEnvironment.production;

  static const development = EnvironmentConfig(
    environment: WeuraEnvironment.development,
    apiBaseUrl: 'http://10.0.2.2:8080',
    defaultLanguage: 'en',
    enableDebugLogs: true,
  );

  static const staging = EnvironmentConfig(
    environment: WeuraEnvironment.staging,
    apiBaseUrl: 'https://staging-api.example.com',
    defaultLanguage: 'en',
  );

  static const production = EnvironmentConfig(
    environment: WeuraEnvironment.production,
    apiBaseUrl: 'https://api.example.com',
    defaultLanguage: 'en',
  );

  EnvironmentConfig copyWith({
    WeuraEnvironment? environment,
    String? apiBaseUrl,
    String? appName,
    String? appVersion,
    String? defaultLanguage,
    bool? enableDebugLogs,
  }) {
    return EnvironmentConfig(
      environment: environment ?? this.environment,
      apiBaseUrl: apiBaseUrl ?? this.apiBaseUrl,
      appName: appName ?? this.appName,
      appVersion: appVersion ?? this.appVersion,
      defaultLanguage:
          defaultLanguage ?? this.defaultLanguage,
      enableDebugLogs:
          enableDebugLogs ?? this.enableDebugLogs,
    );
  }
}