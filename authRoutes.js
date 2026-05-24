const express = require('express');
const bcrypt = require('bcryptjs');
const { getDb, uuidv4 } = require('./db');
const { signToken, requireAuth } = require('./auth');

const router = express.Router();

const AVATAR_COLORS = [
  '#6366f1','#8b5cf6','#ec4899','#14b8a6','#f59e0b',
  '#10b981','#3b82f6','#ef4444','#f97316','#06b6d4'
];

// POST /api/auth/register
router.post('/register', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password)
    return res.status(400).json({ error: 'All fields required' });
  if (password.length < 6)
    return res.status(400).json({ error: 'Password must be at least 6 characters' });

  const db = getDb();
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
  if (existing) return res.status(409).json({ error: 'Email already registered' });

  const id = uuidv4();
  const password_hash = await bcrypt.hash(password, 12);
  const avatar_color = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];

  db.prepare('INSERT INTO users (id, name, email, password_hash, avatar_color) VALUES (?, ?, ?, ?, ?)')
    .run(id, name.trim(), email.toLowerCase().trim(), password_hash, avatar_color);

  const token = signToken({ id, name, email: email.toLowerCase() });
  res.cookie('token', token, { httpOnly: true, sameSite: 'lax', maxAge: 7 * 24 * 60 * 60 * 1000 });
  res.json({ user: { id, name, email: email.toLowerCase(), avatar_color } });
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'All fields required' });

  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim());
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

  const token = signToken({ id: user.id, name: user.name, email: user.email });
  res.cookie('token', token, { httpOnly: true, sameSite: 'lax', maxAge: 7 * 24 * 60 * 60 * 1000 });
  res.json({ user: { id: user.id, name: user.name, email: user.email, avatar_color: user.avatar_color } });
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ ok: true });
});

// GET /api/auth/me
router.get('/me', requireAuth, (req, res) => {
  const db = getDb();
  const user = db.prepare('SELECT id, name, email, avatar_color, created_at FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ user });
});

// PUT /api/auth/me
router.put('/me', requireAuth, async (req, res) => {
  const { name, current_password, new_password } = req.body;
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'Not found' });

  const updates = {};
  if (name && name.trim()) updates.name = name.trim();

  if (new_password) {
    if (!current_password) return res.status(400).json({ error: 'Current password required' });
    const valid = await bcrypt.compare(current_password, user.password_hash);
    if (!valid) return res.status(400).json({ error: 'Current password is incorrect' });
    updates.password_hash = await bcrypt.hash(new_password, 12);
  }

  if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'Nothing to update' });

  const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  db.prepare(`UPDATE users SET ${setClauses} WHERE id = ?`).run(...Object.values(updates), user.id);

  const updated = db.prepare('SELECT id, name, email, avatar_color FROM users WHERE id = ?').get(user.id);
  res.json({ user: updated });
});

module.exports = router;
