import fs from 'fs'
import path from 'path'
import initSqlJs, { Database } from 'sql.js'
import { app } from 'electron'

const DB_FILE = 'sigesalud-demo.sqlite'
let sqlPromise: Promise<ReturnType<typeof initSqlJs>> | null = null
let dbInstance: Database | null = null
let facilityMapPosCache: Record<string, { zone: string; x: number; y: number }> | null = null

function dbPath() {
  const appPath = app?.getAppPath?.() ?? process.cwd()
  const localPath = path.join(appPath, DB_FILE)
  if (fs.existsSync(localPath)) return localPath
  const userPath = app ? app.getPath('userData') : process.cwd()
  return path.join(userPath, DB_FILE)
}

function getWasmPath() {
  const appPath = app?.getAppPath?.() ?? process.cwd()
  return path.join(appPath, 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm')
}

function findFullDataRoot() {
  const appPath = app?.getAppPath?.() ?? process.cwd()
  const localFullRoot = path.join(appPath, 'src', 'main', 'seed', 'data_full')
  const distFullRoot = path.join(__dirname, '..', 'seed', 'data_full')
  const downloadsRoot = path.join(process.env.USERPROFILE ?? '', 'Downloads', 'SIGESALUD-GE_full_dataset_v1')
  const candidateRoots = [process.env.SIGESALUD_DATA_ROOT, downloadsRoot, localFullRoot, distFullRoot].filter(
    (root): root is string => Boolean(root)
  )
  return candidateRoots.find(root => fs.existsSync(path.join(root, 'seed.config.json')))
}

function loadFacilityMapPositions() {
  if (facilityMapPosCache) return facilityMapPosCache
  const fullRoot = findFullDataRoot()
  if (!fullRoot) {
    facilityMapPosCache = {}
    return facilityMapPosCache
  }
  const filePath = path.join(fullRoot, 'facilities.full.json')
  if (!fs.existsSync(filePath)) {
    facilityMapPosCache = {}
    return facilityMapPosCache
  }
  const raw = fs.readFileSync(filePath, 'utf8')
  const data = JSON.parse(raw)
  const map: Record<string, { zone: string; x: number; y: number }> = {}
  for (const facility of data.facilities || []) {
    if (facility.facility_id && facility.map_pos) {
      map[facility.facility_id] = facility.map_pos
    }
  }
  facilityMapPosCache = map
  return map
}

function ensureFacilityMapPosColumn(db: Database) {
  const result = db.exec('PRAGMA table_info(facilities)')
  const columns = result[0]?.values ?? []
  const hasColumn = columns.some(row => row[1] === 'map_pos_json')
  if (!hasColumn) {
    db.exec('ALTER TABLE facilities ADD COLUMN map_pos_json TEXT')
  }
}

async function getSql() {
  if (!sqlPromise) {
    sqlPromise = initSqlJs({
      locateFile: () => getWasmPath()
    })
  }
  return sqlPromise
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
      data_quality_json TEXT,
      map_pos_json TEXT
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

async function getDb() {
  if (dbInstance) return dbInstance
  const SQL = await getSql()
  const filePath = dbPath()
  if (fs.existsSync(filePath)) {
    const data = fs.readFileSync(filePath)
    dbInstance = new SQL.Database(new Uint8Array(data))
  } else {
    dbInstance = new SQL.Database()
    createSchema(dbInstance)
    fs.writeFileSync(filePath, Buffer.from(dbInstance.export()))
  }
  return dbInstance
}

export async function initializeDbIfNeeded() {
  const db = await getDb()
  createSchema(db)
  ensureFacilityMapPosColumn(db)
}

function selectAll(db: Database, sql: string, params: Array<string | number | null> = []) {
  const stmt = db.prepare(sql)
  stmt.bind(params)
  const rows: Array<any> = []
  while (stmt.step()) {
    rows.push(stmt.getAsObject())
  }
  stmt.free()
  return rows
}

function selectOne(db: Database, sql: string, params: Array<string | number | null> = []) {
  const rows = selectAll(db, sql, params)
  return rows[0]
}

function toISODate(date: Date) {
  return date.toISOString().slice(0, 10)
}

function addDays(date: Date, days: number) {
  const copy = new Date(date)
  copy.setDate(copy.getDate() + days)
  return copy
}

export class DashboardService {
  async getSummary(
    period: 'hoy' | '7d' | '30d',
    filters?: { region?: string; type?: string; search?: string }
  ) {
    const db = await getDb()
    const maxRow = selectOne(db, 'SELECT MAX(date) as maxDate FROM visits') as { maxDate?: string }
    const endDate = maxRow?.maxDate || toISODate(new Date())
    const days = period === 'hoy' ? 0 : period === '7d' ? 6 : 29
    const startDate = toISODate(addDays(new Date(endDate), -days))

    const buildFacilityFilter = (alias?: string) => {
      const prefix = alias ? `${alias}.` : ''
      const where: string[] = []
      const params: Array<string | number> = []
      if (filters?.region) {
        where.push(`${prefix}region = ?`)
        params.push(filters.region)
      }
      if (filters?.type) {
        where.push(`${prefix}facility_type = ?`)
        params.push(filters.type)
      }
      if (filters?.search) {
        where.push(`(LOWER(${prefix}name) LIKE ? OR LOWER(${prefix}city) LIKE ? OR LOWER(${prefix}district) LIKE ?)`)
        const term = `%${filters.search.toLowerCase()}%`
        params.push(term, term, term)
      }
      return { where, params }
    }
    const visitFilters = buildFacilityFilter('f')
    const visitParams: Array<string | number> = [startDate, endDate, ...visitFilters.params]
    const facilityClause = visitFilters.where.length ? `AND ${visitFilters.where.join(' AND ')}` : ''

    const visitsRow = selectOne(
      db,
      `
      SELECT COUNT(*) as total
      FROM visits v
      LEFT JOIN facilities f ON f.facility_id = v.facility_id
      WHERE v.date BETWEEN ? AND ?
      ${facilityClause}`,
      visitParams
    )
    const visits = Number(visitsRow?.total ?? 0)
    const epiWhere: string[] = ['week_start BETWEEN ? AND ?']
    const epiParams: Array<string | number> = [startDate, endDate]
    if (filters?.region) {
      epiWhere.push('region = ?')
      epiParams.push(filters.region)
    }
    const suspectedRow = selectOne(
      db,
      `SELECT SUM(cases) as total FROM epi_weekly WHERE ${epiWhere.join(' AND ')}`,
      epiParams
    )
    let suspected = Number(suspectedRow?.total ?? 0)
    if (suspected === 0) {
      const fallback = Math.max(6, Math.round(visits * 0.08))
      suspected = fallback
    }
    const alertWhere: string[] = []
    const alertParams: Array<string | number> = []
    if (filters?.region) {
      alertWhere.push('(a.region = ? OR f.region = ?)')
      alertParams.push(filters.region, filters.region)
    }
    if (filters?.type) {
      alertWhere.push('f.facility_type = ?')
      alertParams.push(filters.type)
    }
    if (filters?.search) {
      alertWhere.push('(LOWER(f.name) LIKE ? OR LOWER(f.city) LIKE ? OR LOWER(f.district) LIKE ?)')
      const term = `%${filters.search.toLowerCase()}%`
      alertParams.push(term, term, term)
    }
    const alertClause = alertWhere.length ? `WHERE ${alertWhere.join(' AND ')}` : ''
    const alertsRow = selectOne(
      db,
      `
      SELECT COUNT(*) as total
      FROM alerts a
      LEFT JOIN facilities f ON f.facility_id = a.scope_id
      ${alertClause}`,
      alertParams
    )
    const alerts = Number(alertsRow?.total ?? 0)

    const latestMonthRow = selectOne(db, 'SELECT MAX(month) as latestMonth FROM stock_levels_monthly') as {
      latestMonth?: string
    }
    const latestMonth = latestMonthRow?.latestMonth
    let stockouts = 0
    if (latestMonth) {
      const stockParams: Array<string | number> = [latestMonth]
      const stockWhere: string[] = ['s.month = ?', 's.stock_on_hand <= s.min_level']
      if (filters?.region) {
        stockWhere.push('f.region = ?')
        stockParams.push(filters.region)
      }
      if (filters?.type) {
        stockWhere.push('f.facility_type = ?')
        stockParams.push(filters.type)
      }
      if (filters?.search) {
        stockWhere.push('(LOWER(f.name) LIKE ? OR LOWER(f.city) LIKE ? OR LOWER(f.district) LIKE ?)')
        const term = `%${filters.search.toLowerCase()}%`
        stockParams.push(term, term, term)
      }
      const stockRow = selectOne(
        db,
        `
        SELECT COUNT(DISTINCT s.facility_id) as total
        FROM stock_levels_monthly s
        LEFT JOIN facilities f ON f.facility_id = s.facility_id
        WHERE ${stockWhere.join(' AND ')}`,
        stockParams
      )
      stockouts = Number(stockRow?.total ?? 0)
    }

    const facilityFilters = buildFacilityFilter()
    const facilityRow = selectOne(
      db,
      `SELECT COUNT(*) as total FROM facilities ${facilityFilters.where.length ? `WHERE ${facilityFilters.where.join(' AND ')}` : ''}`,
      facilityFilters.params
    )
    const facilityCount = Number(facilityRow?.total ?? 0)
    const occupancyRate = facilityCount > 0 ? Math.min(95, Math.round((visits / (facilityCount * 35)) * 100)) : 0

    const mortalityRow = selectOne(
      db,
      `
      SELECT COUNT(*) as total
      FROM visits v
      LEFT JOIN facilities f ON f.facility_id = v.facility_id
      WHERE v.outcome LIKE '%DEF%' AND v.date BETWEEN ? AND ?
      ${facilityClause}`,
      visitParams
    )
    const mortality = Number(mortalityRow?.total ?? 0)
    const mortalityRate = visits > 0 ? Math.round((mortality / visits) * 100) : 0

    return {
      visits,
      suspected,
      alerts,
      occupancyRate,
      stockouts,
      mortalityRate,
      startDate,
      endDate
    }
  }
}

export class FacilityService {
  async listFacilities(filters: { region?: string; type?: string; search?: string }) {
    const db = await getDb()
    const where: string[] = []
    const params: Array<string> = []
    const mapPosLookup = loadFacilityMapPositions()

    if (filters.region && filters.region !== 'todas') {
      where.push('region = ?')
      params.push(filters.region)
    }
    if (filters.type && filters.type !== 'todas') {
      where.push('facility_type = ?')
      params.push(filters.type)
    }
    if (filters.search) {
      where.push('(LOWER(name) LIKE ? OR LOWER(city) LIKE ? OR LOWER(district) LIKE ?)')
      const term = `%${filters.search.toLowerCase()}%`
      params.push(term, term, term)
    }

    const clause = where.length ? `WHERE ${where.join(' AND ')}` : ''
    const rows = selectAll(db, `SELECT * FROM facilities ${clause} ORDER BY name`, params)
    return rows.map(row => ({
      ...row,
      services: row.services_json ? JSON.parse(row.services_json as string) : [],
      contacts: row.contacts_json ? JSON.parse(row.contacts_json as string) : {},
      data_quality: row.data_quality_json ? JSON.parse(row.data_quality_json as string) : {},
      map_pos: row.map_pos_json
        ? JSON.parse(row.map_pos_json as string)
        : mapPosLookup[String(row.facility_id)] ?? null
    }))
  }
}

export class EpidemiologyService {
  async listDiseases() {
    const db = await getDb()
    return selectAll(
      db,
      `
      SELECT d.disease_id, d.name
      FROM diseases_catalog d
      ORDER BY d.name ASC`
    )
  }

  async getTrend(diseaseId: string, weeks = 8) {
    const db = await getDb()
    const rows = selectAll(
      db,
      `SELECT week_start, SUM(cases) as cases
       FROM epi_weekly
       WHERE disease_id = ?
       GROUP BY week_start
       ORDER BY week_start DESC
       LIMIT ?`,
      [diseaseId, weeks]
    )
    if (rows.length > 0) return rows.reverse()
    const today = new Date()
    const mock: Array<{ week_start: string; cases: number }> = []
    for (let i = weeks - 1; i >= 0; i--) {
      const weekDate = addDays(today, -(i * 7))
      const seed = `${diseaseId}-${toISODate(weekDate)}`
      const base = seed.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0)
      mock.push({ week_start: toISODate(weekDate), cases: 5 + (base % 40) })
    }
    return mock
  }

  async getRanking(diseaseId: string, limit = 8) {
    const db = await getDb()
    const rows = selectAll(
      db,
      `SELECT district_id, province_id, region, SUM(cases) as cases
       FROM epi_weekly
       WHERE disease_id = ?
       GROUP BY district_id, province_id, region
       ORDER BY cases DESC
       LIMIT ?`,
      [diseaseId, limit]
    )
    if (rows.length > 0) return rows
    const districts = selectAll(
      db,
      `SELECT district_id, province_id, region
       FROM districts
       ORDER BY district_id
       LIMIT ?`,
      [limit]
    )
    return districts.map((row: any) => {
      const seed = `${diseaseId}-${row.district_id}`
      const base = seed.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0)
      return { ...row, cases: 10 + (base % 120) }
    })
  }
}

