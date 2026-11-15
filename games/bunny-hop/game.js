// Bunny Hop: a 3D bunny hops through a forest, forever.
//
// For toddlers, so nothing can go wrong:
//   - the bunny hops along by itself and jumps every obstacle on its own
//   - a tap anywhere makes it do a big happy jump
//   - every carrot it passes is eaten; some float high above the obstacles
//   - no score, no losing, no end
//
// Everything on screen is built from simple 3D shapes in code (no model
// files), drawn with flat "toon" colours and dark outlines to match Temi.

import * as THREE from "../../vendor/three.module.min.js";

const url = (path) => new URL(path, import.meta.url).href;

const assets = {
  styles: [url("./game.css")],
  sounds: Object.fromEntries(
    ["ambience", "hop", "boing", "collect", "crunch", "cheer",
      "yummy-voice", "yum-voice", "carrot-voice", "hop-voice", "whee-voice"]
      .map((name) => [name, url(`./assets/${name}.mp3`)])),
};

// ---------- tuning ----------
const SPEED = 3.0;          // forest units per second
const HOP_TIME = 0.5;       // one little hop
const HOP_AIR = 0.68;       // fraction of a hop spent in the air
const HOP_HEIGHT = 0.32;
const JUMP_TIME = 0.8;      // the big jump (tap, or automatic over obstacles)
const JUMP_HEIGHT = 1.5;
const WORLD_SPAN = 64;      // scenery repeats after this distance
const SPAWN_AHEAD = 20;
const BUNNY_SIZE = 1.3;
const INK = 0x4a2c1a;

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const smooth = (lo, hi, v) => { const t = clamp((v - lo) / (hi - lo), 0, 1); return t * t * (3 - 2 * t); };
const rand = (lo, hi) => lo + Math.random() * (hi - lo);
const pick = (list) => list[Math.floor(Math.random() * list.length)];

let session = null;

// ---------- drawing helpers ----------
function makeKit() {
  // three flat shades instead of smooth lighting = cartoon look
  const ramp = new THREE.DataTexture(new Uint8Array([150, 150, 150, 255, 215, 215, 215, 255, 255, 255, 255, 255]), 3, 1);
  ramp.minFilter = ramp.magFilter = THREE.NearestFilter;
  ramp.needsUpdate = true;
  const mats = new Map();
  const toon = (color) => {
    if (!mats.has(color)) mats.set(color, new THREE.MeshToonMaterial({ color, gradientMap: ramp }));
    return mats.get(color);
  };
  const ink = new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide });
  const geo = {
    ball: new THREE.SphereGeometry(1, 20, 14),
    lowBall: new THREE.SphereGeometry(1, 10, 8),
    cone: new THREE.ConeGeometry(1, 1, 12),
    tube: new THREE.CylinderGeometry(1, 1, 1, 14),
    pill: new THREE.CapsuleGeometry(1, 2, 6, 12),
    disc: new THREE.CircleGeometry(1, 24),
    rock: new THREE.DodecahedronGeometry(1, 0),
    star: new THREE.OctahedronGeometry(1, 0),
  };
  /** A mesh, optionally with a dark outline (a slightly larger inside-out copy). */
  const part = (g, color, { s = [1, 1, 1], p = [0, 0, 0], r = [0, 0, 0], outline = 0 } = {}) => {
    const mesh = new THREE.Mesh(g, toon(color));
    mesh.scale.set(...(typeof s === "number" ? [s, s, s] : s));
    mesh.position.set(...p);
    mesh.rotation.set(...r);
    if (outline) {
      const hull = new THREE.Mesh(g, ink);
      const m = Math.min(mesh.scale.x, mesh.scale.y, mesh.scale.z);
      hull.scale.set(1 + outline / mesh.scale.x, 1 + outline / mesh.scale.y, 1 + outline / mesh.scale.z);
      if (m <= 0) hull.visible = false;
      mesh.add(hull);
    }
    return mesh;
  };
  const group = (children, p = [0, 0, 0]) => {
    const g = new THREE.Group();
    g.position.set(...p);
    g.add(...children);
    return g;
  };
  return { toon, ink, geo, part, group, ramp, mats };
}

