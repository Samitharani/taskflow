# ✅ TaskFlow — Full-Stack Task Management App

A production-ready task management application with:
- **JWT authentication** (cookie-based, secure)
- **Full CRUD** for tasks
- **Real-time updates** via WebSockets
- **3 view modes**: List, Board (Kanban), Grid
- **Filters**: by status, priority, search, sort
- **Bulk actions**: mark done, delete multiple
- **Responsive design** for mobile & desktop
- **SQLite** database (zero config)
- **Dark editorial UI** with smooth animations

---

## 🚀 Quick Start

### Prerequisites
- **Node.js 18+** — https://nodejs.org

### 1. Install & Setup
```bash
cd taskflow
node setup.js
```

### 2. Start the Server
```bash
npm start
```

### 3. Open in Browser
```
http://localhost:3000
```

### 4. Login with Demo Account
```
Email:    test@demo.com
Password: password123
```

---

## 📁 Project Structure

```
taskflow/
├── src/
│   ├── server.js          # Express + WebSocket server
│   ├── db.js              # SQLite database setup
│   ├── auth.js            # JWT helpers & middleware
│   ├── authRoutes.js      # /api/auth/* endpoints
│   └── taskRoutes.js      # /api/tasks/* endpoints
├── public/
│   ├── index.html         # Single-page app shell
│   ├── css/style.css      # Complete styling
│   └── js/
│       ├── api.js         # API client
│       └── app.js         # Frontend application logic
├── data/
│   └── taskflow.db        # SQLite database (auto-created)
├── setup.js               # First-run setup & seeding
├── package.json
└── README.md
```

---

## 🔌 API Endpoints

### Auth
| Method | Path | Description |
|--------|------|-------------|
| POST | /api/auth/register | Create account |
| POST | /api/auth/login | Sign in |
| POST | /api/auth/logout | Sign out |
| GET | /api/auth/me | Get current user |
| PUT | /api/auth/me | Update profile/password |

### Tasks
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/tasks | List tasks (with filters) |
| POST | /api/tasks | Create task |
| GET | /api/tasks/:id | Get task |
| PUT | /api/tasks/:id | Update task |
| PATCH | /api/tasks/:id/status | Quick status change |
| DELETE | /api/tasks/:id | Delete task |
| DELETE | /api/tasks | Bulk delete |

### Query Params for GET /api/tasks
- `status`: todo | in_progress | done
- `priority`: low | medium | high | urgent
- `search`: text search (title + description)
- `sort`: created_at | updated_at | due_date | priority | title
- `order`: asc | desc

---

## 🌐 WebSocket

Connect to `ws://localhost:3000/ws?token=<jwt>`

Events emitted:
- `task:created` — new task created
- `task:updated` — task edited or status changed
- `task:deleted` — task removed

---

## ⌨️ Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `N` | New task |
| `/` | Focus search |
| `Esc` | Close modal |

---

## ⚙️ Configuration

Set environment variables before starting:

```bash
PORT=3000           # Server port (default: 3000)
JWT_SECRET=changeme # Change for production!
```

---

## 🛠 Development

```bash
npm run dev    # Auto-restart on file changes (nodemon)
```
