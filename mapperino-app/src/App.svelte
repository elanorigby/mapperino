<script>
  import Map from './lib/Map.svelte'
</script>

<main>
  <Map />
</main>

<style>
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
