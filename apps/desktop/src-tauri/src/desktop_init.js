/* global navigator, caches, sessionStorage, location */
// Runs in the desktop window before any page script, on every load (see lib.rs: `initialization_script`).
//
// The web build ships a PWA service worker. Inside the packaged app it does nothing useful (the app is served from the shell's own
// bundle, always "offline-capable") and it is actively harmful: `registration.update()` fails there ("An unknown error occurred when
// fetching the script"), so a service worker that is already installed keeps serving the OLD precached bundle forever and a new
// desktop build never shows. This removes any installed one -- the page then reloads once, straight from the embedded assets -- and
// stops the web bundle from registering a new one.
(function () {
  if (!('serviceWorker' in navigator)) return;
  var container = navigator.serviceWorker;

  // `register` is what the PWA runtime calls on load; never settling keeps it quiet (no error, no worker).
  try {
    Object.defineProperty(container, 'register', {
      value: function () {
        return new Promise(function () {});
      },
    });
  } catch {
    // read-only on this engine: eviction below still works, the worker would just be re-registered
  }

  container
    .getRegistrations()
    .then(function (registrations) {
      if (registrations.length === 0) return null;
      return Promise.all(
        registrations.map(function (registration) {
          return registration.unregister();
        }),
      )
        .then(function () {
          return caches.keys();
        })
        .then(function (keys) {
          return Promise.all(
            keys.map(function (key) {
              return caches.delete(key);
            }),
          );
        })
        .then(function () {
          // once per session: the reload must not loop if something re-creates a registration
          if (sessionStorage.getItem('atlas-sw-evicted') === '1') return;
          sessionStorage.setItem('atlas-sw-evicted', '1');
          location.reload();
        });
    })
    .catch(function () {
      // best effort: a failure here must never stop the app from starting
    });
})();
