// Asset preloader: fetches and decodes every picture and sound before play,
// then hands the full list to the service worker so the app works offline.

import { audio } from "./audio.js";

const abs = (url) => new URL(url, document.baseURI).href;

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => (img.decode ? img.decode().catch(() => {}).then(resolve) : resolve());
    img.onerror = () => reject(new Error("image " + url));
    img.src = url;
  });
}

function loadStyle(url) {
  return new Promise((resolve, reject) => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = url;
    link.onload = resolve;
    link.onerror = () => reject(new Error("style " + url));
    document.head.append(link);
  });
}

async function withRetry(job) {
  try { return await job(); } catch { return job(); }
}

/**
 * @param {{images?: string[], sounds?: Record<string,string>, styles?: string[]}} assets
 * @param {(fraction: number) => void} onProgress
 * @returns {Promise<{urls: string[], failed: string[]}>}
 */
export async function preload(assets, onProgress = () => {}) {
  const jobs = [];
  for (const url of assets.styles || []) jobs.push([abs(url), () => loadStyle(abs(url))]);
  for (const url of assets.images || []) jobs.push([abs(url), () => loadImage(abs(url))]);
  for (const [key, url] of Object.entries(assets.sounds || {})) jobs.push([abs(url), () => audio.load(key, abs(url))]);

  let done = 0;
  const failed = [];
  await Promise.all(jobs.map(([url, job]) =>
    withRetry(job)
      .catch(() => failed.push(url))
      .then(() => onProgress(++done / jobs.length))
  ));
  if (failed.length) console.warn("Temi: could not load", failed);
  return { urls: jobs.map(([url]) => url), failed };
}

/** Ask the service worker to store these URLs (plus everything the page already loaded). */
export async function cacheForOffline(urls) {
  if (!("serviceWorker" in navigator)) return null;
  const reg = await navigator.serviceWorker.ready;
  const loaded = performance.getEntriesByType("resource")
    .map((e) => e.name)
    .filter((u) => u.startsWith(location.origin));
  const all = [...new Set([...urls, ...loaded])];
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = (e) => resolve(e.data);
    reg.active.postMessage({ type: "precache", urls: all }, [channel.port2]);
    setTimeout(() => resolve(null), 20000);
  });
}
