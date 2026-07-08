import { useState, useEffect, useCallback } from 'react';
import {
  CheckCircle, Clock, Circle, Trash2, ChevronDown, X, AlertCircle,
  Loader2, Plus, Users, BarChart3, Target, TrendingUp, UserPlus,
  Filter, RefreshCw, ClipboardList, ArrowLeft
} from 'lucide-react';

/* ── Constants ── */
const PRIORITIES = ['high', 'medium', 'low'];
const STATUSES   = ['pending', 'in_progress', 'done'];

const PRIORITY_META = {
  high:   { label: 'High',   color: '#D85A30', bg: 'rgba(216,90,48,0.1)',   border: 'rgba(216,90,48,0.3)',  emoji: '🔴' },
  medium: { label: 'Medium', color: '#EF9F27', bg: 'rgba(239,159,39,0.1)',  border: 'rgba(239,159,39,0.3)', emoji: '🟡' },
  low:    { label: 'Low',    color: '#7AC47A', bg: 'rgba(122,196,122,0.1)', border: 'rgba(122,196,122,0.3)', emoji: '🟢' },
};

const STATUS_META = {
  pending:     { label: 'Pending',     icon: Circle,      color: '#9C8060', bg: 'rgba(156,128,96,0.08)' },
  in_progress: { label: 'In Progress', icon: Clock,       color: '#EF9F27', bg: 'rgba(239,159,39,0.08)' },
  done:        { label: 'Done',        icon: CheckCircle, color: '#7AC47A', bg: 'rgba(122,196,122,0.08)' },
};

const COLUMN_HEADERS = {
  pending:     { emoji: '📋', title: 'Pending',     gradient: 'linear-gradient(135deg, rgba(156,128,96,0.08), rgba(156,128,96,0.03))' },
  in_progress: { emoji: '⚡', title: 'In Progress', gradient: 'linear-gradient(135deg, rgba(239,159,39,0.08), rgba(239,159,39,0.03))' },
  done:        { emoji: '✅', title: 'Completed',   gradient: 'linear-gradient(135deg, rgba(122,196,122,0.08), rgba(122,196,122,0.03))' },
};

const FALLBACK_USERS = [
  { username: 'ayush',  display_name: 'Ayush',  avatar: '🧑‍💻', role: 'admin' },
  { username: 'anujha', display_name: 'Anujha', avatar: '👩‍💼', role: 'member' },
  { username: 'maria',  display_name: 'Maria',  avatar: '👩‍🔬', role: 'member' },
  { username: 'rahul',  display_name: 'Rahul',  avatar: '👨‍💼', role: 'member' },
];

/* ── SQL Task Helpers ── */
const TASKS_API = '/api/tasks';

const SEED_TASKS = [
  {
    id: 'task_1',
    title: 'Review project architecture and design document',
    description: 'Ensure the new summary and transcription workflow aligns with requirements.',
    priority: 'high',
    status: 'in_progress',
    due_date: new Date(Date.now() + 86400000 * 2).toISOString().split('T')[0],
    assigned_to: 'ayush',
    assigned_by: 'ayush',
    meeting_title: 'Project Kickoff Meeting',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: 'task_2',
    title: 'Integrate Mistral API key validation in settings',
    description: 'Add error handling for invalid keys in the frontend and backend.',
    priority: 'high',
    status: 'pending',
    due_date: new Date(Date.now() + 86400000 * 3).toISOString().split('T')[0],
    assigned_to: 'anujha',
    assigned_by: 'ayush',
    meeting_title: 'API Integration Sync',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: 'task_3',
    title: 'Design CSS styles for mobile responsive view',
    description: 'Make sure the dashboard and kanban cards look premium on mobile devices.',
    priority: 'medium',
    status: 'done',
    due_date: new Date(Date.now() - 86400000).toISOString().split('T')[0],
    assigned_to: 'maria',
    assigned_by: 'ayush',
    meeting_title: 'UI Design Review',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: 'task_4',
    title: 'Prepare demo walkthrough recording',
    description: 'Create a video showcasing the transcription, RAG chat, and task assignment.',
    priority: 'low',
    status: 'pending',
    due_date: new Date(Date.now() + 86400000 * 5).toISOString().split('T')[0],
    assigned_to: 'rahul',
    assigned_by: 'ayush',
    meeting_title: 'Marketing Alignment',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }
];

