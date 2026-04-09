import { useState, useEffect, useCallback } from 'react'
import { supabase } from './supabase'
import './App.css'

// Generate 30-min time slots 6:00 AM – 11:30 PM
const TIME_OPTIONS = (() => {
  const opts = []
  for (let h = 6; h <= 23; h++) {
    for (const m of [0, 30]) {
      const hour   = h > 12 ? h - 12 : h === 0 ? 12 : h
      const period = h >= 12 ? 'PM' : 'AM'
      const min    = m === 0 ? '00' : '30'
      opts.push(`${hour}:${min} ${period}`)
    }
  }
  return opts
})()

const STATUS_CONFIG = {
  Booked:   { label: '✔ Booked',   cls: 'badge-booked',   dot: 'dot-booked'   },
  Pending:  { label: '~ Pending',  cls: 'badge-pending',  dot: 'dot-pending'  },
  Planned:  { label: '→ Planned',  cls: 'badge-planned',  dot: 'dot-planned'  },
  Optional: { label: '○ Optional', cls: 'badge-optional', dot: 'dot-optional' },
}

const DAYS = {
  1: { label: 'Day 1 — Sunday, April 26',  short: 'Day 1', accent: '#1A3A5C' },
  2: { label: 'Day 2 — Monday, April 27',  short: 'Day 2', accent: '#2E86AB' },
}

const EMPTY_FORM = { day: 1, time: '', activity: '', location: '', status: 'Planned', notes: '' }

