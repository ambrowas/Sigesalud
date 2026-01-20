import { useEffect, useMemo, useState } from 'react'
import FacilitiesMap from './components/FacilitiesMap'

type Period = 'hoy' | '7d' | '30d'
type Region = 'todas' | 'litoral' | 'centro-sur'
type FacilityType = 'hospital' | 'centro-salud'
type FacilityRegionFilter = 'todas' | 'INSULAR' | 'CONTINENTAL'
type FacilityTypeFilter = 'todas' | 'HOSPITAL' | 'CLINIC' | 'HEALTH_CENTER' | 'LAB'
type FacilityView = 'mapa' | 'tabla'
type ModuleKey = 'dashboard' | 'red_sanitaria' | 'vigilancia' | 'farmacia' | 'pacientes' | 'rrhh' | 'configuracion' | 'ayuda' | 'acerca' | 'laboratorio'
type TrendPoint = { week_start: string; cases: number }
type LabPeriod = 'ayer' | '7d' | '30d'
type HrWorker = {
  worker_id: string
  full_name: string
  sex?: string | null
  dob?: string | null
  nationality?: string | null
  cadre?: string | null
  specialty?: string | null
  license_number?: string | null
  employment_type?: string | null
  status?: string | null
  contact?: { phone?: string | null; email?: string | null }
  home_district_id?: string | null
  facility_id?: string | null
  facility_name?: string | null
  position_title?: string | null
  department?: string | null
  start_date?: string | null
  end_date?: string | null
  fte?: number | null
}
type HrHistory = {
  history_id: string
  worker_id: string
  facility_id: string
  role?: string | null
  start_date?: string | null
  end_date?: string | null
  notes?: string | null
}
type HrCredential = {
  credential_id: string
  worker_id: string
  type?: string | null
  name?: string | null
  institution?: string | null
  country?: string | null
  date_awarded?: string | null
  expires_on?: string | null
}
type HrScope = {
  level: 'national' | 'province' | 'district'
  id?: string
}
type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  text: string
}
type LabSummary = {
  date: string
  tests_ordered: number
  tests_completed: number
  avg_turnaround_hours: number
  rejected_samples: number
}
type LabVolumeRow = {
  scope_id: string
  scope_name: string
  tests_completed: number
  tests_ordered: number
}
type LabPositivity = {
  disease_id: string
  test_type: string
  total_tested: number
  total_positive: number
}

type DashboardSummary = {
  visits: number
  suspected: number
  alerts: number
  occupancyRate: number
  stockouts: number
  mortalityRate: number
  startDate: string
  endDate: string
}

const ALERTS = [
  { severity: 'Alta', type: 'Brote', text: 'Incremento 45% casos de malaria - Region Litoral' },
  { severity: 'Alta', type: 'Capacidad', text: 'Ocupacion UCI > 85% - Hospital Bata' },
  { severity: 'Media', type: 'Desabastecimiento', text: 'Falta de artesonate en 2 centros' },
  { severity: 'Baja', type: 'Mortalidad', text: 'Desviacion +20% mortalidad neonatal - Distrito X' }
]

function formatNumber(value: number) {
  return value.toLocaleString('es-ES')
}

function ageFromDob(dob?: string) {
  if (!dob) return null
  const parsed = new Date(dob)
  if (Number.isNaN(parsed.getTime())) return null
  const today = new Date()
  let years = today.getFullYear() - parsed.getFullYear()
  const monthDiff = today.getMonth() - parsed.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < parsed.getDate())) {
    years -= 1
  }
  return Math.max(0, years)
}

function formatDiagnosisLabel(diagnosisId?: string | null) {
  if (!diagnosisId) return 'n/d'
  const label = DIAGNOSIS_LABELS[diagnosisId] ?? diagnosisId.replace(/_/g, ' ')
  return label.toLowerCase()
}

function formatHrLabel(value?: string | null, labels?: Record<string, string>) {
  if (!value) return 'N/D'
  if (labels && labels[value]) return labels[value]
  return value.replace(/_/g, ' ')
}

function formatDateRange(start?: string | null, end?: string | null) {
  const startLabel = start ?? 'N/D'
  const endLabel = end ?? 'Actual'
  return `${startLabel} - ${endLabel}`
}

function formatFacilityId(value?: string | null) {
  if (!value) return 'N/D'
  return value.replace(/_/g, ' ')
}

function initials(fullName?: string | null) {
  if (!fullName) return '--'
  const parts = fullName.split(' ').filter(Boolean)
  return parts.slice(0, 2).map(part => part[0].toUpperCase()).join('')
}

function stableNameIndex(value: string, size: number) {
  let total = 0
  for (const ch of value) {
    total = (total * 31 + ch.charCodeAt(0)) % 100000
  }
  if (size <= 0) return 0
  return total % size
}

function pickDirectorName(facilityId: string | null | undefined, workers: HrWorker[]) {
  if (!facilityId || workers.length === 0) return 'N/D'
  const idx = stableNameIndex(facilityId, workers.length)
  return workers[idx]?.full_name ?? 'N/D'
}

function buildHelpResponse(
  question: string,
  context: {
    dashboardSummary: DashboardSummary | null
    hrKpis: { total: number; active: number; byCadre: Record<string, number> } | null
    facilitiesCount: number
    patientTotal: number
    pharmacySummary: { latestMonth: string | null; facilitiesCritical: number; itemsCritical: number } | null
  }
) {
  const text = question.toLowerCase()
  if (text.includes('rrhh') || text.includes('personal') || text.includes('profesional')) {
    const total = context.hrKpis?.total ?? 0
    const active = context.hrKpis?.active ?? 0
    return `RRHH: total ${total}, activos ${active}. Puedes filtrar por cadre, provincia o centro.`
  }
  if (text.includes('farmacia') || text.includes('stock') || text.includes('suministro')) {
    const month = context.pharmacySummary?.latestMonth ?? 'N/D'
    const facilities = context.pharmacySummary?.facilitiesCritical ?? 0
    const items = context.pharmacySummary?.itemsCritical ?? 0
    return `Farmacia: mes ${month}, centros criticos ${facilities}, items criticos ${items}.`
  }
  if (text.includes('vigilancia') || text.includes('epi') || text.includes('malaria')) {
    const visits = context.dashboardSummary?.visits ?? 0
    return `Vigilancia: usa el modulo para ver tendencias semanales. Atenciones en periodo: ${visits}.`
  }
  if (text.includes('paciente') || text.includes('pacientes')) {
    return `Pacientes: total listado ${context.patientTotal}. Puedes buscar por nombre o ID.`
  }
  if (text.includes('centro') || text.includes('facilities') || text.includes('red sanitaria')) {
    return `Centros: ${context.facilitiesCount} en el registro.`
  }
  return 'Puedo responder sobre RRHH, farmacia, vigilancia, pacientes o centros. Prueba con una pregunta concreta.'
}


const PERIOD_LABELS: Record<Period, string> = {
  hoy: 'Hoy',
  '7d': '7 dAas',
  '30d': '30 dAas'
}

const REGION_LABELS: Record<Region, string> = {
  todas: 'Todas',
  litoral: 'Litoral',
  'centro-sur': 'Centro Sur'
}

const FACILITY_TYPE_LABELS: Record<FacilityType, string> = {
  hospital: 'Hospital',
  'centro-salud': 'Centro de salud'
}

const SERVICE_LABELS: Record<string, string> = {
  INPATIENT: 'HospitalizaciAn',
  EMERGENCY: 'Emergencias',
  REFERRALS: 'Referencias',
  SPECIALIST_CARE: 'AtenciAn especializada',
  OUTPATIENT: 'Consulta externa',
  LAB_DIAGNOSTICS: 'DiagnAstico de laboratorio',
  TROPICAL_DISEASES: 'Enfermedades tropicales',
  MALARIA_DIAGNOSIS: 'DiagnAstico de malaria',
  FIRST_AID: 'Primeros auxilios',
  SURGERY: 'CirugAa',
  MATERNAL: 'Maternidad',
  BASIC_MATERNAL: 'Maternidad (cuidados basicos)'
}

const OWNERSHIP_LABELS: Record<string, string> = {
  PUBLIC: 'Publico',
  PRIVATE: 'Privado',
  FAITH_BASED: 'Confesional',
  UNKNOWN: 'Desconocido'
}

const FACILITY_LABELS: Record<string, string> = {
  HOSPITAL: 'Hospital',
  CLINIC: 'ClAnica',
  HEALTH_CENTER: 'Centro de salud',
  LAB: 'Laboratorio'
}

const DISEASE_LABELS: Record<string, string> = {
  MALARIA: 'Malaria',
  ETI_IRA: 'Infecciones respiratorias agudas (ETI / IRA)',
  DIARREA: 'Enfermedades diarreicas',
  TB: 'Tuberculosis',
  HIV: 'VIH',
  MATERNAL_RISK: 'Riesgo materno / complicaciones obstetricas',
  HTA: 'Hipertension',
  DIABETES: 'Diabetes'
}

const DIAGNOSIS_LABELS: Record<string, string> = {
  ...DISEASE_LABELS,
  PARASITOSIS: 'Parasitosis',
  OTROS: 'Otros'
}

const HR_CADRE_LABELS: Record<string, string> = {
  MEDICO: 'Medico',
  ENFERMERIA: 'Enfermeria',
  TECNICO: 'Tecnico',
  MATRON: 'Matrona',
  FARMACIA: 'Farmacia',
  LABORATORIO: 'Laboratorio'
}

const HR_STATUS_LABELS: Record<string, string> = {
  ACTIVO: 'Activo',
  BAJA: 'Baja',
  TRASLADO: 'Traslado',
  JUBILADO: 'Jubilado'
}

