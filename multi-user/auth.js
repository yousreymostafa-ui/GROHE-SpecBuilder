(() => {
  'use strict';

  const config = window.GROHE_SUPABASE_CONFIG || {};
  let client = null;
  let currentUser = null;
  let currentProfile = null;
  let initialized = false;
  let resolveReady;
  const readyPromise = new Promise(resolve => { resolveReady = resolve; });
  const loginWaiters = [];

  const $ = id => document.getElementById(id);
  const configured = () => /^https:\/\/.+\.supabase\.co\/?$/i.test(String(config.url || '').trim()) && String(config.anonKey || '').trim().length > 20;
  const nowIso = () => new Date().toISOString();

  function setMessage(message, type='info') {
    const el = $('authMessage');
    if (!el) return;
    el.textContent = message || '';
    el.dataset.type = type;
    el.hidden = !message;
  }

  function setProfileMessage(message, type='info') {
    const el = $('profileMessage');
    if (!el) return;
    el.textContent = message || '';
    el.dataset.type = type;
    el.hidden = !message;
  }

  function showGate(mode='login') {
    const gate = $('authGate');
    if (!gate) return;
    gate.hidden = false;
    gate.dataset.mode = mode;
    document.body.classList.add('auth-locked');
  }

  function hideGate() {
    const gate = $('authGate');
    if (!gate) return;
    gate.hidden = true;
    document.body.classList.remove('auth-locked');
  }

  function updateAccountUi() {
    const email = currentUser?.email || 'Not signed in';
    if ($('settingsUserEmail')) $('settingsUserEmail').textContent = email;
    if ($('profileCurrentEmail')) $('profileCurrentEmail').textContent = email;
    if ($('profileEmail')) $('profileEmail').value = email;
    if ($('profileDisplayName')) $('profileDisplayName').value = currentProfile?.display_name || currentUser?.user_metadata?.display_name || '';
    const initials = (currentProfile?.display_name || email || 'U').trim().split(/\s+/).map(x=>x[0]||'').join('').slice(0,2).toUpperCase();
    if ($('profileAvatar')) $('profileAvatar').textContent = initials || 'U';
  }

  async function loadProfile() {
    currentProfile = null;
    if (!client || !currentUser) { updateAccountUi(); return null; }
    const { data, error } = await client.from('profiles').select('id,display_name,created_at,updated_at').eq('id', currentUser.id).maybeSingle();
    if (error) console.warn('Profile read failed:', error.message);
    if (data) currentProfile = data;
    else {
      const displayName = currentUser.user_metadata?.display_name || '';
      const { data: inserted, error: insertError } = await client.from('profiles').insert({ id: currentUser.id, display_name: displayName }).select('id,display_name,created_at,updated_at').single();
      if (insertError) console.warn('Profile creation failed:', insertError.message);
      else currentProfile = inserted;
    }
    updateAccountUi();
    return currentProfile;
  }

  function resolveLoginWaiters(session) {
    while (loginWaiters.length) {
      try { loginWaiters.shift()(session); } catch (_) {}
    }
  }

  async function applySession(session) {
    currentUser = session?.user || null;
    if (currentUser) {
      await loadProfile();
      hideGate();
      resolveLoginWaiters(session);
    } else {
      currentProfile = null;
      updateAccountUi();
      showGate('login');
    }
  }

  async function initialize() {
    if (initialized) return readyPromise;
    initialized = true;
    bindUi();

    if (!configured()) {
      showGate('setup');
      const setup = $('authSetupHelp');
      if (setup) setup.hidden = false;
      const form = $('authForm');
      if (form) form.hidden = true;
      setMessage('Cloud login is not configured yet. Add your Supabase Project URL and anon key in supabase-config.js.', 'warning');
      resolveReady({ configured: false, session: null });
      return readyPromise;
    }

    if (!window.supabase?.createClient) {
      showGate('setup');
      setMessage('Could not load the Supabase login library. Check your internet connection and reload.', 'error');
      resolveReady({ configured: false, session: null });
      return readyPromise;
    }

    client = window.supabase.createClient(config.url.trim(), config.anonKey.trim(), {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });

    const { data, error } = await client.auth.getSession();
    if (error) console.warn('Session read failed:', error.message);
    await applySession(data?.session || null);

    client.auth.onAuthStateChange((event, session) => {
      setTimeout(async () => {
        await applySession(session || null);
        if (event === 'PASSWORD_RECOVERY' && session) openProfile(true);
      }, 0);
    });

    resolveReady({ configured: true, session: data?.session || null });
    return readyPromise;
  }

  async function requireSession() {
    const status = await initialize();
    if (!status?.configured) return null;
    if (currentUser) {
      const { data } = await client.auth.getSession();
      return data?.session || null;
    }
    showGate('login');
    return new Promise(resolve => loginWaiters.push(resolve));
  }

  async function signIn(email, password) {
    setMessage('Signing in…');
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    await applySession(data.session);
    setMessage('');
    return data.session;
  }

  async function signUp(email, password, displayName='') {
    if (config.allowSignUp === false) throw new Error('Account creation is disabled. Ask the administrator to create your account.');
    setMessage('Creating account…');
    const { data, error } = await client.auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName || '' } }
    });
    if (error) throw error;
    if (data.session) {
      await applySession(data.session);
      setMessage('');
    } else {
      setMessage('Account created. Check your email to confirm the account, then sign in.', 'success');
    }
    return data;
  }

  async function signOut() {
    if (!client) return;
    await client.auth.signOut();
    currentUser = null;
    currentProfile = null;
    location.reload();
  }

  async function resetPassword(email) {
    if (!email) throw new Error('Enter your email address first.');
    const redirectTo = `${location.origin}${location.pathname}`;
    const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) throw error;
    setMessage('Password reset email sent.', 'success');
  }

  function openProfile(passwordRecovery=false) {
    updateAccountUi();
    setProfileMessage(passwordRecovery ? 'Enter a new password below to finish password recovery.' : '');
    const dialog = $('profileDialog');
    if (dialog && !dialog.open) dialog.showModal();
  }

  async function saveProfile() {
    if (!client || !currentUser) return;
    const displayName = String($('profileDisplayName')?.value || '').trim();
    const newEmail = String($('profileEmail')?.value || '').trim();
    const newPassword = String($('profileNewPassword')?.value || '');
    setProfileMessage('Saving…');

    const { data: profileData, error: profileError } = await client.from('profiles')
      .upsert({ id: currentUser.id, display_name: displayName, updated_at: nowIso() })
      .select('id,display_name,created_at,updated_at').single();
    if (profileError) throw profileError;
    currentProfile = profileData;

    const authUpdates = { data: { display_name: displayName } };
    if (newEmail && newEmail.toLowerCase() !== String(currentUser.email || '').toLowerCase()) authUpdates.email = newEmail;
    if (newPassword) authUpdates.password = newPassword;
    const { data, error } = await client.auth.updateUser(authUpdates);
    if (error) throw error;
    currentUser = data.user || currentUser;
    if ($('profileNewPassword')) $('profileNewPassword').value = '';
    updateAccountUi();
    setProfileMessage(authUpdates.email ? 'Saved. Check your new email address for the confirmation link.' : 'Profile saved.', 'success');
  }

  function requireUser() {
    if (!currentUser) throw new Error('You must be signed in.');
    return currentUser;
  }

  async function listProjects() {
    const user = requireUser();
    const { data, error } = await client.from('projects').select('id,data,updated_at').eq('user_id', user.id).order('updated_at', { ascending: false });
    if (error) throw error;
    return (data || []).map(row => ({ ...(row.data || {}), id: row.id })).filter(x => x.id);
  }

  async function getProject(id) {
    const user = requireUser();
    const { data, error } = await client.from('projects').select('id,data').eq('user_id', user.id).eq('id', String(id)).maybeSingle();
    if (error) throw error;
    return data ? { ...(data.data || {}), id: data.id } : undefined;
  }

  async function putProject(project) {
    const user = requireUser();
    if (!project?.id) throw new Error('Project id is required.');
    const createdAt = project.createdAt || nowIso();
    const updatedAt = project.updatedAt || nowIso();
    const payload = {
      user_id: user.id,
      id: String(project.id),
      name: String(project.name || 'Untitled project'),
      customer: String(project.customer || ''),
      archived: !!project.archived,
      created_at: createdAt,
      updated_at: updatedAt,
      data: project
    };
    const { error } = await client.from('projects').upsert(payload, { onConflict: 'user_id,id' });
    if (error) throw error;
    return project;
  }

  async function deleteProject(id) {
    const user = requireUser();
    const { error } = await client.from('projects').delete().eq('user_id', user.id).eq('id', String(id));
    if (error) throw error;
  }

  async function clearProjects() {
    const user = requireUser();
    const { error } = await client.from('projects').delete().eq('user_id', user.id);
    if (error) throw error;
  }

  function bindUi() {
    const form = $('authForm');
    if (form) form.onsubmit = async e => {
      e.preventDefault();
      const email = String($('authEmail')?.value || '').trim();
      const password = String($('authPassword')?.value || '');
      try { await signIn(email, password); }
      catch (err) { setMessage(err?.message || 'Could not sign in.', 'error'); }
    };

    const signup = $('btnCreateAccount');
    if (signup) {
      signup.hidden = config.allowSignUp === false;
      signup.onclick = async () => {
        const email = String($('authEmail')?.value || '').trim();
        const password = String($('authPassword')?.value || '');
        const name = String($('authDisplayName')?.value || '').trim();
        if (!email || !password) { setMessage('Enter an email and password first.', 'warning'); return; }
        try { await signUp(email, password, name); }
        catch (err) { setMessage(err?.message || 'Could not create account.', 'error'); }
      };
    }

    const forgot = $('btnForgotPassword');
    if (forgot) forgot.onclick = async () => {
      try { await resetPassword(String($('authEmail')?.value || '').trim()); }
      catch (err) { setMessage(err?.message || 'Could not send reset email.', 'error'); }
    };

    if ($('btnProfile')) $('btnProfile').onclick = () => openProfile(false);
    if ($('btnProfileHeader')) $('btnProfileHeader').onclick = () => openProfile(false);
    if ($('btnSignOut')) $('btnSignOut').onclick = signOut;
    if ($('btnProfileSignOut')) $('btnProfileSignOut').onclick = signOut;
    if ($('btnSaveProfile')) $('btnSaveProfile').onclick = async () => {
      try { await saveProfile(); }
      catch (err) { setProfileMessage(err?.message || 'Could not save profile.', 'error'); }
    };
  }

  window.GROHEAuth = Object.freeze({
    initialize,
    ready: () => readyPromise,
    requireSession,
    isConfigured: configured,
    isSignedIn: () => !!currentUser,
    getUser: () => currentUser,
    getProfile: () => currentProfile,
    getClient: () => client,
    openProfile,
    signOut,
    listProjects,
    getProject,
    putProject,
    deleteProject,
    clearProjects
  });
})();
