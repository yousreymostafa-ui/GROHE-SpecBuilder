(async()=>{
  'use strict';
  try{
    const response=await fetch('../index.html',{cache:'no-store'});
    if(!response.ok) throw new Error('Could not load the main SpecBuilder application.');
    let html=await response.text();

    html=html.replace('<head>','<head><base href="../"><link rel="stylesheet" href="multi-user/auth.css">');

    const authGate=`
<section id="authGate" class="auth-gate" hidden aria-label="Sign in to GROHE SpecBuilder">
  <div class="auth-card">
    <div class="auth-brand">
      <div class="auth-logo">GROHE</div>
      <div><strong>GROHE SpecBuilder</strong><span>Professional project specification workspace</span></div>
    </div>
    <div id="authSetupHelp" class="auth-setup-help" hidden>
      <strong>One-time cloud setup required</strong>
      <p>Connect this release to Supabase in <code>multi-user/supabase-config.js</code>, then reload.</p>
    </div>
    <form id="authForm" class="auth-form">
      <div class="auth-title"><h1>Sign in</h1><p>Your projects are private and saved to your own account.</p></div>
      <label><span>Name <small>(for new accounts)</small></span><input id="authDisplayName" autocomplete="name" placeholder="Your name"></label>
      <label><span>Email</span><input id="authEmail" type="email" autocomplete="username" placeholder="name@company.com" required></label>
      <label><span>Password</span><input id="authPassword" type="password" autocomplete="current-password" placeholder="Password" required></label>
      <div id="authMessage" class="auth-message" hidden></div>
      <button class="btn primary auth-primary" type="submit">Sign in</button>
      <div class="auth-secondary-actions"><button type="button" class="text-btn" id="btnCreateAccount">Create account</button><button type="button" class="text-btn" id="btnForgotPassword">Forgot password?</button></div>
    </form>
  </div>
</section>`;
    html=html.replace('<body>','<body class="auth-locked">'+authGate);

    const profileMarkup=`
<button type="button" id="btnProfileHeader" class="multi-user-account-btn" title="Profile & login details">Account</button>
<dialog id="profileDialog" class="modal medium profile-dialog">
  <div class="modal-header"><div><div class="eyebrow">ACCOUNT</div><h3>Profile & Login Details</h3></div><button class="icon-btn" data-close="profileDialog">✕</button></div>
  <div class="modal-body profile-body">
    <div class="profile-summary"><div class="profile-avatar" id="profileAvatar">U</div><div><strong id="profileCurrentEmail">—</strong><small>Projects are stored privately under this account.</small></div></div>
    <label class="field full"><span>Display name</span><input id="profileDisplayName" autocomplete="name"></label>
    <label class="field full"><span>Email</span><input id="profileEmail" type="email" autocomplete="email"><small>Changing email may require confirmation.</small></label>
    <label class="field full"><span>New password</span><input id="profileNewPassword" type="password" autocomplete="new-password" placeholder="Leave blank to keep current password"><small>Use at least 8 characters.</small></label>
    <div class="profile-storage-card"><span>Project storage</span><strong>Private cloud storage</strong><small>Only this signed-in user can read, edit or delete these projects.</small></div>
    <div id="profileMessage" class="auth-message" hidden></div>
  </div>
  <div class="modal-footer"><button type="button" class="btn danger-text" id="btnProfileSignOut">Sign out</button><button type="button" class="btn primary" id="btnSaveProfile">Save profile</button></div>
</dialog>`;
    html=html.replace('</body>',profileMarkup+'</body>');

    const scriptClose='</scr'+'ipt>';
    const coreTag='<script src="core.js">'+scriptClose;
    const storageTag='<script src="storage.js">'+scriptClose;
    const appTag='<script src="app.js">'+scriptClose;

    const authScripts='<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2">'+scriptClose+
      '<script src="multi-user/supabase-config.js">'+scriptClose+
      '<script src="multi-user/auth.js">'+scriptClose+
      coreTag;

    html=html.replace(coreTag,authScripts);
    html=html.replace(storageTag,'<script src="multi-user/storage.js">'+scriptClose);
    html=html.replace(appTag,'<script src="multi-user/boot.js">'+scriptClose);

    document.open();
    document.write(html);
    document.close();
  }catch(err){
    document.body.innerHTML='<div class="route-loader"><div><strong>Could not load GROHE SpecBuilder</strong><span>'+String(err?.message||err)+'</span></div></div>';
  }
})();
