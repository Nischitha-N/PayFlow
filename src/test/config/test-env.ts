import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

export const TEST_CONFIG = {
  port: parseInt(process.env.PORT || '3000', 10),
  baseURL: process.env.BASE_URL || `http://localhost:${process.env.PORT || '3000'}`,
  apiKey: process.env.API_KEY || 'test_api_key_playwright_2026',
  databasePath: process.env.DATABASE_PATH
    ? path.resolve(process.env.DATABASE_PATH)
    : path.resolve(process.cwd(), 'data', 'payflow.test.db'),
};
