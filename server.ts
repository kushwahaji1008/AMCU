import 'dotenv/config';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import type http from 'http';
import backendApp, { seedDatabase } from './src/backend/index';
import { dbManager } from './src/backend/Infrastructure/Persistence/Mongo/DatabaseManager';
import { DEFAULT_DATABASE_ID } from './src/backend/Core/RequestContext';

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  // Validate critical configuration early
  if (process.env.NODE_ENV === 'production' && (!process.env.JWT_SECRET || process.env.JWT_SECRET.trim().length < 16)) {
    console.error('FATAL: JWT_SECRET must be set and at least 16 characters long in production.');
    process.exit(1);
  }

  // Initialize shared MongoDB connection pool via DatabaseManager
  if (process.env.MONGODB_URI) {
    try {
      await dbManager.getConnection(DEFAULT_DATABASE_ID);
      console.log('Connected to MongoDB successfully.');
      await seedDatabase();
    } catch (error: any) {
      console.error('MongoDB connection error:', error.message);
      if (error.message?.includes('MongooseServerSelectionError')) {
        console.error(
          "TIP: Check your MongoDB Atlas Network Access whitelist and MONGODB_URI credentials."
        );
      }
    }
  } else {
    console.warn('MONGODB_URI not found in environment variables. Running without MongoDB.');
  }

  // Mount Backend API (includes helmet, cors, body limit, rate limiting, and /api/* 404 fallback)
  app.use(backendApp);

  // Vite middleware for development or static assets for production
  if (process.env.NODE_ENV !== 'production') {
    console.log('Starting Vite in development mode...');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
    console.log('Vite middleware mounted.');
  } else {
    console.log('Starting in production mode...');
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const server: http.Server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  });

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[Server] Received ${signal}. Shutting down gracefully...`);

    const forceTimer = setTimeout(() => {
      console.error('[Server] Forced shutdown after timeout.');
      process.exit(1);
    }, 10000);
    forceTimer.unref();

    server.close(async (closeErr) => {
      if (closeErr) {
        console.error('[Server] Error closing HTTP server:', closeErr);
      }
      try {
        await dbManager.closeAll();
        console.log('[Server] Database connections closed.');
      } catch (dbErr) {
        console.error('[Server] Error closing database connections:', dbErr);
      }
      process.exit(closeErr ? 1 : 0);
    });
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

process.on('unhandledRejection', (reason) => {
  console.error('[Process] Unhandled Rejection:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[Process] Uncaught Exception:', err);
});

startServer();
