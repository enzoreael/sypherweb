// autocheck.js - central auth check for the whole site
(function () {
  // === SET YOUR SITE PASSWORD HERE (change this and re-upload/publish to change password globally) ===
  const SITE_PASSWORD = '2025'; // <-- edit this when you want a new password

  // expose it for pages that need it (password.html will read this)
  window.SYPHER_SITE_PASSWORD = SITE_PASSWORD;

  // keys we use in localStorage
  const UNLOCK_KEY = 'sypher-unlocked';
  const UNLOCK_WITH_KEY = 'sypher-unlock-password';
  const TRY_URL_KEY = 'sypher-try-url';
  const SHOULD_OPEN_KEY = 'sypher-should-open';
  const SYLPASS_KEY = 'sypher-password';
  const CERTIFICATE_VERIFIED = 'sypher-certificate-verified';

  // Keep a local copy of the site password in localStorage
  try {
    localStorage.setItem(SYLPASS_KEY, SITE_PASSWORD);
  } catch (e) {
    // ignore storage errors
  }

  // do nothing if we are already on the password page or certificate page
  const pathname = location.pathname || '';
  if (pathname.endsWith('/password.html') || 
      pathname.endsWith('password.html') ||
      pathname.endsWith('/certificate.html') || 
      pathname.endsWith('certificate.html') ||
      pathname.endsWith('/dashboard.html') || 
      pathname.endsWith('dashboard.html')) {
    return;
  }

  // check unlocked state
  function isUnlocked() {
    try {
      return localStorage.getItem(UNLOCK_KEY) === 'true' &&
             localStorage.getItem(UNLOCK_WITH_KEY) === SITE_PASSWORD;
    } catch (e) {
      return false;
    }
  }

  // check if device has a valid certificate
  function hasValidCertificate() {
    try {
      return localStorage.getItem(CERTIFICATE_VERIFIED) === 'true';
    } catch (e) {
      return false;
    }
  }

  if (!isUnlocked() && !hasValidCertificate()) {
    // If the stored unlock password doesn't match the newly-deployed SITE_PASSWORD,
    // clear any "should-open" flag to avoid leftover auto-open behavior.
    try {
      if (localStorage.getItem(UNLOCK_WITH_KEY) !== SITE_PASSWORD) {
        localStorage.removeItem(SHOULD_OPEN_KEY);
        // also ensure "unlocked" isn't left true under an old password
        localStorage.setItem(UNLOCK_KEY, 'false');
      }
    } catch (e) {}

    // store where they tried to go so we can return after login
    try { localStorage.setItem(TRY_URL_KEY, location.pathname + location.search + location.hash); } catch (e) {}
    
    // redirect to the gate
    location.replace('password.html');
  } else if (isUnlocked() && !hasValidCertificate()) {
    // User has password but no certificate, redirect to certificate page
    try { localStorage.setItem(TRY_URL_KEY, location.pathname + location.search + location.hash); } catch (e) {}
    location.replace('certificate.html');
  }
  // If both are valid, allow access to the page
})();