# Mapperino

A mobile-first web app for collaboratively mapping and marking street segments, currently scoped to the London Borough of Brent.
Intended to facilitate progress tracking of what streets have been doorknocked/leafleting.

Street segments and ward boundaries, etc. are pre-processed from Open Street Map and Office of National Statistics data using the `segment-processor` Python tool (in separate repo - https://github.com/elanorigby/segment-processor).

## Webapp

Landing page: https://elanorigby.github.io/mapperino/

There is a demo version of the app at https://elanorigby.github.io/mapperino/demo that does not sync segment marking.

The full version of the app that will sync segment state is behind a simple password gate at https://elanorigby.github.io/mapperino/brent

## How It Works

1. App loads the map centered on Brent
2. Fetches `brent_segments.geojson` containing 36,000+ street segments with ward assignments
3. Renders each segment as a red polyline
4. Click the ☰ menu to filter by ward or search for a location
5. Search by street name or postcode (uses OpenStreetMap Nominatim)
6. Tap segments to toggle red/green
7. Device location shown as blue dot (with permission)


## Todo
[] firebase to sync state
[] way to mark streets as irrelevant
[] way to clear all markings


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


