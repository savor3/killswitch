// The hero's picture, after Arvion's hero: a red aurora arching over the words, above dark mountains, drawn as
// a screen of square pixels, the same squares the rest of the page is made of. Every pixel is the brand red
// (#FF2028) at some strength over the panel's dark ground, so the whole grid glows faintly; only the hottest
// pixels along the aurora's lower edge turn white. The curtains drift slowly; a fixed fine dither gives the
// pixels their grain without crawling as they move. Drawn at 30 frames a second on a canvas, only while on
// screen: one small image (a pixel per square), scaled up and cut into squares by a repeating mask.
import { useEffect, useRef } from "react";
import { reduceMotion } from "../lib/motion";

const PITCH = 7; // css px from one square to the next
const GAP = 1; // css px between squares
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16 - 0.5);
const GROUND = [16, 12, 12]; // the panel behind the squares (hero.css --pixel-ground)
const RED = [255, 32, 40]; // #FF2028

// the curtains: an arch over the words (lower edge `top` at the middle, falling `bow` to the sides), waves
// along it, how far the rays reach up, how bright, and the phase of its drift
const HERO = [
  { top: 0.2, bow: 1.25, mid: 0.52, w1: 0.04, f1: 0.9, T1: 34, w2: 0.014, f2: 2.3, T2: 21, reach: 0.2, k: 1.08, ph: 0.3 },
  { top: 0.08, bow: 0.8, mid: 0.44, w1: 0.03, f1: 1.3, T1: 47, w2: 0.012, f2: 3.1, T2: 26, reach: 0.12, k: 0.36, ph: 2.2 },
];

const tri = (x: number) => 1 - Math.abs(2 * (x - Math.floor(x)) - 1);

// the pre-sale page's panel: the words sit top left and the card on the right, so the arch rises behind the
// card and sweeps down through the open middle, leaving the headline in dark sky
const SALE = [
  { top: 0.12, bow: 1.9, mid: 0.8, w1: 0.035, f1: 0.9, T1: 34, w2: 0.013, f2: 2.3, T2: 21, reach: 0.2, k: 1.05, ph: 0.3 },
  { top: 0.02, bow: 1.3, mid: 0.7, w1: 0.03, f1: 1.3, T1: 47, w2: 0.012, f2: 3.1, T2: 26, reach: 0.12, k: 0.36, ph: 2.2 },
];

