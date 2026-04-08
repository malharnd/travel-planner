import { useState, useEffect, useCallback } from 'react'
import { supabase } from './supabase'
import './App.css'

const STATUS_CONFIG = {
  Booked:   { bg: '#D8F0E3', color: '#2D6A4F', label: '✔ Booked' },
  Pending:  { bg: '#FDE8D8', color: '#B85C20', label: '~ Pending' },
  Planned:  { bg: '#D6F0EE', color: '#1A5C5A', label: '→ Planned' },
  Optional: { bg: '#D6E8F7', color: '#1A3A5C', label: '○ Optional' },
}

const DAYS = {
  1: { label: 'Day 1 — Sunday, April 26', color: '#1A3A5C' },
  2: { label: 'Day 2 — Monday, April 27', color: '#2E86AB' },
}

const EMPTY_FORM = { day: 1, time: '', activity: '', location: '', status: 'Planned', notes: '' }

export default function App() {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [editId, setEditId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const [activeDay, setActiveDay] = useState(1)
  const [toast, setToast] = useState(null)

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const fetchEvents = useCallback(async () => {
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .order('day')
      .order('sort_order')
    if (!error) setEvents(data || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchEvents()
    const channel = supabase
      .channel('events')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, fetchEvents)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [fetchEvents])

  const openAdd = () => {
    setEditId(null)
    setForm({ ...EMPTY_FORM, day: activeDay })
    setShowForm(true)
  }

  const openEdit = (ev) => {
    setEditId(ev.id)
    setForm({ day: ev.day, time: ev.time, activity: ev.activity, location: ev.location, status: ev.status, notes: ev.notes || '' })
    setShowForm(true)
  }

  const closeForm = () => { setShowForm(false); setEditId(null); setForm(EMPTY_FORM) }

  const save = async () => {
    if (!form.activity.trim() || !form.time.trim() || !form.location.trim()) return
    setSaving(true)
    const dayEvents = events.filter(e => e.day === form.day)
    const maxOrder = dayEvents.length ? Math.max(...dayEvents.map(e => e.sort_order)) : 0
    if (editId) {
      const { error } = await supabase.from('events').update({ ...form }).eq('id', editId)
      if (!error) { showToast('Event updated!'); closeForm() }
    } else {
      const { error } = await supabase.from('events').insert({ ...form, sort_order: maxOrder + 1 })
      if (!error) { showToast('Event added!'); closeForm() }
    }
    setSaving(false)
  }

  const remove = async (id) => {
    await supabase.from('events').delete().eq('id', id)
    setDeleteConfirm(null)
    showToast('Event removed', 'info')
  }

  const dayEvents = events.filter(e => e.day === activeDay)

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <div className="header-inner">
          <div>
            <h1 className="title">Banff 2026</h1>
            <p className="subtitle">April 26–27 &nbsp;·&nbsp; Res #3878741 &nbsp;·&nbsp; 8 people</p>
          </div>
          <button className="btn-primary" onClick={openAdd}>+ Add event</button>
        </div>
        {/* Day tabs */}
        <div className="tabs">
          {[1, 2].map(d => (
            <button
              key={d}
              className={`tab ${activeDay === d ? 'tab-active' : ''}`}
              onClick={() => setActiveDay(d)}
              style={activeDay === d ? { borderBottomColor: DAYS[d].color, color: DAYS[d].color } : {}}
            >
              {DAYS[d].label}
              <span className="tab-count">{events.filter(e => e.day === d).length}</span>
            </button>
          ))}
        </div>
      </header>

      {/* Legend */}
      <div className="legend">
        {Object.entries(STATUS_CONFIG).map(([k, v]) => (
          <span key={k} className="legend-item" style={{ background: v.bg, color: v.color }}>{v.label}</span>
        ))}
      </div>

      {/* Events */}
      <main className="main">
        {loading ? (
          <div className="empty">Loading your itinerary...</div>
        ) : dayEvents.length === 0 ? (
          <div className="empty">No events for this day yet. Click + Add event to get started.</div>
        ) : (
          dayEvents.map((ev, i) => (
            <div key={ev.id} className="card" style={{ animationDelay: `${i * 40}ms` }}>
              <div className="card-time">{ev.time}</div>
              <div className="card-body">
                <div className="card-title">{ev.activity}</div>
                <div className="card-loc">📍 {ev.location}</div>
                {ev.notes && <div className="card-notes">{ev.notes}</div>}
              </div>
              <div className="card-right">
                <span className="badge" style={{ background: STATUS_CONFIG[ev.status]?.bg, color: STATUS_CONFIG[ev.status]?.color }}>
                  {STATUS_CONFIG[ev.status]?.label || ev.status}
                </span>
                <div className="card-actions">
                  <button className="btn-edit" onClick={() => openEdit(ev)}>Edit</button>
                  <button className="btn-del" onClick={() => setDeleteConfirm(ev.id)}>✕</button>
                </div>
              </div>
            </div>
          ))
        )}
      </main>

      {/* Add/Edit Modal */}
      {showForm && (
        <div className="overlay" onClick={(e) => e.target === e.currentTarget && closeForm()}>
          <div className="modal">
            <h2 className="modal-title">{editId ? 'Edit event' : 'Add event'}</h2>
            <div className="form-grid">
              <div className="form-field">
                <label>Day</label>
                <select value={form.day} onChange={e => setForm(f => ({ ...f, day: +e.target.value }))}>
                  <option value={1}>Day 1 — April 26</option>
                  <option value={2}>Day 2 — April 27</option>
                </select>
              </div>
              <div className="form-field">
                <label>Time</label>
                <input value={form.time} onChange={e => setForm(f => ({ ...f, time: e.target.value }))} placeholder="e.g. 9:30 AM" />
              </div>
            </div>
            <div className="form-field">
              <label>Activity *</label>
              <input value={form.activity} onChange={e => setForm(f => ({ ...f, activity: e.target.value }))} placeholder="What are you doing?" />
            </div>
            <div className="form-field">
              <label>Location *</label>
              <input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} placeholder="Where?" />
            </div>
            <div className="form-field">
              <label>Status</label>
              <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                {Object.keys(STATUS_CONFIG).map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="form-field">
              <label>Notes</label>
              <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Any details..." rows={3} />
            </div>
            <div className="modal-actions">
              <button className="btn-cancel" onClick={closeForm}>Cancel</button>
              <button className="btn-primary" onClick={save} disabled={saving}>
                {saving ? 'Saving...' : editId ? 'Save changes' : 'Add event'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteConfirm && (
        <div className="overlay" onClick={() => setDeleteConfirm(null)}>
          <div className="modal modal-sm">
            <h2 className="modal-title">Remove event?</h2>
            <p className="modal-desc">This will delete the event for everyone. This can't be undone.</p>
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setDeleteConfirm(null)}>Cancel</button>
              <button className="btn-danger" onClick={() => remove(deleteConfirm)}>Remove</button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}
    </div>
  )
}
