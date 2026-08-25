(async()=>{
'use strict';
try{
 const RELEASE='20260826-1';
 const response=await fetch('../index.html',{cache:'no-store'});if(!response.ok)throw new Error('Could not load the main SpecBuilder application.');let html=await response.text();
 html=html.replace('<head>','<head><base href="../"><link rel="stylesheet" href="multi-user/auth.css?v='+RELEASE+'">');
 const accountButton='<button type="button" id="btnProfileHeader" class="multi-user-account-btn">Sign in</button>';
 const accountMarkup=`
<dialog id="accountDialog" class="account-dialog">
  <div class="account-shell">
    <button class="account-close" data-close-account aria-label="Close">×</button>
    <div class="account-side"><div class="account-logo">GROHE</div><h2>Use SpecBuilder anywhere</h2><p>Signing in is optional. Guests can use the full builder and save projects on this browser.</p><ul><li>Sync projects across devices</li><li>Keep a private cloud project library</li><li>Manage your profile and login details</li></ul><button id="btnContinueGuest" class="guest-btn" type="button">Continue as guest</button></div>
    <div class="account-main">
      <div id="authSignInView"><div class="account-title"><h1>Welcome back</h1><p>Sign in to open your cloud projects.</p></div><form id="authSignInForm" class="account-form"><label>Email<input id="authEmail" type="email" autocomplete="username" placeholder="name@company.com" required></label><label>Password<input id="authPassword" type="password" autocomplete="current-password" placeholder="Your password" required></label><button class="account-primary" type="submit">Sign in</button></form><button class="account-link forgot" id="btnShowForgot" type="button">Forgot your password?</button><div class="account-divider"><span>New to SpecBuilder?</span></div><button class="account-secondary" id="btnShowSignUp" type="button">Create free account</button></div>
      <div id="authSignUpView" hidden><div class="account-title"><h1>Create account</h1><p>Your account gives you private cloud projects. The builder remains free to use as a guest.</p></div><form id="authSignUpForm" class="account-form"><label>Name<input id="authSignupName" autocomplete="name" placeholder="Your name"></label><label>Email<input id="authSignupEmail" type="email" autocomplete="email" placeholder="name@company.com" required></label><label>Password<input id="authSignupPassword" type="password" autocomplete="new-password" placeholder="At least 8 characters" required></label><button class="account-primary" type="submit">Create account</button></form><button class="account-link" id="btnShowSignIn" type="button">← Back to sign in</button></div>
      <div id="authForgotView" hidden><div class="account-title"><h1>Reset password</h1><p>Enter your account email and we’ll send you a secure reset link.</p></div><form id="authForgotForm" class="account-form"><label>Email<input id="authForgotEmail" type="email" autocomplete="email" placeholder="name@company.com" required></label><button class="account-primary" type="submit">Send reset link</button></form><button class="account-link" id="btnBackSignIn" type="button">← Back to sign in</button></div>
      <div id="authMessage" class="auth-message" hidden></div>
    </div>
  </div>
</dialog>
<dialog id="profileDialog" class="modal medium profile-dialog"><div class="modal-header"><div><div class="eyebrow">ACCOUNT</div><h3>Profile & Login Details</h3></div><button class="icon-btn" data-close="profileDialog">✕</button></div><div class="modal-body profile-body"><div class="profile-summary"><div class="profile-avatar" id="profileAvatar">U</div><div><strong id="profileCurrentEmail">—</strong><small>Your projects are stored privately under this account.</small></div></div><label class="field full"><span>Display name</span><input id="profileDisplayName" autocomplete="name"></label><label class="field full"><span>Email</span><input id="profileEmail" type="email" autocomplete="email"><small>Changing email may require confirmation.</small></label><label class="field full"><span>New password</span><input id="profileNewPassword" type="password" autocomplete="new-password" placeholder="Leave blank to keep current password"><small>Use at least 8 characters.</small></label><div class="profile-storage-card"><span>Project storage</span><strong>Private cloud storage</strong><small>Only this signed-in user can access these cloud projects.</small></div><div id="profileMessage" class="auth-message" hidden></div></div><div class="modal-footer"><button type="button" class="btn danger-text" id="btnProfileSignOut">Sign out</button><button type="button" class="btn primary" id="btnSaveProfile">Save profile</button></div></dialog>`;
 html=html.replace('</body>',accountMarkup+'</body>');
 const settingsTag='<details class="action-menu settings-menu" id="projectMenu">';
 html=html.replace(settingsTag,accountButton+settingsTag);
 const scriptClose='</scr'+'ipt>',coreTag='<script src="core.js">'+scriptClose,storageTag='<script src="storage.js">'+scriptClose,appTag='<script src="app.js">'+scriptClose;
 html=html.replace(coreTag,'<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2">'+scriptClose+'<script src="multi-user/supabase-config.js?v='+RELEASE+'">'+scriptClose+'<script src="multi-user/auth.js?v='+RELEASE+'">'+scriptClose+coreTag);
 html=html.replace(storageTag,'<script src="multi-user/storage.js?v='+RELEASE+'">'+scriptClose);html=html.replace(appTag,'<script src="multi-user/boot.js?v='+RELEASE+'">'+scriptClose);
 const localAssets=['favicon.svg','styles.css','card-pdf-actions.css','missing-image-google.css','data-sheet-viewer.css','core.js','seed-products.js','data-sheet-viewer.js','settings-ui.css','settings-ui.js','ui-fixes.css','ui-fixes.js'];
 localAssets.forEach(file=>{html=html.replaceAll('href="'+file+'"','href="'+file+'?v='+RELEASE+'"').replaceAll('src="'+file+'"','src="'+file+'?v='+RELEASE+'"');});
 document.open();document.write(html);document.close();
}catch(err){document.body.innerHTML='<div class="route-loader"><div><strong>Could not load GROHE SpecBuilder</strong><span>'+String(err?.message||err)+'</span></div></div>'}
})();
