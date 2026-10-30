export const registerServiceWorker = () => {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then(() => navigator.serviceWorker.ready)
      .then((registration) => {
        const urls = performance.getEntriesByType('resource').map((entry) => entry.name)
        registration.active?.postMessage({ type: 'cache', urls })
      })
      .catch(() => undefined)
  })
}