async function requestJson(url, token, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `Request failed with status ${response.status}`);
  }

  return response.status === 204 ? null : response.json();
}

export async function getLocalTasks(token) {
  return requestJson(TASKS_API, token);
}

function diffTask(existing, next) {
  const fields = ['title', 'description', 'assigned_to', 'assigned_by', 'meeting_title', 'due_date', 'priority', 'status'];
  const changed = {};
  fields.forEach(field => {
    if ((existing?.[field] ?? '') !== (next?.[field] ?? '')) {
      changed[field] = next?.[field] ?? '';
    }
  });
  return changed;
}

export async function saveLocalTasks(tasks, token, currentUser) {
  const serverTasks = await getLocalTasks(token);
  const serverById = new Map(serverTasks.map(task => [task.id, task]));
  const desiredById = new Map(tasks.map(task => [task.id, task]));

  for (const task of tasks) {
    const existing = serverById.get(task.id);
    if (!existing) {
      await requestJson(TASKS_API, token, {
        method: 'POST',
        body: JSON.stringify({
          title: task.title,
          description: task.description || '',
          assigned_to: task.assigned_to,
          assigned_by: task.assigned_by || currentUser?.username,
          meeting_title: task.meeting_title || '',
          due_date: task.due_date || null,
          priority: task.priority || 'medium',
          status: task.status || 'pending',
        }),
      });
      continue;
    }

    const changed = diffTask(existing, task);
    if (Object.keys(changed).length > 0) {
      await requestJson(`${TASKS_API}/${task.id}`, token, {
        method: 'PATCH',
        body: JSON.stringify(changed),
      });
    }
  }

  for (const task of serverTasks.filter(item => !desiredById.has(item.id))) {
    await requestJson(`${TASKS_API}/${task.id}`, token, {
      method: 'DELETE',
    });
  }

  return getLocalTasks(token);
}

export function getLocalDashboard(tasks, users) {
  const pendingCount = tasks.filter(t => t.status === 'pending').length;
  const progressCount = tasks.filter(t => t.status === 'in_progress').length;
  const doneCount = tasks.filter(t => t.status === 'done').length;
  const highCount = tasks.filter(t => t.priority === 'high').length;
  const mediumCount = tasks.filter(t => t.priority === 'medium').length;
  const lowCount = tasks.filter(t => t.priority === 'low').length;

  const userStats = users.map(u => {
    const uTasks = tasks.filter(t => t.assigned_to === u.username);
    return {
      username: u.username,
      display_name: u.display_name,
      avatar: u.avatar,
      role: u.role,
      total: uTasks.length,
      pending: uTasks.filter(t => t.status === 'pending').length,
      in_progress: uTasks.filter(t => t.status === 'in_progress').length,
      done: uTasks.filter(t => t.status === 'done').length,
    };
  });

  return {
    total_tasks: tasks.length,
    total_users: users.length,
    pending_tasks: pendingCount,
    in_progress_tasks: progressCount,
    done_tasks: doneCount,
    high_priority: highCount,
    medium_priority: mediumCount,
    low_priority: lowCount,
    user_stats: userStats,
  };
}

function getUserLabel(user) {
  if (!user) return 'Unknown user';
  const name = user.display_name || user.display || user.name || user.username || 'Unknown user';
  return user.username ? `${name} (@${user.username})` : name;
}

function normalizeUser(user) {
  if (!user || typeof user !== 'object') return user;
  return {
    ...user,
    display_name: user.display_name || user.display || user.name || user.username || 'Unknown user',
  };
}

function mergeUsers(fetchedUsers) {
  const byUsername = new Map();
  FALLBACK_USERS.forEach(user => byUsername.set(user.username, user));
  (Array.isArray(fetchedUsers) ? fetchedUsers : []).forEach(user => {
    const normalized = normalizeUser(user);
    if (normalized?.username) byUsername.set(normalized.username, { ...byUsername.get(normalized.username), ...normalized });
  });
  return Array.from(byUsername.values());
}

/* ── Animated counter hook ── */
function useAnimatedCount(target, duration = 600) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (target === 0) { setCount(0); return; }
    let start = 0;
    const step = Math.max(1, Math.ceil(target / (duration / 16)));
    const timer = setInterval(() => {
      start += step;
      if (start >= target) { setCount(target); clearInterval(timer); }
      else setCount(start);
    }, 16);
    return () => clearInterval(timer);
  }, [target, duration]);
  return count;
}

