(() => {
  'use strict';

  // Capture the same Supabase client app.js creates, then replace only the login UI.
  const supabaseLib = window.supabase;
  if (!supabaseLib?.createClient) return;

  const originalCreateClient = supabaseLib.createClient.bind(supabaseLib);
  supabaseLib.createClient = (...args) => {
    const client = originalCreateClient(...args);
    window.__EXAMFLOW_AUTH_CLIENT__ = client;
    return client;
  };

  async function isApproved(client, email) {
    const { data, error } = await client.rpc('signup_email_allowed', { p_email: email });
    if (error) throw new Error(`Approval check failed: ${error.message}`);
    return data === true;
  }

  function setMessage(form, text, isError = false) {
    const el = form.querySelector('#auth-message');
    if (!el) return;
    el.textContent = text;
    el.classList.toggle('form-error', isError);
  }

  function renderAuthForm(form, mode = 'signin') {
    if (!form) return;

    form.dataset.passwordAuth = '1';
    form.dataset.authMode = mode;
    form.onsubmit = null; // removes the previous magic-link handler

    const signup = mode === 'signup';

    form.innerHTML = `
      <h2>${signup ? 'Create your account' : 'Welcome back'}</h2>
      <p class="small muted">Only pre-approved faculty emails can access BME Workflow.</p>

      <label class="field">
        <span>Approved faculty email</span>
        <input type="email" name="email" autocomplete="email" placeholder="you@university.edu" required>
      </label>

      <label class="field">
        <span>Password</span>
        <input type="password" name="password"
               autocomplete="${signup ? 'new-password' : 'current-password'}"
               minlength="8" required>
      </label>

      ${signup ? `
      <label class="field">
        <span>Confirm password</span>
        <input type="password" name="confirm_password"
               autocomplete="new-password" minlength="8" required>
      </label>` : ''}

      <button class="button primary" type="submit">
        ${signup ? 'Create account' : 'Sign in'}
      </button>

      <button class="text-button" type="button"
              data-auth-switch="${signup ? 'signin' : 'signup'}">
        ${signup ? 'Already have an account? Sign in' : 'First time here? Create your account'}
      </button>

      <p class="small muted">
        ${signup
          ? 'Your email must already be on the department allowlist.'
          : 'Use the password you chose when creating your account.'}
      </p>

      <p id="auth-message" role="status"></p>
    `;

    form.querySelector('[data-auth-switch]')?.addEventListener('click', event => {
      renderAuthForm(form, event.currentTarget.dataset.authSwitch);
    });

    form.onsubmit = handleSubmit;
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const form = event.currentTarget;
    const client = window.__EXAMFLOW_AUTH_CLIENT__;

    if (!client) {
      setMessage(form, 'Authentication is still loading. Refresh the page and try again.', true);
      return;
    }

    const fd = new FormData(form);
    const email = String(fd.get('email') || '').trim().toLowerCase();
    const password = String(fd.get('password') || '');
    const mode = form.dataset.authMode || 'signin';
    const submit = form.querySelector('button[type="submit"]');

    if (!email || !password) return;

    if (password.length < 8) {
      setMessage(form, 'Use a password with at least 8 characters.', true);
      return;
    }

    if (mode === 'signup' && password !== String(fd.get('confirm_password') || '')) {
      setMessage(form, 'The two passwords do not match.', true);
      return;
    }

    submit.disabled = true;
    const oldLabel = submit.textContent;
    submit.textContent = mode === 'signup' ? 'Creating account…' : 'Signing in…';
    setMessage(form, '');

    try {
      if (!await isApproved(client, email)) {
        throw new Error(
          'This email is not authorized for BME Workflow. Contact the department administrator.'
        );
      }

      if (mode === 'signup') {
        const { data, error } = await client.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: location.origin + location.pathname
          }
        });

        if (error) throw error;

        if (data?.session) {
          setMessage(form, 'Account created. Opening your workspace…');
        } else {
          setMessage(
            form,
            'Account created. Check your email once to confirm the address. Then return here and sign in with your password.'
          );
        }
      } else {
        const { error } = await client.auth.signInWithPassword({ email, password });
        if (error) throw error;
        setMessage(form, 'Signed in. Opening your workspace…');
      }
    } catch (error) {
      setMessage(form, error?.message || 'Authentication failed.', true);
    } finally {
      submit.disabled = false;
      submit.textContent = oldLabel;
    }
  }

  function patchLoginForm() {
    const form = document.querySelector('#login');
    if (form && form.dataset.passwordAuth !== '1') {
      renderAuthForm(form, 'signin');
    }
  }

  // app.js creates/recreates the login screen. Patch it whenever it appears.
  const observer = new MutationObserver(patchLoginForm);
  observer.observe(document.documentElement, { childList: true, subtree: true });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', patchLoginForm, { once: true });
  } else {
    patchLoginForm();
  }
})();
