<script>
  import Map from './lib/Map.svelte'
  import Login from './lib/Login.svelte'

  // Determine which mode based on URL path
  const path = window.location.pathname
  const isDemo = path.includes('/demo')
  const isBrent = path.includes('/brent')

  // Demo mode: no login required, no sync
  // Brent mode: login required, will sync
  // Root path: redirect to demo for now
  let mode = $state(isDemo ? 'demo' : isBrent ? 'brent' : 'landing')

  // Check if already authenticated (only matters for brent mode)
  let isAuthenticated = $state(localStorage.getItem('mapperino_auth') === 'true')

  function handleLoginSuccess() {
    isAuthenticated = true
  }
</script>

<main>
  {#if mode === 'demo'}
    <Map syncEnabled={false} />
  {:else if mode === 'brent'}
    {#if isAuthenticated}
      <Map syncEnabled={true} />
    {:else}
      <Login onSuccess={handleLoginSuccess} />
    {/if}
  {:else}
    <div class="landing">
      <h1>Mapperino</h1>
      <p>Street by street progress tracker</p>
      <div class="links">
        <a href="./demo/">Demo</a>
        <a href="./brent/">Brent</a>
      </div>
    </div>
  {/if}
</main>

<style>
  .landing {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100vh;
    text-align: center;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  }

  .landing h1 {
    margin: 0 0 8px 0;
    font-size: 36px;
    color: #333;
  }

  .landing p {
    margin: 0 0 32px 0;
    color: #666;
  }

  .links {
    display: flex;
    gap: 16px;
  }

  .links a {
    padding: 12px 24px;
    background: #4285F4;
    color: white;
    text-decoration: none;
    border-radius: 8px;
    font-weight: 600;
    transition: background 0.2s;
  }

  .links a:hover {
    background: #3367d6;
  }

  :global(body) {
    margin: 0;
    padding: 0;
    overflow: hidden;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
  }

  main {
    width: 100vw;
    height: 100vh;
    display: flex;
    flex-direction: column;
  }
</style>
