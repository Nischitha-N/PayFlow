import path from 'path';
import dotenv from 'dotenv';

// Load .env if present
dotenv.config();

export interface AppConfig {
  port: number;
  databasePath: string;
  apiKey: string;
  nodeEnv: string;
}

export function getConfig(): AppConfig {
  const databasePath = process.env.DATABASE_PATH
    ? path.resolve(process.env.DATABASE_PATH)
    : path.resolve(process.cwd(), 'data', 'payflow.db');

  return {
    port: parseInt(process.env.PORT || '3000', 10),
    databasePath,
    apiKey: process.env.API_KEY || 'payflow_secret_test_key_2026',
    nodeEnv: process.env.NODE_ENV || 'development',
  };
}