const HR_EMPLOYMENT_LABELS: Record<string, string> = {
  PUBLICO: 'Publico',
  CONTRATO: 'Contrato',
  COOPERACION: 'Cooperacion'
}

const MISSING_LABELS: Record<string, string> = {
  website: 'sitio web',
  address: 'direccion',
  phones: 'telefonos',
  website_url_exact: 'URL exacta',
  official_name_confirm: 'nombre oficial'
}
const FACILITY_PLACEHOLDER = new URL('../main/seed/data_full/hospital-icon-vector.jpg', import.meta.url).toString()
const LAB_SCOPE_LABELS: Record<'province' | 'district', string> = {
  province: 'Provincia',
  district: 'Distrito'
}
const LAB_PERIOD_LABELS: Record<LabPeriod, string> = {
  ayer: 'Ayer',
  '7d': 'Semana pasada',
  '30d': 'Mes pasado'
}

export default function App() {
  const [period, setPeriod] = useState<Period>('hoy')
  const [region, setRegion] = useState<Region>('todas')
  const [facilityType, setFacilityType] = useState<FacilityType>('hospital')
  const [facilityRegionFilter, setFacilityRegionFilter] = useState<FacilityRegionFilter>('todas')
  const [facilityTypeFilter, setFacilityTypeFilter] = useState<FacilityTypeFilter>('todas')
  const [facilitySearch, setFacilitySearch] = useState('')
  const [facilityView, setFacilityView] = useState<FacilityView>('mapa')
  const [activeModule, setActiveModule] = useState<ModuleKey>('dashboard')
  const [facilities, setFacilities] = useState<any[]>([])
  const [selectedFacilityIndex, setSelectedFacilityIndex] = useState<number | null>(null)
  const [facilityModalOpen, setFacilityModalOpen] = useState(false)
  const [dashboardSummary, setDashboardSummary] = useState<DashboardSummary | null>(null)
  const [epiDisease, setEpiDisease] = useState('MALARIA')
  const [epiDiseases, setEpiDiseases] = useState<Array<{ disease_id: string; name: string }>>([])
  const [epiTrend, setEpiTrend] = useState<TrendPoint[]>([])
  const [epiRanking, setEpiRanking] = useState<Array<{ district_id: string; province_id: string; region: string; cases: number }>>([])
  const [pharmacySummary, setPharmacySummary] = useState<{ latestMonth: string | null; facilitiesCritical: number; itemsCritical: number } | null>(null)
  const [pharmacyCritical, setPharmacyCritical] = useState<Array<any>>([])
  const [labSummary, setLabSummary] = useState<LabSummary | null>(null)
  const [labVolume, setLabVolume] = useState<LabVolumeRow[]>([])
  const [labVolumeLevel, setLabVolumeLevel] = useState<'province' | 'district'>('province')
  const [labPositivity, setLabPositivity] = useState<LabPositivity[]>([])
  const [labAlerts, setLabAlerts] = useState<Array<any>>([])
  const [labPeriod, setLabPeriod] = useState<LabPeriod>('ayer')
  const [hrWorkers, setHrWorkers] = useState<HrWorker[]>([])
  const [hrHistory, setHrHistory] = useState<HrHistory[]>([])
  const [hrCredentials, setHrCredentials] = useState<HrCredential[]>([])
  const [hrKpis, setHrKpis] = useState<{ total: number; active: number; byCadre: Record<string, number> } | null>(null)
  const [hrAlerts, setHrAlerts] = useState<Array<any>>([])
  const [hrStaffing, setHrStaffing] = useState<Array<any>>([])
  const [hrFacilities, setHrFacilities] = useState<Array<any>>([])
  const [hrSearch, setHrSearch] = useState('')
  const [hrCadreFilter, setHrCadreFilter] = useState('todas')
  const [hrStatusFilter, setHrStatusFilter] = useState('todos')
  const [hrEmploymentFilter, setHrEmploymentFilter] = useState('todos')
  const [hrFacilityFilter, setHrFacilityFilter] = useState('todas')
  const [hrProvinceFilter, setHrProvinceFilter] = useState('todas')
  const [hrDistrictFilter, setHrDistrictFilter] = useState('todas')
  const [hrTableTab, setHrTableTab] = useState<'professionals' | 'staffing'>('professionals')
  const [hrPage, setHrPage] = useState(1)
  const [sidebarColor, setSidebarColor] = useState('#0f1d2b')
  const [helpInput, setHelpInput] = useState('')
  const [helpMessages, setHelpMessages] = useState<ChatMessage[]>([
    {
      id: 'help-1',
      role: 'assistant',
      text: 'Hola. Soy el asistente local. Pregunta sobre RRHH, vigilancia, farmacia o pacientes.'
    }
  ])
  const [selectedWorkerId, setSelectedWorkerId] = useState<string | null>(null)
  const [patientSearch, setPatientSearch] = useState('')
  const [patientSex, setPatientSex] = useState<'all' | 'M' | 'F'>('all')
  const [patients, setPatients] = useState<Array<any>>([])
  const [patientTotal, setPatientTotal] = useState(0)
  const [patientPage, setPatientPage] = useState(1)
  const [selectedPatient, setSelectedPatient] = useState<any | null>(null)
  const patientPageSize = 12
  const [patientPhotoUrl, setPatientPhotoUrl] = useState('')
  const [hrPhotoUrl, setHrPhotoUrl] = useState('')
  const [patientTimeline, setPatientTimeline] = useState<Array<any>>([])
  const [selectedEncounterId, setSelectedEncounterId] = useState<string | null>(null)
  const [encounterDetail, setEncounterDetail] = useState<{ encounter: any; notes: any[]; vitals: any | null } | null>(null)

  const kpis = useMemo(() => {
    const summary = dashboardSummary
    const periodLabel = summary ? `${summary.startDate} - ${summary.endDate}` : 'Sin datos'
    return [
      { id: 'visitas', label: 'Atenciones en periodo', value: summary?.visits ?? 0, delta: periodLabel },
      { id: 'sospechosos', label: 'Casos sospechosos', value: summary?.suspected ?? 0, delta: 'Vigilancia semanal' },
      { id: 'alertas', label: 'Alertas activas', value: summary?.alerts ?? 0, delta: 'Alertas nacionales' },
      { id: 'ocupacion', label: 'Ocupacion de camas', value: summary?.occupancyRate ?? 0, delta: 'Estimado nacional', suffix: '%' },
      { id: 'stock', label: 'Desabastecimientos criticos', value: summary?.stockouts ?? 0, delta: 'Centros con faltantes', suffix: ' centros' },
      { id: 'mortalidad', label: 'Mortalidad reportada', value: summary?.mortalityRate ?? 0, delta: 'Periodo seleccionado', prefix: '+', suffix: '%' }
    ]
  }, [dashboardSummary])

  const hrCadreOptions = useMemo(() => {
    const set = new Set<string>()
    hrWorkers.forEach(worker => {
      if (worker.cadre) set.add(worker.cadre)
    })
    return Array.from(set).sort()
  }, [hrWorkers])

  const hrProvinceOptions = useMemo(() => {
    const set = new Set<string>()
    hrFacilities.forEach(facility => {
      if (facility.province) set.add(facility.province)
    })
    return Array.from(set).sort()
  }, [hrFacilities])

  const hrDistrictOptions = useMemo(() => {
    const set = new Set<string>()
    hrFacilities.forEach(facility => {
      if (hrProvinceFilter !== 'todas' && facility.province !== hrProvinceFilter) return
      if (facility.district) set.add(facility.district)
    })
    return Array.from(set).sort()
  }, [hrFacilities, hrProvinceFilter])

  const hrPageSize = 100
  const hrPageCount = Math.max(1, Math.ceil(hrWorkers.length / hrPageSize))
  const hrPageRows = useMemo(() => {
    const start = (hrPage - 1) * hrPageSize
    return hrWorkers.slice(start, start + hrPageSize)
  }, [hrWorkers, hrPage])

  const handleHelpSend = () => {
    const text = helpInput.trim()
    if (!text) return
    const userMessage: ChatMessage = {
      id: `help-${Date.now()}-user`,
      role: 'user',
      text
    }
    const response = buildHelpResponse(text, {
      dashboardSummary,
      hrKpis,
      facilitiesCount: hrFacilities.length,
      patientTotal,
      pharmacySummary
    })
    const assistantMessage: ChatMessage = {
      id: `help-${Date.now()}-assistant`,
      role: 'assistant',
      text: response
    }
    setHelpMessages(prev => [...prev, userMessage, assistantMessage])
    setHelpInput('')
  }

  const hrSelectedWorker = useMemo(() => {
    if (!selectedWorkerId) return null
    return hrWorkers.find(worker => worker.worker_id === selectedWorkerId) ?? null
  }, [hrWorkers, selectedWorkerId])

  const activeFacility = useMemo(() => {
    if (selectedFacilityIndex === null) return null
    return facilities[selectedFacilityIndex] ?? null
  }, [facilities, selectedFacilityIndex])

  const handleFacilitySelect = (facilityId: string) => {
    const idx = facilities.findIndex(facility => facility.facility_id === facilityId)
    if (idx !== -1) {
      setSelectedFacilityIndex(idx)
      setFacilityModalOpen(true)
    }
  }

  const closeFacilityModal = () => {
    setFacilityModalOpen(false)
  }

  const hrKpisUi = useMemo(() => {
    const total = hrKpis?.total ?? hrWorkers.length
    const active = hrKpis?.active ?? hrWorkers.filter(worker => worker.status === 'ACTIVO').length
    const byCadre = hrKpis?.byCadre ?? {}
    return [
      { id: 'total', label: 'Total profesionales', value: total, delta: 'Nominal nacional' },
      { id: 'activos', label: 'Activos', value: active, delta: 'Estado ACTIVO' },
      { id: 'medicos', label: 'Medicos', value: byCadre.MEDICO ?? 0, delta: 'Cadre MEDICO' },
      { id: 'enfermeria', label: 'Enfermeria', value: byCadre.ENFERMERIA ?? 0, delta: 'Cadre ENFERMERIA' }
    ]
  }, [hrKpis, hrWorkers])

  useEffect(() => {
    let active = true
    const filters = {
      region: facilityRegionFilter === 'todas' ? undefined : facilityRegionFilter,
      type: facilityTypeFilter === 'todas' ? undefined : facilityTypeFilter,
      search: facilitySearch.trim() ? facilitySearch.trim() : undefined
    }
    window.api.dashboard.getSummary(period, filters).then(summary => {
      if (active) setDashboardSummary(summary)
    })
    return () => {
      active = false
    }
  }, [period, facilityRegionFilter, facilityTypeFilter, facilitySearch])

  useEffect(() => {
    document.documentElement.style.setProperty('--sidebar', sidebarColor)
  }, [sidebarColor])

  useEffect(() => {
    let active = true
    window.api.facilities
      .list({
        region: facilityRegionFilter === 'todas' ? undefined : facilityRegionFilter,
        type: facilityTypeFilter === 'todas' ? undefined : facilityTypeFilter,
        search: facilitySearch.trim() ? facilitySearch.trim() : undefined
      })
      .then(rows => {
        if (active) setFacilities(rows)
      })
    return () => {
      active = false
    }
  }, [facilityRegionFilter, facilityTypeFilter, facilitySearch])

  useEffect(() => {
    if (facilities.length === 0) {
      if (selectedFacilityIndex !== null) setSelectedFacilityIndex(null)
      if (facilityModalOpen) setFacilityModalOpen(false)
      return
    }
    if (selectedFacilityIndex !== null && selectedFacilityIndex >= facilities.length) {
      setSelectedFacilityIndex(null)
      setFacilityModalOpen(false)
    }
  }, [facilities, selectedFacilityIndex, facilityModalOpen])

  useEffect(() => {
    let active = true
    if (activeModule !== 'vigilancia' && activeModule !== 'dashboard') return
    Promise.all([
      window.api.epi.trend(epiDisease, 8),
      window.api.epi.ranking(epiDisease, 8)
    ]).then(([trend, ranking]) => {
      if (!active) return
      setEpiTrend(trend)
      setEpiRanking(ranking)
    })
    return () => {
      active = false
    }
  }, [activeModule, epiDisease])

  useEffect(() => {
    let active = true
    if (activeModule !== 'vigilancia' && activeModule !== 'dashboard') return
    window.api.epi.diseases().then(list => {
      if (!active) return
      const map = new Map<string, string>()
      Object.entries(DISEASE_LABELS).forEach(([id, name]) => {
        map.set(id, name)
      })
      ;(list ?? []).forEach(item => {
        map.set(item.disease_id, item.name)
      })
      const merged = Array.from(map.entries()).map(([disease_id, name]) => ({ disease_id, name }))
      setEpiDiseases(merged)
      if (!map.has(epiDisease) && merged[0]) {
        setEpiDisease(merged[0].disease_id)
      }
    })
    return () => {
      active = false
    }
  }, [activeModule])

  useEffect(() => {
    let active = true
    if (activeModule !== 'farmacia') return
    Promise.all([
      window.api.pharmacy.summary(),
      window.api.pharmacy.critical(25)
    ]).then(([summary, critical]) => {
      if (!active) return
      setPharmacySummary(summary)
      setPharmacyCritical(critical)
    })
    return () => {
      active = false
    }
  }, [activeModule])

  useEffect(() => {
    let active = true
    if (activeModule !== 'laboratorio') return
    Promise.all([
      window.api.lab.summary(labPeriod),
      window.api.lab.volume(labVolumeLevel, labPeriod),
      window.api.lab.positivity(labPeriod),
      window.api.lab.alerts(labPeriod, 6)
    ]).then(([summary, volume, positivity, alerts]) => {
      if (!active) return
      setLabSummary(summary)
      setLabVolume(volume)
      setLabPositivity(positivity)
      setLabAlerts(alerts)
    })
    return () => {
      active = false
    }
  }, [activeModule, labVolumeLevel, labPeriod])

  useEffect(() => {
    let active = true
    if (activeModule !== 'rrhh') return
    const scope: HrScope =
      hrDistrictFilter !== 'todas'
        ? { level: 'district', id: hrDistrictFilter }
        : hrProvinceFilter !== 'todas'
          ? { level: 'province', id: hrProvinceFilter }
          : { level: 'national' }
    Promise.all([
      window.api.hr.kpis(scope),
      window.api.hr.alerts(scope),
      window.api.hr.staffing(scope, 20),
      window.api.hr.workers({
        search: hrSearch.trim() ? hrSearch.trim() : undefined,
        cadre: hrCadreFilter === 'todas' ? undefined : hrCadreFilter,
        status: hrStatusFilter === 'todos' ? undefined : hrStatusFilter,
        employmentType: hrEmploymentFilter === 'todos' ? undefined : hrEmploymentFilter,
        facilityId: hrFacilityFilter === 'todas' ? undefined : hrFacilityFilter,
        province: hrProvinceFilter === 'todas' ? undefined : hrProvinceFilter,
        district: hrDistrictFilter === 'todas' ? undefined : hrDistrictFilter
      })
    ]).then(([kpis, alerts, staffing, workers]) => {
      if (!active) return
      setHrKpis(kpis)
      setHrAlerts(alerts)
      setHrStaffing(staffing)
      setHrWorkers(workers)
    })
    return () => {
      active = false
    }
  }, [
    activeModule,
    hrSearch,
    hrCadreFilter,
    hrStatusFilter,
    hrEmploymentFilter,
    hrFacilityFilter,
    hrProvinceFilter,
    hrDistrictFilter
  ])

  useEffect(() => {
    let active = true
    if (activeModule !== 'red_sanitaria') return
    if (hrWorkers.length > 0) return
    window.api.hr.workers({}).then(rows => {
      if (!active) return
      setHrWorkers(rows)
    })
    return () => {
      active = false
    }
  }, [activeModule, hrWorkers.length])

  useEffect(() => {
    setHrPage(1)
  }, [hrSearch, hrCadreFilter, hrStatusFilter, hrEmploymentFilter, hrFacilityFilter, hrProvinceFilter, hrDistrictFilter])

  useEffect(() => {
    let active = true
    if (activeModule !== 'rrhh') return
    window.api.facilities.list({}).then(rows => {
      if (active) setHrFacilities(rows)
    })
    return () => {
      active = false
    }
  }, [activeModule])

  useEffect(() => {
    let active = true
    if (activeModule !== 'rrhh') return
    if (!selectedWorkerId) {
      setHrHistory([])
      setHrCredentials([])
      return
    }
    Promise.all([
      window.api.hr.history(selectedWorkerId),
      window.api.hr.credentials(selectedWorkerId)
    ]).then(([history, credentials]) => {
      if (!active) return
      setHrHistory(history)
      setHrCredentials(credentials)
    })
    return () => {
      active = false
    }
  }, [activeModule, selectedWorkerId])

  useEffect(() => {
    if (activeModule !== 'rrhh') return
    if (hrWorkers.length === 0) {
      setSelectedWorkerId(null)
      return
    }
    setSelectedWorkerId(prev => {
      if (prev && hrWorkers.some(worker => worker.worker_id === prev)) return prev
      return hrWorkers[0].worker_id
    })
  }, [activeModule, hrWorkers])

  useEffect(() => {
    let active = true
    if (activeModule !== 'rrhh' || !hrSelectedWorker) {
      setHrPhotoUrl('')
      return
    }
    window.api.assets.patientPhoto(hrSelectedWorker.sex ?? undefined).then(url => {
      if (!active) return
      setHrPhotoUrl(url)
    })
    return () => {
      active = false
    }
  }, [activeModule, hrSelectedWorker?.worker_id, hrSelectedWorker?.sex])

  useEffect(() => {
    setPatientPage(1)
  }, [patientSearch, patientSex])

  useEffect(() => {
    let active = true
    if (activeModule !== 'pacientes') return
    const limit = patientPageSize
    const offset = (patientPage - 1) * limit
    window.api.patients
      .list({
        search: patientSearch.trim() ? patientSearch.trim() : undefined,
        sex: patientSex === 'all' ? undefined : patientSex,
        limit,
        offset
      })
      .then(result => {
        if (!active) return
        setPatients(result.rows ?? [])
        setPatientTotal(result.total ?? 0)
        setSelectedPatient(prev => {
          const rows = result.rows ?? []
          if (!prev) return rows[0] ?? null
          const updated = rows.find((row: any) => row.patient_id === prev.patient_id)
          if (updated) return updated
          return rows[0] ?? null
        })
      })
    return () => {
      active = false
    }
  }, [activeModule, patientSearch, patientSex, patientPage])

  useEffect(() => {
    let active = true
    if (!selectedPatient) {
      setPatientTimeline([])
      setSelectedEncounterId(null)
      setEncounterDetail(null)
      return
    }
    window.api.patients.timeline(selectedPatient.patient_id, 25).then(rows => {
      if (!active) return
      setPatientTimeline(rows ?? [])
      const first = rows?.[0]?.visit_id ?? null
      setSelectedEncounterId(first)
    })
    return () => {
      active = false
    }
  }, [selectedPatient])

  useEffect(() => {
    let active = true
    if (!selectedEncounterId) {
      setEncounterDetail(null)
      return
    }
    window.api.encounters.detail(selectedEncounterId).then(detail => {
      if (active) setEncounterDetail(detail)
    })
    return () => {
      active = false
    }
  }, [selectedEncounterId])

  useEffect(() => {
    let active = true
    if (!selectedPatient) {
      setPatientPhotoUrl('')
      return
    }
    window.api.assets.patientPhoto(selectedPatient.sex).then(url => {
      if (active) setPatientPhotoUrl(url)
    })
    return () => {
      active = false
    }
  }, [selectedPatient])

  const handleGenerateReport = async () => {
    const result = await window.api.report.generatePdf({ filename: 'reporte-sigesalud.pdf' })
    if (result?.canceled) return
    if (!result?.ok) {
      alert('No se pudo generar el PDF.')
    }
  }

  const patientPageCount = Math.max(1, Math.ceil(patientTotal / patientPageSize))
  const selectedWorkerAssignment = hrSelectedWorker
    ? {
        facility_id: hrSelectedWorker.facility_id,
        position_title: hrSelectedWorker.position_title,
        department: hrSelectedWorker.department,
        start_date: hrSelectedWorker.start_date,
        end_date: hrSelectedWorker.end_date,
        fte: hrSelectedWorker.fte
      }
    : null
  const selectedWorkerHistory = hrHistory
  const selectedWorkerCredentials = hrCredentials

  const trendChart = useMemo(() => {
    if (epiTrend.length === 0) return null
    const width = 420
    const height = 180
    const padding = 16
    const maxValue = Math.max(...epiTrend.map(item => item.cases), 1)
    const points = epiTrend.map((item, index) => {
      const x = padding + (index / Math.max(1, epiTrend.length - 1)) * (width - padding * 2)
      const y = padding + (1 - item.cases / maxValue) * (height - padding * 2)
      return { ...item, x, y }
    })
    const polyline = points.map(point => `${point.x},${point.y}`).join(' ')
    return { width, height, points, polyline, maxValue }
  }, [epiTrend])

  return (
    <div className="app">
      <aside>
        <div className="brand">
          <span>Plataforma Nacional</span>
          <h1>SIGESALUD-GE</h1>
        </div>
        <div className="scope">
          <strong>Ambito: Nacional</strong>
          <div>Ministerio de Salud</div>
          <div className="status">
            <span>Modo: Sin conexion / BD local</span>
            <span>Ultima actualizacion: 09:42</span>
          </div>
        </div>

        <div className="nav-section">
          <div className="nav-title">Menu principal</div>
          <div className="nav-list">
            <div
              className={`nav-item ${activeModule === 'dashboard' ? 'active' : ''}`}
              onClick={() => setActiveModule('dashboard')}
            >
              Panel Nacional <span>Resumen</span>
            </div>
            <div
              className={`nav-item ${activeModule === 'vigilancia' ? 'active' : ''}`}
              onClick={() => setActiveModule('vigilancia')}
            >
              Vigilancia Epidemiologica
            </div>
            <div
              className={`nav-item ${activeModule === 'red_sanitaria' ? 'active' : ''}`}
              onClick={() => setActiveModule('red_sanitaria')}
            >
              Red Sanitaria
            </div>
            <div
              className={`nav-item ${activeModule === 'pacientes' ? 'active' : ''}`}
              onClick={() => setActiveModule('pacientes')}
            >
              Pacientes
            </div>
            <div
              className={`nav-item ${activeModule === 'laboratorio' ? 'active' : ''}`}
              onClick={() => setActiveModule('laboratorio')}
            >
              Laboratorio
            </div>
            <div
              className={`nav-item ${activeModule === 'farmacia' ? 'active' : ''}`}
              onClick={() => setActiveModule('farmacia')}
            >
              Farmacia y Suministros
            </div>
            <div
              className={`nav-item ${activeModule === 'rrhh' ? 'active' : ''}`}
              onClick={() => setActiveModule('rrhh')}
            >
              Recursos Humanos
            </div>
            </div>
        </div>

        <div className="nav-section">
          <div className="nav-title">Soporte</div>
          <div className="nav-list">
            <div
              className={`nav-item ${activeModule === 'configuracion' ? 'active' : ''}`}
              onClick={() => setActiveModule('configuracion')}
            >
              Configuracion
            </div>
            <div
              className={`nav-item ${activeModule === 'ayuda' ? 'active' : ''}`}
              onClick={() => setActiveModule('ayuda')}
            >
              Ayuda
            </div>
            <div
              className={`nav-item ${activeModule === 'acerca' ? 'active' : ''}`}
              onClick={() => setActiveModule('acerca')}
            >
              Acerca de
            </div>
          </div>
        </div>
      </aside>

      <main>
        {activeModule === 'dashboard' && (
          <>
            <div className="page-title">
              <div>
                <h2>Panel Nacional - Resumen Operativo</h2>
                <p className="muted">Vista macro de actividad, alertas y capacidad nacional.</p>
              </div>
                                  <div className="filters">
                <label className="filter-control">
                  <span>Region</span>
                  <select
                    className="filter-select"
                    value={facilityRegionFilter}
                    onChange={event => setFacilityRegionFilter(event.target.value as FacilityRegionFilter)}
                  >
                    <option value="todas">Todas</option>
                    <option value="INSULAR">Insular</option>
                    <option value="CONTINENTAL">Continental</option>
                  </select>
                </label>
                <label className="filter-control">
                  <span>Tipo</span>
                  <select
                    className="filter-select"
                    value={facilityTypeFilter}
                    onChange={event => setFacilityTypeFilter(event.target.value as FacilityTypeFilter)}
                  >
                    <option value="todas">Todos</option>
                    <option value="HOSPITAL">Hospital</option>
                    <option value="CLINIC">Clinica</option>
                    <option value="HEALTH_CENTER">Centro de salud</option>
                    <option value="LAB">Laboratorio</option>
                  </select>
                </label>
                <input
                  className="search"
                  placeholder="Buscar centro o ciudad"
                  value={facilitySearch}
                  onChange={event => setFacilitySearch(event.target.value)}
                />
              </div>


            </div>

            <section className="kpis">
              {kpis.map(kpi => (
                <div className="kpi" key={kpi.id}>
                  <small>{kpi.label}</small>
                  <strong>
                    {kpi.prefix ?? ''}
                    {formatNumber(kpi.value)}
                    {kpi.suffix ?? ''}
                  </strong>
                  <div className="delta">{kpi.delta}</div>
                </div>
              ))}
            </section>

            <section className="analytics">
                            <div className="panel">
                <h3>Tendencia de casos</h3>
                                <div className="selector">
                  <label className="filter-control">
                    <span>Enfermedad</span>
                    <select
                      className="filter-select"
                      value={epiDisease}
                      onChange={event => setEpiDisease(event.target.value)}
                    >
                    {(epiDiseases.length ? epiDiseases : Object.entries(DISEASE_LABELS).map(([key, label]) => ({ disease_id: key, name: label }))).map(item => (
                      <option key={item.disease_id} value={item.disease_id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
                </div>
                {trendChart ? (
                  <div className="trend-chart">
                    <svg viewBox={`0 0 ${trendChart.width} ${trendChart.height}`} role="img">
                      <polyline points={trendChart.polyline} />
                      {trendChart.points.map(point => (
                        <circle key={point.week_start} cx={point.x} cy={point.y} r="3.5" />
                      ))}
                    </svg>
                    <div className="trend-meta">
                      <span>{epiTrend[0]?.week_start}</span>
                      <span>Max {formatNumber(trendChart.maxValue)}</span>
                      <span>{epiTrend[epiTrend.length - 1]?.week_start}</span>
                    </div>
                  </div>
                ) : (
                  <div className="trend">Sin datos para la enfermedad seleccionada.</div>
                )}
              </div>
              <div className="panel">
                <h3>Ranking de regiones / centros</h3>
            <div className="rank-table">
              <div className="rank-row header">
                <div>Region/Centro</div>
                <div>Casos</div>
                <div>Ocupacion</div>
                <div>Existencias</div>
              </div>
              <div className="rank-row">
                <div>Region Litoral</div>
                <div>312</div>
                <div>82%</div>
                <div>Critico</div>
              </div>
              <div className="rank-row">
                <div>Hospital Bata</div>
                <div>204</div>
                <div>88%</div>
                    <div>Alerta</div>
                  </div>
                  <div className="rank-row">
                  <div>Region Centro Sur</div>
                    <div>148</div>
                    <div>74%</div>
                    <div>Estable</div>
                  </div>
              <div className="rank-row">
                <div>Hospital Malabo</div>
                <div>121</div>
                <div>79%</div>
                <div>Critico</div>
              </div>
            </div>
          </div>
            </section>

            <section className="alerts">
              <div className="panel">
                <h3>Alertas prioritarias</h3>
              <div className="alert-item">
                <span className="badge high">Alta A Brote</span>
                <strong>Incremento 45% casos de malaria - Region Litoral</strong>
                <span className="action-link">Ver detalle</span>
              </div>
              <div className="alert-item">
                <span className="badge high">Alta A Capacidad</span>
                <strong>Ocupacion UCI &gt; 85% - Hospital Bata</strong>
                <span className="action-link">Marcar gestionada</span>
              </div>
                <div className="alert-item">
                <span className="badge medium">Media A Desabastecimiento</span>
                  <strong>Falta de artesonate en 2 centros</strong>
                  <span className="action-link">Ver detalle</span>
                </div>
              <div className="alert-item">
                <span className="badge low">Baja A Mortalidad</span>
                <strong>Desviacion +20% mortalidad neonatal - Distrito X</strong>
                <span className="action-link">Marcar gestionada</span>
              </div>
            </div>

            <div className="panel">
              <h3>Acciones recomendadas</h3>
              <ul className="recommendations">
                <li>Reforzar stock de antipalAdicos en Bata y Litoral.</li>
                <li>Movilizar personal de Apoyo hacia UCI con alta Ocupacion.</li>
                <li>Activar alerta temprana para ETI en Region litoral.</li>
                <li>Auditar consumos de oxAgeno en hospitales de referencia.</li>
              </ul>
            </div>
          </section>
        </>
      )}

        {activeModule === 'pacientes' && (
          <section className="panel pacientes">
            <div className="section-header">
              <div>
                <h3>Pacientes</h3>
                <p className="muted">Registro nominal y seguimiento de visitas clinicas</p>
              </div>
              <div className="filters">
                <input
                  className="search"
                  placeholder="Buscar por nombre o ID"
                  value={patientSearch}
                  onChange={event => setPatientSearch(event.target.value)}
                />
                <label className="filter-control">
                  <span>Sexo</span>
                  <select
                    className="filter-select"
                    value={patientSex}
                    onChange={event => setPatientSex(event.target.value as 'all' | 'M' | 'F')}
                  >
                    <option value="all">Todos</option>
                    <option value="F">Femenino</option>
                    <option value="M">Masculino</option>
                  </select>
                </label>
                <div className="pager">
                  <button
                    className="pager-btn"
                    onClick={() => setPatientPage(prev => Math.max(1, prev - 1))}
                    disabled={patientPage <= 1}
                  >
                    Anterior
                  </button>
                  <span>
                    Pagina {patientPage} de {patientPageCount}
                  </span>
                  <button
                    className="pager-btn"
                    onClick={() => setPatientPage(prev => Math.min(patientPageCount, prev + 1))}
                    disabled={patientPage >= patientPageCount}
                  >
                    Siguiente
                  </button>
                </div>
              </div>
            </div>

            <div className="patients-grid">
              <div className="patient-list">
                <div className="patient-row header">
                  <div>Paciente</div>
                  <div>Sexo</div>
                  <div>Edad</div>
                  <div>Centro</div>
                  <div>Ultima visita</div>
                  <div>Visitas</div>
                </div>
                {patients.length === 0 && <div className="empty">Sin resultados.</div>}
                {patients.map(patient => {
                  const age = ageFromDob(patient.dob)
                  return (
                    <div
                      key={patient.patient_id}
                      className={`patient-row ${selectedPatient?.patient_id === patient.patient_id ? 'active' : ''}`}
                      onClick={() => setSelectedPatient(patient)}
                    >
                      <div>
                        <strong>{patient.full_name}</strong>
                        <div className="muted">{patient.patient_id}</div>
                      </div>
                      <div>{patient.sex ?? 'N/D'}</div>
                      <div>{age !== null ? age : 'N/D'}</div>
                      <div>{patient.facility_name ?? patient.facility_id ?? 'N/D'}</div>
                      <div>{patient.last_visit ?? 'N/D'}</div>
                      <div>{formatNumber(Number(patient.visits_count ?? 0))}</div>
                    </div>
                  )
                })}
              </div>

              <div className="patient-detail">
                {selectedPatient ? (
                  <>
                    <div className="detail-header">
                      <div className="detail-identity">
                        <div className="detail-photo">
                          <img
                            className="detail-photo-img"
                            src={patientPhotoUrl}
                            alt="Foto paciente"
                          />
                        </div>
                        <div>
                          <h4>{selectedPatient.full_name}</h4>
                          <span className="muted">{selectedPatient.patient_id}</span>
                        </div>
                      </div>
                      <span className="detail-pill">{selectedPatient.sex ?? 'N/D'}</span>
                    </div>
                    <div className="detail-grid">
                      <div>
                        <small>Edad</small>
                        <strong>{ageFromDob(selectedPatient.dob) ?? 'N/D'}</strong>
                      </div>
                      <div>
                        <small>Fecha nacimiento</small>
                        <strong>{selectedPatient.dob ?? 'N/D'}</strong>
                      </div>
                      <div>
                        <small>Centro asociado</small>
                        <strong>{selectedPatient.facility_name ?? selectedPatient.facility_id ?? 'N/D'}</strong>
                      </div>
                      <div>
                        <small>Ultima visita</small>
                        <strong>{selectedPatient.last_visit ?? 'N/D'}</strong>
                      </div>
                      <div>
                        <small>Visitas</small>
                        <strong>{formatNumber(Number(selectedPatient.visits_count ?? 0))}</strong>
                      </div>
                    </div>
                    <div className="detail-section">
                      <strong>Historial</strong>
                      {patientTimeline.length === 0 ? (
                        <div className="empty">Sin encuentros.</div>
                      ) : (
                        <div className="timeline">
                          {patientTimeline.map((item: any) => (
                            <div
                              key={item.visit_id}
                              className={`timeline-row ${selectedEncounterId === item.visit_id ? 'active' : ''}`}
                              onClick={() => setSelectedEncounterId(item.visit_id)}
                            >
                              <div>
                                <strong>{item.date}</strong>
                                <div className="muted">{item.facility_name ?? item.facility_id}</div>
                              </div>
                              <div>{formatDiagnosisLabel(item.diagnosis_id)}</div>
                              <div>{item.outcome ?? 'N/D'}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="detail-section">
                      <strong>Encuentro seleccionado</strong>
                      {!encounterDetail?.encounter ? (
                        <div className="empty">Seleccione un encuentro para ver detalle.</div>
                      ) : (
                        <>
                          <div className="encounter-meta">
                            <div>
                              <small>Fecha</small>
                              <strong>{encounterDetail.encounter.date}</strong>
                            </div>
                            <div>
                              <small>Servicio</small>
                              <strong>{encounterDetail.encounter.service}</strong>
                            </div>
                            <div>
                              <small>Diagnostico</small>
                              <strong>{formatDiagnosisLabel(encounterDetail.encounter.diagnosis_id)}</strong>
                            </div>
                            <div>
                              <small>Resultado</small>
                              <strong>{encounterDetail.encounter.outcome ?? 'N/D'}</strong>
                            </div>
                          </div>
                          {encounterDetail.vitals && (
                            <div className="vitals-grid">
                              <div>
                                <small>TA</small>
                                <strong>{encounterDetail.vitals.bp_sys}/{encounterDetail.vitals.bp_dia}</strong>
                              </div>
                              <div>
                                <small>Temp</small>
                                <strong>{encounterDetail.vitals.temp_c} C</strong>
                              </div>
                              <div>
                                <small>FC</small>
                                <strong>{encounterDetail.vitals.hr}</strong>
                              </div>
                              <div>
                                <small>FR</small>
                                <strong>{encounterDetail.vitals.rr}</strong>
                              </div>
                              <div>
                                <small>SpO2</small>
                                <strong>{encounterDetail.vitals.spo2}%</strong>
                              </div>
                              <div>
                                <small>Peso</small>
                                <strong>{encounterDetail.vitals.weight_kg} kg</strong>
                              </div>
                            </div>
                          )}
                          <div className="notes">
                            {encounterDetail.notes.length === 0 ? (
                              <div className="empty">Sin notas clinicas.</div>
                            ) : (
                              encounterDetail.notes.map(note => (
                                <div className="note-card" key={note.note_id}>
                                  <div className="note-header">
                                    <strong>{note.note_type}</strong>
                                    <span className="muted">{note.created_at}</span>
                                  </div>
                                  <div className="note-body">
                                    <div><strong>Motivo:</strong> {note.chief_complaint}</div>
                                    <div><strong>Subjetivo:</strong> {note.subjective}</div>
                                    <div><strong>Objetivo:</strong> {note.objective}</div>
                                    <div><strong>Evaluacion:</strong> {note.assessment}</div>
                                    <div><strong>Plan:</strong> {note.plan}</div>
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        </>
                      )}
                    </div>
                    <div className="detail-note">
                      <strong>Notas clinicas</strong>
                      <p className="muted">Vista de resumen disponible para evoluciones y diagnosticos proximamente.</p>
                    </div>
                  </>
                ) : (
                  <div className="empty">Seleccione un paciente para ver el detalle.</div>
                )}
              </div>
            </div>
          </section>
        )}

        {activeModule === 'red_sanitaria' && (
          <section className="panel red-sanitaria">
            <div className="section-header">
              <div>
                <h3>Red Sanitaria</h3>
                <p className="muted">Registro base de centros y proveedores con indicadores de calidad.</p>
              </div>
                        <div className="filters">
              <label className="filter-control">
                <span>Vista</span>
                <select
                  className="filter-select"
                  value={facilityView}
                  onChange={event => setFacilityView(event.target.value as FacilityView)}
                >
                  <option value="mapa">Mapa</option>
                  <option value="tabla">Tabla</option>
                </select>
              </label>
              <label className="filter-control">
                <span>Region</span>
                <select
                  className="filter-select"
                  value={facilityRegionFilter}
                  onChange={event => setFacilityRegionFilter(event.target.value as FacilityRegionFilter)}
                >
                  <option value="todas">Todas</option>
                  <option value="INSULAR">Insular</option>
                  <option value="CONTINENTAL">Continental</option>
                </select>
              </label>
              <label className="filter-control">
                <span>Tipo</span>
                <select
                  className="filter-select"
                  value={facilityTypeFilter}
                  onChange={event => setFacilityTypeFilter(event.target.value as FacilityTypeFilter)}
                >
                  <option value="todas">Todos</option>
                  <option value="HOSPITAL">Hospital</option>
                  <option value="CLINIC">Clinica</option>
                  <option value="HEALTH_CENTER">Centro de salud</option>
                  <option value="LAB">Laboratorio</option>
                </select>
              </label>
              <input
                className="search"
                placeholder="Buscar centro o ciudad"
                value={facilitySearch}
                onChange={event => setFacilitySearch(event.target.value)}
              />
            </div>
            </div>

            {facilityView === 'mapa' && (
              <FacilitiesMap
                facilities={facilities}
                selectedId={activeFacility?.facility_id ?? null}
                onSelect={handleFacilitySelect}
              />
            )}

            {facilityView === 'tabla' && (
              <div className="facilities-table-only">
                <div className="table facilities-table">
                  <div className="facility-row header">
                    <div>Centro</div>
                    <div>Region</div>
                    <div>Provincia</div>
                    <div>Tipo</div>
                    <div>Propiedad</div>
                  </div>
                  {facilities.map((facility: any, index: number) => (
                    <div
                      className={`facility-row ${selectedFacilityIndex === index ? 'active' : ''}`}
                      key={facility.facility_id ?? `${facility.name}-${index}`}
                      onClick={() => facility.facility_id && handleFacilitySelect(facility.facility_id)}
                    >
                      <div>
                        <strong>{facility.name}</strong>
                        <div className="muted">
                          {facility.city ?? 'N/D'} / {facility.district ?? 'N/D'}
                        </div>
                      </div>
                      <div>{facility.region ?? 'N/D'}</div>
                      <div>{facility.province ?? 'N/D'}</div>
                      <div>{FACILITY_LABELS[facility.facility_type] ?? facility.facility_type ?? 'N/D'}</div>
                      <div>{OWNERSHIP_LABELS[facility.ownership] ?? facility.ownership ?? 'N/D'}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {facilityModalOpen && activeFacility && (
              <div className="facility-modal-overlay" onClick={closeFacilityModal}>
                <div
                  className="facility-modal"
                  role="dialog"
                  aria-modal="true"
                  onClick={event => event.stopPropagation()}
                >
                  <div className="facility-modal-header">
                    <h4>Ficha del centro</h4>
                    <button type="button" className="facility-modal-close" onClick={closeFacilityModal}>
                      Cerrar
                    </button>
                  </div>
                  <div className="facility-detail facility-modal-card">
                    <div className="detail-header">
                      <div className="detail-identity">
                        <div className="detail-photo">
                          <img src={FACILITY_PLACEHOLDER} alt="Centro" className="detail-photo-img" />
                        </div>
                        <div>
                          <h4>{activeFacility.name}</h4>
                          <div className="muted">{activeFacility.facility_id}</div>
                        </div>
                      </div>
                      <span className="detail-pill">
                        {FACILITY_LABELS[activeFacility.facility_type] ?? activeFacility.facility_type ?? 'N/D'}
                      </span>
                    </div>

                    <div className="detail-grid">
                      <div>
                        <small>Director</small>
                        <strong>{pickDirectorName(activeFacility.facility_id, hrWorkers)}</strong>
                      </div>
                      <div>
                        <small>Region</small>
                        <strong>{activeFacility.region ?? 'N/D'}</strong>
                      </div>
                      <div>
                        <small>Provincia</small>
                        <strong>{activeFacility.province ?? 'N/D'}</strong>
                      </div>
                      <div>
                        <small>Distrito</small>
                        <strong>{activeFacility.district ?? 'N/D'}</strong>
                      </div>
                      <div>
                        <small>Ciudad</small>
                        <strong>{activeFacility.city ?? 'N/D'}</strong>
                      </div>
                      <div>
                        <small>Propiedad</small>
                        <strong>{OWNERSHIP_LABELS[activeFacility.ownership] ?? activeFacility.ownership ?? 'N/D'}</strong>
                      </div>
                      <div>
                        <small>Nivel</small>
                        <strong>{activeFacility.reference_level ?? 'N/D'}</strong>
                      </div>
                    </div>

                    <div className="facility-columns">
                      <div className="detail-section">
                        <strong>Servicios disponibles</strong>
                        <div className="tags">
                          {(activeFacility.services ?? []).length === 0 ? (
                            <span className="muted">Sin servicios registrados.</span>
                          ) : (
                            <>
                              {(activeFacility.services ?? []).slice(0, 6).map((service: string) => (
                                <span className="tag" key={service}>
                                  {SERVICE_LABELS[service] ?? service}
                                </span>
                              ))}
                              {(activeFacility.services ?? []).length > 6 && (
                                <span className="tag muted-tag">+{(activeFacility.services ?? []).length - 6} mas</span>
                              )}
                            </>
                          )}
                        </div>
                      </div>

                      <div className="detail-section">
                        <strong>Calidad de datos</strong>
                        <div className="tags">
                          {(activeFacility.data_quality?.missing ?? []).length === 0 ? (
                            <span className="muted">Sin campos faltantes.</span>
                          ) : (
                            <>
                              {(activeFacility.data_quality?.missing ?? []).slice(0, 5).map((item: string) => (
                                <span className="tag warning" key={item}>
                                  {MISSING_LABELS[item] ?? item}
                                </span>
                              ))}
                              {(activeFacility.data_quality?.missing ?? []).length > 5 && (
                                <span className="tag muted-tag">+{(activeFacility.data_quality?.missing ?? []).length - 5} mas</span>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </section>
        )}

        {activeModule === 'vigilancia' && (
          <section className="panel vigilancia">
            <div className="section-header">
              <div>
                <h3>Vigilancia Epidemiologica</h3>
                <p className="muted">Seguimiento semanal por distrito y alertas por enfermedad.</p>
              </div>
                            <div className="filters">
                <label className="filter-control">
                  <span>Enfermedad</span>
                  <select
                    className="filter-select"
                    value={epiDisease}
                    onChange={event => setEpiDisease(event.target.value)}
                  >
                    {(epiDiseases.length ? epiDiseases : Object.entries(DISEASE_LABELS).map(([key, label]) => ({ disease_id: key, name: label }))).map(item => (
                      <option key={item.disease_id} value={item.disease_id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>

            <div className="analytics">
              <div className="panel">
                <h3>Tendencia semanal (8 semanas)</h3>
                {epiTrend.length === 0 ? (
                  <div className="trend">Sin datos para la enfermedad seleccionada.</div>
                ) : (
                  <div className="trend-list">
                    {epiTrend.map(item => (
                      <div className="trend-row" key={item.week_start}>
                        <span>{item.week_start}</span>
                        <div className="bar">
                          <div
                            className="bar-fill"
                            style={{
                              width: `${Math.max(6, Math.round((item.cases / Math.max(...epiTrend.map(row => row.cases))) * 100))}%`
                            }}
                          />
                        </div>
                        <strong>{formatNumber(item.cases)}</strong>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="panel">
                <h3>Ranking por distrito</h3>
                <div className="rank-table">
                  <div className="rank-row header">
                    <div>Distrito</div>
                    <div>Provincia</div>
                    <div>Region</div>
                    <div>Casos</div>
                  </div>
                  {epiRanking.map(row => (
                    <div className="rank-row" key={row.district_id}>
                      <div>{row.district_id.replace('DIST_', '').replaceAll('_', ' ')}</div>
                      <div>{row.province_id.replace('PROV_', '').replaceAll('_', ' ')}</div>
                      <div>{row.region}</div>
                      <div>{formatNumber(row.cases)}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}

        {activeModule === 'rrhh' && (
          <section className="panel rrhh">
            <div className="section-header">
              <div>
                <h3>Recursos Humanos</h3>
                <p className="muted">Directorio nominal, asignaciones y trayectoria por profesional.</p>
              </div>
              <div className="filters">
                <input
                  className="search"
                  placeholder="Buscar por nombre o ID"
                  value={hrSearch}
                  onChange={event => setHrSearch(event.target.value)}
                />
                <label className="filter-control">
                  <span>Cadre</span>
                  <select
                    className="filter-select"
                    value={hrCadreFilter}
                    onChange={event => setHrCadreFilter(event.target.value)}
                  >
                    <option value="todas">Todos</option>
                    {hrCadreOptions.map(cadre => (
                      <option key={cadre} value={cadre}>
                        {formatHrLabel(cadre, HR_CADRE_LABELS)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="filter-control">
                  <span>Estado</span>
                  <select
                    className="filter-select"
                    value={hrStatusFilter}
                    onChange={event => setHrStatusFilter(event.target.value)}
                  >
                    <option value="todos">Todos</option>
                    <option value="ACTIVO">Activo</option>
                    <option value="BAJA">Baja</option>
                    <option value="TRASLADO">Traslado</option>
                    <option value="JUBILADO">Jubilado</option>
                  </select>
                </label>
                <label className="filter-control">
                  <span>Contrato</span>
                  <select
                    className="filter-select"
                    value={hrEmploymentFilter}
                    onChange={event => setHrEmploymentFilter(event.target.value)}
                  >
                    <option value="todos">Todos</option>
                    <option value="PUBLICO">Publico</option>
                    <option value="CONTRATO">Contrato</option>
                    <option value="COOPERACION">Cooperacion</option>
                  </select>
                </label>
                <label className="filter-control">
                  <span>Centro</span>
                  <select
                    className="filter-select"
                    value={hrFacilityFilter}
                    onChange={event => setHrFacilityFilter(event.target.value)}
                  >
                    <option value="todas">Todos</option>
                    {hrFacilities.map(facility => (
                      <option key={facility.facility_id} value={facility.facility_id}>
                        {facility.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="filter-control">
                  <span>Provincia</span>
                  <select
                    className="filter-select"
                    value={hrProvinceFilter}
                    onChange={event => {
                      setHrProvinceFilter(event.target.value)
                      setHrDistrictFilter('todas')
                    }}
                  >
                    <option value="todas">Todas</option>
                    {hrProvinceOptions.map(option => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="filter-control">
                  <span>Distrito</span>
                  <select
                    className="filter-select"
                    value={hrDistrictFilter}
                    onChange={event => setHrDistrictFilter(event.target.value)}
                  >
                    <option value="todas">Todos</option>
                    {hrDistrictOptions.map(option => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>

            <section className="kpis">
              {hrKpisUi.map(kpi => (
                <div className="kpi" key={kpi.id}>
                  <small>{kpi.label}</small>
                  <strong>{formatNumber(kpi.value)}</strong>
                  <div className="delta">{kpi.delta}</div>
                </div>
              ))}
            </section>

            <div className="hr-tabs">
              <button
                className={`chip ${hrTableTab === 'professionals' ? 'active' : ''}`}
                onClick={() => setHrTableTab('professionals')}
              >
                Directorio de profesionales
              </button>
              <button
                className={`chip ${hrTableTab === 'staffing' ? 'active' : ''}`}
                onClick={() => setHrTableTab('staffing')}
              >
                Personal por centro
              </button>
            </div>

            {hrTableTab === 'professionals' && (
              <section className="hr-top">
                <div className="hr-list">
                  <div className="hr-row header">
                    <div>Profesional</div>
                    <div>Cadre</div>
                    <div>Centro</div>
                    <div>Servicio</div>
                    <div>Estado</div>
                  </div>
                  {hrWorkers.length === 0 && <div className="empty">Sin resultados.</div>}
                  {hrPageRows.map(worker => {
                    return (
                      <div
                        key={worker.worker_id}
                        className={`hr-row ${selectedWorkerId === worker.worker_id ? 'active' : ''}`}
                        onClick={() => setSelectedWorkerId(worker.worker_id)}
                      >
                        <div>
                          <strong>{worker.full_name}</strong>
                          <div className="muted">{worker.worker_id}</div>
                        </div>
                        <div>{formatHrLabel(worker.cadre, HR_CADRE_LABELS)}</div>
                        <div className="hr-center">
                          <strong>{worker.facility_name ?? formatFacilityId(worker.facility_id) ?? 'N/D'}</strong>
                        </div>
                        <div>{worker.department ?? 'N/D'}</div>
                        <div>{formatHrLabel(worker.status, HR_STATUS_LABELS)}</div>
                      </div>
                    )
                  })}
                  {hrWorkers.length > 0 && (
                    <div className="pager">
                      <button
                        className="pager-btn"
                        onClick={() => setHrPage(prev => Math.max(1, prev - 1))}
                        disabled={hrPage <= 1}
                      >
                        Anterior
                      </button>
                      <span>
                        Pagina {hrPage} de {hrPageCount}
                      </span>
                      <button
                        className="pager-btn"
                        onClick={() => setHrPage(prev => Math.min(hrPageCount, prev + 1))}
                        disabled={hrPage >= hrPageCount}
                      >
                        Siguiente
                      </button>
                    </div>
                  )}
                </div>

                <div className="patient-detail hr-detail">
                  {hrSelectedWorker ? (
                    <>
                      <div className="detail-header">
                        <div className="detail-identity">
                          <div className={`detail-photo ${hrPhotoUrl ? '' : 'hr-avatar'}`}>
                            {hrPhotoUrl ? (
                              <img src={hrPhotoUrl} alt="Profesional" className="detail-photo-img" />
                            ) : (
                              <span>{initials(hrSelectedWorker.full_name)}</span>
                            )}
                          </div>
                          <div>
                            <h4>{hrSelectedWorker.full_name}</h4>
                            <span className="muted">{hrSelectedWorker.worker_id}</span>
                          </div>
                        </div>
                        <span className="detail-pill">{formatHrLabel(hrSelectedWorker.status, HR_STATUS_LABELS)}</span>
                      </div>
                      <div className="detail-grid">
                        <div>
                          <small>Cadre</small>
                          <strong>{formatHrLabel(hrSelectedWorker.cadre, HR_CADRE_LABELS)}</strong>
                        </div>
                        <div>
                          <small>Especialidad</small>
                          <strong>{formatHrLabel(hrSelectedWorker.specialty)}</strong>
                        </div>
                        <div>
                          <small>Contrato</small>
                          <strong>{formatHrLabel(hrSelectedWorker.employment_type, HR_EMPLOYMENT_LABELS)}</strong>
                        </div>
                        <div>
                          <small>Licencia</small>
                          <strong>{hrSelectedWorker.license_number ?? 'N/D'}</strong>
                        </div>
                        <div>
                          <small>Telefono</small>
                          <strong>{hrSelectedWorker.contact?.phone ?? 'N/D'}</strong>
                        </div>
                        <div>
                          <small>Email</small>
                          <strong>{hrSelectedWorker.contact?.email ?? 'N/D'}</strong>
                        </div>
                      </div>

                      <div className="detail-section">
                        <strong>Asignacion actual</strong>
                        {selectedWorkerAssignment ? (
                          <div className="detail-grid">
                            <div>
                              <small>Centro</small>
                              <strong>
                                {hrSelectedWorker.facility_name ??
                                  formatFacilityId(selectedWorkerAssignment.facility_id) ??
                                  'N/D'}
                              </strong>
                            </div>
                            <div>
                              <small>Puesto</small>
                              <strong>{selectedWorkerAssignment.position_title ?? 'N/D'}</strong>
                            </div>
                            <div>
                              <small>Servicio</small>
                              <strong>{selectedWorkerAssignment.department ?? 'N/D'}</strong>
                            </div>
                            <div>
                              <small>FTE</small>
                              <strong>{selectedWorkerAssignment.fte ?? 'N/D'}</strong>
                            </div>
                            <div>
                              <small>Inicio</small>
                              <strong>{selectedWorkerAssignment.start_date ?? 'N/D'}</strong>
                            </div>
                          </div>
                        ) : (
                          <div className="empty">Sin asignacion activa.</div>
                        )}
                      </div>

                      <div className="detail-section">
                        <strong>Trayectoria</strong>
                        {selectedWorkerHistory.length === 0 ? (
                          <div className="empty">Sin historial.</div>
                        ) : (
                          <div className="hr-timeline">
                            {selectedWorkerHistory.map(item => (
                              <div className="hr-timeline-row" key={item.history_id}>
                                <div>
                                  <strong>{formatFacilityId(item.facility_id)}</strong>
                                  <div className="muted">{item.role ?? 'N/D'}</div>
                                </div>
                                <div>{formatDateRange(item.start_date, item.end_date)}</div>
                                <div>{item.notes ?? 'N/D'}</div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="detail-section">
                        <strong>Formacion y certificaciones</strong>
                        {selectedWorkerCredentials.length === 0 ? (
                          <div className="empty">Sin credenciales registradas.</div>
                        ) : (
                          <div className="hr-credentials">
                            {selectedWorkerCredentials.map(item => (
                              <div className="hr-credential-row" key={item.credential_id}>
                                <div>
                                  <strong>{item.name ?? item.type ?? 'N/D'}</strong>
                                  <div className="muted">{item.institution ?? 'N/D'}</div>
                                </div>
                                <div>{item.date_awarded ?? 'N/D'}</div>
                                <div>{item.expires_on ?? 'Vigente'}</div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="empty">Seleccione un profesional para ver el detalle.</div>
                  )}
                </div>
              </section>
            )}

            {hrTableTab === 'staffing' && (
              <section className="panel">
                <h3>Personal por centro</h3>
                <div className="table hr-staffing">
                  <div className="table-row header">
                    <div>Centro</div>
                    <div>Medicos</div>
                    <div>Enfermeria</div>
                    <div>Tecnicos</div>
                    <div>Vacantes</div>
                  </div>
                  {hrStaffing.map(row => {
                    const doctorsGap = Math.max(0, Number(row.required_doctors ?? 0) - Number(row.actual_doctors ?? 0))
                    const nursesGap = Math.max(0, Number(row.required_nurses ?? 0) - Number(row.actual_nurses ?? 0))
                    const techGap = Math.max(0, Number(row.required_technicians ?? 0) - Number(row.actual_technicians ?? 0))
                    const totalGap = doctorsGap + nursesGap + techGap
                    return (
                      <div className="table-row" key={row.facility_id}>
                        <div>
                          <strong>{row.facility_name ?? row.facility_id}</strong>
                          <div className="muted">{row.province ?? 'N/D'} - {row.district ?? 'N/D'}</div>
                        </div>
                        <div>{row.actual_doctors}/{row.required_doctors}</div>
                        <div>{row.actual_nurses}/{row.required_nurses}</div>
                        <div>{row.actual_technicians}/{row.required_technicians}</div>
                        <div>{totalGap}</div>
                      </div>
                    )
                  })}
                </div>
              </section>
            )}

          </section>
        )}

        {activeModule === 'farmacia' && (
          <section className="panel farmacia">
            <div className="section-header">
              <div>
                <h3>Farmacia y Suministros</h3>
                <p className="muted">Disponibilidad, desabastecimientos y caducidades criticas.</p>
              </div>
            </div>

            <section className="kpis">
              <div className="kpi">
                <small>Centros criticos</small>
                <strong>{formatNumber(pharmacySummary?.facilitiesCritical ?? 0)}</strong>
                <div className="delta">Mes {pharmacySummary?.latestMonth ?? 'N/D'}</div>
              </div>
              <div className="kpi">
                <small>Items criticos</small>
                <strong>{formatNumber(pharmacySummary?.itemsCritical ?? 0)}</strong>
                <div className="delta">Stock bajo o agotado</div>
              </div>
              <div className="kpi">
                <small>Fecha de corte</small>
                <strong>{pharmacySummary?.latestMonth ?? 'N/D'}</strong>
                <div className="delta">Ultimo mes cargado</div>
              </div>
            </section>

            <div className="table">
              <div className="table-row header">
                <div>Centro</div>
                <div>Articulo</div>
                <div>Stock</div>
                <div>Minimo</div>
                <div>Caduca</div>
              </div>
              {pharmacyCritical.map(row => (
                <div className="table-row" key={`${row.facility_id}-${row.item_id}`}>
                  <div>{row.facility_name ?? row.facility_id}</div>
                  <div>{row.item_name}</div>
                  <div>{row.stock_on_hand}</div>
                  <div>{row.min_level}</div>
                  <div>{row.expiry_nearest ?? 'N/D'}</div>
                </div>
              ))}
            </div>
          </section>
        )}

        {activeModule === 'laboratorio' && (
          <section className="panel laboratorio">
            <div className="section-header">
              <div>
                <h3>Laboratorio</h3>
                <p className="muted">Seguimiento de volumen, positividad y alertas operativas.</p>
              </div>
              <div className="filters">
                <label className="filter-control">
                  <span>Periodo</span>
                  <select
                    className="filter-select"
                    value={labPeriod}
                    onChange={event => setLabPeriod(event.target.value as LabPeriod)}
                  >
                    <option value="ayer">Ayer</option>
                    <option value="7d">Semana pasada</option>
                    <option value="30d">Mes pasado</option>
                  </select>
                </label>
              </div>
            </div>

            <section className="kpis">
              <div className="kpi">
                <small>Tests solicitados</small>
                <strong>{formatNumber(labSummary?.tests_ordered ?? 0)}</strong>
                <div className="delta">{LAB_PERIOD_LABELS[labPeriod]}</div>
              </div>
              <div className="kpi">
                <small>Tests completados</small>
                <strong>{formatNumber(labSummary?.tests_completed ?? 0)}</strong>
                <div className="delta">{LAB_PERIOD_LABELS[labPeriod]}</div>
              </div>
              <div className="kpi">
                <small>Tiempo promedio</small>
                <strong>{labSummary?.avg_turnaround_hours ?? 0} h</strong>
                <div className="delta">Entrega resultados</div>
              </div>
              <div className="kpi">
                <small>Muestras rechazadas</small>
                <strong>{formatNumber(labSummary?.rejected_samples ?? 0)}</strong>
                <div className="delta">{LAB_PERIOD_LABELS[labPeriod]}</div>
              </div>
            </section>

            <section className="analytics">
              <div className="panel">
                <div className="panel-header">
                  <h3>Volumen por {LAB_SCOPE_LABELS[labVolumeLevel].toLowerCase()}</h3>
                  <label className="filter-control">
                    <span>Ver por</span>
                    <select
                      className="filter-select"
                      value={labVolumeLevel}
                      onChange={event => setLabVolumeLevel(event.target.value as 'province' | 'district')}
                    >
                      <option value="province">Provincia</option>
                      <option value="district">Distrito</option>
                    </select>
                  </label>
                </div>
                <div className="rank-table">
                  <div className="rank-row header">
                    <div>{LAB_SCOPE_LABELS[labVolumeLevel]}</div>
                    <div>Solicitados</div>
                    <div>Completados</div>
                  </div>
                  {labVolume.map(row => (
                    <div className="rank-row" key={row.scope_id}>
                      <div>{row.scope_name}</div>
                      <div>{formatNumber(row.tests_ordered)}</div>
                      <div>{formatNumber(row.tests_completed)}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="panel">
                <h3>Positividad</h3>
                <div className="rank-table">
                  <div className="rank-row header">
                    <div>Enfermedad</div>
                    <div>Test</div>
                    <div>Positivos</div>
                  </div>
                  {labPositivity.map(row => (
                    <div className="rank-row" key={`${row.disease_id}-${row.test_type}`}>
                      <div>{DISEASE_LABELS[row.disease_id] ?? row.disease_id}</div>
                      <div>{row.test_type}</div>
                      <div>{row.total_positive}/{row.total_tested}</div>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="alerts">
              <div className="panel">
                <h3>Alertas de laboratorio</h3>
                {labAlerts.length === 0 ? (
                  <div className="empty">Sin alertas activas.</div>
                ) : (
                  labAlerts.map(alert => (
                    <div className="alert-item" key={alert.alert_id}>
                      <span className={`badge ${alert.severity === 'ALTA' ? 'high' : alert.severity === 'MEDIA' ? 'medium' : 'low'}`}>
                        {alert.severity} - {alert.type}
                      </span>
                      <strong>{alert.facility_name ?? alert.facility_id ?? 'N/D'}</strong>
                      <span className="muted">{alert.message}</span>
                    </div>
                  ))
                )}
              </div>
            </section>
          </section>
        )}

        {activeModule === 'configuracion' && (
          <section className="panel configuracion">
            <div className="section-header">
              <div>
                <h3>Configuracion</h3>
                <p className="muted">Parametros de la plataforma y preferencias visuales.</p>
              </div>
            </div>

            <div className="settings-grid">
              <div className="panel setting-card">
                <h3>Visual</h3>
                <div className="setting-row">
                  <div>
                    <strong>Color del sidebar</strong>
                    <div className="muted">Personaliza el panel izquierdo.</div>
                  </div>
                  <div className="color-options">
                    {[
                      { id: 'azul', value: '#0f1d2b' },
                      { id: 'carbon', value: '#1e1f22' },
                      { id: 'verde', value: '#0f2b1d' },
                      { id: 'acero', value: '#162635' },
                      { id: 'ladrillo', value: '#2b1418' }
                    ].map(option => (
                      <button
                        key={option.id}
                        className={`color-swatch ${sidebarColor === option.value ? 'active' : ''}`}
                        style={{ backgroundColor: option.value }}
                        onClick={() => setSidebarColor(option.value)}
                        aria-label={`Color ${option.id}`}
                      />
                    ))}
                  </div>
                </div>
              </div>

              <div className="panel setting-card">
                <h3>Sistema</h3>
                <div className="setting-row">
                  <div>
                    <strong>Notificaciones</strong>
                    <div className="muted">Alertas clinicas y operativas.</div>
                  </div>
                  <button className="chip active">Activadas</button>
                </div>
                <div className="setting-row">
                  <div>
                    <strong>Cache local</strong>
                    <div className="muted">Mantener datos offline por 7 dias.</div>
                  </div>
                  <button className="chip">Desactivar</button>
                </div>
                <div className="setting-row">
                  <div>
                    <strong>Modo compacto</strong>
                    <div className="muted">Reduce margenes en tablas.</div>
                  </div>
                  <button className="chip">Inactivo</button>
                </div>
              </div>

              <div className="panel setting-card">
                <h3>Cuenta</h3>
                <div className="setting-row">
                  <div>
                    <strong>Rol activo</strong>
                    <div className="muted">Administrador nacional</div>
                  </div>
                  <button className="chip">Cambiar</button>
                </div>
                <div className="setting-row">
                  <div>
                    <strong>Idioma</strong>
                    <div className="muted">Espanol (GE)</div>
                  </div>
                  <button className="chip active">Espanol</button>
                </div>
              </div>
            </div>
          </section>
        )}

        {activeModule === 'ayuda' && (
          <section className="panel ayuda">
            <div className="section-header">
              <div>
                <h3>Ayuda</h3>
                <p className="muted">Asistente local para consultas sobre datos de la plataforma. Modulo en desarollo</p>
              </div>
            </div>

            <div className="help-chat">
              <div className="help-messages">
                {helpMessages.map(message => (
                  <div
                    key={message.id}
                    className={`help-message ${message.role === 'user' ? 'user' : 'assistant'}`}
                  >
                    <strong>{message.role === 'user' ? 'Tu' : 'Asistente'}</strong>
                    <p>{message.text}</p>
                  </div>
                ))}
              </div>
              <div className="help-input">
                <input
                  className="search"
                  placeholder="Escribe tu pregunta..."
                  value={helpInput}
                  onChange={event => setHelpInput(event.target.value)}
                  onKeyDown={event => {
                    if (event.key === 'Enter') handleHelpSend()
                  }}
                />
                <button className="action-btn" onClick={handleHelpSend}>
                  Enviar
                </button>
              </div>
            </div>
          </section>
        )}

        {activeModule === 'acerca' && (
          <section className="panel acerca">
            <div className="section-header">
              <div>
                <h3>Acerca de</h3>
                <p className="muted">Informacion institucional y contacto.</p>
              </div>
            </div>
            <div className="panel">
              <p>
                Acerca de: SIGESALUD Demo es una aplicacion desarrollada por Iniciativas Elebi para la gestion
                hospitalaria y la supervision sanitaria a nivel nacional, concebida como una demostracion funcional
                y personalizable de un sistema integral de informacion en salud. Esta version demo permite visualizar
                el potencial completo de la plataforma, la cual puede adaptarse a las preferencias, normativas y
                necesidades especificas de cada cliente o pais. SIGESALUD esta disenado bajo un modelo modular y
                federado: las aplicaciones instaladas en los centros hospitalarios y de salud operan de forma local
                durante la jornada diaria y, de manera programada (por ejemplo, cada noche), sincronizan y transmiten
                la informacion consolidada al modulo central, donde los datos se integran, validan y analizan para
                ofrecer indicadores nacionales, vigilancia epidemiologica, gestion de recursos y apoyo a la toma de
                decisiones estrategicas.
              </p>
              <p>
                Para mas informacion contactanos: INICIATIVAS ELEBI{' '}
                <a href="https://wa.me/240222780886" target="_blank" rel="noreferrer">
                  +240222780886
                </a>{' '}
                o{' '}
                <a href="mailto:info.elebi@gmail.com">info.elebi@gmail.com</a>
              </p>
            </div>
          </section>
        )}
      </main>
    </div>
  )
}




