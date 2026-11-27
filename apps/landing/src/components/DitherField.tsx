// A field of dots behind the footer's "get started" block, after the reference's dotted film of a lit object:
// the Killswitch mark, large, as a dark solid whose rounded edges catch a light that slowly circles it (the
// brightest edge dots turn red), over a faint drifting texture. Drawn at about 30 frames a second, only while
// on screen: one small image per frame (a pixel per dot), scaled up and cut into dots by a repeating mask.
import { useEffect, useRef } from "react";
import { MARK } from "../brand/brand-geometry";
import { reduceMotion } from "../lib/motion";

const PITCH = 5; // css px from one dot to the next
const DOT = 2; // css px, the dot's side
const ORBIT = 12; // seconds for the light to go once round the mark

function noise(cols: number, rows: number, seed: number) {
  // value noise on a coarse lattice, smoothly interpolated, two octaves
  let s = seed >>> 0;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const out = new Float32Array(cols * rows);
  for (const [cell, amp] of [
    [18, 0.65],
    [7, 0.35],
  ] as const) {
    const gw = Math.ceil(cols / cell) + 2;
    const gh = Math.ceil(rows / cell) + 2;
    const g = Float32Array.from({ length: gw * gh }, rnd);
    for (let y = 0; y < rows; y++) {
      const fy = y / cell;
      const y0 = Math.floor(fy);
      const ty = fy - y0;
      const sy = ty * ty * (3 - 2 * ty);
      for (let x = 0; x < cols; x++) {
        const fx = x / cell;
        const x0 = Math.floor(fx);
        const tx = fx - x0;
        const sx = tx * tx * (3 - 2 * tx);
        const a = g[y0 * gw + x0];
        const b = g[y0 * gw + x0 + 1];
        const c = g[(y0 + 1) * gw + x0];
        const d = g[(y0 + 1) * gw + x0 + 1];
        out[y * cols + x] += amp * ((a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy);
      }
    }
  }
  return out;
}

export function DitherField() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!;
    const ctx = c.getContext("2d")!;
    const still = reduceMotion();
    let cols = 0;
    let rows = 0;
    let tex = new Float32Array(0); // the drifting texture, twice as wide as the field so it can scroll
    let mark = new Float32Array(0); // how much of the mark covers each dot, 0..1
    let gx = new Float32Array(0); // the slope of the mark's rounded edge at each dot, for the light
    let gy = new Float32Array(0);
    let small: HTMLCanvasElement | null = null;
    let sctx: CanvasRenderingContext2D | null = null;
    let img: ImageData | null = null;
    let pattern: CanvasPattern | null = null;
    let raf = 0;
    let last = 0;
    let visible = false;
    let dpr = 1;

    const build = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = c.clientWidth;
      const h = c.clientHeight;
      if (!w || !h) return;
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
      cols = Math.ceil(w / PITCH);
      rows = Math.ceil(h / PITCH);
      tex = noise(cols * 2, rows, 11);
      // the mark at one pixel per dot, on the right of the block: once soft for its body, once softer for the
      // rounding of its edges, whose slope the light reads
      // on a narrow screen the words sit at the bottom of the block, so the mark goes smaller, above them
      const narrow = w < 760;
      const shape = (blur: number) => {
        const m = document.createElement("canvas");
        m.width = cols;
        m.height = rows;
        const mc = m.getContext("2d")!;
        const mh = Math.min(rows * (narrow ? 0.4 : 0.86), ((cols * 0.9) / MARK.width) * MARK.height);
        const scale = mh / MARK.height;
        const mw = MARK.width * scale;
        mc.filter = `blur(${blur}px)`;
        if (narrow) mc.translate((cols - mw) / 2, rows * 0.07);
        else mc.translate(Math.min(cols * 0.73, cols - mw * 0.56) - mw / 2, (rows - mh) / 2 + rows * 0.03);
        mc.scale(scale, scale);
        mc.fillStyle = "#fff";
        mc.fill(new Path2D(MARK.ring));
        mc.fill(new Path2D(MARK.bar));
        const md = mc.getImageData(0, 0, cols, rows).data;
        const a = new Float32Array(cols * rows);
        for (let i = 0; i < cols * rows; i++) a[i] = md[i * 4 + 3] / 255;
        return a;
      };
      mark = shape(1.2);
      const soft = shape(Math.max(2.5, rows * 0.035));
      gx = new Float32Array(cols * rows);
      gy = new Float32Array(cols * rows);
      let top = 1e-6;
      for (let y = 1; y < rows - 1; y++) {
        for (let x = 1; x < cols - 1; x++) {
          const i = y * cols + x;
          gx[i] = soft[i + 1] - soft[i - 1];
          gy[i] = soft[i + cols] - soft[i - cols];
          top = Math.max(top, Math.hypot(gx[i], gy[i]));
        }
      }
      for (let i = 0; i < cols * rows; i++) {
        gx[i] /= top;
        gy[i] /= top;
      }
      small = document.createElement("canvas");
      small.width = cols;
      small.height = rows;
      sctx = small.getContext("2d")!;
      img = sctx.createImageData(cols, rows);
      // the mask that cuts the scaled image into dots
      const p = document.createElement("canvas");
      const pp = Math.round(PITCH * dpr);
      p.width = pp;
      p.height = pp;
      const pc = p.getContext("2d")!;
      pc.fillStyle = "#000";
      pc.fillRect(0, 0, Math.max(1, Math.round(DOT * dpr)), Math.max(1, Math.round(DOT * dpr)));
      pattern = ctx.createPattern(p, "repeat");
      draw(still ? ORBIT * 0.3 * 1000 : performance.now());
    };

    function draw(now: number) {
      if (!img || !sctx || !small || !pattern) return;
      const t = now / 1000;
      const d = img.data;
      // the light comes from this direction and goes slowly round the mark
      const th = (t / ORBIT) * Math.PI * 2 + 2.2;
      const lx = Math.cos(th);
      const ly = Math.sin(th);
      const drift = Math.floor(t * 4) % (cols * 2);
      for (let y = 0; y < rows; y++) {
        const fade = Math.min(1, (rows - y) / (rows * 0.3)); // darker towards the links below
        const row = y * cols;
        const trow = y * cols * 2;
        for (let x = 0; x < cols; x++) {
          const i = row + x;
          const n = tex[trow + ((x + drift) % (cols * 2))];
          const m = mark[i];
          // an edge facing the light catches it
          const lit = Math.max(0, -(gx[i] * lx + gy[i] * ly));
          const spec = lit * lit;
          let b = (0.035 + 0.13 * n * n) * (1 - m * 0.6) + m * 0.16 + spec * 0.9;
          b = Math.min(1, b * fade);
          const o = i * 4;
          const red = spec > 0.66; // only the brightest edge turns red; the rest of the light is white
          d[o] = 255;
          d[o + 1] = red ? 32 : 255;
          d[o + 2] = red ? 40 : 255;
          d[o + 3] = Math.round(b * 20) * (255 / 20); // twenty grey levels: smooth, still a little grainy
        }
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
  }, []);
  return <canvas ref={ref} className="dither" aria-hidden="true" />;
}
