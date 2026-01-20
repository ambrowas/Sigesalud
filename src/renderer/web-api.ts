
type WebApi = Window['api']

type FacilityRow = {
  facility_id: string
  name: string
  region?: string | null
  province?: string | null
  district?: string | null
  city?: string | null
  facility_type?: string | null
  reference_level?: string | null
  ownership?: string | null
  services?: string[]
  contacts?: { phones?: string[]; website?: string | null }
  address_note?: string | null
  data_quality?: { missing?: string[] }
  map_pos?: { zone: 'INSULAR' | 'CONTINENTAL'; x: number; y: number } | null
}

type VisitRow = {
  visit_id: string
  patient_id: string
  facility_id: string
  date: string
  service: string
  diagnosis_id?: string | null
  diagnosis_code?: string | null
  outcome?: string | null
}

type LabSummaryRow = {
  facility_id: string
  date: string
  tests_ordered: number
  tests_completed: number
  avg_turnaround_hours: number
  rejected_samples: number
}

type LabDiseaseRow = {
  facility_id: string
  date: string
  disease_id: string
  test_type: string
  total_tested: number
  total_positive: number
}

type LabAlertRow = {
  alert_id: string
  date: string
  type: string
  severity: string
  facility_id: string | null
  message: string
}

const DATA_URLS = {
  facilities: new URL('../main/seed/data_full/facilities.full.json', import.meta.url).toString(),
  patients: new URL('../main/seed/data_full/patients.json', import.meta.url).toString(),
  visits: new URL('../main/seed/data_full/visits_2025.json', import.meta.url).toString(),
  alerts: new URL('../main/seed/data_full/alerts.generated.json', import.meta.url).toString(),
  stockCatalog: new URL('../main/seed/data_full/stock.catalog.json', import.meta.url).toString(),
  stockLevels: new URL('../main/seed/data_full/stock_levels_monthly_2025.json', import.meta.url).toString(),
  staffAssignments: new URL('../main/seed/data_full/staff_assignments.json', import.meta.url).toString(),
  epiWeekly: new URL('../main/seed/data_full/epi_weekly_2025.json', import.meta.url).toString(),
  diseases: new URL('../main/seed/data_full/diseases.catalog.json', import.meta.url).toString(),
  labSummary: new URL('../main/seed/data_full/lab.summary.json', import.meta.url).toString(),
  labDisease: new URL('../main/seed/data_full/lab.disease.json', import.meta.url).toString(),
  labAlerts: new URL('../main/seed/data_full/lab.alerts.json', import.meta.url).toString(),
  hrWorkers: new URL('../main/seed/hr/hr.workers.json', import.meta.url).toString(),
  hrAssignments: new URL('../main/seed/hr/hr.assignments.json', import.meta.url).toString(),
  hrHistory: new URL('../main/seed/hr/hr.history.json', import.meta.url).toString(),
  hrCredentials: new URL('../main/seed/hr/hr.credentials.json', import.meta.url).toString()
}

const dataCache: Record<string, any> = {}
const dataPromises: Record<string, Promise<any> | undefined> = {}

function toISODate(date: Date) {
  return date.toISOString().slice(0, 10)
}

function parseISODate(value: string) {
  return new Date(`${value}T00:00:00Z`)
}

function addDays(date: Date, days: number) {
  const copy = new Date(date)
  copy.setDate(copy.getDate() + days)
  return copy
}

function maxDate(rows: Array<{ date?: string }>) {
  let max = ''
  rows.forEach(row => {
    if (row.date && row.date > max) {
      max = row.date
    }
  })
  return max
}

function normalizeTerm(value?: string | null) {
  return (value ?? '').trim().toLowerCase()
}

function matchesFacilitySearch(facility: FacilityRow, term: string) {
  if (!term) return true
  const haystack = `${facility.name ?? ''} ${facility.city ?? ''} ${facility.district ?? ''}`.toLowerCase()
  return haystack.includes(term)
}

function stableHash(value: string) {
  let total = 0
  for (const ch of value) {
    total = (total * 31 + ch.charCodeAt(0)) % 100000
  }
  return total
}

