export type AppArea = 'student' | 'parent' | 'admin'

const areaLoads: Record<AppArea, () => Promise<unknown>> = {
  student: () => import('../areas/student'),
  parent: () => import('../areas/parent'),
  admin: () => import('../areas/admin'),
}

const inflight = new Map<AppArea, Promise<unknown>>()

export function preloadArea(area: AppArea): Promise<unknown> {
  let pending = inflight.get(area)
  if (!pending) {
    pending = areaLoads[area]()
    inflight.set(area, pending)
  }
  return pending
}

/** Halaman materi (editor AI + PDF) tidak ikut bundel siswa/admin sampai dibuka. */
let materiLoad: Promise<unknown> | null = null
export function preloadMateri(): Promise<unknown> {
  if (!materiLoad) materiLoad = import('../pages/Materi')
  return materiLoad
}

export function areaForPath(pathname: string): AppArea | null {
  const p = pathname.replace(/\/+$/, '') || '/'
  if (p === '/siswa' || p.startsWith('/siswa/') || p === '/kerjakan' || p.startsWith('/kerjakan/')) {
    return 'student'
  }
  if (p === '/ortu' || p.startsWith('/ortu/')) return 'parent'
  if (
    p === '/dashboard' ||
    p.startsWith('/bank-soal') ||
    p.startsWith('/latihan-soal') ||
    p === '/laporan' ||
    p === '/peringkat' ||
    p === '/daftar-siswa' ||
    p === '/tujuan-pembelajaran' ||
    p === '/input-nilai' ||
    p === '/rekap-nilai' ||
    p === '/pengajuan-ortu' ||
    p === '/akun-ortu' ||
    p === '/questions'
  ) {
    return 'admin'
  }
  return null
}

export function pathNeedsMateri(pathname: string): boolean {
  const p = pathname.replace(/\/+$/, '') || '/'
  return p === '/materi' || p === '/siswa/materi'
}

export function preloadForPath(pathname: string): Promise<unknown> {
  const jobs: Promise<unknown>[] = []
  const area = areaForPath(pathname)
  if (area) jobs.push(preloadArea(area))
  if (pathNeedsMateri(pathname)) jobs.push(preloadMateri())
  return Promise.all(jobs)
}
