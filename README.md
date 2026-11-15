# Temi

Simple, joyful games for toddlers (ages 1–4), in a shell built so more can be
added with one folder and one list entry. Two games so far:

- **Animal Tap**: tap the animal, hear its name and its sound, meet the next one.
- **Bunny Hop**: a 3D bunny hops through a forest forever, eating carrots. A tap
  anywhere makes it do a big jump. It jumps every obstacle by itself and eats
  every carrot it passes, so nothing can go wrong.

**Live:** https://denzeldenys.github.io/temi/

Plain HTML, CSS and JavaScript. No framework, no build step, nothing loaded from
other sites at runtime. Works offline once opened, and installs as an app.

## Run it

Any static file server works. From this folder:

```bash
python -m http.server 8765
```

Then open http://localhost:8765. (Opening `index.html` straight from disk won't
work: browsers block modules and service workers on `file://`.)

**While editing:** the service worker answers from its cache first and refreshes
in the background, so a change appears on the *second* reload. To see changes
immediately, tick *Application → Service workers → Bypass for network* in
Chrome DevTools.

## How it is laid out

```
index.html              the three screens: start, home, game
css/shell.css           shared look (colours, tiles, buttons, animations)
js/app.js               shell: navigation, home screen, parents' corner
js/games.js             THE GAMES LIST: one entry per game
js/audio.js             audio manager (Web Audio, mute, unlock)
js/preloader.js         loads every picture and sound up front
js/hold.js              press-and-hold buttons
sw.js                   service worker (offline)
manifest.webmanifest    install details (name, icons, fullscreen)
assets/                 logo, mascot, tiles, shell sounds, font
icons/                  app icons (192, 512, maskable)
games/animal-tap/       game.js, game.css, animals.js, assets/
games/bunny-hop/        game.js (bunny, forest and rules, all in code), assets/ (sounds)
vendor/                 three.js, the 3D library Bunny Hop uses (bundled, MIT)
tools/                  asset processing and Android helpers
```

For grown-ups: press and hold the small padlock on the home screen for 2 seconds
to open the parents' corner (sound on/off, Install). Inside a game, hold the
home button for 1 second to go back.

## Add an animal

1. Put three files in `games/animal-tap/assets/`, named after the animal:
   `panda.png` (transparent background, about 720 px tall), `panda-name.mp3`
   (the spoken name), `panda-sound.mp3` (its call, 1–2 s).
2. Add one line to `games/animal-tap/animals.js`:

   ```js
   { id: "panda", name: "Panda", color: "#7ED957" },
   ```

That's all: the preloader and the offline cache pick the files up by themselves.

To make the files match the rest, generate raw versions and run them through
the same processing (trims silence, evens out loudness, crops and compresses):

```bash
pip install pillow numpy imageio-ffmpeg
# raw/images/panda.png  raw/audio/panda-name.mp3  raw/audio/panda-sound.mp3
python tools/process_assets.py raw --only panda
```

The existing assets were made with Magnific. To match them:

- **Picture:** "A cute friendly cartoon *panda*, full body, standing, facing the
  viewer and smiling. Flat vector children's book illustration style for
  toddlers: big round shiny black eyes, pink cheeks, thick dark rounded
  outlines, simple chunky rounded shapes, bright saturated flat colours, no
  text, no ground shadow. Centered, whole animal visible. Plain solid white
  background." Use an existing animal as an image reference, then remove the
  background.
- **Voice:** *Isla Kensington*, model Eleven v3, speed 0.85, text `[excited] Panda!`
- **Sound:** a 2-second sound effect, e.g. "A single panda bleat, clean close
  recording, no background noise".

## Tune Bunny Hop

The bunny, trees, carrots and obstacles are built from simple 3D shapes in
`games/bunny-hop/game.js`; there are no model files. The numbers at the top of
that file set the feel: `SPEED`, `HOP_HEIGHT`, `JUMP_HEIGHT`, `JUMP_TIME`,
`BUNNY_SIZE`. `refillQueue()` decides what comes down the path (how many
carrots, how often an obstacle), and `eat()` decides which sounds and voice
lines play. To process new sounds for it:

```bash
python tools/process_assets.py raw --game bunny-hop
```

## Add a game

1. Create `games/my-game/` with a `game.js` that default-exports three things:

   ```js
   const url = (p) => new URL(p, import.meta.url).href;

   export default {
     // everything listed here is preloaded and cached for offline use
     assets: {
       styles: [url("./game.css")],
       images: [url("./assets/ball.png")],
       sounds: { pop: url("./assets/pop.mp3") },
     },
     start(root, ctx) {
       // build the game inside `root` (it fills the screen)
       // ctx.play("pop")          -> plays this game's sound, resolves when it ends
       // ctx.play("shell:whoosh") -> shared sounds: shell:whoosh, shell:tap
       // ctx.play("birds", { loop: true, volume: 0.5 }) -> loops until the child leaves
       // ctx.stopSounds()
     },
     stop() {
       // the child went home: remove listeners, stop timers
     },
   };
   ```

