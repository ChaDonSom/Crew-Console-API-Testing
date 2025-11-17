// server/api/crew/customers.post.ts
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

export default defineEventHandler(async (event) => {
  const body = await readBody<{ rows: CsvRow[] }>(event)
  if (!body?.rows?.length) {
    throw createError({ statusCode: 400, statusMessage: 'rows[] required' })
  }

  const client = createCrewClient()

  // Resolve owner company_id from first user (via central client)
  let baseCompanyId: number
  try {
    baseCompanyId = await client.resolveCompanyId()
  } catch (e: any) {
    throw createError({
      statusCode: e?.response?.status || 500,
      statusMessage: e?.message || 'Unable to resolve company_id from /api/users'
    })
  }

  const results: PostResult[] = []
  let ok = 0, failed = 0, validationErrors = 0, skippedDuplicates = 0

  // De-dupe within a single upload (Name+Email+Company)
  const seenKeys = new Set<string>()
  // Cache company name → id (avoid repeated GET/POST)
  const customerCompanyCache = new Map<string, number | null>()

  const getFromColumns = (row: CsvRow, names: string[]): string => {
    const entries = Object.entries(row)
    for (const wanted of names) {
      const wn = wanted.toLowerCase().trim()
      const hit = entries.find(([k]) => k.toLowerCase().trim() === wn)
      if (hit && hit[1] != null && hit[1] !== '') {
        return String(hit[1]).trim()
      }
    }
    return ''
  }

  const normalizeUSPhone = (raw: string | null | undefined) => {
    if (!raw) return null
    // Strip non-digits
    const digits = String(raw).replace(/\D+/g, '')
    if (digits.length === 10) {
      // Assume US
      return { e164: `+1${digits}`, country: '1' as const }
    }
    if (digits.length === 11 && digits.startsWith('1')) {
      return { e164: `+${digits}`, country: '1' as const }
    }
    // If it's already +E.164-ish, pass through
    if (/^\+\d{8,15}$/.test(String(raw).trim())) {
      const match = String(raw).trim().match(/^\+(\d{1,3})/)
      return { e164: String(raw).trim(), country: match ? match[1] : null }
    }
    // Unrecognized → return as-is (server may still accept), no country
    return { e164: String(raw).trim(), country: null }
  }

  const nowSql = (): string => {
    const d = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  }

  for (let i = 0; i < body.rows.length; i++) {
    const r = body.rows[i] || {}

    // --- Required: Name First and Last ---
    const rawName = r['Name First and Last'] ?? r['name'] ?? r['Name']
    const name = (rawName ?? '').toString().trim()
    if (!name) {
      validationErrors++; failed++
      results.push({
        ok: false,
        error: `Row ${i + 2}: Missing required field "Name First and Last"`,
        row: r,
        index: i
      })
      continue
    }

    // --- Optional fields (flexible headers) ---
    const role = (r['Role'] ?? '').toString().trim() || 'Customer'
    const email = (r['Email'] ?? '').toString().trim() || null
    const companyName = (r['Company'] ?? '').toString().trim() || ''

    // Phone can be labeled many ways
    const phoneRaw =
      getFromColumns(r, [
        'Phone', 'Phone Number', 'Cell Phone', 'Mobile', 'Mobile Phone', 'Telephone', 'Tel'
      ]) || null

    const phoneNorm = phoneRaw ? normalizeUSPhone(phoneRaw) : null

    // De-dupe key
    const deDupeKey = `${name.toLowerCase()}|${(email || '').toLowerCase()}|${companyName.toLowerCase()}`
    if (seenKeys.has(deDupeKey)) {
      skippedDuplicates++
      results.push({
        ok: false,
        skippedReason: 'Duplicate row in upload (same Name/Email/Company)',
        row: r,
        index: i
      })
      continue
    }
    seenKeys.add(deDupeKey)

    // Resolve or create customer_company_id if Company is provided; else null
    let customer_company_id: number | null = null
    if (companyName) {
      const key = companyName.toLowerCase()
      if (customerCompanyCache.has(key)) {
        customer_company_id = customerCompanyCache.get(key) ?? null
      } else {
        try {
          const id = await client.findOrCreateCompanyByName(companyName, baseCompanyId)
          customerCompanyCache.set(key, id)
          customer_company_id = id
        } catch (e: any) {
          // Soft note and keep going (null company)
          results.push({
            ok: false,
            error: `Row ${i + 2}: Could not resolve/create customer company "${companyName}". Proceeding with null. ${e?.message || ''}`,
            row: r,
            index: i
          })
        }
      }
    }

    const payload: any = {
      name,
      company_id: baseCompanyId,
      customer_company_id, // dynamic or null
      active: 1,
      role,
      email: email || null,

      // Phone fields — send both 'phone' and 'phone_number' to satisfy either API shape
      ...(phoneNorm
        ? {
            phone: phoneNorm.e164,          // common pattern many APIs accept
            phone_number: phoneNorm.e164,   // alternate name used by some endpoints
            phone_country_code: phoneNorm.country, // keep if your backend uses it
            consented_to_sms_at: nowSql()
          }
        : {}),

      // These are safe defaults; backend can ignore unknowns
      type: 'customer',
      pin: null
    }

    try {
      const res = await client.post('/api/customers', payload)
      results.push({ ok: true, res, index: i })
      ok++
    } catch (err: any) {
      const status = err?.response?.status || 'Unknown'
      const msg =
        err?.response?._data?.message ||
        err?.message ||
        'Request failed'
      results.push({
        ok: false,
        error: `Row ${i + 2}: [${status}] ${msg}`,
        payload,
        row: r,
        index: i
      })
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
      company_id_used: baseCompanyId
    },
    results
  }
})