export default function App() {
  const [events, setEvents]               = useState([])
  const [loading, setLoading]             = useState(true)
  const [showForm, setShowForm]           = useState(false)
  const [form, setForm]                   = useState(EMPTY_FORM)
  const [editId, setEditId]               = useState(null)
  const [saving, setSaving]               = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const [activeDay, setActiveDay]         = useState(1)
  const [toast, setToast]                 = useState(null)
  const [filter, setFilter]               = useState('All')

  /* ── Always dark ── */
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', 'dark')
  }, [])

  /* ── Keyboard shortcuts ── */
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        if (showForm) closeForm()
        if (deleteConfirm) setDeleteConfirm(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showForm, deleteConfirm])

  /* ── Supabase ── */
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

  /* ── Form helpers ── */
  const openAdd = () => { setEditId(null); setForm({ ...EMPTY_FORM, day: activeDay }); setShowForm(true) }
  const openEdit = (ev) => {
    setEditId(ev.id)
    setForm({ day: ev.day, time: ev.time, activity: ev.activity, location: ev.location, status: ev.status, notes: ev.notes || '' })
    setShowForm(true)
  }
  const closeForm = () => { setShowForm(false); setEditId(null); setForm(EMPTY_FORM) }
  const setField  = (key) => (e) => setForm(f => ({ ...f, [key]: e.target.value }))
  const isValid   = form.activity.trim() && form.time.trim() && form.location.trim()

  const save = async () => {
    if (!isValid) return
    setSaving(true)
    const dayEvents = events.filter(e => e.day === form.day)
    const maxOrder  = dayEvents.length ? Math.max(...dayEvents.map(e => e.sort_order)) : 0
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

  /* ── Derived data ── */
  const dayEvents      = events.filter(e => e.day === activeDay)
  const filteredEvents = filter === 'All' ? dayEvents : dayEvents.filter(e => e.status === filter)
  const bookedCount    = dayEvents.filter(e => e.status === 'Booked').length
  const pendingCount   = dayEvents.filter(e => e.status === 'Pending').length
  const bookedPct      = dayEvents.length ? Math.round((bookedCount / dayEvents.length) * 100) : 0

  /* ── Render ── */
  return (
    <div className="app">

      {/* ── Header ── */}
      <header className="header">
        <div className="header-top">
          <div className="header-brand">
            <span className="header-icon">✈️</span>
            <div>
              <h1 className="title">Banff 2026</h1>
              <p className="subtitle">April 26–27 &nbsp;·&nbsp; Res #3878741 &nbsp;·&nbsp; 8 people</p>
            </div>
          </div>
          <div className="header-actions">
            <button className="btn-primary" onClick={openAdd}>＋ Add event</button>
          </div>
        </div>

        {/* Day tabs */}
        <div className="tabs">
          {[1, 2].map(d => (
            <button
              key={d}
              className={`tab ${activeDay === d ? 'tab-active' : ''}`}
              onClick={() => { setActiveDay(d); setFilter('All') }}
              style={activeDay === d ? { borderBottomColor: DAYS[d].accent, color: DAYS[d].accent } : {}}
            >
              {DAYS[d].label}
              <span className="tab-count">{events.filter(e => e.day === d).length}</span>
            </button>
          ))}
        </div>
      </header>

      {/* ── Stats bar ── */}
      {!loading && dayEvents.length > 0 && (
        <div className="stats-bar">
          <div className="stat-chips">
            <span className="stat-chip">
              <span className="stat-val">{dayEvents.length}</span>
              <span className="stat-lbl">events</span>
            </span>
            <span className="stat-divider" />
            <span className="stat-chip chip-booked">
              <span className="stat-val">{bookedCount}</span>
              <span className="stat-lbl">booked</span>
            </span>
            <span className="stat-divider" />
            <span className="stat-chip chip-pending">
              <span className="stat-val">{pendingCount}</span>
              <span className="stat-lbl">pending</span>
            </span>
            <span className="stat-divider" />
            <span className="stat-chip">
              <span className="stat-val">{bookedPct}%</span>
              <span className="stat-lbl">confirmed</span>
            </span>
          </div>
          {/* Progress bar */}
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${bookedPct}%` }} />
          </div>
        </div>
      )}

      {/* ── Filter toolbar ── */}
      {!loading && dayEvents.length > 0 && (
        <div className="filter-bar">
          {['All', ...Object.keys(STATUS_CONFIG)].map(s => (
            <button
              key={s}
              className={`filter-btn ${filter === s ? 'filter-active' : ''} ${s !== 'All' ? STATUS_CONFIG[s].cls : ''}`}
              onClick={() => setFilter(s)}
            >
              {s === 'All' ? `All (${dayEvents.length})` : `${STATUS_CONFIG[s].label} (${dayEvents.filter(e => e.status === s).length})`}
            </button>
          ))}
        </div>
      )}

      {/* ── Timeline ── */}
      <main className="main">
        {loading ? (
          <div className="empty">
            <div className="spinner" />
            <p>Loading your itinerary…</p>
          </div>
        ) : dayEvents.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">🗺️</div>
            <p className="empty-title">No events yet</p>
            <p className="empty-sub">Click <strong>＋ Add event</strong> to start planning {DAYS[activeDay].short}.</p>
          </div>
        ) : filteredEvents.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">🔍</div>
            <p className="empty-title">No {filter} events</p>
            <p className="empty-sub">Try a different filter above.</p>
          </div>
        ) : (
          <div className="timeline">
            {filteredEvents.map((ev, i) => (
              <div key={ev.id} className="timeline-item" style={{ animationDelay: `${i * 50}ms` }}>
                {/* Time column */}
                <div className="tl-time">{ev.time}</div>

                {/* Connector */}
                <div className="tl-connector">
                  <div className={`tl-dot ${STATUS_CONFIG[ev.status]?.dot}`} />
                  {i < filteredEvents.length - 1 && <div className="tl-line" />}
                </div>

                {/* Card */}
                <div className={`tl-card tl-card-${ev.status.toLowerCase()}`}>
                  <div className="tl-card-header">
                    <div className="tl-card-title">{ev.activity}</div>
                    <span className={`badge ${STATUS_CONFIG[ev.status]?.cls}`}>
                      {STATUS_CONFIG[ev.status]?.label}
                    </span>
                  </div>
                  <div className="tl-card-loc">📍 {ev.location}</div>
                  {ev.notes && <div className="tl-card-notes">{ev.notes}</div>}
                  <div className="tl-card-actions">
                    <button className="btn-edit" onClick={() => openEdit(ev)}>✎ Edit</button>
                    <button className="btn-del"  onClick={() => setDeleteConfirm(ev.id)}>✕</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* ── Add / Edit Modal ── */}
      {showForm && (
        <div className="overlay" onClick={(e) => e.target === e.currentTarget && closeForm()}>
          <div className="modal" role="dialog" aria-modal="true">
            <div className="modal-header">
              <h2 className="modal-title">{editId ? '✎ Edit event' : '＋ Add event'}</h2>
              <button className="btn-close" onClick={closeForm}>✕</button>
            </div>
            <div className="form-grid">
              <div className="form-field">
                <label>Day</label>
                <select value={form.day} onChange={setField('day')}>
                  <option value={1}>Day 1 — April 26</option>
                  <option value={2}>Day 2 — April 27</option>
                </select>
              </div>
              <div className="form-field">
                <label>Time *</label>
                <select value={form.time} onChange={setField('time')}>
                  <option value="">Select a time…</option>
                  {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>
            <div className="form-field">
              <label>Activity *</label>
              <input value={form.activity} onChange={setField('activity')} placeholder="What are you doing?" autoFocus />
            </div>
            <div className="form-field">
              <label>Location *</label>
              <input value={form.location} onChange={setField('location')} placeholder="Where?" />
            </div>
            <div className="form-field">
              <label>Status</label>
              <select value={form.status} onChange={setField('status')}>
                {Object.keys(STATUS_CONFIG).map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="form-field">
              <label>Notes</label>
              <textarea value={form.notes} onChange={setField('notes')} placeholder="Any extra details, links, or reminders…" rows={3} />
            </div>
            {!isValid && (form.activity || form.time || form.location) && (
              <p className="form-hint">⚠ Activity, time, and location are required.</p>
            )}
            <div className="modal-actions">
              <button className="btn-cancel" onClick={closeForm}>Cancel</button>
              <button className="btn-primary" onClick={save} disabled={saving || !isValid}>
                {saving ? 'Saving…' : editId ? 'Save changes' : 'Add event'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete confirm ── */}
      {deleteConfirm && (
        <div className="overlay" onClick={() => setDeleteConfirm(null)}>
          <div className="modal modal-sm" role="dialog">
            <div className="modal-header">
              <h2 className="modal-title">Remove event?</h2>
              <button className="btn-close" onClick={() => setDeleteConfirm(null)}>✕</button>
            </div>
            <p className="modal-desc">This will delete the event for everyone and can't be undone.</p>
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setDeleteConfirm(null)}>Cancel</button>
              <button className="btn-danger" onClick={() => remove(deleteConfirm)}>Remove</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Toast ── */}
      {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}
    </div>
  )
}
