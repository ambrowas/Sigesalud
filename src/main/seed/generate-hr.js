const fs = require('fs')
const path = require('path')

const ROOT = __dirname
const DATA_FULL = path.join(ROOT, 'data_full')
const OUT_DIR = path.join(ROOT, 'hr')

function loadJson(fileName) {
  const raw = fs.readFileSync(path.join(DATA_FULL, fileName), 'utf8')
  return JSON.parse(raw)
}

function writeJson(fileName, data) {
  const target = path.join(OUT_DIR, fileName)
  fs.mkdirSync(OUT_DIR, { recursive: true })
  fs.writeFileSync(target, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
}

function createRng(seed) {
  let state = seed % 2147483647
  if (state <= 0) state += 2147483646
  return () => {
    state = (state * 16807) % 2147483647
    return (state - 1) / 2147483646
  }
}

function pick(rng, list) {
  return list[Math.floor(rng() * list.length)]
}

function weightedPick(rng, options) {
  const total = options.reduce((sum, opt) => sum + opt.weight, 0)
  const roll = rng() * total
  let acc = 0
  for (const opt of options) {
    acc += opt.weight
    if (roll <= acc) return opt.value
  }
  return options[options.length - 1].value
}

function pad(num, size) {
  return String(num).padStart(size, '0')
}

const FIRST_NAMES_M = ['Juan', 'Luis', 'Pedro', 'Carlos', 'Miguel', 'Jose', 'Andres', 'Ramon', 'Victor', 'Samuel']
const FIRST_NAMES_F = ['Maria', 'Ana', 'Carmen', 'Luisa', 'Elena', 'Rosa', 'Teresa', 'Alicia', 'Patricia', 'Sonia']
const LAST_NAMES = ['Ndong', 'Nze', 'Obiang', 'Esono', 'Ela', 'Biyogo', 'Abaga', 'Okori', 'Mba', 'Nsue']

const DEPARTMENTS = ['CONSULTA_EXTERNA', 'URGENCIAS', 'MATERNIDAD', 'LABORATORIO', 'CIRUGIA', 'MEDICINA_INTERNA']
const CADRE_SPECIALTIES = {
  MEDICO: ['MEDICINA_GENERAL', 'PEDIATRIA', 'GINECOLOGIA', 'CIRUGIA', 'MEDICINA_INTERNA'],
  ENFERMERIA: ['ENFERMERIA_GENERAL', 'OBSTETRICA', 'PEDIATRICA'],
  TECNICO: ['LABORATORIO', 'RADIOLOGIA', 'FARMACIA'],
  APOYO: ['ADMINISTRATIVO', 'LOGISTICA', 'ADMISION']
}

const POSITION_TITLES = {
  MEDICO: ['Medico General', 'Medico Especialista'],
  ENFERMERIA: ['Enfermera', 'Enfermera Jefe'],
  TECNICO: ['Tecnico', 'Tecnico Senior'],
  APOYO: ['Administrativo', 'ApoyoLogistico']
}

const EMPLOYMENT_TYPES = [
  { value: 'PUBLICO', weight: 70 },
  { value: 'CONTRATO', weight: 25 },
  { value: 'COOPERACION', weight: 5 }
]

const STATUS_TYPES = [
  { value: 'ACTIVO', weight: 95 },
  { value: 'BAJA', weight: 2 },
  { value: 'TRASLADO', weight: 2 },
  { value: 'JUBILADO', weight: 1 }
]

const LICENSE_PREFIX = {
  MEDICO: 'GE-MED',
  ENFERMERIA: 'GE-ENF',
  TECNICO: 'GE-TEC'
}

function generateWorkers(records, facilities, seed = 20250108) {
  const rng = createRng(seed)
  const workers = []
  const assignments = []
  const history = []
  const credentials = []

  const facilityIds = facilities.map(fac => fac.facility_id)

  let workerSeq = 1
  let assignmentSeq = 1
  let historySeq = 1
  let credentialSeq = 1

  function addWorkerForFacility(facilityId, cadre) {
    const sex = rng() < 0.5 ? 'M' : 'F'
    const first = sex === 'M' ? pick(rng, FIRST_NAMES_M) : pick(rng, FIRST_NAMES_F)
    const last1 = pick(rng, LAST_NAMES)
    const last2 = pick(rng, LAST_NAMES)
    const fullName = `${first} ${last1} ${last2}`
    const dobYear = 1965 + Math.floor(rng() * 25)
    const dobMonth = pad(1 + Math.floor(rng() * 12), 2)
    const dobDay = pad(1 + Math.floor(rng() * 28), 2)
    const specialty = pick(rng, CADRE_SPECIALTIES[cadre] || ['GENERAL'])
    const employmentType = weightedPick(rng, EMPLOYMENT_TYPES)
    const status = weightedPick(rng, STATUS_TYPES)
    const workerId = `HW_${pad(workerSeq++, 6)}`
    const licensePrefix = LICENSE_PREFIX[cadre]
    const licenseNumber = licensePrefix ? `${licensePrefix}-${pad(Math.floor(rng() * 99999), 5)}` : null

    workers.push({
      worker_id: workerId,
      full_name: fullName,
      sex,
      dob: `${dobYear}-${dobMonth}-${dobDay}`,
      nationality: 'Guinea Ecuatorial',
      cadre,
      specialty,
      license_number: licenseNumber,
      employment_type: employmentType,
      status,
      contact: {
        phone: `+240${pad(600000000 + Math.floor(rng() * 199999999), 9)}`,
        email: `${first.toLowerCase()}.${last1.toLowerCase()}@sigesalud.ge`
      }
    })

    assignments.push({
      assignment_id: `ASG_${pad(assignmentSeq++, 6)}`,
      worker_id: workerId,
      facility_id: facilityId,
      position_title: pick(rng, POSITION_TITLES[cadre] || ['Personal']),
      department: pick(rng, DEPARTMENTS),
      start_date: `${2021 + Math.floor(rng() * 4)}-${pad(1 + Math.floor(rng() * 12), 2)}-${pad(1 + Math.floor(rng() * 28), 2)}`,
      end_date: null,
      fte: rng() < 0.1 ? 0.5 : 1.0
    })

    const historyEntries = Math.floor(rng() * 3)
    for (let i = 0; i < historyEntries; i++) {
      const prevFacility = pick(rng, facilityIds.filter(id => id !== facilityId))
      const startYear = 2016 + Math.floor(rng() * 4)
      const endYear = startYear + 1 + Math.floor(rng() * 2)
      history.push({
        history_id: `HIS_${pad(historySeq++, 6)}`,
        worker_id: workerId,
        facility_id: prevFacility,
        role: cadre === 'APOYO' ? 'Apoyo' : cadre === 'ENFERMERIA' ? 'Enfermeria' : cadre === 'MEDICO' ? 'Medico' : 'Tecnico',
        start_date: `${startYear}-${pad(1 + Math.floor(rng() * 12), 2)}-${pad(1 + Math.floor(rng() * 28), 2)}`,
        end_date: `${endYear}-${pad(1 + Math.floor(rng() * 12), 2)}-${pad(1 + Math.floor(rng() * 28), 2)}`,
        notes: 'Rotacion previa'
      })
    }

    credentials.push({
      credential_id: `CRD_${pad(credentialSeq++, 6)}`,
      worker_id: workerId,
      type: 'TITULO',
      name: cadre === 'MEDICO' ? 'Doctor en Medicina' : cadre === 'ENFERMERIA' ? 'Licenciatura en Enfermeria' : cadre === 'TECNICO' ? 'Tecnico Superior' : 'Administracion',
      institution: 'Universidad Nacional',
      country: 'Guinea Ecuatorial',
      date_awarded: `${2006 + Math.floor(rng() * 10)}-${pad(1 + Math.floor(rng() * 12), 2)}-${pad(1 + Math.floor(rng() * 28), 2)}`,
      expires_on: null
    })

    if (rng() < 0.25) {
      credentials.push({
        credential_id: `CRD_${pad(credentialSeq++, 6)}`,
        worker_id: workerId,
        type: 'CERTIFICACION',
        name: 'Certificacion en servicio',
        institution: 'Ministerio de Salud',
        country: 'Guinea Ecuatorial',
        date_awarded: `${2018 + Math.floor(rng() * 6)}-${pad(1 + Math.floor(rng() * 12), 2)}-${pad(1 + Math.floor(rng() * 28), 2)}`,
        expires_on: rng() < 0.3 ? `${2026 + Math.floor(rng() * 3)}-12-31` : null
      })
    }
  }

  records.forEach(record => {
    const facilityId = record.facility_id
    for (let i = 0; i < record.doctors; i++) addWorkerForFacility(facilityId, 'MEDICO')
    for (let i = 0; i < record.nurses; i++) addWorkerForFacility(facilityId, 'ENFERMERIA')
    for (let i = 0; i < record.technicians; i++) addWorkerForFacility(facilityId, 'TECNICO')
    for (let i = 0; i < record.support_staff; i++) addWorkerForFacility(facilityId, 'APOYO')
  })

  return { workers, assignments, history, credentials }
}

function run() {
  const staffAssignments = loadJson('staff_assignments.json')
  const facilitiesFull = loadJson('facilities.full.json')

  const { workers, assignments, history, credentials } = generateWorkers(
    staffAssignments.records || [],
    facilitiesFull.facilities || []
  )

  writeJson('hr.workers.json', { version: 'v1', workers })
  writeJson('hr.assignments.json', { version: 'v1', assignments })
  writeJson('hr.history.json', { version: 'v1', history })
  writeJson('hr.credentials.json', { version: 'v1', credentials })

  console.log(`HR seed generated: ${workers.length} workers, ${assignments.length} assignments`)
}

if (require.main === module) {
  run()
}