// ---------- the bunny ----------
function makeBunny(kit) {
  const { geo, part, group } = kit;
  const FUR = 0xfff3e2, WHITE = 0xffffff, PINK = 0xffa9c2, NOSE = 0xff6f9c, BLACK = 0x2a1a12;
  const O = 0.035;

  const torso = part(geo.ball, FUR, { s: [0.5, 0.4, 0.38], p: [0, 0.56, 0], outline: O });
  const rump = part(geo.ball, FUR, { s: [0.4, 0.4, 0.4], p: [-0.24, 0.55, 0], outline: O });
  const belly = part(geo.ball, WHITE, { s: [0.36, 0.26, 0.3], p: [0.06, 0.44, 0] });
  const tail = part(geo.ball, WHITE, { s: 0.15, p: [-0.64, 0.66, 0], outline: O });

  // head
  const skull = part(geo.ball, FUR, { s: [0.37, 0.34, 0.35], outline: O });
  const cheekL = part(geo.ball, WHITE, { s: 0.16, p: [0.2, -0.1, 0.14] });
  const cheekR = part(geo.ball, WHITE, { s: 0.16, p: [0.2, -0.1, -0.14] });
  const nose = part(geo.ball, NOSE, { s: [0.05, 0.045, 0.065], p: [0.36, -0.02, 0] });
  const tooth = part(geo.ball, WHITE, { s: [0.03, 0.05, 0.05], p: [0.3, -0.19, 0] });
  const eyes = [1, -1].map((side) => {
    const eye = part(geo.ball, BLACK, { s: [0.055, 0.095, 0.085], p: [0.26, 0.08, 0.21 * side] });
    eye.add(new THREE.Mesh(geo.lowBall, new THREE.MeshBasicMaterial({ color: 0xffffff })));
    eye.children[0].scale.setScalar(0.32);
    eye.children[0].position.set(0.75, 0.4, 0.25 * side);
    return eye;
  });
  const blush = [1, -1].map((side) => part(geo.ball, PINK, { s: [0.06, 0.045, 0.02], p: [0.12, -0.06, 0.335 * side] }));

  // ears: two joints each so the tips can lag behind and flop
  const ears = [1, -1].map((side) => {
    const tip = group([
      part(geo.pill, FUR, { s: [0.05, 0.085, 0.085], p: [0, 0.2, 0], outline: 0.03 }),
      part(geo.pill, PINK, { s: [0.03, 0.062, 0.05], p: [0.026, 0.18, 0] }),
    ], [0, 0.3, 0]);
    const base = group([
      part(geo.pill, FUR, { s: [0.055, 0.085, 0.09], p: [0, 0.17, 0], outline: 0.03 }),
      part(geo.pill, PINK, { s: [0.035, 0.07, 0.058], p: [0.026, 0.17, 0] }),
      tip,
    ], [-0.06, 0.26, 0.15 * side]);
    base.rotation.x = 0.2 * side;
    return { base, tip, angle: 0.3, speed: 0, tipAngle: 0, tipSpeed: 0, stiff: side > 0 ? 95 : 80 };
  });

  const head = group([skull, cheekL, cheekR, nose, tooth, ...eyes, ...blush, ...ears.map((e) => e.base)], [0.46, 0.93, 0]);

  // legs swing around the hip / shoulder
  const hind = [1, -1].map((side) => group([
    part(geo.ball, FUR, { s: [0.2, 0.25, 0.14], p: [0, -0.1, 0], outline: O }),
    part(geo.pill, FUR, { s: [0.075, 0.09, 0.085], p: [0.13, -0.36, 0], r: [0, 0, Math.PI / 2], outline: O }),
  ], [-0.26, 0.5, 0.27 * side]));
  const front = [1, -1].map((side) => group([
    part(geo.pill, FUR, { s: [0.075, 0.085, 0.075], p: [0, -0.18, 0], outline: O }),
    part(geo.ball, WHITE, { s: [0.1, 0.07, 0.09], p: [0.03, -0.38, 0], outline: O }),
  ], [0.27, 0.46, 0.18 * side]));

  const body = group([torso, rump, belly, tail, head, ...hind, ...front]);
  const root = group([body]);
  return { root, body, head, ears, hind, front, tail, eyes, cheeks: [cheekL, cheekR] };
}

