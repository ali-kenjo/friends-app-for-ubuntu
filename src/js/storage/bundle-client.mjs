// ---------- Frontend Studio Bundle & Asset Upload Client (storage/bundle-client.mjs) ----------
import { bus, EVENTS } from "../core/event-bus.mjs";

export async function downloadStudioBundle(format = "zip") {
  const url = `/api/studio/bundle/export?format=${encodeURIComponent(format)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to export studio bundle.");
  const blob = await res.blob();
  const ext = format === "zip" ? "zip" : "json";
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `friends-studio-bundle-${new Date().toISOString().slice(0, 10)}.${ext}`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 1000);
}

export async function importStudioBundleFile(file) {
  const buf = await file.arrayBuffer();
  const res = await fetch("/api/studio/bundle/import", {
    method: "POST",
    headers: { "Content-Type": file.name.endsWith(".zip") ? "application/zip" : "application/json" },
    body: buf,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Import failed");
  bus.emit(EVENTS.BUNDLE_IMPORTED, data);
  return data;
}

export async function uploadAssetGlb(assetId, file) {
  const buf = await file.arrayBuffer();
  const res = await fetch(`/api/studio/asset-glb/${encodeURIComponent(assetId)}`, {
    method: "POST",
    headers: { "Content-Type": "model/gltf-binary" },
    body: buf,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "GLB upload failed");
  return data;
}

export async function removeAssetGlb(assetId) {
  const res = await fetch(`/api/studio/asset-glb/${encodeURIComponent(assetId)}`, { method: "DELETE" });
  return res.json();
}
