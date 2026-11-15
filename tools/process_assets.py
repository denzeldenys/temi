"""Turn raw generated assets into the compressed files Temi ships.

    python tools/process_assets.py <raw-dir> [--only lion,duck]

<raw-dir> layout (all optional - whatever is present is processed):
    images/<animal>.png        cut-out animal on transparent background
    images/mascot.png, logo.png
    images/tile-<game>.png     square tile pictures
    audio/<animal>-name.mp3    spoken name
    audio/<animal>-sound.mp3   animal call
    audio/temi-name.mp3, whoosh.mp3, tap.mp3

Needs: pip install pillow numpy imageio-ffmpeg
"""
import os, subprocess, sys, glob
import numpy as np
from PIL import Image
import imageio_ffmpeg

FF = imageio_ffmpeg.get_ffmpeg_exe()
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GAME = os.path.join(ROOT, "games", "animal-tap", "assets")
SHELL = os.path.join(ROOT, "assets")
ICONS = os.path.join(ROOT, "icons")
SR = 44100
SHELL_AUDIO = {"temi-name", "whoosh", "tap"}
SHELL_IMAGES = {"mascot", "logo"}
ICON_BG = (62, 193, 243)  # sky blue, matches --sky in css/shell.css


# ---------- audio ----------
def load(path):
    raw = subprocess.run([FF, "-v", "quiet", "-i", path, "-f", "f32le", "-ac", "1", "-ar", str(SR), "-"],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32).copy()


