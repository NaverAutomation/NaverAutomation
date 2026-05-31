import { createServer } from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import express from 'express';
import { Server as SocketIOServer } from 'socket.io';
import { CONFIG } from './config.js';
import { requireAuth } from './middleware/auth.js';
import apiRouter from './routes/api.js';
import { setIO, startScheduler } from './services/scheduler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: { origin: '*' },
});

// Socket.io를 스케줄러에 연결
setIO(io);

app.use(express.json({ limit: '10mb' }));
app.use(cors());

// API Routes
app.use('/api', requireAuth, apiRouter);

// Serve static files from dist
const distPath = path.join(__dirname, '../../dist');
app.use(express.static(distPath));

// Serve uploaded images static folder
app.use('/uploads', express.static(CONFIG.UPLOAD_DIR));

// Fallback for SPA (Express 5 fix using Regex)
app.get(/.*/, (req, res, next) => {
  if (req.url.startsWith('/api')) return next();
  res.sendFile(path.join(distPath, 'index.html'), (err) => {
    if (err) res.status(404).send('Not Found - Run: npm run client:build');
  });
});

// Socket.io 연결 이벤트
io.on('connection', (socket) => {
  console.log(`[Socket.io] Client connected: ${socket.id}`);
  socket.on('disconnect', () => {
    console.log(`[Socket.io] Client disconnected: ${socket.id}`);
  });
});

export const startServer = (initialPort = CONFIG.PORT) => {
  const maxRetries = 10;

  const findAvailablePort = (port, tryCount = 0) => {
    return new Promise((resolve, reject) => {
      const probe = net.createServer();

      probe.once('error', (err) => {
        probe.close();
        if (err.code === 'EADDRINUSE' && tryCount < maxRetries) {
          console.warn(`[Server] Port ${port} is already in use. Trying next...`);
          resolve(findAvailablePort(port + 1, tryCount + 1));
        } else {
          reject(err);
        }
      });

      probe.once('listening', () => {
        probe.close(() => resolve(port));
      });

      probe.listen(port);
    });
  };

  return new Promise((resolve, reject) => {
    findAvailablePort(initialPort)
      .then((availablePort) => {
        httpServer.listen(availablePort, () => {
          console.log(`✅ Server running on http://localhost:${availablePort}`);
          console.log(`📡 Socket.io enabled`);
          try {
            startScheduler();
          } catch (schedulerErr) {
            console.error(
              '[Startup] Failed to start scheduler automatically:',
              schedulerErr.message,
            );
          }
          resolve({ server: httpServer, port: availablePort });
        });

        httpServer.once('error', (err) => {
          console.error(`[Server] Port ${availablePort} listen error:`, err);
          reject(err);
        });
      })
      .catch((err) => {
        console.error(`[Server] Failed to find available port from ${initialPort}:`, err);
        reject(err);
      });
  });
};

// 직접 실행될 때만 서버를 시작 (예: node src/server/index.js)
if (process.argv[1]?.endsWith('index.js')) {
  startServer();
}
