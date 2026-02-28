/**
 * One-time script: copies segments/brent to segments/brent-leafleting in Firestore.
 * The original doc is left untouched.
 *
 * Uses the Firestore REST API (same pattern as migrate-segment-ids.js).
 *
 * Usage:
 *   node scripts/copy-to-leafleting.js --dry-run   # Preview without writing
 *   node scripts/copy-to-leafleting.js              # Copy the data
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs'

// Parse .env file
const envPath = new URL('../.env', import.meta.url)
const envVars = {}
readFileSync(envPath, 'utf-8').split('\n').forEach(line => {
  const match = line.match(/^([^#=]+)=(.*)$/)
  if (match) envVars[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, '')
})

const projectId = envVars.VITE_FIREBASE_PROJECT_ID
const apiKey = envVars.VITE_FIREBASE_API_KEY
const baseUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`

const dryRun = process.argv.includes('--dry-run')

// --- Read current data from segments/brent ---
console.log('Fetching segments/brent from Firestore...')
const getRes = await fetch(`${baseUrl}/segments/brent?key=${apiKey}`)
if (!getRes.ok) {
  const err = await getRes.text()
  console.error(`Failed to fetch: ${getRes.status} ${err}`)
  process.exit(1)
}

const docJson = await getRes.json()

const data = {}
if (docJson.fields) {
  for (const [key, value] of Object.entries(docJson.fields)) {
    data[key] = value.stringValue
  }
}

console.log(`Found ${Object.keys(data).length} segment entries`)

// --- Backup ---
const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
const backupDir = new URL('../scripts/backups/', import.meta.url)
mkdirSync(backupDir, { recursive: true })
const backupPath = new URL(`../scripts/backups/firestore-backup-${timestamp}.json`, import.meta.url)
writeFileSync(backupPath, JSON.stringify(data, null, 2))
console.log(`Backup saved to scripts/backups/firestore-backup-${timestamp}.json`)

if (dryRun) {
  console.log(`\n[DRY RUN] Would copy ${Object.keys(data).length} entries to segments/brent-leafleting`)
  console.log('Re-run without --dry-run to apply.')
  process.exit(0)
}

// --- Write to segments/brent-leafleting ---
console.log('\nWriting to segments/brent-leafleting...')

// Build Firestore REST format fields
const fields = {}
for (const [id, color] of Object.entries(data)) {
  fields[id] = { stringValue: color }
}

// Write in batches to avoid request size limits
const BATCH_SIZE = 200
const entries = Object.entries(data)

for (let i = 0; i < entries.length; i += BATCH_SIZE) {
  const batch = entries.slice(i, i + BATCH_SIZE)
  const batchFields = {}
  for (const [id, color] of batch) {
    batchFields[id] = { stringValue: color }
  }

  const updateMask = batch.map(([k]) => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join('&')
  const patchUrl = `${baseUrl}/segments/brent-leafleting?${updateMask}&key=${apiKey}`

  const patchRes = await fetch(patchUrl, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: batchFields })
  })

  if (!patchRes.ok) {
    const err = await patchRes.text()
    console.error(`Failed to write batch ${Math.floor(i / BATCH_SIZE) + 1}: ${patchRes.status} ${err}`)
    process.exit(1)
  }

  console.log(`  Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(entries.length / BATCH_SIZE)}: wrote ${batch.length} entries`)
}

console.log(`\nDone! Copied ${Object.keys(data).length} entries to segments/brent-leafleting`)
console.log('Original segments/brent is unchanged.')

process.exit(0)
