// ════════════════════════════════════════════════════════════════════
//  TaskFlow — Main Application
// ════════════════════════════════════════════════════════════════════

// ── State ──────────────────────────────────────────────────────────
const state = {
  user: null,
  tasks: [],
  stats: {},
  filter: 'all',         // all | todo | in_progress | done | urgent
  priority: 'all',
  search: '',
  sort: 'created_at',
  order: 'desc',
  view: 'list',          // list | board | grid
  selected: new Set(),
  editingTaskId: null,
  deleteTaskId: null,
  tags: [],
  ws: null,
  wsToken: null,
};

// ── Utility ────────────────────────────────────────────────────────
function $(id) { return document.getElementById(id); }

function toast(msg, type = 'info', duration = 3000) {
  const c = $('toast-container');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  const icon = { success: '✓', error: '✕', info: 'ℹ' }[type] || 'ℹ';
  el.innerHTML = `<span style="font-weight:700">${icon}</span><span>${msg}</span>`;
  c.appendChild(el);
  setTimeout(() => {
    el.classList.add('removing');
    el.addEventListener('animationend', () => el.remove());
  }, duration);
}

function setLoading(btn, loading) {
  const text = btn.querySelector('.btn-text');
  const loader = btn.querySelector('.btn-loader');
  if (!text || !loader) { btn.disabled = loading; return; }
  text.classList.toggle('hidden', loading);
  loader.classList.toggle('hidden', !loading);
  btn.disabled = loading;
}

function formatDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr + 'T00:00:00');
  const now = new Date(); now.setHours(0,0,0,0);
  const diff = Math.round((d - now) / 86400000);
  if (diff < 0) return { label: `${Math.abs(diff)}d overdue`, cls: 'overdue' };
  if (diff === 0) return { label: 'Due today', cls: 'soon' };
  if (diff === 1) return { label: 'Due tomorrow', cls: 'soon' };
  if (diff <= 7) return { label: `Due in ${diff}d`, cls: '' };
  return { label: d.toLocaleDateString('en', { month: 'short', day: 'numeric' }), cls: '' };
}

function initials(name) {
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
}

function setAvatar(el, user) {
  if (!el || !user) return;
  el.textContent = initials(user.name);
  el.style.background = user.avatar_color;
}

const PRIORITY_ORDER = { urgent: 4, high: 3, medium: 2, low: 1 };

// ── Auth ───────────────────────────────────────────────────────────
async function checkAuth() {
  try {
    const { user } = await API.auth.me();
    onLogin(user);
  } catch {
    showScreen('auth');
  }
}

function onLogin(user) {
  state.user = user;
  showScreen('app');
  setAvatar($('sidebar-avatar'), user);
  $('sidebar-name').textContent = user.name;
  $('sidebar-email').textContent = user.email;
  setAvatar($('profile-avatar-display'), user);
  $('profile-name-display').textContent = user.name;
  $('profile-email-display').textContent = user.email;
  $('profile-name').value = user.name;
  connectWS();
  loadTasks();
}

function showScreen(name) {
  $('auth-screen').classList.toggle('hidden', name !== 'auth');
  $('app-screen').classList.toggle('hidden', name !== 'app');
}

// Auth forms
document.querySelectorAll('.auth-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
    tab.classList.add('active');
    $(`${tab.dataset.tab}-form`).classList.add('active');
  });
});

$('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = e.target.querySelector('button[type=submit]');
  const errEl = $('login-error');
  errEl.classList.add('hidden');
  setLoading(btn, true);
  try {
    const { user } = await API.auth.login({
      email: $('login-email').value,
      password: $('login-password').value,
    });
    onLogin(user);
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  } finally { setLoading(btn, false); }
});

$('register-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = e.target.querySelector('button[type=submit]');
  const errEl = $('register-error');
  errEl.classList.add('hidden');
  setLoading(btn, true);
  try {
    const { user } = await API.auth.register({
      name: $('reg-name').value,
      email: $('reg-email').value,
      password: $('reg-password').value,
    });
    onLogin(user);
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  } finally { setLoading(btn, false); }
});