2. Add one entry to `js/games.js`:

   ```js
   { id: "my-game", name: "My Game", tile: "assets/tile-my-game.jpg", entry: "games/my-game/game.js" },
   ```

   Two "coming soon" tiles are already in the list. Giving one an `entry`
   wakes it up; an entry without `entry` shows as greyed-out and asleep.

The shell supplies the home button, mute, preloading and offline caching.
`games/animal-tap/game.js` is a complete worked example in plain HTML and CSS;
`games/bunny-hop/game.js` is one that draws in 3D.

## Deploy

Temi is on GitHub Pages, served from the `main` branch of
https://github.com/denzeldenys/temi. To publish a change:

```bash
git add -A
git commit -m "Describe the change"
git push
```

It is live about a minute later. People who already have Temi get the new
version the second time they open it after that. To push everyone onto fresh
files at once, change `CACHE` in `sw.js` (for example `temi-v1` → `temi-v2`).

Any other static host works too (Netlify, Cloudflare Pages, Firebase Hosting):
upload the folder as it is. Every path in the app is relative, so it runs from
a sub-folder or a domain root. It must be served over HTTPS to be installable.

## Install on an Android phone

### The quick way: install the web app (no APK needed)

1. On the phone, open https://denzeldenys.github.io/temi/ in Chrome.
2. Tap play, then hold the padlock (bottom right of the home screen) for
   2 seconds and tap **Install Temi**. If the button isn't shown, use Chrome's
   ⋮ menu → **Add to Home screen** → **Install**.
3. Temi now has its own icon, opens full-screen and works without internet.

### A real Android app (APK to sideload, AAB for Google Play)

This wraps the live site in a Trusted Web Activity. Two things in this process
have to be done by you, because they are yours to own: **creating the signing
key** (and choosing its passwords) and **accepting the Android SDK licence**.

**Option A: PWABuilder (in the browser, nothing to install)**

1. Go to https://www.pwabuilder.com, enter `https://denzeldenys.github.io/temi/`
   and press Start.
2. *Package for stores* → *Android* → *Generate package*. Use package ID
   `io.github.denzeldenys.temi`, and let it create a new signing key.
3. Download the zip. It contains the `.apk`, the `.aab`, `signing.keystore`,
   `signing-key-info.txt` and an `assetlinks.json`.
   **Keep the keystore and its passwords safe.** Every future update must be
   signed with the same key.

**Option B: Bubblewrap (on your computer)**

Needs Node.js. The first run offers to download a JDK and the Android SDK.

```bash
mkdir android
```
```bash
cd android
```
```bash
npx @bubblewrap/cli init --manifest https://denzeldenys.github.io/temi/manifest.webmanifest
```

Accept the suggested answers, with these exceptions: application ID
`io.github.denzeldenys.temi`, display mode `fullscreen`. Let it create the
signing key and choose your passwords. Then:

```bash
npx @bubblewrap/cli build
```

This writes `app-release-signed.apk` (install directly) and
`app-release-bundle.aab` (upload to Google Play), and prints the key's SHA-256
fingerprint. The `android/` keystore files are in `.gitignore`: never commit them.

**Then, for either option: publish the Digital Asset Links file**

Without this the app still works but shows a browser address bar. Take the
SHA-256 fingerprint of your signing key (from `signing-key-info.txt`, or
Bubblewrap's output) and run, from this folder:

```bash
bash tools/publish-assetlinks.sh "AA:BB:CC:...:FF"
```

The file must sit at the root of the site's address
(`https://denzeldenys.github.io/.well-known/assetlinks.json`), which on GitHub
Pages means a repository named `denzeldenys.github.io`. The script creates it
if needed and adds the file. If you later publish through Google Play with Play
App Signing, run it again with both fingerprints (yours and the one in
Play Console → Setup → App signing).

**Install the APK**

Copy the `.apk` to the phone (USB, Drive, email), tap it, and allow "install
unknown apps" for the app you opened it from. Or with USB debugging on:

```bash
adb install app-release-signed.apk
```

Chrome must be installed on the phone: the app uses it behind the scenes.

## Credits

Pictures, voice and sound effects generated with Magnific. Font: Fredoka
(SIL Open Font License), bundled in `assets/fonts`. 3D drawing: three.js (MIT),
bundled in `vendor`.
