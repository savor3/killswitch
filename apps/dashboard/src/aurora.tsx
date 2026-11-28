// The landing hero's picture (apps/landing/src/components/HeroPixel.tsx), brought into the app so the way in
// looks like the site it came from: a red aurora drawn as a screen of square pixels, every square the brand red
// at some strength over the dark ground, the hottest along the light's lower edge going towards white.
// "panel" is the first-run screen's dark half: an arch of light over the words and two mountain ranges under
// the list, as on the landing. "rail" is the side rail: the same squares, nearly dark, and a low light rising
// from its bottom edge. Drawn on a canvas while it is on screen (the rail at a few frames a second, its light
// moves slowly), once with reduced motion. The panel's squares fade up when they first draw.
import { useLayoutEffect, useRef } from "react";
import { reduceMotion } from "./kit";

const PITCH = 7; // css px from one square to the next
const GAP = 1; // css px between squares
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16 - 0.5);
const RED = [255, 32, 40]; // #FF2028

// a curtain of light: its lower edge (`top` at `mid`, falling `bow` to the sides, two waves along it), how far
// its rays reach up, how bright, the phase of its drift, the ray frequencies, and whether it fades at the sides
type Curtain = {
  top: number; bow: number; mid: number; w1: number; f1: number; T1: number; w2: number; f2: number; T2: number;
  reach: number; k: number; ph: number; rf: [number, number]; taper: boolean;
};
type Look = { ground: number[]; sky: [number, number]; fps: number; hills: boolean; stars: boolean; curtains: Curtain[] };

const LOOKS: Record<"panel" | "rail", Look> = {
  panel: {
    ground: [16, 12, 12],
    sky: [0.075, 0.035],
    fps: 30,
    hills: true,
    stars: true,
    curtains: [
      { top: 0.15, bow: 0.34, mid: 0.6, w1: 0.035, f1: 0.9, T1: 34, w2: 0.012, f2: 2.3, T2: 21, reach: 0.19, k: 1.02, ph: 0.3, rf: [33, 71], taper: true },
      { top: 0.05, bow: 0.26, mid: 0.42, w1: 0.03, f1: 1.3, T1: 47, w2: 0.01, f2: 3.1, T2: 26, reach: 0.11, k: 0.34, ph: 2.2, rf: [33, 71], taper: true },
    ],
  },
  rail: {
    ground: [11, 11, 11],
    sky: [0.014, 0.016],
    fps: 15,
    hills: false,
    stars: false,
    curtains: [
      { top: 0.99, bow: 0.42, mid: 0.12, w1: 0.012, f1: 0.8, T1: 31, w2: 0.006, f2: 1.7, T2: 19, reach: 0.3, k: 0.85, ph: 0.9, rf: [4, 9], taper: false },
    ],
  },
};

const tri = (x: number) => 1 - Math.abs(2 * (x - Math.floor(x)) - 1);

