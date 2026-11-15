// Animal Tap: tap the animal, hear its name and its sound, meet the next one.
// No score, no losing, no end.
//
// Every game module default-exports { assets, start(root, ctx), stop() }:
//   assets          pictures / sounds / stylesheets the shell preloads
//   start(root,ctx) build the game inside `root`; ctx.play(key) plays a sound
//   stop()          called when the child goes home: tidy up everything

import { ANIMALS } from "./animals.js";

const url = (path) => new URL(path, import.meta.url).href;
const picture = (a) => url(`./assets/${a.id}.png`);

const PAUSE_BEFORE_SOUND = 200;   // ms between the spoken name and the call
const SLIDE_AFTER_SOUND = 2000;   // ms from the call starting to the slide
const MIN_REST_AFTER_SOUND = 350; // ms of quiet before the slide, at least

const assets = {
  styles: [url("./game.css")],
  images: ANIMALS.map(picture),
  sounds: Object.fromEntries(ANIMALS.flatMap((a) => [
    [`${a.id}-name`, url(`./assets/${a.id}-name.mp3`)],
    [`${a.id}-sound`, url(`./assets/${a.id}-sound.mp3`)],
  ])),
};

let session = null;

/** Shuffled order, forever, never the same animal twice in a row. */
function nextAnimal(s) {
  if (!s.bag.length) {
    s.bag = [...ANIMALS];
    for (let i = s.bag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [s.bag[i], s.bag[j]] = [s.bag[j], s.bag[i]];
    }
    // the bag is dealt from the end: keep the last-shown animal off the top
    if (s.current && s.bag.length > 1 && s.bag[s.bag.length - 1].id === s.current.id) {
      [s.bag[0], s.bag[s.bag.length - 1]] = [s.bag[s.bag.length - 1], s.bag[0]];
    }
  }
  return s.bag.pop();
}

function makeCard(animal) {
  const card = document.createElement("div");
  card.className = "at-card";
  const img = document.createElement("img");
  img.className = "at-animal";
  img.src = picture(animal);
  img.alt = animal.name;
  img.draggable = false;
  card.append(img);
  return card;
}

const finished = (animation) => animation.finished.catch(() => {});

function start(root, ctx) {
  const s = session = { alive: true, locked: true, bag: [], current: null, card: null, shown: [] };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const el = document.createElement("div");
  el.className = "at";
  el.innerHTML = '<div class="at-glow"></div><div class="at-stage"></div><div class="at-name" aria-live="polite"></div>';
  const stage = el.querySelector(".at-stage");
  const nameEl = el.querySelector(".at-name");
  root.append(el);
  s.el = el;

  function present(animal, card) {
    s.current = animal;
    s.card = card;
    s.shown.push(animal.id);
    el.dataset.animal = animal.id;
    el.style.backgroundColor = animal.color;
    card.classList.add("is-waiting"); // gentle wobble: "tap me!"
    s.locked = false;
  }

  async function slideToNext() {
    const next = nextAnimal(s);
    const out = s.card;
    const incoming = makeCard(next);
    stage.append(incoming);
    nameEl.classList.remove("is-shown");
    el.style.backgroundColor = next.color;
    ctx.play("shell:whoosh");
    const far = el.clientWidth * 1.1;
    await Promise.all([
      finished(out.animate(
        [{ transform: "translateX(0) rotate(0)" }, { transform: `translateX(${-far}px) rotate(-14deg)` }],
        { duration: 520, easing: "cubic-bezier(.5,0,.9,.5)", fill: "forwards" })),
      finished(incoming.animate(
        [{ transform: `translateX(${far}px) rotate(14deg)` }, { transform: "translateX(0) rotate(0)" }],
        { duration: 680, easing: "cubic-bezier(.2,.9,.3,1.2)" })),
    ]);
    out.remove();
    if (!s.alive) return;
    nameEl.textContent = "";
    present(next, incoming);
  }

  async function onTap() {
    // Ignore taps while this animal is "talking" or sliding: mashing the
    // screen must not stack sounds or skip animals.
    if (s.locked || !s.alive) return;
    s.locked = true;
    const animal = s.current;
    const img = s.card.querySelector(".at-animal");
    s.card.classList.remove("is-waiting");

    img.animate([
      { transform: "scale(1, 1) translateY(0)" },
      { transform: "scale(1.12, .86) translateY(4%)", offset: .18 },
      { transform: "scale(.92, 1.12) translateY(-9%)", offset: .45 },
      { transform: "scale(1.05, .96) translateY(0)", offset: .72 },
      { transform: "scale(1, 1) translateY(0)" },
    ], { duration: 620, easing: "ease-out" });

    nameEl.textContent = animal.name.toUpperCase();
    nameEl.classList.add("is-shown");
    await ctx.play(`${animal.id}-name`);
    if (!s.alive) return;
    await sleep(PAUSE_BEFORE_SOUND);
    if (!s.alive) return;

    const soundStarted = performance.now();
    img.animate([
      { transform: "rotate(0)" }, { transform: "rotate(-5deg)" }, { transform: "rotate(5deg)" },
      { transform: "rotate(-3deg)" }, { transform: "rotate(0)" },
    ], { duration: 700, easing: "ease-in-out" });
    await ctx.play(`${animal.id}-sound`);
    if (!s.alive) return;
    const rest = Math.max(MIN_REST_AFTER_SOUND, SLIDE_AFTER_SOUND - (performance.now() - soundStarted));
    await sleep(rest);
    if (!s.alive) return;
    await slideToNext();
  }

  const tap = (e) => { e.preventDefault(); onTap(); };
  const key = (e) => { if (e.key === " " || e.key === "Enter") onTap(); };
  el.addEventListener("pointerdown", tap); // anywhere on the screen counts
  window.addEventListener("keydown", key);
  s.cleanup = () => {
    el.removeEventListener("pointerdown", tap);
    window.removeEventListener("keydown", key);
  };

  // First animal pops in.
  const first = nextAnimal(s);
  const card = makeCard(first);
  stage.append(card);
  el.style.backgroundColor = first.color;
  finished(card.animate(
    [{ transform: "scale(.3)", opacity: 0 }, { transform: "scale(1.08)", opacity: 1, offset: .7 }, { transform: "scale(1)" }],
    { duration: 480, easing: "ease-out" })).then(() => { if (s.alive) present(first, card); });
}

function stop() {
  if (!session) return;
  session.alive = false;
  session.locked = true;
  session.cleanup();
  session = null;
}

export default { assets, start, stop, get state() { return session; } };