// ── WebSocket ──────────────────────────────────────────────────────
function connectWS() {
  const token = document.cookie.split(';').find(c => c.trim().startsWith('token='))?.split('=')[1];
  if (!token) return;

  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(`${proto}//${location.host}/ws?token=${token}`);
  state.ws = ws;

  ws.onopen = () => {
    $('ws-indicator').classList.add('connected');
  };
  ws.onclose = () => {
    $('ws-indicator').classList.remove('connected');
    // Reconnect after 3s
    setTimeout(() => { if (state.user) connectWS(); }, 3000);
  };
  ws.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data);
      if (msg.type === 'task:created' || msg.type === 'task:updated' || msg.type === 'task:deleted') {
        loadTasks(false); // silent reload
      }
    } catch {}
  };
}

// ── Tasks ──────────────────────────────────────────────────────────
async function loadTasks(showLoader = true) {
  if (showLoader) {
    $('loading-state').classList.remove('hidden');
    $('empty-state').classList.add('hidden');
    $('tasks-container').innerHTML = '';
  }

  try {
    const params = {};
    if (state.filter === 'urgent') { params.priority = 'urgent'; }
    else if (state.filter !== 'all') { params.status = state.filter; }
    if (state.priority !== 'all') params.priority = state.priority;
    if (state.search) params.search = state.search;
    params.sort = state.sort;
    params.order = state.order;

    const { tasks, stats } = await API.tasks.list(params);
    state.tasks = tasks;
    state.stats = stats;

    updateStats(stats);
    updateBadges(stats);
    renderTasks();
  } catch (err) {
    toast('Failed to load tasks: ' + err.message, 'error');
  } finally {
    $('loading-state').classList.add('hidden');
  }
}

function updateStats(stats) {
  $('stat-total').textContent = stats.total ?? 0;
  $('stat-todo').textContent = stats.todo ?? 0;
  $('stat-progress').textContent = stats.in_progress ?? 0;
  $('stat-done').textContent = stats.done ?? 0;
  $('stat-urgent').textContent = stats.urgent ?? 0;
}

function updateBadges(stats) {
  $('badge-all').textContent = stats.total ?? 0;
  $('badge-todo').textContent = stats.todo ?? 0;
  $('badge-progress').textContent = stats.in_progress ?? 0;
  $('badge-done').textContent = stats.done ?? 0;
  $('badge-urgent').textContent = stats.urgent ?? 0;
}

function renderTasks() {
  const tasks = state.tasks;

  if (state.view === 'board') {
    renderBoard(tasks);
    return;
  }

  $('board-container').classList.add('hidden');
  $('tasks-container').classList.remove('hidden');

  if (tasks.length === 0) {
    $('empty-state').classList.remove('hidden');
    $('tasks-container').innerHTML = '';
    return;
  }
  $('empty-state').classList.add('hidden');

  const container = $('tasks-container');
  container.innerHTML = tasks.map(t => renderTaskItem(t)).join('');
  bindTaskEvents();

  // Apply grid class
  container.closest('.task-area').classList.toggle('grid-view', state.view === 'grid');
}

function renderTaskItem(t) {
  const due = t.due_date ? formatDate(t.due_date) : null;
  const isDone = t.status === 'done';
  const isSelected = state.selected.has(t.id);
  const tags = t.tags || [];

  return `
    <div class="task-item ${isDone ? 'done-task' : ''} ${isSelected ? 'selected' : ''}" data-id="${t.id}">
      <input type="checkbox" class="task-select" data-id="${t.id}" ${isSelected ? 'checked' : ''} title="Select task" onclick="event.stopPropagation()">
      <div class="task-checkbox ${isDone ? 'checked' : ''}" data-id="${t.id}" data-action="toggle" title="${isDone ? 'Mark todo' : 'Mark done'}"></div>
      <div class="task-body">
        <div class="task-title">${escHtml(t.title)}</div>
        ${t.description ? `<div class="task-desc">${escHtml(t.description)}</div>` : ''}
        <div class="task-meta">
          <span class="badge status-${t.status}">${statusLabel(t.status)}</span>
          <span class="badge priority-${t.priority}">${t.priority}</span>
          ${due ? `<span class="due-date ${due.cls}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
            ${due.label}
          </span>` : ''}
          ${tags.slice(0,3).map(tag => `<span class="tag">${escHtml(tag)}</span>`).join('')}
          ${tags.length > 3 ? `<span class="tag">+${tags.length - 3}</span>` : ''}
        </div>
      </div>
      <div class="task-actions">
        <button class="task-action-btn" data-id="${t.id}" data-action="edit" title="Edit">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button class="task-action-btn delete" data-id="${t.id}" data-action="delete" title="Delete">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
        </button>
      </div>
    </div>
  `;
}

