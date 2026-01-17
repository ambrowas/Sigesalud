import fs from 'fs'
import path from 'path'
import { pathToFileURL } from 'url'
import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import {
  DashboardService,
  EpidemiologyService,
  FacilityService,
  PharmacyService,
  PatientService,
  EncounterService,
  HrService,
  LabService
} from '../services/db.service'

const dashboardService = new DashboardService()
const facilityService = new FacilityService()
const epidemiologyService = new EpidemiologyService()
const pharmacyService = new PharmacyService()
const patientService = new PatientService()
const encounterService = new EncounterService()
const hrService = new HrService()
const labService = new LabService()

ipcMain.handle('dashboard:summary', (_event, payload) => {
  const period = payload?.period ?? 'hoy'
  const filters = payload?.filters
  return dashboardService.getSummary(period, filters)
})

ipcMain.handle('facilities:list', (_event, filters) => {
  return facilityService.listFacilities(filters ?? {})
})

ipcMain.handle('epi:trend', (_event, payload) => {
  const diseaseId = payload?.diseaseId ?? 'MALARIA'
  const weeks = payload?.weeks ?? 8
  return epidemiologyService.getTrend(diseaseId, weeks)
})

ipcMain.handle('epi:ranking', (_event, payload) => {
  const diseaseId = payload?.diseaseId ?? 'MALARIA'
  const limit = payload?.limit ?? 8
  return epidemiologyService.getRanking(diseaseId, limit)
})

ipcMain.handle('epi:diseases', () => {
  return epidemiologyService.listDiseases()
})

ipcMain.handle('pharmacy:summary', () => {
  return pharmacyService.getSummary()
})

ipcMain.handle('pharmacy:critical', (_event, payload) => {
  const limit = payload?.limit ?? 30
  return pharmacyService.listCritical(limit)
})

ipcMain.handle('lab:summary', (_event, payload) => {
  const period = payload?.period ?? 'ayer'
  return labService.getSummary(period)
})

ipcMain.handle('lab:volume', (_event, payload) => {
  const level = payload?.level ?? 'province'
  const period = payload?.period ?? 'ayer'
  return labService.getVolumeBy(level, period)
})

ipcMain.handle('lab:positivity', (_event, payload) => {
  const period = payload?.period ?? 'ayer'
  return labService.getPositivity(period)
})

ipcMain.handle('lab:alerts', (_event, payload) => {
  const limit = payload?.limit ?? 6
  const period = payload?.period ?? 'ayer'
  return labService.getAlerts(period, limit)
})

ipcMain.handle('hr:workers:list', (_event, payload) => {
  return hrService.listWorkers(payload ?? {})
})

ipcMain.handle('hr:assignments:list', (_event, payload) => {
  const workerId = payload?.workerId
  return hrService.listAssignments(workerId)
})

ipcMain.handle('hr:history:list', (_event, payload) => {
  const workerId = payload?.workerId
  return hrService.listHistory(workerId)
})

ipcMain.handle('hr:credentials:list', (_event, payload) => {
  const workerId = payload?.workerId
  return hrService.listCredentials(workerId)
})

ipcMain.handle('hr:workers:get', (_event, payload) => {
  const workerId = payload?.workerId
  if (!workerId) return null
  return hrService.getWorker(workerId)
})

ipcMain.handle('hr:workers:timeline', (_event, payload) => {
  const workerId = payload?.workerId
  if (!workerId) return []
  return hrService.getTimeline(workerId)
})

ipcMain.handle('hr:facility:staff', (_event, payload) => {
  const facilityId = payload?.facilityId
  const department = payload?.department
  if (!facilityId) return []
  return hrService.getFacilityStaff(facilityId, department)
})

ipcMain.handle('hr:kpis', (_event, payload) => {
  const scope = payload?.scope
  if (!scope) return hrService.getKpis()
  return hrService.getKpisByScope(scope)
})

ipcMain.handle('hr:alerts', (_event, payload) => {
  const scope = payload?.scope
  return hrService.getAlerts(scope)
})

ipcMain.handle('hr:staffing', (_event, payload) => {
  const scope = payload?.scope
  const limit = payload?.limit ?? 20
  return hrService.getFacilityStaffing(scope, limit)
})

ipcMain.handle('patients:list', (_event, payload) => {
  return patientService.listPatients(payload ?? {})
})

ipcMain.handle('patients:timeline', (_event, payload) => {
  const patientId = payload?.patientId
  const limit = payload?.limit ?? 25
  if (!patientId) return []
  return patientService.getTimeline(patientId, limit)
})

ipcMain.handle('encounters:detail', (_event, payload) => {
  const encounterId = payload?.encounterId
  if (!encounterId) return { encounter: null, notes: [], vitals: null }
  return encounterService.getDetail(encounterId)
})

ipcMain.handle('assets:patientPhoto', (_event, payload) => {
  const sex = payload?.sex === 'F' ? 'femalephotopholder.jpg' : 'malephotopholder.jpg'
  const root = path.join(app.getAppPath(), 'src', 'main', 'seed', 'data_full')
  const filePath = path.join(root, sex)
  if (!fs.existsSync(filePath)) return ''
  const data = fs.readFileSync(filePath)
  const base64 = data.toString('base64')
  return `data:image/jpeg;base64,${base64}`
})

ipcMain.handle('report:pdf', async (event, payload) => {
  const window = BrowserWindow.fromWebContents(event.sender)
  if (!window) {
    return { ok: false, error: 'NO_WINDOW' }
  }
  const defaultName = payload?.filename ?? 'reporte-sigesalud.pdf'
  const { canceled, filePath } = await dialog.showSaveDialog(window, {
    defaultPath: path.join(app.getPath('documents'), defaultName),
    filters: [{ name: 'PDF', extensions: ['pdf'] }]
  })
  if (canceled || !filePath) {
    return { ok: false, canceled: true }
  }
  const pdfData = await window.webContents.printToPDF({ printBackground: true })
  fs.writeFileSync(filePath, pdfData)
  return { ok: true, filePath }
})
