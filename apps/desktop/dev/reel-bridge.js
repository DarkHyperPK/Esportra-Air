// The AIR bridge (reel v7, 25 Nov): a three.js scene the reel steps frame by frame. Esportra's tournament data sits
// on the left bank, the broadcast screen on the right, and Esportra AIR is the bridge between them; data crosses it
// as cards of light over a flowing stream. Deterministic: `draw(t)` renders the scene at t seconds, nothing runs on
// its own clock. Loaded by dev/showreel-v7.cjs from a routed origin (three from apps/desktop/node_modules).
//   await window.bridge.init({ bracket, screen, cards: [...], posters: [...], mode: 'open' | 'close' }); window.bridge.draw(t)
import * as THREE from './three.module.js';

const W = 1920, H = 1080;
const AMBER = 0xffb60e, CYAN = 0x38bdf8, ROSE = 0xf43f5e;
const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const lerp = (a, b, k) => a + (b - a) * k;

function loadTex(url) {
  return new Promise((res) => {
    if (!url) return res(null);
    new THREE.TextureLoader().load(url, (t) => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; res(t); }, undefined, () => res(null));
  });
}
function textTex(lines, { w = 1024, h = 256, font = '700 96px Poppins', color = '#fff', glow = 'rgba(255,182,14,.0)', align = 'center', spacing = 0 } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); g.font = font; g.textAlign = align; g.textBaseline = 'middle'; g.fillStyle = color;
  if ('letterSpacing' in g) g.letterSpacing = `${spacing}px`;
  g.shadowColor = glow; g.shadowBlur = 24;
  const x = align === 'center' ? w / 2 : 16;
  lines.forEach((l, i) => g.fillText(l, x, h / (lines.length + 1) * (i + 1)));
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function glowTex(r = 255, gg = 182, b = 14) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'), grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, `rgba(${r},${gg},${b},1)`); grd.addColorStop(0.25, `rgba(${r},${gg},${b},.55)`); grd.addColorStop(1, `rgba(${r},${gg},${b},0)`);
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

// The flowing stream under the bridge: bands of light drifting from Esportra to the broadcast.
const streamMat = () => new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  uniforms: { t: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `varying vec2 vUv; uniform float t;
    float h(float n){ return fract(sin(n)*43758.5453); }
    void main(){
      float lane = floor(vUv.y*14.0), y = fract(vUv.y*14.0);
      float speed = 0.06 + h(lane)*0.08, len = 0.04 + h(lane+7.0)*0.1;
      float x = fract(vUv.x*2.0 - t*speed*2.0 + h(lane+3.0));
      float dash = smoothstep(0.0, len, x) * (1.0 - smoothstep(len, len+0.02, x));
      float core = smoothstep(0.5, 0.0, abs(y-0.5));
      float edge = smoothstep(0.0, 0.25, vUv.y) * smoothstep(1.0, 0.75, vUv.y);
      vec3 c = mix(vec3(1.0,0.71,0.05), vec3(0.22,0.74,0.97), h(lane+11.0));
      float a = dash*core*edge*0.9 + edge*0.05;
      gl_FragColor = vec4(c*a, a);
    }`,
});

const S = {};

