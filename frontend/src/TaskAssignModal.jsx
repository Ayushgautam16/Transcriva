import { useState, useEffect } from 'react';
import { X, Send, Loader2, CheckCircle } from 'lucide-react';
import { getLocalTasks, saveLocalTasks } from './TaskManagementPage';

const PRIORITIES = ['high', 'medium', 'low'];

const FALLBACK_USERS = [
  { username: 'ayush', display_name: 'Ayush', avatar: '🧑‍💻', role: 'admin' },
  { username: 'anujha', display_name: 'Anujha', avatar: '👩‍💼', role: 'member' },
  { username: 'maria', display_name: 'Maria', avatar: '👩‍🔬', role: 'member' },
  { username: 'rahul', display_name: 'Rahul', avatar: '👨‍💼', role: 'member' },
];

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
    if (normalized?.username) {
      byUsername.set(normalized.username, { ...byUsername.get(normalized.username), ...normalized });
    }
  });
  return Array.from(byUsername.values());
}

function normalizeName(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function resolveAssignee(assigneeHint, users) {
  if (!assigneeHint || !Array.isArray(users) || users.length === 0) return '';

  const normalizedHint = normalizeName(assigneeHint);
  if (!normalizedHint) return '';

  const exact = users.find(u =>
    normalizeName(u.username) === normalizedHint ||
    normalizeName(u.display_name) === normalizedHint
  );
  if (exact) return exact.username;

  const hintFirstToken = normalizedHint.split(' ')[0];
  const partial = users.find(u => {
    const dn = normalizeName(u.display_name);
    const un = normalizeName(u.username);
    return dn.startsWith(normalizedHint) ||
      un.startsWith(normalizedHint) ||
      (hintFirstToken && (dn.split(' ')[0] === hintFirstToken || un.split(' ')[0] === hintFirstToken));
  });
  return partial?.username || '';
}

// Parse raw action_items into structured tasks with optional assignee hints.
function parseActionItems(raw) {
  if (typeof raw !== 'string') return [];

  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
  const items = [];
  let current = null;

  const pushCurrent = () => {
    if (!current) return;
    const title = (current.title || '').trim();
    if (title.length > 5) {
      items.push({ title, assigneeHint: (current.assigneeHint || '').trim() });
    }
    current = null;
  };

  for (const line of lines) {
    const numberedTask = line.match(/^\d+[.)]\s*(.+)$/);
    if (numberedTask) {
      pushCurrent();
      current = { title: numberedTask[1].trim(), assigneeHint: '' };
      continue;
    }

    const assigneeLine = line.match(/^[-•*]?\s*(person(?:\s*\d+)?|assignee|owner)\s*:\s*(.+)$/i);
    if (assigneeLine && current) {
      current.assigneeHint = assigneeLine[2].trim();
      continue;
    }

    if (/^[-•*]?\s*deadline\s*:/i.test(line)) {
      continue;
    }

    if (!current) current = { title: '', assigneeHint: '' };
    const clean = line.replace(/^[-•*]\s*/, '').trim();
    if (clean && !/^(person|assignee|owner|deadline)\s*:/i.test(clean)) {
      current.title = current.title ? `${current.title} ${clean}` : clean;
    }
  }

  pushCurrent();
  return items;
}

function TaskRow({ item, index, users, onUpdate }) {
  const [localTitle, setLocalTitle] = useState(item.title);

  useEffect(() => {
    setLocalTitle(item.title);
  }, [item.title]);

  return (
    <div className="tam-row">
      <div className="tam-row-num">{index + 1}</div>
      <div className="tam-row-content">
        <input
          className="tam-task-input"
          value={localTitle}
          onChange={e => setLocalTitle(e.target.value)}
          onBlur={() => onUpdate(index, 'title', localTitle)}
          placeholder="Task description"
        />
        <div className="tam-row-controls">
          <select
            className="tam-select"
            value={item.assigned_to}
            onChange={e => onUpdate(index, 'assigned_to', e.target.value)}
          >
            <option value="">— Assign to —</option>
            {Array.isArray(users) && users.map(u => (
              <option key={u.username} value={u.username}>
                {u.avatar} {getUserLabel(u)}
              </option>
            ))}
          </select>

          <select
            className="tam-select tam-priority"
            value={item.priority}
            onChange={e => onUpdate(index, 'priority', e.target.value)}
            style={{ color: item.priority === 'high' ? '#D85A30' : item.priority === 'low' ? '#7AC47A' : '#EF9F27' }}
          >
            {PRIORITIES.map(p => (
              <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
            ))}
          </select>

          <input
            className="tam-select"
            type="date"
            value={item.due_date}
            onChange={e => onUpdate(index, 'due_date', e.target.value)}
          />
        </div>
      </div>

      {item.assigned && (
        <div className="tam-assigned-badge">
          <CheckCircle size={15} color="#7AC47A" />
        </div>
      )}
    </div>
  );
}

