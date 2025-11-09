<script>
  import { onMount, onDestroy } from 'svelte'
  import L from 'leaflet'
  import 'leaflet/dist/leaflet.css'
  // import { firebaseService } from './firebase' // COMMENTED OUT - no Firebase for now

  let mapContainer
  let map
  let roadSegments = {}
  let locationMarker = null
  let locationWatchId = null

  onMount(async () => {
    // Load saved map state from localStorage or use default (Brent coordinates)
    const savedState = localStorage.getItem('mapState')
    let initialCenter = [51.5588, -0.2817]
    let initialZoom = 13

    if (savedState) {
      try {
        const state = JSON.parse(savedState)
        initialCenter = [state.lat, state.lng]
        initialZoom = state.zoom
        console.log('Restored map position:', initialCenter, 'zoom:', initialZoom)
      } catch (e) {
        console.warn('Failed to parse saved map state:', e)
      }
    }

    // Initialize map centered on London Borough of Brent
    map = L.map(mapContainer, {
      tap: true,
      touchZoom: true,
      dragging: true
    }).setView(initialCenter, initialZoom)

    // Add OpenStreetMap tiles
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19
    }).addTo(map)

    // Save map state whenever user moves or zooms
    map.on('moveend', () => {
      const center = map.getCenter()
      const zoom = map.getZoom()
      const state = {
        lat: center.lat,
        lng: center.lng,
        zoom: zoom
      }
      localStorage.setItem('mapState', JSON.stringify(state))
    })

    // Load Brent segments from GeoJSON
    try {
      console.log('Loading Brent segments...')
      const response = await fetch(`${import.meta.env.BASE_URL}brent_segments.geojson`)
      const geojson = await response.json()

      console.log(`Loaded ${geojson.features.length} segments`)

      // Add each segment to the map
      geojson.features.forEach((feature) => {
        const { id, color } = feature.properties
        const coords = feature.geometry.coordinates.map(coord => [coord[1], coord[0]]) // [lat, lng]

        const polyline = L.polyline(coords, {
          color: color,
          weight: 6,
          opacity: 0.7,
          lineJoin: 'round',
          lineCap: 'round'
        }).addTo(map)

        // Add click handler to toggle color
        polyline.on('click', (e) => {
          L.DomEvent.stopPropagation(e)
          const currentColor = roadSegments[id].color
          const newColor = currentColor === '#FF0000' ? '#00FF00' : '#FF0000' // Toggle red/green

          polyline.setStyle({ color: newColor })
          roadSegments[id].color = newColor
        })

        roadSegments[id] = { polyline, color, coords }
      })

      console.log('All segments loaded successfully')
    } catch (error) {
      console.error('Failed to load segments:', error)
    }

    // Request device location
    if ('geolocation' in navigator) {
      console.log('Requesting location access...')

      locationWatchId = navigator.geolocation.watchPosition(
        (position) => {
          const { latitude, longitude, accuracy } = position.coords
          console.log(`Location: ${latitude}, ${longitude} (accuracy: ${accuracy}m)`)

          // Remove old marker if it exists
          if (locationMarker) {
            map.removeLayer(locationMarker)
          }

          // Create the classic blue dot with white border
          locationMarker = L.circleMarker([latitude, longitude], {
            radius: 8,
            fillColor: '#4285F4',
            color: '#FFFFFF',
            weight: 2,
            opacity: 1,
            fillOpacity: 1
          }).addTo(map)

          // Optionally add an accuracy circle
          L.circle([latitude, longitude], {
            radius: accuracy,
            fillColor: '#4285F4',
            color: '#4285F4',
            weight: 1,
            opacity: 0.2,
            fillOpacity: 0.1
          }).addTo(map)
        },
        (error) => {
          console.error('Geolocation error:', error.message)
        },
        {
          enableHighAccuracy: true,
          maximumAge: 10000,
          timeout: 5000
        }
      )
    } else {
      console.warn('Geolocation is not available in this browser')
    }
  })

  onDestroy(() => {
    // Stop watching location
    if (locationWatchId) {
      navigator.geolocation.clearWatch(locationWatchId)
    }

    if (map) {
      map.remove()
    }
    // firebaseService.unsubscribe() // COMMENTED OUT - no Firebase
  })
</script>

<div class="map-wrapper">
  <div bind:this={mapContainer} class="map"></div>
</div>

<style>
  .map-wrapper {
    position: relative;
    width: 100%;
    height: 100%;
  }

  .map {
    width: 100%;
    height: 100%;
    z-index: 0;
  }

  .controls {
    position: fixed;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    gap: 10px;
    z-index: 1000;
    padding: 10px;
    background: rgba(255, 255, 255, 0.95);
    border-radius: 16px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }

  .control-btn {
    padding: 12px 20px;
    border: none;
    border-radius: 12px;
    font-size: 16px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    min-width: 120px;
    touch-action: manipulation;
  }

  .control-btn:active {
    transform: scale(0.95);
  }

  .finish-btn {
    background: #4CAF50;
    color: white;
  }

  .cancel-btn {
    background: #f44336;
    color: white;
  }

  .color-btn {
    color: white;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
  }

  .clear-btn {
    background: #666;
    color: white;
  }

  .color-picker {
    position: fixed;
    bottom: 100px;
    left: 50%;
    transform: translateX(-50%);
    background: white;
    border-radius: 16px;
    padding: 20px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
    z-index: 1001;
    max-width: 90vw;
    width: 320px;
  }

  .color-picker-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 15px;
  }

  .color-picker-header h3 {
    margin: 0;
    font-size: 18px;
    color: #333;
  }

  .close-btn {
    background: none;
    border: none;
    font-size: 24px;
    cursor: pointer;
    color: #666;
    padding: 0;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .color-grid {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 10px;
  }

  .color-option {
    width: 100%;
    aspect-ratio: 1;
    border: 3px solid transparent;
    border-radius: 12px;
    cursor: pointer;
    transition: all 0.2s;
    position: relative;
    touch-action: manipulation;
  }

  .color-option:active {
    transform: scale(0.9);
  }

  .color-option.selected {
    border-color: #333;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
  }

  .checkmark {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    color: white;
    font-size: 24px;
    font-weight: bold;
    text-shadow: 0 0 4px rgba(0, 0, 0, 0.5);
  }

  .instructions {
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(255, 255, 255, 0.95);
    padding: 15px 20px;
    border-radius: 12px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    z-index: 1000;
    text-align: center;
    max-width: 90vw;
  }

  .instructions p {
    margin: 5px 0;
    font-size: 14px;
    color: #333;
  }

  /* Responsive adjustments */
  @media (max-width: 480px) {
    .controls {
      bottom: 10px;
      padding: 8px;
      gap: 8px;
    }

    .control-btn {
      padding: 10px 16px;
      font-size: 14px;
      min-width: 100px;
    }

    .color-picker {
      bottom: 80px;
      width: 280px;
    }

    .color-grid {
      grid-template-columns: repeat(5, 1fr);
      gap: 8px;
    }
  }
</style>