// ---------- things on the path ----------
function makeCarrot(kit) {
  const { geo, part, group } = kit;
  const carrot = group([
    part(geo.cone, 0xff8a1f, { s: [0.15, 0.5, 0.15], r: [Math.PI, 0, 0], outline: 0.03 }),
    part(geo.ball, 0xff8a1f, { s: [0.15, 0.07, 0.15], p: [0, 0.25, 0], outline: 0.03 }),
    part(geo.pill, 0x47c05a, { s: [0.035, 0.07, 0.035], p: [0, 0.4, 0], outline: 0.025 }),
    part(geo.pill, 0x47c05a, { s: [0.035, 0.06, 0.035], p: [0.09, 0.37, 0], r: [0, 0, -0.6], outline: 0.025 }),
    part(geo.pill, 0x47c05a, { s: [0.035, 0.06, 0.035], p: [-0.09, 0.37, 0], r: [0, 0, 0.6], outline: 0.025 }),
  ]);
  carrot.rotation.z = -0.35;
  return group([carrot]);
}

function makeObstacle(kit, kind) {
  const { geo, part, group } = kit;
  if (kind === "log") {
    return group([
      part(geo.tube, 0x9a6234, { s: [0.3, 1.5, 0.3], p: [0, 0.3, 0], r: [Math.PI / 2, 0, 0], outline: 0.04 }),
      part(geo.tube, 0xe9c58f, { s: [0.24, 0.02, 0.24], p: [0, 0.3, 0.76], r: [Math.PI / 2, 0, 0] }),
      part(geo.tube, 0xc79a5e, { s: [0.11, 0.025, 0.11], p: [0, 0.3, 0.765], r: [Math.PI / 2, 0, 0] }),
      part(geo.ball, 0x5fcf6a, { s: [0.14, 0.09, 0.2], p: [0.05, 0.6, 0.2] }),
    ]);
  }
  if (kind === "rock") {
    return group([
      part(geo.rock, 0xa9b4c2, { s: [0.42, 0.34, 0.5], p: [0, 0.24, 0], r: [0.3, 0.5, 0], outline: 0.04 }),
      part(geo.rock, 0xc3ccd8, { s: [0.24, 0.2, 0.26], p: [0.1, 0.16, 0.5], r: [0.1, 1.2, 0.2], outline: 0.03 }),
    ]);
  }
  // mushrooms
  const shroom = (x, z, k) => group([
    part(geo.tube, 0xfff3e2, { s: [0.09 * k, 0.3 * k, 0.09 * k], p: [0, 0.15 * k, 0], outline: 0.03 }),
    part(geo.ball, 0xff4f5e, { s: [0.26 * k, 0.17 * k, 0.26 * k], p: [0, 0.34 * k, 0], outline: 0.035 }),
    part(geo.ball, 0xffffff, { s: 0.05 * k, p: [0.1 * k, 0.45 * k, 0.12 * k] }),
    part(geo.ball, 0xffffff, { s: 0.045 * k, p: [-0.12 * k, 0.43 * k, 0.1 * k] }),
    part(geo.ball, 0xffffff, { s: 0.04 * k, p: [0.02 * k, 0.5 * k, -0.02 * k] }),
  ], [x, 0, z]);
  return group([shroom(0, 0.1, 1.25), shroom(0.12, -0.42, 0.9), shroom(-0.1, 0.55, 0.8)]);
}