export default function TaskAssignModal({ result, token, currentUser, onClose }) {
  const [users, setUsers] = useState([]);
  const [items, setItems] = useState([]);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [summary, setSummary] = useState({ sent: 0, skipped: 0 });

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      const parsed = parseActionItems(result?.action_items || '');
      try {
        const response = await fetch('/api/users', { headers: { Authorization: `Bearer ${token}` } });
        if (!response.ok) throw new Error('Failed to load users');
        const data = await response.json();
        const memberList = mergeUsers(data);

        if (cancelled) return;
        setUsers(memberList);
        setItems(parsed.map(item => ({
          title: item.title,
          assigned_to: resolveAssignee(item.assigneeHint, memberList),
          priority: 'medium',
          due_date: '',
          assigned: false,
        })));
      } catch (err) {
        console.error(err);
        if (cancelled) return;
        setUsers(FALLBACK_USERS);
        setItems(parsed.map(item => ({
          title: item.title,
          assigned_to: resolveAssignee(item.assigneeHint, FALLBACK_USERS),
          priority: 'medium',
          due_date: '',
          assigned: false,
        })));
      }
    };

    init();
    return () => { cancelled = true; };
  }, [result, token]);

  const updateItem = (idx, field, value) => {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: value } : it));
  };

  const handleAssign = async () => {
    const toSend = items.filter(it => it.assigned_to && it.title.trim());
    if (toSend.length === 0) {
      alert('Please assign at least one task to a team member.');
      return;
    }
    setSaving(true);
    let sent = 0;
    const skipped = items.length - toSend.length;

    try {
      const localTasks = getLocalTasks();
      const newTasks = [];

      toSend.forEach((it, idx) => {
        const newTask = {
          id: `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}_${idx}`,
          title: it.title,
          description: `From meeting: "${result?.title || 'Untitled'}"`,
          assigned_to: it.assigned_to,
          assigned_by: currentUser.username,
          meeting_title: result?.title || '',
          due_date: it.due_date || null,
          priority: it.priority,
          status: 'pending',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        newTasks.push(newTask);
        sent++;
      });

      saveLocalTasks([...newTasks, ...localTasks]);

      const successfulTitles = toSend.map(it => it.title);
      setItems(prev => prev.map(p =>
        successfulTitles.includes(p.title) ? { ...p, assigned: true } : p
      ));

      setSummary({ sent, skipped });
      setDone(true);
    } catch (e) {
      console.error(e);
      alert('Failed to assign tasks.');
    } finally {
      setSaving(false);
    }
  };

  const assignedCount = items.filter(i => i.assigned_to).length;

  return (
    <div className="modal-overlay">
      <div className="modal-panel">
        <div className="modal-header">
          <div>
            <div className="modal-title">🎯 Assign Meeting Tasks</div>
            {result?.title && <div className="modal-meeting-label">📋 {result.title}</div>}
          </div>
          <button className="modal-close-btn" onClick={onClose}><X size={18} /></button>
        </div>

        {!done ? (
          <>
            <div className="modal-subheader">
              <span>
                {items.length} action item{items.length !== 1 ? 's' : ''} extracted ·
                <strong style={{ color: 'var(--warm-amber)' }}> {assignedCount} assigned</strong>
              </span>
              <span className="modal-hint">Set assignee → priority → due date, then click Assign</span>
            </div>

            <div className="modal-task-list">
              {items.length === 0 ? (
                <div className="modal-empty">
                  No action items were extracted from this meeting.<br />
                  You can add tasks manually in your profile.
                </div>
              ) : (
                items.map((item, i) => (
                  <TaskRow
                    key={i}
                    index={i}
                    item={item}
                    users={users}
                    onUpdate={updateItem}
                  />
                ))
              )}
            </div>

            <div className="modal-footer">
              <button className="modal-cancel-btn" onClick={onClose}>Cancel</button>
              <button
                className="modal-assign-btn"
                onClick={handleAssign}
                disabled={saving || assignedCount === 0}
              >
                {saving
                  ? <><Loader2 size={14} style={{ animation: 'spin 0.8s linear infinite' }} /> Assigning…</>
                  : <><Send size={14} /> Assign {assignedCount > 0 ? assignedCount : ''} Task{assignedCount !== 1 ? 's' : ''}</>}
              </button>
            </div>
          </>
        ) : (
          <div className="modal-success">
            <div className="modal-success-icon">🎉</div>
            <div className="modal-success-title">Tasks Assigned!</div>
            <div className="modal-success-sub">
              <strong style={{ color: '#7AC47A' }}>{summary.sent}</strong> task{summary.sent !== 1 ? 's' : ''} sent to team members
              {summary.skipped > 0 && <>, {summary.skipped} skipped (no assignee)</>}.
            </div>
            <p className="modal-success-hint">
              Team members can view their tasks in <strong>My Tasks</strong> (top-right profile button).
            </p>
            <button className="modal-assign-btn" onClick={onClose}>Done ✓</button>
          </div>
        )}
      </div>
    </div>
  );
}
