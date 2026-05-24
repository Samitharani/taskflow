#!/usr/bin/env node
/**
 * TaskFlow Setup Script
 * Run: node setup.js
 */
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

console.log('\n🔧 TaskFlow Setup\n');

// Create data directory
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
  console.log('✓ Created data directory');
}

// Install dependencies
console.log('📦 Installing dependencies...');
try {
  execSync('npm install', { stdio: 'inherit', cwd: __dirname });
  console.log('✓ Dependencies installed\n');
} catch (err) {
  console.error('✗ npm install failed:', err.message);
  process.exit(1);
}

// Seed demo account
console.log('🌱 Creating demo account...');
try {
  const bcrypt = require('bcryptjs');
  const Database = require('better-sqlite3');
  const { v4: uuidv4 } = require('uuid');

  const db = new Database(path.join(dataDir, 'taskflow.db'));
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      avatar_color TEXT NOT NULL DEFAULT '#6366f1',
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'todo' CHECK(status IN ('todo','in_progress','done')),
      priority TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ('low','medium','high','urgent')),
      due_date TEXT,
      tags TEXT DEFAULT '[]',
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get('test@demo.com');
  if (!existing) {
    const userId = uuidv4();
    const hash = bcrypt.hashSync('password123', 12);

    db.prepare('INSERT INTO users (id, name, email, password_hash, avatar_color) VALUES (?, ?, ?, ?, ?)')
      .run(userId, 'Demo User', 'test@demo.com', hash, '#6366f1');

    const now = Math.floor(Date.now() / 1000);
    const sampleTasks = [
      { title: 'Set up project architecture', desc: 'Design the folder structure, choose stack, set up CI/CD pipeline.', status: 'done', priority: 'high', due: null, tags: ['dev', 'planning'] },
      { title: 'Design UI components', desc: 'Create reusable components for buttons, forms, modals, and cards.', status: 'in_progress', priority: 'high', due: new Date(Date.now() + 2*86400000).toISOString().slice(0,10), tags: ['design', 'ui'] },
      { title: 'Write API documentation', desc: 'Document all REST endpoints with request/response examples.', status: 'todo', priority: 'medium', due: new Date(Date.now() + 5*86400000).toISOString().slice(0,10), tags: ['docs'] },
      { title: 'Fix authentication bug', desc: 'Token refresh fails on mobile Safari — investigate and patch.', status: 'todo', priority: 'urgent', due: new Date(Date.now() + 1*86400000).toISOString().slice(0,10), tags: ['bug', 'auth'] },
      { title: 'Add unit tests', desc: 'Cover all service layer functions with at least 80% coverage.', status: 'todo', priority: 'medium', due: null, tags: ['testing'] },
      { title: 'Onboard new team member', desc: 'Share access, walk through codebase, pair program on first task.', status: 'in_progress', priority: 'low', due: new Date(Date.now() + 3*86400000).toISOString().slice(0,10), tags: ['team'] },
      { title: 'Deploy to production', desc: 'Final checks, environment variables, database migrations, go live!', status: 'todo', priority: 'urgent', due: new Date(Date.now() + 7*86400000).toISOString().slice(0,10), tags: ['devops', 'deployment'] },
      { title: 'Update dependencies', desc: 'Audit npm packages, update to latest stable versions, check for breaking changes.', status: 'todo', priority: 'low', due: null, tags: ['maintenance'] },
    ];

    const stmt = db.prepare(`INSERT INTO tasks (id, user_id, title, description, status, priority, due_date, tags, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    sampleTasks.forEach(t => {
      stmt.run(uuidv4(), userId, t.title, t.desc, t.status, t.priority, t.due, JSON.stringify(t.tags), now, now);
    });

    console.log('✓ Demo account created: test@demo.com / password123');
    console.log(`✓ Seeded ${sampleTasks.length} sample tasks\n`);
  } else {
    console.log('ℹ  Demo account already exists\n');
  }

  db.close();
} catch (err) {
  console.log('⚠  Could not seed demo (run the app first):', err.message, '\n');
}

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('✅ Setup complete!\n');
console.log('   Start the app:  npm start');
console.log('   Dev mode:       npm run dev');
console.log('   Open:          http://localhost:3000');
console.log('   Demo login:    test@demo.com / password123');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
