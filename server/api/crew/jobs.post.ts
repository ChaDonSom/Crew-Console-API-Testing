// server/api/crew/jobs.post.ts
import { defineEventHandler, readBody, createError } from 'h3'
import { createCrewClient } from '~/utils/crewClient'

type CsvRow = Record<string, any>

export default defineEventHandler(async (event) => {
  const body = await readBody<{ rows: CsvRow[] }>(event)

  if (!body?.rows?.length) {
    throw createError({ statusCode: 400, statusMessage: 'rows[] required' })
  }

  const client = createCrewClient()

  // Resolve company_id once
  let companyId: number
  try {
    companyId = await client.resolveCompanyId()
  } catch (e: any) {
    throw createError({
      statusCode: e?.response?.status || 500,
      statusMessage: e?.message || 'Unable to resolve company_id from /api/users'
    })
  }

  // Flexible header helpers
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
  const getFromColumns = (row: CsvRow, candidates: string[]): string => {
    const keyMap = new Map<string, string>()
    for (const k of Object.keys(row || {})) keyMap.set(norm(k), k)
    for (const c of candidates) {
      const hit = keyMap.get(norm(c))
      if (hit != null && row[hit] != null) {
        const val = String(row[hit]).trim()
        if (val !== '') return val
      }
    }
    return ''
  }

  // CSV headers
  const JOB_NAME_HEADERS   = ['Job Name', 'job name', 'Name', 'name']
  const JOB_NUMBER_HEADERS = ['Job Number', 'job number', 'Number', 'number']

  const ADDRESS_STREET_HEADERS = [
    'Street Address',
    'Street',
    'Address',
    'Address 1',
    'Job Street'
  ]
  const ADDRESS_STREET2_HEADERS = [
    'Address Line 2',
    'Street Address 2',
    'Address 2',
    'Street 2',
    'Suite',
    'Unit',
    'Apt'
  ]
  const CITY_HEADERS    = ['City', 'Job City']
  const STATE_HEADERS   = ['State', 'Province', 'Job State']
  const ZIP_HEADERS     = ['Zip', 'ZIP', 'Zip Code', 'Postal Code', 'Job Zip']
  const COUNTRY_HEADERS = ['Country (2 letter ISO CODE)', 'Country']
  const LAT_HEADERS     = ['Lat', 'Latitude']
  const LNG_HEADERS     = ['Lng', 'Long', 'Longitude']

  const results: any[] = []
  let ok = 0
  let failed = 0

  for (let i = 0; i < body.rows.length; i++) {
    const r = body.rows[i] || {}

    // ✅ Only Job Name is required from CSV
    const name = getFromColumns(r, JOB_NAME_HEADERS)
    if (!name) {
      failed++
      results.push({
        ok: false,
        error: `Row ${i + 1}: Missing required Job Name`,
        row: r
      })
      continue
    }

    // Optional fields
    const number   = getFromColumns(r, JOB_NUMBER_HEADERS)
    const street   = getFromColumns(r, ADDRESS_STREET_HEADERS)
    const street_2 = getFromColumns(r, ADDRESS_STREET2_HEADERS)
    const city     = getFromColumns(r, CITY_HEADERS)
    const state    = getFromColumns(r, STATE_HEADERS)
    const zip      = getFromColumns(r, ZIP_HEADERS)
    const country  = getFromColumns(r, COUNTRY_HEADERS)
    const lat      = getFromColumns(r, LAT_HEADERS)
    const lng      = getFromColumns(r, LNG_HEADERS)

    // Build base job payload
    const job: any = {
      company_id: companyId,
      name,
      active: 1,
      color: '#0c4329'
    }
    if (number) job.number = number

    // 🔑 Address is entirely optional.
    // If there is no street address, DO NOT push anything for address / address.street.
    if (street) {
      const address: any = { street }

      if (street_2) address.street_2 = street_2
      if (city)     address.city     = city
      if (state)    address.state    = state
      if (zip)      address.zip      = zip
      if (country)  address.country  = country
      if (lat)      address.lat      = lat
      if (lng)      address.lng      = lng

      job.address = address
    }

    try {
      const response = await client.post('/api/jobs', job)
      ok++
      results.push({ ok: true, data: response, row: r })
    } catch (err: any) {
      failed++
      const status = err?.response?.status || 'Unknown'
      const rawData = err?.response?._data
      const msg =
        (rawData && (rawData.message || rawData.error)) ||
        err?.message ||
        'Request failed'

      results.push({
        ok: false,
        error: `Row ${i + 1}: [${status}] ${msg}`,
        row: r,
        payload: job
      })
    }
  }

  return {
    summary: { ok, failed },
    results
  }
})
