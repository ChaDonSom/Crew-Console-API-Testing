// server/api/crew/staff.post.ts
import { defineEventHandler, readBody, createError } from 'h3'
import { createCrewClient } from '~/utils/crewClient'

type CsvRow = Record<string, any>

interface PostResult {
  ok: boolean
  res?: any
  error?: string
  row?: CsvRow
  payload?: any
  index?: number
  skippedReason?: string
}

// Exact headers for this template
const H = {
  NAME: 'Name First and Last',
  EMP_ID: 'Employee ID',
  EMAIL: 'Email',
  PASSWORD: 'Password (6 Characters minimum)',
  PHONE: 'Cell Phone',
  PAYROLL: 'Payroll',
  JOBS: 'Jobs',
  USERS: 'Users',      // ignored for role; we always create regular staff
  ANALYSIS: 'Analysis',
  FOREMAN: 'Foreman',
  TRACKING: 'Tracking'
} as const

// Case-insensitive, whitespace-tolerant lookup that returns the raw cell value
const getExact = (row: Record<string, any>, header: string) => {
  const wanted = header.toLowerCase().trim()
  for (const [k, v] of Object.entries(row)) {
    if (k.toLowerCase().trim() === wanted) return v == null ? '' : String(v)
  }
  return ''
}

export default defineEventHandler(async (event) => {
  const body = await readBody<{ rows: CsvRow[] }>(event)
  if (!body?.rows?.length) {
    throw createError({ statusCode: 400, statusMessage: 'rows[] required' })
  }

  // Validate required headers exist on first row
  const first = body.rows[0] || {}
  for (const required of [H.NAME, H.EMAIL, H.PASSWORD]) {
    if (!Object.prototype.hasOwnProperty.call(first, required)) {
      throw createError({
        statusCode: 400,
        statusMessage: `CSV must include a column named "${required}".`
      })
    }
  }

  // Crew API client
  const client = createCrewClient()

  // Resolve company_id once
  let resolvedCompanyId: number
  try {
    resolvedCompanyId = await client.resolveCompanyId()
  } catch (e: any) {
    throw createError({
      statusCode: e?.response?.status || 500,
      statusMessage: e?.message || 'Unable to resolve company_id from /api/users'
    })
  }

  // Preload existing users → prevent duplicate email creates
  const existingEmailMap = new Map<string, { id?: number; name?: string }>()
  try {
    const users: any = await client.get('/api/users')
    const arr: any[] = users?.data || []
    for (const u of arr) {
      const e = (u?.email ?? '').toString().trim().toLowerCase()
      if (e) existingEmailMap.set(e, { id: u?.id, name: u?.name })
    }
  } catch { /* best effort; server will still enforce unique */ }

  // Helpers
  const parseYes = (v: any): boolean => {
    if (v == null) return false
    const s = v.toString().trim().toLowerCase()
    return ['y','yes','true','1','x','on','✓','check','checked'].includes(s)
  }

  const normalizePhone = (raw?: string | null) => {
    if (!raw) return null
    const s = String(raw).trim()
    if (/^\+\d{8,15}$/.test(s)) {
      const cc = (s.match(/^\+(\d{1,3})/) || [])[1] || null
      return { e164: s, cc }
    }
    const digits = s.replace(/\D+/g, '')
    if (digits.length === 10) return { e164: `+1${digits}`, cc: '1' as const }
    if (digits.length === 11 && digits.startsWith('1')) return { e164: `+${digits}`, cc: '1' as const }
    return { e164: s, cc: null as string | null }
  }

  const nowSql = (): string => {
    const d = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  }

  const results: PostResult[] = []
  let ok = 0, failed = 0, validationErrors = 0, skippedDuplicates = 0
  const seenEmails = new Set<string>()

  for (let i = 0; i < body.rows.length; i++) {
    const r = body.rows[i] || {}

    // Required fields (read, then TRIM for validation + submission)
    const name = (getExact(r, H.NAME) || '').trim()
    const email = (getExact(r, H.EMAIL) || '').trim()
    const passwordTrimmed = (getExact(r, H.PASSWORD) || '').trim()

    const missing: string[] = []
    if (!name) missing.push(H.NAME)
    if (!email) missing.push(H.EMAIL)
    if (!passwordTrimmed) missing.push(H.PASSWORD)
    if (missing.length) {
      validationErrors++; failed++
      results.push({
        ok: false,
        error: `Missing required field(s): ${missing.join(', ')} on line ${i + 2}`,
        row: r, index: i
      })
      continue
    }

    // Password >= 6 characters (use trimmed version)
    if (passwordTrimmed.length < 6) {
      validationErrors++; failed++
      results.push({
        ok: false,
        error: `Password must be at least 6 characters on line ${i + 2}`,
        row: r, index: i
      })
      continue
    }

    // De-dupe within this upload
    const emailKey = email.toLowerCase()
    if (seenEmails.has(emailKey)) {
      skippedDuplicates++
      results.push({ ok: false, skippedReason: 'Duplicate email in upload', row: r, index: i })
      continue
    }

    // Skip if already exists on server
    if (existingEmailMap.has(emailKey)) {
      const existing = existingEmailMap.get(emailKey)
      failed++
      results.push({
        ok: false,
        error: `Duplicate email: "${email}" already exists in the system${existing?.name ? ` (belongs to ${existing.name}${existing?.id ? ` #${existing.id}` : ''})` : ''}. Skipped row ${i + 2}.`,
        row: r, index: i
      })
      continue
    }

    seenEmails.add(emailKey)

    // Optional columns (exact names)
    const employeeIdRaw = (getExact(r, H.EMP_ID) || '').trim() || null
    const phoneRaw = (getExact(r, H.PHONE) || '').trim() || null

    // Flags from CSV columns
    const payrollFlag  = parseYes(r[H.PAYROLL])
    const jobsFlag     = parseYes(r[H.JOBS])
    const usersFlag    = parseYes(r[H.USERS])
    const analysisFlag = parseYes(r[H.ANALYSIS])
    const foremanFlag  = parseYes(r[H.FOREMAN])
    const trackingFlag = parseYes(r[H.TRACKING])

    // Numeric levels for legacy fields
    const time_clock_level = payrollFlag ? 1 : 0
    const scheduler_level  = jobsFlag ? 1 : 0
    const metrics_level    = analysisFlag ? 1 : 0
    const metrics_enabled  = metrics_level > 0 ? 1 : 0

    // Build permissions array for this user (for the Permissions model)
    const permissions: any[] = []

    // Time module
    if (time_clock_level) {
      permissions.push({
        name: 'time',
        pivot: { value: 'edit' }
      })
    }

    // Foreman toggle -> time_for_others permission
    if (foremanFlag) {
      permissions.push({
        name: 'time_for_others',
        pivot: { value: 'edit' }
      })
    }

    // Tracking toggle -> tracking_info permission
    if (trackingFlag) {
      permissions.push({
        name: 'tracking_info',
        pivot: { value: 'edit' }
      })
    }

    // Other module permissions from CSV
    if (payrollFlag) {
      permissions.push({
        name: 'payroll',
        pivot: { value: 'edit' }
      })
    }

    if (jobsFlag) {
      permissions.push({
        name: 'jobs',
        pivot: { value: 'edit' }
      })
    }

    if (usersFlag) {
      permissions.push({
        name: 'users',
        pivot: { value: 'edit' }
      })
    }

    // analysis permission is view-only
    if (analysisFlag) {
      permissions.push({
        name: 'analysis',
        pivot: { value: 'view' }
      })
    }

    // Always create regular staff (never admin)
    const role = 'user'

    const payload: any = {
      name,
      email,

      // send the TRIMMED value (most backends trim before validating anyway)
      password: passwordTrimmed,
      password_confirmation: passwordTrimmed,

      // Permissions / role
      role,               // regular staff
      employee: 0,
      active: 1,
      time_clock_level,
      scheduler_level,
      metrics_level,
      metrics_enabled,

      // IDs (mirror into both fields so UI filters work)
      accounting_id: employeeIdRaw,
      employee_id: employeeIdRaw,

      company_id: resolvedCompanyId,

      // Guardrails
      type: 'user',
      is_super_admin: 0
    }

    // Attach permissions only if any were set
    if (permissions.length) {
      payload.permissions = permissions
    }

    if (phoneRaw) {
      const norm = normalizePhone(phoneRaw)
      payload.phone = norm?.e164 ?? phoneRaw
      payload.phone_number = norm?.e164 ?? phoneRaw
      if (norm?.cc) payload.phone_country_code = norm.cc
      payload.consented_to_sms_at = nowSql()
    }

    try {
      const res = await client.post('/api/users', payload)
      results.push({ ok: true, res, index: i })
      ok++
      existingEmailMap.set(emailKey, { name, id: res?.data?.id ?? res?.id })
    } catch (err: any) {
      const status = err?.response?.status
      const rawData = err?.response?._data
      const rawMsg =
        (typeof rawData === 'string' && rawData) ||
        rawData?.message ||
        err?.message ||
        'Request failed'

      const isDup =
        /duplicate entry '.*' for key 'users\.users_email_unique'/i.test(rawMsg) ||
        /duplicate entry/i.test(rawMsg)

      const msg = isDup
        ? `Duplicate email: "${email}" already exists in the system. Skipped row ${i + 2}.`
        : (status ? `HTTP ${status}: ${rawMsg}` : rawMsg)

      results.push({ ok: false, error: msg, payload, row: r, index: i })
      failed++
    }
  }

  return {
    summary: {
      total: results.length,
      ok,
      failed,
      validationErrors,
      skippedDuplicates,
      company_id_used: resolvedCompanyId
    },
    results
  }
})
