"""Face boxes for the loop reel's talent photos (OpenCV Haar cascades, as dev/reel-portraits.py finds faces).
  <venv with opencv-python-headless>/python dev/reel-faces.py photo.png ...   ->  {path: {size: [w, h], face: [x, y, w, h] | null}}
The reel places each photo by its face (dev/reel-frame.cjs placeFace); photos are the producer's and never go in the repo."""
import json, sys
import cv2


def find(gray):
    h = cv2.data.haarcascades
    cc = cv2.CascadeClassifier(h + 'haarcascade_frontalface_default.xml')
    size = (max(24, gray.shape[1] // 14),) * 2
    f = cc.detectMultiScale(gray, 1.08, 6, minSize=size)
    if len(f): return [int(v) for v in max(f, key=lambda r: r[2] * r[3])]
    pr = cv2.CascadeClassifier(h + 'haarcascade_profileface.xml')
    f = pr.detectMultiScale(gray, 1.08, 4, minSize=size)
    if len(f): return [int(v) for v in max(f, key=lambda r: r[2] * r[3])]
    flipped = cv2.flip(gray, 1)
    f = pr.detectMultiScale(flipped, 1.08, 4, minSize=size)
    if len(f):
        x, y, w, hh = max(f, key=lambda r: r[2] * r[3])
        return [int(gray.shape[1] - x - w), int(y), int(w), int(hh)]
    return None


out = {}
for path in sys.argv[1:]:
    im = cv2.imread(path)
    out[path] = {'size': [int(im.shape[1]), int(im.shape[0])], 'face': find(cv2.cvtColor(im, cv2.COLOR_BGR2GRAY))}
print(json.dumps(out))
