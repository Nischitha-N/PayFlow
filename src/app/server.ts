import { createApp } from './app';
import { getConfig } from './config';

const config = getConfig();
const app = createApp();

const server = app.listen(config.port, () => {
  console.log(`[PayFlow Server] Running on http://localhost:${config.port}`);
  console.log(`[PayFlow Server] Database connected at: ${config.databasePath}`);
});

process.on('SIGTERM', () => {
  console.log('[PayFlow Server] SIGTERM received, shutting down gracefully...');
  server.close(() => {
    process.exit(0);
  });
});
