// Temi shell: start screen, home screen, navigation, parents' corner.
// Games live in /games and are listed in js/games.js.

import { GAMES } from "./games.js";
import { audio } from "./audio.js";
import { preload, cacheForOffline } from "./preloader.js";
import { holdToActivate } from "./hold.js";

const $ = (sel) => document.querySelector(sel);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const SHELL_ASSETS = {
  images: ["assets/logo.png", "assets/mascot.png", ...GAMES.map((g) => g.tile)],
  sounds: {
    "shell:temi": "assets/temi-name.mp3",
    "shell:tap": "assets/tap.mp3",
    "shell:whoosh": "assets/whoosh.mp3",
  },
};

const modules = new Map(); // game id -> loaded game module
let activeGame = null;
let busy = false;

// ---------- toddler-proofing ----------
function toddlerProof() {
  const stop = (e) => e.preventDefault();
  for (const type of ["contextmenu", "selectstart", "dragstart", "gesturestart", "gesturechange", "dblclick"]) {
    document.addEventListener(type, stop, { passive: false });
  }
  // Pinch zoom and pull-to-refresh (belt and braces alongside touch-action: none)
  document.addEventListener("touchmove", (e) => {
    if (!e.target.closest || !e.target.closest(".modal-card")) e.preventDefault();
  }, { passive: false });
  document.addEventListener("wheel", (e) => { if (e.ctrlKey) e.preventDefault(); }, { passive: false });
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && ["+", "-", "=", "0"].includes(e.key)) e.preventDefault();
  });
}

// ---------- screens ----------
function show(id) {
  for (const s of document.querySelectorAll(".screen")) s.classList.toggle("is-active", s.id === id);
}

// ---------- loading ----------
async function loadEverything(onProgress) {
  // Import every live game so its assets are preloaded with the shell's.
  const assets = { images: [...SHELL_ASSETS.images], sounds: { ...SHELL_ASSETS.sounds }, styles: [] };
  const entries = [];
  await Promise.all(GAMES.filter((g) => g.entry).map(async (g) => {
    const url = new URL(g.entry, document.baseURI).href;
    entries.push(url);
    try {
      const game = (await import(url)).default;
      modules.set(g.id, game);
      const a = game.assets || {};
      assets.images.push(...(a.images || []));
      assets.styles.push(...(a.styles || []));
      for (const [key, src] of Object.entries(a.sounds || {})) assets.sounds[`${g.id}:${key}`] = src;
    } catch (err) {
      console.error(`Temi: game "${g.id}" failed to load`, err);
    }
  }));
  const result = await preload(assets, onProgress);
  cacheForOffline([...result.urls, ...entries]).then((r) => { window.__temi.offline = r; });
  return result;
}

// ---------- home ----------
function buildTiles() {
  const box = $("#tiles");
  GAMES.forEach((g, i) => {
    const tile = document.createElement("button");
    tile.className = "tile" + (g.entry ? "" : " is-asleep");
    tile.style.setProperty("--i", i);
    tile.setAttribute("aria-label", g.name);
    tile.dataset.game = g.id;
    const img = document.createElement("img");
    img.src = g.tile;
    img.alt = "";
    img.draggable = false;
    tile.append(img);
    tile.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      if (g.entry && modules.has(g.id)) openGame(g, tile);
      else wiggle(tile);
    });
    box.append(tile);
  });
}

function wiggle(el) {
  el.classList.remove("is-wiggling");
  void el.offsetWidth; // restart the animation
  el.classList.add("is-wiggling");
  el.addEventListener("animationend", () => el.classList.remove("is-wiggling"), { once: true });
}

async function openGame(g, tile) {
  if (busy) return;
  busy = true;
  audio.play("shell:tap");
  tile.classList.add("is-opening");
  await wait(380);
  tile.classList.remove("is-opening");

  const game = modules.get(g.id);
  const root = $("#game-root");
  root.replaceChildren();
  activeGame = game;
  game.start(root, {
    play: (key, opts) => audio.play(key.includes(":") ? key : `${g.id}:${key}`, opts),
    stopSounds: () => audio.stopAll(),
  });
  show("screen-game");
  history.pushState({ game: g.id }, "");
  busy = false;
}

function goHome() {
  if (!activeGame) return;
  audio.stopAll();
  try { activeGame.stop(); } catch (err) { console.error(err); }
  activeGame = null;
  audio.play("shell:tap");
  show("screen-home");
  setTimeout(() => { if (!activeGame) $("#game-root").replaceChildren(); }, 400);
}

// ---------- parents' corner ----------
let installPrompt = null;

function refreshInstallUi() {
  const btn = $("#install-btn");
  const note = $("#install-note");
  const installed = matchMedia("(display-mode: fullscreen), (display-mode: standalone)").matches || navigator.standalone;
  btn.hidden = !installPrompt;
  if (installed) note.textContent = "Temi is installed on this device.";
  else if (installPrompt) note.textContent = "Adds Temi to your home screen. It then works without internet.";
  else note.textContent = "To install: open your browser menu and choose “Add to Home screen” or “Install app”.";
}

function setupParents() {
  const modal = $("#parents");
  const toggle = $("#sound-toggle");
  holdToActivate($("#parents-btn"), 2000, () => {
    toggle.checked = !audio.muted;
    refreshInstallUi();
    modal.hidden = false;
  });
  toggle.addEventListener("change", () => audio.setMuted(!toggle.checked));
  $("#parents-close").addEventListener("click", () => { modal.hidden = true; });
  modal.addEventListener("pointerdown", (e) => { if (e.target === modal) modal.hidden = true; });

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    installPrompt = e;
    refreshInstallUi();
  });
  window.addEventListener("appinstalled", () => { installPrompt = null; refreshInstallUi(); });
  $("#install-btn").addEventListener("click", async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    await installPrompt.userChoice.catch(() => {});
    installPrompt = null;
    refreshInstallUi();
  });
}

// ---------- start ----------
function setupStart(loading) {
  const btn = $("#play-btn");
  let started = false;
  btn.addEventListener("pointerdown", async (e) => {
    e.preventDefault();
    if (started) return;
    started = true;
    audio.unlock(); // inside the gesture
    btn.classList.add("is-loading");
    await loading;
    await audio.unlock();
    show("screen-home");
    const mascot = $("#home-mascot");
    mascot.classList.add("is-cheering");
    mascot.addEventListener("animationend", () => mascot.classList.remove("is-cheering"), { once: true });
    audio.play("shell:temi");
  });
}

function main() {
  window.__temi = { audio, games: GAMES, modules, offline: undefined };
  toddlerProof();
  buildTiles();
  setupParents();
  holdToActivate($("#home-btn"), 1000, () => {
    if (history.state && history.state.game) history.back(); // popstate does the work
    else goHome();
  });
  window.addEventListener("popstate", goHome);

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch((err) => console.warn("Temi: no offline support", err));
  }

  const btn = $("#play-btn");
  const loading = loadEverything((f) => btn.style.setProperty("--progress", f));
  setupStart(loading);
}

main();
