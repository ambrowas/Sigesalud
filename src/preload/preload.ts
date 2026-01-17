import { contextBridge, ipcRenderer } from 'electron'

const api = {
  ping: () => 'pong',
  auth: {
    listUsers: () => ipcRenderer.invoke('auth:listUsers').catch(()=>[]),
    login: (u: string, p: string) => ipcRenderer.invoke('auth:login', { username: u, password: p }).catch(()=>({ ok:false }))
  },
  dashboard: {
    getSummary: (period: string, filters?: { region?: string; type?: string; search?: string }) =>
      ipcRenderer.invoke('dashboard:summary', { period, filters }).catch(() => null)
  },
  facilities: {
    list: (filters: { region?: string; type?: string; search?: string }) =>
      ipcRenderer.invoke('facilities:list', filters).catch(() => [])
  },
  epi: {
    trend: (diseaseId: string, weeks = 8) =>
      ipcRenderer.invoke('epi:trend', { diseaseId, weeks }).catch(() => []),
    ranking: (diseaseId: string, limit = 8) =>
      ipcRenderer.invoke('epi:ranking', { diseaseId, limit }).catch(() => []),
    diseases: () => ipcRenderer.invoke('epi:diseases').catch(() => [])
  },
  pharmacy: {
    summary: () => ipcRenderer.invoke('pharmacy:summary').catch(() => null),
    critical: (limit = 30) => ipcRenderer.invoke('pharmacy:critical', { limit }).catch(() => [])
  },
  lab: {
    summary: (period: 'ayer' | '7d' | '30d' = 'ayer') =>
      ipcRenderer.invoke('lab:summary', { period }).catch(() => null),
    volume: (level: 'province' | 'district', period: 'ayer' | '7d' | '30d' = 'ayer') =>
      ipcRenderer.invoke('lab:volume', { level, period }).catch(() => []),
    positivity: (period: 'ayer' | '7d' | '30d' = 'ayer') =>
      ipcRenderer.invoke('lab:positivity', { period }).catch(() => []),
    alerts: (period: 'ayer' | '7d' | '30d' = 'ayer', limit = 6) =>
      ipcRenderer.invoke('lab:alerts', { period, limit }).catch(() => [])
  },
  hr: {
    workers: (filters?: {
      search?: string
      cadre?: string
      status?: string
      facilityId?: string
      province?: string
      district?: string
      employmentType?: string
    }) => ipcRenderer.invoke('hr:workers:list', filters ?? {}).catch(() => []),
    assignments: (workerId?: string) =>
      ipcRenderer.invoke('hr:assignments:list', workerId ? { workerId } : {}).catch(() => []),
    history: (workerId?: string) =>
      ipcRenderer.invoke('hr:history:list', workerId ? { workerId } : {}).catch(() => []),
    credentials: (workerId?: string) =>
      ipcRenderer.invoke('hr:credentials:list', workerId ? { workerId } : {}).catch(() => []),
    get: (workerId: string) =>
      ipcRenderer.invoke('hr:workers:get', { workerId }).catch(() => null),
    timeline: (workerId: string) =>
      ipcRenderer.invoke('hr:workers:timeline', { workerId }).catch(() => []),
    facilityStaff: (facilityId: string, department?: string) =>
      ipcRenderer.invoke('hr:facility:staff', { facilityId, department }).catch(() => []),
    kpis: (scope?: { level?: 'national' | 'province' | 'district'; id?: string }) =>
      ipcRenderer.invoke('hr:kpis', scope ? { scope } : {}).catch(() => null),
    alerts: (scope?: { level?: 'national' | 'province' | 'district'; id?: string }) =>
      ipcRenderer.invoke('hr:alerts', scope ? { scope } : {}).catch(() => []),
    staffing: (scope?: { level?: 'national' | 'province' | 'district'; id?: string }, limit = 20) =>
      ipcRenderer.invoke('hr:staffing', scope ? { scope, limit } : { limit }).catch(() => [])
  },
  patients: {
    list: (filters: { search?: string; sex?: string; limit?: number; offset?: number }) =>
      ipcRenderer.invoke('patients:list', filters).catch(() => ({ total: 0, rows: [] })),
    timeline: (patientId: string, limit = 25) =>
      ipcRenderer.invoke('patients:timeline', { patientId, limit }).catch(() => [])
  },
  encounters: {
    detail: (encounterId: string) =>
      ipcRenderer.invoke('encounters:detail', { encounterId }).catch(() => ({ encounter: null, notes: [], vitals: null }))
  },
  assets: {
    patientPhoto: (sex?: string | null) =>
      ipcRenderer.invoke('assets:patientPhoto', { sex }).catch(() => '')
  },
  report: {
    generatePdf: (payload?: { filename?: string }) =>
      ipcRenderer.invoke('report:pdf', payload ?? {}).catch(() => ({ ok: false }))
  }
}

contextBridge.exposeInMainWorld('api', api)
