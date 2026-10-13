import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import type { AdminNotification } from '../types/parent'
import {
  formatNotifTime,
  subscribePendingParentCount,
  subscribeUnreadNotifCount,
  fetchUnreadNotifications,
  dismissNotification,
  dismissAllNotifications,
  toMillis,
} from '../lib/adminNotifications'

/**
 * Lonceng notifikasi di header admin + badge pengajuan ortu pending.
 * Hanya menampilkan notifikasi belum dibaca; setelah diklik, dihapus otomatis.
 *
 * Daftar di-cache di state: buka panel lagi tidak memicu loading penuh
 * kecuali cache kosong / badge naik / tekan Muat ulang.
 */
export default function AdminNotifBell() {
  const [open, setOpen] = useState(false)
  const [pendingOrtu, setPendingOrtu] = useState(0)
  const [unreadCount, setUnreadCount] = useState(0)
  const [notifs, setNotifs] = useState<AdminNotification[]>([])
  /** true hanya saat fetch pertama / cache kosong — bukan soft refresh */
  const [loading, setLoading] = useState(false)
  const [clearing, setClearing] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const lastKnownCount = useRef(0)
  const fetching = useRef(false)
  const hasLoadedOnce = useRef(false)

  useEffect(() => {
    const unsubPending = subscribePendingParentCount(setPendingOrtu)
    const unsubUnread = subscribeUnreadNotifCount(setUnreadCount)
    return () => {
      unsubPending()
      unsubUnread()
    }
  }, [])

  const loadNotifs = useCallback(async (opts?: { force?: boolean; soft?: boolean }) => {
    if (fetching.current) return
    fetching.current = true
    const showSpinner = opts?.force || !hasLoadedOnce.current || notifs.length === 0
    if (showSpinner && !opts?.soft) setLoading(true)
    try {
      const list = await fetchUnreadNotifications()
      setNotifs(list)
      hasLoadedOnce.current = true
      lastKnownCount.current = list.length
    } catch (err) {
      console.warn('adminNotifications', err)
      if (!hasLoadedOnce.current) setNotifs([])
    } finally {
      setLoading(false)
      fetching.current = false
    }
  }, [notifs.length])

  // Buka panel: tampilkan cache instan; fetch hanya jika belum pernah / count berubah
  useEffect(() => {
    if (!open) return
    const countGrew = unreadCount > lastKnownCount.current
    if (!hasLoadedOnce.current || notifs.length === 0) {
      void loadNotifs({ force: true })
    } else if (countGrew) {
      void loadNotifs({ soft: true })
    }
    lastKnownCount.current = Math.max(lastKnownCount.current, unreadCount)
  }, [open, unreadCount, notifs.length, loadNotifs])

  // Badge naik saat panel tertutup → cache stale; soft refresh di background
  useEffect(() => {
    if (open) return
    if (unreadCount > lastKnownCount.current && hasLoadedOnce.current) {
      void loadNotifs({ soft: true })
    }
  }, [unreadCount, open, loadNotifs])

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const badgeTotal = pendingOrtu + unreadCount

  const handleDismiss = async (id: string) => {
    // Optimistik: hilangkan dari UI dulu, tanpa loading ulang daftar
    setNotifs((prev) => prev.filter((n) => n.id !== id))
    setUnreadCount((c) => Math.max(0, c - 1))
    lastKnownCount.current = Math.max(0, lastKnownCount.current - 1)
    try {
      await dismissNotification(id)
    } catch (err) {
      console.warn(err)
    }
  }

  const handleClearAll = async () => {
    if (notifs.length === 0) return
    setClearing(true)
    const ids = notifs.map((n) => n.id!).filter(Boolean)
    setNotifs([])
    setUnreadCount(0)
    lastKnownCount.current = 0
    try {
      await dismissAllNotifications(ids)
    } catch (err) {
      console.warn(err)
    } finally {
      setClearing(false)
    }
  }

  const linkFor = (n: AdminNotification): string => {
    if (n.type === 'parent_request' || n.refCollection === 'parentRequests') {
      return '/pengajuan-ortu'
    }
    if (n.type === 'parent_password_reset' || n.refCollection === 'parentPasswordResets') {
      return '/akun-ortu'
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
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-gray-900">Notifikasi baru</p>
            <div className="flex items-center gap-2">
              {notifs.length > 0 && (
                <button
                  type="button"
                  disabled={clearing}
                  onClick={handleClearAll}
                  className="text-[11px] text-gray-500 hover:text-red-600 disabled:opacity-50"
                >
                  {clearing ? '…' : 'Bersihkan'}
                </button>
              )}
              <button
                type="button"
                onClick={() => void loadNotifs({ force: true })}
                className="text-[11px] text-indigo-600 hover:underline"
              >
                Muat ulang
              </button>
            </div>
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
            {loading && notifs.length === 0 ? (
              <p className="p-6 text-center text-xs text-gray-400">Memuat…</p>
            ) : notifs.length === 0 && pendingOrtu === 0 ? (
              <p className="p-6 text-center text-xs text-gray-400">Tidak ada notifikasi baru</p>
            ) : notifs.length === 0 ? (
              <p className="p-4 text-center text-xs text-gray-400">Tidak ada notifikasi lain</p>
            ) : (
              <ul className="divide-y divide-gray-50">
                {notifs.map((n) => (
                  <li key={n.id}>
                    <Link
                      to={linkFor(n)}
                      onClick={() => {
                        if (n.id) void handleDismiss(n.id)
                        setOpen(false)
                      }}
                      className="block px-4 py-3 hover:bg-gray-50 transition bg-indigo-50/40"
                    >
                      <div className="flex gap-2 items-start">
                        <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0" />
                        <div className="min-w-0 flex-1">
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

          <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50/80 flex flex-wrap gap-x-3 gap-y-1">
            <Link
              to="/pengajuan-ortu"
              onClick={() => setOpen(false)}
              className="text-xs font-medium text-indigo-600 hover:underline"
            >
              Pengajuan ortu →
            </Link>
            <Link
              to="/akun-ortu"
              onClick={() => setOpen(false)}
              className="text-xs font-medium text-indigo-600 hover:underline"
            >
              Akun ortu →
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