def save_mp3(samples, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    subprocess.run([FF, "-v", "quiet", "-y", "-f", "f32le", "-ac", "1", "-ar", str(SR), "-i", "-",
                    "-c:a", "libmp3lame", "-b:a", "96k", path], input=samples.astype(np.float32).tobytes(), check=True)


def envelope(a, win):
    n = len(a) // win
    return np.sqrt((a[: n * win].reshape(n, win) ** 2).mean(axis=1))


def trim(a, first_run_only):
    """Cut leading/trailing silence. For speech keep only the first voiced run,
    which drops the stray noises TTS sometimes adds after a single word."""
    win = int(SR * 0.02)
    loud = envelope(a, win) > 10 ** (-40 / 20)
    idx = np.where(loud)[0]
    if not len(idx):
        return a
    start, end = idx[0], idx[-1]
    if first_run_only:
        gap = 0
        for i in range(start, len(loud)):
            gap = 0 if loud[i] else gap + 1
            if gap >= 12:  # 240 ms of silence ends the word
                end = i - gap
                break
    s = max(0, start * win - int(SR * 0.03))
    e = min(len(a), (end + 1) * win + int(SR * 0.08))
    return a[s:e]


def finish(a, target_rms_db, fade_out=0.08):
    a = a.copy()
    fi, fo = int(SR * 0.01), min(int(SR * fade_out), len(a))
    a[:fi] *= np.linspace(0, 1, fi)
    a[-fo:] *= np.linspace(1, 0, fo)
    win = int(SR * 0.02)
    env = envelope(a, win)
    active = env[env > 10 ** (-40 / 20)]
    rms = np.sqrt((active ** 2).mean()) if len(active) else 1e-6
    gain = min(10 ** (target_rms_db / 20) / rms, 0.89 / max(np.abs(a).max(), 1e-6))
    return np.concatenate([a * gain, np.zeros(int(SR * 0.05), dtype=np.float32)])


def process_audio(path):
    name = os.path.splitext(os.path.basename(path))[0]
    a = load(path)
    if name.endswith("-name"):
        out = finish(trim(a, True), -14)
    elif name == "whoosh":
        out = finish(trim(a, False), -24, 0.15)
    elif name == "tap":
        out = finish(trim(a, False), -18, 0.15)
    else:
        out = finish(trim(a, False)[: int(SR * 2.4)], -16, 0.25)
    dest = os.path.join(SHELL if name in SHELL_AUDIO else GAME, name + ".mp3")
    save_mp3(out, dest)
    print(f"audio  {name:16s} {len(out) / SR:.2f}s  {os.path.getsize(dest) // 1024} KB")


# ---------- images ----------
def cutout(path, size):
    im = Image.open(path).convert("RGBA")
    im = im.crop(im.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox())
    im.thumbnail((size, size), Image.LANCZOS)
    return im


def save_png(im, dest):
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    im.quantize(colors=256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE).save(dest, optimize=True)
    print(f"image  {os.path.basename(dest):22s} {im.size[0]}x{im.size[1]}  {os.path.getsize(dest) // 1024} KB")


def process_tile(path):
    name = os.path.splitext(os.path.basename(path))[0]
    im = Image.open(path).convert("RGB")
    # trim any plain white frame the generator left around the picture
    mask = im.point(lambda v: 255 if v < 244 else 0).convert("L")
    box = mask.getbbox()
    if box:
        w, h = box[2] - box[0], box[3] - box[1]
        side = min(w, h)
        cx, cy = (box[0] + box[2]) // 2, (box[1] + box[3]) // 2
        inset = int(side * 0.02) if (w < im.width - 8 or h < im.height - 8) else 0
        half = side // 2 - inset
        im = im.crop((cx - half, cy - half, cx + half, cy + half))
    im = im.resize((512, 512), Image.LANCZOS)
    dest = os.path.join(SHELL, name + ".jpg")
    os.makedirs(SHELL, exist_ok=True)
    im.save(dest, quality=84, optimize=True)
    print(f"tile   {name + '.jpg':22s} 512x512  {os.path.getsize(dest) // 1024} KB")


def make_icons(mascot_path):
    os.makedirs(ICONS, exist_ok=True)
    m = cutout(mascot_path, 2000)

    def icon(size, scale, rounded, name):
        big = size * 2
        bg = Image.new("RGBA", (big, big), ICON_BG + (255,))
        mm = m.copy()
        mm.thumbnail((int(big * scale), int(big * scale)), Image.LANCZOS)
        bg.alpha_composite(mm, ((big - mm.width) // 2, (big - mm.height) // 2))
        if rounded:
            from PIL import ImageDraw
            mask = Image.new("L", (big, big), 0)
            ImageDraw.Draw(mask).rounded_rectangle((0, 0, big - 1, big - 1), radius=int(big * 0.22), fill=255)
            bg.putalpha(mask)
        bg = bg.resize((size, size), Image.LANCZOS)
        dest = os.path.join(ICONS, name)
        bg.save(dest, optimize=True)
        print(f"icon   {name:22s} {os.path.getsize(dest) // 1024} KB")

    icon(192, 0.80, True, "icon-192.png")
    icon(512, 0.80, True, "icon-512.png")
    icon(512, 0.58, False, "icon-maskable-512.png")  # keeps the mascot inside the safe zone
    icon(180, 0.74, False, "apple-touch-icon.png")
    icon(48, 0.84, True, "favicon.png")


def main():
    raw = sys.argv[1]
    only = None
    if "--only" in sys.argv:
        only = set(sys.argv[sys.argv.index("--only") + 1].split(","))
    want = lambda n: only is None or n.split("-")[0] in only or n in only
    for f in sorted(glob.glob(os.path.join(raw, "audio", "*.mp3"))):
        if want(os.path.splitext(os.path.basename(f))[0]):
            process_audio(f)
    for f in sorted(glob.glob(os.path.join(raw, "images", "*.png"))):
        name = os.path.splitext(os.path.basename(f))[0]
        if not want(name):
            continue
        if name.startswith("tile-"):
            process_tile(f)
        elif name == "logo":
            save_png(cutout(f, 900), os.path.join(SHELL, "logo.png"))
        elif name == "mascot":
            save_png(cutout(f, 640), os.path.join(SHELL, "mascot.png"))
            make_icons(f)
        else:
            save_png(cutout(f, 720), os.path.join(GAME, name + ".png"))


if __name__ == "__main__":
    main()
