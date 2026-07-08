import { useState, useEffect, useCallback } from 'react';
import { CheckCircle, Clock, Circle, Trash2, ChevronDown, X, AlertCircle, Loader2 } from 'lucide-react';
import { getLocalTasks, saveLocalTasks } from './TaskManagementPage';

const PRIORITY_META = {
  high:   { label: 'High',   color: '#D85A30', bg: 'rgba(216,90,48,0.1)',   border: 'rgba(216,90,48,0.3)'  },
  medium: { label: 'Medium', color: '#EF9F27', bg: 'rgba(239,159,39,0.1)',  border: 'rgba(239,159,39,0.3)' },
  low:    { label: 'Low',    color: '#7AC47A', bg: 'rgba(122,196,122,0.1)', border: 'rgba(122,196,122,0.3)' },
};

const STATUS_META = {
  pending:     { label: 'Pending',     icon: Circle,      color: '#9C8060' },
  in_progress: { label: 'In Progress', icon: Clock,       color: '#EF9F27' },
  done:        { label: 'Done',        icon: CheckCircle, color: '#7AC47A' },
};

function TaskCard({ task, token, users, onUpdate, onDelete, currentUser }) {
  const [expanded, setExpanded] = useState(false);
  const [updating, setUpdating] = useState(false);

  const pm  = PRIORITY_META[task.priority] || PRIORITY_META.medium;
  const sm  = STATUS_META[task.status]     || STATUS_META.pending;
  const StatusIcon = sm.icon;

  const assignee = users.find(u => u.username === task.assigned_to);
  const assigner = users.find(u => u.username === task.assigned_by);
  const canDelete = currentUser.role === 'admin';

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

  const handleDelete = async () => {
    if (!window.confirm('Delete this task?')) return;
    const localTasks = await getLocalTasks(token);
    const filteredTasks = localTasks.filter(t => t.id !== task.id);
    await saveLocalTasks(filteredTasks, token, currentUser);
    onDelete(task.id);
  };

  return (
    <div
      className={`task-card priority-${task.priority} ${task.status === 'done' ? 'task-done' : ''}`}
      style={{ '--p-color': pm.color, '--p-bg': pm.bg, '--p-border': pm.border }}
    >
      <div className="task-card-top">
        {/* Status toggle */}
        <button
          className="task-status-btn"
          onClick={cycleStatus}
          title={`Status: ${sm.label} — click to advance`}
          disabled={updating}
          style={{ color: sm.color }}
        >
          {updating
            ? <Loader2 size={18} style={{ animation: 'spin 0.8s linear infinite' }} />
            : <StatusIcon size={18} />}
        </button>

        {/* Title */}
        <div className="task-card-body">
          <div className="task-title" style={{ textDecoration: task.status === 'done' ? 'line-through' : 'none' }}>
            {task.title}
          </div>
          {task.meeting_title && (
            <div className="task-meeting-tag">📋 {task.meeting_title}</div>
          )}
        </div>

        {/* Badges */}
        <div className="task-badges">
          <span className="task-priority-badge" style={{ background: pm.bg, color: pm.color, border: `1px solid ${pm.border}` }}>
            {pm.label}
          </span>
          <button className="task-expand-btn" onClick={() => setExpanded(x => !x)}>
            <ChevronDown size={14} style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: '0.2s' }} />
          </button>
          {canDelete && (
            <button className="task-delete-btn" onClick={handleDelete} title="Delete task">
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </div>

      {expanded && (
        <div className="task-card-details">
          {task.description && <p className="task-desc">{task.description}</p>}
          <div className="task-meta-row">
            <span>👤 <strong>Assigned to:</strong> {assignee?.avatar} {assignee?.display_name || task.assigned_to}</span>
            <span>📤 <strong>By:</strong> {assigner?.display_name || task.assigned_by}</span>
            {task.due_date && <span>📅 <strong>Due:</strong> {task.due_date}</span>}
            <span>📊 <strong>Status:</strong> <span style={{ color: sm.color }}>{sm.label}</span></span>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ProfilePage({ currentUser, token, onClose }) {
  const [tasks,   setTasks]   = useState([]);
  const [users,   setUsers]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter,  setFilter]  = useState('all');  // all | pending | in_progress | done

  const authHeaders = { Authorization: `Bearer ${token}` };

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      let resolvedUsers = [];
      try {
        const uRes = await fetch('/api/users', { headers: authHeaders });
        if (uRes.ok) {
          const userData = await uRes.json();
          resolvedUsers = Array.isArray(userData) ? userData : [];
        }
      } catch (e) {
        console.error('Failed to load users in ProfilePage', e);
      }
      setUsers(resolvedUsers);

      const localTasks = await getLocalTasks(token);
      setTasks(localTasks);
    } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleUpdate = (updated) => setTasks(ts => ts.map(t => t.id === updated.id ? updated : t));
  const handleDelete = (id) => setTasks(ts => ts.filter(t => t.id !== id));

  // Tasks shown to this user (admin sees all, member sees only theirs)
  const myTasks = currentUser.role === 'admin'
    ? (Array.isArray(tasks) ? tasks : [])
    : (Array.isArray(tasks) ? tasks : []).filter(t => t.assigned_to === currentUser.username);

  const filtered = filter === 'all' ? myTasks : myTasks.filter(t => t.status === filter);

  const counts = {
    all:         myTasks.length,
    pending:     myTasks.filter(t => t.status === 'pending').length,
    in_progress: myTasks.filter(t => t.status === 'in_progress').length,
    done:        myTasks.filter(t => t.status === 'done').length,
  };

  // Today's tasks = pending + in_progress
  const todayTasks = myTasks.filter(t => t.status !== 'done');
  const completionPct = myTasks.length
    ? Math.round((counts.done / myTasks.length) * 100)
    : 0;

  const filters = [
    { key: 'all',         label: 'All',         count: counts.all         },
    { key: 'pending',     label: 'Pending',     count: counts.pending     },
    { key: 'in_progress', label: 'In Progress', count: counts.in_progress },
    { key: 'done',        label: 'Done',        count: counts.done        },
  ];

  return (
    <div className="profile-overlay">
      <div className="profile-panel">
        {/* Header */}
        <div className="profile-header">
          <div className="profile-user-info">
            <div className="profile-avatar">{currentUser.avatar}</div>
            <div>
              <div className="profile-display-name">{currentUser.display_name}</div>
              <div className="profile-username">@{currentUser.username} · {currentUser.role === 'admin' ? '👑 Admin' : '👤 Member'}</div>
            </div>
          </div>
          <button className="profile-close-btn" onClick={onClose}><X size={18} /></button>
        </div>

        {/* Stats strip */}
        <div className="profile-stats">
          <div className="profile-stat">
            <div className="pstat-val">{myTasks.length}</div>
            <div className="pstat-lbl">Total Tasks</div>
          </div>
          <div className="profile-stat">
            <div className="pstat-val" style={{ color: '#EF9F27' }}>{todayTasks.length}</div>
            <div className="pstat-lbl">Active</div>
          </div>
          <div className="profile-stat">
            <div className="pstat-val" style={{ color: '#7AC47A' }}>{counts.done}</div>
            <div className="pstat-lbl">Completed</div>
          </div>
          <div className="profile-stat">
            <div className="pstat-val">{completionPct}%</div>
            <div className="pstat-lbl">Done Rate</div>
            <div className="pstat-bar">
              <div className="pstat-fill" style={{ width: `${completionPct}%` }} />
            </div>
          </div>
        </div>

        {/* Today's Tasks banner */}
        {todayTasks.length > 0 && (
          <div className="todays-tasks-banner">
            <div className="ttb-icon">📋</div>
            <div>
              <div className="ttb-title">Today's Tasks</div>
              <div className="ttb-sub">You have {todayTasks.length} active task{todayTasks.length !== 1 ? 's' : ''} to complete</div>
            </div>
          </div>
        )}

        {/* Filter tabs */}
        <div className="profile-filters">
          {filters.map(f => (
            <button
              key={f.key}
              className={`pf-tab ${filter === f.key ? 'active' : ''}`}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
              {f.count > 0 && <span className="pf-count">{f.count}</span>}
            </button>
          ))}
        </div>

        {/* Task list */}
        <div className="profile-task-list">
          {loading ? (
            <div className="profile-loading">
              <Loader2 size={24} style={{ animation: 'spin 0.8s linear infinite', color: 'var(--warm-amber)' }} />
              <span>Loading tasks…</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="profile-empty">
              {filter === 'all'
                ? <><AlertCircle size={32} opacity={0.4} /><p>No tasks assigned yet</p></>
                : <><CheckCircle size={32} opacity={0.4} /><p>No {filter.replace('_', ' ')} tasks</p></>}
            </div>
          ) : (
            filtered.map(t => (
              <TaskCard
                key={t.id}
                task={t}
                token={token}
                users={users}
                onUpdate={handleUpdate}
                onDelete={handleDelete}
                currentUser={currentUser}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
