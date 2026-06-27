import { useState, useEffect } from 'react';
import { X, Send, Loader2, CheckCircle } from 'lucide-react';

const PRIORITIES = ['high', 'medium', 'low'];

// Parse raw action_items string into individual task lines safely
function parseActionItems(raw) {
  if (typeof raw !== 'string') return [];
  return raw
    .split('\n')
    .map(l => l.replace(/^[-•*\d.)\s]+/, '').trim())
    .filter(l => l.length > 5);
}

function TaskRow({ item, index, users, onUpdate }) {
  const [localTitle, setLocalTitle] = useState(item.title);

  // Sync local title with props if props title changes from outside
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
          {/* Assignee */}
          <select
            className="tam-select"
            value={item.assigned_to}
            onChange={e => onUpdate(index, 'assigned_to', e.target.value)}
          >
            <option value="">— Assign to —</option>
            {Array.isArray(users) && users.map(u => (
              <option key={u.username} value={u.username}>
                {u.avatar} {u.display_name}
              </option>
            ))}
          </select>

          {/* Priority */}
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

          {/* Due date */}
          <input
            className="tam-select"
            type="date"
            value={item.due_date}
            onChange={e => onUpdate(index, 'due_date', e.target.value)}
          />
        </div>
      </div>

      {/* Assigned badge */}
      {item.assigned && (
        <div className="tam-assigned-badge">
          <CheckCircle size={15} color="#7AC47A" />
        </div>
      )}
    </div>
  );
}

export default function TaskAssignModal({ result, token, currentUser, onClose }) {
  const [users,   setUsers]   = useState([]);
  const [items,   setItems]   = useState([]);
  const [saving,  setSaving]  = useState(false);
  const [done,    setDone]    = useState(false);
  const [summary, setSummary] = useState({ sent: 0, skipped: 0 });

  useEffect(() => {
    // Load team members safely checking response status
    fetch('/api/users', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => {
        if (r.ok) return r.json();
        throw new Error('Failed to load users');
      })
      .then(data => {
        if (Array.isArray(data)) setUsers(data);
      })
      .catch((err) => {
        console.error(err);
      });

    // Pre-parse action items from meeting result
    const parsed = parseActionItems(result?.action_items || '');
    setItems(parsed.map(title => ({
      title,
      assigned_to: '',
      priority: 'medium',
      due_date: '',
      assigned: false,
    })));
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
    let sent = 0, skipped = items.length - toSend.length;

    // Execute all assignments in parallel to prevent UI blocking/network lag
    const promises = toSend.map(async (it) => {
      try {
        const res = await fetch('/api/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            title:         it.title,
            description:   `From meeting: "${result?.title || 'Untitled'}"`,
            assigned_to:   it.assigned_to,
            meeting_title: result?.title || '',
            due_date:      it.due_date || null,
            priority:      it.priority,
          }),
        });
        if (res.ok) {
          sent++;
          return it.title;
        }
      } catch {}
      return null;
    });

    const results = await Promise.all(promises);
    const successfulTitles = results.filter(title => title !== null);

    // Update items state exactly once to eliminate multiple intermediate re-renders
    setItems(prev => prev.map(p => 
      successfulTitles.includes(p.title) ? { ...p, assigned: true } : p
    ));

    setSaving(false);
    setSummary({ sent, skipped });
    setDone(true);
  };

  const assignedCount = items.filter(i => i.assigned_to).length;

  return (
    <div className="modal-overlay">
      <div className="modal-panel">

        {/* Header */}
        <div className="modal-header">
          <div>
            <div className="modal-title">🎯 Assign Meeting Tasks</div>
            {result?.title && <div className="modal-meeting-label">📋 {result.title}</div>}
          </div>
          <button className="modal-close-btn" onClick={onClose}><X size={18} /></button>
        </div>

        {!done ? (
          <>
            {/* Subheader */}
            <div className="modal-subheader">
              <span>
                {items.length} action item{items.length !== 1 ? 's' : ''} extracted · 
                <strong style={{ color: 'var(--warm-amber)' }}> {assignedCount} assigned</strong>
              </span>
              <span className="modal-hint">Set assignee → priority → due date, then click Assign</span>
            </div>

            {/* Task rows */}
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

            {/* Footer */}
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
          /* Success state */
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
