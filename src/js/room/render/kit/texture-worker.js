// Makes the room's procedural surface maps off the main thread (see texture-gen.mjs).
// In: { id, kind, size, seed }. Out: { id, albedo, normal, rough } (transferred, not copied).
import { generate } from "./texture-gen.mjs";

self.onmessage = (e) => {
  const { id, kind, size, seed } = e.data || {};
  try {
    const maps = generate(kind, size, seed);
    self.postMessage({ id, ...maps }, [maps.albedo.buffer, maps.normal.buffer, maps.rough.buffer]);
  } catch (err) {
    self.postMessage({ id, error: String(err?.message || err) });
  }
};
