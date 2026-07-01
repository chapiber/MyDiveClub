/**
 * Accès portail club — mot de passe marcheron (cookie).
 * Protection IHM côté client ; les API PHP restent accessibles sans ce cookie.
 */
(function (global) {
  'use strict';

  var COOKIE_NAME = 'portailClub_access';
  var AUTH_TOKEN = 'mch_ok_v1';
  var COOKIE_DAYS = 365;
  var VALID_PASSWORDS = ['rederis', 'aquablue', 'capcerbere'];

  function getPortalBase() {
    var path = location.pathname;
    var marker = '/portailClub';
    var idx = path.indexOf(marker);
    if (idx !== -1) {
      return path.slice(0, idx + marker.length);
    }
    var appsIdx = path.indexOf('/apps/');
    if (appsIdx > 0) {
      return path.slice(0, appsIdx);
    }
    if (appsIdx === 0) {
      return '';
    }
    var lastSlash = path.lastIndexOf('/');
    if (lastSlash <= 0) {
      return '';
    }
    return path.slice(0, lastSlash);
  }

  function getCookiePath() {
    var base = getPortalBase();
    return base ? base + '/' : '/';
  }

  function getCookie(name) {
    var escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    var match = document.cookie.match(new RegExp('(?:^|; )' + escaped + '=([^;]*)'));
    return match ? decodeURIComponent(match[1]) : '';
  }

  function setAccessCookie() {
    var maxAge = COOKIE_DAYS * 24 * 60 * 60;
    var secure = location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = COOKIE_NAME + '=' + encodeURIComponent(AUTH_TOKEN)
      + '; Path=' + getCookiePath() + '; Max-Age=' + maxAge + '; SameSite=Lax' + secure;
  }

  function clearAccessCookie() {
    document.cookie = COOKIE_NAME + '=; Path=' + getCookiePath() + '; Max-Age=0; SameSite=Lax';
  }

  function isAuthenticated() {
    return getCookie(COOKIE_NAME) === AUTH_TOKEN;
  }

  function validatePassword(input) {
    var value = String(input || '').trim().toLowerCase();
    return VALID_PASSWORDS.indexOf(value) !== -1;
  }

  function isLoginPage() {
    return /\/login\.html$/i.test(location.pathname);
  }

  function isExemptPage() {
    return /\/update\.html$/i.test(location.pathname);
  }

  function isSafeReturn(ret) {
    if (!ret || ret.indexOf('login.html') !== -1 || ret.charAt(0) !== '/') {
      return false;
    }
    var base = getPortalBase();
    if (base) {
      return ret === base || ret.indexOf(base + '/') === 0;
    }
    return true;
  }

  function defaultHome() {
    var base = getPortalBase();
    return (base || '') + '/index.html';
  }

  function loginUrl(returnPath) {
    var base = getPortalBase();
    var ret = returnPath || (location.pathname + location.search + location.hash);
    return (base || '') + '/login.html?return=' + encodeURIComponent(ret);
  }

  function getReturnUrl() {
    var params = new URLSearchParams(location.search);
    var ret = params.get('return') || defaultHome();
    if (!isSafeReturn(ret)) {
      ret = defaultHome();
    }
    return ret;
  }

  function requireAuth() {
    if (isLoginPage() || isExemptPage()) return;
    if (!isAuthenticated()) {
      location.replace(loginUrl());
    }
  }

  global.portailClubAuth = {
    validatePassword: validatePassword,
    setAccessCookie: setAccessCookie,
    clearAccessCookie: clearAccessCookie,
    isAuthenticated: isAuthenticated,
    getReturnUrl: getReturnUrl
  };

  requireAuth();
})(window);
