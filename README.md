# Mapperino Demo / Proof of concept

A mobile-first web app for collaboratively mapping and marking street segments in the London Borough of Brent.

Intended to facilitate group tracking of what streets have been doorknocked/leafleted.

## How It Works

1. App loads the map centered on Brent
2. Fetches `brent_segments.geojson` containing 36,000+ street segments with ward assignments
3. Renders each segment as a red polyline
4. Click the ☰ menu to filter by ward
5. Tap segments to toggle red/green
6. Device location shown as blue dot (with permission)

## Todo
[x] select specific ward
[] search for streets
[] allow mark streets as irrelevant
[] login

# Dev notes

## Tech Stack

- **Svelte 5** - Reactive UI framework
- **Leaflet** - Interactive mapping library
- **OpenStreetMap** - Map tiles and road network data
- **Vite** - Fast build tool and dev server

## Development

### Setup

```bash
npm install
```

### Run Dev Server

```bash
npm run dev
```

Visit `http://localhost:5173`


### Build for Production

```bash
npm run build
```

## Generating Street Segments

Street segments are pre-processed from OpenStreetMap data using the `segment-processor` Python tool (in separate repo)

The generated `brent_segments.geojson` file is stored in `public/` and loaded by the app.

### Ward Data
Ward boundaries are sourced from the ONS Open Geography Portal (December 2021 boundaries). Each segment includes a `ward` property identifying which electoral ward it belongs to, enabling the ward filtering feature in the app.


