<script>
  import { onMount, onDestroy } from 'svelte'
  import L from 'leaflet'
  import 'leaflet/dist/leaflet.css'
  import { firestoreService } from './firebase'

  // Props
  const { syncEnabled = false } = $props()

  let mapContainer
  let map
  let roadSegments = {}
  let locationMarker = null
  let locationWatchId = null
  let firestoreUnsubscribe = null
  let activeLabel = null // Currently displayed street label
  let segmentsLoading = $state(true)

  // Per-side segment state
  let isHighZoom = false
  const ZOOM_THRESHOLD = 18

  // Ward filtering state
  let allWards = $state([])
  let selectedWards = $state(new Set())
  let menuOpen = $state(false)

  // Search state
  let searchQuery = $state('')
  let searchResults = $state([])
  let searchLoading = $state(false)
  let searchDebounceTimer = null

  // Activity toggle state
  let currentActivity = $state('leafleting')
  const DEFAULT_COLOR = '#FF0000'

  // Admin / ward reset state
  let adminOptionsOpen = $state(false)
  let wardResetConfirm = $state(null)
  let wardResetting = $state(null)

  // Toggle ward selection
  function toggleWard(ward) {
    if (selectedWards.has(ward)) {
      selectedWards.delete(ward)
    } else {
      selectedWards.add(ward)
    }
    selectedWards = selectedWards // Trigger reactivity
    applyWardFilter()
  }

  // Select/deselect all wards
  function selectAllWards() {
    selectedWards = new Set(allWards)
    applyWardFilter()
  }

  function deselectAllWards() {
    selectedWards = new Set()
    applyWardFilter()
  }

  // Show a street name label
  function showStreetLabel(segmentId) {
    // Remove previous label if exists
    if (activeLabel) {
      map.removeLayer(activeLabel)
    }

    const segment = roadSegments[segmentId]
    if (!segment || !segment.streetName) return

    // Calculate center point for label
    const centerIdx = Math.floor(segment.coords.length / 2)
    const centerPoint = segment.coords[centerIdx]

    // Create and show label
    activeLabel = L.marker(centerPoint, {
      icon: L.divIcon({
        className: 'street-label',
        html: `<span>${segment.streetName}</span>`,
        iconSize: null
      }),
      interactive: false
    }).addTo(map)

    // Auto-hide after 5 seconds
    setTimeout(() => {
      if (activeLabel) {
        map.removeLayer(activeLabel)
        activeLabel = null
      }
    }, 5000)
  }

  // Apply the ward filter to show/hide segments
  function applyWardFilter() {
    Object.entries(roadSegments).forEach(([id, segment]) => {
      const { polyline, hitArea, ward } = segment
      const visible = selectedWards.size === 0 || selectedWards.has(ward)

      if (visible) {
        if (!map.hasLayer(polyline)) {
          polyline.addTo(map)
        }
        // Only show hit areas at high zoom
        if (isHighZoom && !map.hasLayer(hitArea)) {
          hitArea.addTo(map)
        }
      } else {
        if (map.hasLayer(polyline)) map.removeLayer(polyline)
        if (map.hasLayer(hitArea)) map.removeLayer(hitArea)
      }
    })
  }

  // Search using Nominatim API (OpenStreetMap geocoding)
  async function performSearch(query) {
    if (!query || query.trim().length < 3) {
      searchResults = []
      return
    }

    // Debounce to avoid too many API calls
    if (searchDebounceTimer) {
      clearTimeout(searchDebounceTimer)
    }

    searchDebounceTimer = setTimeout(async () => {
      searchLoading = true
      try {
        // Brent bounding box (roughly)
        const viewbox = '-0.32,51.52,-0.19,51.60'
        const url = `https://nominatim.openstreetmap.org/search?` +
          `q=${encodeURIComponent(query + ', Brent, London, UK')}` +
          `&format=json` +
          `&addressdetails=1` +
          `&limit=10` +
          `&viewbox=${viewbox}` +
          `&bounded=0`

        const response = await fetch(url, {
          headers: {
            'User-Agent': 'Mapperino App (testing)'
          }
        })
        const data = await response.json()

        searchResults = data.map(item => ({
          id: item.place_id,
          displayName: item.display_name,
          lat: parseFloat(item.lat),
          lon: parseFloat(item.lon),
          type: item.type,
          addressType: item.addresstype
        }))
      } catch (error) {
        console.error('Search error:', error)
        searchResults = []
      } finally {
        searchLoading = false
      }
    }, 300)
  }

  // Zoom to a search result from Nominatim
  function zoomToResult(result) {
    if (result.lat && result.lon) {
      map.setView([result.lat, result.lon], 17)

      // Add a temporary marker with label
      const marker = L.marker([result.lat, result.lon], {
        icon: L.divIcon({
          className: 'street-label search-result-label',
          html: `<span>${result.displayName.split(',')[0]}</span>`,
          iconSize: null
        })
      }).addTo(map)

      setTimeout(() => {
        map.removeLayer(marker)
      }, 5000)
    }
    // Clear search and close menu
    searchQuery = ''
    searchResults = []
    menuOpen = false
  }


  // Click handler for individual side segments (high zoom)
  async function handleSegmentClick(id) {
    const segment = roadSegments[id]

    const newColor = segment.color === '#00FF00' ? '#FF0000' : '#00FF00'

    // Visual feedback: pulse effect
    segment.polyline.setStyle({ weight: 8, opacity: 1 })
    setTimeout(() => {
      segment.polyline.setStyle({ weight: 5, opacity: 1 })
    }, 200)

    segment.polyline.setStyle({ color: newColor })
    segment.color = newColor

    showStreetLabel(id)

    if (syncEnabled) {
      try {
        await firestoreService.updateSegment(id, newColor, currentActivity)
      } catch (error) {
        console.error('Failed to sync segment:', error)
      }
    }
  }

  // Switch between leafleting and doorknocking
  async function switchActivity(activity) {
    if (activity === currentActivity) return
    currentActivity = activity
    wardResetConfirm = null

    if (!syncEnabled) return

    // Unsubscribe from current listener
    if (firestoreUnsubscribe) {
      firestoreUnsubscribe()
      firestoreUnsubscribe = null
    }

    // Reset all segments to default color
    Object.values(roadSegments).forEach((segment) => {
      segment.polyline.setStyle({ color: DEFAULT_COLOR })
      segment.color = DEFAULT_COLOR
    })

    // Load segment states for the new activity
    try {
      const segmentStates = await firestoreService.getSegments(currentActivity)
      Object.entries(segmentStates).forEach(([segmentId, color]) => {
        if (roadSegments[segmentId]) {
          roadSegments[segmentId].polyline.setStyle({ color })
          roadSegments[segmentId].color = color
        }
      })

      // Re-subscribe to real-time updates
      firestoreUnsubscribe = firestoreService.subscribeToSegments((updatedSegments) => {
        Object.entries(updatedSegments).forEach(([segmentId, color]) => {
          if (roadSegments[segmentId] && roadSegments[segmentId].color !== color) {
            roadSegments[segmentId].polyline.setStyle({ color })
            roadSegments[segmentId].color = color
          }
        })
      }, currentActivity)
    } catch (error) {
      console.error('Failed to switch activity:', error)
    }
  }

  function initiateWardReset(ward) {
    if (wardResetting) return
    wardResetConfirm = ward
  }

  function cancelWardReset() {
    wardResetConfirm = null
  }

  async function executeWardReset(ward) {
    wardResetConfirm = null
    wardResetting = ward

    // Collect green segment IDs in this ward
    const greenIds = Object.entries(roadSegments)
      .filter(([, seg]) => seg.ward === ward && seg.color === '#00FF00')
      .map(([id]) => id)

    if (greenIds.length === 0) {
      wardResetting = null
      return
    }

    // Optimistic local update
    greenIds.forEach(id => {
      roadSegments[id].polyline.setStyle({ color: DEFAULT_COLOR })
      roadSegments[id].color = DEFAULT_COLOR
    })

    try {
      await firestoreService.resetWardSegments(greenIds, currentActivity)
    } catch (error) {
      console.error('Failed to reset ward:', error)
      // Revert on failure
      greenIds.forEach(id => {
        roadSegments[id].polyline.setStyle({ color: '#00FF00' })
        roadSegments[id].color = '#00FF00'
      })
    } finally {
      wardResetting = null
    }
  }

  // Add/remove hit areas based on zoom level (polylines are always on the map)
  function updateZoomDisplay() {
    const wasHighZoom = isHighZoom
    isHighZoom = map.getZoom() >= ZOOM_THRESHOLD

    if (wasHighZoom === isHighZoom) return

    const wardVisible = (ward) => selectedWards.size === 0 || selectedWards.has(ward)

    Object.values(roadSegments).forEach((segment) => {
      if (isHighZoom) {
        segment.polyline.setStyle({ opacity: 1 })
        if (wardVisible(segment.ward) && !map.hasLayer(segment.hitArea)) {
          segment.hitArea.addTo(map)
        }
      } else {
        segment.polyline.setStyle({ opacity: 0.3 })
        if (map.hasLayer(segment.hitArea)) {
          map.removeLayer(segment.hitArea)
        }
      }
    })
  }

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

    // Update polyline visibility on zoom change
    map.on('zoomend', () => updateZoomDisplay())

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

      // Extract unique wards
      const wardsSet = new Set()
      geojson.features.forEach(feature => {
        if (feature.properties.ward) {
          wardsSet.add(feature.properties.ward)
        }
      })
      allWards = Array.from(wardsSet).sort()
      console.log(`Found ${allWards.length} unique wards:`, allWards)

      // Determine initial zoom state
      isHighZoom = map.getZoom() >= ZOOM_THRESHOLD

      // Process each segment
      geojson.features.forEach((feature) => {
        const { id, color, ward, name, postcodes, pair_id, side } = feature.properties
        const coords = feature.geometry.coordinates.map(coord => [coord[1], coord[0]]) // [lat, lng]

        // Visual polyline — always on the map
        const polyline = L.polyline(coords, {
          color: color,
          weight: 5,
          opacity: isHighZoom ? 1 : 0.3,
          lineJoin: 'round',
          lineCap: 'round',
          interactive: false
        }).addTo(map)

        // Invisible wider hit area for easier clicking/tapping
        const hitArea = L.polyline(coords, {
          color: 'transparent',
          weight: 25,
          opacity: 0,
          lineJoin: 'round',
          lineCap: 'round'
        })

        // In dev mode, always allow clicking; otherwise only at high zoom
        if (import.meta.env.DEV || isHighZoom) hitArea.addTo(map)

        hitArea.on('click', (e) => {
          L.DomEvent.stopPropagation(e)
          handleSegmentClick(id)
        })

        hitArea.on('touchstart', () => {
          polyline.setStyle({ weight: 8, opacity: 1 })
        })

        hitArea.on('touchend touchcancel', () => {
          setTimeout(() => {
            polyline.setStyle({ weight: 5, opacity: 1 })
          }, 200)
        })

        roadSegments[id] = {
          polyline, hitArea, color, coords, ward,
          streetName: name, postcodes,
          pairId: pair_id || null,
          side: side || null,
          properties: feature.properties
        }
      })

      console.log(`All segments loaded (${Object.keys(roadSegments).length} sides)`)
      segmentsLoading = false

      // Initialize Firestore sync if enabled
      if (syncEnabled) {
        try {
          // Load initial segment states from Firestore
          console.log('Loading segment states from Firestore...')
          const segmentStates = await firestoreService.getSegments(currentActivity)

          // Apply saved states
          Object.entries(segmentStates).forEach(([segmentId, color]) => {
            if (roadSegments[segmentId]) {
              roadSegments[segmentId].polyline.setStyle({ color })
              roadSegments[segmentId].color = color
            }
          })
          console.log(`Applied ${Object.keys(segmentStates).length} saved segment states`)

          // Subscribe to real-time updates
          firestoreUnsubscribe = firestoreService.subscribeToSegments((updatedSegments) => {
            console.log('Received Firestore update')
            Object.entries(updatedSegments).forEach(([segmentId, color]) => {
              if (roadSegments[segmentId] && roadSegments[segmentId].color !== color) {
                roadSegments[segmentId].polyline.setStyle({ color })
                roadSegments[segmentId].color = color
              }
            })
          }, currentActivity)
          console.log('Subscribed to Firestore updates')
        } catch (error) {
          console.error('Failed to initialize Firestore sync:', error)
        }
      }
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

    // Unsubscribe from Firestore
    if (firestoreUnsubscribe) {
      firestoreUnsubscribe()
    }

    if (map) {
      map.remove()
    }
  })