function noteTemplate(diagnosisId?: string | null) {
  switch (diagnosisId) {
    case 'MALARIA':
      return {
        chief: 'Fiebre y escalofrios',
        assessment: 'Sospecha de malaria',
        plan: 'Prueba rapida, antipaludico y control en 48h'
      }
    case 'ETI_IRA':
      return {
        chief: 'Tos y rinorrea',
        assessment: 'Infeccion respiratoria aguda',
        plan: 'Sintomaticos y signos de alarma'
      }
    case 'DIARREA':
      return {
        chief: 'Diarrea aguda',
        assessment: 'Deshidratacion leve',
        plan: 'SRO, dieta y control en 24h'
      }
    case 'TB':
      return {
        chief: 'Tos cronica',
        assessment: 'Probable TB',
        plan: 'Derivar al programa TB y solicitar pruebas'
      }
    case 'HIV':
      return {
        chief: 'Control VIH',
        assessment: 'VIH en seguimiento',
        plan: 'Consejeria, pruebas y seguimiento'
      }
    default:
      return {
        chief: 'Consulta general',
        assessment: 'Evaluacion clinica',
        plan: 'Indicaciones generales y control'
      }
  }
}
async function loadJson(url: string) {
  if (url.startsWith('data:')) {
    const commaIndex = url.indexOf(',')
    const header = url.slice(0, commaIndex)
    const payload = url.slice(commaIndex + 1)
    const isBase64 = header.includes(';base64')
    const text = isBase64 ? atob(payload) : decodeURIComponent(payload)
    const normalized = text.replace(/^\uFEFF/, '')
    return JSON.parse(normalized)
  }
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to load ${url}: ${response.status}`)
  }
  const text = await response.text()
  const normalized = text.replace(/^\uFEFF/, '')
  return JSON.parse(normalized)
}

async function loadData(key: string, url: string) {
  if (dataCache[key]) return dataCache[key]
  if (!dataPromises[key]) {
    dataPromises[key] = loadJson(url)
      .then(data => {
        dataCache[key] = data
        delete dataPromises[key]
        return data
      })
      .catch(error => {
        console.error(`Failed to load ${key}`, error)
        dataCache[key] = {}
        delete dataPromises[key]
        return {}
      })
  }
  return dataPromises[key]
}

async function loadFacilities() {
  const data = await loadData('facilities', DATA_URLS.facilities)
  return (data.facilities ?? []) as FacilityRow[]
}

async function loadPatients() {
  const data = await loadData('patients', DATA_URLS.patients)
  return (data.patients ?? []) as Array<any>
}

async function loadVisits() {
  const data = await loadData('visits', DATA_URLS.visits)
  return (data.visits ?? []) as VisitRow[]
}

async function loadAlerts() {
  const data = await loadData('alerts', DATA_URLS.alerts)
  return (data.alerts ?? []) as Array<any>
}

async function loadStockCatalog() {
  const data = await loadData('stockCatalog', DATA_URLS.stockCatalog)
  return (data ?? []) as Array<any>
}

async function loadStockLevels() {
  const data = await loadData('stockLevels', DATA_URLS.stockLevels)
  return (data.records ?? []) as Array<any>
}

async function loadStaffAssignments() {
  const data = await loadData('staffAssignments', DATA_URLS.staffAssignments)
  return (data.records ?? []) as Array<any>
}

async function loadEpiWeekly() {
  const data = await loadData('epiWeekly', DATA_URLS.epiWeekly)
  return (data.records ?? []) as Array<any>
}

async function loadDiseases() {
  const data = await loadData('diseases', DATA_URLS.diseases)
  return (data ?? []) as Array<any>
}

async function loadLabSummary() {
  const data = await loadData('labSummary', DATA_URLS.labSummary)
  return (data.records ?? []) as LabSummaryRow[]
}

async function loadLabDisease() {
  const data = await loadData('labDisease', DATA_URLS.labDisease)
  if (Array.isArray(data)) return data as LabDiseaseRow[]
  return (data.records ?? []) as LabDiseaseRow[]
}

async function loadLabAlerts() {
  const data = await loadData('labAlerts', DATA_URLS.labAlerts)
  return (data.alerts ?? []) as LabAlertRow[]
}

async function fallbackLabPositivity() {
  const diseaseRows = await loadDiseases()
  const diseaseIds = diseaseRows.length
    ? diseaseRows.map(row => String(row.disease_id))
    : ['MALARIA', 'ETI_IRA', 'DIARREA', 'TB', 'HIV', 'MATERNAL_RISK', 'HTA', 'DIABETES']
  const testMap: Record<string, string> = {
    MALARIA: 'RDT',
    HIV: 'RAPID',
    TB: 'GENEXPERT',
    ETI_IRA: 'RAPID',
    DIARREA: 'STOOL',
    DIABETES: 'GLUCOSE',
    HTA: 'BP',
    MATERNAL_RISK: 'HEMOGLOBINA'
  }
  return diseaseIds
    .filter(id => Boolean(testMap[id]))
    .map(id => {
      const base = 40 + (stableHash(id) % 60)
      const positive = Math.max(2, Math.round(base * (0.12 + (stableHash(`${id}-p`) % 8) / 100)))
      return {
        disease_id: id,
        test_type: testMap[id],
        total_tested: base,
        total_positive: positive
      }
    })
    .sort((a, b) => b.total_positive - a.total_positive)
}

async function loadHrWorkers() {
  const data = await loadData('hrWorkers', DATA_URLS.hrWorkers)
  return (data.workers ?? []) as Array<any>
}

async function loadHrAssignments() {
  const data = await loadData('hrAssignments', DATA_URLS.hrAssignments)
  return (data.assignments ?? []) as Array<any>
}

async function loadHrHistory() {
  const data = await loadData('hrHistory', DATA_URLS.hrHistory)
  return (data.history ?? []) as Array<any>
}

async function loadHrCredentials() {
  const data = await loadData('hrCredentials', DATA_URLS.hrCredentials)
  return (data.credentials ?? []) as Array<any>
}
let facilityMapCache: Map<string, FacilityRow> | null = null
let stockCatalogMapCache: Map<string, string> | null = null
let patientVisitIndexCache: Map<string, { count: number; last_visit: string | null; last_facility_id: string | null; visits: VisitRow[] }> | null = null
let assignmentMapCache: Map<string, any> | null = null
let workerMapCache: Map<string, any> | null = null
let workersWithAssignmentsCache: Array<any> | null = null
let facilityStaffCountsCache: Map<string, { doctors: number; nurses: number; technicians: number }> | null = null

async function getFacilityMap() {
  if (facilityMapCache) return facilityMapCache
  const facilities = await loadFacilities()
  facilityMapCache = new Map(facilities.map(facility => [facility.facility_id, facility]))
  return facilityMapCache
}

async function getStockCatalogMap() {
  if (stockCatalogMapCache) return stockCatalogMapCache
  const catalog = await loadStockCatalog()
  stockCatalogMapCache = new Map(catalog.map(item => [item.item_id, item.name]))
  return stockCatalogMapCache
}

async function getPatientVisitIndex() {
  if (patientVisitIndexCache) return patientVisitIndexCache
  const visits = await loadVisits()
  const index = new Map<string, { count: number; last_visit: string | null; last_facility_id: string | null; visits: VisitRow[] }>()
  visits.forEach(visit => {
    const entry = index.get(visit.patient_id) ?? { count: 0, last_visit: null, last_facility_id: null, visits: [] }
    entry.count += 1
    entry.visits.push(visit)
    if (!entry.last_visit || visit.date > entry.last_visit) {
      entry.last_visit = visit.date
      entry.last_facility_id = visit.facility_id
    }
    index.set(visit.patient_id, entry)
  })
  index.forEach(entry => {
    entry.visits.sort((a, b) => b.date.localeCompare(a.date))
  })
  patientVisitIndexCache = index
  return index
}

async function getAssignmentMap() {
  if (assignmentMapCache) return assignmentMapCache
  const assignments = await loadHrAssignments()
  const map = new Map<string, any>()
  assignments.forEach(assignment => {
    if (!assignment.end_date) {
      map.set(assignment.worker_id, assignment)
    }
  })
  assignmentMapCache = map
  return map
}

async function getWorkerMap() {
  if (workerMapCache) return workerMapCache
  const workers = await loadHrWorkers()
  const map = new Map<string, any>()
  workers.forEach(worker => {
    map.set(worker.worker_id, worker)
  })
  workerMapCache = map
  return map
}

async function getWorkersWithAssignments() {
  if (workersWithAssignmentsCache) return workersWithAssignmentsCache
  const [workers, assignmentMap, facilityMap] = await Promise.all([
    loadHrWorkers(),
    getAssignmentMap(),
    getFacilityMap()
  ])
  workersWithAssignmentsCache = workers.map(worker => {
    const assignment = assignmentMap.get(worker.worker_id)
    const facility = assignment ? facilityMap.get(assignment.facility_id) : null
    return {
      ...worker,
      facility_id: assignment?.facility_id ?? null,
      facility_name: facility?.name ?? null,
      position_title: assignment?.position_title ?? null,
      department: assignment?.department ?? null,
      start_date: assignment?.start_date ?? null,
      end_date: assignment?.end_date ?? null,
      fte: assignment?.fte ?? null,
      province: facility?.province ?? null,
      district: facility?.district ?? null,
      region: facility?.region ?? null
    }
  })
  return workersWithAssignmentsCache
}

async function getFacilityStaffCounts() {
  if (facilityStaffCountsCache) return facilityStaffCountsCache
  const [assignments, workerMap] = await Promise.all([loadHrAssignments(), getWorkerMap()])
  const counts = new Map<string, { doctors: number; nurses: number; technicians: number }>()
  assignments.forEach(assignment => {
    if (assignment.end_date) return
    const worker = workerMap.get(assignment.worker_id)
    if (!worker) return
    const facilityId = assignment.facility_id
    const entry = counts.get(facilityId) ?? { doctors: 0, nurses: 0, technicians: 0 }
    if (worker.cadre === 'MEDICO') entry.doctors += 1
    if (worker.cadre === 'ENFERMERIA') entry.nurses += 1
    if (worker.cadre === 'TECNICO') entry.technicians += 1
    counts.set(facilityId, entry)
  })
  facilityStaffCountsCache = counts
  return counts
}

function buildFacilityFilter(facilities: FacilityRow[], filters?: { region?: string; type?: string; search?: string }) {
  const term = normalizeTerm(filters?.search)
  return facilities.filter(item => {
    if (filters?.region && item.region !== filters.region) return false
    if (filters?.type && item.facility_type !== filters.type) return false
    if (term && !matchesFacilitySearch(item, term)) return false
    return true
  })
}

function buildEncounter(visit: VisitRow, facilityName: string | null) {
  const base = stableHash(visit.visit_id) % 100
  const template = noteTemplate(visit.diagnosis_id)
  const notes: Array<{ type: string; suffix: string }> = []

  if (visit.outcome === 'INGRESO') {
    if (base < 50) {
      notes.push({ type: 'SOAP', suffix: 'Ingreso' }, { type: 'EVOLUCION', suffix: 'Evolucion' }, { type: 'ALTA', suffix: 'Alta' })
    } else if (base < 80) {
      notes.push({ type: 'SOAP', suffix: 'Ingreso' }, { type: 'EVOLUCION', suffix: 'Evolucion' })
    } else {
      notes.push({ type: 'SOAP', suffix: 'Ingreso' })
    }
  } else if (visit.service === 'URGENCIAS') {
    if (base < 70) notes.push({ type: 'EVOLUCION', suffix: 'Urgencias' })
  } else {
    if (base < 70) notes.push({ type: 'SOAP', suffix: 'Consulta' })
    else if (base < 80) notes.push({ type: 'SOAP', suffix: 'Consulta' }, { type: 'EVOLUCION', suffix: 'Seguimiento' })
  }

  const createdAt = `${visit.date}T0${8 + (base % 4)}:00:00Z`
  const noteRows = notes.map((note, idx) => ({
    note_id: `NOTE_${visit.visit_id}_${idx + 1}`,
    encounter_id: visit.visit_id,
    patient_id: visit.patient_id,
    note_type: note.type,
    chief_complaint: template.chief,
    subjective: `${template.chief}. ${note.suffix}.`,
    objective: `TA normal, sin signos de alarma. Servicio: ${visit.service}.`,
    assessment: template.assessment,
    plan: template.plan,
    created_at: createdAt,
    created_by: 'system_web',
    is_signed: 1
  }))

  let vitals: any | null = null
  if (base < 65) {
    const h1 = stableHash(`${visit.visit_id}_bp`)
    const h2 = stableHash(`${visit.visit_id}_temp`)
    const h3 = stableHash(`${visit.visit_id}_hr`)
    const h4 = stableHash(`${visit.visit_id}_rr`)
    const h5 = stableHash(`${visit.visit_id}_spo2`)
    const h6 = stableHash(`${visit.visit_id}_wt`)
    const h7 = stableHash(`${visit.visit_id}_ht`)
    vitals = {
      vital_id: `VITAL_${visit.visit_id}`,
      encounter_id: visit.visit_id,
      bp_sys: 100 + (h1 % 35),
      bp_dia: 60 + (h1 % 20),
      temp_c: Number((36 + (h2 % 30) / 10).toFixed(1)),
      hr: 60 + (h3 % 45),
      rr: 12 + (h4 % 8),
      spo2: 92 + (h5 % 7),
      weight_kg: Number((50 + (h6 % 45)).toFixed(1)),
      height_cm: 150 + (h7 % 35)
    }
  }

  return {
    encounter: {
      visit_id: visit.visit_id,
      patient_id: visit.patient_id,
      facility_id: visit.facility_id,
      facility_name: facilityName,
      date: visit.date,
      service: visit.service,
      diagnosis_id: visit.diagnosis_id ?? null,
      diagnosis_code: visit.diagnosis_code ?? null,
      outcome: visit.outcome ?? null
    },
    notes: noteRows,
    vitals
  }
}

function basePhoto(label: string, fill: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160"><rect width="160" height="160" fill="${fill}"/><circle cx="80" cy="58" r="26" fill="#ffffff" opacity="0.9"/><rect x="38" y="94" width="84" height="44" rx="22" fill="#ffffff" opacity="0.9"/><text x="80" y="148" font-size="12" text-anchor="middle" fill="#0f1d2b">${label}</text></svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

const webPhotos = {
  F: basePhoto('F', '#85a6c6'),
  M: basePhoto('M', '#9aa4ad'),
  U: basePhoto('P', '#a7b0b8')
}
export function createWebApi(): WebApi {
  return {
    dashboard: {
      async getSummary(period, filters) {
        try {
          const [facilities, visits, alerts, epiWeekly, stockLevels, facilityMap] = await Promise.all([
            loadFacilities(),
            loadVisits(),
            loadAlerts(),
            loadEpiWeekly(),
            loadStockLevels(),
            getFacilityMap()
          ])
          const filteredFacilities = buildFacilityFilter(facilities, filters)
          const facilitySet = new Set(filteredFacilities.map(item => item.facility_id))
          const endDate = maxDate(visits) || toISODate(new Date())
          const days = period === 'hoy' ? 0 : period === '7d' ? 6 : 29
          const startDate = toISODate(addDays(parseISODate(endDate), -days))
          const visitRows = visits.filter(visit => {
            if (visit.date < startDate || visit.date > endDate) return false
            if (facilitySet.size && !facilitySet.has(visit.facility_id)) return false
            return true
          })
          const visitCount = visitRows.length
          const mortalityCount = visitRows.filter(visit => String(visit.outcome ?? '').includes('DEF')).length
          const mortalityRate = visitCount > 0 ? Math.round((mortalityCount / visitCount) * 100) : 0

          const epiCases = epiWeekly
            .filter(row => row.week_start >= startDate && row.week_start <= endDate)
            .filter(row => !filters?.region || row.region === filters.region)
            .reduce((sum, row) => sum + Number(row.cases ?? 0), 0)
          const suspected = epiCases === 0 ? Math.max(6, Math.round(visitCount * 0.08)) : epiCases

          const term = normalizeTerm(filters?.search)
          const alertCount = alerts.filter(alert => {
            const facility = alert.scope_id ? facilityMap.get(alert.scope_id) : null
            if (filters?.region) {
              if (alert.region !== filters.region && facility?.region !== filters.region) return false
            }
            if (filters?.type) {
              if (!facility || facility.facility_type !== filters.type) return false
            }
            if (term) {
              if (!facility || !matchesFacilitySearch(facility, term)) return false
            }
            return true
          }).length

          const latestMonth = stockLevels.reduce((max, row) => (row.month && row.month > max ? row.month : max), '')
          const stockFacilitySet = new Set<string>()
          stockLevels.forEach(record => {
            if (!latestMonth || record.month !== latestMonth) return
            if (Number(record.stock_on_hand ?? 0) > Number(record.min_level ?? 0)) return
            const facility = facilityMap.get(record.facility_id)
            if (filters?.region && facility?.region !== filters.region) return
            if (filters?.type && facility?.facility_type !== filters.type) return
            if (term && facility && !matchesFacilitySearch(facility, term)) return
            if (!facility && term) return
            stockFacilitySet.add(record.facility_id)
          })

          const facilityCount = filteredFacilities.length
          const occupancyRate = facilityCount > 0 ? Math.min(95, Math.round((visitCount / (facilityCount * 35)) * 100)) : 0

          return {
            visits: visitCount,
            suspected,
            alerts: alertCount,
            occupancyRate,
            stockouts: stockFacilitySet.size,
            mortalityRate,
            startDate,
            endDate
          }
        } catch (error) {
          console.error('Dashboard summary failed', error)
          return {
            visits: 0,
            suspected: 0,
            alerts: 0,
            occupancyRate: 0,
            stockouts: 0,
            mortalityRate: 0,
            startDate: toISODate(new Date()),
            endDate: toISODate(new Date())
          }
        }
      }
    },
    facilities: {
      async list(filters) {
        const facilities = await loadFacilities()
        return buildFacilityFilter(facilities, filters).sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))
      }
    },
    epi: {
      async trend(diseaseId, weeks = 8) {
        const epiWeekly = await loadEpiWeekly()
        const grouped = new Map<string, number>()
        epiWeekly.forEach(row => {
          if (row.disease_id !== diseaseId) return
          const key = row.week_start
          grouped.set(key, (grouped.get(key) ?? 0) + Number(row.cases ?? 0))
        })
        const rows = Array.from(grouped.entries())
          .map(([week_start, cases]) => ({ week_start, cases }))
          .sort((a, b) => b.week_start.localeCompare(a.week_start))
          .slice(0, weeks)
          .reverse()
        return rows
      },
      async ranking(diseaseId, limit = 8) {
        const epiWeekly = await loadEpiWeekly()
        const grouped = new Map<string, { district_id: string; province_id: string; region: string; cases: number }>()
        epiWeekly.forEach(row => {
          if (row.disease_id !== diseaseId) return
          const key = `${row.district_id}-${row.province_id}-${row.region}`
          const entry = grouped.get(key) ?? {
            district_id: row.district_id,
            province_id: row.province_id,
            region: row.region,
            cases: 0
          }
          entry.cases += Number(row.cases ?? 0)
          grouped.set(key, entry)
        })
        return Array.from(grouped.values())
          .sort((a, b) => b.cases - a.cases)
          .slice(0, limit)
      },
      async diseases() {
        const diseases = await loadDiseases()
        return diseases.map(row => ({
          disease_id: row.disease_id,
          name: row.name ?? row.disease_id
        }))
      }
    },
    pharmacy: {
      async summary() {
        const stockLevels = await loadStockLevels()
        const latestMonth = stockLevels.reduce((max, row) => (row.month && row.month > max ? row.month : max), '')
        if (!latestMonth) return { latestMonth: null, facilitiesCritical: 0, itemsCritical: 0 }
        const criticalRecords = stockLevels.filter(record => record.month === latestMonth && record.stock_on_hand <= record.min_level)
        const facilitiesCritical = new Set(criticalRecords.map(record => record.facility_id)).size
        const itemsCritical = criticalRecords.length
        return { latestMonth, facilitiesCritical, itemsCritical }
      },
      async critical(limit = 25) {
        const [stockLevels, stockCatalog, facilityMap] = await Promise.all([
          loadStockLevels(),
          getStockCatalogMap(),
          getFacilityMap()
        ])
        const latestMonth = stockLevels.reduce((max, row) => (row.month && row.month > max ? row.month : max), '')
        if (!latestMonth) return []
        return stockLevels
          .filter(record => record.month === latestMonth && record.stock_on_hand <= record.min_level)
          .sort((a, b) => Number(a.stock_on_hand ?? 0) - Number(b.stock_on_hand ?? 0))
          .slice(0, limit)
          .map(record => ({
            facility_id: record.facility_id,
            facility_name: facilityMap.get(record.facility_id)?.name ?? null,
            item_id: record.item_id,
            item_name: stockCatalog.get(record.item_id) ?? record.item_id,
            stock_on_hand: record.stock_on_hand,
            min_level: record.min_level,
            expiry_nearest: record.expiry_nearest ?? null
          }))
      }
    },
    lab: {
      async summary(period = 'ayer') {
        const records = await loadLabSummary()
        if (!records.length) {
          return {
            date: toISODate(new Date()),
            tests_ordered: 0,
            tests_completed: 0,
            avg_turnaround_hours: 0,
            rejected_samples: 0
          }
        }
        const endDate = maxDate(records)
        const days = period === 'ayer' ? 0 : period === '7d' ? 6 : 29
        const startDate = toISODate(addDays(parseISODate(endDate), -days))
        const rows = records.filter(row => row.date >= startDate && row.date <= endDate)
        const sumOrdered = rows.reduce((sum, row) => sum + Number(row.tests_ordered ?? 0), 0)
        const sumCompleted = rows.reduce((sum, row) => sum + Number(row.tests_completed ?? 0), 0)
        const sumRejected = rows.reduce((sum, row) => sum + Number(row.rejected_samples ?? 0), 0)
        const avg = rows.length ? rows.reduce((sum, row) => sum + Number(row.avg_turnaround_hours ?? 0), 0) / rows.length : 0
        return {
          date: endDate,
          tests_ordered: sumOrdered,
          tests_completed: sumCompleted,
          avg_turnaround_hours: Number(avg.toFixed(1)),
          rejected_samples: sumRejected
        }
      },
      async volume(level, period = 'ayer') {
        const [records, facilityMap] = await Promise.all([loadLabSummary(), getFacilityMap()])
        if (!records.length) return []
        const endDate = maxDate(records)
        const days = period === 'ayer' ? 0 : period === '7d' ? 6 : 29
        const startDate = toISODate(addDays(parseISODate(endDate), -days))
        const scopeField = level === 'district' ? 'district' : 'province'
        const grouped = new Map<string, { scope_id: string; scope_name: string; tests_ordered: number; tests_completed: number }>()
        records.forEach(row => {
          if (row.date < startDate || row.date > endDate) return
          const facility = facilityMap.get(row.facility_id)
          const scopeId = facility?.[scopeField] ?? null
          if (!scopeId) return
          const entry = grouped.get(scopeId) ?? {
            scope_id: scopeId,
            scope_name: scopeId,
            tests_ordered: 0,
            tests_completed: 0
          }
          entry.tests_ordered += Number(row.tests_ordered ?? 0)
          entry.tests_completed += Number(row.tests_completed ?? 0)
          grouped.set(scopeId, entry)
        })
        return Array.from(grouped.values()).sort((a, b) => b.tests_completed - a.tests_completed)
      },
      async positivity(period = 'ayer') {
        const records = await loadLabDisease()
        if (!records.length) return fallbackLabPositivity()
        const endDate = maxDate(records)
        const days = period === 'ayer' ? 0 : period === '7d' ? 6 : 29
        const startDate = toISODate(addDays(parseISODate(endDate), -days))
        const grouped = new Map<string, { disease_id: string; test_type: string; total_tested: number; total_positive: number }>()
        records.forEach(row => {
          if (row.date < startDate || row.date > endDate) return
          const key = `${row.disease_id}-${row.test_type}`
          const entry = grouped.get(key) ?? {
            disease_id: row.disease_id,
            test_type: row.test_type,
            total_tested: 0,
            total_positive: 0
          }
          entry.total_tested += Number(row.total_tested ?? 0)
          entry.total_positive += Number(row.total_positive ?? 0)
          grouped.set(key, entry)
        })
        return Array.from(grouped.values()).sort((a, b) => b.total_positive - a.total_positive)
      },
      async alerts(period = 'ayer', limit = 6) {
        const [alerts, facilityMap, summary] = await Promise.all([loadLabAlerts(), getFacilityMap(), loadLabSummary()])
        if (!alerts.length) return []
        const endDate = summary.length ? maxDate(summary) : maxDate(alerts)
        const days = period === 'ayer' ? 0 : period === '7d' ? 6 : 29
        const startDate = toISODate(addDays(parseISODate(endDate), -days))
        return alerts
          .filter(alert => alert.date >= startDate && alert.date <= endDate)
          .slice(0, limit)
          .map(alert => ({
            alert_id: alert.alert_id,
            date: alert.date,
            type: alert.type,
            severity: alert.severity,
            facility_id: alert.facility_id ?? null,
            facility_name: alert.facility_id ? facilityMap.get(alert.facility_id)?.name ?? null : null,
            message: alert.message
          }))
      }
    },
    hr: {
      async workers(filters) {
        const rows = await getWorkersWithAssignments()
        const term = normalizeTerm(filters?.search)
        return rows.filter(row => {
          if (term) {
            const haystack = `${row.full_name ?? ''} ${row.worker_id ?? ''}`.toLowerCase()
            if (!haystack.includes(term)) return false
          }
          if (filters?.cadre && row.cadre !== filters.cadre) return false
          if (filters?.status && row.status !== filters.status) return false
          if (filters?.facilityId && row.facility_id !== filters.facilityId) return false
          if (filters?.province && row.province !== filters.province) return false
          if (filters?.district && row.district !== filters.district) return false
          if (filters?.employmentType && row.employment_type !== filters.employmentType) return false
          return true
        })
      },
      async assignments() {
        return []
      },
      async history(workerId) {
        if (!workerId) return []
        const history = await loadHrHistory()
        return history
          .filter(item => item.worker_id === workerId)
          .sort((a, b) => String(b.start_date ?? '').localeCompare(String(a.start_date ?? '')))
      },
      async credentials(workerId) {
        if (!workerId) return []
        const credentials = await loadHrCredentials()
        return credentials
          .filter(item => item.worker_id === workerId)
          .sort((a, b) => String(b.date_awarded ?? '').localeCompare(String(a.date_awarded ?? '')))
      },
      async get(workerId) {
        if (!workerId) return null
        const rows = await getWorkersWithAssignments()
        return rows.find(row => row.worker_id === workerId) ?? null
      },
      async timeline() {
        return []
      },
      async facilityStaff(facilityId, department) {
        const rows = await getWorkersWithAssignments()
        return rows.filter(row => {
          if (row.facility_id !== facilityId) return false
          if (department && row.department !== department) return false
          return true
        })
      },
      async kpis(scope) {
        const rows = await getWorkersWithAssignments()
        const filtered = rows.filter(row => {
          if (!scope?.level || scope.level === 'national') return true
          if (scope.level === 'province') return row.province === scope.id
          if (scope.level === 'district') return row.district === scope.id
          return true
        })
        const total = filtered.length
        const active = filtered.filter(row => row.status === 'ACTIVO').length
        const byCadre: Record<string, number> = {}
        filtered.forEach(row => {
          if (!row.cadre) return
          byCadre[row.cadre] = (byCadre[row.cadre] ?? 0) + 1
        })
        return {
          total,
          active,
          byCadre,
          scope: scope?.level ?? 'national',
          scopeId: scope?.id ?? null
        }
      },
      async alerts(scope) {
        const [staffing, workers, credentials, facilityMap] = await Promise.all([
          loadStaffAssignments(),
          loadHrWorkers(),
          loadHrCredentials(),
          getFacilityMap()
        ])
        const workerMap = new Map(workers.map(worker => [worker.worker_id, worker]))
        const assignmentMap = await getAssignmentMap()
        const counts = await getFacilityStaffCounts()

        const staffingRows = staffing.map(record => {
          const facility = facilityMap.get(record.facility_id)
          const count = counts.get(record.facility_id) ?? { doctors: 0, nurses: 0, technicians: 0 }
          return {
            facility_id: record.facility_id,
            facility_name: facility?.name ?? null,
            province: facility?.province ?? null,
            district: facility?.district ?? null,
            required_doctors: record.doctors,
            required_nurses: record.nurses,
            required_technicians: record.technicians,
            actual_doctors: count.doctors,
            actual_nurses: count.nurses,
            actual_technicians: count.technicians
          }
        })

        const scopedStaffing = staffingRows.filter(row => {
          if (!scope?.level || scope.level === 'national') return true
          if (scope.level === 'province') return row.province === scope.id
          if (scope.level === 'district') return row.district === scope.id
          return true
        })

        const alerts: Array<{ severity: string; type: string; message: string; facility_id?: string; facility_name?: string }> = []
        scopedStaffing.forEach(row => {
          if (row.required_doctors > 0 && row.actual_doctors === 0) {
            alerts.push({
              severity: 'Alta',
              type: 'Centro sin medico',
              message: `Sin medicos asignados. Requeridos: ${row.required_doctors}.`,
              facility_id: row.facility_id,
              facility_name: row.facility_name ?? undefined
            })
          }
          if (row.required_nurses > row.actual_nurses) {
            const deficit = row.required_nurses - row.actual_nurses
            alerts.push({
              severity: deficit >= 5 ? 'Alta' : 'Media',
              type: 'Deficit de enfermeria',
              message: `Faltan ${deficit} enfermeras. Requeridas: ${row.required_nurses}.`,
              facility_id: row.facility_id,
              facility_name: row.facility_name ?? undefined
            })
          }
        })

        const today = toISODate(new Date())
        const soon = toISODate(addDays(new Date(), 90))
        credentials.forEach(credential => {
          if (!credential.expires_on) return
          const worker = workerMap.get(credential.worker_id)
          const assignment = assignmentMap.get(credential.worker_id)
          const facility = assignment ? facilityMap.get(assignment.facility_id) : null
          if (credential.expires_on <= today) {
            alerts.push({
              severity: 'Alta',
              type: 'Certificacion vencida',
              message: `${worker?.full_name ?? credential.worker_id} vencio ${credential.expires_on}.`,
              facility_id: facility?.facility_id,
              facility_name: facility?.name ?? undefined
            })
          } else if (credential.expires_on <= soon) {
            alerts.push({
              severity: 'Media',
              type: 'Certificacion por vencer',
              message: `${worker?.full_name ?? credential.worker_id} vence ${credential.expires_on}.`,
              facility_id: facility?.facility_id,
              facility_name: facility?.name ?? undefined
            })
          }
        })

        return alerts.slice(0, 20)
      },
      async staffing(scope, limit = 20) {
        const [staffing, facilityMap, counts] = await Promise.all([
          loadStaffAssignments(),
          getFacilityMap(),
          getFacilityStaffCounts()
        ])
        const rows = staffing.map(record => {
          const facility = facilityMap.get(record.facility_id)
          const count = counts.get(record.facility_id) ?? { doctors: 0, nurses: 0, technicians: 0 }
          return {
            facility_id: record.facility_id,
            facility_name: facility?.name ?? null,
            province: facility?.province ?? null,
            district: facility?.district ?? null,
            required_doctors: record.doctors,
            required_nurses: record.nurses,
            required_technicians: record.technicians,
            actual_doctors: count.doctors,
            actual_nurses: count.nurses,
            actual_technicians: count.technicians
          }
        })
        const scoped = rows.filter(row => {
          if (!scope?.level || scope.level === 'national') return true
          if (scope.level === 'province') return row.province === scope.id
          if (scope.level === 'district') return row.district === scope.id
          return true
        })
        return scoped
          .sort((a, b) => (b.actual_doctors + b.actual_nurses + b.actual_technicians) - (a.actual_doctors + a.actual_nurses + a.actual_technicians))
          .slice(0, limit)
      }
    },
    patients: {
      async list(filters) {
        const [patients, visitsIndex, facilityMap] = await Promise.all([
          loadPatients(),
          getPatientVisitIndex(),
          getFacilityMap()
        ])
        let rows = patients
        if (filters.search) {
          const term = filters.search.toLowerCase()
          rows = rows.filter(row => row.full_name.toLowerCase().includes(term) || row.patient_id.toLowerCase().includes(term))
        }
        if (filters.sex) rows = rows.filter(row => row.sex === filters.sex)
        const offset = filters.offset ?? 0
        const limit = filters.limit ?? 20
        const paged = rows.slice(offset, offset + limit)
        return {
          total: rows.length,
          rows: paged.map(row => {
            const index = visitsIndex.get(row.patient_id)
            const facilityId = index?.last_facility_id ?? null
            return {
              patient_id: row.patient_id,
              full_name: row.full_name,
              sex: row.sex ?? null,
              dob: row.dob ?? null,
              facility_id: facilityId,
              facility_name: facilityId ? facilityMap.get(facilityId)?.name ?? null : null,
              visits_count: index?.count ?? 0,
              last_visit: index?.last_visit ?? null
            }
          })
        }
      },
      async timeline(patientId, limit = 25) {
        const [visitsIndex, facilityMap] = await Promise.all([getPatientVisitIndex(), getFacilityMap()])
        const entry = visitsIndex.get(patientId)
        if (!entry) return []
        return entry.visits.slice(0, limit).map(visit => ({
          visit_id: visit.visit_id,
          date: visit.date,
          service: visit.service,
          diagnosis_id: visit.diagnosis_id ?? null,
          diagnosis_code: visit.diagnosis_code ?? null,
          outcome: visit.outcome ?? null,
          facility_id: visit.facility_id,
          facility_name: facilityMap.get(visit.facility_id)?.name ?? null
        }))
      }
    },
    encounters: {
      async detail(encounterId) {
        const [visits, facilityMap] = await Promise.all([loadVisits(), getFacilityMap()])
        const visit = visits.find(row => row.visit_id === encounterId)
        if (!visit) {
          return { encounter: null, notes: [], vitals: null }
        }
        const facilityName = facilityMap.get(visit.facility_id)?.name ?? null
        return buildEncounter(visit, facilityName)
      }
    },
    assets: {
      async patientPhoto(sex) {
        if (sex === 'F') return webPhotos.F
        if (sex === 'M') return webPhotos.M
        return webPhotos.U
      }
    },
    report: {
      async generatePdf() {
        return { ok: false, canceled: true }
      }
    }
  }
}