// ---------- the forest ----------
function makeScenery(kit, scene) {
  const { geo, part, group } = kit;
  const items = []; // everything that scrolls and wraps around
  const add = (obj, x, z, rate = 1) => {
    obj.position.x = x;
    obj.position.z = z;
    scene.add(obj);
    items.push({ obj, rate });
    return obj;
  };

  const GREENS = [0x3fae5b, 0x57c26a, 0x2f9d6b, 0x7bd15a];
  const tree = () => {
    const h = rand(1.6, 2.6), kind = Math.random();
    const trunk = part(geo.tube, 0x8a5a33, { s: [0.2, h, 0.2], p: [0, h / 2, 0], outline: 0.04 });
    const leaf = pick(GREENS);
    if (kind < 0.4) { // pine: stacked cones
      return group([trunk,
        part(geo.cone, leaf, { s: [1.25, 1.7, 1.25], p: [0, h + 0.4, 0], outline: 0.05 }),
        part(geo.cone, leaf, { s: [0.95, 1.4, 0.95], p: [0, h + 1.3, 0], outline: 0.05 }),
        part(geo.cone, leaf, { s: [0.62, 1.1, 0.62], p: [0, h + 2.1, 0], outline: 0.05 })]);
    }
    if (kind < 0.8) { // round tree
      const r = rand(1.1, 1.5);
      return group([trunk,
        part(geo.ball, leaf, { s: [r, r * 0.92, r], p: [0, h + r * 0.6, 0], outline: 0.05 }),
        part(geo.ball, leaf, { s: r * 0.6, p: [r * 0.6, h + r * 0.25, 0.2], outline: 0.05 }),
        part(geo.ball, leaf, { s: r * 0.55, p: [-r * 0.65, h + r * 0.35, 0.1], outline: 0.05 })]);
    }
    const r = rand(0.8, 1.05); // tall leafy tree
    return group([trunk, part(geo.ball, leaf, { s: [r, r * 1.9, r], p: [0, h + r * 1.4, 0], outline: 0.05 })]);
  };
  const bush = () => {
    const c = pick(GREENS), k = rand(0.45, 0.8);
    return group([
      part(geo.ball, c, { s: [k, k * 0.75, k], p: [0, k * 0.5, 0], outline: 0.04 }),
      part(geo.ball, c, { s: k * 0.7, p: [k * 0.75, k * 0.38, 0.05], outline: 0.04 }),
      part(geo.ball, c, { s: k * 0.6, p: [-k * 0.7, k * 0.32, 0.1], outline: 0.04 }),
    ]);
  };
  const flower = () => {
    const c = pick([0xff6b9d, 0xffd23f, 0xffffff, 0x9b7bff, 0xff7b54]);
    return group([
      part(geo.tube, 0x3fae5b, { s: [0.02, 0.28, 0.02], p: [0, 0.14, 0] }),
      part(geo.ball, c, { s: [0.11, 0.06, 0.11], p: [0, 0.3, 0], outline: 0.02 }),
      part(geo.ball, 0xffd23f, { s: 0.045, p: [0, 0.34, 0] }),
    ]);
  };
  const tuft = () => group([
    part(geo.cone, 0x4dbb5c, { s: [0.07, 0.3, 0.07], p: [0, 0.15, 0] }),
    part(geo.cone, 0x4dbb5c, { s: [0.06, 0.22, 0.06], p: [0.09, 0.11, 0.02], r: [0, 0, -0.3] }),
    part(geo.cone, 0x4dbb5c, { s: [0.06, 0.24, 0.06], p: [-0.09, 0.12, 0], r: [0, 0, 0.3] }),
  ]);
  const cloud = () => {
    const m = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false });
    const g = new THREE.Group();
    for (const [x, y, s] of [[0, 0, 1.3], [1.3, -0.1, 1], [-1.3, -0.15, 0.95], [0.5, 0.5, 0.9]]) {
      const b = new THREE.Mesh(geo.lowBall, m);
      b.position.set(x, y, 0);
      b.scale.set(s, s * 0.7, s * 0.6);
      g.add(b);
    }
    return g;
  };

  const half = WORLD_SPAN / 2;
  // trees: rows behind the path, denser further back
  for (let i = 0; i < 46; i++) {
    const z = -2.8 - Math.pow(Math.random(), 1.3) * 17;
    add(tree(), rand(-half, half), z).scale.setScalar(rand(0.85, 1.2));
  }
  for (let i = 0; i < 18; i++) add(bush(), rand(-half, half), rand(-2.2, -9));
  for (let i = 0; i < 6; i++) add(bush(), rand(-half, half), rand(3.2, 4.5)).scale.setScalar(0.55);
  for (let i = 0; i < 44; i++) add(flower(), rand(-half, half), pick([rand(-1.5, -5), rand(1.5, 4)]));
  for (let i = 0; i < 40; i++) add(tuft(), rand(-half, half), pick([rand(-1.25, -6), rand(1.25, 4.5)]));
  for (let i = 0; i < 7; i++) add(cloud(), rand(-half, half), rand(-24, -34), 0.25).position.y = rand(8, 12);
  // rolling hills on the horizon
  for (let i = 0; i < 9; i++) {
    const r = rand(7, 11);
    add(part(geo.ball, pick([0x58c36c, 0x49b56a, 0x6ccf74]), { s: [r * 1.5, r, r] }), -half + i * (WORLD_SPAN / 9) + rand(-1, 1), -26, 1).position.y = -r * 0.45;
  }

  // ground + path (these don't move: they are endless strips)
  const ground = part(geo.disc, 0x6fd163, { s: 90, r: [-Math.PI / 2, 0, 0] });
  const path = new THREE.Mesh(new THREE.PlaneGeometry(200, 2.3), kit.toon(0xf0d39a));
  path.rotation.x = -Math.PI / 2;
  path.position.y = 0.01;
  const edge = new THREE.Mesh(new THREE.PlaneGeometry(200, 2.6), kit.toon(0xd9b877));
  edge.rotation.x = -Math.PI / 2;
  edge.position.y = 0.005;
  scene.add(ground, edge, path);
  // pebbles on the path so you can see it moving
  for (let i = 0; i < 26; i++) {
    add(part(geo.ball, 0xdcb97a, { s: [rand(0.06, 0.13), 0.02, rand(0.05, 0.1)], p: [0, 0.02, 0] }), rand(-half, half), rand(-1, 1));
  }
  return items;
}