export class PharmacyService {
  async getSummary() {
    const db = await getDb()
    const latestMonthRow = selectOne(db, 'SELECT MAX(month) as latestMonth FROM stock_levels_monthly') as {
      latestMonth?: string
    }
    const latestMonth = latestMonthRow?.latestMonth
    if (!latestMonth) {
      return { latestMonth: null, facilitiesCritical: 0, itemsCritical: 0 }
    }
    const facilitiesCritical = Number(
      selectOne(
        db,
        'SELECT COUNT(DISTINCT facility_id) as total FROM stock_levels_monthly WHERE month = ? AND stock_on_hand <= min_level',
        [latestMonth]
      )?.total ?? 0
    )
    const itemsCritical = Number(
      selectOne(
        db,
        'SELECT COUNT(*) as total FROM stock_levels_monthly WHERE month = ? AND stock_on_hand <= min_level',
        [latestMonth]
      )?.total ?? 0
    )
    return { latestMonth, facilitiesCritical, itemsCritical }
  }

  async listCritical(limit = 30) {
    const db = await getDb()
    const latestMonthRow = selectOne(db, 'SELECT MAX(month) as latestMonth FROM stock_levels_monthly') as {
      latestMonth?: string
    }
    const latestMonth = latestMonthRow?.latestMonth
    if (!latestMonth) return []
    return selectAll(
      db,
      `SELECT stock_levels_monthly.facility_id,
              facilities.name as facility_name,
              stock_levels_monthly.item_id,
              stock_catalog.name as item_name,
              stock_levels_monthly.stock_on_hand,
              stock_levels_monthly.min_level,
              stock_levels_monthly.expiry_nearest
       FROM stock_levels_monthly
       JOIN stock_catalog ON stock_catalog.item_id = stock_levels_monthly.item_id
       LEFT JOIN facilities ON facilities.facility_id = stock_levels_monthly.facility_id
       WHERE stock_levels_monthly.month = ? AND stock_levels_monthly.stock_on_hand <= stock_levels_monthly.min_level
       ORDER BY stock_levels_monthly.stock_on_hand ASC
       LIMIT ?`,
      [latestMonth, limit]
    )
  }
}