/** `look`: "hero", the home page's arch over centred words; "sale", the pre-sale panel's. */
export function HeroPixel({ look = "hero" }: { look?: "hero" | "sale" }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!;
    const ctx = c.getContext("2d")!;
    const still = reduceMotion();
    const CURTAINS = look === "sale" ? SALE : HERO;
    let cols = 0;
    let rows = 0;
    let dpr = 1;
    let small: HTMLCanvasElement | null = null;
    let sctx: CanvasRenderingContext2D | null = null;
    let img: ImageData | null = null;
    let pattern: CanvasPattern | null = null;
    let far = new Float32Array(0); // per column, where the far and the near ridge are (0 top .. 1 bottom)
    let near = new Float32Array(0);
    let stars: { i: number; a: number; w: number; p: number }[] = [];
    let raf = 0;
    let last = 0;
    let visible = false;
    // per column, for each curtain: its lower edge, its brightness along its length, its rays
    let edge: Float32Array[] = [];
    let along: Float32Array[] = [];
    let rays: Float32Array[] = [];

    const build = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = c.clientWidth;
      const h = c.clientHeight;
      if (!w || !h) return;
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
      cols = Math.ceil(w / PITCH);
      rows = Math.ceil(h / PITCH);
      // two mountain ranges, sharp peaks from three sizes of triangle waves
      far = new Float32Array(cols);
      near = new Float32Array(cols);
      for (let x = 0; x < cols; x++) {
        const u = x / cols;
        far[x] = 0.84 - 0.075 * (0.55 * tri(u * 2.1 + 0.13) + 0.3 * tri(u * 4.7 + 0.41) + 0.15 * tri(u * 11.3 + 0.07));
        near[x] = 0.955 - 0.05 * (0.6 * tri(u * 1.6 + 0.62) + 0.28 * tri(u * 3.9 + 0.2) + 0.12 * tri(u * 9.1 + 0.55));
      }
      // a few faint white stars high in the sky (each is one whole square, so they must be few)
      let s = 7;
      const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
      stars = Array.from({ length: Math.round((cols * rows) / 1600) }, () => {
        const x = Math.floor(rnd() * cols);
        const y = Math.floor(rnd() * rows * 0.36);
        return { i: y * cols + x, a: 0.1 + rnd() * 0.22, w: 0.4 + rnd() * 1.1, p: rnd() * 6.3 };
      });
      edge = CURTAINS.map(() => new Float32Array(cols));
      along = CURTAINS.map(() => new Float32Array(cols));
      rays = CURTAINS.map(() => new Float32Array(cols));
      small = document.createElement("canvas");
      small.width = cols;
      small.height = rows;
      sctx = small.getContext("2d")!;
      img = sctx.createImageData(cols, rows);
      // the mask that cuts the scaled image into squares with a fine gap between them
      const p = document.createElement("canvas");
      const pp = Math.round(PITCH * dpr);
      p.width = pp;
      p.height = pp;
      const pc = p.getContext("2d")!;
      pc.fillStyle = "#000";
      pc.fillRect(0, 0, pp - Math.max(1, Math.round(GAP * dpr)), pp - Math.max(1, Math.round(GAP * dpr)));
      pattern = ctx.createPattern(p, "repeat");
      draw(still ? 20000 : performance.now());
    };

    function draw(now: number) {
      if (!img || !sctx || !small || !pattern) return;
      const t = now / 1000;
      const d = img.data;
      // the curtains' shapes for this moment, column by column
      CURTAINS.forEach((k, n) => {
        for (let x = 0; x < cols; x++) {
          const u = x / cols;
          const du = u - k.mid;
          edge[n][x] =
            k.top + k.bow * du * du + k.w1 * Math.sin(2 * Math.PI * (k.f1 * u + t / k.T1 + k.ph)) + k.w2 * Math.sin(2 * Math.PI * (k.f2 * u - t / k.T2));
          along[n][x] = k.k * (0.62 + 0.38 * Math.sin(2 * Math.PI * (u * 1.15 + t / 29 + k.ph))) * Math.min(1, u * 6, (1 - u) * 6);
          rays[n][x] = 0.68 + 0.2 * Math.sin(2 * Math.PI * (u * 33 + t / 12 + k.ph)) + 0.12 * Math.sin(2 * Math.PI * (u * 71 - t / 8));
        }
      });
      for (let y = 0; y < rows; y++) {
        const v = y / rows;
        const row = y * cols;
        for (let x = 0; x < cols; x++) {
          const i = row + x;
          const o = i * 4;
          d[o + 3] = 255;
          // the near range: the panel's own dark, no squares
          if (v > near[x]) {
            d[o] = GROUND[0];
            d[o + 1] = GROUND[1];
            d[o + 2] = GROUND[2];
            continue;
          }
          let I = 0.075 + 0.035 * v; // the sky: every square faintly lit, a little more towards the horizon
          for (let n = 0; n < CURTAINS.length; n++) {
            const dv = v - edge[n][x];
            const k = CURTAINS[n].reach;
            if (dv < 0) I += along[n][x] * rays[n][x] * Math.exp(dv / k) * (0.3 + 0.7 * Math.exp(dv / (k * 0.28)));
            else I += along[n][x] * Math.exp(-(dv * dv) / 0.00035);
          }
          // the far range: a dark silhouette, its peaks caught by the light; above it the sky glows, so the
          // mountains read against it
          if (v > far[x]) I = 0.045 + Math.min(0.16, I * 0.22) * Math.exp(-(v - far[x]) / 0.01);
          else I += 0.2 * Math.exp(-((far[x] - v) * (far[x] - v)) / 0.006);
          I += BAYER[(y & 3) * 4 + (x & 3)] * 0.05;
          if (I <= 1) {
            // the brand red at this strength over the panel's ground
            const q = I < 0 ? 0 : I;
            d[o] = GROUND[0] + (RED[0] - GROUND[0]) * q;
            d[o + 1] = GROUND[1] + (RED[1] - GROUND[1]) * q;
            d[o + 2] = GROUND[2] + (RED[2] - GROUND[2]) * q;
          } else {
            // past full red, the hottest squares go towards white
            const q = Math.min(1, (I - 1) / 0.3);
            d[o] = 255;
            d[o + 1] = RED[1] + (255 - RED[1]) * q;
            d[o + 2] = RED[2] + (255 - RED[2]) * q;
          }
        }
      }
      // white stars where the sky is still dark
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
    }

    const loop = (now: number) => {
      raf = 0;
      if (now - last > 32) {
        last = now;
        draw(now);
      }
      if (visible && !still) raf = requestAnimationFrame(loop);
    };
    const ro = new ResizeObserver(build);
    ro.observe(c);
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible && !still && !raf) raf = requestAnimationFrame(loop);
    });
    io.observe(c);
    return () => {
      ro.disconnect();
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [look]);
  return <canvas ref={ref} className="hero-canvas" aria-hidden="true" />;
}