function renderBoard(tasks) {
  $('tasks-container').classList.add('hidden');
  $('board-container').classList.remove('hidden');
  $('empty-state').classList.add('hidden');

  const cols = { todo: [], in_progress: [], done: [] };
  tasks.forEach(t => { if (cols[t.status]) cols[t.status].push(t); });

  Object.entries(cols).forEach(([status, items]) => {
    const el = $(`col-${status}`);
    const countEl = $(`col-count-${status}`);
    if (countEl) countEl.textContent = items.length;
    if (!el) return;
    el.innerHTML = items.map(t => `
      <div class="board-task" data-id="${t.id}" data-action="edit">
        <div class="task-title">${escHtml(t.title)}</div>
        <div class="task-meta">
          <span class="badge priority-${t.priority}">${t.priority}</span>
          ${t.due_date ? (() => { const d = formatDate(t.due_date); return `<span class="due-date ${d.cls}">${d.label}</span>`; })() : ''}
        </div>
      </div>
    `).join('') || '<p style="color:var(--text3);font-size:.8rem;text-align:center;padding:20px 0">No tasks</p>';
  });

  // Bind board click events
  document.querySelectorAll('.board-task').forEach(el => {
    el.addEventListener('click', () => openTaskModal(el.dataset.id));
  });
}

function bindTaskEvents() {
  // Checkbox toggle
  document.querySelectorAll('[data-action="toggle"]').forEach(el => {
    el.addEventListener('click', async (e) => {
      e.stopPropagation();
      const task = state.tasks.find(t => t.id === el.dataset.id);
      if (!task) return;
      const newStatus = task.status === 'done' ? 'todo' : 'done';
      try {
        await API.tasks.setStatus(task.id, newStatus);
        toast(newStatus === 'done' ? 'Task completed!' : 'Task reopened', 'success');
        loadTasks(false);
      } catch (err) { toast(err.message, 'error'); }
    });
  });

  // Edit
  document.querySelectorAll('[data-action="edit"]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      openTaskModal(el.dataset.id);
    });
  });

  // Delete
  document.querySelectorAll('[data-action="delete"]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      state.deleteTaskId = el.dataset.id;
      $('confirm-modal-overlay').classList.remove('hidden');
    });
  });

  // Row click → edit
  document.querySelectorAll('.task-item').forEach(el => {
    el.addEventListener('click', () => openTaskModal(el.dataset.id));
  });

  // Select checkboxes
  document.querySelectorAll('.task-select').forEach(el => {
    el.addEventListener('change', () => {
      if (el.checked) state.selected.add(el.dataset.id);
      else state.selected.delete(el.dataset.id);
      updateBulkActions();
      el.closest('.task-item')?.classList.toggle('selected', el.checked);
    });
  });
}

function updateBulkActions() {
  const n = state.selected.size;
  $('bulk-actions').classList.toggle('hidden', n === 0);
  $('selected-count').textContent = `${n} selected`;
}

function statusLabel(s) {
  return { todo: 'To Do', in_progress: 'In Progress', done: 'Done' }[s] || s;
}

function escHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Task Modal ─────────────────────────────────────────────────────
function openTaskModal(taskId = null) {
  state.editingTaskId = taskId;
  state.tags = [];

  const isEdit = !!taskId;
  $('modal-title').textContent = isEdit ? 'Edit Task' : 'New Task';
  $('task-submit').querySelector('.btn-text').textContent = isEdit ? 'Save Changes' : 'Create Task';

  if (isEdit) {
    const task = state.tasks.find(t => t.id === taskId);
    if (!task) return;
    $('task-title').value = task.title;
    $('task-desc').value = task.description || '';
    $('task-status').value = task.status;
    $('task-priority').value = task.priority;
    $('task-due').value = task.due_date || '';
    state.tags = [...(task.tags || [])];
  } else {
    $('task-form').reset();
    $('task-due').value = '';
    state.tags = [];
  }

  renderTagChips();
  $('task-form-error').classList.add('hidden');
  $('task-modal-overlay').classList.remove('hidden');
  setTimeout(() => $('task-title').focus(), 50);
}

