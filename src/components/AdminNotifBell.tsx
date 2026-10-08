import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  collection,
  getDocs,
  orderBy,
  query,
  limit,
  doc,
  updateDoc,
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import type { AdminNotification } from '../types/parent'
import {
  formatNotifTime,
  subscribePendingParentCount,
  toMillis,
} from '../lib/adminNotifications'

/**
 * Loneng notifikasi di header admin + badge pengajuan ortu pending.
 */
export default function AdminNotifBell() {
  const [open, setOpen] = useState(false)
  const [pendingOrtu, setPendingOrtu] = useState(0)
  const [notifs, setNotifs] = useState<AdminNotification[]>([])
  const [loading, setLoading] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const unsub = subscribePendingParentCount(setPendingOrtu)
    return () => unsub()
  }, [])

  const loadNotifs = async () => {
    setLoading(true)
    try {
      let snap
      try {
        snap = await getDocs(
          query(collection(db, 'adminNotifications'), orderBy('createdAt', 'desc'), limit(20))
        )
      } catch {
        snap = await getDocs(collection(db, 'adminNotifications'))
      }
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as AdminNotification))
      list.sort((a, b) => (toMillis(b.createdAt) || 0) - (toMillis(a.createdAt) || 0))
      setNotifs(list.slice(0, 20))
    } catch (err) {
      console.warn('adminNotifications', err)
      setNotifs([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (open) loadNotifs()
  }, [open])

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const unread = notifs.filter((n) => !n.read).length
  const badgeTotal = pendingOrtu + unread

  const markRead = async (id: string) => {
    try {
      await updateDoc(doc(db, 'adminNotifications', id), { read: true })
      setNotifs((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)))
    } catch (err) {
      console.warn(err)
    }
  }

  const linkFor = (n: AdminNotification): string => {
    if (n.type === 'parent_request' || n.refCollection === 'parentRequests') {
      return '/pengajuan-ortu'
    }
    if (n.type === 'student_attempt') return '/laporan'
    return '/dashboard'
  }

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative p-2 rounded-xl text-gray-500 hover:bg-gray-100 hover:text-indigo-600 transition"
        title="Notifikasi"
        aria-label="Notifikasi admin"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.75}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>
        {badgeTotal > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
            {badgeTotal > 99 ? '99+' : badgeTotal}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-[min(100vw-2rem,22rem)] bg-white rounded-2xl border border-gray-100 shadow-lg z-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-900">Notifikasi</p>
            <button
              type="button"
              onClick={() => loadNotifs()}
              className="text-[11px] text-indigo-600 hover:underline"
            >
              Muat ulang
            </button>
          </div>

          {pendingOrtu > 0 && (
            <Link
              to="/pengajuan-ortu"
              onClick={() => setOpen(false)}
              className="block px-4 py-3 bg-amber-50 border-b border-amber-100 hover:bg-amber-100/80 transition"
            >
              <p className="text-sm font-medium text-amber-900">
                {pendingOrtu} pengajuan akun orang tua menunggu
              </p>
              <p className="text-[11px] text-amber-700 mt-0.5">Klik untuk meninjau & menyetujui</p>
            </Link>
          )}

          <div className="max-h-72 overflow-y-auto">
            {loading ? (
              <p className="p-6 text-center text-xs text-gray-400">Memuat…</p>
            ) : notifs.length === 0 && pendingOrtu === 0 ? (
              <p className="p-6 text-center text-xs text-gray-400">Tidak ada notifikasi baru</p>
            ) : notifs.length === 0 ? (
              <p className="p-4 text-center text-xs text-gray-400">Tidak ada log notifikasi lain</p>
            ) : (
              <ul className="divide-y divide-gray-50">
                {notifs.map((n) => (
                  <li key={n.id}>
                    <Link
                      to={linkFor(n)}
                      onClick={() => {
                        if (n.id && !n.read) markRead(n.id)
                        setOpen(false)
                      }}
                      className={`block px-4 py-3 hover:bg-gray-50 transition ${
                        !n.read ? 'bg-indigo-50/40' : ''
                      }`}
                    >
                      <div className="flex gap-2 items-start">
                        {!n.read && (
                          <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0" />
                        )}
                        <div className={`min-w-0 flex-1 ${n.read ? 'pl-3.5' : ''}`}>
                          <p className="text-sm font-medium text-gray-900 leading-snug">{n.title}</p>
                          {n.body && (
                            <p className="text-[11px] text-gray-500 mt-0.5 line-clamp-2">{n.body}</p>
                          )}
                          <p className="text-[10px] text-gray-400 mt-1">
                            {formatNotifTime(toMillis(n.createdAt))}
                          </p>
                        </div>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50/80">
            <Link
              to="/pengajuan-ortu"
              onClick={() => setOpen(false)}
              className="text-xs font-medium text-indigo-600 hover:underline"
            >
              Buka pengajuan orang tua →
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
