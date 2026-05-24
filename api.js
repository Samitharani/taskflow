// ── API Client ────────────────────────────────────────────────────────────────
const API = {
  async request(method, path, body) {
    const opts = {
      method,
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    };
    if (body !== undefined) opts.body = JSON.stringify(body);

    const res = await fetch('/api' + path, opts);
    const data = await res.json().catch(() => ({}));

    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  },

  get: (path) => API.request('GET', path),
  post: (path, body) => API.request('POST', path, body),
  put: (path, body) => API.request('PUT', path, body),
  patch: (path, body) => API.request('PATCH', path, body),
  delete: (path, body) => API.request('DELETE', path, body),

  // Auth
  auth: {
    me: () => API.get('/auth/me'),
    login: (data) => API.post('/auth/login', data),
    register: (data) => API.post('/auth/register', data),
    logout: () => API.post('/auth/logout'),
    updateMe: (data) => API.put('/auth/me', data),
  },

  // Tasks
  tasks: {
    list: (params = {}) => {
      const q = new URLSearchParams();
      Object.entries(params).forEach(([k,v]) => { if (v && v !== 'all') q.set(k, v); });
      return API.get('/tasks' + (q.toString() ? '?' + q.toString() : ''));
    },
    create: (data) => API.post('/tasks', data),
    update: (id, data) => API.put(`/tasks/${id}`, data),
    setStatus: (id, status) => API.patch(`/tasks/${id}/status`, { status }),
    delete: (id) => API.delete(`/tasks/${id}`),
    bulkDelete: (ids) => API.delete('/tasks', { ids }),
  },
};