function closeTaskModal() {
  $('task-modal-overlay').classList.add('hidden');
  state.editingTaskId = null;
  state.tags = [];
}

$('new-task-btn').addEventListener('click', () => openTaskModal());
$('modal-close').addEventListener('click', closeTaskModal);
$('modal-cancel').addEventListener('click', closeTaskModal);
$('task-modal-overlay').addEventListener('click', (e) => { if (e.target === e.currentTarget) closeTaskModal(); });

$('task-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('task-submit');
  const errEl = $('task-form-error');
  errEl.classList.add('hidden');
  setLoading(btn, true);

  const data = {
    title: $('task-title').value.trim(),
    description: $('task-desc').value.trim(),
    status: $('task-status').value,
    priority: $('task-priority').value,
    due_date: $('task-due').value || null,
    tags: state.tags,
  };

  try {
    if (state.editingTaskId) {
      await API.tasks.update(state.editingTaskId, data);
      toast('Task updated', 'success');
    } else {
      await API.tasks.create(data);
      toast('Task created!', 'success');
    }
    closeTaskModal();
    loadTasks(false);
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  } finally { setLoading(btn, false); }
});

// ── Tags Input ─────────────────────────────────────────────────────
function renderTagChips() {
  $('tags-list').innerHTML = state.tags.map((tag, i) => `
    <span class="tag-chip">
      ${escHtml(tag)}
      <button type="button" data-index="${i}" class="remove-tag">×</button>
    </span>
  `).join('');
  document.querySelectorAll('.remove-tag').forEach(btn => {
    btn.addEventListener('click', () => {
      state.tags.splice(Number(btn.dataset.index), 1);
      renderTagChips();
    });
  });
}

$('tag-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault();
    const val = e.target.value.trim().replace(/,/g, '');
    if (val && !state.tags.includes(val) && state.tags.length < 8) {
      state.tags.push(val);
      renderTagChips();
    }
    e.target.value = '';
  }
});
$('tags-input-container').addEventListener('click', () => $('tag-input').focus());

// ── Delete Confirm ─────────────────────────────────────────────────
$('confirm-cancel').addEventListener('click', () => {
  $('confirm-modal-overlay').classList.add('hidden');
  state.deleteTaskId = null;
});
$('confirm-modal-overlay').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) {
    $('confirm-modal-overlay').classList.add('hidden');
    state.deleteTaskId = null;
  }
});
$('confirm-delete').addEventListener('click', async () => {
  if (!state.deleteTaskId) return;
  try {
    await API.tasks.delete(state.deleteTaskId);
    toast('Task deleted', 'info');
    $('confirm-modal-overlay').classList.add('hidden');
    state.deleteTaskId = null;
    loadTasks(false);
  } catch (err) { toast(err.message, 'error'); }
});

// ── Bulk Actions ───────────────────────────────────────────────────
$('bulk-done-btn').addEventListener('click', async () => {
  const ids = [...state.selected];
  try {
    await Promise.all(ids.map(id => API.tasks.setStatus(id, 'done')));
    toast(`${ids.length} tasks marked done`, 'success');
    state.selected.clear();
    updateBulkActions();
    loadTasks(false);
  } catch (err) { toast(err.message, 'error'); }
});

$('bulk-delete-btn').addEventListener('click', async () => {
  const ids = [...state.selected];
  try {
    await API.tasks.bulkDelete(ids);
    toast(`${ids.length} tasks deleted`, 'info');
    state.selected.clear();
    updateBulkActions();
    loadTasks(false);
  } catch (err) { toast(err.message, 'error'); }
});

$('bulk-clear-btn').addEventListener('click', () => {
  state.selected.clear();
  updateBulkActions();
  document.querySelectorAll('.task-select').forEach(cb => { cb.checked = false; });
  document.querySelectorAll('.task-item').forEach(el => el.classList.remove('selected'));
});

// ── Filters & Search ───────────────────────────────────────────────
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    item.classList.add('active');
    state.filter = item.dataset.filter;

    const titles = { all: 'All Tasks', todo: 'To Do', in_progress: 'In Progress', done: 'Completed', urgent: 'Urgent' };
    $('page-title').textContent = titles[state.filter] || 'Tasks';

    loadTasks();
    // Close sidebar on mobile
    if (window.innerWidth <= 768) closeSidebar();
  });
});

