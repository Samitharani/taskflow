const express = require('express');
const { getDb, uuidv4 } = require('./db');
const { requireAuth } = require('./auth');

const router = express.Router();
router.use(requireAuth);

function parseTags(raw) {
  try { return JSON.parse(raw || '[]'); } catch { return []; }
}

// GET /api/tasks  — list with filters
router.get('/', (req, res) => {
  const db = getDb();
  const { status, priority, search, sort = 'created_at', order = 'desc' } = req.query;

  let query = 'SELECT * FROM tasks WHERE user_id = ?';
  const params = [req.user.id];

  if (status && status !== 'all') { query += ' AND status = ?'; params.push(status); }
  if (priority && priority !== 'all') { query += ' AND priority = ?'; params.push(priority); }
  if (search) { query += ' AND (title LIKE ? OR description LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }

  const allowedSort = ['created_at', 'updated_at', 'due_date', 'priority', 'title'];
  const allowedOrder = ['asc', 'desc'];
  const safeSort = allowedSort.includes(sort) ? sort : 'created_at';
  const safeOrder = allowedOrder.includes(order) ? order : 'desc';

  query += ` ORDER BY ${safeSort} ${safeOrder}`;

  const tasks = db.prepare(query).all(...params).map(t => ({
    ...t, tags: parseTags(t.tags)
  }));

  // Stats
  const all = db.prepare('SELECT status, priority FROM tasks WHERE user_id = ?').all(req.user.id);
  const stats = {
    total: all.length,
    todo: all.filter(t => t.status === 'todo').length,
    in_progress: all.filter(t => t.status === 'in_progress').length,
    done: all.filter(t => t.status === 'done').length,
    urgent: all.filter(t => t.priority === 'urgent').length,
  };

  res.json({ tasks, stats });
});

// POST /api/tasks
router.post('/', (req, res) => {
  const { title, description, status, priority, due_date, tags } = req.body;
  if (!title || !title.trim()) return res.status(400).json({ error: 'Title is required' });

  const db = getDb();
  const id = uuidv4();
  const now = Math.floor(Date.now() / 1000);

  db.prepare(`
    INSERT INTO tasks (id, user_id, title, description, status, priority, due_date, tags, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, req.user.id,
    title.trim(),
    description || '',
    status || 'todo',
    priority || 'medium',
    due_date || null,
    JSON.stringify(Array.isArray(tags) ? tags : []),
    now, now
  );

  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
  res.status(201).json({ task: { ...task, tags: parseTags(task.tags) } });
});

// GET /api/tasks/:id
router.get('/:id', (req, res) => {
  const db = getDb();
  const task = db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  res.json({ task: { ...task, tags: parseTags(task.tags) } });
});

// PUT /api/tasks/:id
router.put('/:id', (req, res) => {
  const db = getDb();
  const task = db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  const { title, description, status, priority, due_date, tags } = req.body;
  const now = Math.floor(Date.now() / 1000);

  db.prepare(`
    UPDATE tasks SET
      title = ?, description = ?, status = ?, priority = ?,
      due_date = ?, tags = ?, updated_at = ?
    WHERE id = ? AND user_id = ?
  `).run(
    title !== undefined ? title.trim() : task.title,
    description !== undefined ? description : task.description,
    status || task.status,
    priority || task.priority,
    due_date !== undefined ? (due_date || null) : task.due_date,
    tags !== undefined ? JSON.stringify(Array.isArray(tags) ? tags : []) : task.tags,
    now,
    req.params.id, req.user.id
  );

  const updated = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  res.json({ task: { ...updated, tags: parseTags(updated.tags) } });
});

// PATCH /api/tasks/:id/status  — quick status toggle
router.patch('/:id/status', (req, res) => {
  const db = getDb();
  const task = db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  const { status } = req.body;
  const allowed = ['todo', 'in_progress', 'done'];
  if (!allowed.includes(status)) return res.status(400).json({ error: 'Invalid status' });

  db.prepare('UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?')
    .run(status, Math.floor(Date.now() / 1000), req.params.id);

  const updated = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  res.json({ task: { ...updated, tags: parseTags(updated.tags) } });
});

// DELETE /api/tasks/:id
router.delete('/:id', (req, res) => {
  const db = getDb();
  const task = db.prepare('SELECT id FROM tasks WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  db.prepare('DELETE FROM tasks WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// DELETE /api/tasks  — bulk delete completed
router.delete('/', (req, res) => {
  const db = getDb();
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'ids required' });
  const placeholders = ids.map(() => '?').join(',');
  db.prepare(`DELETE FROM tasks WHERE id IN (${placeholders}) AND user_id = ?`).run(...ids, req.user.id);
  res.json({ ok: true, deleted: ids.length });
});

module.exports = router;
