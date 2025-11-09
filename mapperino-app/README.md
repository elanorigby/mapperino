# Mapperino

A mobile-first web app for collaboratively mapping and marking street segments in the London Borough of Brent.

## Features

- **Interactive Map** - Centered on Brent with OpenStreetMap tiles
- **Street Segments** - Every road broken down into clickable segments between intersections
- **Toggle Colors** - Tap segments to toggle between red (unmarked) and green (marked)
- **Device Location** - Shows your current location with a blue dot
- **Mobile-First** - Optimized for touch interactions on phones and tablets

## Tech Stack

- **Svelte 5** - Reactive UI framework
- **Leaflet** - Interactive mapping library
- **OpenStreetMap** - Map tiles and road network data
- **Vite** - Fast build tool and dev server

## Project Structure

```
mapperino-app/          # Svelte web app
segment-processor/      # Python tool for generating street segments
```

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

Street segments are pre-processed from OpenStreetMap data using the `segment-processor` Python tool.

See `../segment-processor/README.md` for details.

The generated `brent_segments.geojson` file is stored in `public/` and loaded by the app.

## How It Works

1. App loads the map centered on Brent
2. Fetches `brent_segments.geojson` containing 34,547+ street segments
3. Renders each segment as a red polyline
4. User can tap segments to toggle red/green
5. Device location shown as blue dot (with permission)

## License

MIT