function makeSky() {
  const c = document.createElement("canvas");
  c.width = 4; c.height = 256;
  const g = c.getContext("2d");
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, "#4fb8f5");
  grad.addColorStop(0.55, "#9fe0fb");
  grad.addColorStop(1, "#e8fbd9");
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---------- the game ----------
function start(root, ctx) {
  const s = session = {
    alive: true, raf: 0, time: 0,
    mode: "hop", hopT: HOP_AIR, jumpT: 0, jumpFrom: 0, flip: false, y: 0, lastY: 0,
    squash: 0, munch: 0, blink: 0, nextBlink: 2,
    items: [], cursor: 6, queue: [], sinceObstacle: 9,
    eaten: 0, jumps: 0, taps: 0, voiceBusy: false, stats: { autoJumps: 0, missed: 0 },
  };

  const el = document.createElement("div");
  el.className = "bh";
  root.append(el);

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  } catch (err) {
    // No 3D on this device: show a friendly sleeping screen instead of an error.
    console.warn("Bunny Hop needs WebGL", err);
    el.classList.add("bh--no3d");
    s.cleanup = () => {};
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  el.append(renderer.domElement);

  const kit = makeKit();
  const scene = new THREE.Scene();
  scene.background = makeSky();
  scene.fog = new THREE.Fog(0xc9f2dc, 16, 46);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x9fd49a, 2.1));
  const sun = new THREE.DirectionalLight(0xfff4d6, 1.9);
  sun.position.set(-3, 8, 6);
  scene.add(sun);

  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 120);
  const scenery = makeScenery(kit, scene);
  const bunny = makeBunny(kit);
  scene.add(bunny.root);

  const shadow = new THREE.Mesh(kit.geo.disc, new THREE.MeshBasicMaterial({ color: 0x1f4d2a, transparent: true, opacity: 0.28, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.03;
  scene.add(shadow);

  // little flying bits: stars, crumbs, dust
  const bits = [];
  const bitMats = { star: new THREE.MeshBasicMaterial({ color: 0xffd23f }), crumb: new THREE.MeshBasicMaterial({ color: 0xff8a1f }), dust: new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 }) };
  function burst(kind, n, x, y, power) {
    for (let i = 0; i < n; i++) {
      let bit = bits.find((b) => b.life <= 0);
      if (!bit) {
        if (bits.length > 70) return;
        bit = { mesh: new THREE.Mesh(kit.geo.star), life: 0 };
        scene.add(bit.mesh);
        bits.push(bit);
      }
      bit.mesh.geometry = kind === "star" ? kit.geo.star : kit.geo.lowBall;
      bit.mesh.material = bitMats[kind];
      bit.mesh.visible = true;
      bit.mesh.position.set(x + rand(-0.15, 0.15), y + rand(-0.1, 0.1), rand(-0.3, 0.3));
      bit.size = kind === "star" ? rand(0.07, 0.13) : kind === "dust" ? rand(0.08, 0.16) : rand(0.03, 0.06);
      bit.vx = rand(-1, 1) * power - (kind === "dust" ? 1 : 0);
      bit.vy = rand(0.4, 1) * power * (kind === "dust" ? 0.5 : 1.6);
      bit.vz = rand(-1, 1) * power;
      bit.gravity = kind === "dust" ? 0.5 : 7;
      bit.life = bit.maxLife = kind === "dust" ? 0.5 : rand(0.5, 0.9);
    }
  }

  // ----- sounds -----
  const say = (key) => {
    if (s.voiceBusy) return;
    s.voiceBusy = true;
    ctx.play(key).then(() => { s.voiceBusy = false; });
  };
  ctx.play("ambience", { loop: true, volume: 0.9 });
  setTimeout(() => { if (s.alive) say("hop-voice"); }, 500);

  // ----- what comes down the path -----
  function refillQueue() {
    const carrots = (n) => { for (let i = 0; i < n; i++) s.queue.push({ type: "carrot", gap: i ? 1.35 : 2.2 }); };
    const obstacle = () => s.queue.push({ type: "obstacle", gap: 3.2 }, { type: "rest", gap: 1.6 });
    const roll = Math.random();
    if (roll < 0.35) { carrots(3); obstacle(); }
    else if (roll < 0.6) { carrots(2); obstacle(); }
    else if (roll < 0.8) { carrots(4); }
    else { obstacle(); carrots(2); }
  }
  function spawn(type, x) {
    if (type === "rest") return;
    if (type === "carrot") {
      const obj = makeCarrot(kit);
      scene.add(obj);
      s.items.push({ type, obj, x, y: 0.62 * BUNNY_SIZE, phase: rand(0, 6) });
      return;
    }
    const obj = makeObstacle(kit, pick(["log", "rock", "mushroom"]));
    scene.add(obj);
    s.items.push({ type: "obstacle", obj, x, y: 0 });
    // a carrot floating above: jumping the obstacle catches it
    const treat = makeCarrot(kit);
    treat.scale.setScalar(1.2);
    scene.add(treat);
    s.items.push({ type: "carrot", obj: treat, x, y: 2.3, phase: rand(0, 6), high: true });
  }

  function startJump(byTap) {
    s.mode = "jump";
    s.jumpT = 0;
    s.jumpFrom = s.y;
    s.jumps++;
    s.flip = s.celebrate;
    s.celebrate = false;
    ctx.play("boing", { volume: byTap ? 1 : 0.7 });
    if (s.flip) { ctx.play("cheer"); burst("star", 16, 0.2, 1.2, 2.6); }
    else if (byTap && s.taps % 4 === 1) say("whee-voice");
  }

  function eat(item) {
    item.eaten = 0.0001;
    s.eaten++;
    s.munch = 0.7;
    ctx.play("collect");
    setTimeout(() => { if (s.alive) ctx.play("crunch"); }, 140);
    burst("star", 5, 0.5, s.y + 1.1, 1.6);
    burst("crumb", 6, 0.75, s.y + 0.85, 1.1);
    if (s.eaten === 1) say("carrot-voice");
    else if (s.eaten % 10 === 0) s.celebrate = true; // the next jump is a happy flip
    else if (s.eaten % 4 === 0) say(pick(["yummy-voice", "yum-voice"]));
  }

  // ----- one frame -----
  function update(dt) {
    s.time += dt;
    const move = SPEED * dt;

    // scenery scrolls past and wraps around for an endless forest
    for (const it of scenery) {
      it.obj.position.x -= move * it.rate;
      if (it.obj.position.x < -WORLD_SPAN / 2) it.obj.position.x += WORLD_SPAN;
    }

    // spawn what is next on the path
    s.cursor -= move;
    while (s.cursor < SPAWN_AHEAD) {
      if (!s.queue.length) refillQueue();
      const next = s.queue.shift();
      s.cursor += next.gap;
      spawn(next.type, s.cursor);
    }

    // --- bunny motion ---
    let pitch = 0, hind = 0, front = 0, spin = 0;
    if (s.mode === "hop") {
      s.hopT += dt / HOP_TIME;
      if (s.hopT >= 1) s.hopT -= 1;
      const p = s.hopT;
      if (p < HOP_AIR) {
        const u = p / HOP_AIR;
        s.y = HOP_HEIGHT * Math.sin(Math.PI * u);
        pitch = 0.26 * Math.cos(Math.PI * u);
        hind = lerp(-0.95, 0.65, smooth(0.05, 0.9, u));   // kick back, then swing forward
        front = lerp(-0.25, 0.85, smooth(0, 0.55, u)) - 0.5 * smooth(0.6, 1, u); // reach, then land
        s.wasAir = true;
      } else {
        const g = (p - HOP_AIR) / (1 - HOP_AIR);
        if (s.wasAir) { s.wasAir = false; s.squash = Math.max(s.squash, 0.5); ctx.play("hop", { volume: 0.6 }); }
        s.y = 0;
        pitch = lerp(-0.26, 0.26, smooth(0, 1, g));
        hind = lerp(0.65, -0.95, smooth(0, 1, g));        // feet planted, body rolls over them
        front = lerp(0.35, -0.25, smooth(0, 1, g));
      }
    } else {
      s.jumpT += dt / JUMP_TIME;
      const u = Math.min(s.jumpT, 1);
      s.y = s.jumpFrom * (1 - u) + JUMP_HEIGHT * Math.sin(Math.PI * u);
      pitch = 0.5 * Math.cos(Math.PI * u);
      hind = lerp(-1.15, 0.65, smooth(0.62, 1, u));        // stretched right out behind
      front = lerp(1.1, 0.35, smooth(0.7, 1, u));
      if (s.flip) spin = -Math.PI * 2 * smooth(0.08, 0.92, u);
      if (s.jumpT >= 1) {
        s.mode = "hop";
        s.hopT = HOP_AIR; // land into the ground part of a hop
        s.wasAir = false;
        s.y = 0;
        s.squash = 1;
        s.flip = false;
        ctx.play("hop", { volume: 1 });
        burst("dust", 6, -0.2, 0.12, 1.2);
      }
    }
    const vy = (s.y - s.lastY) / Math.max(dt, 0.001);
    s.lastY = s.y;

    s.squash = Math.max(0, s.squash - dt * 4.5);
    const sq = Math.sin(s.squash * Math.PI) * 0.16;
    bunny.root.position.y = s.y;
    bunny.root.scale.set(1 + sq * 0.6, 1 - sq, 1 + sq * 0.6).multiplyScalar(BUNNY_SIZE);
    const lean = pitch * 0.75 + spin;
    bunny.body.rotation.z = lean; // rock and flip around the middle of the body, not the feet
    bunny.body.position.set(Math.sin(lean) * 0.55, 0.55 - Math.cos(lean) * 0.55, 0);
    for (const leg of bunny.hind) leg.rotation.z = hind - pitch * 0.4;
    for (const leg of bunny.front) leg.rotation.z = front - pitch * 0.4;

    // head stays fairly level, nods while munching
    s.munch = Math.max(0, s.munch - dt);
    const chew = s.munch > 0 ? Math.abs(Math.sin(s.munch * 20)) : 0;
    bunny.head.rotation.z = -pitch * 0.5 + chew * 0.1;
    bunny.head.rotation.y = -0.42 - 0.3 * (s.tall || 0) + Math.sin(s.time * 0.7) * 0.08; // glance toward the child
    for (const cheek of bunny.cheeks) cheek.scale.setScalar(0.16 * (1 + chew * 0.35));

    // ears: springs that are dragged around by the motion, so they lag and flop
    for (const ear of bunny.ears) {
      const target = 0.32 + clamp(vy / 5, -0.7, 0.8) * 0.75 + pitch * 0.3;
      ear.speed += ((target - ear.angle) * ear.stiff - ear.speed * 9) * dt;
      ear.angle += ear.speed * dt;
      const tipTarget = (ear.angle - 0.32) * 0.9 + 0.12;
      ear.tipSpeed += ((tipTarget - ear.tipAngle) * 55 - ear.tipSpeed * 6) * dt;
      ear.tipAngle += ear.tipSpeed * dt;
      ear.base.rotation.z = clamp(ear.angle, -0.5, 1.5);
      ear.tip.rotation.z = clamp(ear.tipAngle, -0.9, 1.3);
    }
    bunny.tail.position.y = 0.66 + Math.sin(s.time * 14) * 0.012;
    bunny.tail.scale.setScalar(0.15 * (1 + Math.sin(s.time * 14) * 0.06));

    // blink now and then
    s.nextBlink -= dt;
    if (s.nextBlink <= 0) { s.blink = 0.13; s.nextBlink = rand(2, 4.5); }
    s.blink = Math.max(0, s.blink - dt);
    for (const eye of bunny.eyes) eye.scale.y = s.blink > 0 ? 0.012 : 0.095;

    const shade = 1 - clamp(s.y / 2.6, 0, 0.6);
    shadow.scale.set(0.62 * shade * BUNNY_SIZE, 0.36 * shade * BUNNY_SIZE, 1);
    shadow.material.opacity = 0.28 * shade;

    // --- carrots and obstacles ---
    const mouthX = 0.75 * BUNNY_SIZE, mouthY = s.y + 0.85 * BUNNY_SIZE;
    let nearestObstacle = Infinity;
    for (let i = s.items.length - 1; i >= 0; i--) {
      const it = s.items[i];
      it.x -= move;
      if (it.type === "obstacle") {
        if (it.x > -0.2) nearestObstacle = Math.min(nearestObstacle, it.x);
      } else if (it.eaten) {
        // fly into the mouth and shrink
        it.eaten += dt / 0.16;
        const k = Math.min(it.eaten, 1);
        it.obj.position.set(lerp(it.x, mouthX, k), lerp(it.drawY, mouthY, k), 0);
        it.obj.scale.setScalar(Math.max(0.01, (it.high ? 1.2 : 1) * (1 - k)));
        if (k >= 1) { scene.remove(it.obj); s.items.splice(i, 1); }
        continue;
      } else {
        it.drawY = it.y + Math.sin(s.time * 3 + it.phase) * 0.07;
        it.obj.position.set(it.x, it.drawY, 0);
        it.obj.rotation.y += dt * 2.2;
        // Every carrot the bunny passes is eaten, whether it is hopping or
        // jumping: little fingers can't time a jump, so nothing is ever missed.
        if (it.x - mouthX < 0.35) eat(it);
      }
      if (it.type === "obstacle") it.obj.position.x = it.x;
      if (it.x < -12) { scene.remove(it.obj); s.items.splice(i, 1); }
    }

    // the bunny always clears obstacles by itself: it can't bump into anything
    if (s.mode === "hop" && nearestObstacle < SPEED * JUMP_TIME / 2 + 0.25) {
      s.stats.autoJumps++;
      startJump(false);
    }

    // --- flying bits ---
    for (const bit of bits) {
      if (bit.life <= 0) continue;
      bit.life -= dt;
      bit.vy -= bit.gravity * dt;
      bit.mesh.position.x += (bit.vx - SPEED * 0.4) * dt;
      bit.mesh.position.y = Math.max(0.04, bit.mesh.position.y + bit.vy * dt);
      bit.mesh.position.z += bit.vz * dt;
      bit.mesh.rotation.x += dt * 6;
      bit.mesh.rotation.y += dt * 5;
      bit.mesh.scale.setScalar(bit.size * clamp(bit.life / bit.maxLife * 1.6, 0, 1));
      if (bit.life <= 0) bit.mesh.visible = false;
    }
  }

  // ----- camera fits any screen: side-on when wide, more "behind" when tall -----
  function resize() {
    const w = el.clientWidth || 1, h = el.clientHeight || 1;
    renderer.setSize(w, h, false);
    const aspect = w / h;
    const tall = clamp((1.7 - aspect) / (1.7 - 0.5), 0, 1);
    const yaw = lerp(0.16, 0.75, tall), up = lerp(0.2, 0.3, tall), dist = lerp(7.4, 11.5, tall);
    const target = new THREE.Vector3(lerp(1.9, 1.5, tall), lerp(1.25, 1.5, tall), 0);
    s.tall = tall;
    camera.fov = lerp(36, 44, tall);
    camera.aspect = aspect;
    camera.position.set(
      target.x - Math.sin(yaw) * Math.cos(up) * dist,
      target.y + Math.sin(up) * dist,
      target.z + Math.cos(yaw) * Math.cos(up) * dist);
    camera.lookAt(target);
    camera.updateProjectionMatrix();
  }
  const watcher = new ResizeObserver(resize);
  watcher.observe(el);
  resize();

  let last = performance.now();
  function frame(now) {
    if (!s.alive) return;
    s.raf = requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    update(dt);
    renderer.render(scene, camera);
  }
  s.raf = requestAnimationFrame(frame);

  // ----- a tap anywhere = a big jump -----
  const tap = (e) => {
    e.preventDefault();
    s.taps++;
    if (s.mode === "hop") startJump(true); // taps in mid-jump are ignored
  };
  const key = (e) => { if (e.key === " " || e.key === "Enter") tap(e); };
  el.addEventListener("pointerdown", tap);
  window.addEventListener("keydown", key);

  s.step = (dt) => { update(dt); renderer.render(scene, camera); }; // for tests
  s.cleanup = () => {
    cancelAnimationFrame(s.raf);
    watcher.disconnect();
    el.removeEventListener("pointerdown", tap);
    window.removeEventListener("keydown", key);
    scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    for (const m of kit.mats.values()) m.dispose();
    kit.ramp.dispose();
    scene.background.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  };
}

function stop() {
  if (!session) return;
  session.alive = false;
  session.cleanup();
  session = null;
}

export default { assets, start, stop, get state() { return session; } };
