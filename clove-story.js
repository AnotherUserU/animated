/*!
 * <clove-story> — "The Journey of a Clove", an 8-bit animated short for Nusajawa Clove.
 * Plain JavaScript + Canvas 2D, zero dependencies, ~70 s loop.
 *
 *   <script src="/clove-story.js" defer></script>
 *   <clove-story accent="#b5562c" cta-href="#contact"></clove-story>
 *
 * Attributes (all optional):
 *   lang         "en" | "id"   (default: <html lang>, falls back to en)
 *   accent       hex colour for brand details (default #b5562c)
 *   brand        title text (default "Nusajawa Clove")
 *   tagline      outro subtitle
 *   cta-href     shows a button on the last scene, e.g. "#contact"
 *   cta-text     button label
 *   no-autoplay  don't start when scrolled into view
 *   no-loop      stop on the final scene instead of looping
 *   no-fonts     don't inject the Google Fonts <link> (Press Start 2P + VT323)
 *
 * JS API: el.play(), el.pause(), el.seek(seconds), el.duration
 */
(() => {
  'use strict';
  if (typeof window === 'undefined' || !window.customElements || customElements.get('clove-story')) return;

  // Internal canvas resolution: everything is drawn in 320x180 "pixels", then scaled up crisp.
  const W = 320, H = 180, GROUND = 146, PI = Math.PI;
  const DEFAULT_ACCENT = '#b5562c';

  /* ------------------------------------------------------------------ utils */

  const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const seg = (p, a, b) => clamp((p - a) / (b - a));
  const frac = v => v - Math.floor(v);
  const bump = (p, a, b) => Math.sin(seg(p, a, b) * PI);
  const E = {
    inOut: t => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2),
    out: t => 1 - (1 - t) ** 3,
    back: t => 1 + 2.7 * (t - 1) ** 3 + 1.7 * (t - 1) ** 2,
  };
  // Stateless hash -> [0,1). Every frame is a pure function of time, so seeking always works.
  const hash = (x, y = 0) => {
    let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const rng = seed => () => (seed = (seed * 16807) % 2147483647) / 2147483647;

  const rgbCache = new Map();
  const toRgb = hex => {
    let v = rgbCache.get(hex);
    if (!v) {
      if (hex[0] === '#') {
        const n = parseInt(hex.slice(1), 16);
        v = [n >> 16, (n >> 8) & 255, n & 255];
      } else v = hex.match(/\d+/g).slice(0, 3).map(Number); // an already-mixed rgb() string
      rgbCache.set(hex, v);
    }
    return v;
  };
  const mix = (a, b, t) => {
    const A = toRgb(a), B = toRgb(b);
    t = clamp(t);
    return `rgb(${Math.round(lerp(A[0], B[0], t))},${Math.round(lerp(A[1], B[1], t))},${Math.round(lerp(A[2], B[2], t))})`;
  };
  const mixN = (stops, t) => {
    t = clamp(t) * (stops.length - 1);
    const i = Math.min(stops.length - 2, Math.floor(t));
    return mix(stops[i], stops[i + 1], t - i);
  };
  const shade = (hex, k) => mix(hex, k < 0 ? '#000000' : '#ffffff', Math.abs(k));

  /* ------------------------------------------------------------- primitives */

  const R = (c, x, y, w, h, col) => {
    c.fillStyle = col;
    c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  };
  const disc = (c, cx, cy, r, col) => {
    cx = Math.round(cx); cy = Math.round(cy); r = Math.round(r);
    c.fillStyle = col;
    for (let dy = -r; dy <= r; dy++) {
      const w = Math.floor(Math.sqrt(r * r - dy * dy) + 0.5);
      c.fillRect(cx - w, cy + dy, w * 2 + 1, 1);
    }
  };
  const line = (c, x0, y0, x1, y1, col) => {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    c.fillStyle = col;
    const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1, dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (let i = 0; i < 600; i++) {
      c.fillRect(x0, y0, 1, 1);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  };
  const alpha = (c, a, fn) => { c.globalAlpha = clamp(a); fn(); c.globalAlpha = 1; };
  const sparkle = (c, x, y, s, col = '#fff6c8') => {
    R(c, x, y - s, 1, s * 2 + 1, col);
    R(c, x - s, y, s * 2 + 1, 1, col);
  };

  // 3x5 / 4x5 bitmap glyphs for the few letters painted inside the scene.
  const GLYPH = {
    N: ['X..X', 'XX.X', 'X.XX', 'X..X', 'X..X'],
    J: ['..X', '..X', '..X', 'X.X', '.X.'],
    5: ['XXX', 'X..', 'XX.', '..X', 'XX.'],
    0: ['.X.', 'X.X', 'X.X', 'X.X', '.X.'],
    K: ['X.X', 'X.X', 'XX.', 'X.X', 'X.X'],
    G: ['.XX', 'X..', 'X.X', 'X.X', '.XX'],
    ' ': ['.', '.', '.', '.', '.'],
  };
  const tiny = (c, str, x, y, col) => {
    c.fillStyle = col;
    for (const ch of str) {
      const g = GLYPH[ch] || GLYPH[' '];
      g.forEach((row, yy) => [...row].forEach((v, xx) => v === 'X' && c.fillRect(Math.round(x) + xx, Math.round(y) + yy, 1, 1)));
      x += g[0].length + 1;
    }
  };

  /* ---------------------------------------------------------------- sprites */

  const FARMER = [
    '...hHHHHh...',
    '..hHHHHHHh..',
    'hhhHHHHHHhhh',
    '...sSSSSS...',
    '...sSSSES...',
    '...sSSSSS...',
    '....sSSS....',
    '..bBBBBBBb..',
    '..bBBBBBBb..',
    '..SBBBBBBS..',
    '...BBBBBB...',
    '...PPPPPP...',
    '...PP..PP...',
    '...PP..PP...',
    '...PP..PP...',
    '..FFF..FFF..',
  ];
  const BUYER = [
    '....kkkk....',
    '...kkkkkk...',
    '...kSSSSS...',
    '...kSSSES...',
    '...sSSSSS...',
    '....sSSS....',
    '..NNNWWNNN..',
    '..NNNWTNNN..',
    '..NNNWTNNN..',
    '..SNNNTNNS..',
    '...NNNNNN...',
    '...PP..PP...',
    '...PP..PP...',
    '...PP..PP...',
    '...PP..PP...',
    '..FFF..FFF..',
  ];
  const LEGS_A = ['...PPPPPP...', '..PPP..PP...', '..PP....PP..', '.PP.....PP..', '.FF......FF.'];
  const LEGS_B = ['...PPPPPP...', '....PPPP....', '....PPPP....', '....PPPP....', '....FFFF....'];
  const CLOVE = [
    '....LLL....',
    '...LLMMM...',
    '..LLMMMMd..',
    '.LdLMMMdMd.',
    '.LMddddMMd.',
    '..LMMMMMd..',
    '...LMMMd...',
    '....LMd....',
    '....dMd....',
    '....dMd....',
    '....dMd....',
    '....dMd....',
    '....dMd....',
    '.....M.....',
    '.....d.....',
  ];
  const HEART = ['.RR.RR.', 'RWRRRRR', 'RRRRRRR', '.RRRRR.', '..RRR..', '...R...'];
  // 50 kg jute sack with "NJ" and an accent band.
  const SACK = [
    '.....cccc.....',
    '......cc......',
    '....cCCCCc....',
    '...CCCCCCCC...',
    '..CCCCCCCCCC..',
    '.CCCCCCCCCCCC.',
    '.CCdCCdCCCCdC.',
    '.CCddCdCCCCdC.',
    '.CCdCddCCCCdC.',
    '.CCdCCdCCdCdC.',
    '.CCdCCdCCCdCC.',
    '.CCCCCCCCCCCC.',
    '.cAAAAAAAAAAc.',
    '.CCCCCCCCCCCC.',
    '..cCCCCCCCCc..',
    '...cccccccc...',
  ];
  const SPROUT = ['.g...g.', 'ggg.ggg', '.gGgGg.', '...G...', '...G...', '...G...', '...G...'];
  const FLASK = ['..gg..', '..gg..', '..gg..', '.gGGg.', 'gGLLGg', 'gLLLLg', '.gggg.'];
  const DOC = ['WWWWWWW', 'WkkkkWW', 'WWWWWWW', 'WkkkkkW', 'WWWWWWW', 'WkkkWWW', 'WWWWWWW', 'WWWWWAW'];

  const PAL_FARMER = { H: '#f2c86b', h: '#b98a3a', S: '#c68652', s: '#9a5f34', E: '#23160f', B: '#2f7a8c', b: '#1f5563', P: '#3a2e2a', F: '#1b1411' };
  const PAL_CLOVE = { L: '#c77b4a', M: '#8b4a26', d: '#5a2d16' };

  function makeSprite(rows, pal) {
    const w = Math.max(...rows.map(r => r.length)), h = rows.length;
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const c = cv.getContext('2d');
    rows.forEach((row, y) => [...row].forEach((ch, x) => {
      if (pal[ch]) { c.fillStyle = pal[ch]; c.fillRect(x, y, 1, 1); }
    }));
    return cv;
  }
  const patch = (rows, edits) => {
    const r = rows.map(s => [...s]);
    for (const [x, y, ch] of edits) r[y][x] = ch;
    return r.map(a => a.join(''));
  };
  const legs = (rows, l) => rows.slice(0, rows.length - l.length).concat(l);

  const spriteCache = new Map();
  function sprites(accent) {
    let s = spriteCache.get(accent);
    if (s) return s;
    const pb = { k: '#3b2a20', S: '#f0c8a0', s: '#d9a57c', E: '#1d1d1d', N: '#26374d', P: '#26374d', W: '#ffffff', T: accent, F: '#111111' };
    const reach = [[9, 9, '.'], [9, 6, 'b'], [10, 5, 'b'], [10, 4, 'S'], [11, 3, 'S']];
    const fwd = [[9, 9, 'b'], [10, 9, 'S']];
    const armsUp = [[2, 9, '.'], [9, 9, '.'], [1, 5, 'N'], [1, 4, 'S'], [10, 5, 'N'], [10, 4, 'S']];
    s = {
      fIdle: makeSprite(FARMER, PAL_FARMER),
      fWalkA: makeSprite(legs(FARMER, LEGS_A), PAL_FARMER),
      fWalkB: makeSprite(legs(FARMER, LEGS_B), PAL_FARMER),
      fReach: makeSprite(patch(FARMER, reach), PAL_FARMER),
      fFwd: makeSprite(patch(FARMER, fwd), PAL_FARMER),
      bIdle: makeSprite(BUYER, pb),
      bWalkA: makeSprite(legs(BUYER, LEGS_A), pb),
      bWalkB: makeSprite(legs(BUYER, LEGS_B), pb),
      bUp: makeSprite(patch(BUYER, armsUp), pb),
      clove: makeSprite(CLOVE, PAL_CLOVE),
      heart: makeSprite(HEART, { R: '#e63946', W: '#ffb3ba' }),
      sack: makeSprite(SACK, { c: '#8a6a3a', C: '#c9a46a', d: '#5a4020', A: accent }),
      sprout: makeSprite(SPROUT, { g: '#7cc44f', G: '#3f7f2a' }),
      flask: makeSprite(FLASK, { g: '#d8eef5', G: '#bfe0ea', L: '#7fd3a8' }),
      doc: makeSprite(DOC, { W: '#fdfaf2', k: '#8a8f99', A: accent }),
    };
    spriteCache.set(accent, s);
    return s;
  }
  const drawS = (c, s, x, y, flip = false, k = 1) => {
    x = Math.round(x); y = Math.round(y);
    if (!flip) return c.drawImage(s, x, y, s.width * k, s.height * k);
    c.save();
    c.translate(x + s.width * k, y);
    c.scale(-1, 1);
    c.drawImage(s, 0, 0, s.width * k, s.height * k);
    c.restore();
  };

  /* -------------------------------------------------------------- scenery */

  function sky(c, top, bot, bands = 12) {
    const bh = Math.ceil(H / bands);
    for (let i = 0; i < bands; i++) R(c, 0, i * bh, W, bh, mix(top, bot, i / (bands - 1)));
  }
  function stars(c, a, t) {
    if (a <= 0) return;
    for (let i = 0; i < 46; i++) {
      alpha(c, a * (0.55 + 0.45 * Math.sin(t * 3 + i * 1.7)), () =>
        R(c, hash(i, 1) * W, hash(i, 2) * 105, 1, 1, i % 7 ? '#ffffff' : '#ffe9a8'));
    }
  }
  function sun(c, x, y, core = '#ffe27a') {
    disc(c, x, y, 14, 'rgba(255,236,160,.25)');
    disc(c, x, y, 10, core);
    disc(c, x - 2, y - 2, 4, '#fff6c8');
  }
  function moon(c, x, y) {
    disc(c, x, y, 7, '#f1f1e6');
    disc(c, x + 3, y - 2, 6, 'rgba(10,14,40,.85)');
  }
  function cloud(c, x, y, col, sh, s) {
    disc(c, x, y + 2, 6 * s, sh); disc(c, x + 8 * s, y, 8 * s, sh); disc(c, x + 17 * s, y + 2, 6 * s, sh);
    disc(c, x, y, 6 * s, col); disc(c, x + 8 * s, y - 2, 8 * s, col); disc(c, x + 17 * s, y, 6 * s, col);
  }
  function clouds(c, t, n = 4, y0 = 16, col = '#ffffff', sh = '#dbe6f3', speed = 4) {
    const span = W + 90;
    for (let i = 0; i < n; i++) {
      const x = ((hash(i, 11) * span + t * speed * (0.6 + hash(i, 12) * 0.8)) % span) - 45;
      cloud(c, x, y0 + hash(i, 13) * 28, col, sh, 0.7 + hash(i, 14) * 0.6);
    }
  }
  function birds(c, t, col = '#2b2b3a', n = 3) {
    for (let i = 0; i < n; i++) {
      const x = frac(t * 0.045 + hash(i, 21)) * (W + 30) - 15;
      const y = 26 + hash(i, 22) * 34 + Math.sin(t * 2 + i) * 2;
      if ((Math.floor(t * 6 + i) & 1) === 0) { R(c, x - 2, y, 2, 1, col); R(c, x + 1, y, 2, 1, col); R(c, x, y + 1, 1, 1, col); }
      else { R(c, x - 2, y + 1, 2, 1, col); R(c, x + 1, y + 1, 2, 1, col); R(c, x, y, 1, 1, col); }
    }
  }
  function volcano(c, cx, base, halfW, h, col, sh, t, smoke = true) {
    const crater = Math.round(halfW * 0.12);
    for (let x = -halfW; x <= halfW; x += 2) {
      const ax = Math.abs(x);
      const k = clamp((ax - crater) / (halfW - crater));
      let top = base - Math.round(h * Math.pow(1 - k, 1.5));
      if (ax < crater - 2) top += 2;
      R(c, cx + x, top, 2, base - top, x > crater * 0.5 ? sh : col);
      if (k > 0.12 && hash(x, 3) > 0.78) R(c, cx + x, top + 2, 1, Math.round((base - top) * 0.45), sh);
    }
    if (!smoke) return;
    for (let i = 0; i < 5; i++) {
      const ph = frac(t * 0.12 + i / 5);
      alpha(c, (1 - ph) * 0.7, () => disc(c, cx + Math.sin(ph * 4 + i) * 3 + ph * 16, base - h - 4 - ph * 30, 2 + ph * 5, '#eceaf4'));
    }
  }
  function terraces(c, top, t) {
    const cols = ['#79bd48', '#5da23b', '#4b8f31'];
    for (let i = 0; top + i * 6 < H; i++) {
      const y0 = top + i * 6;
      for (let x = 0; x < W; x += 4) {
        const yy = y0 + Math.round(Math.sin(x * 0.03 + i * 1.7) * 2);
        R(c, x, yy, 4, H - yy, cols[i % 3]);
        R(c, x, yy, 4, 1, '#a8d86a');
        if (i % 3 === 1 && hash(x, i) > 0.7 && Math.sin(t * 2 + x) > 0) R(c, x + 1, yy + 2, 2, 1, '#c6ecff');
      }
    }
  }
  function hills(c, y, col) {
    for (let x = 0; x < W; x += 4) {
      const h = 4 + Math.round(Math.sin(x * 0.05) * 3 + hash(x, 5) * 2);
      R(c, x, y - h, 4, h + 18, col);
    }
  }
  function ground(c, top = GROUND, grass = '#5aa83a', soil = '#7a4a2a', dark = '#5e3820') {
    R(c, 0, top, W, H - top, soil);
    R(c, 0, top, W, 3, grass);
    for (let x = 0; x < W; x += 2) if (hash(x, 31) > 0.55) R(c, x, top - 1, 1, 1, grass);
    for (let x = 1; x < W; x += 3) if (hash(x, 34) > 0.7) R(c, x, top, 1, 1, '#7cc44f');
    for (let i = 0; i < 60; i++) R(c, hash(i, 32) * W, top + 5 + hash(i, 33) * (H - top - 6), 2, 1, dark);
  }
  function palm(c, x, base, h, t) {
    const bend = i => Math.round(Math.sin((i / h) * 1.2) * 4);
    for (let i = 0; i < h; i++) R(c, x + bend(i), base - i, 2, 1, i % 4 === 0 ? '#6e4b2a' : '#8a6238');
    const tx = x + bend(h), ty = base - h, sw = Math.sin(t * 1.5 + x) * 1.5;
    for (const [dx, dy] of [[-1, 0], [1, 0], [-0.7, -0.6], [0.7, -0.6], [0.15, -1]]) {
      for (let k = 1; k <= 13; k++) {
        R(c, tx + dx * k + sw * (k / 13), ty + dy * k * 0.7 + k * k * 0.06, 2, 1, k > 8 ? '#3c8a3a' : '#2f6f30');
      }
    }
    disc(c, tx + 1, ty + 2, 1, '#6b4a1f');
  }
  function rain(c, t, a) {
    if (a <= 0) return;
    alpha(c, a, () => {
      for (let i = 0; i < 80; i++) {
        const y = frac(hash(i, 42) + t * 1.9) * H;
        R(c, hash(i, 41) * (W + 40) - y * 0.2, y, 1, 3, '#b3cdf2');
      }
    });
  }
  function sea(c, top, t, deep = '#1d4e89', mid = '#2a6fb0', hi = '#8fd0ff', speed = 10) {
    R(c, 0, top, W, H - top, deep);
    for (let r = 0; top + r * 5 < H; r++) {
      const y = top + r * 5 + 2, sp = speed * (0.4 + r * 0.25);
      for (let i = 0; i < 12; i++) {
        const x = (((hash(i, r + 50) * W - t * sp) % W) + W) % W;
        R(c, x, y, 4 + r, 1, r % 2 ? mid : hi);
      }
    }
    R(c, 0, top, W, 1, hi);
  }
  function dayScene(c, t, withVolcano = true) {
    sky(c, '#5ab4ea', '#d4efff');
    sun(c, 272, 30);
    clouds(c, t, 4, 14);
    if (withVolcano) {
      volcano(c, 70, GROUND - 14, 70, 44, '#9bb3d6', '#89a2c8', t, false);
      volcano(c, 232, GROUND - 14, 92, 64, '#8aa4cc', '#7690bb', t);
    }
    hills(c, GROUND - 12, '#6fae4a');
    birds(c, t);
  }

  /* ------------------------------------------------------------ props */

  const canopyCache = new Map();
  function canopy(rx, ry) {
    const key = rx + 'x' + ry;
    let cv = canopyCache.get(key);
    if (cv) return cv;
    cv = document.createElement('canvas');
    cv.width = rx * 2 + 3; cv.height = ry * 2 + 3;
    const c = cv.getContext('2d');
    for (let py = -ry - 1; py <= ry + 1; py++) {
      for (let px = -rx - 1; px <= rx + 1; px++) {
        const ny = py / ry;
        const taper = 0.45 + 0.55 * clamp((ny + 1) / 1.6); // clove trees are conical
        const nx = px / (rx * taper);
        const d = nx * nx + ny * ny + (hash(px + 99, py + 7) - 0.5) * 0.25;
        if (d > 1) continue;
        const light = -(nx * 0.6 + ny * 0.8), dither = (px + py) & 1;
        let col = light > 0.45 || (light > 0.25 && dither) ? '#6cbf4f'
          : light > -0.1 || (light > -0.3 && dither) ? '#3f9142' : '#2a6b35';
        if (d > 0.82 && light < 0) col = '#1f4f2a';
        if (hash(px * 3, py * 5) > 0.94) col = '#24592e';
        if (hash(px, py + 500) > 0.985) col = '#c96b5b'; // young clove leaves come in reddish
        c.fillStyle = col;
        c.fillRect(px + rx + 1, py + ry + 1, 1, 1);
      }
    }
    canopyCache.set(key, cv);
    return cv;
  }
  function cloveTree(c, x, base, g) {
    g = clamp(g);
    const trunkH = Math.round(lerp(3, 30, g)), tw = g < 0.25 ? 1 : g < 0.6 ? 2 : 4;
    const rx = Math.max(2, Math.round(lerp(3, 24, g))), ry = Math.max(3, Math.round(lerp(5, 40, g)));
    R(c, x - tw / 2, base - trunkH, tw, trunkH, '#5b3a24');
    if (tw > 1) R(c, x - tw / 2, base - trunkH, 1, trunkH, '#7a5236');
    const cy = base - trunkH - ry + Math.round(ry * 0.25);
    c.drawImage(canopy(rx, ry), x - rx - 1, cy - ry - 1);
    return { cx: x, cy, rx, ry };
  }
  // Bud clusters, placed once inside the canopy in normalised coordinates.
  const BUDS = (() => {
    const r = rng(7), out = [];
    while (out.length < 16) {
      const u = r() * 2 - 1, v = r() * 2 - 1;
      const taper = 0.45 + 0.55 * clamp((v + 1) / 1.6);
      if (u * u + v * v < 0.72 && v < 0.55) out.push([u * taper, v]);
    }
    return out.sort((a, b) => a[0] - b[0]); // harvest order: nearest the ladder first
  })();
  const budColor = k => mixN(['#9ccc4a', '#e8a08e', '#d0453a'], k);
  function budCluster(c, x, y, col) {
    R(c, x, y, 1, 2, col); R(c, x + 2, y, 1, 2, col); R(c, x + 1, y - 1, 1, 2, col);
    R(c, x + 1, y + 1, 1, 2, '#4d7a2a');
  }
  function basket(c, x, base, fill, col) {
    const ph = Math.round(fill * 5);
    if (ph > 0) {
      R(c, x + 2, base - 9 - ph, 12, ph, col);
      for (let i = 0; i < 10; i++) R(c, x + 3 + hash(i, 61) * 10, base - 9 - ph + hash(i, 62) * ph, 1, 1, '#8e2a22');
    }
    R(c, x + 1, base - 8, 14, 8, '#b5813f');
    for (let i = 0; i < 14; i += 2) R(c, x + 1 + i, base - 7 + (i % 4 ? 1 : 0), 1, 6, '#8a5a26');
    R(c, x, base - 9, 16, 2, '#6e4420');
  }
  function wheel(c, x, y, t) {
    disc(c, x, y, 3, '#1b1b1b');
    if (Math.floor(t * 12) & 1) R(c, x - 1, y, 3, 1, '#666'); else R(c, x, y - 1, 1, 3, '#666');
    R(c, x, y, 1, 1, '#bbb');
  }
  function truck(c, x, base, t, accent) {
    x = Math.round(x);
    for (let i = 0; i < 3; i++) {
      const ph = frac(t * 1.5 + i / 3);
      alpha(c, (1 - ph) * 0.6, () => disc(c, x - 3 - ph * 12, base - 6 - ph * 7, 1 + ph * 2, '#9aa0a6'));
    }
    R(c, x, base - 16, 24, 10, '#8d5a2b');
    R(c, x, base - 16, 24, 1, '#b07a44');
    for (let i = 3; i < 24; i += 5) R(c, x + i, base - 15, 1, 9, '#6e4420');
    for (let i = 0; i < 3; i++) {
      R(c, x + 2 + i * 7, base - 21, 6, 5, '#c9a46a');
      R(c, x + 3 + i * 7, base - 22, 4, 1, '#c9a46a');
      R(c, x + 2 + i * 7, base - 19, 6, 1, accent);
    }
    R(c, x + 24, base - 15, 11, 10, accent);
    R(c, x + 24, base - 15, 11, 1, shade(accent, 0.3));
    R(c, x + 28, base - 13, 6, 4, '#bfe6ff');
    R(c, x + 35, base - 8, 1, 2, '#ffd166');
    R(c, x - 1, base - 6, 37, 2, '#2b2b2b');
    wheel(c, x + 6, base - 3, t);
    wheel(c, x + 29, base - 3, t);
  }
  const CONT = ['#2e86ab', '#f4a261', '#3c9d5d', '#8e5ea2'];
  function container(c, x, bottom, col, label) {
    R(c, x, bottom - 10, 21, 10, col);
    for (let i = 2; i < 21; i += 3) R(c, x + i, bottom - 9, 1, 8, 'rgba(0,0,0,.2)');
    R(c, x, bottom - 10, 21, 1, 'rgba(255,255,255,.3)');
    if (label) { R(c, x + 5, bottom - 8, 11, 7, col); tiny(c, 'NJ', x + 6, bottom - 7, '#ffffff'); }
  }
  // Container ship, facing right, bridge at the stern. wl = waterline.
  function ship(c, x, wl, t, n, accent) {
    x = Math.round(x); wl = Math.round(wl);
    const L = 150, top = wl - 12;
    for (let i = 0; i < 3; i++) {
      const ph = frac(t * 0.6 + i / 3);
      alpha(c, (1 - ph) * 0.5, () => disc(c, x + 15 - ph * 16, top - 30 - ph * 14, 2 + ph * 3, '#cfd4da'));
    }
    R(c, x + 6, top - 18, 24, 18, '#f1faee');
    R(c, x + 28, top - 18, 2, 18, '#cfd8dc');
    for (let i = 0; i < 5; i++) R(c, x + 8 + i * 4, top - 15, 3, 2, '#1d3557');
    R(c, x + 4, top - 20, 28, 2, '#e3e8ec');
    R(c, x + 12, top - 27, 7, 7, accent);
    R(c, x + 12, top - 28, 7, 2, '#222');
    R(c, x + L - 12, top - 12, 1, 12, '#555');
    R(c, x + L - 11, top - 12, 5, 3, accent);
    for (let i = 0; i < n; i++) container(c, x + 36 + i * 22, top, i === 0 ? accent : CONT[i % 4], i === 0);
    for (let yy = top; yy <= wl + 5; yy++) {
      const k = yy - top, l = x + Math.round(k * 0.35), r = x + L - Math.round(k * 1.1);
      R(c, l, yy, r - l, 1, k < 3 ? '#1d3557' : k === 3 ? '#f1faee' : '#9d1c1f');
    }
  }
  function crane(c, trolleyX, hookY) {
    const col = '#f4a300', dark = '#b36b00';
    for (const lx of [40, 90]) R(c, lx, 50, 3, 78, col);
    for (let y = 58; y < 122; y += 16) line(c, 42, y, 90, y + 14, dark);
    R(c, 20, 46, 290, 4, col);
    for (let x = 22; x < 306; x += 6) line(c, x, 46, x + 3, 49, dark);
    R(c, 78, 50, 14, 9, '#e0e0e0');
    R(c, 80, 52, 10, 3, '#2a4d6e');
    R(c, trolleyX - 4, 50, 9, 3, '#555');
    R(c, trolleyX, 53, 1, hookY - 53, '#333');
    R(c, trolleyX - 4, hookY, 9, 2, '#333');
  }
  function skyline(c, base, far, near, win, t) {
    const r = rng(19);
    for (let x = -4; x < W; ) {
      const w = 10 + Math.floor(r() * 14), h = 22 + Math.floor(r() * 36);
      R(c, x, base - h, w, h, far);
      x += w + 1;
    }
    const r2 = rng(33);
    for (let x = 0; x < W; ) {
      const w = 12 + Math.floor(r2() * 16), h = 14 + Math.floor(r2() * 30), kind = r2();
      R(c, x, base - h, w, h, near);
      if (kind > 0.85) disc(c, x + w / 2, base - h, Math.floor(w / 2) - 1, near);
      else if (kind > 0.7) R(c, x + Math.floor(w / 2), base - h - 10, 1, 10, near);
      for (let yy = base - h + 3; yy < base - 3; yy += 4) {
        for (let xx = x + 2; xx < x + w - 2; xx += 3) {
          if (hash(xx, yy) > 0.55) R(c, xx, yy, 1, 2, hash(xx + 1, yy) > 0.5 + 0.1 * Math.sin(t) ? win : near);
        }
      }
      x += w + 2;
    }
  }

  /* --------------------------------------------------------------- scenes */
  // Each scene draws itself from (local time t, progress p 0..1) alone.

  function sIntro(c, t, p) {
    const k = E.out(seg(p, 0, 0.9));
    sky(c, mix('#1e1b4b', '#4d86d0', k), mix('#f28c5a', '#ffd9a8', k));
    stars(c, 1 - k * 1.3, t);
    sun(c, 236, lerp(152, 60, E.out(seg(p, 0, 0.85))));
    clouds(c, t, 4, 16, mix('#f7b7a3', '#ffffff', k), mix('#d98c8c', '#e3ecf7', k), 5);
    volcano(c, 252, 128, 70, 52, mix('#4b4f86', '#6f86b8', k), mix('#3a3d6a', '#58709e', k), t);
    volcano(c, 104, 128, 96, 80, mix('#3e3f73', '#5a74a8', k), mix('#2f305a', '#48608f', k), t);
    R(c, 0, 106, W, 5, 'rgba(255,255,255,.14)');
    terraces(c, 112, t);
    birds(c, t, mix('#2b2b3a', '#3a3a4a', k));
  }

  function sPlant(c, t, p, A) {
    const S = A.spr, HX = 150;
    dayScene(c, t);
    ground(c);
    palm(c, 26, GROUND, 46, t);
    palm(c, 286, GROUND, 54, t);
    let fx = 128, frame = S.fFwd;
    if (p < 0.28) { fx = lerp(-14, 128, seg(p, 0, 0.28)); frame = Math.floor(t * 7) & 1 ? S.fWalkA : S.fWalkB; }
    if (p > 0.34) { R(c, HX - 4, GROUND, 9, 2, '#3a2213'); R(c, HX - 7, GROUND - 1, 3, 1, '#6b4128'); R(c, HX + 5, GROUND - 1, 3, 1, '#6b4128'); }
    if (p > 0.58) sprout(c, S, HX, GROUND, seg(p, 0.58, 0.68));
    drawS(c, frame, fx, GROUND - 16);
    const hx = fx + 10, hy = GROUND - 7;
    if (p >= 0.28 && p < 0.56) { // hoe (cangkul)
      const a = lerp(-1.3, 0.75, (Math.sin(t * 9) + 1) / 2);
      const tx = hx + Math.cos(a) * 13, ty = hy + Math.sin(a) * 13;
      line(c, hx, hy, tx, ty, '#8a5a2b');
      R(c, tx - 1, ty, 3, 3, '#a7adb3');
      for (let i = 0; i < 5; i++) {
        const ph = frac(t * 2.2 + i / 5);
        R(c, HX + (i - 2) * 6 * ph, GROUND - 2 - Math.sin(ph * PI) * 8, 1, 1, '#6b4128');
      }
    }
    if (p >= 0.7) { // watering can
      R(c, hx, hy - 4, 6, 5, '#4f86c6'); R(c, hx + 1, hy - 6, 4, 1, '#3a6aa3');
      line(c, hx + 6, hy - 3, hx + 9, hy - 5, '#4f86c6');
      for (let i = 0; i < 7; i++) {
        const ph = frac(t * 2 + i / 7);
        R(c, lerp(hx + 9, HX, ph), lerp(hy - 5, GROUND - 3, ph) - Math.sin(ph * PI) * 3, 1, 1, '#8fd0ff');
      }
    }
    if (p > 0.86) sparkle(c, HX + 5, GROUND - 12, Math.floor(t * 6) & 1 ? 2 : 1);
  }
  function sprout(c, S, x, base, k) {
    const s = S.sprout, h = Math.ceil(k * s.height);
    if (h > 0) c.drawImage(s, 0, 0, s.width, h, x - 3, base - h, s.width, h);
  }

  function sGrow(c, t, p, A) {
    const g = E.inOut(seg(p, 0.02, 0.95));
    const day = frac(t * 0.75 + 0.1), sunH = Math.sin(day * 2 * PI), dl = clamp(sunH * 1.5 + 0.5);
    const wet = Math.max(bump(p, 0.16, 0.34), bump(p, 0.58, 0.74));
    sky(c, mixN(['#0b1030', '#3a3f7a', '#5fb4ea'], dl * (1 - wet * 0.4)), mixN(['#1b2250', '#f2a07b', '#cdeeff'], dl * (1 - wet * 0.3)));
    stars(c, 1 - dl * 1.5, t);
    const bx = 20 + frac(day * 2) * 280;
    if (sunH > 0) sun(c, bx, 130 - sunH * 100); else moon(c, bx, 130 + sunH * 100);
    clouds(c, t, 5, 12, mix('#ffffff', '#8a93a6', wet), mix('#dbe6f3', '#6b7386', wet), 8);
    volcano(c, 250, GROUND - 14, 80, 56, '#8aa4cc', '#7690bb', t);
    hills(c, GROUND - 12, '#6fae4a');
    ground(c);
    cloveTree(c, 160, GROUND, lerp(0.04, 1, g));
    drawS(c, A.spr.fIdle, 214, GROUND - 16, true);
    rain(c, t, wet);
    R(c, 0, 0, W, H, `rgba(8,12,40,${((1 - dl) * 0.5).toFixed(3)})`);
    if (wet > 0) R(c, 0, 0, W, H, `rgba(40,50,70,${(wet * 0.25).toFixed(3)})`);
  }

  const HARVEST = { cx: 175, from: 0.36, to: 0.9 };
  const pickedCount = p => Math.floor(seg(p, HARVEST.from, HARVEST.to) * BUDS.length);
  function sHarvest(c, t, p, A) {
    const S = A.spr;
    dayScene(c, t);
    ground(c);
    palm(c, 290, GROUND, 50, t);
    const tr = cloveTree(c, HARVEST.cx, GROUND, 1);
    const stage = E.inOut(seg(p, 0, 0.25)), col = budColor(stage);
    const q = seg(p, HARVEST.from, HARVEST.to) * BUDS.length, n = Math.floor(q), f = frac(q);
    const pos = i => [tr.cx + BUDS[i][0] * tr.rx * 0.85, tr.cy + BUDS[i][1] * tr.ry * 0.85];
    const shown = Math.floor(seg(p, 0, 0.08) * BUDS.length + 0.999);
    for (let i = n; i < shown; i++) if (!(i === n && p > HARVEST.from && n < BUDS.length)) budCluster(c, ...pos(i), col);
    // bamboo ladder
    const L0 = [140, GROUND], L1 = [156, GROUND - 58];
    line(c, L0[0], L0[1], L1[0], L1[1], '#d9b35b');
    line(c, L0[0] + 5, L0[1], L1[0] + 5, L1[1], '#c79d45');
    for (let i = 1; i < 10; i++) { const k = i / 10; R(c, lerp(L0[0], L1[0], k), lerp(L0[1], L1[1], k), 6, 1, '#b48a3c'); }
    basket(c, 106, GROUND, n / BUDS.length, budColor(1));
    let fx, fy, frame, flip = false;
    if (p < 0.24) {
      fx = lerp(-14, 132, seg(p, 0.06, 0.24)); fy = GROUND;
      frame = p > 0.06 ? (Math.floor(t * 7) & 1 ? S.fWalkA : S.fWalkB) : S.fIdle;
    } else {
      const u = seg(p, 0.24, 0.34) * 0.6;
      fx = lerp(L0[0], L1[0], u) - 8; fy = lerp(L0[1], L1[1], u);
      frame = p < 0.34 ? (Math.floor(t * 6) & 1 ? S.fWalkA : S.fWalkB) : f < 0.45 && n < BUDS.length ? S.fReach : S.fIdle;
    }
    drawS(c, frame, fx, fy - 16, flip);
    if (p > HARVEST.from && n < BUDS.length) { // the bud currently being picked flies to the basket
      const [sx, sy] = pos(n), k = E.inOut(f);
      budCluster(c, lerp(sx, 112, k), lerp(sy, GROUND - 12, k) - Math.sin(k * PI) * 14, budColor(1));
    }
  }

  function sDry(c, t, p, A) {
    const days = 4, day = frac(p * days), sunH = Math.sin(day * PI);
    sky(c, mix('#f4a261', '#5ab4ea', Math.sqrt(sunH)), mix('#ffd6a5', '#d4efff', sunH));
    sun(c, lerp(16, 304, day), 122 - sunH * 96);
    clouds(c, t, 3, 14);
    volcano(c, 88, GROUND - 14, 80, 50, '#8aa4cc', '#7690bb', t);
    hills(c, GROUND - 12, '#6fae4a');
    palm(c, 20, GROUND, 44, t);
    // farmhouse with a tiled roof
    R(c, 214, GROUND - 30, 80, 30, '#e8d5b0');
    for (let y = GROUND - 26; y < GROUND; y += 5) R(c, 214, y, 80, 1, '#d6c095');
    R(c, 248, GROUND - 20, 12, 20, '#6d4c33');
    R(c, 224, GROUND - 22, 14, 9, '#6d4c33'); R(c, 230, GROUND - 22, 1, 9, '#e8d5b0');
    R(c, 270, GROUND - 22, 14, 9, '#6d4c33'); R(c, 276, GROUND - 22, 1, 9, '#e8d5b0');
    for (let r = 0; r < 14; r++) R(c, 226 - r * 1.6, GROUND - 44 + r, 56 + r * 3.2, 1, r % 3 ? '#a4412f' : '#7f2f22');
    ground(c, GROUND, '#5aa83a', '#b08850', '#8c6a3c');
    // three woven mats (tikar) of clove buds turning from pink-red to deep brown
    const cols = ['#d0574a', '#a0472f', '#6e3a1f', '#4d2612'];
    [18, 118, 218].forEach((mx, m) => {
      R(c, mx, 154, 86, 16, '#d9b870');
      for (let i = 0; i < 86; i += 2) for (let j = 0; j < 16; j += 2) if (((i + j) >> 1) & 1) R(c, mx + i, 154 + j, 2, 2, '#c9a45a');
      for (let i = 0; i < 90; i++) {
        R(c, mx + 2 + hash(i, m) * 81, 156 + hash(i, m + 9) * 12, 2, 1, mixN(cols, p * 1.05 - hash(i, m + 20) * 0.08));
      }
    });
    // farmer turning the buds with a rake
    const fx = 150 + Math.sin(t * 1.1) * 40, flip = Math.cos(t * 1.1) < 0;
    drawS(c, A.spr.fFwd, fx, 138, flip);
    const hx = flip ? fx + 1 : fx + 10, dir = flip ? -1 : 1;
    line(c, hx, 147, hx + dir * 9, 160, '#8a5a2b');
    R(c, hx + dir * 9 - 3, 160, 7, 1, '#555');
    R(c, 0, 0, W, H, `rgba(255,120,60,${((1 - sunH) * 0.12).toFixed(3)})`);
  }

  function sPack(c, t, p, A) {
    const S = A.spr;
    R(c, 0, 0, W, GROUND, '#7a5236');
    for (let x = 0; x < W; x += 16) R(c, x, 0, 1, GROUND, '#5e3d27');
    R(c, 0, 18, W, 4, '#4a2f1e');
    R(c, 20, 36, 52, 36, '#4a2f1e');
    R(c, 23, 39, 46, 30, '#8fd3f4');
    volcano(c, 46, 69, 22, 14, '#9bb3d6', '#89a2c8', t, false);
    R(c, 23, 64, 46, 5, '#6fae4a');
    R(c, 45, 39, 2, 30, '#4a2f1e'); R(c, 23, 53, 46, 2, '#4a2f1e');
    c.fillStyle = 'rgba(255,240,200,.07)';
    c.beginPath(); c.moveTo(23, 39); c.lineTo(69, 39); c.lineTo(150, GROUND); c.lineTo(60, GROUND); c.lineTo(23, 69); c.closePath(); c.fill();
    // QC bench: lab flask + certificates (Phyto, CoA, Halal, Origin)
    R(c, 250, 70, 56, 3, '#4a2f1e');
    drawS(c, S.flask, 254, 63);
    for (let i = 0; i < 3; i++) {
      const on = seg(p, 0.15 + i * 0.22, 0.25 + i * 0.22);
      if (on > 0) drawS(c, S.doc, 266 + i * 12, 70 - 8 - Math.round((1 - E.back(on)) * 6));
    }
    const lx = 160 + Math.sin(t * 1.4) * 3;
    line(c, 160, 0, lx, 26, '#2b1d14');
    disc(c, lx, 28, 6, 'rgba(255,220,140,.18)');
    R(c, lx - 2, 26, 5, 3, '#ffd98a');
    R(c, 0, GROUND, W, H - GROUND, '#5a3b26');
    for (let y = GROUND + 6; y < H; y += 7) R(c, 0, y, W, 1, '#4a2f1e');
    // pile of sun-dried cloves
    for (let dx = -26; dx <= 26; dx++) {
      const h = Math.round(22 * (1 - (dx / 27) ** 2));
      R(c, 84 + dx, GROUND - h, 1, h, '#5a2e18');
      if (hash(dx, 71) > 0.5) R(c, 84 + dx, GROUND - h + 2 + hash(dx, 72) * Math.max(0, h - 3), 1, 1, '#8a4a26');
    }
    // hand sorting + filling 50 kg jute sacks, one per second
    const n = Math.floor(t), cp = frac(t), done = Math.min(n, 6), FX = 112;
    const slot = i => [[200, 0], [216, 0], [232, 0], [208, 1], [224, 1], [216, 2]][i];
    const sliding = n >= 1 && n <= 6 && cp < 0.3 ? n - 1 : -1;
    for (let i = 0; i < done; i++) {
      const [sx, row] = slot(i), sy = GROUND - 16 - row * 14;
      if (i === sliding) {
        const k = E.inOut(cp / 0.3);
        drawS(c, S.sack, lerp(130, sx, k), lerp(GROUND - 16, sy, k) - Math.sin(k * PI) * 10);
      } else drawS(c, S.sack, sx, sy);
    }
    if (sliding >= 0 && cp > 0.2) { const [sx, row] = slot(sliding); sparkle(c, sx + 12, GROUND - 18 - row * 14, 2); }
    if (n < 6) {
      const sh = Math.round(S.sack.height * (0.35 + 0.65 * cp));
      c.drawImage(S.sack, 0, S.sack.height - sh, S.sack.width, sh, 130, GROUND - sh, S.sack.width, sh);
      const pouring = cp >= 0.5;
      drawS(c, S.fFwd, FX, GROUND - 16, !pouring);
      const hx = pouring ? FX + 10 : FX + 1, hy = GROUND - 7;
      R(c, pouring ? hx : hx - 4, hy - 1, 4, 3, '#9aa0a6');
      if (pouring) for (let i = 0; i < 5; i++) {
        const ph = frac(t * 3 + i / 5);
        R(c, lerp(hx + 3, 137, ph), lerp(hy, GROUND - sh + 1, ph), 1, 1, '#6e3a1f');
      }
    } else {
      drawS(c, S.fIdle, FX, GROUND - 16);
      const k = E.back(seg(t, 6.1, 6.5));
      if (k > 0) { // QC passed badge above the stack
        disc(c, 223, 92, Math.round(8 * k), A.accent);
        disc(c, 223, 92, Math.round(6 * k), shade(A.accent, 0.15));
        if (k > 0.9) { line(c, 219, 92, 222, 95, '#ffffff'); line(c, 222, 95, 227, 89, '#ffffff'); }
      }
    }
  }

  const SHIP_A = 0.28, SHIP_B = 0.64;
  function sShip(c, t, p, A) {
    if (p < SHIP_A) { // Nganjuk -> Surabaya by road
      const q = seg(p, 0, SHIP_A);
      dayScene(c, t);
      R(c, 0, GROUND - 10, W, 10, '#5aa83a');
      [28, 118, 204, 292].forEach((x, i) => palm(c, x, GROUND - 2, 38 + i * 4, t));
      R(c, 0, GROUND, W, 14, '#4a4a4a');
      R(c, 0, GROUND, W, 1, '#6a6a6a');
      for (let x = 0; x < W; x += 16) R(c, x + 4, GROUND + 7, 8, 1, '#e0e0e0');
      ground(c, GROUND + 14);
      truck(c, lerp(-40, 330, q), GROUND + 10, t, A.accent);
    } else if (p < SHIP_B) { // Port of Surabaya: craning containers onto the ship
      const q = seg(p, SHIP_A, SHIP_B) * 5, ci = Math.min(4, Math.floor(q)), cp = q >= 5 ? 1 : frac(q);
      sky(c, '#6cc0ee', '#e2f4ff');
      sun(c, 280, 26);
      clouds(c, t, 3, 12);
      skyline(c, 132, '#a9bfd8', '#95adc9', '#dfe9f4', t);
      sea(c, 132, t, '#1f5d99', '#2f7cc0', '#a8dcff', 6);
      const SX = 140, WL = 140, pickX = 70, slotX = i => SX + 36 + i * 22;
      ship(c, SX, WL, t, ci + (cp >= 0.75 ? 1 : 0), A.accent);
      R(c, 0, 128, 138, H - 128, '#9e9e9e');
      R(c, 0, 128, 138, 2, '#c4c4c4');
      for (let x = 6; x < 138; x += 22) R(c, x, 134, 3, H - 134, '#7d7d7d');
      for (let i = 0; i < 4 - ci; i++) container(c, 6, 128 - i * 10, CONT[(ci + i + 1) % 4], false);
      let tx = pickX, hy = 60, carry = false;
      const cx = slotX(ci) + 10;
      if (cp < 0.15) hy = lerp(60, 116, cp / 0.15);
      else if (cp < 0.3) { hy = lerp(116, 70, (cp - 0.15) / 0.15); carry = true; }
      else if (cp < 0.6) { tx = lerp(pickX, cx, E.inOut((cp - 0.3) / 0.3)); hy = 70; carry = true; }
      else if (cp < 0.75) { tx = cx; hy = lerp(70, 116, (cp - 0.6) / 0.15); carry = true; }
      else if (cp < 0.88) { tx = cx; hy = lerp(116, 60, (cp - 0.75) / 0.13); }
      else tx = lerp(cx, pickX, E.inOut((cp - 0.88) / 0.12));
      const col = ci === 0 ? A.accent : CONT[ci % 4];
      if (cp < 0.15) container(c, pickX - 10, 128, col, ci === 0);
      crane(c, Math.round(tx), Math.round(hy));
      if (carry) container(c, Math.round(tx) - 10, Math.round(hy) + 12, col, ci === 0);
    } else { // at sea, heading for buyers in 15+ countries
      const q = seg(p, SHIP_B, 1);
      sky(c, '#3a3f7a', '#f7a76c');
      sun(c, 250, 112, '#ffb35c');
      clouds(c, t, 4, 16, '#f6c1a8', '#d98c8c', 6);
      sea(c, 120, t, '#1b3f73', '#2a5fa0', '#ffc896', 22);
      const bob = Math.sin(t * 2.6) * 1.2;
      for (let i = 0; i < 8; i++) {
        const ph = frac(t * 1.4 + i / 8);
        alpha(c, 1 - ph, () => R(c, 84 - ph * 40, 141 + bob + (i % 3), 3, 1, '#ffffff'));
      }
      ship(c, 86, 140 + bob, t, 5, A.accent);
      const dp = seg(q, 0.35, 0.65);
      if (dp > 0 && dp < 1) { // dolphin
        const x = lerp(236, 276, dp), y = 128 - Math.sin(dp * PI) * 16;
        R(c, x, y, 6, 2, '#6c7a89'); R(c, x + 2, y - 1, 2, 1, '#6c7a89'); R(c, x - 2, y + 1, 2, 1, '#6c7a89');
      }
      birds(c, t, '#3a2d3a', 2);
    }
    const edge = Math.max(0, 1 - Math.abs(p - SHIP_A) / 0.025, 1 - Math.abs(p - SHIP_B) / 0.025);
    if (edge > 0) dissolve(c, edge);
  }

  function sArrive(c, t, p, A) {
    const S = A.spr;
    sky(c, '#8cc8f5', '#ffe0b3');
    sun(c, 60, 34);
    clouds(c, t, 3, 14);
    skyline(c, 134, '#b2b9d6', '#8a93b8', '#ffe9a8', t);
    sea(c, 134, t, '#23578f', '#3172b3', '#b5e2ff', 6);
    ship(c, lerp(-170, 18, E.out(seg(p, 0, 0.35))), 140, t, 5, A.accent);
    R(c, 170, 128, W - 170, H - 128, '#a7a7a7');
    R(c, 170, 128, W - 170, 2, '#cfcfcf');
    for (let x = 176; x < W; x += 22) R(c, x, 134, 3, H - 134, '#858585');
    const SXK = 206;
    const drop = seg(p, 0.36, 0.46);
    if (drop > 0) {
      const sy = lerp(-20, 128 - 16, E.back(drop));
      if (drop < 1) R(c, SXK + 6, 0, 1, sy + 1, '#333');
      drawS(c, S.sack, SXK, sy);
    }
    const open = seg(p, 0.6, 0.7);
    if (open > 0) {
      for (let i = 0; i < 14; i++) { // cloves spill out and sparkle
        const ph = clamp(open * 1.6 - hash(i, 81) * 0.5);
        const x = SXK + 7 + (hash(i, 82) - 0.5) * 30 * ph, y = 110 - Math.sin(ph * PI) * 18 + ph * 16;
        if (ph > 0) R(c, x, Math.min(y, 127), 2, 1, '#5a2d16');
      }
      if (p > 0.66) for (let i = 0; i < 4; i++) {
        const ph = frac(t * 0.9 + i / 4);
        alpha(c, 1 - ph, () => sparkle(c, SXK + 2 + i * 4, 106 - ph * 16, 1 + (i & 1)));
      }
    }
    let bx = 222, frame = S.bIdle, by = 128;
    if (p < 0.58) {
      bx = lerp(330, 222, seg(p, 0.42, 0.58));
      frame = p > 0.42 ? (Math.floor(t * 7) & 1 ? S.bWalkA : S.bWalkB) : S.bIdle;
    } else if (p > 0.66) { frame = S.bUp; by -= Math.round(Math.abs(Math.sin(t * 7)) * 3 * (1 - seg(p, 0.85, 0.95))); }
    drawS(c, frame, bx, by - 16, true);
    const bb = E.back(seg(p, 0.68, 0.76));
    if (bb > 0) { // speech bubble: ♥ + clove
      const w = Math.round(30 * bb), h = Math.round(22 * bb), x0 = bx + 6 - w / 2, y0 = by - 44;
      R(c, x0 - 1, y0, w + 2, h, '#1d1d1d'); R(c, x0, y0 - 1, w, h + 2, '#1d1d1d');
      R(c, x0, y0, w, h, '#ffffff');
      R(c, bx + 3, y0 + h, 3, 2, '#1d1d1d'); R(c, bx + 4, y0 + h, 1, 1, '#ffffff');
      if (bb > 0.95) { drawS(c, S.heart, x0 + 3, y0 + 8); drawS(c, S.clove, x0 + 15, y0 + 3, false, 1); }
    }
  }

  function sOutro(c, t, p, A) {
    sky(c, '#1a0f0a', '#3d2416');
    stars(c, 0.6, t);
    for (let i = 0; i < 26; i++) {
      const a = hash(i, 91) * 2 * PI + t * 0.2, r = 30 + hash(i, 92) * 70;
      alpha(c, 0.5 + 0.5 * Math.sin(t * 3 + i), () => sparkle(c, 160 + Math.cos(a) * r * 1.6, 44 + Math.sin(a) * r * 0.45, i % 3 === 0 ? 2 : 1, i % 4 ? '#ffd9a0' : '#ffffff'));
    }
    disc(c, 160, 44, 34, 'rgba(255,190,120,.06)');
    disc(c, 160, 44, 24, 'rgba(255,190,120,.08)');
    const pop = E.back(seg(p, 0.05, 0.25));
    const ring = (front) => {
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * 2 * PI + t * 0.9, z = Math.sin(a);
        if ((z > 0) !== front) continue;
        R(c, 160 + Math.cos(a) * 46 * pop, 46 + z * 10 * pop, 2, 2, front ? '#c77b4a' : '#6e3a1f');
      }
    };
    ring(false);
    if (pop > 0) drawS(c, A.spr.clove, 160 - 16.5, 44 - 24 + Math.sin(t * 2) * 2 + (1 - pop) * 20, false, 3);
    ring(true);
  }

  // Chunky 8-bit dissolve used for scene transitions.
  function dissolve(c, amt) {
    if (amt <= 0) return;
    c.fillStyle = '#0b0706';
    for (let by = 0; by < H / 10; by++) for (let bx = 0; bx < W / 10; bx++) if (hash(bx, by + 777) < amt) c.fillRect(bx * 10, by * 10, 10, 10);
  }

  /* ---------------------------------------------------------------- script */

  const COUNTRIES = {
    en: ['Saudi Arabia', 'UAE', 'India', 'Pakistan', 'China', 'Japan', 'South Korea', 'Singapore', 'Germany', 'Netherlands', 'United Kingdom', 'United States'],
    id: ['Arab Saudi', 'UEA', 'India', 'Pakistan', 'Tiongkok', 'Jepang', 'Korea Selatan', 'Singapura', 'Jerman', 'Belanda', 'Inggris', 'Amerika Serikat'],
  };
  const SCENES = [
    { dur: 5.5, draw: sIntro, title: 'intro',
      cap: { en: 'In Nganjuk, East Java, volcanic soil and an equatorial sun shape one of the world’s finest spices…',
             id: 'Di Nganjuk, Jawa Timur, tanah vulkanik dan matahari khatulistiwa melahirkan salah satu rempah terbaik dunia…' } },
    { dur: 8, draw: sPlant, ch: { en: 'Planting', id: 'Menanam' },
      cap: { en: 'A young clove seedling goes into rich volcanic soil on our own plantation, watered and tended by hand.',
             id: 'Bibit cengkeh muda ditanam di tanah vulkanik yang subur di kebun milik kami sendiri, disiram dan dirawat dengan tangan.' } },
    { dur: 8, draw: sGrow, ch: { en: 'Growing', id: 'Tumbuh' },
      hud: (p, L) => (L === 'id' ? 'TAHUN ' : 'YEAR ') + (1 + Math.min(5, Math.floor(p * 6))),
      cap: { en: 'Sun and tropical rain, season after season. A clove tree grows for years before its first harvest.',
             id: 'Matahari dan hujan tropis, musim demi musim. Pohon cengkeh tumbuh bertahun-tahun sebelum panen pertamanya.' } },
    { dur: 9, draw: sHarvest, ch: { en: 'Harvest', id: 'Panen' },
      hud: (p, L) => (L === 'id' ? 'DIPETIK ' : 'PICKED ') + pickedCount(p) + '/' + BUDS.length,
      cap: { en: 'The flower buds are hand-picked from mature trees the moment they blush pink — before they bloom.',
             id: 'Kuncup bunga dipetik dengan tangan dari pohon dewasa saat mulai kemerahan — sebelum sempat mekar.' } },
    { dur: 7, draw: sDry, ch: { en: 'Sun-drying', id: 'Penjemuran' },
      hud: (p, L) => p > 0.9 ? (L === 'id' ? 'KADAR AIR ≤10%' : 'MOISTURE ≤10%') : (L === 'id' ? 'HARI KE-' : 'DAY ') + (1 + Math.min(3, Math.floor(p * 4))),
      cap: { en: 'Spread on woven mats under the sun for days, the buds turn deep brown, dense with eugenol and oil.',
             id: 'Dijemur di atas tikar selama berhari-hari, kuncup berubah cokelat tua, kaya eugenol dan minyak atsiri.' } },
    { dur: 7.5, draw: sPack, ch: { en: 'Sorting & QC', id: 'Sortir & QC' },
      hud: (p, L, t) => (L === 'id' ? 'KARUNG 50KG ' : '50KG SACKS ') + Math.min(6, Math.floor(t)) + '/6',
      cap: { en: 'Hand-sorted, lab-tested lot by lot, then packed into 50 kg jute sacks with every document ready.',
             id: 'Disortir tangan, diuji lab per lot, lalu dikemas dalam karung goni 50 kg dengan dokumen lengkap.' } },
    { dur: 12, draw: sShip, ch: { en: 'Shipping', id: 'Pengiriman' },
      hud: (p, L, t) => p < SHIP_A ? 'NGANJUK → SURABAYA'
        : p < SHIP_B ? (L === 'id' ? 'PELABUHAN SURABAYA' : 'PORT OF SURABAYA')
        : 'SURABAYA → ' + COUNTRIES[L][Math.floor(t * 2.2) % COUNTRIES[L].length].toUpperCase(),
      cap: { en: 'From the farm to the Port of Surabaya, into containers, and across the ocean.',
             id: 'Dari kebun ke Pelabuhan Surabaya, masuk kontainer, lalu berlayar menyeberangi samudra.' } },
    { dur: 8.5, draw: sArrive, ch: { en: 'Delivered', id: 'Tiba' },
      hud: (p, L) => p < 0.6 ? (L === 'id' ? 'MERAPAT…' : 'ARRIVING…') : (L === 'id' ? '15+ NEGARA ✓' : '15+ COUNTRIES ✓'),
      cap: { en: 'Premium Javanese clove arrives at our buyer’s door — traceable from tree to shipment.',
             id: 'Cengkeh Jawa premium tiba di tangan pembeli — bisa dilacak dari pohon hingga pengiriman.' } },
    { dur: 7, draw: sOutro, title: 'outro',
      cap: { en: 'We grow it, we process it, we export it.', id: 'Kami menanam, mengolah, dan mengekspornya sendiri.' } },
  ];
  let acc = 0;
  for (const s of SCENES) { s.start = acc; acc += s.dur; }
  const TOTAL = acc;
  const CHAPTERS = SCENES.filter(s => s.ch);

  const UI = {
    en: { sub: 'The Journey of a Clove', tagline: 'Where spice meets global standards', cta: 'Request offer', play: 'Play', pause: 'Pause', restart: 'Restart', sound: 'Sound', lang: 'Bahasa Indonesia', seek: 'Seek' },
    id: { sub: 'Perjalanan Sebutir Cengkeh', tagline: 'Rempah Nusantara, standar dunia', cta: 'Minta penawaran', play: 'Putar', pause: 'Jeda', restart: 'Ulangi', sound: 'Suara', lang: 'English', seek: 'Geser' },
  };

  /* ------------------------------------------------------------ chiptune */
  // Tiny WebAudio loop in D major pentatonic. Only starts after the viewer turns sound on.
  const MELODY = [74, 0, 69, 71, 74, 0, 76, 74, 71, 0, 69, 66, 69, 0, 71, 0, 66, 69, 71, 74, 76, 0, 74, 71, 69, 0, 66, 64, 66, 0, 0, 0];
  const BASS = [50, 47, 43, 45];
  class Chip {
    start() {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      if (!this.ac) {
        this.ac = new AC();
        this.master = this.ac.createGain();
        this.master.gain.value = 0.06;
        this.master.connect(this.ac.destination);
      }
      this.ac.resume();
      if (this.timer) return;
      this.step = 0;
      this.next = this.ac.currentTime + 0.06;
      this.timer = setInterval(() => this.pump(), 60);
    }
    stop() { clearInterval(this.timer); this.timer = null; if (this.ac) this.ac.suspend(); }
    close() { this.stop(); if (this.ac) this.ac.close(); this.ac = null; }
    pump() {
      const d = 60 / 132 / 2;
      while (this.next < this.ac.currentTime + 0.25) {
        const s = this.step++, m = MELODY[s % MELODY.length];
        if (m) this.tone(m, this.next, d * 0.9, 'square', 0.45);
        if (s % 4 === 0) this.tone(BASS[Math.floor(s / 8) % 4], this.next, d * 3.6, 'triangle', 0.9);
        if (s % 2) this.tone(98, this.next, 0.03, 'square', 0.12);
        this.next += d;
      }
    }
    tone(midi, t, d, type, v) {
      const o = this.ac.createOscillator(), g = this.ac.createGain();
      o.type = type;
      o.frequency.value = 440 * 2 ** ((midi - 69) / 12);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(v, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g).connect(this.master);
      o.start(t);
      o.stop(t + d + 0.02);
    }
  }

  /* ----------------------------------------------------------- component */

  const ICON = {
    play: '<svg viewBox="0 0 8 8" aria-hidden="true"><path d="M2 1h1v1h1v1h1v1h-1v1h-1v1h-1z"/></svg>',
    pause: '<svg viewBox="0 0 8 8" aria-hidden="true"><path d="M2 1h1v6h-1zM5 1h1v6h-1z"/></svg>',
    restart: '<svg viewBox="0 0 8 8" aria-hidden="true"><path d="M3 1h3v1h1v4h-1v1h-3v-1h-1v-1h1v1h3v-4h-3v1h1v1h-3v-3h1v1h1z"/></svg>',
    soundOn: '<svg viewBox="0 0 8 8" aria-hidden="true"><path d="M1 3h1v2h-1zM2 2h1v4h-1zM3 1h1v6h-1zM5 2h1v1h-1zM5 5h1v1h-1zM6 3h1v2h-1z"/></svg>',
    soundOff: '<svg viewBox="0 0 8 8" aria-hidden="true"><path d="M1 3h1v2h-1zM2 2h1v4h-1zM3 1h1v6h-1zM5 3h1v1h-1zM6 4h1v1h-1zM6 2h1v1h-1zM5 5h1v1h-1z"/></svg>',
  };

  const CSS = `
:host{display:block;--accent:${DEFAULT_ACCENT};--radius:14px}
*{box-sizing:border-box}
.wrap{position:relative;background:#140d09;overflow:hidden;border-radius:var(--radius);container-type:inline-size;user-select:none;-webkit-user-select:none;padding:0 0 .4cqw}
.stage{position:relative;aspect-ratio:16/9;background:#0b0706;overflow:hidden}
canvas{position:absolute;inset:0;width:100%;height:100%;image-rendering:pixelated;image-rendering:crisp-edges;cursor:pointer}
.px{font-family:'Press Start 2P',ui-monospace,monospace}
.hud{position:absolute;top:3cqw;left:3cqw;right:3cqw;display:flex;justify-content:space-between;gap:2cqw;pointer-events:none;font-size:clamp(6px,1.35cqw,12px);line-height:1;color:#fff}
.hud span{background:rgba(12,8,6,.72);padding:.7em .9em;border-radius:3px;box-shadow:0 0 0 2px rgba(0,0,0,.35);transition:opacity .3s;letter-spacing:.04em;white-space:nowrap}
.hud span:empty{opacity:0}
.chap{color:#ffe0b8}
.chap b{color:var(--accent);font-weight:400;filter:brightness(1.35)}
.cap{margin:1.6cqw 2cqw 0;background:#1f1510;border:2px solid #f4e3c1;box-shadow:0 0 0 2px #000,inset 0 0 0 2px #000;border-radius:2px;padding:.45em .8em .5em;font:clamp(15px,2.3cqw,23px)/1.15 VT323,ui-monospace,monospace;color:#fff7e6}
.cap p{margin:0;min-height:2.3em}
.cap p::after{content:'▮';color:var(--accent);filter:brightness(1.4);animation:blink 1s steps(1) infinite;margin-left:.1em}
@keyframes blink{50%{opacity:0}}
.title{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;text-align:center;gap:1.6cqw;pointer-events:none;opacity:0;transform:translateY(1.5cqw);transition:opacity .6s,transform .6s}
.title.on{opacity:1;transform:none}
.title.intro{padding-top:9cqw}
.title.outro{padding-top:26cqw}
.t1{font-size:clamp(14px,5.2cqw,52px);color:#fff;text-shadow:.12em .12em 0 var(--accent),.24em .24em 0 rgba(0,0,0,.35);letter-spacing:.02em}
.t2{font:clamp(14px,3.4cqw,32px)/1 VT323,ui-monospace,monospace;color:#fff3dc;background:rgba(15,10,8,.55);padding:.15em .6em;border-radius:2px}
.cta{pointer-events:auto;margin-top:.8cqw;font-size:clamp(8px,1.5cqw,14px);color:#fff;background:var(--accent);text-decoration:none;padding:1em 1.4em;border-radius:3px;box-shadow:0 .3em 0 rgba(0,0,0,.45);transition:transform .15s}
.cta:hover{transform:translateY(-2px)}
.cta:focus-visible{outline:3px solid #fff;outline-offset:3px}
.cta[hidden]{display:none}
.big{position:absolute;left:50%;top:50%;width:11cqw;height:11cqw;min-width:44px;min-height:44px;transform:translate(-50%,-50%);border:0;border-radius:50%;background:var(--accent);color:#fff;cursor:pointer;display:grid;place-items:center;box-shadow:0 0 0 .6cqw rgba(255,255,255,.25),0 .6cqw 0 rgba(0,0,0,.4);transition:transform .15s}
.big:hover{transform:translate(-50%,-50%) scale(1.06)}
.big svg{width:48%;height:48%;fill:currentColor;shape-rendering:crispEdges;margin-left:6%}
.big[hidden]{display:none}
.bar{display:flex;align-items:center;gap:1cqw;padding:.8cqw 1.6cqw .6cqw}
button.b{all:unset;box-sizing:border-box;cursor:pointer;color:#fff;display:grid;place-items:center;width:clamp(28px,4.4cqw,40px);height:clamp(28px,4.4cqw,40px);border-radius:4px;font-size:clamp(7px,1.25cqw,11px)}
button.b svg{width:55%;height:55%;fill:currentColor;shape-rendering:crispEdges}
button.b:hover{background:rgba(255,255,255,.16)}
button.b:focus-visible,.prog:focus-visible{outline:2px solid #fff;outline-offset:2px}
button.lang{width:auto;padding:0 .8em}
.prog{flex:1;height:clamp(6px,.9cqw,9px);background:rgba(255,255,255,.22);position:relative;cursor:pointer;border-radius:2px;touch-action:none}
.fill{position:absolute;left:0;top:0;bottom:0;background:var(--accent);filter:brightness(1.2);border-radius:2px;pointer-events:none}
.tick{position:absolute;top:0;bottom:0;width:2px;background:rgba(0,0,0,.55);pointer-events:none}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
`;

  class CloveStory extends HTMLElement {
    static get observedAttributes() { return ['lang', 'accent', 'brand', 'tagline', 'cta-href', 'cta-text']; }

    constructor() {
      super();
      this.t = 0;
      this.playing = false;
      this.started = false;
      this.userPaused = false;
      this.sound = false;
      this.chip = new Chip();
      this._prev = {};
      this._frame = this._frame.bind(this);
    }

    get duration() { return TOTAL; }
    get language() {
      const l = this._lang || this.getAttribute('lang') || document.documentElement.lang || 'en';
      return l.toLowerCase().startsWith('id') ? 'id' : 'en';
    }
    get accent() {
      const a = (this.getAttribute('accent') || '').trim();
      return /^#[0-9a-f]{6}$/i.test(a) ? a.toLowerCase() : DEFAULT_ACCENT;
    }

    connectedCallback() {
      if (!this.shadowRoot) this._build();
      this._injectFonts();
      this._applyAttrs();
      this.reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (!this.started) this.t = 3.2; // poster frame: intro with title
      this._io = new IntersectionObserver(([e]) => {
        this.visible = e.isIntersecting;
        if (this.visible && !this.userPaused && !this.playing && !this.reduced && !this.hasAttribute('no-autoplay') && !this._ended) {
          this.play();
        } else if (!this.visible && this.playing) this._stop();
      }, { threshold: 0.35 });
      this._io.observe(this);
      this._draw();
    }

    disconnectedCallback() {
      this._stop();
      if (this._io) this._io.disconnect();
      this.chip.close();
    }

    attributeChangedCallback() {
      if (this.shadowRoot) { this._applyAttrs(); this._prev = {}; this._draw(); }
    }

    _injectFonts() {
      if (this.hasAttribute('no-fonts') || document.querySelector('link[data-clove-story-fonts]')) return;
      const l = document.createElement('link');
      l.rel = 'stylesheet';
      l.href = 'https://fonts.googleapis.com/css2?family=Press+Start+2P&family=VT323&display=swap';
      l.dataset.cloveStoryFonts = '';
      document.head.appendChild(l);
      if (document.fonts) document.fonts.ready.then(() => { this._prev = {}; this._draw(); });
    }

    _build() {
      const root = this.attachShadow({ mode: 'open' });
      root.innerHTML = `<style>${CSS}</style>
<div class="wrap paused" part="frame">
  <div class="stage">
    <canvas width="${W}" height="${H}" role="img"></canvas>
    <div class="hud px"><span class="chap"></span><span class="count"></span></div>
    <div class="title px"><div class="t1"></div><div class="t2"></div><a class="cta px" part="cta" hidden></a></div>
    <button class="big" aria-label="Play">${ICON.play}</button>
  </div>
  <div class="cap" aria-hidden="true"><p></p></div>
  <div class="bar">
    <button class="b play" aria-label="Play">${ICON.play}</button>
    <button class="b restart" aria-label="Restart">${ICON.restart}</button>
    <div class="prog" role="slider" tabindex="0" aria-valuemin="0" aria-valuemax="${Math.round(TOTAL)}"><div class="fill"></div></div>
    <button class="b lang px"></button>
    <button class="b sound" aria-pressed="false" aria-label="Sound">${ICON.soundOff}</button>
  </div>
</div>`;
      const $ = s => root.querySelector(s);
      this.$ = {
        wrap: $('.wrap'), canvas: $('canvas'), chap: $('.chap'), count: $('.count'), title: $('.title'), t1: $('.t1'), t2: $('.t2'),
        cta: $('.cta'), cap: $('.cap'), capP: $('.cap p'), big: $('.big'), play: $('.play'), restart: $('.restart'),
        prog: $('.prog'), fill: $('.fill'), lang: $('.lang'), sound: $('.sound'),
      };
      const prog = this.$.prog;
      for (const s of CHAPTERS) {
        const tk = document.createElement('div');
        tk.className = 'tick';
        tk.style.left = (s.start / TOTAL) * 100 + '%';
        prog.appendChild(tk);
      }
      this.ctx = this.$.canvas.getContext('2d', { alpha: false });
      this.ctx.imageSmoothingEnabled = false;

      const toggle = () => (this.playing ? this.pause() : this.play());
      this.$.canvas.addEventListener('click', toggle);
      this.$.big.addEventListener('click', () => this.play());
      this.$.play.addEventListener('click', toggle);
      this.$.restart.addEventListener('click', () => { this.seek(0); this.play(); });
      this.$.lang.addEventListener('click', () => { this._lang = this.language === 'en' ? 'id' : 'en'; this._applyAttrs(); this._prev = {}; this._draw(); });
      this.$.sound.addEventListener('click', () => {
        this.sound = !this.sound;
        this.$.sound.innerHTML = this.sound ? ICON.soundOn : ICON.soundOff;
        this.$.sound.setAttribute('aria-pressed', String(this.sound));
        if (this.sound && this.playing) this.chip.start(); else this.chip.stop();
      });
      const seekTo = e => {
        const r = prog.getBoundingClientRect();
        this.seek(clamp((e.clientX - r.left) / r.width) * TOTAL);
      };
      prog.addEventListener('pointerdown', e => { prog.setPointerCapture(e.pointerId); this._drag = true; seekTo(e); });
      prog.addEventListener('pointermove', e => this._drag && seekTo(e));
      prog.addEventListener('pointerup', () => (this._drag = false));
      prog.addEventListener('keydown', e => {
        const d = { ArrowRight: 5, ArrowLeft: -5, Home: -TOTAL, End: TOTAL }[e.key];
        if (d !== undefined) { e.preventDefault(); this.seek(this.t + d); }
      });
    }

    _applyAttrs() {
      const L = this.language, u = UI[L];
      this.style.setProperty('--accent', this.accent);
      this.A = { accent: this.accent, spr: sprites(this.accent), lang: L };
      this.$.lang.textContent = L === 'en' ? 'ID' : 'EN';
      this.$.lang.setAttribute('aria-label', u.lang);
      this.$.restart.setAttribute('aria-label', u.restart);
      this.$.sound.setAttribute('aria-label', u.sound);
      this.$.prog.setAttribute('aria-label', u.seek);
      this.$.big.setAttribute('aria-label', u.play);
      const href = this.getAttribute('cta-href');
      this.$.cta.hidden = !href;
      if (href) { this.$.cta.href = href; this.$.cta.textContent = this.getAttribute('cta-text') || u.cta; }
      this.$.canvas.setAttribute('aria-label', `${this.getAttribute('brand') || 'Nusajawa Clove'} — ${u.sub}. ` + SCENES.map(s => s.cap[L]).join(' '));
      this._syncButtons();
    }

    play() {
      if (!this.started || this._ended) { this.t = 0; this._ended = false; }
      this.started = true;
      this.userPaused = false;
      if (this.playing) return;
      this.playing = true;
      this._last = performance.now();
      this._raf = requestAnimationFrame(this._frame);
      if (this.sound) this.chip.start();
      this._syncButtons();
    }

    pause() { this.userPaused = true; this._stop(); }

    seek(sec) {
      this.t = clamp(sec, 0, TOTAL - 0.001);
      this.started = true;
      this._ended = false;
      this._draw();
    }

    _stop() {
      this.playing = false;
      cancelAnimationFrame(this._raf);
      this.chip.stop();
      this._syncButtons();
    }

    _syncButtons() {
      if (!this.$) return;
      const u = UI[this.language];
      this.$.play.innerHTML = this.playing ? ICON.pause : ICON.play;
      this.$.play.setAttribute('aria-label', this.playing ? u.pause : u.play);
      this.$.big.hidden = this.playing || (this.started && this.t > 0.2 && !this._ended);
      this.$.wrap.classList.toggle('paused', !this.playing);
    }

    _frame(now) {
      if (!this.playing) return;
      this.t += Math.min(0.1, (now - this._last) / 1000);
      this._last = now;
      if (this.t >= TOTAL) {
        if (this.hasAttribute('no-loop')) {
          this.t = TOTAL - 0.001;
          this._ended = true;
          this._draw();
          return this._stop();
        }
        this.t %= TOTAL;
      }
      this._draw();
      this._raf = requestAnimationFrame(this._frame);
    }

    _draw() {
      if (!this.ctx) return;
      const c = this.ctx, t = this.t, L = this.language;
      let i = SCENES.findIndex(s => t < s.start + s.dur);
      if (i < 0) i = SCENES.length - 1;
      const s = SCENES[i], lt = t - s.start, p = clamp(lt / s.dur);
      c.imageSmoothingEnabled = false;
      s.draw(c, lt, p, this.A);
      const fin = 0.35, last = i === SCENES.length - 1 && this.hasAttribute('no-loop');
      dissolve(c, Math.max(1 - lt / fin, last ? 0 : (lt - (s.dur - fin)) / fin));

      // DOM overlays — only touch what changed.
      const set = (k, v, fn) => { if (this._prev[k] !== v) { this._prev[k] = v; fn(v); } };
      const chIdx = CHAPTERS.indexOf(s);
      set('chap', s.ch ? `${chIdx + 1}/${CHAPTERS.length}|${s.ch[L]}` : '', v => {
        this.$.chap.innerHTML = v ? `<b>${chIdx + 1}/${CHAPTERS.length}</b> ${s.ch[L].toUpperCase()}` : '';
      });
      set('count', s.hud ? s.hud(p, L, lt) : '', v => (this.$.count.textContent = v));
      const n = Math.max(0, Math.floor((lt - 0.3) * 42));
      const text = s.cap[L].slice(0, n);
      set('cap', text, v => {
        this.$.capP.textContent = v;
      });
      const brand = this.getAttribute('brand') || 'Nusajawa Clove';
      const tt = s.title === 'intro' && lt > 0.8 && lt < s.dur - 0.5 ? `intro|${brand}|${UI[L].sub}`
        : s.title === 'outro' && lt > 0.9 ? `outro|${brand}|${this.getAttribute('tagline') || UI[L].tagline}` : '';
      set('title', tt, v => {
        const [kind, a, b] = v.split('|');
        if (kind) { this.$.title.className = `title px on ${kind}`; this.$.t1.textContent = a; this.$.t2.textContent = b; }
        else this.$.title.classList.remove('on');
        this.$.cta.style.display = kind === 'outro' ? '' : 'none';
      });
      set('prog', Math.round((t / TOTAL) * 1000), v => {
        this.$.fill.style.width = v / 10 + '%';
        this.$.prog.setAttribute('aria-valuenow', String(Math.round(t)));
      });
      if (this.$.big.hidden !== (this.playing || (this.started && t > 0.2 && !this._ended))) this._syncButtons();
    }
  }

  customElements.define('clove-story', CloveStory);
})();
