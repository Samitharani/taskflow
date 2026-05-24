const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');
const { verifyToken } = require('./auth');

const app = express();
const server = http.createServer(app);

// ── WebSocket Server ──────────────────────────────────────────────────────────
const wss = new WebSocket.Server({ server, path: '/ws' });
const clients = new Map(); // userId → Set<ws>

wss.on('connection', (ws, req) => {
  // Expect token in query string: ws://host/ws?token=xxx
  const url = new URL(req.url, 'http://localhost');
  const token = url.searchParams.get('token');
  let userId = null;

  try {
    const payload = verifyToken(token);
    userId = payload.id;
    if (!clients.has(userId)) clients.set(userId, new Set());
    clients.get(userId).add(ws);
  } catch {
    ws.close(4001, 'Unauthorized');
    return;
  }

  ws.on('close', () => {
    if (userId && clients.has(userId)) {
      clients.get(userId).delete(ws);
      if (clients.get(userId).size === 0) clients.delete(userId);
    }
  });

  ws.send(JSON.stringify({ type: 'connected', message: 'Real-time sync active' }));
});

function broadcast(userId, event) {
  const sockets = clients.get(userId);
  if (!sockets) return;
  const msg = JSON.stringify(event);
  sockets.forEach(ws => { if (ws.readyState === WebSocket.OPEN) ws.send(msg); });
}

app.set('broadcast', broadcast);

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, '..', 'public')));

// ── API Routes ────────────────────────────────────────────────────────────────
app.use('/api/auth', require('./authRoutes'));

// Wrap task routes to emit WS events on mutations
const taskRouter = require('./taskRoutes');

app.use('/api/tasks', (req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = (data) => {
    // Emit WS event for mutating operations
    if (['POST','PUT','PATCH','DELETE'].includes(req.method) && req.user) {
      const broadcast = req.app.get('broadcast');
      const eventMap = { POST: 'task:created', PUT: 'task:updated', PATCH: 'task:updated', DELETE: 'task:deleted' };
      broadcast(req.user.id, { type: eventMap[req.method], data });
    }
    return originalJson(data);
  };
  next();
}, taskRouter);

// ── SPA fallback ──────────────────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n🚀 TaskFlow running at http://localhost:${PORT}`);
  console.log(`   WebSocket: ws://localhost:${PORT}/ws`);
  console.log(`   Press Ctrl+C to stop\n`);
});
