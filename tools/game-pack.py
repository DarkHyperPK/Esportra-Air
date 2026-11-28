#!/usr/bin/env python3
"""Builds a game pack for Air from an official kit folder, and optionally uploads it to Esportra's private bucket.

  python3 tools/game-pack.py --game pubgm --kit "<kit folder>" --out <work folder> [--version 2026.11] [--upload]

The kit is read, never changed: every picture keeps its exact bytes (named by its sha256) and a small version
(about 320 px PNG) is made for lists. The manifest names each picture's kind from the kit's folders. --upload needs
SUPABASE_URL and SUPABASE_SERVICE_KEY in the environment (never in a file) and puts the files and manifest.json
into the `air.game-packs` bucket. Kit files never go into git.
"""
import argparse, hashlib, io, json, os, re, sys, urllib.request
from pathlib import Path
from PIL import Image

EXT = {'.png': 'png', '.jpg': 'jpg', '.jpeg': 'jpg', '.webp': 'webp'}
MIME = {'png': 'image/png', 'jpg': 'image/jpeg', 'webp': 'image/webp'}

# PUBG MOBILE partner kit folders (read 19 Nov). Logos: the largest size of each official variant only.
def kind_of(rel: str):
    r = rel.lower()
    if 'psd' in r or r.endswith('.ai'):
        return None
    if '02. pubgm esports logo' in r:
        if 'taiwan' in r:
            return None
        if 'encourage to use this' in r:
            return 'logo-esports' if '@2048px' in r else None
        return 'logo-game' if '@2048px' in r else None
    if '01. ci logos' in r:
        return 'logo-ci' if '[general]' in r else None
    if '/characters/' in r or r.startswith('characters/') or 'raw assets/characters' in r:
        return 'character'
    if 'maps and scenes/maps/' in r:
        return 'map'
    if 'maps and scenes' in r:
        return 'wallpaper'
    if 'vehicles' in r:
        return 'vehicle'
    if '/pan/' in r or '/others/' in r:
        return 'item'
    if 'wallpapers' in r:
        return 'wallpaper'
    return None

def variant_of(name: str):
    m = re.search(r'(black|white|yellow)', name.lower())
    return m.group(1) if m else None

def nice_name(path: Path) -> str:
    stem = re.sub(r'@\d+px|\.png$', '', path.stem, flags=re.I)
    stem = re.sub(r'[_]+', ' ', stem).strip()
    if not re.search(r'[A-Za-z]', stem):  # files named with non-Latin or numbers only
        stem = f'{path.parent.name} {stem}'.strip()
    return stem[:80] or path.parent.name

def entry(data: bytes, ext: str):
    return {'sha256': hashlib.sha256(data).hexdigest(), 'ext': ext, 'bytes': len(data)}

def build(game: str, kit: Path, out: Path, version: str):
    files = out / 'files'
    files.mkdir(parents=True, exist_ok=True)
    assets, seen = [], set()
    for path in sorted(kit.rglob('*')):
        if not path.is_file() or path.suffix.lower() not in EXT:
            continue
        rel = path.relative_to(kit).as_posix()
        kind = kind_of('/' + rel)
        if not kind:
            continue
        data = path.read_bytes()
        f = entry(data, EXT[path.suffix.lower()])
        if f['sha256'] in seen:  # the kit repeats some files
            continue
        seen.add(f['sha256'])
        try:
            img = Image.open(io.BytesIO(data)); w, h = img.size
            thumb = img.convert('RGBA'); thumb.thumbnail((320, 320))
            buf = io.BytesIO(); thumb.save(buf, 'PNG', optimize=True); small = buf.getvalue()
        except Exception as e:
            print(f'skip {rel}: {e}', file=sys.stderr); continue
        t = entry(small, 'png')
        (files / f"{f['sha256']}.{f['ext']}").write_bytes(data)
        (files / f"{t['sha256']}.png").write_bytes(small)
        a = {'id': f['sha256'][:16], 'kind': kind, 'name': nice_name(path), 'w': w, 'h': h, 'file': f, 'thumb': t}
        v = variant_of(rel) if kind.startswith('logo-') else None
        if v:
            a['variant'] = v
        assets.append(a)
    manifest = {'game': game, 'version': version, 'assets': assets}
    (out / 'manifest.json').write_text(json.dumps(manifest, indent=1))
    counts = {}
    for a in assets:
        counts[a['kind']] = counts.get(a['kind'], 0) + 1
    print(f'{len(assets)} pictures: {counts}')
    return manifest

def upload(game: str, out: Path):
    base = os.environ['SUPABASE_URL'].rstrip('/')
    key = os.environ['SUPABASE_SERVICE_KEY']
    def put(path: str, data: bytes, mime: str):
        req = urllib.request.Request(f'{base}/storage/v1/object/air.game-packs/{path}', data=data, method='POST',
                                     headers={'Authorization': f'Bearer {key}', 'apikey': key, 'Content-Type': mime, 'x-upsert': 'true'})
        with urllib.request.urlopen(req) as r:
            if r.status >= 300:
                raise RuntimeError(f'{path}: {r.status}')
    for f in sorted((out / 'files').iterdir()):
        put(f'{game}/files/{f.name}', f.read_bytes(), MIME[f.suffix[1:]])
    # The manifest last: Air only sees a version once all its files are there.
    put(f'{game}/manifest.json', (out / 'manifest.json').read_bytes(), 'application/json')
    print('uploaded')

if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--game', required=True)
    ap.add_argument('--kit', required=True, type=Path)
    ap.add_argument('--out', required=True, type=Path)
    ap.add_argument('--version', default='1')
    ap.add_argument('--upload', action='store_true')
    a = ap.parse_args()
    if not re.fullmatch(r'[a-z0-9]{2,16}', a.game):
        sys.exit('game: 2-16 lowercase letters or digits')
    build(a.game, a.kit, a.out, a.version)
    if a.upload:
        upload(a.game, a.out)