window.bridge = {
  async init(o) {
    await Promise.all(['700 96px Poppins', '800 96px Poppins'].map((f) => document.fonts.load(f)));
    const cv = document.getElementById('gl');
    const r = S.r = new THREE.WebGLRenderer({ canvas: cv, antialias: true, preserveDrawingBuffer: true });
    r.setPixelRatio(1); r.setSize(W, H, false); r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.05;
    r.outputColorSpace = THREE.SRGBColorSpace;
    const sc = S.scene = new THREE.Scene();
    sc.background = new THREE.Color(0x070a14); sc.fog = new THREE.FogExp2(0x070a14, 0.0075);
    S.cam = new THREE.PerspectiveCamera(38, W / H, 0.1, 600);
    S.mode = o.mode || 'open';
    sc.add(new THREE.AmbientLight(0x8090b0, 0.6)); sc.add(new THREE.HemisphereLight(0x9cc2ff, 0x0c0f18, 0.9));
    const rim = new THREE.PointLight(AMBER, 400, 90, 1.6); rim.position.set(2, 8, 10); sc.add(rim);
    const rimC = new THREE.PointLight(CYAN, 500, 120, 1.6); rimC.position.set(44, 14, 12); sc.add(rimC);
    const key = new THREE.DirectionalLight(0xffffff, 1.1); key.position.set(-20, 40, 30); sc.add(key);
    const glowA = glowTex(), glowC = glowTex(56, 189, 248);

    // ground: a dark floor with a faint grid
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(600, 300), new THREE.MeshStandardMaterial({ color: 0x070a12, roughness: 0.9, metalness: 0.1 }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = -6; sc.add(floor);
    const grid = new THREE.GridHelper(600, 150, 0x1a2338, 0x101624); grid.position.y = -5.98; sc.add(grid);

    // the stream of light under the bridge (the data travelling)
    S.stream = streamMat();
    const st = new THREE.Mesh(new THREE.PlaneGeometry(140, 26, 1, 1), S.stream); st.rotation.x = -Math.PI / 2; st.position.set(4, -5.9, 0); sc.add(st);
    // and the data running along the deck itself
    S.lane = streamMat(); const ln = new THREE.Mesh(new THREE.PlaneGeometry(74, 4.2, 1, 1), S.lane); ln.rotation.x = -Math.PI / 2; ln.position.set(2, 0.47, 0); sc.add(ln);

    // left bank: Esportra's tournament data
    const bank = (x, w) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, 6, 34), new THREE.MeshStandardMaterial({ color: 0x0c111d, roughness: 0.7, metalness: 0.3 })); m.position.set(x, -3, 0); sc.add(m); return m; };
    bank(-46, 26); bank(50, 26);
    const brT = await loadTex(o.bracket);
    const slab = new THREE.Mesh(new THREE.PlaneGeometry(22, 12.4), new THREE.MeshBasicMaterial({ map: brT, color: brT ? 0xffffff : 0x223, toneMapped: false }));
    slab.position.set(-46, 7.4, -4); slab.rotation.y = 0.32; sc.add(slab); S.slab = slab;
    const slabFrame = new THREE.Mesh(new THREE.PlaneGeometry(22.8, 13.2), new THREE.MeshBasicMaterial({ color: AMBER, transparent: true, opacity: 0.35, toneMapped: false }));
    slabFrame.position.copy(slab.position); slabFrame.position.z -= 0.05; slabFrame.rotation.y = slab.rotation.y; sc.add(slabFrame);
    const lab = new THREE.Mesh(new THREE.PlaneGeometry(16, 2), new THREE.MeshBasicMaterial({ map: textTex(['TOURNAMENT DATA'], { font: '700 110px Poppins', color: '#ffb60e', spacing: 18, w: 2048, h: 256 }), transparent: true, toneMapped: false }));
    lab.position.set(-46, 15.4, -4); lab.rotation.y = 0.32; sc.add(lab);

    // the bridge: deck, edge lights, two pylons with cables, the name on the tower
    const deckMat = new THREE.MeshStandardMaterial({ color: 0x27324c, roughness: 0.35, metalness: 0.5, emissive: 0x0b1222 });
    const deck = new THREE.Mesh(new THREE.BoxGeometry(74, 0.9, 5.2), deckMat); deck.position.set(2, 0, 0); sc.add(deck);
    const edgeMat = new THREE.MeshBasicMaterial({ color: AMBER, toneMapped: false });
    const dotMat = new THREE.SpriteMaterial({ map: glowA, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
    for (const z of [-2.65, 2.65]) {
      const e = new THREE.Mesh(new THREE.BoxGeometry(74, 0.22, 0.22), edgeMat); e.position.set(2, 0.55, z); sc.add(e);
      for (let x = -34; x <= 38; x += 3) { const d = new THREE.Sprite(dotMat); d.scale.set(2.4, 2.4, 1); d.position.set(x, 0.6, z); sc.add(d); }
    }
    const pyl = new THREE.MeshStandardMaterial({ color: 0x313d5c, roughness: 0.3, metalness: 0.6, emissive: 0x0d1426 });
    const cableMat = new THREE.LineBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.85 });
    for (const px of [-14, 18]) {
      for (const z of [-2.9, 2.9]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.9, 22, 0.9), pyl); p.position.set(px, 10, z); sc.add(p); const strip = new THREE.Mesh(new THREE.BoxGeometry(0.16, 21, 0.16), edgeMat); strip.position.set(px + 0.5, 10, z); sc.add(strip); }
      const beam = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 6.6), pyl); beam.position.set(px, 20.6, 0); sc.add(beam);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.25, 6.8), edgeMat); cap.position.set(px, 21.1, 0); sc.add(cap);
      const pts = [];
      for (let k = 1; k <= 7; k++) for (const s of [-1, 1]) for (const z of [-2.9, 2.9]) { pts.push(new THREE.Vector3(px, 19.6 - k * 0.9, z), new THREE.Vector3(px + s * k * 2.4, 0.45, z)); }
      sc.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), cableMat));
    }
    const name = new THREE.Mesh(new THREE.PlaneGeometry(12, 1.8), new THREE.MeshBasicMaterial({ map: textTex(['ESPORTRA AIR'], { font: '800 120px Poppins', w: 2048, h: 256, spacing: 10 }), transparent: true, toneMapped: false }));
    name.position.set(2, 23.4, 0); sc.add(name); S.name = name;

    // right bank: the broadcast
    const scT = await loadTex(o.screen);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(32, 18), new THREE.MeshBasicMaterial({ map: scT, color: scT ? 0xffffff : 0x222, toneMapped: false }));
    screen.position.set(52, 10, -6); screen.rotation.y = -0.38; sc.add(screen); S.screen = screen;
    const sf = new THREE.Mesh(new THREE.PlaneGeometry(32.9, 18.9), new THREE.MeshBasicMaterial({ color: CYAN, transparent: true, opacity: 0.35, toneMapped: false }));
    sf.position.copy(screen.position); sf.position.x += 0.05; sf.position.z -= 0.08; sf.rotation.y = screen.rotation.y; sc.add(sf);
    const sg = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowC, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
    sg.scale.set(70, 40, 1); sg.position.set(52, 10, -8); sc.add(sg);

    // data cards crossing the bridge, each with a glow and a trail
    const tex = await Promise.all((o.cards || []).map(loadTex));
    S.cards = tex.filter(Boolean).map((t, i) => {
      const g = new THREE.Group();
      const card = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 3.2), new THREE.MeshBasicMaterial({ map: t, transparent: true, toneMapped: false, side: THREE.DoubleSide }));
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: i % 3 ? glowA : glowC, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false })); halo.scale.set(8, 8, 1);
      const trail = new THREE.Mesh(new THREE.PlaneGeometry(12, 0.7), new THREE.MeshBasicMaterial({ color: i % 3 ? AMBER : CYAN, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
      trail.position.set(-7.4, 0, -0.05);
      g.add(halo, trail, card); sc.add(g);
      return { g, card, trail, halo, lane: (i % 3) - 1, start: i * 0.32 };
    });

    // posters for the close: more games arriving on the left bank
    const pt = await Promise.all((o.posters || []).map(loadTex));
    S.posters = pt.filter(Boolean).map((t, i) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 5.6), new THREE.MeshBasicMaterial({ map: t, transparent: true, toneMapped: false }));
      sc.add(m); return { m, i };
    });
    return true;
  },

  /** Renders the scene at `t` seconds. */
  draw(t) {
    const { cam, scene, r } = S;
    S.stream.uniforms.t.value = t; S.lane.uniforms.t.value = t * 1.6;
    // cards: from the Esportra bank, along the deck, into the screen
    const span = S.mode === 'open' ? 3.4 : 4.2;
    for (const c of S.cards) {
      const k = (t - c.start) / span;
      const on = k > 0 && k < 1;
      c.g.visible = on;
      if (!on) continue;
      const e = ease(clamp(k));
      const x = lerp(-38, 46, e), y = 3.2 + Math.sin(k * Math.PI) * 2.4 + c.lane * 0.3, z = c.lane * 1.4 - (e > 0.85 ? (e - 0.85) * 30 : 0);
      c.g.position.set(x, y, z);
      c.g.lookAt(cam.position);
      const fade = Math.min(1, k * 6, (1 - k) * 6);
      c.card.material.opacity = fade; c.halo.material.opacity = 0.7 * fade; c.trail.material.opacity = 0.5 * fade * (0.6 + 0.4 * Math.sin(t * 9 + c.start));
    }
    // posters (close): rise onto the left bank one after another
    for (const p of S.posters) {
      const k = clamp((t - 0.6 - p.i * 0.22) / 0.7), e = ease(k);
      p.m.visible = k > 0;
      const col = p.i % 5, row = Math.floor(p.i / 5);
      p.m.position.set(-56 + col * 4.8, lerp(-8, 3.6 + row * 6.2, e), 9 - row * 1.2);
      p.m.rotation.y = 0.32; p.m.material.opacity = e;
    }
    // camera
    const path = S.mode === 'open' ? OPEN : CLOSE;
    const [pos, look, fov] = camAt(path, t);
    cam.position.copy(pos); cam.lookAt(look); cam.fov = fov; cam.updateProjectionMatrix();
    S.name.lookAt(cam.position.x, S.name.position.y, cam.position.z);
    r.render(scene, cam);
  },
};

