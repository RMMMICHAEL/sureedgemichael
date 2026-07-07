/**
 * Relay — roda no mundo ISOLATED.
 * Escuta CustomEvents do interceptor (MAIN world) e repassa
 * ao service worker via chrome.runtime.sendMessage.
 */
window.addEventListener('__sureedge_intercept', (event) => {
  chrome.runtime.sendMessage({ kind: 'intercept', ...event.detail });
});