</script>

<div class="map-wrapper">
  <div bind:this={mapContainer} class="map"></div>

  <!-- Loading indicator -->
  {#if segmentsLoading}
    <div class="loading-overlay">
      <div class="loading-spinner"></div>
      <p>Loading segments...</p>
    </div>
  {/if}

  <!-- Activity label -->
  {#if syncEnabled}
    <div class="activity-label">
      {currentActivity === 'leafleting' ? 'Leafleting' : 'Doorknocking'}
    </div>
  {/if}

  <!-- Hamburger menu button -->
  <button class="hamburger-btn" on:click={() => menuOpen = !menuOpen}>
    <span class="hamburger-icon">☰</span>
  </button>

  <!-- Ward selection menu -->
  {#if menuOpen}
    <div class="ward-menu">
      <div class="ward-menu-header">
        <h3>Brent</h3>
        <button class="close-menu-btn" on:click={() => menuOpen = false}>✕</button>
      </div>

      <!-- Activity toggle -->
      {#if syncEnabled}
        <div class="activity-toggle">
          <button
            class="activity-toggle-btn"
            class:active={currentActivity === 'leafleting'}
            on:click={() => switchActivity('leafleting')}
          >Leafleting</button>
          <button
            class="activity-toggle-btn"
            class:active={currentActivity === 'doorknocking'}
            on:click={() => switchActivity('doorknocking')}
          >Doorknocking</button>
        </div>
      {/if}

      <!-- Search section -->
      <div class="search-section">
        <input
          type="text"
          class="search-input"
          placeholder="Search by street name or postcode..."
          bind:value={searchQuery}
          on:input={() => performSearch(searchQuery)}
        />
        {#if searchLoading}
          <div class="no-results">Searching...</div>
        {:else if searchResults.length > 0}
          <div class="search-results">
            {#each searchResults as result}
              <button class="search-result-item" on:click={() => zoomToResult(result)}>
                <span class="result-name">{result.displayName}</span>
              </button>
            {/each}
          </div>
        {:else if searchQuery.length >= 3 && !searchLoading}
          <div class="no-results">No results found</div>
        {/if}
      </div>

      <div class="ward-menu-section-header">Filter by Ward (improves performance)</div>

      <div class="ward-menu-controls">
        <button class="menu-action-btn" on:click={selectAllWards}>Select All</button>
        <button class="menu-action-btn" on:click={deselectAllWards}>Clear All</button>
      </div>

      <div class="ward-list">
        {#each allWards as ward}
          <label class="ward-item">
            <input
              type="checkbox"
              checked={selectedWards.has(ward)}
              on:change={() => toggleWard(ward)}
            />
            <span>{ward}</span>
          </label>
        {/each}
      </div>

      {#if syncEnabled}
        <div class="admin-toggle" on:click={() => adminOptionsOpen = !adminOptionsOpen}>
          Admin Options {adminOptionsOpen ? '▾' : '▸'}
        </div>
        {#if adminOptionsOpen}
          <div class="admin-section">
            <p class="admin-description">Reset all progress in a ward back to red</p>
            {#each allWards as ward}
              <div class="admin-ward-item">
                <span>{ward}</span>
                <button
                  class="ward-reset-btn"
                  class:resetting={wardResetting === ward}
                  disabled={wardResetting === ward}
                  on:click={() => initiateWardReset(ward)}
                >{wardResetting === ward ? 'Resetting...' : 'Reset'}</button>
              </div>
            {/each}
          </div>
        {/if}
      {/if}

      <div class="ward-menu-footer">
        <p>{selectedWards.size === 0 ? 'All wards' : `${selectedWards.size} ward${selectedWards.size === 1 ? '' : 's'} selected`}</p>
      </div>
    </div>
  {/if}

  <!-- Reset confirmation dialog -->
  {#if wardResetConfirm}
    <div class="dialog-overlay" on:click={cancelWardReset}>
      <div class="dialog" on:click|stopPropagation>
        <p class="dialog-message">This will reset <strong>{wardResetConfirm}</strong> to red, is that what you want to do?</p>
        <div class="dialog-buttons">
          <button class="dialog-btn dialog-cancel" on:click={cancelWardReset}>Cancel</button>
          <button class="dialog-btn dialog-confirm" on:click={() => executeWardReset(wardResetConfirm)}>Confirm</button>
        </div>
      </div>
    </div>
  {/if}
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

  /* Ward filtering menu styles */
  .hamburger-btn {
    position: fixed;
    top: 20px;
    right: 20px;
    z-index: 1000;
    background: white;
    border: none;
    border-radius: 8px;
    width: 48px;
    height: 48px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
    transition: all 0.2s;
  }

  .hamburger-btn:hover {
    background: #f5f5f5;
  }

  .hamburger-btn:active {
    transform: scale(0.95);
  }

  .hamburger-icon {
    font-size: 24px;
    color: #333;
  }

  .activity-label {
    position: fixed;
    top: 20px;
    right: 78px;
    z-index: 1000;
    background: white;
    border-radius: 24px;
    height: 48px;
    padding: 0 16px;
    display: flex;
    align-items: center;
    font-size: 14px;
    font-weight: 600;
    color: #333;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  }

  .activity-toggle {
    display: flex;
    gap: 0;
    background: #f0f0f0;
    border-radius: 8px;
    padding: 3px;
    margin: 0 16px 12px;
  }

  .activity-toggle-btn {
    flex: 1;
    padding: 8px 12px;
    border: none;
    border-radius: 6px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    background: transparent;
    color: #666;
    transition: all 0.2s;
  }

  .activity-toggle-btn.active {
    background: white;
    color: #333;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }

  .ward-menu {
    position: fixed;
    top: 80px;
    right: 20px;
    width: 300px;
    max-height: calc(100vh - 120px);
    background: white;
    border-radius: 12px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
    z-index: 1000;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .ward-menu-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px;
    border-bottom: 1px solid #e0e0e0;
  }

  .ward-menu-header h3 {
    margin: 0;
    font-size: 18px;
    color: #333;
  }

  .search-section {
    padding: 12px 16px;
    border-bottom: 1px solid #e0e0e0;
  }

  .search-input {
    width: 100%;
    padding: 10px 12px;
    border: 1px solid #ddd;
    border-radius: 6px;
    font-size: 14px;
    box-sizing: border-box;
  }

  .search-input:focus {
    outline: none;
    border-color: #4285F4;
    box-shadow: 0 0 0 2px rgba(66, 133, 244, 0.2);
  }

  .search-results {
    margin-top: 8px;
    max-height: 200px;
    overflow-y: auto;
  }

  .search-result-item {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    width: 100%;
    padding: 10px 12px;
    background: #f9f9f9;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    margin-bottom: 4px;
    text-align: left;
    transition: background 0.2s;
  }

  .search-result-item:hover {
    background: #e8f0fe;
  }

  .result-name {
    font-size: 14px;
    font-weight: 500;
    color: #333;
  }

  .result-postcodes {
    font-size: 12px;
    color: #666;
    margin-top: 2px;
  }

  .no-results {
    padding: 12px;
    text-align: center;
    color: #666;
    font-size: 14px;
  }

  .ward-menu-section-header {
    padding: 12px 16px 8px;
    font-size: 14px;
    font-weight: 600;
    color: #666;
    border-bottom: 1px solid #e0e0e0;
  }

  .close-menu-btn {
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
    border-radius: 4px;
  }

  .close-menu-btn:hover {
    background: #f5f5f5;
  }

  .ward-menu-controls {
    display: flex;
    gap: 8px;
    padding: 12px 16px;
    border-bottom: 1px solid #e0e0e0;
  }

  .menu-action-btn {
    flex: 1;
    padding: 8px 12px;
    background: #f5f5f5;
    border: none;
    border-radius: 6px;
    font-size: 14px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .menu-action-btn:hover {
    background: #e0e0e0;
  }

  .menu-action-btn:active {
    transform: scale(0.95);
  }

  .ward-list {
    flex: 1;
    overflow-y: auto;
    padding: 8px;
  }

  .ward-item {
    display: flex;
    align-items: center;
    padding: 10px 12px;
    cursor: pointer;
    border-radius: 6px;
    transition: background 0.2s;
  }

  .ward-item:hover {
    background: #f5f5f5;
  }

  .ward-item input[type="checkbox"] {
    margin-right: 12px;
    width: 18px;
    height: 18px;
    cursor: pointer;
  }

  .ward-item span {
    font-size: 14px;
    color: #333;
  }

  .ward-menu-footer {
    padding: 12px 16px;
    border-top: 1px solid #e0e0e0;
    background: #f9f9f9;
  }

  .ward-menu-footer p {
    margin: 0;
    font-size: 13px;
    color: #666;
    text-align: center;
  }

  /* Admin options */
  .admin-toggle {
    padding: 12px 16px;
    font-size: 14px;
    font-weight: 600;
    color: #666;
    cursor: pointer;
    border-top: 1px solid #e0e0e0;
    transition: background 0.2s;
  }

  .admin-toggle:hover {
    background: #f5f5f5;
  }

  .admin-section {
    max-height: 200px;
    overflow-y: auto;
    padding: 0 8px 8px;
  }

  .admin-description {
    margin: 0 8px 8px;
    font-size: 12px;
    color: #999;
  }

  .admin-ward-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 8px;
    border-radius: 6px;
  }

  .admin-ward-item span {
    font-size: 14px;
    color: #333;
  }

  .ward-reset-btn {
    padding: 4px 12px;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-size: 12px;
    cursor: pointer;
    background: #f5f5f5;
    color: #666;
    transition: all 0.2s;
    flex-shrink: 0;
  }

  .ward-reset-btn:hover {
    background: #e0e0e0;
  }

  .ward-reset-btn.resetting {
    background: #e0e0e0;
    color: #999;
    cursor: not-allowed;
    border-color: #ddd;
  }

  /* Reset confirmation dialog */
  .dialog-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    z-index: 2000;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .dialog {
    background: white;
    border-radius: 12px;
    padding: 24px;
    max-width: 320px;
    width: calc(100% - 40px);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
  }

  .dialog-message {
    margin: 0 0 20px;
    font-size: 15px;
    color: #333;
    line-height: 1.4;
  }

  .dialog-buttons {
    display: flex;
    gap: 10px;
    justify-content: flex-end;
  }

  .dialog-btn {
    padding: 10px 20px;
    border: none;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
  }

  .dialog-cancel {
    background: #f0f0f0;
    color: #333;
  }

  .dialog-cancel:hover {
    background: #e0e0e0;
  }

  .dialog-confirm {
    background: #d32f2f;
    color: white;
  }

  .dialog-confirm:hover {
    background: #b71c1c;
  }

  /* Loading overlay */
  .loading-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(255, 255, 255, 0.95);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    z-index: 2000;
  }

  .loading-spinner {
    width: 50px;
    height: 50px;
    border: 4px solid #e0e0e0;
    border-top: 4px solid #4285F4;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }

  .loading-overlay p {
    margin-top: 16px;
    font-size: 16px;
    color: #666;
  }

  /* Street name labels */
  :global(.street-label) {
    background: none !important;
    border: none !important;
    pointer-events: none;
  }

  :global(.street-label span) {
    display: block;
    padding: 2px 6px;
    background: rgba(255, 255, 255, 0.9);
    border: 1px solid #666;
    border-radius: 3px;
    font-size: 11px;
    font-weight: 600;
    color: #333;
    white-space: nowrap;
    text-shadow: 0 0 2px white;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
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

    .hamburger-btn {
      top: 10px;
      right: 10px;
      width: 44px;
      height: 44px;
    }

    .ward-menu {
      top: 10px;
      right: 10px;
      left: 10px;
      width: auto;
      max-height: calc(100vh - 20px);
    }
  }
</style>