export function Aurora({ kind }: { kind: "panel" | "rail" }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    const c = ref.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    const L = LOOKS[kind];
    const still = reduceMotion();
    let cols = 0;
    let rows = 0;
    let dpr = 1;
    let lift = 0; // a tall, narrow panel lifts its light clear of the words
    let small: HTMLCanvasElement | null = null;
    let sctx: CanvasRenderingContext2D | null = null;
    let img: ImageData | null = null;
    let pattern: CanvasPattern | null = null;
    let far = new Float32Array(0);
    let near = new Float32Array(0);
    let stars: { i: number; a: number; w: number; p: number }[] = [];
    let edge: Float32Array[] = [];
    let along: Float32Array[] = [];
    let rays: Float32Array[] = [];
    let raf = 0;
    let last = 0;
    let visible = true;
    let shown = false;

    const build = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = c.clientWidth;
      const h = c.clientHeight;
      if (!w || !h) return;
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
      cols = Math.ceil(w / PITCH);
      rows = Math.ceil(h / PITCH);
      lift = kind === "panel" && h > w * 1.02 ? Math.min(0.14, (h / w - 1) * 0.2 + 0.05) : 0;
      far = new Float32Array(cols);
      near = new Float32Array(cols);
      for (let x = 0; x < cols; x++) {
        const u = x / cols;
        far[x] = 0.84 - 0.075 * (0.55 * tri(u * 2.1 + 0.13) + 0.3 * tri(u * 4.7 + 0.41) + 0.15 * tri(u * 11.3 + 0.07));
        near[x] = 0.955 - 0.05 * (0.6 * tri(u * 1.6 + 0.62) + 0.28 * tri(u * 3.9 + 0.2) + 0.12 * tri(u * 9.1 + 0.55));
      }
      let s = 7;
      const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
      stars = L.stars
        ? Array.from({ length: Math.round((cols * rows) / 1600) }, () => {
            const x = Math.floor(rnd() * cols);
            const y = Math.floor(rnd() * rows * 0.3);
            return { i: y * cols + x, a: 0.1 + rnd() * 0.22, w: 0.4 + rnd() * 1.1, p: rnd() * 6.3 };
          })
        : [];
      edge = L.curtains.map(() => new Float32Array(cols));
      along = L.curtains.map(() => new Float32Array(cols));
      rays = L.curtains.map(() => new Float32Array(cols));
      small = document.createElement("canvas");
      small.width = cols;
      small.height = rows;
      sctx = small.getContext("2d");
      img = sctx ? sctx.createImageData(cols, rows) : null;
      // the mask that cuts the scaled picture into squares with a fine gap between them
      const p = document.createElement("canvas");
      const pp = Math.round(PITCH * dpr);
      const g = Math.max(1, Math.round(GAP * dpr));
      p.width = pp;
      p.height = pp;
      const pc = p.getContext("2d");
      if (!pc) return;
      pc.fillStyle = "#000";
      pc.fillRect(g, g, pp - g, pp - g);
      pattern = ctx.createPattern(p, "repeat");
      draw(still ? 20000 : performance.now());
    };

    function draw(now: number) {
      if (!img || !sctx || !small || !pattern || !ctx || !c) return;
      const t = now / 1000;
      const d = img.data;
      const G = L.ground;
      L.curtains.forEach((k, n) => {
        for (let x = 0; x < cols; x++) {
          const u = x / cols;
          const du = u - k.mid;
          edge[n][x] =
            k.top - lift + k.bow * du * du + k.w1 * Math.sin(2 * Math.PI * (k.f1 * u + t / k.T1 + k.ph)) + k.w2 * Math.sin(2 * Math.PI * (k.f2 * u - t / k.T2));
          along[n][x] =
            k.k * (0.62 + 0.38 * Math.sin(2 * Math.PI * (u * 1.15 + t / 29 + k.ph))) * (k.taper ? Math.min(1, u * 6, (1 - u) * 6) : 1);
          rays[n][x] = 0.68 + 0.2 * Math.sin(2 * Math.PI * (u * k.rf[0] + t / 12 + k.ph)) + 0.12 * Math.sin(2 * Math.PI * (u * k.rf[1] - t / 8));
        }
      });
      for (let y = 0; y < rows; y++) {
        const v = y / rows;
        const row = y * cols;
        for (let x = 0; x < cols; x++) {
          const o = (row + x) * 4;
          d[o + 3] = 255;
          // the near range: the ground itself, no squares
          if (L.hills && v > near[x]) {
            d[o] = G[0];
            d[o + 1] = G[1];
            d[o + 2] = G[2];
            continue;
          }
          let I = L.sky[0] + L.sky[1] * v;
          for (let n = 0; n < L.curtains.length; n++) {
            const dv = v - edge[n][x];
            const k = L.curtains[n].reach;
            if (dv < 0) I += along[n][x] * rays[n][x] * Math.exp(dv / k) * (0.3 + 0.7 * Math.exp(dv / (k * 0.28)));
            else I += along[n][x] * Math.exp(-(dv * dv) / 0.00035);
          }
          if (L.hills) {
            // the far range: a dark silhouette, its peaks caught by the light
            if (v > far[x]) I = 0.045 + Math.min(0.16, I * 0.22) * Math.exp(-(v - far[x]) / 0.01);
            else I += 0.2 * Math.exp(-((far[x] - v) * (far[x] - v)) / 0.006);
          }
          I += BAYER[(y & 3) * 4 + (x & 3)] * (kind === "rail" ? 0.012 : 0.05);
          if (I <= 1) {
            const q = I < 0 ? 0 : I;
            d[o] = G[0] + (RED[0] - G[0]) * q;
            d[o + 1] = G[1] + (RED[1] - G[1]) * q;
            d[o + 2] = G[2] + (RED[2] - G[2]) * q;
          } else {
            const q = Math.min(1, (I - 1) / 0.3);
            d[o] = 255;
            d[o + 1] = RED[1] + (255 - RED[1]) * q;
            d[o + 2] = RED[2] + (255 - RED[2]) * q;
          }
        }
      }
      for (const s of stars) {
        const o = s.i * 4;
        if (d[o] > 70) continue;
        const b = s.a * (0.55 + 0.45 * Math.sin(t * s.w + s.p));
        d[o] = Math.max(d[o], 255 * b);
        d[o + 1] = Math.max(d[o + 1], 255 * b);
        d[o + 2] = Math.max(d[o + 2], 255 * b);
      }
      sctx.putImageData(img, 0, 0);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = "source-over";
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.imageSmoothingEnabled = false;
      const pp = Math.round(PITCH * dpr);
      ctx.drawImage(small, 0, 0, cols * pp, rows * pp);
      ctx.globalCompositeOperation = "destination-in";
      ctx.fillStyle = pattern;
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.globalCompositeOperation = "source-over";
      if (!shown) {
        shown = true;
        // after a painted frame, so the fade runs (a data attribute: React never renders one here)
        requestAnimationFrame(() => requestAnimationFrame(() => c.setAttribute("data-on", "")));
      }
    }

    const loop = (now: number) => {
      raf = 0;
      if (now - last > 1000 / L.fps - 2) {
        last = now;
        draw(now);
      }
      if (visible && !still) raf = requestAnimationFrame(loop);
    };
    build();
    const ro = new ResizeObserver(build);
    ro.observe(c);
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible && !still && !raf) raf = requestAnimationFrame(loop);
    });
    io.observe(c);
    if (!still) raf = requestAnimationFrame(loop);
    return () => {
      ro.disconnect();
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [kind]);
  return <canvas ref={ref} className={`aurora is-${kind}`} aria-hidden="true" />;
}
