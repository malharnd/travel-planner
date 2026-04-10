import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from './supabase'
import './App.css'

/* ── Time helpers ───────────────────────────────── */
function timeToMinutes(str) {
  const m = str && str.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i)
  if (!m) return 0
  let h = parseInt(m[1])
  const min = parseInt(m[2])
  const ap = m[3].toUpperCase()
  if (ap === 'PM' && h !== 12) h += 12
  if (ap === 'AM' && h === 12) h = 0
  return h * 60 + min
}

function parseTime(str) {
  const m = str && str.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i)
  if (m) return { hour: m[1], minute: m[2], ampm: m[3].toUpperCase() }
  return { hour: '9', minute: '00', ampm: 'AM' }
}

function TimePicker({ value, onChange }) {
  const p = parseTime(value)
  const [hour, setHour]   = useState(p.hour)
  const [minute, setMin]  = useState(p.minute)
  const [ampm, setAmpm]   = useState(p.ampm)
  const emit = (h, m, ap) => onChange(`${h}:${m} ${ap}`)
  return (
    <div className="time-picker">
      <select className="tp-seg" value={hour} onChange={e => { setHour(e.target.value); emit(e.target.value, minute, ampm) }}>
        {['1','2','3','4','5','6','7','8','9','10','11','12'].map(h => <option key={h} value={h}>{h}</option>)}
      </select>
      <span className="tp-colon">:</span>
      <select className="tp-seg" value={minute} onChange={e => { setMin(e.target.value); emit(hour, e.target.value, ampm) }}>
        {['00','15','30','45'].map(m => <option key={m} value={m}>{m}</option>)}
      </select>
      <select className="tp-seg tp-ampm" value={ampm} onChange={e => { setAmpm(e.target.value); emit(hour, minute, e.target.value) }}>
        <option value="AM">AM</option>
        <option value="PM">PM</option>
      </select>
    </div>
  )
}

/* ── Trip helpers ───────────────────────────────── */
const DAY_ACCENTS = ['#2E86AB','#1A3A5C','#2D6A4F','#8B4513','#6B21A8','#B85C20','#1A5C5A','#C2185B']

function formatTripDate(startDateStr, dayIndex) {
  const [y, mo, d] = startDateStr.split('-').map(Number)
  return new Date(y, mo - 1, d + dayIndex)
    .toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
}

function getTripDays(trip) {
  const days = {}
  for (let i = 1; i <= trip.num_days; i++) {
    days[i] = {
      label:  `Day ${i} — ${formatTripDate(trip.start_date, i - 1)}`,
      short:  `Day ${i}`,
      accent: DAY_ACCENTS[(i - 1) % DAY_ACCENTS.length],
    }
  }
  return days
}

function formatDateRange(trip) {
  const [y, mo, d] = trip.start_date.split('-').map(Number)
  const start = new Date(y, mo - 1, d)
  const end   = new Date(y, mo - 1, d + trip.num_days - 1)
  const opts  = { month: 'short', day: 'numeric' }
  if (trip.num_days === 1) return start.toLocaleDateString('en-US', { ...opts, year: 'numeric' })
  if (start.getMonth() === end.getMonth())
    return `${start.toLocaleDateString('en-US', opts)}–${end.getDate()}, ${end.getFullYear()}`
  return `${start.toLocaleDateString('en-US', opts)} – ${end.toLocaleDateString('en-US', { ...opts, year: 'numeric' })}`
}

/* ── Constants ──────────────────────────────────── */
const STATUS_CONFIG = {
  Booked:   { label: '✔ Booked',   cls: 'badge-booked',   dot: 'dot-booked'   },
  Pending:  { label: '~ Pending',  cls: 'badge-pending',  dot: 'dot-pending'  },
  Planned:  { label: '→ Planned',  cls: 'badge-planned',  dot: 'dot-planned'  },
  Optional: { label: '○ Optional', cls: 'badge-optional', dot: 'dot-optional' },
}

const EMPTY_FORM      = { day: 1, time: '9:00 AM', activity: '', location: '', status: 'Planned', notes: '', category: 'Activity', link: '' }
const EMPTY_TRIP_FORM = { name: '', start_date: '', num_days: 2, cover_emoji: '✈️', cover_color: '#2E86AB' }
const REACTION_EMOJIS = ['👍', '🔥', '❓', '😂', '✅']

