if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').then(reg => { reg.update(); }).catch(() => {});
  let reloaded = false;                                   // when a newer version takes over, load it once so the app never sits on an old copy
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (reloaded || !sessionStorage.getItem('sw-had')) { sessionStorage.setItem('sw-had', '1'); return; } reloaded = true; location.reload(); });
}
