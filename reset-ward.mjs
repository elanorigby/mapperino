// One-off script to reset Willesden Green ward segments to red (remove from Firestore)
// Uses the Firestore REST API to avoid gRPC connection issues in Node.
import { readFileSync } from 'fs'

// Read .env file manually (no dotenv dependency)
const env = Object.fromEntries(
  readFileSync('.env', 'utf-8')
    .split('\n')
    .filter(line => line.includes('=') && !line.startsWith('#'))
    .map(line => {
      const i = line.indexOf('=')
      return [line.slice(0, i).trim(), line.slice(i + 1).trim().replace(/^["']|["']$/g, '')]
    })
)

const PROJECT_ID = env.VITE_FIREBASE_PROJECT_ID
const DOC_PATH = 'segments/brent-leafleting'
const BASE_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`

// Get Willesden Green segment IDs from GeoJSON
const geojson = JSON.parse(readFileSync('public/brent_segments.geojson', 'utf-8'))
const wardSegmentIds = new Set(
  geojson.features
    .filter(f => f.properties.ward === 'Willesden Green')
    .map(f => f.properties.id)
)
console.log(`Found ${wardSegmentIds.size} segments in Willesden Green ward`)

// Fetch current document from Firestore REST API
const getRes = await fetch(`${BASE_URL}/${DOC_PATH}?key=${env.VITE_FIREBASE_API_KEY}`)
if (!getRes.ok) {
  console.error('Failed to fetch document:', getRes.status, await getRes.text())
  process.exit(1)
}

const docData = await getRes.json()
const fields = docData.fields || {}

const toRemove = Object.keys(fields).filter(id => wardSegmentIds.has(id))
console.log(`Found ${toRemove.length} green segments in Willesden Green to reset`)

if (toRemove.length === 0) {
  console.log('Nothing to do!')
  process.exit(0)
}

// Build updated fields without the Willesden Green entries
const updated = { ...fields }
for (const id of toRemove) {
  delete updated[id]
}

// Overwrite the document via PATCH
const patchRes = await fetch(
  `${BASE_URL}/${DOC_PATH}?key=${env.VITE_FIREBASE_API_KEY}`,
  {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: updated }),
  }
)

if (!patchRes.ok) {
  console.error('Failed to update document:', patchRes.status, await patchRes.text())
  process.exit(1)
}

console.log(`Done! Removed ${toRemove.length} segments. They will now appear red.`)
process.exit(0)