$('priority-filter').addEventListener('change', (e) => {
  state.priority = e.target.value;
  loadTasks();
});

$('sort-select').addEventListener('change', (e) => {
  const [sort, order] = e.target.value.split(':');
  state.sort = sort;
  state.order = order;
  loadTasks();
});

let searchTimer;
$('search-input').addEventListener('input', (e) => {
  state.search = e.target.value;
  $('search-clear').classList.toggle('hidden', !state.search);
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => loadTasks(false), 300);
});
$('search-clear').addEventListener('click', () => {
  $('search-input').value = '';
  state.search = '';
  $('search-clear').classList.add('hidden');
  loadTasks(false);
});

// ── View Toggle ────────────────────────────────────────────────────
document.querySelectorAll('.view-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.view = btn.dataset.view;
    renderTasks();
  });
});

// ── Sidebar Toggle (mobile) ────────────────────────────────────────
function openSidebar() {
  $('sidebar').classList.add('open');
  $('sidebar-overlay').classList.remove('hidden');
}
function closeSidebar() {
  $('sidebar').classList.remove('open');
  $('sidebar-overlay').classList.add('hidden');
}
$('menu-toggle').addEventListener('click', openSidebar);
$('sidebar-close').addEventListener('click', closeSidebar);
$('sidebar-overlay').addEventListener('click', closeSidebar);

// ── User Dropdown ──────────────────────────────────────────────────
$('user-menu-btn').addEventListener('click', (e) => {
  e.stopPropagation();
  $('user-dropdown').classList.toggle('hidden');
});
document.addEventListener('click', () => $('user-dropdown')?.classList.add('hidden'));

$('logout-btn').addEventListener('click', async () => {
  await API.auth.logout().catch(() => {});
  if (state.ws) state.ws.close();
  state.user = null;
  state.tasks = [];
  showScreen('auth');
  toast('Signed out', 'info');
});

$('profile-btn').addEventListener('click', () => {
  $('user-dropdown').classList.add('hidden');
  $('profile-modal-overlay').classList.remove('hidden');
});

// ── Profile Modal ──────────────────────────────────────────────────
$('profile-modal-close').addEventListener('click', () => $('profile-modal-overlay').classList.add('hidden'));
$('profile-cancel').addEventListener('click', () => $('profile-modal-overlay').classList.add('hidden'));
$('profile-modal-overlay').addEventListener('click', (e) => { if (e.target === e.currentTarget) $('profile-modal-overlay').classList.add('hidden'); });

$('profile-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errEl = $('profile-error');
  const sucEl = $('profile-success');
  errEl.classList.add('hidden');
  sucEl.classList.add('hidden');

  const data = {};
  const name = $('profile-name').value.trim();
  if (name && name !== state.user.name) data.name = name;
  const cp = $('current-password').value;
  const np = $('new-password').value;
  if (np) { data.current_password = cp; data.new_password = np; }

  if (Object.keys(data).length === 0) {
    errEl.textContent = 'No changes to save.';
    errEl.classList.remove('hidden');
    return;
  }

  try {
    const { user } = await API.auth.updateMe(data);
    state.user = user;
    setAvatar($('sidebar-avatar'), user);
    $('sidebar-name').textContent = user.name;
    setAvatar($('profile-avatar-display'), user);
    $('profile-name-display').textContent = user.name;
    $('current-password').value = '';
    $('new-password').value = '';
    sucEl.textContent = 'Profile updated!';
    sucEl.classList.remove('hidden');
    toast('Profile updated', 'success');
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  }
});

// ── Keyboard Shortcuts ─────────────────────────────────────────────
document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
  if (e.key === 'n' && !e.ctrlKey && !e.metaKey) openTaskModal();
  if (e.key === 'Escape') {
    closeTaskModal();
    $('confirm-modal-overlay').classList.add('hidden');
    $('profile-modal-overlay').classList.add('hidden');
  }
  if (e.key === '/' && !e.ctrlKey) { e.preventDefault(); $('search-input').focus(); }
});

// ── Boot ───────────────────────────────────────────────────────────
checkAuth();
