"""Player portraits for the reels (25 Nov), prepared like a broadcast package.

Every graphic crops a photo to its own slot (core/br.css: MVP hero 580x740, side cards 220x300, squads 330x520+),
so one square crop looked chopped differently everywhere. Here each photo becomes a 3:4 waist-up cutout with the same
framing (the face found by OpenCV at the same size and place in every frame) and the same look (exposure matched to
the group, a little contrast, a cool broadcast grade, gentle sharpening), on a transparent background.

  <venv with rembg, opencv-python-headless, pymatting>/python dev/reel-portraits.py <in dir> <out dir>
Photos are the producer's and never go in the repo.
"""
import os, sys
import numpy as np
import cv2
from PIL import Image, ImageEnhance, ImageFilter
from rembg import remove, new_session

W, H = 900, 1200
FACE_TOP = 0.12  # where the top of the face sits


def face_box(rgb):
    """The largest frontal face (x, y, w, h), or None."""
    gray = cv2.cvtColor(np.array(rgb), cv2.COLOR_RGB2GRAY)
    cc = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
    faces = cc.detectMultiScale(gray, scaleFactor=1.08, minNeighbors=6, minSize=(max(24, gray.shape[1] // 14),) * 2)
    return max(faces, key=lambda f: f[2] * f[3]) if len(faces) else None


def grade(img, target):
    """Exposure towards `target` mean luminance over the figure, then contrast, a cool grade and sharpening."""
    a = np.array(img).astype(np.float32) / 255
    rgb, al = a[..., :3], a[..., 3]
    lum = (rgb @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32))
    m = float(lum[al > 0.5].mean()) if (al > 0.5).any() else target
    gamma = np.log(target) / np.log(max(1e-3, min(0.95, m)))
    rgb = np.clip(rgb, 1e-4, 1) ** np.clip(gamma, 0.6, 1.6)
    rgb = rgb * np.array([0.985, 1.0, 1.035], dtype=np.float32)          # cool broadcast grade
    out = Image.fromarray((np.clip(np.dstack([rgb, al]), 0, 1) * 255).astype(np.uint8), 'RGBA')
    rgbimg = ImageEnhance.Contrast(out.convert('RGB')).enhance(1.08)
    rgbimg = ImageEnhance.Color(rgbimg).enhance(0.94)
    rgbimg = rgbimg.filter(ImageFilter.UnsharpMask(radius=2, percent=55, threshold=2))
    rgbimg.putalpha(out.getchannel('A'))
    return rgbimg


def prepare(src, sess):
    im = Image.open(src).convert('RGBA')
    cut = remove(im, session=sess, alpha_matting=True, alpha_matting_foreground_threshold=240,
                 alpha_matting_background_threshold=12, alpha_matting_erode_size=6)
    alpha = cut.getchannel('A').filter(ImageFilter.GaussianBlur(0.6))   # a 1 px feather on the edge
    cut.putalpha(alpha)
    f = face_box(im.convert('RGB'))
    if f is None:  # fall back to the top of the figure
        a = np.array(alpha) > 40; ys, xs = np.where(a)
        h = (ys.max() - ys.min()) * 0.18
        f = (int(np.median(xs[ys < ys.min() + h * 2])) - h / 2, ys.min() + h * 0.2, h, h)
    fx, fy, fw, fh = f
    # The figure fills the frame to the bottom: the face top sits at FACE_TOP and the bottom of the person (or of the
    # photo) meets the frame's bottom, so nobody floats; the face stays between 15 % and 24 % of the frame height.
    rows = np.where((np.array(alpha) > 40).any(axis=1))[0]
    bottom = rows.max() if len(rows) else im.height
    s = (H * (1 - FACE_TOP)) / max(1, bottom - fy)
    s = min(max(s, 0.15 * H / fh), 0.24 * H / fh)
    big = cut.resize((max(1, round(cut.width * s)), max(1, round(cut.height * s))), Image.LANCZOS)
    cx, top = (fx + fw / 2) * s, fy * s
    canvas = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    ox, oy = round(W / 2 - cx), round(FACE_TOP * H - top)
    canvas.alpha_composite(big, (ox, oy))
    # Where the original photo ends inside the frame (cut at the waist, or at a side), fade it out over 9 % of the
    # frame instead of leaving a straight edge.
    a = np.array(canvas.getchannel('A')).astype(np.float32)
    ramp = int(0.09 * H)
    edges = {'bottom': oy + big.height, 'left': ox, 'right': ox + big.width}
    yy, xx = np.mgrid[0:H, 0:W]
    if edges['bottom'] < H + 2: a *= np.clip((edges['bottom'] - yy) / ramp, 0, 1)
    if edges['left'] > -2: a *= np.clip((xx - edges['left']) / ramp, 0, 1)
    if edges['right'] < W + 2: a *= np.clip((edges['right'] - xx) / ramp, 0, 1)
    canvas.putalpha(Image.fromarray(a.astype(np.uint8)))
    return canvas


def main():
    src, out = sys.argv[1], sys.argv[2]
    os.makedirs(out, exist_ok=True)
    sess = new_session('u2net_human_seg')
    files = sorted(f for f in os.listdir(src) if f.lower().endswith(('.png', '.jpg', '.jpeg', '.webp')))
    framed = [(f, prepare(os.path.join(src, f), sess)) for f in files]
    # one exposure for the group: the average figure luminance
    lums = []
    for _, c in framed:
        a = np.array(c).astype(np.float32) / 255
        lum = a[..., :3] @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
        lums.append(float(lum[a[..., 3] > 0.5].mean()))
    target = float(np.clip(np.mean(lums), 0.3, 0.45))
    for f, c in framed:
        grade(c, target).save(os.path.join(out, os.path.splitext(f)[0] + '.png'))
        print(f, 'face', 'found' if face_box(Image.open(os.path.join(src, f)).convert('RGB')) is not None else 'MISSING')


if __name__ == '__main__':
    main()
