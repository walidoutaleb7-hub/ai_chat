export type WeuraEnvironment =
  | 'development'
  | 'staging'
  | 'production';

export interface EnvironmentConfig {
  environment: WeuraEnvironment;
  apiBaseUrl: string;
  appName: string;
  appVersion: string;
  defaultLanguage: string;
  enableDebugLogs: boolean;
}

export const development: EnvironmentConfig = {
  environment: 'development',
  apiBaseUrl: 'http://localhost:8080',
  appName: 'WEURA AI',
  appVersion: '1.0.0',
  defaultLanguage: 'en',
  enableDebugLogs: true,
};

export const staging: EnvironmentConfig = {
  environment: 'staging',
  apiBaseUrl: 'https://staging-api.example.com',
  appName: 'WEURA AI',
  appVersion: '1.0.0',
  defaultLanguage: 'en',
  enableDebugLogs: false,
};

export const production: EnvironmentConfig = {
  environment: 'production',
  apiBaseUrl: 'https://api.example.com',
  appName: 'WEURA AI',
  appVersion: '1.0.0',
  defaultLanguage: 'en',
  enableDebugLogs: false,
};