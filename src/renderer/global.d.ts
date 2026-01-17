export {}

declare global {
  interface Window {
    api: {
      dashboard: {
        getSummary: (period: string, filters?: { region?: string; type?: string; search?: string }) => Promise<{
          visits: number
          suspected: number
          alerts: number
          occupancyRate: number
          stockouts: number
          mortalityRate: number
          startDate: string
          endDate: string
        } | null>
      }
      facilities: {
        list: (filters: { region?: string; type?: string; search?: string }) => Promise<any[]>
      }
      epi: {
        trend: (diseaseId: string, weeks?: number) => Promise<Array<{ week_start: string; cases: number }>>
        ranking: (diseaseId: string, limit?: number) => Promise<Array<{ district_id: string; province_id: string; region: string; cases: number }>>
        diseases: () => Promise<Array<{ disease_id: string; name: string }>>
      }
      pharmacy: {
        summary: () => Promise<{ latestMonth: string | null; facilitiesCritical: number; itemsCritical: number } | null>
        critical: (limit?: number) => Promise<Array<{
          facility_id: string
          facility_name: string | null
          item_id: string
          item_name: string
          stock_on_hand: number
          min_level: number
          expiry_nearest: string | null
        }>>
      }
      lab: {
        summary: (period?: 'ayer' | '7d' | '30d') => Promise<{
          date: string
          tests_ordered: number
          tests_completed: number
          avg_turnaround_hours: number
          rejected_samples: number
        } | null>
        volume: (level: 'province' | 'district', period?: 'ayer' | '7d' | '30d') => Promise<Array<{
          scope_id: string
          scope_name: string
          tests_ordered: number
          tests_completed: number
        }>>
        positivity: (period?: 'ayer' | '7d' | '30d') => Promise<Array<{
          disease_id: string
          test_type: string
          total_tested: number
          total_positive: number
        }>>
        alerts: (period?: 'ayer' | '7d' | '30d', limit?: number) => Promise<Array<{
          alert_id: string
          date: string
          type: string
          severity: string
          facility_id: string | null
          facility_name: string | null
          message: string
        }>>
      }
      hr: {
        workers: (filters?: {
          search?: string
          cadre?: string
          status?: string
          facilityId?: string
          province?: string
          district?: string
          employmentType?: string
        }) => Promise<Array<{
          worker_id: string
          full_name: string
          sex: string | null
          dob: string | null
          nationality: string | null
          cadre: string | null
          specialty: string | null
          license_number: string | null
          employment_type: string | null
          status: string | null
          contact?: { phone?: string | null; email?: string | null }
          home_district_id?: string | null
          facility_id?: string | null
          facility_name?: string | null
          position_title?: string | null
          department?: string | null
          start_date?: string | null
          end_date?: string | null
          fte?: number | null
        }>>
        assignments: (workerId?: string) => Promise<Array<{
          assignment_id: string
          worker_id: string
          facility_id: string
          position_title: string | null
          department: string | null
          start_date: string | null
          end_date: string | null
          fte: number | null
          shift_pattern?: string | null
        }>>
        history: (workerId?: string) => Promise<Array<{
          history_id: string
          worker_id: string
          facility_id: string
          role: string | null
          start_date: string | null
          end_date: string | null
          notes?: string | null
        }>>
        credentials: (workerId?: string) => Promise<Array<{
          credential_id: string
          worker_id: string
          type: string | null
          name?: string | null
          institution?: string | null
          country?: string | null
          date_awarded?: string | null
          expires_on?: string | null
        }>>
        get: (workerId: string) => Promise<any | null>
        timeline: (workerId: string) => Promise<any[]>
        facilityStaff: (facilityId: string, department?: string) => Promise<any[]>
        kpis: (scope?: { level?: 'national' | 'province' | 'district'; id?: string }) => Promise<{
          total: number
          active: number
          byCadre: Record<string, number>
          scope?: string
          scopeId?: string | null
        } | null>
        alerts: (scope?: { level?: 'national' | 'province' | 'district'; id?: string }) => Promise<Array<{
          severity: string
          type: string
          message: string
          facility_id?: string
          facility_name?: string
        }>>
        staffing: (scope?: { level?: 'national' | 'province' | 'district'; id?: string }, limit?: number) => Promise<Array<{
          facility_id: string
          facility_name: string | null
          province: string | null
          district: string | null
          required_doctors: number
          required_nurses: number
          required_technicians: number
          actual_doctors: number
          actual_nurses: number
          actual_technicians: number
        }>>
      }
      patients: {
        list: (filters: { search?: string; sex?: string; limit?: number; offset?: number }) => Promise<{
          total: number
          rows: Array<{
            patient_id: string
            full_name: string
            sex: string | null
            dob: string | null
            facility_id: string | null
            facility_name: string | null
            visits_count: number
            last_visit: string | null
          }>
        }>
        timeline: (patientId: string, limit?: number) => Promise<Array<{
          visit_id: string
          date: string
          service: string
          diagnosis_id: string | null
          diagnosis_code: string | null
          outcome: string | null
          facility_id: string
          facility_name: string | null
        }>>
      }
      encounters: {
        detail: (encounterId: string) => Promise<{
          encounter: {
            visit_id: string
            patient_id: string
            facility_id: string
            facility_name: string | null
            date: string
            service: string
            diagnosis_id: string | null
            diagnosis_code: string | null
            outcome: string | null
          } | null
          notes: Array<{
            note_id: string
            encounter_id: string
            patient_id: string
            note_type: string
            chief_complaint: string
            subjective: string
            objective: string
            assessment: string
            plan: string
            created_at: string
            created_by: string
            is_signed: number
          }>
          vitals: {
            vital_id: string
            encounter_id: string
            bp_sys: number
            bp_dia: number
            temp_c: number
            hr: number
            rr: number
            spo2: number
            weight_kg: number
            height_cm: number
          } | null
        }>
      }
      assets: {
        patientPhoto: (sex?: string | null) => Promise<string>
      }
      report: {
        generatePdf: (payload?: { filename?: string }) => Promise<{ ok?: boolean; canceled?: boolean; filePath?: string }>
      }
    }
  }
}
