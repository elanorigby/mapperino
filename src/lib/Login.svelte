<script>
  let password = $state('')
  let error = $state('')

  const { onSuccess } = $props()

  function handleSubmit(e) {
    e.preventDefault()

    const correctPassword = import.meta.env.VITE_APP_PASSWORD

    if (password === correctPassword) {
      localStorage.setItem('mapperino_auth', 'true')
      onSuccess()
    } else {
      error = 'Incorrect password'
      password = ''
    }
  }
</script>

<div class="login-container">
  <div class="login-box">
    <h1>Mapperino</h1>
    <p>Enter password to continue</p>

    <form onsubmit={handleSubmit}>
      <input
        type="password"
        bind:value={password}
        placeholder="Password"
        class="password-input"
        autocomplete="current-password"
      />

      {#if error}
        <p class="error">{error}</p>
      {/if}

      <button type="submit" class="login-btn">Enter</button>
    </form>
  </div>
</div>

<style>
  .login-container {
    width: 100vw;
    height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #f5f5f5;
  }

  .login-box {
    background: white;
    padding: 40px;
    border-radius: 12px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
    text-align: center;
    max-width: 320px;
    width: 90%;
  }

  h1 {
    margin: 0 0 8px 0;
    font-size: 28px;
    color: #333;
  }

  p {
    margin: 0 0 24px 0;
    color: #666;
    font-size: 14px;
  }

  form {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .password-input {
    padding: 12px 16px;
    border: 1px solid #ddd;
    border-radius: 8px;
    font-size: 16px;
    width: 100%;
    box-sizing: border-box;
  }

  .password-input:focus {
    outline: none;
    border-color: #4285F4;
    box-shadow: 0 0 0 2px rgba(66, 133, 244, 0.2);
  }

  .login-btn {
    padding: 12px 24px;
    background: #4285F4;
    color: white;
    border: none;
    border-radius: 8px;
    font-size: 16px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.2s;
  }

  .login-btn:hover {
    background: #3367d6;
  }

  .login-btn:active {
    transform: scale(0.98);
  }

  .error {
    color: #d93025;
    margin: 0;
    font-size: 14px;
  }
</style>
