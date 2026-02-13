/**
 * One-time migration script: maps old segment IDs (e.g. "segment_18")
 * to new per-side IDs ("segment_18_N" / "segment_18_S") in Firestore.
 *
 * Uses the Firestore REST API directly (no SDK compatibility issues in Node.js).
 *
 * Usage:
 *   node scripts/migrate-segment-ids.js --backup-only   # Just save a backup
 *   node scripts/migrate-segment-ids.js --dry-run       # Preview changes (also saves backup)
 *   node scripts/migrate-segment-ids.js                 # Run the migration (also saves backup)
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
const backupOnly = process.argv.includes('--backup-only')

// --- Read current data ---
console.log('Fetching current Firestore data...')
const getRes = await fetch(`${baseUrl}/segments/brent?key=${apiKey}`)
if (!getRes.ok) {
  const err = await getRes.text()
  console.error(`Failed to fetch Firestore document: ${getRes.status} ${err}`)
  process.exit(1)
}

const docJson = await getRes.json()

// Parse Firestore REST format into a simple {segmentId: color} map
const data = {}
if (docJson.fields) {
  for (const [key, value] of Object.entries(docJson.fields)) {
    data[key] = value.stringValue
  }
}

console.log(`Found ${Object.keys(data).length} entries in Firestore`)

// --- Backup ---
const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
const backupDir = new URL('../scripts/backups/', import.meta.url)
mkdirSync(backupDir, { recursive: true })
const backupPath = new URL(`../scripts/backups/firestore-backup-${timestamp}.json`, import.meta.url)
writeFileSync(backupPath, JSON.stringify(data, null, 2))
console.log(`Backup saved to scripts/backups/firestore-backup-${timestamp}.json`)

if (backupOnly) {
  console.log('Backup complete. Exiting.')
  process.exit(0)
}

// --- Build migration ---

// Load the new GeoJSON to know valid new IDs and their pair mappings
const geojsonPath = new URL('../public/brent_segments.geojson', import.meta.url)
const geojson = JSON.parse(readFileSync(geojsonPath, 'utf-8'))

const pairToSides = {}
const allNewIds = new Set()
for (const feature of geojson.features) {
  const { id, pair_id } = feature.properties
  allNewIds.add(id)
  if (pair_id) {
    if (!pairToSides[pair_id]) pairToSides[pair_id] = []
    pairToSides[pair_id].push(id)
  }
}

console.log(`Loaded ${allNewIds.size} new segment IDs (${Object.keys(pairToSides).length} pairs)`)

// For each old key, map to new side IDs
const updates = {}
let migratedCount = 0
let alreadyNewCount = 0
let skippedCount = 0

for (const [segmentId, color] of Object.entries(data)) {
  if (allNewIds.has(segmentId)) {
    alreadyNewCount++
    continue
  }

  if (pairToSides[segmentId]) {
    const sideIds = pairToSides[segmentId]
    for (const sideId of sideIds) {
      if (!data[sideId]) {
        updates[sideId] = color
      }
    }
    migratedCount++
  } else {
    skippedCount++
  }
}

console.log(`\nMigration summary:`)
console.log(`  ${migratedCount} old IDs will be mapped to new side IDs`)
console.log(`  ${alreadyNewCount} entries already use new IDs`)
console.log(`  ${skippedCount} old IDs have no match in new data (orphaned)`)
console.log(`  ${Object.keys(updates).length} new entries to write`)

if (Object.keys(updates).length === 0) {
  console.log('\nNothing to migrate.')
  process.exit(0)
}

if (dryRun) {
  console.log('\n[DRY RUN] Would write these entries:')
  for (const [id, color] of Object.entries(updates)) {
    console.log(`  ${id}: ${color}`)
  }
  console.log('\nRe-run without --dry-run to apply.')
} else {
  // Write in batches to avoid request size limits
  const BATCH_SIZE = 200
  const entries = Object.entries(updates)

  console.log(`\nWriting updates to Firestore in batches of ${BATCH_SIZE}...`)

  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const batch = entries.slice(i, i + BATCH_SIZE)
    const fields = {}
    for (const [id, color] of batch) {
      fields[id] = { stringValue: color }
    }

    const updateMask = batch.map(([k]) => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join('&')
    const patchUrl = `${baseUrl}/segments/brent?${updateMask}&key=${apiKey}`

    const patchRes = await fetch(patchUrl, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields })
    })

    if (!patchRes.ok) {
      const err = await patchRes.text()
      console.error(`Failed to update Firestore (batch ${Math.floor(i / BATCH_SIZE) + 1}): ${patchRes.status} ${err}`)
      process.exit(1)
    }

    console.log(`  Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(entries.length / BATCH_SIZE)}: wrote ${batch.length} entries`)
  }

  console.log('Done! Migration complete.')
}

process.exit(0)