/* ── Dashboard Stat Card ── */
function StatCard({ icon, label, value, color, accent }) {
  const animVal = useAnimatedCount(value);
  return (
    <div className="tm-stat-card" style={{ '--stat-accent': accent || color }}>
      <div className="tm-stat-icon" style={{ color, background: `${color}15` }}>{icon}</div>
      <div className="tm-stat-info">
        <div className="tm-stat-value" style={{ color }}>{animVal}</div>
        <div className="tm-stat-label">{label}</div>
      </div>
    </div>
  );
}

/* ── Kanban Task Card ── */
function KanbanCard({ task, users, token, currentUser, onUpdate, onDelete }) {
  const [expanded, setExpanded] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [reassigning, setReassigning] = useState(false);
  const [newAssignee, setNewAssignee] = useState('');

  const pm = PRIORITY_META[task.priority] || PRIORITY_META.medium;
  const sm = STATUS_META[task.status] || STATUS_META.pending;
  const StatusIcon = sm.icon;
  const assignee = users.find(u => u.username === task.assigned_to);
  const canModify = currentUser.role === 'admin';

  const cycleStatus = async () => {
    const cycle = { pending: 'in_progress', in_progress: 'done', done: 'pending' };
    const next = cycle[task.status] || 'pending';
    setUpdating(true);
    try {
      const localTasks = await getLocalTasks(token);
      const updatedTasks = localTasks.map(t => {
        if (t.id === task.id) {
          return { ...t, status: next, updated_at: new Date().toISOString() };
        }
        return t;
      });
      await saveLocalTasks(updatedTasks, token, currentUser);
      const updatedTask = updatedTasks.find(t => t.id === task.id);
      onUpdate(updatedTask);
    } finally { setUpdating(false); }
  };

  const handleReassign = async () => {
    if (!newAssignee) return;
    setUpdating(true);
    try {
      const localTasks = await getLocalTasks(token);
      const updatedTasks = localTasks.map(t => {
        if (t.id === task.id) {
          return { ...t, assigned_to: newAssignee, updated_at: new Date().toISOString() };
        }
        return t;
      });
      await saveLocalTasks(updatedTasks, token, currentUser);
      const updatedTask = updatedTasks.find(t => t.id === task.id);
      onUpdate(updatedTask);
      setReassigning(false);
      setNewAssignee('');
    } finally { setUpdating(false); }
  };

  const handleDelete = async () => {
    if (!window.confirm('Delete this task?')) return;
    const localTasks = await getLocalTasks(token);
    const filteredTasks = localTasks.filter(t => t.id !== task.id);
    await saveLocalTasks(filteredTasks, token, currentUser);
    onDelete(task.id);
  };

  return (
    <div className={`tm-kanban-card priority-${task.priority} ${task.status === 'done' ? 'tm-card-done' : ''}`}
         style={{ '--p-color': pm.color, '--p-bg': pm.bg, '--p-border': pm.border }}>
      {/* Top row */}
      <div className="tm-kc-top">
        <button className="tm-kc-status-btn" onClick={cycleStatus} disabled={updating}
                title={`${sm.label} — click to advance`} style={{ color: sm.color }}>
          {updating
            ? <Loader2 size={16} style={{ animation: 'spin 0.8s linear infinite' }} />
            : <StatusIcon size={16} />}
        </button>
        <div className="tm-kc-body">
          <div className="tm-kc-title" style={{ textDecoration: task.status === 'done' ? 'line-through' : 'none' }}>
            {task.title}
          </div>
          {task.meeting_title && (
            <div className="tm-kc-meeting">📋 {task.meeting_title}</div>
          )}
        </div>
        <div className="tm-kc-badges">
          <span className="tm-kc-priority-badge"
                style={{ background: pm.bg, color: pm.color, border: `1px solid ${pm.border}` }}>
            {pm.label}
          </span>
        </div>
      </div>

      {/* Meta row */}
      <div className="tm-kc-meta">
        <span className="tm-kc-assignee" title={`Assigned to ${getUserLabel(assignee)}`}>
          {assignee?.avatar || '👤'} {getUserLabel(assignee)}
        </span>
        {task.due_date && (
          <span className="tm-kc-due">📅 {task.due_date}</span>
        )}
        <div className="tm-kc-actions">
          <button className="tm-kc-action-btn" onClick={() => setExpanded(x => !x)} title="Details">
            <ChevronDown size={13} style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: '0.2s' }} />
          </button>
          {canModify && (
            <>
              <button className="tm-kc-action-btn" onClick={() => setReassigning(r => !r)} title="Reassign">
                <UserPlus size={13} />
              </button>
              <button className="tm-kc-action-btn tm-kc-del" onClick={handleDelete} title="Delete">
                <Trash2 size={13} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Reassign dropdown */}
      {reassigning && (
        <div className="tm-kc-reassign">
          <select className="tm-kc-reassign-select" value={newAssignee}
                  onChange={e => setNewAssignee(e.target.value)}>
            <option value="">— Select user —</option>
            {users.map(u => (
              <option key={u.username} value={u.username}>{u.avatar} {u.display_name}</option>
            ))}
          </select>
          <button className="tm-kc-reassign-btn" onClick={handleReassign}
                  disabled={!newAssignee || updating}>
            {updating ? <Loader2 size={12} style={{ animation: 'spin 0.8s linear infinite' }} /> : 'Reassign'}
          </button>
          <button className="tm-kc-reassign-cancel" onClick={() => { setReassigning(false); setNewAssignee(''); }}>
            <X size={13} />
          </button>
        </div>
      )}

      {/* Expanded details */}
      {expanded && (
        <div className="tm-kc-details">
          {task.description && <p className="tm-kc-desc">{task.description}</p>}
          <div className="tm-kc-detail-row">
            <span>📤 <strong>By:</strong> {assigner?.display_name || task.assigned_by}</span>
            <span>📊 <strong>Status:</strong> <span style={{ color: sm.color }}>{sm.label}</span></span>
            {task.created_at && <span>🕐 {new Date(task.created_at).toLocaleDateString()}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Create Task Form ── */
function CreateTaskForm({ users, token, currentUser, onCreated }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [priority, setPriority] = useState('medium');
  const [dueDate, setDueDate] = useState('');
  const [saving, setSaving] = useState(false);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!title.trim() || !assignedTo) return;
    setSaving(true);
    try {
      const newTask = {
        id: `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        title: title.trim(),
        description: description.trim(),
        assigned_to: assignedTo,
        assigned_by: currentUser.username,
        meeting_title: '',
        due_date: dueDate || null,
        priority,
        status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      const localTasks = await getLocalTasks(token);
      await saveLocalTasks([newTask, ...localTasks], token, currentUser);
      onCreated(newTask);
      setTitle(''); setDescription(''); setAssignedTo(''); setPriority('medium'); setDueDate('');
      setOpen(false);
    } finally { setSaving(false); }
  };

  if (!open) {
    return (
      <button className="tm-create-btn" onClick={() => setOpen(true)}>
        <Plus size={15} /> New Task
      </button>
    );
  }

  return (
    <form className="tm-create-form" onSubmit={handleCreate}>
      <div className="tm-create-header">
        <span className="tm-create-title">➕ Create New Task</span>
        <button type="button" className="tm-create-close" onClick={() => setOpen(false)}><X size={15} /></button>
      </div>

      <input className="tm-create-input" placeholder="Task title..."
             value={title} onChange={e => setTitle(e.target.value)} required />
      <textarea className="tm-create-textarea" placeholder="Description (optional)..."
                value={description} onChange={e => setDescription(e.target.value)} rows={2} />

      <div className="tm-create-controls">
        <select className="tm-create-select" value={assignedTo}
                onChange={e => setAssignedTo(e.target.value)} required>
          <option value="">— Assign to —</option>
          {users.map(u => (
            <option key={u.username} value={u.username}>{u.avatar} {u.display_name}</option>
          ))}
        </select>
        <select className="tm-create-select" value={priority}
                onChange={e => setPriority(e.target.value)}>
          {PRIORITIES.map(p => (
            <option key={p} value={p}>{PRIORITY_META[p].emoji} {PRIORITY_META[p].label}</option>
          ))}
        </select>
        <input className="tm-create-select" type="date" value={dueDate}
               onChange={e => setDueDate(e.target.value)} />
      </div>

      <div className="tm-create-footer">
        <button type="button" className="tm-create-cancel" onClick={() => setOpen(false)}>Cancel</button>
        <button type="submit" className="tm-create-submit" disabled={saving || !title.trim() || !assignedTo}>
          {saving
            ? <><Loader2 size={13} style={{ animation: 'spin 0.8s linear infinite' }} /> Creating…</>
            : <><Plus size={13} /> Create Task</>}
        </button>
      </div>
    </form>
  );
}

/* ── Team Member Card ── */
function TeamCard({ stat }) {
  const total = stat.total || 1;
  const donePct = Math.round((stat.done / total) * 100);
  return (
    <div className="tm-team-card">
      <div className="tm-team-avatar">{stat.avatar}</div>
      <div className="tm-team-info">
        <div className="tm-team-name">{stat.display_name}</div>
        <div className="tm-team-role">{stat.role === 'admin' ? '👑 Admin' : '👤 Member'}</div>
      </div>
      <div className="tm-team-stats">
        <div className="tm-team-stat-row">
          <span className="tm-team-stat-dot" style={{ background: '#9C8060' }} />{stat.pending}
          <span className="tm-team-stat-dot" style={{ background: '#EF9F27' }} />{stat.in_progress}
          <span className="tm-team-stat-dot" style={{ background: '#7AC47A' }} />{stat.done}
        </div>
        <div className="tm-team-bar">
          <div className="tm-team-bar-fill" style={{ width: `${donePct}%` }} />
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════
   MAIN — TaskManagementPage
   ════════════════════════════════════════════ */
export default function TaskManagementPage({ token, currentUser, onBack }) {
  const [tasks,      setTasks]      = useState([]);
  const [users,      setUsers]      = useState([]);
  const [dashboard,  setDashboard]  = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filters
  const [filterStatus,   setFilterStatus]   = useState('all');
  const [filterPriority, setFilterPriority] = useState('all');
  const [filterUser,     setFilterUser]     = useState('all');
  const [viewMode,       setViewMode]       = useState('kanban'); // kanban | list

  const authHeaders = { Authorization: `Bearer ${token}` };

  const fetchAll = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      let resolvedUsers = FALLBACK_USERS;
      try {
        const uRes = await fetch('/api/users', { headers: authHeaders });
        if (uRes.ok) {
          const data = await uRes.json();
          if (Array.isArray(data)) {
            resolvedUsers = mergeUsers(data);
          }
        }
      } catch (e) {
        console.error('Failed to fetch users, using fallback', e);
      }
      setUsers(resolvedUsers);

      const localTasks = await getLocalTasks(token);
      setTasks(localTasks);

      const dashData = getLocalDashboard(localTasks, resolvedUsers);
      setDashboard(dashData);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleUpdate = (updated) => {
    setTasks(ts => ts.map(t => t.id === updated.id ? updated : t));
    // Refresh dashboard after a brief delay
    setTimeout(() => fetchAll(true), 300);
  };

  const handleDelete = (id) => {
    setTasks(ts => ts.filter(t => t.id !== id));
    setTimeout(() => fetchAll(true), 300);
  };

  const handleCreated = (newTask) => {
    setTasks(ts => [newTask, ...ts]);
    setTimeout(() => fetchAll(true), 300);
  };

  // Apply filters
  const filtered = tasks.filter(t => {
    if (filterStatus !== 'all' && t.status !== filterStatus) return false;
    if (filterPriority !== 'all' && t.priority !== filterPriority) return false;
    if (filterUser !== 'all' && t.assigned_to !== filterUser) return false;
    return true;
  });

  // Group by status for kanban
  const kanbanCols = {
    pending:     filtered.filter(t => t.status === 'pending'),
    in_progress: filtered.filter(t => t.status === 'in_progress'),
    done:        filtered.filter(t => t.status === 'done'),
  };

  const d = dashboard && typeof dashboard === 'object' && !Array.isArray(dashboard) ? dashboard : {
    total_tasks: 0, total_users: 0, pending_tasks: 0, in_progress_tasks: 0,
    done_tasks: 0, high_priority: 0, medium_priority: 0, low_priority: 0,
    user_stats: [],
  };
  const completionRate = d.total_tasks ? Math.round((d.done_tasks / d.total_tasks) * 100) : 0;

  if (loading) {
    return (
      <div className="tm-page">
        <div className="tm-loading">
          <Loader2 size={32} style={{ animation: 'spin 0.8s linear infinite', color: 'var(--warm-amber)' }} />
          <span>Loading Task Board…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="tm-page">
      {/* ── Header ── */}
      <div className="tm-header">
        <div className="tm-header-left">
          <button className="tm-back-btn" onClick={onBack} title="Back to Transcriva">
            <ArrowLeft size={16} />
          </button>
          <div>
            <div className="tm-page-title">📊 Task Management Board</div>
            <div className="tm-page-subtitle">
              {d.total_tasks} tasks across {d.total_users} team members
            </div>
          </div>
        </div>
        <div className="tm-header-right">
          {currentUser.role === 'admin' && (
            <CreateTaskForm users={users} token={token} currentUser={currentUser} onCreated={handleCreated} />
          )}
          <button className="tm-refresh-btn" onClick={() => fetchAll(true)} disabled={refreshing}
                  title="Refresh">
            <RefreshCw size={14} style={refreshing ? { animation: 'spin 0.8s linear infinite' } : {}} />
          </button>
        </div>
      </div>

      {/* ── Dashboard Stats ── */}
      <div className="tm-stats-grid">
        <StatCard icon={<ClipboardList size={18} />} label="Total Tasks"   value={d.total_tasks}        color="var(--warm-amber)"  accent="#EF9F27" />
        <StatCard icon={<Circle size={18} />}         label="Pending"      value={d.pending_tasks}      color="#9C8060"             accent="#9C8060" />
        <StatCard icon={<Clock size={18} />}          label="In Progress"  value={d.in_progress_tasks}  color="#EF9F27"             accent="#EF9F27" />
        <StatCard icon={<CheckCircle size={18} />}    label="Completed"    value={d.done_tasks}         color="#7AC47A"             accent="#7AC47A" />
        <StatCard icon={<Target size={18} />}         label="High Priority" value={d.high_priority}     color="#D85A30"             accent="#D85A30" />
        <StatCard icon={<TrendingUp size={18} />}     label="Done Rate"    value={completionRate}       color="#7AC47A"             accent="#7AC47A" />
      </div>

      {/* ── Filter Bar ── */}
      <div className="tm-filter-bar">
        <div className="tm-filter-group">
          <Filter size={13} style={{ color: 'var(--warm-muted)', flexShrink: 0 }} />
          <select className="tm-filter-select" value={filterStatus}
                  onChange={e => setFilterStatus(e.target.value)}>
            <option value="all">All Status</option>
            {STATUSES.map(s => (
              <option key={s} value={s}>{STATUS_META[s].label}</option>
            ))}
          </select>
          <select className="tm-filter-select" value={filterPriority}
                  onChange={e => setFilterPriority(e.target.value)}>
            <option value="all">All Priority</option>
            {PRIORITIES.map(p => (
              <option key={p} value={p}>{PRIORITY_META[p].emoji} {PRIORITY_META[p].label}</option>
            ))}
          </select>
          <select className="tm-filter-select" value={filterUser}
                  onChange={e => setFilterUser(e.target.value)}>
            <option value="all">All Members</option>
            {users.map(u => (
              <option key={u.username} value={u.username}>{u.avatar} {getUserLabel(u)}</option>
            ))}
          </select>
        </div>
        <div className="tm-filter-results">
          {filtered.length} task{filtered.length !== 1 ? 's' : ''} shown
        </div>
      </div>

      {/* ── Kanban Board ── */}
      <div className="tm-kanban-board">
        {STATUSES.map(status => {
          const col = COLUMN_HEADERS[status];
          const colTasks = kanbanCols[status];
          return (
            <div key={status} className="tm-kanban-col">
              <div className="tm-kanban-col-header" style={{ background: col.gradient }}>
                <span className="tm-kanban-col-emoji">{col.emoji}</span>
                <span className="tm-kanban-col-title">{col.title}</span>
                <span className="tm-kanban-col-count">{colTasks.length}</span>
              </div>
              <div className="tm-kanban-col-body">
                {colTasks.length === 0 ? (
                  <div className="tm-kanban-empty">
                    <Circle size={20} style={{ opacity: 0.3 }} />
                    <span>No tasks</span>
                  </div>
                ) : (
                  colTasks.map(t => (
                    <KanbanCard
                      key={t.id} task={t} users={users} token={token}
                      currentUser={currentUser} onUpdate={handleUpdate} onDelete={handleDelete}
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Team Overview ── */}
      {d.user_stats && d.user_stats.length > 0 && (
        <div className="tm-team-section">
          <div className="tm-team-header">
            <Users size={15} style={{ color: 'var(--warm-amber)' }} />
            <span>Team Overview</span>
          </div>
          <div className="tm-team-grid">
            {d.user_stats.map(s => (
              <TeamCard key={s.username} stat={s} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
