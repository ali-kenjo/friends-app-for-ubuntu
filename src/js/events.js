// One connection to the helper's server-sent events (/api/events), shared by everything that listens:
// reminders and the briefing (life.js), missions and the model that's loaded (missions/). The browser
// reconnects by itself.
const handlers = new Map(); // event name → Set of functions
let source = null;

function open() {
  if (source) return;
  source = new EventSource("/api/events");
  source.addEventListener("hello", () => {});
}

// on("mission", (data) => …); returns a function that stops listening
export function onServerEvent(name, fn) {
  open();
  if (!handlers.has(name)) {
    handlers.set(name, new Set());
    source.addEventListener(name, (e) => {
      let data = null;
      try {
        data = JSON.parse(e.data);
      } catch {}
      for (const f of handlers.get(name)) {
        try {
          f(data, e);
        } catch (err) {
          console.error(`Handler for ${name} failed:`, err);
        }
      }
    });
  }
  handlers.get(name).add(fn);
  return () => handlers.get(name)?.delete(fn);
}

// The "hello" the helper sends first says whether the desktop app shows notifications itself
export function onHello(fn) {
  open();
  source.addEventListener("hello", (e) => fn(JSON.parse(e.data)));
}