export class PatientService {
  async listPatients(filters: { search?: string; sex?: string; limit?: number; offset?: number }) {
    const db = await getDb()
    const where: string[] = []
    const params: Array<string | number> = []

    if (filters.search) {
      where.push('(LOWER(p.full_name) LIKE ? OR LOWER(p.patient_id) LIKE ?)')
      const term = `%${filters.search.toLowerCase()}%`
      params.push(term, term)
    }
    if (filters.sex) {
      where.push('p.sex = ?')
      params.push(filters.sex)
    }

    const clause = where.length ? `WHERE ${where.join(' AND ')}` : ''
    const totalRow = selectOne(
      db,
      `SELECT COUNT(*) as total FROM patients p ${clause}`,
      params
    ) as { total?: number }
    const total = Number(totalRow?.total ?? 0)

    const limit = Number.isFinite(filters.limit) ? Number(filters.limit) : 20
    const offset = Number.isFinite(filters.offset) ? Number(filters.offset) : 0
    const rows = selectAll(
      db,
      `
      SELECT
        p.patient_id,
        p.full_name,
        p.sex,
        p.dob,
        p.facility_id,
        f.name as facility_name,
        (SELECT COUNT(*) FROM visits v WHERE v.patient_id = p.patient_id) as visits_count,
        (SELECT MAX(date) FROM visits v WHERE v.patient_id = p.patient_id) as last_visit
      FROM patients p
      LEFT JOIN facilities f ON f.facility_id = p.facility_id
      ${clause}
      ORDER BY p.full_name
      LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    )

    return { total, rows }
  }

  async getTimeline(patientId: string, limit = 25) {
    const db = await getDb()
    return selectAll(
      db,
      `
      SELECT
        v.visit_id,
        v.date,
        v.service,
        v.diagnosis_id,
        v.diagnosis_code,
        v.outcome,
        v.facility_id,
        f.name as facility_name
      FROM visits v
      LEFT JOIN facilities f ON f.facility_id = v.facility_id
      WHERE v.patient_id = ?
      ORDER BY v.date DESC
      LIMIT ?`,
      [patientId, limit]
    )
  }
}

export class EncounterService {
  async getDetail(encounterId: string) {
    const db = await getDb()
    const encounter = selectOne(
      db,
      `
      SELECT
        v.visit_id,
        v.patient_id,
        v.facility_id,
        f.name as facility_name,
        v.date,
        v.service,
        v.diagnosis_id,
        v.diagnosis_code,
        v.outcome
      FROM visits v
      LEFT JOIN facilities f ON f.facility_id = v.facility_id
      WHERE v.visit_id = ?`,
      [encounterId]
    )
    const notes = selectAll(
      db,
      `
      SELECT
        note_id,
        encounter_id,
        patient_id,
        note_type,
        chief_complaint,
        subjective,
        objective,
        assessment,
        plan,
        created_at,
        created_by,
        is_signed
      FROM clinical_notes
      WHERE encounter_id = ?
      ORDER BY created_at ASC`,
      [encounterId]
    )
    const vitals = selectOne(
      db,
      `
      SELECT
        vital_id,
        encounter_id,
        bp_sys,
        bp_dia,
        temp_c,
        hr,
        rr,
        spo2,
        weight_kg,
        height_cm
      FROM vitals
      WHERE encounter_id = ?`,
      [encounterId]
    )
    return { encounter, notes, vitals }
  }
}

export class HrService {
  private scopeWhere(scope?: { level?: 'national' | 'province' | 'district'; id?: string }) {
    if (!scope || scope.level === 'national') {
      return { clause: '', params: [] as Array<string | number> }
    }
    if (scope.level === 'province' && scope.id) {
      return { clause: 'WHERE f.province = ?', params: [scope.id] }
    }
    if (scope.level === 'district' && scope.id) {
      return { clause: 'WHERE f.district = ?', params: [scope.id] }
    }
    return { clause: '', params: [] as Array<string | number> }
  }

  async listWorkers(filters: {
    search?: string
    cadre?: string
    status?: string
    facilityId?: string
    province?: string
    district?: string
    employmentType?: string
  }) {
    const db = await getDb()
    const where: string[] = []
    const params: Array<string | number> = []

    if (filters.search) {
      where.push('(LOWER(w.full_name) LIKE ? OR LOWER(w.worker_id) LIKE ? OR LOWER(w.license_number) LIKE ?)')
      const term = `%${filters.search.toLowerCase()}%`
      params.push(term, term, term)
    }
    if (filters.cadre) {
      where.push('w.cadre = ?')
      params.push(filters.cadre)
    }
    if (filters.status) {
      where.push('w.status = ?')
      params.push(filters.status)
    }
    if (filters.employmentType) {
      where.push('w.employment_type = ?')
      params.push(filters.employmentType)
    }
    if (filters.facilityId) {
      where.push('a.facility_id = ?')
      params.push(filters.facilityId)
    }
    if (filters.province) {
      where.push('f.province = ?')
      params.push(filters.province)
    }
    if (filters.district) {
      where.push('f.district = ?')
      params.push(filters.district)
    }

    const clause = where.length ? `WHERE ${where.join(' AND ')}` : ''
    const rows = selectAll(
      db,
      `
      SELECT
        w.*,
        a.assignment_id,
        a.facility_id,
        a.position_title,
        a.department,
        a.start_date,
        a.end_date,
        a.fte,
        a.shift_pattern,
        f.name as facility_name,
        f.province,
        f.district,
        f.region
      FROM health_workers w
      LEFT JOIN worker_assignments a ON a.worker_id = w.worker_id AND (a.end_date IS NULL OR a.end_date = '')
      LEFT JOIN facilities f ON f.facility_id = a.facility_id
      ${clause}
      ORDER BY w.full_name`,
      params
    )
    return rows.map(row => ({
      ...row,
      contact: { phone: row.phone ?? null, email: row.email ?? null }
    }))
  }

  async getWorker(workerId: string) {
    const db = await getDb()
    const row = selectOne(
      db,
      `
      SELECT
        w.*,
        a.assignment_id,
        a.facility_id,
        a.position_title,
        a.department,
        a.start_date,
        a.end_date,
        a.fte,
        a.shift_pattern,
        f.name as facility_name,
        f.province,
        f.district,
        f.region
      FROM health_workers w
      LEFT JOIN worker_assignments a ON a.worker_id = w.worker_id AND (a.end_date IS NULL OR a.end_date = '')
      LEFT JOIN facilities f ON f.facility_id = a.facility_id
      WHERE w.worker_id = ?`,
      [workerId]
    )
    if (!row) return null
    return {
      ...row,
      contact: { phone: row.phone ?? null, email: row.email ?? null }
    }
  }

  async getTimeline(workerId: string) {
    const db = await getDb()
    return selectAll(
      db,
      `
      SELECT history_id, worker_id, facility_id, role, start_date, end_date, notes
      FROM worker_history
      WHERE worker_id = ?
      ORDER BY start_date DESC`,
      [workerId]
    )
  }

  async listAssignments(workerId?: string | null) {
    const db = await getDb()
    const where = workerId ? 'WHERE worker_id = ?' : ''
    const params = workerId ? [workerId] : []
    return selectAll(
      db,
      `
      SELECT assignment_id, worker_id, facility_id, position_title, department,
             start_date, end_date, fte, shift_pattern
      FROM worker_assignments
      ${where}
      ORDER BY start_date DESC`,
      params
    )
  }

  async listHistory(workerId?: string | null) {
    const db = await getDb()
    const where = workerId ? 'WHERE worker_id = ?' : ''
    const params = workerId ? [workerId] : []
    return selectAll(
      db,
      `
      SELECT history_id, worker_id, facility_id, role, start_date, end_date, notes
      FROM worker_history
      ${where}
      ORDER BY start_date DESC`,
      params
    )
  }

  async listCredentials(workerId?: string | null) {
    const db = await getDb()
    const where = workerId ? 'WHERE worker_id = ?' : ''
    const params = workerId ? [workerId] : []
    return selectAll(
      db,
      `
      SELECT credential_id, worker_id, type, name, institution, country, date_awarded, expires_on
      FROM worker_credentials
      ${where}
      ORDER BY date_awarded DESC`,
      params
    )
  }

  async getFacilityStaff(facilityId: string, department?: string | null) {
    const db = await getDb()
    const where: string[] = ['a.facility_id = ?', '(a.end_date IS NULL OR a.end_date = \'\')']
    const params: Array<string> = [facilityId]
    if (department) {
      where.push('a.department = ?')
      params.push(department)
    }
    const clause = `WHERE ${where.join(' AND ')}`
    return selectAll(
      db,
      `
      SELECT
        w.worker_id,
        w.full_name,
        w.cadre,
        w.specialty,
        w.status,
        a.assignment_id,
        a.position_title,
        a.department,
        a.start_date,
        a.fte
      FROM worker_assignments a
      JOIN health_workers w ON w.worker_id = a.worker_id
      ${clause}
      ORDER BY a.department, w.full_name`,
      params
    )
  }

  async getKpis() {
    return this.getKpisByScope({ level: 'national' })
  }

  async getKpisByScope(scope?: { level?: 'national' | 'province' | 'district'; id?: string }) {
    const db = await getDb()
    const { clause, params } = this.scopeWhere(scope)

    const totalRow = selectOne(
      db,
      `
      SELECT COUNT(*) as total
      FROM health_workers w
      LEFT JOIN worker_assignments a ON a.worker_id = w.worker_id AND (a.end_date IS NULL OR a.end_date = '')
      LEFT JOIN facilities f ON f.facility_id = a.facility_id
      ${clause}`,
      params
    ) as { total?: number }
    const activeRow = selectOne(
      db,
      `
      SELECT COUNT(*) as total
      FROM health_workers w
      LEFT JOIN worker_assignments a ON a.worker_id = w.worker_id AND (a.end_date IS NULL OR a.end_date = '')
      LEFT JOIN facilities f ON f.facility_id = a.facility_id
      ${clause ? `${clause} AND w.status = ?` : 'WHERE w.status = ?'}`,
      [...params, 'ACTIVO']
    ) as { total?: number }
    const cadreRows = selectAll(
      db,
      `
      SELECT w.cadre, COUNT(*) as total
      FROM health_workers w
      LEFT JOIN worker_assignments a ON a.worker_id = w.worker_id AND (a.end_date IS NULL OR a.end_date = '')
      LEFT JOIN facilities f ON f.facility_id = a.facility_id
      ${clause}
      GROUP BY w.cadre`,
      params
    )
    const byCadre: Record<string, number> = {}
    cadreRows.forEach(row => {
      if (!row.cadre) return
      byCadre[String(row.cadre)] = Number(row.total ?? 0)
    })
    return {
      total: Number(totalRow?.total ?? 0),
      active: Number(activeRow?.total ?? 0),
      byCadre,
      scope: scope?.level ?? 'national',
      scopeId: scope?.id ?? null
    }
  }

  async getFacilityStaffing(scope?: { level?: 'national' | 'province' | 'district'; id?: string }, limit = 20) {
    const db = await getDb()
    const { clause, params } = this.scopeWhere(scope)
    return selectAll(
      db,
      `
      SELECT
        sa.facility_id,
        f.name as facility_name,
        f.province,
        f.district,
        sa.doctors as required_doctors,
        sa.nurses as required_nurses,
        sa.technicians as required_technicians,
        COALESCE(SUM(CASE WHEN w.cadre = 'MEDICO' THEN 1 ELSE 0 END), 0) as actual_doctors,
        COALESCE(SUM(CASE WHEN w.cadre = 'ENFERMERIA' THEN 1 ELSE 0 END), 0) as actual_nurses,
        COALESCE(SUM(CASE WHEN w.cadre = 'TECNICO' THEN 1 ELSE 0 END), 0) as actual_technicians
      FROM staff_assignments sa
      LEFT JOIN facilities f ON f.facility_id = sa.facility_id
      LEFT JOIN worker_assignments a
        ON a.facility_id = sa.facility_id AND (a.end_date IS NULL OR a.end_date = '')
      LEFT JOIN health_workers w ON w.worker_id = a.worker_id
      ${clause}
      GROUP BY sa.facility_id
      ORDER BY (actual_doctors + actual_nurses + actual_technicians) DESC
      LIMIT ?`,
      [...params, limit]
    )
  }

  async getAlerts(scope?: { level?: 'national' | 'province' | 'district'; id?: string }) {
    const staffing = await this.getFacilityStaffing(scope, 200)
    const alerts: Array<{ severity: string; type: string; message: string; facility_id?: string; facility_name?: string }> = []

    staffing.forEach(row => {
      const requiredDoctors = Number(row.required_doctors ?? 0)
      const actualDoctors = Number(row.actual_doctors ?? 0)
      if (requiredDoctors > 0 && actualDoctors === 0) {
        alerts.push({
          severity: 'Alta',
          type: 'Centro sin medico',
          message: `Sin medicos asignados. Requeridos: ${requiredDoctors}.`,
          facility_id: row.facility_id,
          facility_name: row.facility_name
        })
      }

      const requiredNurses = Number(row.required_nurses ?? 0)
      const actualNurses = Number(row.actual_nurses ?? 0)
      if (requiredNurses > actualNurses) {
        const deficit = requiredNurses - actualNurses
        alerts.push({
          severity: deficit >= 5 ? 'Alta' : 'Media',
          type: 'Deficit de enfermeria',
          message: `Faltan ${deficit} enfermeras. Requeridas: ${requiredNurses}.`,
          facility_id: row.facility_id,
          facility_name: row.facility_name
        })
      }
    })

    const db = await getDb()
    const { clause, params } = this.scopeWhere(scope)
    const today = toISODate(new Date())
    const soon = toISODate(addDays(new Date(), 90))
    const expired = selectAll(
      db,
      `
      SELECT c.worker_id, c.name, c.expires_on, w.full_name, f.name as facility_name, f.facility_id
      FROM worker_credentials c
      JOIN health_workers w ON w.worker_id = c.worker_id
      LEFT JOIN worker_assignments a ON a.worker_id = w.worker_id AND (a.end_date IS NULL OR a.end_date = '')
      LEFT JOIN facilities f ON f.facility_id = a.facility_id
      ${clause ? `${clause} AND c.expires_on IS NOT NULL AND c.expires_on <= ?` : 'WHERE c.expires_on IS NOT NULL AND c.expires_on <= ?'}
      ORDER BY c.expires_on ASC
      LIMIT 50`,
      [...params, today]
    )
    expired.forEach(row => {
      alerts.push({
        severity: 'Alta',
        type: 'Certificacion vencida',
        message: `${row.full_name} (${row.worker_id}) vencio ${row.expires_on}.`,
        facility_id: row.facility_id,
        facility_name: row.facility_name
      })
    })

    const expiring = selectAll(
      db,
      `
      SELECT c.worker_id, c.name, c.expires_on, w.full_name, f.name as facility_name, f.facility_id
      FROM worker_credentials c
      JOIN health_workers w ON w.worker_id = c.worker_id
      LEFT JOIN worker_assignments a ON a.worker_id = w.worker_id AND (a.end_date IS NULL OR a.end_date = '')
      LEFT JOIN facilities f ON f.facility_id = a.facility_id
      ${clause ? `${clause} AND c.expires_on IS NOT NULL AND c.expires_on > ? AND c.expires_on <= ?` : 'WHERE c.expires_on IS NOT NULL AND c.expires_on > ? AND c.expires_on <= ?'}
      ORDER BY c.expires_on ASC
      LIMIT 50`,
      [...params, today, soon]
    )
    expiring.forEach(row => {
      alerts.push({
        severity: 'Media',
        type: 'Certificacion por vencer',
        message: `${row.full_name} (${row.worker_id}) vence ${row.expires_on}.`,
        facility_id: row.facility_id,
        facility_name: row.facility_name
      })
    })

    return alerts.slice(0, 20)
  }
}

export class LabService {
  private fallbackHash(value: string) {
    let total = 0
    for (const ch of value) {
      total = (total * 31 + ch.charCodeAt(0)) % 100000
    }
    return total
  }

  private async hasLabData() {
    const db = await getDb()
    const row = selectOne(db, 'SELECT COUNT(*) as total FROM lab_daily_summary') as { total?: number }
    return Number(row?.total ?? 0) > 0
  }

  private async fallbackSummary() {
    const today = toISODate(new Date())
    return {
      date: today,
      tests_ordered: 420,
      tests_completed: 398,
      avg_turnaround_hours: 9.1,
      rejected_samples: 12
    }
  }

  private async fallbackVolume(level: 'province' | 'district') {
    const db = await getDb()
    const scopeField = level === 'district' ? 'district' : 'province'
    const rows = selectAll(
      db,
      `SELECT ${scopeField} as scope_id, ${scopeField} as scope_name FROM facilities WHERE ${scopeField} IS NOT NULL`
    )
    const grouped = new Map<string, { scope_id: string; scope_name: string; count: number }>()
    rows.forEach(row => {
      const key = String(row.scope_id)
      if (!grouped.has(key)) {
        grouped.set(key, { scope_id: key, scope_name: String(row.scope_name), count: 0 })
      }
      const entry = grouped.get(key)
      if (entry) entry.count += 1
    })
    return Array.from(grouped.values()).map(entry => {
      const base = 120 + (this.fallbackHash(entry.scope_id) % 80) + entry.count * 6
      return {
        scope_id: entry.scope_id,
        scope_name: entry.scope_name,
        tests_ordered: base + 10 + (this.fallbackHash(entry.scope_id + '-o') % 20),
        tests_completed: base
      }
    }).sort((a, b) => b.tests_completed - a.tests_completed)
  }

  private async fallbackPositivity() {
    const db = await getDb()
    const diseaseRows = selectAll(db, 'SELECT disease_id FROM diseases_catalog ORDER BY disease_id')
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
        const base = 40 + (this.fallbackHash(id) % 60)
        const positive = Math.max(2, Math.round(base * (0.12 + (this.fallbackHash(id + '-p') % 8) / 100)))
        return {
          disease_id: id,
          test_type: testMap[id],
          total_tested: base,
          total_positive: positive
        }
      })
  }

  private async fallbackAlerts() {
    const today = toISODate(new Date())
    return [
      { alert_id: 'LAB_FALLBACK_001', date: today, type: 'RDT_STOCK_LOW', severity: 'ALTA', facility_id: null, message: 'RDT malaria con stock bajo. Revisar reposicion.' },
      { alert_id: 'LAB_FALLBACK_002', date: today, type: 'MACHINE_DOWNTIME', severity: 'MEDIA', facility_id: null, message: 'Equipo de hematologia con mantenimiento programado.' },
      { alert_id: 'LAB_FALLBACK_003', date: today, type: 'POSITIVITY_SPIKE', severity: 'ALTA', facility_id: null, message: 'Aumento de positividad malaria en la ultima semana.' }
    ]
  }

  private async getDateRange(period: 'ayer' | '7d' | '30d', table: 'lab_daily_summary' | 'lab_disease_indicators') {
    const db = await getDb()
    const latestRow = selectOne(db, `SELECT MAX(date) as maxDate FROM ${table}`) as { maxDate?: string }
    const latest = latestRow?.maxDate
    if (!latest) return null
    const days = period === 'ayer' ? 0 : period === '7d' ? 6 : 29
    const startDate = toISODate(addDays(new Date(latest), -days))
    return { startDate, endDate: latest }
  }

  private periodDays(period: 'ayer' | '7d' | '30d') {
    if (period === 'ayer') return 1
    if (period === '7d') return 7
    return 30
  }

  private async getScaleFactor(
    period: 'ayer' | '7d' | '30d',
    table: 'lab_daily_summary' | 'lab_disease_indicators'
  ) {
    const range = await this.getDateRange(period, table)
    if (!range) return 1
    const db = await getDb()
    const row = selectOne(
      db,
      `SELECT COUNT(DISTINCT date) as days FROM ${table} WHERE date BETWEEN ? AND ?`,
      [range.startDate, range.endDate]
    ) as { days?: number }
    const availableDays = Number(row?.days ?? 0)
    const expectedDays = this.periodDays(period)
    if (availableDays > 0 && availableDays < expectedDays) {
      return expectedDays / availableDays
    }
    return 1
  }

  async getSummary(period: 'ayer' | '7d' | '30d' = 'ayer') {
    const hasData = await this.hasLabData()
    if (!hasData) return this.fallbackSummary()
    const db = await getDb()
    const range = await this.getDateRange(period, 'lab_daily_summary')
    if (!range) return this.fallbackSummary()
    const row = selectOne(
      db,
      `
      SELECT
        SUM(tests_ordered) as tests_ordered,
        SUM(tests_completed) as tests_completed,
        ROUND(AVG(avg_turnaround_hours), 1) as avg_turnaround_hours,
        SUM(rejected_samples) as rejected_samples
      FROM lab_daily_summary
      WHERE date BETWEEN ? AND ?`,
      [range.startDate, range.endDate]
    )
    const scale = await this.getScaleFactor(period, 'lab_daily_summary')
    return {
      date: range.endDate,
      tests_ordered: Math.round(Number(row?.tests_ordered ?? 0) * scale),
      tests_completed: Math.round(Number(row?.tests_completed ?? 0) * scale),
      avg_turnaround_hours: Number(row?.avg_turnaround_hours ?? 0),
      rejected_samples: Math.round(Number(row?.rejected_samples ?? 0) * scale)
    }
  }

  async getVolumeBy(level: 'province' | 'district', period: 'ayer' | '7d' | '30d' = 'ayer') {
    const hasData = await this.hasLabData()
    if (!hasData) return this.fallbackVolume(level)
    const db = await getDb()
    const range = await this.getDateRange(period, 'lab_daily_summary')
    if (!range) return this.fallbackVolume(level)
    const scopeField = level === 'district' ? 'district' : 'province'
    const rows = selectAll(
      db,
      `
      SELECT
        f.${scopeField} as scope_id,
        f.${scopeField} as scope_name,
        SUM(s.tests_ordered) as tests_ordered,
        SUM(s.tests_completed) as tests_completed
      FROM lab_daily_summary s
      LEFT JOIN facilities f ON f.facility_id = s.facility_id
      WHERE s.date BETWEEN ? AND ?
      GROUP BY f.${scopeField}
      ORDER BY tests_completed DESC`,
      [range.startDate, range.endDate]
    )
    const scale = await this.getScaleFactor(period, 'lab_daily_summary')
    if (scale === 1) return rows
    return rows.map(row => ({
      ...row,
      tests_ordered: Math.round(Number(row.tests_ordered ?? 0) * scale),
      tests_completed: Math.round(Number(row.tests_completed ?? 0) * scale)
    }))
  }

  async getPositivity(period: 'ayer' | '7d' | '30d' = 'ayer') {
    const hasData = await this.hasLabData()
    if (!hasData) return this.fallbackPositivity()
    const db = await getDb()
    const range = await this.getDateRange(period, 'lab_disease_indicators')
    if (!range) return this.fallbackPositivity()
    const rows = selectAll(
      db,
      `
      SELECT disease_id, test_type, SUM(total_tested) as total_tested, SUM(total_positive) as total_positive
      FROM lab_disease_indicators
      WHERE date BETWEEN ? AND ?
      GROUP BY disease_id, test_type
      ORDER BY total_positive DESC`,
      [range.startDate, range.endDate]
    )
    const scale = await this.getScaleFactor(period, 'lab_disease_indicators')
    if (scale === 1) return rows
    return rows.map(row => ({
      ...row,
      total_tested: Math.round(Number(row.total_tested ?? 0) * scale),
      total_positive: Math.round(Number(row.total_positive ?? 0) * scale)
    }))
  }

  async getAlerts(period: 'ayer' | '7d' | '30d' = 'ayer', limit = 6) {
    const hasData = await this.hasLabData()
    if (!hasData) return (await this.fallbackAlerts()).slice(0, limit)
    const db = await getDb()
    const range = await this.getDateRange(period, 'lab_daily_summary')
    if (!range) return (await this.fallbackAlerts()).slice(0, limit)
    return selectAll(
      db,
      `
      SELECT
        a.alert_id,
        a.date,
        a.type,
        a.severity,
        a.facility_id,
        f.name as facility_name,
        a.message
      FROM lab_alerts a
      LEFT JOIN facilities f ON f.facility_id = a.facility_id
      WHERE a.date BETWEEN ? AND ?
      ORDER BY a.date DESC
      LIMIT ?`,
      [range.startDate, range.endDate, limit]
    )
  }
}
