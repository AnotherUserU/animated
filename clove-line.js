/*!
 * <clove-line> — "The Journey of a Clove", minimalist line-art animation for Nusajawa Clove.
 * Plain JavaScript + Canvas 2D, zero dependencies, ~72 s loop. Every stroke draws itself on.
 *
 *   <script src="/clove-line.js" defer></script>
 *   <clove-line accent="#b5562c" cta-href="#contact"></clove-line>
 *
 * Attributes (all optional):
 *   lang         "en" | "id"   (default: <html lang>, falls back to en)
 *   accent       hex colour for the few highlighted strokes (default #b5562c)
 *   theme        "light" (cream paper, default) | "dark"
 *   brand        title text (default "Nusajawa Clove")
 *   tagline      outro subtitle
 *   cta-href     shows a button on the last scene, e.g. "#contact"
 *   cta-text     button label
 *   no-autoplay  don't start when scrolled into view
 *   no-loop      stop on the final scene instead of looping
 *
 * Text uses the page's own font (font-family is inherited), so it matches the site.
 * JS API: el.play(), el.pause(), el.seek(seconds), el.duration
 */
(() => {
  'use strict';
  if (typeof window === 'undefined' || !window.customElements || customElements.get('clove-line')) return;

  // Logical drawing space; the canvas is scaled to the element's real pixel size.
  const W = 960, H = 540, GY = 410, PI = Math.PI;
  const DEFAULT_ACCENT = '#b5562c';
  const THEMES = {
    light: { paper: '#f7f2ea', ink: '#2b211b' },
    dark: { paper: '#17120f', ink: '#efe5d8' },
  };

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
  const hash = (x, y = 0) => {
    let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const rng = seed => () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const toRgb = hex => { const n = parseInt(hex.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
  const mix = (a, b, t) => {
    const A = toRgb(a), B = toRgb(b);
    const h = i => Math.round(lerp(A[i], B[i], clamp(t))).toString(16).padStart(2, '0');
    return '#' + h(0) + h(1) + h(2);
  };

  /* -------------------------------------------------------- point builders */

  const arcP = (cx, cy, rx, ry, a0, a1, n = 32) => {
    const o = [];
    for (let i = 0; i <= n; i++) { const a = lerp(a0, a1, i / n); o.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]); }
    return o;
  };
  const bezP = (p0, p1, p2, p3, n = 18) => {
    const o = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, u = 1 - t;
      o.push([
        u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
        u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
      ]);
    }
    return o;
  };
  const cat = (...parts) => [].concat(...parts);
  const rectP = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]];

  // Drawing kit bound to one frame. ln() strokes the first k (0..1) of a polyline's length,
  // which is what makes every line "draw itself".
  function kit(c, pal, font) {
    const d = {
      c, font, ...pal,
      ln(pts, k = 1, col = pal.ink, w = 2.2, fill) {
        if (k <= 0 || pts.length < 2) return;
        let total = 0;
        const L = [];
        for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); L.push(l); total += l; }
        let rem = total * clamp(k);
        c.beginPath();
        c.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) {
          if (rem >= L[i - 1]) { c.lineTo(pts[i][0], pts[i][1]); rem -= L[i - 1]; continue; }
          const f = L[i - 1] ? rem / L[i - 1] : 0;
          c.lineTo(lerp(pts[i - 1][0], pts[i][0], f), lerp(pts[i - 1][1], pts[i][1], f));
          break;
        }
        if (fill && k >= 1) { c.fillStyle = fill; c.fill(); }
        c.strokeStyle = col;
        c.lineWidth = w;
        c.stroke();
      },
      circle(x, y, r, k = 1, col = pal.ink, w = 2.2, fill) { d.ln(arcP(x, y, r, r, -PI / 2, PI * 1.5, Math.max(16, Math.round(r))), k, col, w, fill); },
      dot(x, y, r, col = pal.ink) { c.beginPath(); c.arc(x, y, r, 0, PI * 2); c.fillStyle = col; c.fill(); },
      txt(s, x, y, size, col = pal.ink, weight = 600, align = 'center') {
        c.font = `${weight} ${size}px ${font}`;
        c.textAlign = align;
        c.textBaseline = 'middle';
        c.fillStyle = col;
        c.fillText(s, x, y);
      },
      alpha(a, fn) { const o = c.globalAlpha; c.globalAlpha = o * clamp(a); fn(); c.globalAlpha = o; },
    };
    return d;
  }

  /* --------------------------------------------------------------- scenery */

  function horizon(d, k, y = GY) { d.ln([[0, y], [W, y]], k, d.ink, 1.8); }
  // Sparse soil strokes and grass tufts so the foreground doesn't read as empty paper.
  function ground(d, k, y = GY) {
    for (let i = 0; i < 18; i++) {
      const x = hash(i, 61) * W, yy = y + 26 + hash(i, 62) * (H - y - 44), w = 16 + hash(i, 63) * 34, a = hash(i, 64) * 0.5;
      d.ln([[x, yy], [x + w, yy]], seg(k, a, a + 0.5), d.faint, 1.1);
    }
    if (k < 1) return;
    for (let i = 0; i < 16; i++) {
      const x = hash(i, 65) * W;
      d.ln([[x - 4, y], [x - 6, y - 6]], 1, d.faint, 1.2);
      d.ln([[x, y], [x + 1, y - 9]], 1, d.faint, 1.2);
      d.ln([[x + 4, y], [x + 7, y - 5]], 1, d.faint, 1.2);
    }
  }
  function sun(d, x, y, r, k, t, rays = true) {
    d.circle(x, y, r, k, d.accent, 2.4);
    if (!rays || k < 1) return;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * PI * 2 + t * 0.15, r0 = r + 9, r1 = r + (i % 2 ? 16 : 22);
      d.ln([[x + Math.cos(a) * r0, y + Math.sin(a) * r0], [x + Math.cos(a) * r1, y + Math.sin(a) * r1]], 1, d.accent, 1.6);
    }
  }
  function moon(d, x, y, r, k) {
    d.ln(cat(arcP(x, y, r, r, -PI * 0.6, PI * 0.6, 24), arcP(x + r * 0.55, y, r * 0.8, r * 0.95, PI * 0.45, -PI * 0.45, 24)), k, d.ink, 1.8);
  }
  function volcano(d, cx, gy, hw, h, k, col = d.ink, w = 2.2, fill = d.paper) {
    const cr = hw * 0.12;
    const pts = cat(
      bezP([cx - hw, gy], [cx - hw * 0.55, gy - h * 0.25], [cx - cr * 1.6, gy - h * 0.92], [cx - cr, gy - h], 24),
      [[cx - cr * 0.45, gy - h + 5], [cx + cr * 0.45, gy - h + 5]],
      bezP([cx + cr, gy - h], [cx + cr * 1.6, gy - h * 0.92], [cx + hw * 0.55, gy - h * 0.25], [cx + hw, gy], 24),
    );
    d.ln(pts, k, col, w, fill);
    if (k < 1) return;
    for (const [dx, len] of [[-0.35, 0.45], [0.1, 0.3], [0.45, 0.4]]) {
      const x0 = cx + dx * cr * 4;
      d.ln(bezP([x0, gy - h + 12], [x0 + dx * 20, gy - h * 0.7], [x0 + dx * 40, gy - h * (1 - len)], [x0 + dx * 55, gy - h * (1 - len - 0.12)], 8), 1, d.faint, 1.3);
    }
  }
  function smoke(d, x, y, t) {
    for (let i = 0; i < 3; i++) {
      const ph = frac(t * 0.14 + i / 3), r = 6 + ph * 16;
      d.alpha(1 - ph, () => d.ln(arcP(x + ph * 34, y - ph * 60, r, r * 0.8, PI * 0.8, PI * 2.6, 24), 1, d.faint, 1.5));
    }
  }
  function cloudP(x, y, w) {
    return cat(
      arcP(x + w * 0.2, y, w * 0.18, w * 0.16, PI, PI * 2, 14),
      arcP(x + w * 0.48, y - 2, w * 0.14, w * 0.28, PI, PI * 2, 18),
      arcP(x + w * 0.78, y, w * 0.2, w * 0.18, PI, PI * 2, 14),
      [[x + w * 0.98, y], [x + w * 0.02, y]],
    );
  }
  function clouds(d, t, k, n = 2, y0 = 70, speed = 6) {
    for (let i = 0; i < n; i++) {
      const span = W + 260, x = ((hash(i, 11) * span + t * speed * (0.7 + hash(i, 12) * 0.6)) % span) - 200;
      d.ln(cloudP(x, y0 + hash(i, 13) * 70, 110 + hash(i, 14) * 70), k, d.faint, 1.6);
    }
  }
  function birds(d, t, k, n = 3) {
    for (let i = 0; i < n; i++) {
      const x = frac(t * 0.03 + hash(i, 21)) * (W + 60) - 30, y = 90 + hash(i, 22) * 80 + Math.sin(t * 2 + i) * 4;
      const f = Math.sin(t * 7 + i * 2) * 3;
      d.ln(cat(bezP([x - 9, y - 2 + f], [x - 6, y - 5], [x - 2, y - 3], [x, y], 6), bezP([x, y], [x + 2, y - 3], [x + 6, y - 5], [x + 9, y - 2 + f], 6)), k, d.ink, 1.4);
    }
  }
  function terraces(d, t, k) {
    for (let i = 0; i < 6; i++) {
      const y = GY + 18 + i * 21, pts = [];
      for (let x = 0; x <= W; x += 16) pts.push([x, y + Math.sin(x * 0.012 + i * 1.3) * (4 + i)]);
      d.ln(pts, seg(k, i * 0.08, 0.6 + i * 0.08), d.faint, 1.4);
      if (k >= 1 && i % 2) for (let j = 0; j < 4; j++) {
        const x = (hash(i, j) * W + t * 12) % W;
        d.ln([[x, y + 9], [x + 14, y + 9]], 1, d.faint, 1.1);
      }
    }
  }
  function palm(d, x, gy, h, t, k, col = d.faint) {
    const top = [x + 16, gy - h];
    d.ln(bezP([x, gy], [x + 2, gy - h * 0.4], [x + 14, gy - h * 0.7], top, 14), k, col, 1.8);
    if (k < 1) return;
    const sw = Math.sin(t * 1.3 + x) * 3;
    for (const [dx, dy] of [[-48, 18], [-38, -8], [44, 16], [38, -10], [4, -22]]) {
      d.ln(bezP(top, [top[0] + dx * 0.4, top[1] + dy - 10], [top[0] + dx * 0.8 + sw, top[1] + dy - 4], [top[0] + dx + sw, top[1] + dy + 14], 12), 1, col, 1.6);
    }
  }
  function rain(d, t, a) {
    if (a <= 0) return;
    d.alpha(a, () => {
      for (let i = 0; i < 70; i++) {
        const y = frac(hash(i, 42) + t * 1.6) * (GY + 20), x = hash(i, 41) * (W + 80) - y * 0.18;
        d.ln([[x, y], [x - 4, y + 14]], 1, d.faint, 1.2);
      }
    });
  }
  function stars(d, a, t) {
    if (a <= 0) return;
    for (let i = 0; i < 28; i++) {
      const x = hash(i, 1) * W, y = hash(i, 2) * 260, s = 3 + (i % 3);
      d.alpha(a * (0.5 + 0.5 * Math.sin(t * 2.5 + i)), () => {
        d.ln([[x - s, y], [x + s, y]], 1, d.ink, 1.2);
        d.ln([[x, y - s], [x, y + s]], 1, d.ink, 1.2);
      });
    }
  }
  function waves(d, t, y0, rows, speed, k) {
    for (let r = 0; r < rows; r++) {
      const y = y0 + r * 26 + (r % 2) * 4, sp = speed * (0.5 + r * 0.25), gap = 70 + r * 16, len = 18 + r * 5;
      for (let x0 = -gap; x0 < W + gap; x0 += gap) {
        const x = ((((x0 + hash(r, 9) * gap - t * sp) % (W + gap)) + W + gap) % (W + gap)) - gap;
        d.ln(arcP(x + len / 2, y, len / 2, 3 + r * 0.5, PI, PI * 2, 8), k, d.faint, 1.3);
      }
    }
  }

  /* ------------------------------------------------------------ characters */

  // A single-line figure. Arm angles are measured from hanging straight down; positive = forward.
  function figure(d, x, gy, o = {}) {
    const f = o.f || 1, s = o.s || 1.25, k = o.k ?? 1, col = o.col || d.ink, w = 2.2;
    gy -= o.lift || 0;
    const sw = o.walk != null ? Math.sin(o.walk) * 0.42 : 0;
    const hip = [x, gy - 32 * s], sh = [x + 2 * s * f, gy - 58 * s];
    const leg = a => {
      const foot = [hip[0] + Math.sin(a) * 30 * s * f, gy];
      const knee = [(hip[0] + foot[0]) / 2 + 2.5 * s * f, (hip[1] + foot[1]) / 2];
      return [hip, knee, foot, [foot[0] + 6 * s * f, gy]];
    };
    d.ln(leg(sw), k, col, w);
    d.ln(leg(-sw), k, col, w);
    d.ln([hip, sh], k, col, w);
    const head = [sh[0] + 2 * s * f, sh[1] - 12 * s];
    d.circle(head[0], head[1], 7.5 * s, k, col, w, d.paper);
    const arm = ([a1, a2]) => {
      const s0 = [sh[0], sh[1] + 2 * s];
      const el = [s0[0] + Math.sin(a1) * 13 * s * f, s0[1] + Math.cos(a1) * 13 * s];
      const hd = [el[0] + Math.sin(a2) * 12 * s * f, el[1] + Math.cos(a2) * 12 * s];
      d.ln([s0, el, hd], k, col, w);
      return hd;
    };
    const hB = arm(o.armB || [sw * 0.8, sw * 0.8 + 0.3]);
    const hF = arm(o.armF || [-sw * 0.8, -sw * 0.8 + 0.3]);
    if (o.hat !== false) { // caping, the conical bamboo farmer's hat
      d.ln([[head[0] - 19 * s, head[1] - 1 * s], [head[0], head[1] - 16 * s], [head[0] + 19 * s, head[1] - 1 * s], [head[0] - 19 * s, head[1] - 1 * s]], k, col, w, d.paper);
    } else {
      d.ln(arcP(head[0], head[1], 8 * s, 8 * s, PI * 1.02, PI * 1.98, 12), k, col, 3);
    }
    if (o.tie) d.ln([[sh[0], sh[1] + 3 * s], [sh[0] + 1 * s * f, sh[1] + 15 * s]], k, d.accent, 3);
    return { hF, hB, head };
  }

  /* ---------------------------------------------------------------- props */

  function cloveTree(d, x, gy, g, k = 1, t = 0) {
    g = clamp(g);
    const h = lerp(26, 260, g), trunkH = h * 0.26, rx = h * 0.23, ry = h * 0.42;
    const cy = gy - trunkH - ry * 0.85, tw = lerp(1.5, 7, g);
    d.ln(bezP([x - tw, gy], [x - tw * 0.6, gy - trunkH * 0.5], [x - tw * 0.4, gy - trunkH], [x - tw * 0.3, gy - trunkH - 6], 8), k, d.ink, 2);
    d.ln(bezP([x + tw, gy], [x + tw * 0.6, gy - trunkH * 0.5], [x + tw * 0.4, gy - trunkH], [x + tw * 0.3, gy - trunkH - 6], 8), k, d.ink, 2);
    const pts = [], n = 96, sway = Math.sin(t * 1.2) * 1.5 * g;
    for (let i = 0; i <= n; i++) {
      const th = PI / 2 + (i / n) * PI * 2;
      const ny = Math.sin(th), taper = 0.5 + 0.5 * clamp((ny + 1) / 1.7); // conical crown
      const b = 1 + Math.sin(th * 16) * 0.035;
      pts.push([x + Math.cos(th) * rx * taper * b + sway * (1 - ny), cy + ny * ry * b]);
    }
    d.ln(pts, k, d.ink, 2.2, d.paper);
    if (k >= 1 && g > 0.3) {
      for (let i = 0; i < 7; i++) {
        const u = (hash(i, 51) - 0.5) * 1.1, v = (hash(i, 52) - 0.5) * 1.4;
        const px = x + u * rx * 0.7, py = cy + v * ry * 0.7, s = 7 * g;
        d.ln(cat(bezP([px - s, py - s * 0.4], [px - s * 0.5, py + s * 0.2], [px - s * 0.2, py + s * 0.3], [px, py + s * 0.4], 5),
          bezP([px, py + s * 0.4], [px + s * 0.2, py + s * 0.3], [px + s * 0.5, py + s * 0.2], [px + s, py - s * 0.4], 5)), 1, d.faint, 1.3);
      }
    }
    return { cx: x, cy, rx, ry };
  }
  const BUDS = (() => {
    const r = rng(7), out = [];
    while (out.length < 16) {
      const u = r() * 2 - 1, v = r() * 2 - 1;
      if (u * u + v * v < 0.62 && v < 0.5) out.push([u * (0.5 + 0.5 * clamp((v + 1) / 1.7)), v]);
    }
    return out.sort((a, b) => a[0] - b[0]);
  })();
  function budCluster(d, x, y, col, s = 1) {
    d.ln([[x, y + 7 * s], [x, y + 1 * s]], 1, d.faint, 1.3);
    d.dot(x - 3 * s, y, 2.3 * s, col);
    d.dot(x + 3 * s, y, 2.3 * s, col);
    d.dot(x, y - 3.5 * s, 2.3 * s, col);
  }
  function basket(d, x, gy, fill, k) {
    d.ln([[x - 32, gy - 36], [x + 32, gy - 36], [x + 25, gy], [x - 25, gy], [x - 32, gy - 36]], k, d.ink, 2, d.paper);
    if (k < 1) return;
    for (let i = 1; i < 4; i++) d.ln([[x - 32 + i * 2, gy - 36 + i * 9], [x + 32 - i * 2, gy - 36 + i * 9]], 1, d.faint, 1.2);
    const n = Math.round(fill * 16);
    for (let i = 0; i < n; i++) d.dot(x - 22 + (i % 8) * 6.3, gy - 40 - Math.floor(i / 8) * 5, 2.4, d.accent);
  }
  function sackP(x, by, w, h) {
    return cat(
      bezP([x - w * 0.38, by - 3], [x - w * 0.2, by + 3], [x + w * 0.2, by + 3], [x + w * 0.38, by - 3], 10),
      bezP([x + w * 0.38, by - 3], [x + w * 0.54, by - h * 0.45], [x + w * 0.4, by - h * 0.8], [x + w * 0.12, by - h * 0.86], 12),
      [[x + w * 0.22, by - h], [x, by - h * 0.9], [x - w * 0.22, by - h], [x - w * 0.12, by - h * 0.86]],
      bezP([x - w * 0.12, by - h * 0.86], [x - w * 0.4, by - h * 0.8], [x - w * 0.54, by - h * 0.45], [x - w * 0.38, by - 3], 12),
    );
  }
  function sack(d, x, by, k, s = 1, label = true) {
    const w = 62 * s, h = 70 * s;
    d.ln(sackP(x, by, w, h), k, d.ink, 2, d.paper);
    if (k < 1) return;
    d.ln([[x - w * 0.13, by - h * 0.84], [x + w * 0.13, by - h * 0.84]], 1, d.accent, 3);
    if (label) {
      d.txt('NJ', x, by - h * 0.44, 15 * s, d.accent, 700);
      d.txt('50 KG', x, by - h * 0.22, 8 * s, d.faint, 600);
    }
  }
  function truck(d, x, gy, t, k) {
    for (let i = 0; i < 3; i++) {
      const ph = frac(t * 1.5 + i / 3);
      d.alpha((1 - ph) * k, () => d.circle(x - 8 - ph * 30, gy - 20 - ph * 16, 3 + ph * 6, 1, d.faint, 1.3));
    }
    d.ln(rectP(x, gy - 64, 104, 44), k, d.ink, 2, d.paper);
    for (let i = 0; i < 3; i++) d.ln(arcP(x + 20 + i * 32, gy - 64, 14, 12, PI, PI * 2, 12), k, d.ink, 1.8);
    d.ln([[x + 104, gy - 20], [x + 104, gy - 56], [x + 134, gy - 56], [x + 152, gy - 36], [x + 152, gy - 20]], k, d.accent, 2.4);
    d.ln([[x + 110, gy - 50], [x + 131, gy - 50], [x + 142, gy - 38], [x + 110, gy - 38], [x + 110, gy - 50]], k, d.accent, 1.6);
    d.ln([[x - 6, gy - 20], [x + 156, gy - 20]], k, d.ink, 2);
    if (k >= 1) d.txt('NJ', x + 52, gy - 40, 16, d.accent, 700);
    for (const wx of [x + 26, x + 124]) {
      d.circle(wx, gy - 10, 11, k, d.ink, 2.2, d.paper);
      const a = t * 9;
      d.ln([[wx - Math.cos(a) * 7, gy - 10 - Math.sin(a) * 7], [wx + Math.cos(a) * 7, gy - 10 + Math.sin(a) * 7]], k, d.faint, 1.4);
    }
  }
  function container(d, x, bottom, k, label, col) {
    d.ln(rectP(x, bottom - 34, 68, 34), k, col || d.ink, 2, d.paper);
    if (k < 1) return;
    for (let i = 1; i < 8; i++) d.ln([[x + i * 8.5, bottom - 30], [x + i * 8.5, bottom - 4]], 1, d.faint, 1);
    if (label) { d.c.fillStyle = d.paper; d.c.fillRect(x + 22, bottom - 25, 24, 16); d.txt('NJ', x + 34, bottom - 17, 13, d.accent, 700); }
  }
  // Container ship facing right; x = stern, wl = waterline.
  function ship(d, x, wl, t, n, k = 1) {
    for (let i = 0; i < 3; i++) {
      const ph = frac(t * 0.5 + i / 3);
      d.alpha((1 - ph) * k, () => d.circle(x + 51 - ph * 40, wl - 132 - ph * 40, 4 + ph * 8, 1, d.faint, 1.3));
    }
    d.ln(rectP(x + 20, wl - 100, 72, 60), k, d.ink, 2, d.paper);
    d.ln([[x + 28, wl - 86], [x + 84, wl - 86]], k, d.ink, 1.4);
    for (let i = 0; i < 5; i++) d.ln([[x + 30 + i * 11, wl - 80], [x + 30 + i * 11, wl - 72]], k, d.faint, 1.3);
    d.ln(rectP(x + 40, wl - 126, 22, 26), k, d.accent, 2.2, d.paper);
    d.ln([[x + 470, wl - 40], [x + 470, wl - 76], [x + 486, wl - 70], [x + 470, wl - 64]], k, d.accent, 1.8);
    for (let i = 0; i < n; i++) container(d, x + 108 + i * 72, wl - 40, k, i === 0, i === 0 ? d.accent : null);
    d.ln([[x, wl - 40], [x + 490, wl - 44], [x + 456, wl + 12], [x + 24, wl + 12], [x, wl - 40]], k, d.ink, 2.4, d.paper);
    d.ln([[x + 10, wl - 20], [x + 478, wl - 22]], k, d.faint, 1.3);
  }
  function crane(d, tx, hy, k) {
    d.ln([[140, 400], [140, 132]], k, d.ink, 2.2);
    d.ln([[250, 400], [250, 132]], k, d.ink, 2.2);
    for (let y = 150; y < 390; y += 60) d.ln([[140, y], [250, y + 50]], k, d.faint, 1.3);
    d.ln([[60, 120], [930, 120]], k, d.ink, 2.2);
    d.ln([[60, 132], [930, 132]], k, d.ink, 2.2);
    if (k < 1) return;
    for (let x = 64; x < 926; x += 24) d.ln([[x, 132], [x + 12, 120], [x + 24, 132]], 1, d.faint, 1);
    d.ln(rectP(228, 134, 44, 26), 1, d.ink, 2, d.paper);
    d.ln(rectP(tx - 13, 132, 26, 9), 1, d.ink, 2, d.paper);
    d.ln([[tx, 141], [tx, hy]], 1, d.ink, 1.6);
    d.ln([[tx - 36, hy], [tx + 36, hy]], 1, d.ink, 2.4);
  }
  function skyline(d, base, k, t, hs = 1) {
    const r = rng(19), pts = [[0, base]], wins = [];
    for (let x = 0; x < W; ) {
      const w = 34 + Math.floor(r() * 40), h = (50 + Math.floor(r() * 110)) * hs, kind = r();
      pts.push([x, base - h]);
      if (kind > 0.82) pts.push(...arcP(x + w / 2, base - h, w / 2, w / 2.4, PI, PI * 2, 12));
      else if (kind > 0.66) pts.push([x + w / 2 - 3, base - h], [x + w / 2, base - h - 24], [x + w / 2 + 3, base - h]);
      pts.push([x + w, base - h], [x + w, base - (30 + r() * 20) * hs]);
      for (let yy = base - h + 14; yy < base - 12; yy += 16) for (let xx = x + 8; xx < x + w - 8; xx += 12) if (r() > 0.55) wins.push([xx, yy]);
      x += w;
    }
    pts.push([W, base]);
    d.ln(pts, k, d.faint, 1.5);
    if (k >= 1) for (const [x, y] of wins) d.ln([[x, y], [x + 5, y]], 1, d.faint, 1.2);
  }
  function heart(d, x, y, s, k) {
    const pts = cat(
      bezP([x, y + 10 * s], [x - 16 * s, y], [x - 10 * s, y - 12 * s], [x, y - 5 * s], 12),
      bezP([x, y - 5 * s], [x + 10 * s, y - 12 * s], [x + 16 * s, y], [x, y + 10 * s], 12),
    );
    d.ln(pts, k, d.accent, 2.4, d.accentSoft);
  }
  function check(d, x, y, s, k, col) { d.ln([[x - 6 * s, y], [x - 2 * s, y + 5 * s], [x + 7 * s, y - 6 * s]], k, col || d.accent, 2.4); }
  // The big hero clove for the outro: a tapered stem, four sepals cupping the round bud.
  function bigClove(d, cx, cy, s, k) {
    const S = (x, y) => [cx + x * s, cy + y * s];
    const mirror = pts => pts.map(([x, y]) => [2 * cx - x, y]);
    d.ln(cat(bezP(S(-16, 36), S(-14, 92), S(-8, 150), S(-2.5, 204), 18), arcP(cx, cy + 204 * s, 2.5 * s, 3 * s, PI, 0, 6),
      bezP(S(2.5, 204), S(8, 150), S(14, 92), S(16, 36), 18)), seg(k, 0, 0.45), d.accent, 2.6);
    d.ln(bezP(S(-17, 38), S(-6, 42), S(6, 42), S(17, 38), 10), seg(k, 0.3, 0.5), d.accent, 2);
    for (let i = 0; i < 5; i++) {
      const y = 70 + i * 26, w = lerp(10, 3, i / 5);
      d.ln(bezP(S(-w * 0.5, y), S(-w * 0.2, y + 6), S(w * 0.1, y + 10), S(w * 0.4, y + 16), 5), seg(k, 0.35 + i * 0.04, 0.5 + i * 0.04), d.faint, 1.3);
    }
    const outer = cat(bezP(S(-15, 38), S(-27, 30), S(-36, 14), S(-39, -8), 12), bezP(S(-39, -8), S(-28, 2), S(-16, 12), S(-7, 24), 12));
    d.ln(outer, seg(k, 0.4, 0.7), d.accent, 2.4, d.paper);
    d.ln(mirror(outer), seg(k, 0.45, 0.75), d.accent, 2.4, d.paper);
    d.circle(cx, cy - 6 * s, 21 * s, seg(k, 0.55, 0.9), d.accent, 2.6, d.paper);
    const front = cat(bezP(S(-3, 38), S(-16, 30), S(-22, 16), S(-21, 4), 12), bezP(S(-21, 4), S(-12, 12), S(-5, 22), S(0, 32), 12));
    d.ln(front, seg(k, 0.7, 0.95), d.accent, 2.4, d.paper);
    d.ln(mirror(front), seg(k, 0.75, 1), d.accent, 2.4, d.paper);
    if (k >= 1) d.ln(arcP(cx - 6 * s, cy - 12 * s, 9 * s, 9 * s, PI * 1.1, PI * 1.6, 8), 1, d.faint, 1.6);
  }

  /* ---------------------------------------------------------------- scenes */
  // Each scene draws itself from (local time t, progress p) alone, so seeking is always exact.

  function sIntro(d, t, p) {
    const K = (a, b) => E.out(seg(t, a, b));
    horizon(d, K(0, 1));
    d.c.save(); d.c.beginPath(); d.c.rect(0, 0, W, GY); d.c.clip();
    sun(d, 700, lerp(470, 170, E.out(seg(t, 0.4, 4.5))), 34, K(0.4, 1.4), t);
    d.c.restore();
    volcano(d, 720, GY, 230, 150, K(0.6, 2.2), d.faint, 1.8);
    volcano(d, 320, GY, 300, 232, K(0.2, 2));
    if (t > 2) smoke(d, 350, GY - 232, t);
    clouds(d, t, K(1.2, 2.6), 2, 80, 6);
    birds(d, t, K(1.8, 2.6));
    terraces(d, t, K(0.5, 2.8));
  }

  function sPlant(d, t, p) {
    const K = (a, b) => E.out(seg(t, a, b)), HX = 470;
    horizon(d, K(0, 0.8));
    ground(d, K(0.3, 1.5));
    volcano(d, 700, GY, 260, 170, K(0, 1.4), d.faint, 1.6);
    sun(d, 830, 110, 26, K(0.3, 1.1), t);
    clouds(d, t, K(0.3, 1.5), 1, 90);
    palm(d, 80, GY, 150, t, K(0.2, 1.4));
    palm(d, 885, GY, 120, t, K(0.4, 1.6));
    let x = 395, o = { f: 1 };
    if (p < 0.28) { x = lerp(-40, 395, seg(p, 0, 0.28)); o.walk = t * 7; }
    else o.armF = [1.3, 1.6];
    if (p > 0.34) d.ln(arcP(HX, GY, 18, 8, 0, PI, 14), E.out(seg(p, 0.34, 0.4)), d.ink, 2);
    if (p > 0.58) { // sprout
      const g = E.out(seg(p, 0.58, 0.7)) * (1 + E.out(seg(p, 0.75, 1)) * 0.5);
      d.ln([[HX, GY], [HX, GY - 30 * g]], 1, d.ink, 2);
      if (g > 0.4) {
        const s = g;
        d.ln(cat(bezP([HX, GY - 22 * s], [HX - 8 * s, GY - 32 * s], [HX - 18 * s, GY - 30 * s], [HX - 20 * s, GY - 26 * s], 8), bezP([HX - 20 * s, GY - 26 * s], [HX - 12 * s, GY - 20 * s], [HX - 6 * s, GY - 20 * s], [HX, GY - 22 * s], 8)), seg(g, 0.4, 0.9), d.accent, 1.8);
        d.ln(cat(bezP([HX, GY - 28 * s], [HX + 8 * s, GY - 38 * s], [HX + 18 * s, GY - 36 * s], [HX + 20 * s, GY - 32 * s], 8), bezP([HX + 20 * s, GY - 32 * s], [HX + 12 * s, GY - 26 * s], [HX + 6 * s, GY - 26 * s], [HX, GY - 28 * s], 8)), seg(g, 0.5, 1), d.accent, 1.8);
      }
    }
    const fig = figure(d, x, GY, o);
    const [hx, hy] = fig.hF;
    if (p >= 0.28 && p < 0.56) { // hoe (cangkul)
      const a = lerp(-1.1, 0.9, (Math.sin(t * 8) + 1) / 2);
      const tx = hx + Math.cos(a) * 46, ty = hy + Math.sin(a) * 46;
      d.ln([[hx, hy], [tx, ty]], 1, d.ink, 2.4);
      d.ln([[tx, ty], [tx + Math.cos(a + PI / 2) * 12, ty + Math.sin(a + PI / 2) * 12]], 1, d.ink, 3);
      for (let i = 0; i < 5; i++) {
        const ph = frac(t * 2.2 + i / 5);
        d.dot(HX + (i - 2) * 12 * ph, GY - 4 - Math.sin(ph * PI) * 20, 1.8, d.faint);
      }
    }
    if (p >= 0.7) { // watering can
      d.ln([[hx - 4, hy - 4], [hx + 18, hy - 4], [hx + 18, hy + 14], [hx - 4, hy + 14], [hx - 4, hy - 4]], 1, d.ink, 2, d.paper);
      d.ln([[hx + 18, hy + 2], [hx + 34, hy - 10]], 1, d.ink, 2);
      d.ln(arcP(hx + 7, hy - 4, 8, 8, PI, PI * 2, 8), 1, d.ink, 1.8);
      for (let i = 0; i < 6; i++) {
        const ph = frac(t * 1.8 + i / 6);
        const dx = lerp(hx + 34, HX, ph), dy = lerp(hy - 10, GY - 6, ph) - Math.sin(ph * PI) * 8;
        d.ln([[dx, dy], [dx - 1, dy + 5]], 1, d.accent, 1.6);
      }
    }
  }

  function sGrow(d, t, p) {
    const K = (a, b) => E.out(seg(t, a, b));
    const g = E.inOut(seg(p, 0.02, 0.95)), day = frac(t * 0.7 + 0.1), sunH = Math.sin(day * PI * 2), dl = clamp(sunH * 1.5 + 0.5);
    const wet = Math.max(bump(p, 0.16, 0.34), bump(p, 0.58, 0.74));
    d.c.fillStyle = mix(d.paper, d.night, (1 - dl) * 0.9);
    d.c.fillRect(0, 0, W, H);
    stars(d, 1 - dl * 1.5, t);
    const bx = 60 + frac(day * 2) * 840;
    if (sunH > 0) sun(d, bx, 330 - sunH * 250, 24, 1, t); else moon(d, bx, 330 + sunH * 250, 18, 1);
    horizon(d, K(0, 0.8));
    ground(d, K(0.2, 1.2));
    volcano(d, 760, GY, 220, 140, K(0, 1.2), d.faint, 1.6, mix(d.paper, d.night, (1 - dl) * 0.9));
    clouds(d, t, 1, 3, 70, 14);
    rain(d, t, wet);
    d.paper = mix(d.paper, d.night, (1 - dl) * 0.9); // shapes filled with "paper" follow the night tint
    cloveTree(d, 470, GY, lerp(0.05, 1, g), 1, t);
    figure(d, 640, GY, { f: -1, s: 1.1 });
  }

  const HARV = { x: 540, from: 0.36, to: 0.9 };
  const picked = p => Math.floor(seg(p, HARV.from, HARV.to) * BUDS.length);
  function sHarvest(d, t, p) {
    const K = (a, b) => E.out(seg(t, a, b));
    horizon(d, K(0, 0.8));
    ground(d, K(0.2, 1.2));
    volcano(d, 800, GY, 200, 130, K(0, 1.2), d.faint, 1.6);
    sun(d, 170, 100, 24, K(0.2, 1), t);
    clouds(d, t, K(0.3, 1.4), 2, 80);
    const tr = cloveTree(d, HARV.x, GY, 1, K(0, 1.6), t);
    const ripe = E.inOut(seg(p, 0.06, 0.28)), col = mix(d.budGreen, d.accent, ripe);
    const q = seg(p, HARV.from, HARV.to) * BUDS.length, n = Math.floor(q), f = frac(q);
    const pos = i => [tr.cx + BUDS[i][0] * tr.rx * 0.9, tr.cy + BUDS[i][1] * tr.ry * 0.85];
    const shown = seg(p, 0.03, 0.12) * BUDS.length;
    for (let i = n; i < BUDS.length; i++) {
      if (i >= shown || (i === n && p > HARV.from)) continue;
      budCluster(d, ...pos(i), col, Math.min(1, shown - i));
    }
    const L0 = [440, GY], L1 = [490, GY - 196];
    d.ln([L0, L1], K(0.6, 1.4), d.ink, 2);
    d.ln([[L0[0] + 22, L0[1]], [L1[0] + 22, L1[1]]], K(0.7, 1.5), d.ink, 2);
    if (t > 1.5) for (let i = 1; i < 10; i++) { const k = i / 10; d.ln([[lerp(L0[0], L1[0], k), lerp(L0[1], L1[1], k)], [lerp(L0[0], L1[0], k) + 22, lerp(L0[1], L1[1], k)]], 1, d.faint, 1.5); }
    basket(d, 330, GY, n / BUDS.length, K(0.8, 1.6));
    let o;
    if (p < 0.24) o = { x: lerp(-40, 420, seg(p, 0.06, 0.24)), y: GY, walk: p > 0.06 ? t * 7 : null };
    else {
      const u = seg(p, 0.24, 0.34) * 0.58;
      o = { x: lerp(L0[0], L1[0], u) - 4, y: lerp(L0[1], L1[1], u), walk: p < 0.34 ? t * 6 : null };
      if (p >= 0.34 && n < BUDS.length) o.armF = f < 0.45 ? [2.3, 2.6] : [0.9, 1.4];
    }
    figure(d, o.x, o.y, { f: 1, walk: o.walk, armF: o.armF });
    if (p > HARV.from && n < BUDS.length) {
      const [sx, sy] = pos(n), k = E.inOut(f);
      const fx = lerp(sx, 330, k), fy = lerp(sy, GY - 44, k) - Math.sin(k * PI) * 60;
      for (let j = 1; j < 6; j++) {
        const kk = Math.max(0, k - j * 0.04);
        d.dot(lerp(sx, 330, kk), lerp(sy, GY - 44, kk) - Math.sin(kk * PI) * 60, 1.2, d.faint);
      }
      budCluster(d, fx, fy, d.accent);
    }
  }

  function sDry(d, t, p) {
    const K = (a, b) => E.out(seg(t, a, b));
    const day = frac(p * 4), sunH = Math.sin(day * PI);
    horizon(d, K(0, 0.8));
    volcano(d, 250, GY, 230, 150, K(0, 1.3), d.faint, 1.6);
    sun(d, lerp(40, 920, day), 330 - sunH * 250, 24, K(0.2, 0.8), t);
    palm(d, 60, GY, 130, t, K(0.3, 1.4));
    // farmhouse with a joglo-style roof
    const hk = K(0.3, 1.8), X = 640;
    d.ln(rectP(X, GY - 76, 220, 76), hk, d.ink, 2, d.paper);
    d.ln([[X - 26, GY - 76], [X + 40, GY - 118], [X + 180, GY - 118], [X + 246, GY - 76], [X - 26, GY - 76]], hk, d.ink, 2, d.paper);
    d.ln([[X + 40, GY - 118], [X + 70, GY - 142], [X + 150, GY - 142], [X + 180, GY - 118]], hk, d.ink, 2, d.paper);
    d.ln(rectP(X + 96, GY - 48, 28, 48), hk, d.ink, 1.8);
    d.ln(rectP(X + 24, GY - 56, 40, 24), hk, d.ink, 1.6);
    d.ln(rectP(X + 156, GY - 56, 40, 24), hk, d.ink, 1.6);
    // woven mats (tikar) in perspective, buds going from pink-red to deep brown
    const mk = K(0.5, 1.8);
    [60, 340, 620].forEach((mx, m) => {
      d.ln([[mx, 510], [mx + 230, 510], [mx + 260, 440], [mx + 30, 440], [mx, 510]], mk, d.ink, 1.8, d.paper);
      if (mk < 1) return;
      for (let i = 1; i < 8; i++) d.ln([[mx + i * 29, 510], [mx + 30 + i * 29, 440]], 1, d.faint, 0.9);
      for (let i = 1; i < 4; i++) d.ln([[mx + (30 * i) / 4, 510 - (70 * i) / 4], [mx + 230 + (30 * i) / 4, 510 - (70 * i) / 4]], 1, d.faint, 0.9);
      for (let i = 0; i < 70; i++) {
        const v = hash(i, m + 9), x = mx + 12 + hash(i, m) * 210 + v * 30, y = 505 - v * 62, a = hash(i, m + 30) * PI;
        const col = mix(d.accent, d.driedClove, clamp(p * 1.15 - hash(i, m + 20) * 0.15));
        d.ln([[x - Math.cos(a) * 3.5, y - Math.sin(a) * 3.5], [x + Math.cos(a) * 3.5, y + Math.sin(a) * 3.5]], 1, col, 2.2);
      }
    });
    const fx = 470 + Math.sin(t * 1.1) * 110, f = Math.cos(t * 1.1) < 0 ? -1 : 1;
    const fig = figure(d, fx, GY + 20, { f, armF: [1.2, 1.5], k: K(0.8, 1.6), s: 1.1 });
    if (t > 1.6) d.ln([fig.hF, [fig.hF[0] + f * 30, 460]], 1, d.ink, 2);
  }

  function sPack(d, t, p) {
    const K = (a, b) => E.out(seg(t, a, b)), FLOOR = 430;
    d.ln([[0, FLOOR], [W, FLOOR]], K(0, 0.8), d.ink, 1.8);
    const wk = K(0.2, 1.2);
    d.ln(rectP(80, 110, 160, 120), wk, d.ink, 1.8);
    d.ln([[160, 110], [160, 230]], wk, d.faint, 1.3);
    d.ln([[80, 170], [240, 170]], wk, d.faint, 1.3);
    d.ln([[92, 230], [128, 190], [150, 200], [180, 176], [228, 230]], wk, d.faint, 1.3);
    const lx = 480 + Math.sin(t * 1.3) * 5;
    d.ln([[480, 0], [lx, 80]], K(0, 0.6), d.ink, 1.4);
    d.ln([[lx - 22, 104], [lx - 10, 80], [lx + 10, 80], [lx + 22, 104], [lx - 22, 104]], K(0.3, 0.9), d.ink, 1.8, d.paper);
    if (t > 0.9) for (let i = 0; i < 3; i++) d.alpha(0.6 - i * 0.18, () => d.ln(arcP(lx, 104, 18 + i * 12, 10 + i * 8, 0.2, PI - 0.2, 14), 1, d.accent, 1.3));
    // QC bench: flask + documents (Phyto, CoA, Halal)
    d.ln([[700, 250], [900, 250]], K(0.4, 1.2), d.ink, 2);
    const fk = K(0.6, 1.4);
    d.ln([[716, 206], [716, 222]], fk, d.ink, 1.8);
    d.ln([[728, 206], [728, 222]], fk, d.ink, 1.8);
    d.ln(cat([[716, 222]], arcP(722, 236, 14, 13, -PI * 0.62, PI * 1.62, 20).reverse(), [[728, 222]]), fk, d.ink, 1.8);
    if (fk >= 1) d.ln([[710, 238], [734, 238]], 1, d.accent, 2);
    for (let i = 0; i < 3; i++) {
      const on = E.back(seg(p, 0.12 + i * 0.2, 0.22 + i * 0.2)), x = 760 + i * 44, y = 250 - 50 - (1 - on) * 12;
      if (on <= 0) continue;
      d.alpha(Math.min(1, on), () => {
        d.ln(rectP(x, y, 32, 44), 1, d.ink, 1.6, d.paper);
        for (let j = 0; j < 3; j++) d.ln([[x + 6, y + 9 + j * 7], [x + 26 - j * 5, y + 9 + j * 7]], 1, d.faint, 1.1);
        check(d, x + 18, y + 34, 0.9, seg(on, 0.6, 1));
      });
    }
    // pile of dried cloves
    const pk = K(0.3, 1.2);
    d.ln(bezP([110, FLOOR], [150, FLOOR - 90], [290, FLOOR - 90], [330, FLOOR], 24), pk, d.ink, 2);
    if (pk >= 1) for (let i = 0; i < 40; i++) {
      const u = hash(i, 71), x = 130 + u * 180, top = FLOOR - Math.sin(u * PI) * 66, y = lerp(top + 8, FLOOR - 6, hash(i, 72));
      const a = hash(i, 73) * PI;
      d.ln([[x - Math.cos(a) * 3, y - Math.sin(a) * 3], [x + Math.cos(a) * 3, y + Math.sin(a) * 3]], 1, d.driedClove, 2);
    }
    // filling 50 kg sacks, one per second, then stacking them
    const n = Math.floor(t), cp = frac(t), done = Math.min(n, 6), FX = 380, SX = 470;
    const slot = i => [[640, 0], [712, 0], [784, 0], [676, 1], [748, 1], [712, 2]][i];
    const sliding = n >= 1 && n <= 6 && cp < 0.3 ? n - 1 : -1;
    for (let i = 0; i < done; i++) {
      const [sx, row] = slot(i), sy = FLOOR - row * 64;
      if (i === sliding) {
        const k = E.inOut(cp / 0.3);
        sack(d, lerp(SX, sx, k), lerp(FLOOR, sy, k) - Math.sin(k * PI) * 40, 1);
      } else sack(d, sx, sy, 1);
    }
    if (n < 6) {
      sack(d, SX, FLOOR, 0.35 + cp * 0.65, 1, false);
      const pouring = cp >= 0.5, fig = figure(d, FX, FLOOR, { f: pouring ? 1 : -1, armF: pouring ? [1.9, 2.2] : [0.9, 1.3], k: K(0.5, 1.2) });
      const [hx, hy] = fig.hF;
      d.ln(arcP(hx, hy + 2, 8, 6, 0, PI, 8), 1, d.ink, 1.8);
      if (pouring) for (let i = 0; i < 5; i++) {
        const ph = frac(t * 3 + i / 5);
        d.dot(lerp(hx + 4, SX, ph), lerp(hy + 6, FLOOR - 50, ph), 1.8, d.driedClove);
      }
    } else {
      figure(d, FX, FLOOR, { f: 1 });
      const k = E.out(seg(t, 6.1, 6.7));
      if (k > 0) { d.circle(712, 210, 26, k, d.accent, 2.4, d.paper); check(d, 712, 210, 1.6, seg(k, 0.5, 1)); }
    }
  }

  const SHIP_A = 0.28, SHIP_B = 0.64;
  function sShip(d, t, p) {
    if (p < SHIP_A) { // Nganjuk -> Surabaya by road
      const lt = t, K = (a, b) => E.out(seg(lt, a, b)), q = seg(p, 0, SHIP_A);
      d.ln([[0, 380], [W, 380]], K(0, 0.8), d.ink, 1.6);
      volcano(d, 620, 380, 240, 150, K(0, 1.3), d.faint, 1.5);
      sun(d, 150, 110, 24, K(0.2, 1), t);
      [90, 330, 820].forEach((x, i) => palm(d, x, 380, 110 + i * 12, t, K(0.2 + i * 0.2, 1.4)));
      d.ln([[0, 470], [W, 470]], K(0, 0.8), d.ink, 1.6);
      if (lt > 0.8) for (let x = 0; x < W; x += 60) d.ln([[x + 10, 426], [x + 40, 426]], 1, d.faint, 1.6);
      if (lt > 0.8) for (let i = 0; i < 14; i++) { const x = hash(i, 66) * W; d.ln([[x, 380], [x - 2, 373]], 1, d.faint, 1.2); d.ln([[x + 3, 380], [x + 5, 372]], 1, d.faint, 1.2); }
      for (let i = 0; i < 8; i++) { const x = hash(i, 67) * W, y = 490 + hash(i, 68) * 36; d.ln([[x, y], [x + 20 + hash(i, 69) * 30, y]], K(0.4, 1.4), d.faint, 1.1); }
      truck(d, lerp(-180, 1000, q), 450, t, 1);
    } else if (p < SHIP_B) { // Port of Surabaya
      const lt = t - SHIP_A * 12, K = (a, b) => E.out(seg(lt, a, b));
      const q = seg(p, SHIP_A, SHIP_B) * 5, ci = Math.min(4, Math.floor(q)), cp = q >= 5 ? 1 : frac(q);
      skyline(d, 400, K(0, 1.2), t, 0.55);
      d.ln([[420, 420], [W, 420]], K(0, 0.6), d.ink, 1.6);
      waves(d, t, 450, 3, 10, K(0.3, 1));
      const SXP = 440, WL = 430, pickX = 340, slotX = i => SXP + 108 + i * 72 + 34;
      ship(d, SXP, WL, t, ci + (cp >= 0.75 ? 1 : 0), K(0.1, 1.2));
      d.ln([[0, 400], [420, 400], [420, H]], K(0, 0.8), d.ink, 2, d.paper);
      for (let x = 30; x < 420; x += 70) d.ln([[x, 400], [x, H]], K(0.3, 1), d.faint, 1.2);
      for (let i = 0; i < 4 - ci; i++) container(d, 20, 400 - i * 34, K(0.3, 1.1));
      let tx = pickX, hy = 170, carry = false;
      const cx = slotX(ci), PICK = 362, SLOT = 352;
      if (cp < 0.15) hy = lerp(170, PICK, cp / 0.15);
      else if (cp < 0.3) { hy = lerp(PICK, 190, (cp - 0.15) / 0.15); carry = true; }
      else if (cp < 0.6) { tx = lerp(pickX, cx, E.inOut((cp - 0.3) / 0.3)); hy = 190; carry = true; }
      else if (cp < 0.75) { tx = cx; hy = lerp(190, SLOT, (cp - 0.6) / 0.15); carry = true; }
      else if (cp < 0.88) { tx = cx; hy = lerp(SLOT, 170, (cp - 0.75) / 0.13); }
      else tx = lerp(cx, pickX, E.inOut((cp - 0.88) / 0.12));
      if (cp < 0.15) container(d, pickX - 34, 400, K(0.5, 1.2), ci === 0, ci === 0 ? d.accent : null);
      crane(d, tx, hy, K(0, 1.4));
      if (carry) container(d, tx - 34, hy + 38, 1, ci === 0, ci === 0 ? d.accent : null);
    } else { // at sea
      const lt = t - SHIP_B * 12, K = (a, b) => E.out(seg(lt, a, b));
      d.c.save(); d.c.beginPath(); d.c.rect(0, 0, W, 300); d.c.clip();
      sun(d, 730, 300, 48, K(0, 1), t, false);
      d.c.restore();
      d.ln([[0, 300], [W, 300]], K(0, 0.8), d.ink, 1.6);
      for (let i = 0; i < 5; i++) d.ln([[730 - 40 + i * 6, 316 + i * 10], [730 + 40 - i * 6, 316 + i * 10]], K(0.3, 1), d.accent, 1.4);
      waves(d, t, 340, 7, 26, K(0.2, 1));
      const bob = Math.sin(t * 2.2) * 3;
      ship(d, 150, 420 + bob, t, 5, K(0, 1.4));
      for (let i = 0; i < 6; i++) {
        const ph = frac(t * 1.2 + i / 6);
        d.alpha(1 - ph, () => d.ln(arcP(150 - ph * 90, 430 + bob + (i % 3) * 6, 10, 3, PI, PI * 2, 6), 1, d.faint, 1.3));
      }
      const dp = seg(p, 0.76, 0.9);
      if (dp > 0 && dp < 1) { // dolphin
        const x = lerp(760, 880, dp), y = 350 - Math.sin(dp * PI) * 50, a = Math.cos(dp * PI) * 0.9;
        const P = (u, v) => [x + Math.cos(-a) * u - Math.sin(-a) * v, y + Math.sin(-a) * u + Math.cos(-a) * v];
        d.ln(cat(bezP(P(-22, 2), P(-8, -10), P(10, -10), P(22, 0), 10), bezP(P(22, 0), P(8, 6), P(-8, 6), P(-22, 2), 10)), 1, d.ink, 1.8);
        d.ln([P(0, -8), P(-4, -16), P(4, -9)], 1, d.ink, 1.6);
      }
      birds(d, t, K(0.5, 1.2), 2);
    }
    const edge = Math.max(0, 1 - Math.abs(p - SHIP_A) / 0.02, 1 - Math.abs(p - SHIP_B) / 0.02);
    if (edge > 0) { d.c.fillStyle = d.paper; d.alpha(edge, () => d.c.fillRect(0, 0, W, H)); }
  }

  function sArrive(d, t, p) {
    const K = (a, b) => E.out(seg(t, a, b));
    skyline(d, 380, K(0, 1.4), t);
    sun(d, 150, 90, 22, K(0.2, 1), t);
    d.ln([[0, 410], [560, 410]], K(0, 0.8), d.ink, 1.6);
    waves(d, t, 440, 3, 8, K(0.3, 1));
    ship(d, lerp(-520, 60, E.out(seg(p, 0, 0.35))), 430, t, 5, 1);
    d.ln([[560, H], [560, 390], [W, 390]], K(0, 0.8), d.ink, 2, d.paper);
    for (let x = 600; x < W; x += 70) d.ln([[x, 390], [x, H]], K(0.3, 1), d.faint, 1.2);
    const SXK = 660, drop = seg(p, 0.36, 0.46);
    if (drop > 0) {
      const by = lerp(-40, 390, E.back(drop));
      if (drop < 1) d.ln([[SXK, 0], [SXK, by - 70]], 1, d.ink, 1.4);
      sack(d, SXK, by, 1);
    }
    const open = seg(p, 0.6, 0.7);
    if (open > 0) for (let i = 0; i < 14; i++) {
      const ph = clamp(open * 1.6 - hash(i, 81) * 0.5);
      if (ph <= 0) continue;
      const x = SXK + (hash(i, 82) - 0.5) * 110 * ph, y = Math.min(386, 318 - Math.sin(ph * PI) * 60 + ph * 70), a = hash(i, 83) * PI;
      d.ln([[x - Math.cos(a) * 4, y - Math.sin(a) * 4], [x + Math.cos(a) * 4, y + Math.sin(a) * 4]], 1, d.driedClove, 2.4);
    }
    let bx = 740, o = { f: -1, hat: false, tie: true };
    if (p < 0.58) { bx = lerp(1010, 740, seg(p, 0.42, 0.58)); if (p > 0.42) o.walk = t * 7; }
    else if (p > 0.66) {
      o.armF = [2.6, 2.9]; o.armB = [-2.6, -2.9];
      o.lift = Math.abs(Math.sin(t * 6)) * 8 * (1 - seg(p, 0.85, 0.95));
    }
    const fig = figure(d, bx, 390, o);
    const hb = E.back(seg(p, 0.68, 0.78));
    if (hb > 0) heart(d, fig.head[0], fig.head[1] - 46, 1.6 * hb, 1);
  }

  function sOutro(d, t, p) {
    const k = E.inOut(seg(t, 0.2, 2.6));
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * PI * 2 + t * 0.25, z = Math.sin(a);
      d.alpha(seg(t, 2, 3) * (0.35 + 0.35 * z), () => d.dot(480 + Math.cos(a) * 130, 150 + z * 26, 2.4, d.accent));
    }
    bigClove(d, 480, 78 + Math.sin(t * 1.6) * 3, 0.74, k);
  }

  /* ---------------------------------------------------------------- script */

  const COUNTRIES = {
    en: ['Saudi Arabia', 'UAE', 'India', 'Pakistan', 'China', 'Japan', 'South Korea', 'Singapore', 'Germany', 'Netherlands', 'United Kingdom', 'United States'],
    id: ['Arab Saudi', 'UEA', 'India', 'Pakistan', 'Tiongkok', 'Jepang', 'Korea Selatan', 'Singapura', 'Jerman', 'Belanda', 'Inggris', 'Amerika Serikat'],
  };
  const SCENES = [
    { dur: 5.5, draw: sIntro, title: 'intro',
      cap: { en: 'In Nganjuk, East Java, volcanic soil and an equatorial sun shape one of the world’s finest spices.',
             id: 'Di Nganjuk, Jawa Timur, tanah vulkanik dan matahari khatulistiwa melahirkan salah satu rempah terbaik dunia.' } },
    { dur: 8, draw: sPlant, ch: { en: 'Planting', id: 'Menanam' },
      cap: { en: 'A young clove seedling goes into rich volcanic soil on our own plantation, watered and tended by hand.',
             id: 'Bibit cengkeh muda ditanam di tanah vulkanik yang subur di kebun milik kami sendiri, disiram dan dirawat dengan tangan.' } },
    { dur: 8, draw: sGrow, ch: { en: 'Growing', id: 'Tumbuh' },
      hud: (p, L) => (L === 'id' ? 'Tahun ' : 'Year ') + (1 + Math.min(5, Math.floor(p * 6))),
      cap: { en: 'Sun and tropical rain, season after season. A clove tree grows for years before its first harvest.',
             id: 'Matahari dan hujan tropis, musim demi musim. Pohon cengkeh tumbuh bertahun-tahun sebelum panen pertamanya.' } },
    { dur: 9, draw: sHarvest, ch: { en: 'Harvest', id: 'Panen' },
      hud: (p, L) => (L === 'id' ? 'Dipetik ' : 'Picked ') + picked(p) + ' / ' + BUDS.length,
      cap: { en: 'The flower buds are hand-picked from mature trees the moment they blush pink, before they bloom.',
             id: 'Kuncup bunga dipetik dengan tangan dari pohon dewasa saat mulai kemerahan, sebelum sempat mekar.' } },
    { dur: 7, draw: sDry, ch: { en: 'Sun-drying', id: 'Penjemuran' },
      hud: (p, L) => p > 0.9 ? (L === 'id' ? 'Kadar air ≤ 10%' : 'Moisture ≤ 10%') : (L === 'id' ? 'Hari ke-' : 'Day ') + (1 + Math.min(3, Math.floor(p * 4))),
      cap: { en: 'Spread on woven mats under the sun for days, the buds turn deep brown, dense with eugenol and oil.',
             id: 'Dijemur di atas tikar selama berhari-hari, kuncup berubah cokelat tua, kaya eugenol dan minyak atsiri.' } },
    { dur: 7.5, draw: sPack, ch: { en: 'Sorting & QC', id: 'Sortir & QC' },
      hud: (p, L, t) => (L === 'id' ? 'Karung 50 kg: ' : '50 kg sacks: ') + Math.min(6, Math.floor(t)) + ' / 6',
      cap: { en: 'Hand-sorted, lab-tested lot by lot, then packed into 50 kg jute sacks with every document ready.',
             id: 'Disortir tangan, diuji lab per lot, lalu dikemas dalam karung goni 50 kg dengan dokumen lengkap.' } },
    { dur: 12, draw: sShip, ch: { en: 'Shipping', id: 'Pengiriman' },
      hud: (p, L, t) => p < SHIP_A ? 'Nganjuk → Surabaya'
        : p < SHIP_B ? (L === 'id' ? 'Pelabuhan Surabaya' : 'Port of Surabaya')
        : 'Surabaya → ' + COUNTRIES[L][Math.floor(t * 2.2) % COUNTRIES[L].length],
      cap: { en: 'From the farm to the Port of Surabaya, into containers, and across the ocean.',
             id: 'Dari kebun ke Pelabuhan Surabaya, masuk kontainer, lalu berlayar menyeberangi samudra.' } },
    { dur: 8.5, draw: sArrive, ch: { en: 'Delivered', id: 'Tiba' },
      hud: (p, L) => p < 0.6 ? (L === 'id' ? 'Merapat…' : 'Arriving…') : (L === 'id' ? '15+ negara' : '15+ countries'),
      cap: { en: 'Premium Javanese clove arrives at our buyer’s door, traceable from tree to shipment.',
             id: 'Cengkeh Jawa premium tiba di tangan pembeli, bisa dilacak dari pohon hingga pengiriman.' } },
    { dur: 7, draw: sOutro, title: 'outro',
      cap: { en: 'We grow it, we process it, we export it.', id: 'Kami menanam, mengolah, dan mengekspornya sendiri.' } },
  ];
  let acc = 0;
  for (const s of SCENES) { s.start = acc; acc += s.dur; }
  const TOTAL = acc;
  const CHAPTERS = SCENES.filter(s => s.ch);

  const UI = {
    en: { sub: 'The journey of a clove', tagline: 'Where spice meets global standards', cta: 'Request offer', play: 'Play', pause: 'Pause', restart: 'Restart', lang: 'Bahasa Indonesia', seek: 'Seek' },
    id: { sub: 'Perjalanan sebutir cengkeh', tagline: 'Rempah Nusantara, standar dunia', cta: 'Minta penawaran', play: 'Putar', pause: 'Jeda', restart: 'Ulangi', lang: 'English', seek: 'Geser' },
  };

  /* ------------------------------------------------------------ component */

  const ICON = {
    play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z"/></svg>',
    pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14M16 5v14"/></svg>',
    restart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3M4.5 4.5v4h4"/></svg>',
  };

  const CSS = `
:host{display:block;--accent:${DEFAULT_ACCENT};--paper:#f7f2ea;--ink:#2b211b;--radius:18px;font-family:inherit;color:var(--ink)}
*{box-sizing:border-box}
.wrap{background:var(--paper);border-radius:var(--radius);overflow:hidden;container-type:inline-size;border:1px solid color-mix(in srgb,var(--ink) 14%,transparent)}
.stage{position:relative;aspect-ratio:16/9}
canvas{position:absolute;inset:0;width:100%;height:100%;cursor:pointer}
.title{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;text-align:center;gap:1.2cqw;pointer-events:none;opacity:0;transform:translateY(1cqw);transition:opacity .9s ease,transform .9s ease}
.title.on{opacity:1;transform:none}
.title.intro{padding-top:5cqw}
.title.outro{justify-content:flex-end;padding-bottom:5cqw}
.t1{font-size:clamp(20px,5.4cqw,58px);font-weight:600;letter-spacing:-.01em;line-height:1.05}
.t2{font-size:clamp(10px,1.45cqw,15px);letter-spacing:.22em;text-transform:uppercase;opacity:.7}
.title.intro .t1,.title.intro .t2{background:color-mix(in srgb,var(--paper) 82%,transparent);padding:0 .3em;border-radius:.2em}
.cta{pointer-events:auto;margin-top:1.2cqw;font:inherit;font-size:clamp(12px,1.5cqw,16px);font-weight:600;color:#fff;background:var(--accent);text-decoration:none;padding:.75em 1.6em;border-radius:999px;transition:transform .2s,box-shadow .2s}
.cta:hover{transform:translateY(-1px);box-shadow:0 6px 18px -6px var(--accent)}
.cta:focus-visible{outline:2px solid var(--ink);outline-offset:3px}
.cta[hidden]{display:none}
.big{position:absolute;left:50%;top:50%;width:9cqw;height:9cqw;min-width:48px;min-height:48px;transform:translate(-50%,-50%);border:1.5px solid var(--accent);border-radius:50%;background:color-mix(in srgb,var(--paper) 88%,transparent);color:var(--accent);cursor:pointer;display:grid;place-items:center;transition:transform .2s}
.big:hover{transform:translate(-50%,-50%) scale(1.05)}
.big svg{width:42%;height:42%;fill:currentColor;margin-left:8%}
.big[hidden]{display:none}
.info{padding:2cqw 3cqw 0;display:grid;gap:.6em}
.meta{display:flex;justify-content:space-between;gap:1em;font-size:clamp(10px,1.2cqw,13px);letter-spacing:.14em;text-transform:uppercase}
.chap{color:var(--accent);font-weight:600}
.count{opacity:.6;font-variant-numeric:tabular-nums}
.cap{margin:0;font-size:clamp(14px,1.9cqw,20px);line-height:1.45;min-height:2.9em;max-width:52em;transition:opacity .45s}
.cap.fade{opacity:0}
.bar{display:flex;align-items:center;gap:1.2cqw;padding:1.4cqw 2.4cqw 1.8cqw}
button.b{all:unset;box-sizing:border-box;cursor:pointer;display:grid;place-items:center;width:36px;height:36px;border-radius:50%;color:var(--ink)}
button.b svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
button.b.play svg path[d^="M8 5.5"]{fill:currentColor;stroke:none}
button.b:hover{background:color-mix(in srgb,var(--ink) 8%,transparent)}
button.b:focus-visible,.prog:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
button.lang{width:auto;padding:0 .9em;border-radius:999px;font:inherit;font-size:12px;font-weight:600;letter-spacing:.1em;border:1px solid color-mix(in srgb,var(--ink) 22%,transparent)}
.prog{flex:1;height:18px;position:relative;cursor:pointer;touch-action:none}
.prog::before{content:'';position:absolute;left:0;right:0;top:50%;height:1px;background:color-mix(in srgb,var(--ink) 25%,transparent)}
.fill{position:absolute;left:0;top:50%;height:2px;margin-top:-1px;background:var(--accent);pointer-events:none}
.tick{position:absolute;top:50%;width:5px;height:5px;margin:-2.5px 0 0 -2.5px;border-radius:50%;background:var(--paper);border:1px solid color-mix(in srgb,var(--ink) 45%,transparent);pointer-events:none}
.tick.done{background:var(--accent);border-color:var(--accent)}
`;

  class CloveLine extends HTMLElement {
    static get observedAttributes() { return ['lang', 'accent', 'theme', 'brand', 'tagline', 'cta-href', 'cta-text']; }

    constructor() {
      super();
      this.t = 0;
      this.playing = false;
      this.started = false;
      this.userPaused = false;
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
      this._applyAttrs();
      this.reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (!this.started) this.t = 4.8; // poster frame: intro fully drawn, title showing
      this._ro = new ResizeObserver(() => this._resize());
      this._ro.observe(this.$.stage);
      this._io = new IntersectionObserver(([e]) => {
        if (e.isIntersecting && !this.userPaused && !this.playing && !this.reduced && !this.hasAttribute('no-autoplay') && !this._ended) this.play();
        else if (!e.isIntersecting && this.playing) this._stop();
      }, { threshold: 0.35 });
      this._io.observe(this);
      if (document.fonts) document.fonts.ready.then(() => this._draw());
      this._resize();
    }

    disconnectedCallback() {
      this._stop();
      if (this._io) this._io.disconnect();
      if (this._ro) this._ro.disconnect();
    }

    attributeChangedCallback() {
      if (this.shadowRoot) { this._applyAttrs(); this._prev = {}; this._draw(); }
    }

    _build() {
      const root = this.attachShadow({ mode: 'open' });
      root.innerHTML = `<style>${CSS}</style>
<div class="wrap" part="frame">
  <div class="stage">
    <canvas role="img"></canvas>
    <div class="title"><div class="t1"></div><div class="t2"></div><a class="cta" part="cta" hidden></a></div>
    <button class="big" aria-label="Play">${ICON.play}</button>
  </div>
  <div class="info">
    <div class="meta"><span class="chap"></span><span class="count"></span></div>
    <p class="cap" aria-hidden="true"></p>
  </div>
  <div class="bar">
    <button class="b play" aria-label="Play">${ICON.play}</button>
    <button class="b restart" aria-label="Restart">${ICON.restart}</button>
    <div class="prog" role="slider" tabindex="0" aria-valuemin="0" aria-valuemax="${Math.round(TOTAL)}"><div class="fill"></div></div>
    <button class="b lang"></button>
  </div>
</div>`;
      const $ = s => root.querySelector(s);
      this.$ = {
        stage: $('.stage'), canvas: $('canvas'), title: $('.title'), t1: $('.t1'), t2: $('.t2'), cta: $('.cta'), big: $('.big'),
        chap: $('.chap'), count: $('.count'), cap: $('.cap'), play: $('.play'), restart: $('.restart'), prog: $('.prog'), fill: $('.fill'), lang: $('.lang'),
      };
      this.$.ticks = CHAPTERS.map(s => {
        const tk = document.createElement('div');
        tk.className = 'tick';
        tk.style.left = (s.start / TOTAL) * 100 + '%';
        this.$.prog.appendChild(tk);
        return tk;
      });
      this.ctx = this.$.canvas.getContext('2d');

      const toggle = () => (this.playing ? this.pause() : this.play());
      this.$.canvas.addEventListener('click', toggle);
      this.$.big.addEventListener('click', () => this.play());
      this.$.play.addEventListener('click', toggle);
      this.$.restart.addEventListener('click', () => { this.seek(0); this.play(); });
      this.$.lang.addEventListener('click', () => { this._lang = this.language === 'en' ? 'id' : 'en'; this._applyAttrs(); this._prev = {}; this._draw(); });
      const prog = this.$.prog;
      const seekTo = e => { const r = prog.getBoundingClientRect(); this.seek(clamp((e.clientX - r.left) / r.width) * TOTAL); };
      prog.addEventListener('pointerdown', e => { prog.setPointerCapture(e.pointerId); this._drag = true; seekTo(e); });
      prog.addEventListener('pointermove', e => this._drag && seekTo(e));
      prog.addEventListener('pointerup', () => (this._drag = false));
      prog.addEventListener('keydown', e => {
        const d = { ArrowRight: 5, ArrowLeft: -5, Home: -TOTAL, End: TOTAL }[e.key];
        if (d !== undefined) { e.preventDefault(); this.seek(this.t + d); }
      });
    }

    _applyAttrs() {
      const L = this.language, u = UI[L], th = THEMES[this.getAttribute('theme') === 'dark' ? 'dark' : 'light'];
      const accent = this.accent;
      this.style.setProperty('--accent', accent);
      this.style.setProperty('--paper', th.paper);
      this.style.setProperty('--ink', th.ink);
      this.pal = {
        paper: th.paper, ink: th.ink, accent,
        faint: mix(th.ink, th.paper, 0.58),
        night: mix(th.paper, th.ink, 0.16),
        budGreen: mix('#7aa35a', th.paper, 0.1),
        driedClove: mix('#5a2d16', th.ink, 0.25),
        accentSoft: mix(accent, th.paper, 0.82),
      };
      this.$.lang.textContent = L === 'en' ? 'ID' : 'EN';
      this.$.lang.setAttribute('aria-label', u.lang);
      this.$.restart.setAttribute('aria-label', u.restart);
      this.$.prog.setAttribute('aria-label', u.seek);
      this.$.big.setAttribute('aria-label', u.play);
      const href = this.getAttribute('cta-href');
      this.$.cta.hidden = !href;
      if (href) { this.$.cta.href = href; this.$.cta.textContent = this.getAttribute('cta-text') || u.cta; }
      this.$.canvas.setAttribute('aria-label', `${this.getAttribute('brand') || 'Nusajawa Clove'}: ${u.sub}. ` + SCENES.map(s => s.cap[L]).join(' '));
      this._syncButtons();
    }

    _resize() {
      const r = this.$.stage.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
      if (this.$.canvas.width !== w || this.$.canvas.height !== h) { this.$.canvas.width = w; this.$.canvas.height = h; }
      this._draw();
    }

    play() {
      if (!this.started || this._ended) { this.t = 0; this._ended = false; }
      this.started = true;
      this.userPaused = false;
      if (this.playing) return;
      this.playing = true;
      this._last = performance.now();
      this._raf = requestAnimationFrame(this._frame);
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
      this._syncButtons();
    }

    _syncButtons() {
      if (!this.$) return;
      const u = UI[this.language];
      this.$.play.innerHTML = this.playing ? ICON.pause : ICON.play;
      this.$.play.setAttribute('aria-label', this.playing ? u.pause : u.play);
      this.$.big.hidden = this.playing || (this.started && this.t > 0.2 && !this._ended);
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
      if (!this.ctx || !this.pal) return;
      const c = this.ctx, t = this.t, L = this.language, cv = this.$.canvas;
      let i = SCENES.findIndex(s => t < s.start + s.dur);
      if (i < 0) i = SCENES.length - 1;
      const s = SCENES[i], lt = t - s.start, p = clamp(lt / s.dur);

      const k = cv.width / W;
      c.setTransform(k, 0, 0, k, 0, 0);
      c.lineCap = 'round';
      c.lineJoin = 'round';
      c.globalAlpha = 1;
      c.fillStyle = this.pal.paper;
      c.fillRect(0, 0, W, H);
      const font = getComputedStyle(this).fontFamily || 'system-ui, sans-serif';
      s.draw(kit(c, { ...this.pal }, font), lt, p);
      // fade to paper at the end of each scene; the next one draws itself back in
      const last = i === SCENES.length - 1 && this.hasAttribute('no-loop');
      const fade = last ? 0 : seg(lt, s.dur - 0.5, s.dur);
      if (fade > 0) { c.globalAlpha = fade; c.fillStyle = this.pal.paper; c.fillRect(0, 0, W, H); c.globalAlpha = 1; }

      const set = (key, v, fn) => { if (this._prev[key] !== v) { this._prev[key] = v; fn(v); } };
      const chIdx = CHAPTERS.indexOf(s);
      set('chap', s.ch ? `${String(chIdx + 1).padStart(2, '0')} · ${s.ch[L]}` : (this.getAttribute('brand') || 'Nusajawa Clove'), v => (this.$.chap.textContent = v));
      set('count', s.hud ? s.hud(p, L, lt) : '', v => (this.$.count.textContent = v));
      set('cap', s.cap[L], v => {
        this.$.cap.classList.add('fade');
        clearTimeout(this._capT);
        this._capT = setTimeout(() => { this.$.cap.textContent = v; this.$.cap.classList.remove('fade'); }, this._prev.capInit ? 250 : 0);
        this._prev.capInit = true;
      });
      const brand = this.getAttribute('brand') || 'Nusajawa Clove';
      const tt = s.title === 'intro' && lt > 1.6 && lt < s.dur - 0.6 ? `intro|${brand}|${UI[L].sub}`
        : s.title === 'outro' && lt > 2.2 ? `outro|${brand}|${this.getAttribute('tagline') || UI[L].tagline}` : '';
      set('title', tt, v => {
        const [kind, a, b] = v.split('|');
        if (kind) { this.$.title.className = `title on ${kind}`; this.$.t1.textContent = a; this.$.t2.textContent = b; }
        else this.$.title.classList.remove('on');
        this.$.cta.style.display = kind === 'outro' ? '' : 'none';
      });
      set('prog', Math.round((t / TOTAL) * 1000), v => {
        this.$.fill.style.width = v / 10 + '%';
        this.$.prog.setAttribute('aria-valuenow', String(Math.round(t)));
        this.$.ticks.forEach((tk, j) => tk.classList.toggle('done', CHAPTERS[j].start <= t));
      });
      if (this.$.big.hidden !== (this.playing || (this.started && t > 0.2 && !this._ended))) this._syncButtons();
    }
  }

  customElements.define('clove-line', CloveLine);
})();