// Camera keys [t, position, look-at, fov]: eased between keys.
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const OPEN = [
  [0.0, V(-46, 7.6, 10.5), V(-46, 7.4, -4), 54],     // the bracket slab fills the frame (match cut from the hook)
  [1.6, V(-36, 12, 30), V(-30, 6, -2), 46],           // pull back: the slab on the bank, the bridge ahead
  [4.2, V(-6, 9, 26), V(8, 6, 0), 42],                // along the bridge with the cards
  [6.8, V(24, 11, 30), V(40, 8, -4), 40],             // towards the broadcast
  [9.4, V(44, 10.5, 16), V(52, 10, -6), 38],          // the screen fills the frame
];
const CLOSE = [
  [0.0, V(30, 30, 64), V(4, 4, 0), 44],
  [3.0, V(-18, 18, 46), V(-40, 6, 0), 44],
  [5.0, V(-30, 14, 40), V(-48, 7, 0), 42],
];
function camAt(keys, t) {
  let a = keys[0], b = keys[keys.length - 1];
  for (let i = 0; i < keys.length - 1; i++) if (t >= keys[i][0] && t <= keys[i + 1][0]) { a = keys[i]; b = keys[i + 1]; break; }
  if (t > keys[keys.length - 1][0]) a = b;
  const k = b[0] === a[0] ? 1 : ease(clamp((t - a[0]) / (b[0] - a[0])));
  return [a[1].clone().lerp(b[1], k), a[2].clone().lerp(b[2], k), lerp(a[3], b[3], k)];
}
