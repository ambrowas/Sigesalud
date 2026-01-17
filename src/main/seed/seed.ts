import fs from 'fs'
import path from 'path'
import bcrypt from 'bcryptjs'
import initSqlJs, { Database } from 'sql.js'
import { app } from 'electron'

function getDbPath() {
  const userPath = app ? app.getPath('userData') : process.cwd()
  return path.join(userPath, 'sigesalud-demo.sqlite')
}

function getWasmPath() {
  return path.join(__dirname, '..', '..', '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm')
}

function createSchema(db: Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS facilities (
      facility_id TEXT PRIMARY KEY,
      name TEXT,
      region TEXT,
      province TEXT,
      district TEXT,
      city TEXT,
      facility_type TEXT,
      reference_level TEXT,
      ownership TEXT,
      services_json TEXT,
      contacts_json TEXT,
      address_note TEXT,
      data_quality_json TEXT
    );
    CREATE TABLE IF NOT EXISTS patients (
      patient_id TEXT PRIMARY KEY,
      full_name TEXT,
      sex TEXT,
      dob TEXT,
      district_id TEXT,
      municipality_id TEXT,
      facility_id TEXT
    );
    CREATE TABLE IF NOT EXISTS visits (
      visit_id TEXT PRIMARY KEY,
      patient_id TEXT,
      facility_id TEXT,
      date TEXT,
      service TEXT,
      diagnosis_id TEXT,
      diagnosis_code TEXT,
      outcome TEXT
    );
    CREATE TABLE IF NOT EXISTS alerts (
      alert_id TEXT PRIMARY KEY,
      date TEXT,
      type TEXT,
      severity TEXT,
      scope TEXT,
      scope_id TEXT,
      province_id TEXT,
      region TEXT,
      message TEXT
    );
    CREATE TABLE IF NOT EXISTS stock_catalog (
      item_id TEXT PRIMARY KEY,
      name TEXT,
      category TEXT,
      unit TEXT
    );
    CREATE TABLE IF NOT EXISTS stock_levels_monthly (
      facility_id TEXT,
      item_id TEXT,
      month TEXT,
      stock_on_hand INTEGER,
      min_level INTEGER,
      expiry_nearest TEXT
    );
    CREATE TABLE IF NOT EXISTS staff_assignments (
      facility_id TEXT PRIMARY KEY,
      doctors INTEGER,
      nurses INTEGER,
      technicians INTEGER,
      support_staff INTEGER,
      cooperation_program TEXT
    );
    CREATE TABLE IF NOT EXISTS health_workers (
      worker_id TEXT PRIMARY KEY,
      full_name TEXT,
      sex TEXT,
      dob TEXT,
      nationality TEXT,
      cadre TEXT,
      specialty TEXT,
      license_number TEXT,
      employment_type TEXT,
      cooperation_program TEXT,
      status TEXT,
      phone TEXT,
      email TEXT
    );
    CREATE TABLE IF NOT EXISTS worker_assignments (
      assignment_id TEXT PRIMARY KEY,
      worker_id TEXT,
      facility_id TEXT,
      position_title TEXT,
      department TEXT,
      start_date TEXT,
      end_date TEXT,
      fte REAL,
      shift_pattern TEXT
    );
    CREATE TABLE IF NOT EXISTS worker_history (
      history_id TEXT PRIMARY KEY,
      worker_id TEXT,
      facility_id TEXT,
      role TEXT,
      start_date TEXT,
      end_date TEXT,
      notes TEXT
    );
    CREATE TABLE IF NOT EXISTS worker_credentials (
      credential_id TEXT PRIMARY KEY,
      worker_id TEXT,
      type TEXT,
      name TEXT,
      institution TEXT,
      country TEXT,
      date_awarded TEXT,
      expires_on TEXT
    );
    CREATE TABLE IF NOT EXISTS epi_weekly (
      district_id TEXT,
      province_id TEXT,
      region TEXT,
      week INTEGER,
      week_start TEXT,
      disease_id TEXT,
      cases INTEGER
    );
    CREATE TABLE IF NOT EXISTS regions (
      region_id TEXT PRIMARY KEY,
      name TEXT
    );
    CREATE TABLE IF NOT EXISTS provinces (
      province_id TEXT PRIMARY KEY,
      name TEXT,
      region TEXT
    );
    CREATE TABLE IF NOT EXISTS districts (
      district_id TEXT PRIMARY KEY,
      name TEXT,
      province_id TEXT,
      region TEXT
    );
    CREATE TABLE IF NOT EXISTS municipalities (
      municipality_id TEXT PRIMARY KEY,
      name TEXT,
      district_id TEXT,
      province_id TEXT,
      region TEXT
    );
    CREATE TABLE IF NOT EXISTS diseases_catalog (
      disease_id TEXT PRIMARY KEY,
      name TEXT,
      icd_like TEXT
    );
    CREATE TABLE IF NOT EXISTS lab_daily_summary (
      facility_id TEXT,
      date TEXT,
      tests_ordered INTEGER,
      tests_completed INTEGER,
      avg_turnaround_hours REAL,
      rejected_samples INTEGER,
      tests_by_category_json TEXT
    );
    CREATE TABLE IF NOT EXISTS lab_disease_indicators (
      facility_id TEXT,
      date TEXT,
      disease_id TEXT,
      test_type TEXT,
      total_tested INTEGER,
      total_positive INTEGER
    );
    CREATE TABLE IF NOT EXISTS lab_alerts (
      alert_id TEXT PRIMARY KEY,
      date TEXT,
      type TEXT,
      severity TEXT,
      facility_id TEXT,
      message TEXT
    );
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      username TEXT,
      password TEXT,
      role TEXT,
      facility_id TEXT
    );
    CREATE TABLE IF NOT EXISTS clinical_notes (
      note_id TEXT PRIMARY KEY,
      encounter_id TEXT,
      patient_id TEXT,
      note_type TEXT,
      chief_complaint TEXT,
      subjective TEXT,
      objective TEXT,
      assessment TEXT,
      plan TEXT,
      created_at TEXT,
      created_by TEXT,
      is_signed INTEGER
    );
    CREATE TABLE IF NOT EXISTS vitals (
      vital_id TEXT PRIMARY KEY,
      encounter_id TEXT,
      bp_sys INTEGER,
      bp_dia INTEGER,
      temp_c REAL,
      hr INTEGER,
      rr INTEGER,
      spo2 INTEGER,
      weight_kg REAL,
      height_cm REAL
    );

    CREATE INDEX IF NOT EXISTS idx_health_workers_cadre_status
      ON health_workers(cadre, status);
    CREATE INDEX IF NOT EXISTS idx_worker_assignments_facility_dept_end
      ON worker_assignments(facility_id, department, end_date);
    CREATE INDEX IF NOT EXISTS idx_worker_history_worker
      ON worker_history(worker_id);
    CREATE INDEX IF NOT EXISTS idx_worker_credentials_worker_expires
      ON worker_credentials(worker_id, expires_on);
    CREATE INDEX IF NOT EXISTS idx_lab_summary_facility_date
      ON lab_daily_summary(facility_id, date);
    CREATE INDEX IF NOT EXISTS idx_lab_indicators_disease_date
      ON lab_disease_indicators(disease_id, date);
    CREATE INDEX IF NOT EXISTS idx_lab_alerts_date
      ON lab_alerts(date);
  `)
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

async function seed() {
  const dbPath = getDbPath()
  const raw = fs.readFileSync(path.join(__dirname, 'seed-data.json'), 'utf8')
  const data = JSON.parse(raw)
  const localFullRoot = path.join(__dirname, 'data_full')
  const localHrRoot = path.join(__dirname, 'hr')
  const localLegacyHrRoot = path.join(__dirname, 'data_full_hr')
  const downloadsRoot = path.join(process.env.USERPROFILE ?? '', 'Downloads', 'SIGESALUD-GE_full_dataset_v1')
  const candidateRoots = [process.env.SIGESALUD_DATA_ROOT, downloadsRoot, localFullRoot].filter(
    (root): root is string => Boolean(root)
  )
  const fullRoot = candidateRoots.find(root => fs.existsSync(path.join(root, 'seed.config.json')))
  const hasFullData = Boolean(fullRoot)
  const candidateHrRoots = [
    process.env.SIGESALUD_DATA_ROOT ? path.join(process.env.SIGESALUD_DATA_ROOT, 'hr') : null,
    fullRoot ? path.join(fullRoot, 'hr') : null,
    localHrRoot,
    localLegacyHrRoot
  ].filter((root): root is string => Boolean(root))
  const hrRoot = candidateHrRoots.find(root => fs.existsSync(path.join(root, 'hr.workers.json')))

  const SQL = await initSqlJs({
    locateFile: () => getWasmPath()
  })
  const db = new SQL.Database()
  createSchema(db)

  if (hasFullData && fullRoot) {
    const facilitiesFull = JSON.parse(fs.readFileSync(path.join(fullRoot, 'facilities.full.json'), 'utf8'))
    const patientsFull = JSON.parse(fs.readFileSync(path.join(fullRoot, 'patients.json'), 'utf8'))
    const visitsFull = JSON.parse(fs.readFileSync(path.join(fullRoot, 'visits_2025.json'), 'utf8'))
    const alertsFull = JSON.parse(fs.readFileSync(path.join(fullRoot, 'alerts.generated.json'), 'utf8'))
    const stockCatalog = JSON.parse(fs.readFileSync(path.join(fullRoot, 'stock.catalog.json'), 'utf8'))
    const stockLevels = JSON.parse(fs.readFileSync(path.join(fullRoot, 'stock_levels_monthly_2025.json'), 'utf8'))
    const staffAssignments = JSON.parse(fs.readFileSync(path.join(fullRoot, 'staff_assignments.json'), 'utf8'))
    const epiWeekly = JSON.parse(fs.readFileSync(path.join(fullRoot, 'epi_weekly_2025.json'), 'utf8'))
    const regions = JSON.parse(fs.readFileSync(path.join(fullRoot, 'geo.regions.json'), 'utf8'))
    const provinces = JSON.parse(fs.readFileSync(path.join(fullRoot, 'geo.provinces.json'), 'utf8'))
    const districts = JSON.parse(fs.readFileSync(path.join(fullRoot, 'geo.districts.json'), 'utf8'))
    const municipalities = JSON.parse(fs.readFileSync(path.join(fullRoot, 'geo.municipalities.json'), 'utf8'))
    const diseasesCatalog = JSON.parse(fs.readFileSync(path.join(fullRoot, 'diseases.catalog.json'), 'utf8'))
    const labSummary = JSON.parse(fs.readFileSync(path.join(fullRoot, 'lab.summary.json'), 'utf8'))
    const labDisease = JSON.parse(fs.readFileSync(path.join(fullRoot, 'lab.disease.json'), 'utf8'))
    const labAlerts = JSON.parse(fs.readFileSync(path.join(fullRoot, 'lab.alerts.json'), 'utf8'))
    const hrWorkers = hrRoot ? JSON.parse(fs.readFileSync(path.join(hrRoot, 'hr.workers.json'), 'utf8')) : null
    const hrAssignments = hrRoot ? JSON.parse(fs.readFileSync(path.join(hrRoot, 'hr.assignments.json'), 'utf8')) : null
    const hrHistory = hrRoot ? JSON.parse(fs.readFileSync(path.join(hrRoot, 'hr.history.json'), 'utf8')) : null
    const hrCredentials = hrRoot ? JSON.parse(fs.readFileSync(path.join(hrRoot, 'hr.credentials.json'), 'utf8')) : null

    const insertFacility = db.prepare(`
      INSERT INTO facilities (
        facility_id, name, region, province, district, city, facility_type, reference_level,
        ownership, services_json, contacts_json, address_note, data_quality_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    for (const facility of facilitiesFull.facilities || []) {
      insertFacility.run([
        facility.facility_id,
        facility.name,
        facility.region,
        facility.province,
        facility.district,
        facility.city,
        facility.facility_type,
        facility.reference_level,
        facility.ownership,
        JSON.stringify(facility.services ?? []),
        JSON.stringify(facility.contacts ?? {}),
        facility.address_note ?? null,
        JSON.stringify(facility.data_quality ?? {})
      ])
    }
    insertFacility.free()

    if (hrWorkers) {
      const insertWorker = db.prepare(`
        INSERT INTO health_workers (
          worker_id, full_name, sex, dob, nationality, cadre, specialty, license_number,
          employment_type, cooperation_program, status, phone, email
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      for (const worker of hrWorkers.workers || []) {
        insertWorker.run([
          worker.worker_id,
          worker.full_name,
          worker.sex ?? null,
          worker.dob ?? null,
          worker.nationality ?? null,
          worker.cadre ?? null,
          worker.specialty ?? null,
          worker.license_number ?? null,
          worker.employment_type ?? null,
          worker.cooperation_program ?? null,
          worker.status ?? null,
          worker.contact?.phone ?? null,
          worker.contact?.email ?? null
        ])
      }
      insertWorker.free()
    }

    if (hrAssignments) {
      const insertAssignment = db.prepare(`
        INSERT INTO worker_assignments (
          assignment_id, worker_id, facility_id, position_title, department,
          start_date, end_date, fte, shift_pattern
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      for (const assignment of hrAssignments.assignments || []) {
        insertAssignment.run([
          assignment.assignment_id,
          assignment.worker_id,
          assignment.facility_id,
          assignment.position_title ?? null,
          assignment.department ?? null,
          assignment.start_date ?? null,
          assignment.end_date ?? null,
          assignment.fte ?? null,
          assignment.shift_pattern ?? null
        ])
      }
      insertAssignment.free()
    }

    if (hrHistory) {
      const insertHistory = db.prepare(`
        INSERT INTO worker_history (
          history_id, worker_id, facility_id, role, start_date, end_date, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      for (const history of hrHistory.history || []) {
        insertHistory.run([
          history.history_id,
          history.worker_id,
          history.facility_id,
          history.role ?? null,
          history.start_date ?? null,
          history.end_date ?? null,
          history.notes ?? null
        ])
      }
      insertHistory.free()
    }

    if (hrCredentials) {
      const insertCredential = db.prepare(`
        INSERT INTO worker_credentials (
          credential_id, worker_id, type, name, institution, country, date_awarded, expires_on
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)
      for (const credential of hrCredentials.credentials || []) {
        insertCredential.run([
          credential.credential_id,
          credential.worker_id,
          credential.type ?? null,
          credential.name ?? null,
          credential.institution ?? null,
          credential.country ?? null,
          credential.date_awarded ?? null,
          credential.expires_on ?? null
        ])
      }
      insertCredential.free()
    }

    const insertPatient = db.prepare(`
      INSERT INTO patients (patient_id, full_name, sex, dob, district_id, municipality_id, facility_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    for (const patient of patientsFull.patients || []) {
      insertPatient.run([
        patient.patient_id,
        patient.full_name,
        patient.sex,
        patient.dob,
        patient.district_id ?? null,
        patient.municipality_id ?? null,
        patient.facility_id ?? null
      ])
    }
    insertPatient.free()

    const insertVisit = db.prepare(`
      INSERT INTO visits (visit_id, patient_id, facility_id, date, service, diagnosis_id, diagnosis_code, outcome)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
    for (const visit of visitsFull.visits || []) {
      insertVisit.run([
        visit.visit_id,
        visit.patient_id,
        visit.facility_id,
        visit.date,
        visit.service,
        visit.diagnosis_id ?? null,
        visit.diagnosis_code ?? null,
        visit.outcome ?? null
      ])
    }
    insertVisit.free()

    const insertNote = db.prepare(`
      INSERT INTO clinical_notes (
        note_id, encounter_id, patient_id, note_type, chief_complaint, subjective, objective, assessment, plan,
        created_at, created_by, is_signed
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    const insertVitals = db.prepare(`
      INSERT INTO vitals (
        vital_id, encounter_id, bp_sys, bp_dia, temp_c, hr, rr, spo2, weight_kg, height_cm
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    for (const visit of visitsFull.visits || []) {
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

      notes.forEach((note, idx) => {
        const createdAt = `${visit.date}T0${8 + (base % 4)}:00:00Z`
        insertNote.run([
          `NOTE_${visit.visit_id}_${idx + 1}`,
          visit.visit_id,
          visit.patient_id,
          note.type,
          template.chief,
          `${template.chief}. ${note.suffix}.`,
          `TA normal, sin signos de alarma. Servicio: ${visit.service}.`,
          template.assessment,
          template.plan,
          createdAt,
          'system_seed',
          1
        ])
      })

      if (base < 65) {
        const h1 = stableHash(`${visit.visit_id}_bp`)
        const h2 = stableHash(`${visit.visit_id}_temp`)
        const h3 = stableHash(`${visit.visit_id}_hr`)
        const h4 = stableHash(`${visit.visit_id}_rr`)
        const h5 = stableHash(`${visit.visit_id}_spo2`)
        const h6 = stableHash(`${visit.visit_id}_wt`)
        const h7 = stableHash(`${visit.visit_id}_ht`)
        insertVitals.run([
          `VITAL_${visit.visit_id}`,
          visit.visit_id,
          100 + (h1 % 35),
          60 + (h1 % 20),
          Number((36 + (h2 % 30) / 10).toFixed(1)),
          60 + (h3 % 45),
          12 + (h4 % 8),
          92 + (h5 % 7),
          Number((50 + (h6 % 45)).toFixed(1)),
          150 + (h7 % 35)
        ])
      }
    }

    insertNote.free()
    insertVitals.free()

    const insertAlert = db.prepare(`
      INSERT INTO alerts (alert_id, date, type, severity, scope, scope_id, province_id, region, message)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    for (const alert of alertsFull.alerts || []) {
      insertAlert.run([
        alert.alert_id,
        alert.date,
        alert.type,
        alert.severity,
        alert.scope,
        alert.scope_id,
        alert.province_id ?? null,
        alert.region,
        alert.message
      ])
    }
    insertAlert.free()

    const insertStockCatalog = db.prepare(`
      INSERT INTO stock_catalog (item_id, name, category, unit)
      VALUES (?, ?, ?, ?)
    `)
    for (const item of stockCatalog || []) {
      insertStockCatalog.run([item.item_id, item.name, item.category, item.unit])
    }
    insertStockCatalog.free()

    const insertStockLevel = db.prepare(`
      INSERT INTO stock_levels_monthly (facility_id, item_id, month, stock_on_hand, min_level, expiry_nearest)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    for (const record of stockLevels.records || []) {
      insertStockLevel.run([
        record.facility_id,
        record.item_id,
        record.month,
        record.stock_on_hand,
        record.min_level,
        record.expiry_nearest
      ])
    }
    insertStockLevel.free()

    const insertStaff = db.prepare(`
      INSERT INTO staff_assignments (facility_id, doctors, nurses, technicians, support_staff, cooperation_program)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    for (const record of staffAssignments.records || []) {
      insertStaff.run([
        record.facility_id,
        record.doctors,
        record.nurses,
        record.technicians,
        record.support_staff,
        record.cooperation_program ?? null
      ])
    }
    insertStaff.free()

    const insertEpi = db.prepare(`
      INSERT INTO epi_weekly (district_id, province_id, region, week, week_start, disease_id, cases)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    for (const record of epiWeekly.records || []) {
      insertEpi.run([
        record.district_id,
        record.province_id,
        record.region,
        record.week,
        record.week_start,
        record.disease_id,
        record.cases
      ])
    }
    insertEpi.free()

    const insertRegion = db.prepare(`INSERT INTO regions (region_id, name) VALUES (?, ?)`)
    for (const row of regions || []) insertRegion.run([row.region_id, row.name])
    insertRegion.free()

    const insertProvince = db.prepare(`INSERT INTO provinces (province_id, name, region) VALUES (?, ?, ?)`)
    for (const row of provinces || []) insertProvince.run([row.province_id, row.name, row.region])
    insertProvince.free()

    const insertDistrict = db.prepare(`INSERT INTO districts (district_id, name, province_id, region) VALUES (?, ?, ?, ?)`)
    for (const row of districts || []) insertDistrict.run([row.district_id, row.name, row.province_id, row.region])
    insertDistrict.free()

    const insertMunicipality = db.prepare(`
      INSERT INTO municipalities (municipality_id, name, district_id, province_id, region)
      VALUES (?, ?, ?, ?, ?)
    `)
    for (const row of municipalities || []) {
      insertMunicipality.run([row.municipality_id, row.name, row.district_id, row.province_id, row.region])
    }
    insertMunicipality.free()

    const insertDisease = db.prepare(`INSERT INTO diseases_catalog (disease_id, name, icd_like) VALUES (?, ?, ?)`)
    for (const row of diseasesCatalog || []) insertDisease.run([row.disease_id, row.name, row.icd_like ?? null])
    insertDisease.free()

    const insertLabSummary = db.prepare(`
      INSERT INTO lab_daily_summary (
        facility_id, date, tests_ordered, tests_completed, avg_turnaround_hours, rejected_samples, tests_by_category_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    for (const row of labSummary.records || []) {
      insertLabSummary.run([
        row.facility_id,
        row.date,
        row.tests_ordered,
        row.tests_completed,
        row.avg_turnaround_hours,
        row.rejected_samples,
        JSON.stringify(row.tests_by_category ?? {})
      ])
    }
    insertLabSummary.free()

    const insertLabDisease = db.prepare(`
      INSERT INTO lab_disease_indicators (
        facility_id, date, disease_id, test_type, total_tested, total_positive
      ) VALUES (?, ?, ?, ?, ?, ?)
    `)
    for (const row of labDisease.records || []) {
      insertLabDisease.run([
        row.facility_id,
        row.date,
        row.disease_id,
        row.test_type,
        row.total_tested,
        row.total_positive
      ])
    }
    insertLabDisease.free()

    const insertLabAlert = db.prepare(`
      INSERT INTO lab_alerts (alert_id, date, type, severity, facility_id, message)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    for (const row of labAlerts.alerts || []) {
      insertLabAlert.run([
        row.alert_id,
        row.date,
        row.type,
        row.severity,
        row.facility_id ?? null,
        row.message
      ])
    }
    insertLabAlert.free()
  } else {
    const facilitiesRaw = fs.readFileSync(path.join(__dirname, 'reference', 'facilities.base.json'), 'utf8')
    const facilitiesBase = JSON.parse(facilitiesRaw)
    const insertFacility = db.prepare(`
      INSERT INTO facilities (
        facility_id, name, region, province, district, city, facility_type, reference_level,
        ownership, services_json, contacts_json, address_note, data_quality_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    for (const f of data.facilities) {
      insertFacility.run([
        `LEGACY_${f.id}`,
        f.name,
        f.region,
        null,
        null,
        null,
        null,
        null,
        null,
        JSON.stringify([]),
        JSON.stringify({}),
        null,
        JSON.stringify({ missing: ['province', 'district', 'city', 'facility_type', 'ownership'] })
      ])
    }
    for (const facility of facilitiesBase.facilities || []) {
      insertFacility.run([
        facility.facility_id,
        facility.name,
        facility.region,
        facility.province ?? null,
        facility.district ?? null,
        facility.city ?? null,
        facility.facility_type ?? null,
        facility.reference_level ?? null,
        facility.ownership ?? null,
        JSON.stringify(facility.services ?? []),
        JSON.stringify(facility.contacts ?? {}),
        facility.address_note ?? null,
        JSON.stringify(facility.data_quality ?? {})
      ])
    }
    insertFacility.free()

    const insertPatient = db.prepare(`
      INSERT INTO patients (patient_id, full_name, sex, dob, district_id, municipality_id, facility_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    for (let i = 1; i <= 50; i++) {
      insertPatient.run([`PAT_DEMO_${i}`, `Paciente ${i}`, i % 2 === 0 ? 'F' : 'M', '1990-01-01', null, null, null])
    }
    insertPatient.free()

    const insertVisit = db.prepare(`
      INSERT INTO visits (visit_id, patient_id, facility_id, date, service, diagnosis_id, diagnosis_code, outcome)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
    for (let i = 0; i < 200; i++) {
      insertVisit.run([
        `VIS_DEMO_${i}`,
        `PAT_DEMO_${(i % 50) + 1}`,
        `LEGACY_${(i % 3) + 1}`,
        new Date(Date.now() - i * 864000).toISOString().slice(0, 10),
        'CONSULTA',
        null,
        null,
        'ALTA'
      ])
    }
    insertVisit.free()

    const insertAlert = db.prepare(`
      INSERT INTO alerts (alert_id, date, type, severity, scope, scope_id, province_id, region, message)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    insertAlert.run(['ALERT_DEMO_1', new Date().toISOString().slice(0, 10), 'BROTE', 'ALTA', 'FACILITY', 'LEGACY_3', null, null, 'Incremento de casos febriles (demo)'])
    insertAlert.free()
  }

  const insertUser = db.prepare('INSERT INTO users (id, username, password, role, facility_id) VALUES (?, ?, ?, ?, ?)')
  for (const u of data.users) {
    insertUser.run([
      Date.now() + Math.floor(Math.random() * 1000),
      u.username,
      bcrypt.hashSync(u.password, 8),
      u.role,
      u.facility_id
    ])
  }
  insertUser.free()

  const fileBuffer = Buffer.from(db.export())
  fs.writeFileSync(dbPath, fileBuffer)
  db.close()
  console.log('Seeded sqlite db at', dbPath)
}

if (require.main === module) {
  seed().catch(err => {
    console.error(err)
    process.exit(1)
  })
}