const CATEGORY_CONFIG = {
  Activity:      { icon: '🥾' },
  Food:          { icon: '🍽️' },
  Transport:     { icon: '🚗' },
  Accommodation: { icon: '🏨' },
  Shopping:      { icon: '🛍️' },
  Entertainment: { icon: '🎭' },
}

const TRIP_EMOJIS  = ['✈️','🏔️','🏖️','🌍','🗺️','🏕️','🎿','🚢','🌴','🏛️','🎡','🌋']
const TRIP_COLORS  = ['#2E86AB','#1A3A5C','#2D6A4F','#8B4513','#6B21A8','#B85C20','#1A5C5A','#C2185B','#1565C0','#37474F']

function timeAgo(dateStr) {
  const diff = Math.floor((Date.now() - new Date(dateStr)) / 1000)
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

function nameInitial(name) {
  return name.trim().charAt(0).toUpperCase()
}

const AVATAR_COLORS = ['#2E86AB','#2D6A4F','#8B4513','#6B21A8','#B85C20','#1A5C5A','#C2185B','#1565C0']
function avatarColor(name) {
  let hash = 0
  for (const c of name) hash = (hash * 31 + c.charCodeAt(0)) & 0xffff
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]
}

/* ── App ────────────────────────────────────────── */
export default function App() {
  /* screen */
  const [screen,       setScreen]       = useState('trips')
  const [trips,        setTrips]        = useState([])
  const [loadingTrips, setLoadingTrips] = useState(true)
  const [activeTrip,   setActiveTrip]   = useState(null)

  /* events */
  const [events,    setEvents]    = useState([])
  const [loading,   setLoading]   = useState(false)
  const [activeDay, setActiveDay] = useState(1)
  const [filter,    setFilter]    = useState('All')

  /* event form */
  const [showForm,      setShowForm]      = useState(false)
  const [form,          setForm]          = useState(EMPTY_FORM)
  const [editId,        setEditId]        = useState(null)
  const [saving,        setSaving]        = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(null)

  /* trip form */
  const [showTripForm,      setShowTripForm]      = useState(false)
  const [tripForm,          setTripForm]          = useState(EMPTY_TRIP_FORM)
  const [savingTrip,        setSavingTrip]        = useState(false)
  const [deleteTripConfirm, setDeleteTripConfirm] = useState(null)

  /* add day */
  const [showAddDay,  setShowAddDay]  = useState(false)
  const [addDayDate,  setAddDayDate]  = useState('')
  const [addingDay,   setAddingDay]   = useState(false)

  /* suggestions */
  const [suggestions,  setSuggestions]  = useState([])
  const [suggName,     setSuggName]     = useState(() => localStorage.getItem('suggName') || '')
  const [suggText,     setSuggText]     = useState('')
  const [addingSugg,   setAddingSugg]   = useState(false)

  /* toast */
  const [toast, setToast] = useState(null)

  /* presence */
  const [presenceUsers, setPresenceUsers] = useState([])
  const presenceChRef = useRef(null)

  /* reactions */
  const [reactions, setReactions]           = useState([])
  const [reactionPicker, setReactionPicker] = useState(null)

  /* suggestion likes */
  const [suggLikes, setSuggLikes] = useState([])

  /* always dark */
  useEffect(() => { document.documentElement.setAttribute('data-theme', 'dark') }, [])

  /* close reaction picker on outside click */
  useEffect(() => {
    if (!reactionPicker) return
    const handler = (e) => {
      if (!e.target.closest('.reactions-row')) setReactionPicker(null)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [reactionPicker])

  /* Presence channel */
  useEffect(() => {
    if (!activeTrip) { setPresenceUsers([]); return }
    const name  = suggName.trim() || 'Guest'
    const color = avatarColor(name)
    const ch = supabase.channel(`presence-trip-${activeTrip.id}`)
      .on('presence', { event: 'sync' }, () => {
        const state = ch.presenceState()
        const seen  = new Set()
        const users = []
        Object.values(state).forEach(arr =>
          arr.forEach(u => { if (!seen.has(u.name)) { seen.add(u.name); users.push(u) } })
        )
        setPresenceUsers(users)
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') await ch.track({ name, color })
      })
    presenceChRef.current = ch
    return () => { supabase.removeChannel(ch); setPresenceUsers([]) }
  }, [activeTrip, suggName])

  /* keyboard */
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return
      if (showForm) closeForm()
      if (deleteConfirm) setDeleteConfirm(null)
      if (deleteTripConfirm) setDeleteTripConfirm(null)
      if (showTripForm) closeTripForm()
      if (showAddDay) setShowAddDay(false)
      if (reactionPicker) setReactionPicker(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showForm, deleteConfirm, deleteTripConfirm, showTripForm, showAddDay, reactionPicker])

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  /* ── Trips ────────────────────────────────────── */
  const fetchTrips = useCallback(async () => {
    const { data, error } = await supabase.from('trips').select('*').order('start_date')
    if (!error) setTrips(data || [])
    setLoadingTrips(false)
  }, [])

  useEffect(() => { fetchTrips() }, [fetchTrips])

  const openTrip = (trip) => {
    setActiveTrip(trip)
    setActiveDay(1)
    setFilter('All')
    setScreen('itinerary')
  }

  const backToTrips = () => {
    setScreen('trips')
    setActiveTrip(null)
    setEvents([])
    fetchTrips()
  }

  const closeTripForm = () => { setShowTripForm(false); setTripForm(EMPTY_TRIP_FORM) }

  const createTrip = async () => {
    if (!tripForm.name.trim() || !tripForm.start_date) return
    setSavingTrip(true)
    const { data, error } = await supabase
      .from('trips')
      .insert({ name: tripForm.name.trim(), start_date: tripForm.start_date, num_days: Math.max(1, parseInt(tripForm.num_days) || 1), cover_emoji: tripForm.cover_emoji, cover_color: tripForm.cover_color })
      .select().single()
    if (error) { showToast(`Failed to create trip: ${error.message}`, 'info') }
    else if (data) { showToast('Trip created! 🎉'); closeTripForm(); openTrip(data) }
    setSavingTrip(false)
  }

  const confirmDeleteTrip = async () => {
    await supabase.from('trips').delete().eq('id', deleteTripConfirm)
    setDeleteTripConfirm(null)
    fetchTrips()
    showToast('Trip deleted', 'info')
  }

  const openAddDay = () => {
    // Pre-fill with the day after the current end date
    const [y, m, d] = activeTrip.start_date.split('-').map(Number)
    const next = new Date(y, m - 1, d + activeTrip.num_days)
    setAddDayDate(next.toLocaleDateString('en-CA')) // YYYY-MM-DD
    setShowAddDay(true)
  }

  const submitAddDay = async () => {
    if (!addDayDate) return
    const [ny, nm, nd] = addDayDate.split('-').map(Number)
    const [sy, sm, sd] = activeTrip.start_date.split('-').map(Number)
    const picked = new Date(ny, nm - 1, nd)
    const start  = new Date(sy, sm - 1, sd)
    const diff   = Math.round((picked - start) / 86400000) // days from start

    // Already exists in the trip?
    if (diff >= 0 && diff < activeTrip.num_days) {
      showToast('That date is already in this trip', 'info')
      return
    }

    setAddingDay(true)
    if (diff < 0) {
      // Prepend — shift all existing events forward
      const shift = -diff
      await Promise.all(events.map(ev =>
        supabase.from('events').update({ day: ev.day + shift }).eq('id', ev.id)
      ))
      const newNumDays = activeTrip.num_days + shift
      await supabase.from('trips').update({ start_date: addDayDate, num_days: newNumDays }).eq('id', activeTrip.id)
      setActiveTrip({ ...activeTrip, start_date: addDayDate, num_days: newNumDays })
      setActiveDay(1)
      showToast(`Day added — ${addDayDate} is now Day 1`)
    } else {
      // Append (diff >= num_days) — extend trip to cover this date
      const newNumDays = diff + 1
      await supabase.from('trips').update({ num_days: newNumDays }).eq('id', activeTrip.id)
      setActiveTrip({ ...activeTrip, num_days: newNumDays })
      setActiveDay(newNumDays)
      showToast(`Day ${newNumDays} added!`)
    }
    await fetchEvents()
    setAddingDay(false)
    setShowAddDay(false)
  }

  /* ── Suggestions ─────────────────────────────── */
  const fetchSuggestions = useCallback(async () => {
    if (!activeTrip) return
    const { data, error } = await supabase
      .from('suggestions').select('*')
      .eq('trip_id', activeTrip.id)
      .order('created_at')
    if (!error) setSuggestions(data || [])
  }, [activeTrip])

  const fetchSuggLikes = useCallback(async () => {
    if (!activeTrip) return
    const { data } = await supabase
      .from('suggestion_likes').select('*')
      .in('suggestion_id', (await supabase.from('suggestions').select('id').eq('trip_id', activeTrip.id)).data?.map(s => s.id) || [])
    if (data) setSuggLikes(data)
  }, [activeTrip])

  const toggleSuggLike = async (suggId) => {
    const name     = suggName.trim() || 'Anonymous'
    const existing = suggLikes.find(l => l.suggestion_id === suggId && l.user_name === name)
    if (existing) {
      await supabase.from('suggestion_likes').delete().eq('id', existing.id)
    } else {
      await supabase.from('suggestion_likes').insert({ suggestion_id: suggId, user_name: name })
    }
    fetchSuggLikes()
  }

  useEffect(() => { if (activeTrip) { fetchSuggestions(); fetchSuggLikes() } }, [activeTrip, fetchSuggestions, fetchSuggLikes])

  const addSuggestion = async () => {
    if (!suggName.trim() || !suggText.trim()) return
    setAddingSugg(true)
    localStorage.setItem('suggName', suggName.trim())
    const { error } = await supabase.from('suggestions').insert({
      trip_id: activeTrip.id,
      day: activeDay,
      name: suggName.trim(),
      text: suggText.trim(),
    })
    if (!error) { setSuggText(''); fetchSuggestions() }
    setAddingSugg(false)
  }

  const deleteSuggestion = async (id) => {
    await supabase.from('suggestions').delete().eq('id', id)
    fetchSuggestions()
  }

  /* ── Reactions ────────────────────────────────── */
  const fetchReactions = useCallback(async () => {
    if (!activeTrip) return
    const { data } = await supabase.from('reactions').select('*').eq('trip_id', activeTrip.id)
    if (data) setReactions(data)
  }, [activeTrip])

  useEffect(() => {
    if (!activeTrip) return
    fetchReactions()
    const ch = supabase.channel(`reactions-${activeTrip.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reactions', filter: `trip_id=eq.${activeTrip.id}` }, fetchReactions)
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [activeTrip, fetchReactions])

  const toggleReaction = async (eventId, emoji) => {
    const name     = suggName.trim() || 'Anonymous'
    const existing = reactions.find(r => r.event_id === eventId && r.emoji === emoji && r.user_name === name)
    if (existing) {
      await supabase.from('reactions').delete().eq('id', existing.id)
    } else {
      await supabase.from('reactions').insert({ event_id: eventId, trip_id: activeTrip.id, emoji, user_name: name })
    }
    fetchReactions()
    setReactionPicker(null)
  }

  /* ── Events ───────────────────────────────────── */
  const fetchEvents = useCallback(async () => {
    if (!activeTrip) return
    setLoading(true)
    const { data, error } = await supabase
      .from('events').select('*')
      .eq('trip_id', activeTrip.id)
      .order('day').order('sort_order')
    if (!error) setEvents(data || [])
    setLoading(false)
  }, [activeTrip])

  useEffect(() => {
    if (!activeTrip) return
    fetchEvents()
    const ch = supabase
      .channel(`events-${activeTrip.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'events', filter: `trip_id=eq.${activeTrip.id}` }, fetchEvents)
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [activeTrip, fetchEvents])

  const openAdd  = () => { setEditId(null); setForm({ ...EMPTY_FORM, day: activeDay }); setShowForm(true) }
  const openEdit = (ev) => {
    setEditId(ev.id)
    setForm({ day: ev.day, time: ev.time, activity: ev.activity, location: ev.location, status: ev.status, notes: ev.notes || '', category: ev.category || 'Activity', link: ev.link || '' })
    setShowForm(true)
  }
  const closeForm = () => { setShowForm(false); setEditId(null); setForm(EMPTY_FORM) }
  const setField  = (key) => (e) => setForm(f => ({ ...f, [key]: e.target.value }))
  const isValid   = form.activity.trim() && form.location.trim()

  const save = async () => {
    if (!isValid) return
    setSaving(true)
    const dayEvts  = events.filter(e => e.day === form.day)
    const maxOrder = dayEvts.length ? Math.max(...dayEvts.map(e => e.sort_order)) : 0
    if (editId) {
      const { error } = await supabase.from('events').update({ ...form }).eq('id', editId)
      if (!error) { showToast('Event updated!'); closeForm(); fetchEvents() }
    } else {
      const { error } = await supabase.from('events').insert({ ...form, trip_id: activeTrip.id, sort_order: maxOrder + 1 })
      if (!error) { showToast('Event added!'); closeForm(); fetchEvents() }
    }
    setSaving(false)
  }

  const remove = async (id) => {
    await supabase.from('events').delete().eq('id', id)
    setDeleteConfirm(null)
    showToast('Event removed', 'info')
    fetchEvents()
  }

  /* ── Derived ──────────────────────────────────── */
  const daySuggestions = suggestions.filter(s => s.day === activeDay)
  const days           = activeTrip ? getTripDays(activeTrip) : {}
  const dayEvents      = events.filter(e => e.day === activeDay).sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time))
  const filteredEvents = filter === 'All' ? dayEvents : dayEvents.filter(e => e.status === filter)
  const bookedCount    = dayEvents.filter(e => e.status === 'Booked').length
  const pendingCount   = dayEvents.filter(e => e.status === 'Pending').length
  const plannedCount   = dayEvents.filter(e => e.status === 'Planned').length
  const optionalCount  = dayEvents.filter(e => e.status === 'Optional').length
  const confirmedCount = bookedCount + plannedCount
  const bookedPct      = dayEvents.length ? Math.round((confirmedCount / dayEvents.length) * 100) : 0

  /* ══════════════════════════════════════════════ */
  /* TRIP LIST SCREEN                               */
  /* ══════════════════════════════════════════════ */
  if (screen === 'trips') return (
    <div className="app">
      <header className="header">
        <div className="header-top">
          <div className="header-brand">
            <span className="header-icon">✈️</span>
            <div>
              <h1 className="title">My Trips</h1>
              <p className="subtitle">Plan and manage your travel itineraries</p>
            </div>
          </div>
          <div className="header-actions">
            <button className="btn-primary" onClick={() => setShowTripForm(true)}>＋ New trip</button>
          </div>
        </div>
      </header>

      <main className="main" style={{ paddingTop: 16 }}>
        {loadingTrips ? (
          <div className="empty"><div className="spinner" /><p>Loading trips…</p></div>
        ) : trips.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">🗺️</div>
            <p className="empty-title">No trips yet</p>
            <p className="empty-sub">Click <strong>＋ New trip</strong> to get started.</p>
          </div>
        ) : (
          <div className="trip-list">
            {trips.map(trip => (
              <div key={trip.id} className="trip-card" onClick={() => openTrip(trip)} style={{ borderLeft: `4px solid ${trip.cover_color || '#2E86AB'}` }}>
                <div className="trip-card-icon">{trip.cover_emoji || '✈️'}</div>
                <div className="trip-card-body">
                  <div className="trip-card-name">{trip.name}</div>
                  <div className="trip-card-meta">
                    <span>📅 {formatDateRange(trip)}</span>
                    <span className="meta-dot">·</span>
                    <span>{trip.num_days} {trip.num_days === 1 ? 'day' : 'days'}</span>
                  </div>
                </div>
                <div className="trip-card-arrow">→</div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Create trip modal */}
      {showTripForm && (
        <div className="overlay" onClick={e => e.target === e.currentTarget && closeTripForm()}>
          <div className="modal" role="dialog">
            <div className="modal-header">
              <h2 className="modal-title">✈️ New trip</h2>
              <button className="btn-close" onClick={closeTripForm}>✕</button>
            </div>
            <div className="form-field">
              <label>Trip name *</label>
              <input value={tripForm.name} onChange={e => setTripForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Japan 2027" autoFocus />
            </div>
            <div className="form-grid">
              <div className="form-field">
                <label>Start date *</label>
                <input type="date" value={tripForm.start_date} onChange={e => setTripForm(f => ({ ...f, start_date: e.target.value }))} />
              </div>
              <div className="form-field">
                <label>Number of days</label>
                <input type="number" min="1" max="30" value={tripForm.num_days} onChange={e => setTripForm(f => ({ ...f, num_days: e.target.value }))} onBlur={e => setTripForm(f => ({ ...f, num_days: Math.max(1, parseInt(e.target.value) || 1) }))} />
              </div>
            </div>
            <div className="form-field">
              <label>Cover icon</label>
              <div className="cover-emoji-picker">
                {TRIP_EMOJIS.map(e => (
                  <button key={e} type="button" className={`cover-emoji-btn ${tripForm.cover_emoji === e ? 'cover-emoji-active' : ''}`} onClick={() => setTripForm(f => ({ ...f, cover_emoji: e }))}>{e}</button>
                ))}
              </div>
            </div>
            <div className="form-field">
              <label>Cover color</label>
              <div className="cover-color-picker">
                {TRIP_COLORS.map(c => (
                  <button key={c} type="button" className={`cover-color-btn ${tripForm.cover_color === c ? 'cover-color-active' : ''}`} style={{ background: c }} onClick={() => setTripForm(f => ({ ...f, cover_color: c }))} />
                ))}
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn-cancel" onClick={closeTripForm}>Cancel</button>
              <button className="btn-primary" onClick={createTrip} disabled={savingTrip || !tripForm.name.trim() || !tripForm.start_date}>
                {savingTrip ? 'Creating…' : 'Create trip'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete trip confirm */}
      {deleteTripConfirm && (
        <div className="overlay" onClick={() => setDeleteTripConfirm(null)}>
          <div className="modal modal-sm" role="dialog">
            <div className="modal-header">
              <h2 className="modal-title">Delete trip?</h2>
              <button className="btn-close" onClick={() => setDeleteTripConfirm(null)}>✕</button>
            </div>
            <p className="modal-desc">This will permanently delete the trip and all its events. This can't be undone.</p>
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setDeleteTripConfirm(null)}>Cancel</button>
              <button className="btn-danger" onClick={confirmDeleteTrip}>Delete trip</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}
    </div>
  )

  /* ══════════════════════════════════════════════ */
  /* ITINERARY SCREEN                               */
  /* ══════════════════════════════════════════════ */
  return (
    <div className="app">
      <header className="header">
        <div className="header-top">
          <div className="header-brand">
            <button className="btn-back" onClick={backToTrips} title="All trips">←</button>
            <div>
              <h1 className="title">{activeTrip.name}</h1>
              <p className="subtitle">{formatDateRange(activeTrip)} · {activeTrip.num_days} {activeTrip.num_days === 1 ? 'day' : 'days'}</p>
            </div>
          </div>
          <div className="header-actions">
            {presenceUsers.length > 0 && (
              <div className="presence-cluster">
                {presenceUsers.slice(0, 4).map((u, i) => (
                  <div key={u.name} className="presence-avatar" style={{ background: u.color, zIndex: 10 - i }} title={`${u.name} is here`}>
                    {u.name.charAt(0).toUpperCase()}
                  </div>
                ))}
                {presenceUsers.length > 4 && (
                  <div className="presence-avatar presence-overflow">+{presenceUsers.length - 4}</div>
                )}
                <span className="presence-count">{presenceUsers.length} online</span>
              </div>
            )}
            <button className="btn-primary" onClick={openAdd}>＋ Add event</button>
          </div>
        </div>

        {/* Day tabs + Add day */}
        <div className="tabs">
          {Object.entries(days).map(([d, day]) => {
            const dn = Number(d)
            return (
              <button
                key={dn}
                className={`tab ${activeDay === dn ? 'tab-active' : ''}`}
                onClick={() => { setActiveDay(dn); setFilter('All') }}
                style={activeDay === dn ? { borderBottomColor: day.accent, color: day.accent } : {}}
              >
                {days[dn].label}
                <span className="tab-count">{events.filter(e => e.day === dn).length}</span>
              </button>
            )
          })}
          <button className="tab tab-add" onClick={openAddDay} title="Add a day">＋ day</button>
        </div>
      </header>

      {/* Stats bar */}
      {!loading && dayEvents.length > 0 && (
        <div className="stats-bar">
          <div className="stat-chips">
            <span className="stat-chip"><span className="stat-val">{dayEvents.length}</span><span className="stat-lbl">total</span></span>
            <span className="stat-divider" />
            <span className="stat-chip chip-booked"><span className="stat-val">{bookedCount}</span><span className="stat-lbl">booked</span></span>
            <span className="stat-divider" />
            <span className="stat-chip chip-planned"><span className="stat-val">{plannedCount}</span><span className="stat-lbl">planned</span></span>
            <span className="stat-divider" />
            <span className="stat-chip chip-pending"><span className="stat-val">{pendingCount}</span><span className="stat-lbl">pending</span></span>
            <span className="stat-divider" />
            <span className="stat-chip chip-optional"><span className="stat-val">{optionalCount}</span><span className="stat-lbl">optional</span></span>
            <span className="stat-divider" />
            <span className="stat-chip"><span className="stat-val">{bookedPct}%</span><span className="stat-lbl">confirmed</span></span>
          </div>
          <div className="progress-track"><div className="progress-fill" style={{ width: `${bookedPct}%` }} /></div>
        </div>
      )}

      {/* Filter toolbar */}
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

      {/* Timeline */}
      <main className="main">
        {loading ? (
          <div className="empty"><div className="spinner" /><p>Loading itinerary…</p></div>
        ) : dayEvents.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">🗺️</div>
            <p className="empty-title">No events yet</p>
            <p className="empty-sub">Click <strong>＋ Add event</strong> to start planning {days[activeDay]?.short}.</p>
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
                <div className="tl-time">{ev.time}</div>
                <div className="tl-connector">
                  <div className={`tl-dot ${STATUS_CONFIG[ev.status]?.dot}`} />
                  {i < filteredEvents.length - 1 && <div className="tl-line" />}
                </div>
                <div className={`tl-card tl-card-${ev.status.toLowerCase()}`}>
                  <div className="tl-card-header">
                    <div className="tl-card-title">{ev.activity}</div>
                    <span className={`badge ${STATUS_CONFIG[ev.status]?.cls}`}>{STATUS_CONFIG[ev.status]?.label}</span>
                  </div>
                  <div className="tl-card-loc">
                    <span className="tl-cat-icon">{CATEGORY_CONFIG[ev.category]?.icon || '📍'}</span> {ev.location}
                    {ev.link && <a className="tl-card-link" href={ev.link} target="_blank" rel="noreferrer">🔗 Link</a>}
                  </div>
                  {ev.notes && <div className="tl-card-notes">{ev.notes}</div>}
                  {/* Reactions */}
                  {(() => {
                    const evReactions = reactions.filter(r => r.event_id === ev.id)
                    const grouped = {}
                    evReactions.forEach(r => { if (!grouped[r.emoji]) grouped[r.emoji] = []; grouped[r.emoji].push(r.user_name) })
                    const userName = suggName.trim() || 'Anonymous'
                    return (
                      <div className="reactions-row">
                        {Object.entries(grouped).map(([emoji, names]) => (
                          <button key={emoji} className={`reaction-pill ${names.includes(userName) ? 'reaction-mine' : ''}`} onClick={() => toggleReaction(ev.id, emoji)} title={names.join(', ')}>
                            {emoji} {names.length}
                          </button>
                        ))}
                        <button className="reaction-add-btn" onClick={() => setReactionPicker(reactionPicker === ev.id ? null : ev.id)}>＋</button>
                        {reactionPicker === ev.id && (
                          <div className="reaction-picker">
                            {REACTION_EMOJIS.map(e => (
                              <button key={e} className="reaction-picker-btn" onClick={() => toggleReaction(ev.id, e)}>{e}</button>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })()}
                  <div className="tl-card-actions">
                    <button className="btn-edit" onClick={() => openEdit(ev)}>✎ Edit</button>
                    <button className="btn-del" onClick={() => setDeleteConfirm(ev.id)}>✕</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Add / Edit Modal */}
      {showForm && (
        <div className="overlay" onClick={e => e.target === e.currentTarget && closeForm()}>
          <div className="modal" role="dialog">
            <div className="modal-header">
              <h2 className="modal-title">{editId ? '✎ Edit event' : '＋ Add event'}</h2>
              <button className="btn-close" onClick={closeForm}>✕</button>
            </div>
            <div className="form-grid">
              <div className="form-field">
                <label>Day</label>
                <select value={form.day} onChange={setField('day')}>
                  {Object.entries(days).map(([d, day]) => (
                    <option key={d} value={Number(d)}>{day.label}</option>
                  ))}
                </select>
              </div>
              <div className="form-field">
                <label>Time *</label>
                <TimePicker value={form.time || '9:00 AM'} onChange={v => setForm(f => ({ ...f, time: v }))} />
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
            <div className="form-grid">
              <div className="form-field">
                <label>Category</label>
                <select value={form.category} onChange={setField('category')}>
                  {Object.entries(CATEGORY_CONFIG).map(([cat, cfg]) => (
                    <option key={cat} value={cat}>{cfg.icon} {cat}</option>
                  ))}
                </select>
              </div>
              <div className="form-field">
                <label>Status</label>
                <select value={form.status} onChange={setField('status')}>
                  {Object.keys(STATUS_CONFIG).map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div className="form-field">
              <label>Link</label>
              <input value={form.link} onChange={setField('link')} placeholder="https://… (booking, maps, website)" />
            </div>
            <div className="form-field">
              <label>Notes</label>
              <textarea value={form.notes} onChange={setField('notes')} placeholder="Any extra details, links, or reminders…" rows={3} />
            </div>
            {!isValid && (form.activity || form.location) && (
              <p className="form-hint">⚠ Activity and location are required.</p>
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

      {/* Add day modal */}
      {showAddDay && (
        <div className="overlay" onClick={e => e.target === e.currentTarget && setShowAddDay(false)}>
          <div className="modal modal-sm" role="dialog">
            <div className="modal-header">
              <h2 className="modal-title">＋ Add a day</h2>
              <button className="btn-close" onClick={() => setShowAddDay(false)}>✕</button>
            </div>
            <p className="modal-desc">Pick any date — if it's before the trip start it becomes Day 1 and shifts everything forward.</p>
            <div className="form-field">
              <label>Date</label>
              <input type="date" value={addDayDate} onChange={e => setAddDayDate(e.target.value)} autoFocus />
            </div>
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setShowAddDay(false)}>Cancel</button>
              <button className="btn-primary" onClick={submitAddDay} disabled={addingDay || !addDayDate}>
                {addingDay ? 'Adding…' : 'Add day'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Suggestions panel */}
      <section className="sugg-panel">
        <div className="sugg-header">
          <span className="sugg-title">💡 Suggestions</span>
          {daySuggestions.length > 0 && <span className="sugg-count">{daySuggestions.length}</span>}
        </div>

        {daySuggestions.length === 0 && (
          <p className="sugg-empty">No suggestions yet for this day. Be the first!</p>
        )}

        <div className="sugg-list">
          {daySuggestions.map(s => {
            const likes    = suggLikes.filter(l => l.suggestion_id === s.id)
            const liked    = likes.some(l => l.user_name === (suggName.trim() || 'Anonymous'))
            return (
              <div key={s.id} className="sugg-card">
                <div className="sugg-avatar" style={{ background: avatarColor(s.name) }}>{nameInitial(s.name)}</div>
                <div className="sugg-body">
                  <div className="sugg-meta">
                    <span className="sugg-name">{s.name}</span>
                    <span className="sugg-time">{timeAgo(s.created_at)}</span>
                  </div>
                  <p className="sugg-text">{s.text}</p>
                </div>
                <div className="sugg-actions">
                  <button className={`sugg-like ${liked ? 'sugg-like-active' : ''}`} onClick={() => toggleSuggLike(s.id)} title={likes.map(l => l.user_name).join(', ') || 'Like'}>
                    👍 {likes.length > 0 && <span>{likes.length}</span>}
                  </button>
                  <button className="sugg-del" onClick={() => deleteSuggestion(s.id)} title="Remove">✕</button>
                </div>
              </div>
            )
          })}
        </div>

        <div className="sugg-form">
          <input
            className="sugg-input"
            placeholder="Your name"
            value={suggName}
            onChange={e => setSuggName(e.target.value)}
          />
          <div className="sugg-row">
            <input
              className="sugg-input sugg-input-grow"
              placeholder="Add a suggestion for this day…"
              value={suggText}
              onChange={e => setSuggText(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && addSuggestion()}
            />
            <button
              className="btn-primary sugg-submit"
              onClick={addSuggestion}
              disabled={addingSugg || !suggName.trim() || !suggText.trim()}
            >
              {addingSugg ? '…' : 'Post'}
            </button>
          </div>
        </div>
      </section>

      {/* Delete event confirm */}
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

      {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}
    </div>
  )
}
