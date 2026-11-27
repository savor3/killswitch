// Red squares that follow the pointer over a dark picture. The grid cell under the pointer pops in (now and
// then a neighbour as well), holds for 240 to 640 ms and switches off at once. Measured on the reference:
// 20 px squares on a 26 px grid at a 1905 px window, a pop of about 110 ms with a slight overshoot.
// One canvas per picture, drawn over the picture and under the words; only for a mouse or a pen, never with
// reduced motion, and the frame loop stops as soon as no square is alive.
import { useEffect, useRef } from "react";
import { reduceMotion } from "../lib/motion";

const RED = "#ff2028";
const POP_MS = 110;
const LIFE_MIN = 240;
const LIFE_MAX = 640;
const NEIGHBOUR = 0.12; // chance that a new square lights one next to it too
const SKIP = 0.12; // chance that a cell between two pointer samples is left dark
const W = 4096; // key = row * W + column

export function PixelTrail() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const host = canvas?.parentElement;
    if (!canvas || !host || reduceMotion() || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let w = 0;
    let h = 0;
    let dpr = 1;
    let pitch = 26;
    let size = 20;
    let cols = 0;
    let rows = 0;
    let ox = 0;
    let oy = 0;
    let raf = 0;
    let last: [number, number] | null = null;
    const born = new Map<number, number>();
    const dies = new Map<number, number>();

    const fit = () => {
      w = host.clientWidth;
      h = host.clientHeight;
      dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      pitch = Math.max(18, Math.min(26, window.innerWidth * 0.01365));
      size = Math.round(pitch * 0.77);
      cols = Math.floor(w / pitch);
      rows = Math.floor(h / pitch);
      ox = (w - cols * pitch) / 2;
      oy = (h - rows * pitch) / 2;
      born.clear();
      dies.clear();
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(host);

    const add = (c: number, r: number, now: number, spread: boolean) => {
      if (c < 0 || r < 0 || c >= cols || r >= rows) return;
      const k = r * W + c;
      if (born.has(k)) return;
      born.set(k, now);
      dies.set(k, now + LIFE_MIN + Math.random() * (LIFE_MAX - LIFE_MIN));
      if (spread && Math.random() < NEIGHBOUR) {
        const dr = Math.random() < 0.5 ? -1 : 1;
        const dc = Math.floor(Math.random() * 3) - 1;
        add(c + dc, r + dr, now + 40, false);
      }
    };

    const draw = (now: number) => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = RED;
      for (const [k, b] of born) {
        if (now >= (dies.get(k) ?? 0)) {
          born.delete(k);
          dies.delete(k);
          continue;
        }
        const p = Math.max(0, Math.min(1, (now - b) / POP_MS));
        const s = p < 0.7 ? 1.1 * (p / 0.7) : 1.1 - 0.1 * ((p - 0.7) / 0.3);
        const c = k % W;
        const r = (k - c) / W;
        const d = size * s * dpr;
        const x = Math.round((ox + c * pitch + pitch / 2) * dpr - d / 2);
        const y = Math.round((oy + r * pitch + pitch / 2) * dpr - d / 2);
        ctx.fillRect(x, y, Math.round(d), Math.round(d));
      }
      raf = born.size ? requestAnimationFrame(draw) : 0;
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      const b = host.getBoundingClientRect();
      const c1 = Math.floor((e.clientX - b.left - ox) / pitch);
      const r1 = Math.floor((e.clientY - b.top - oy) / pitch);
      const now = performance.now();
      if (last && (last[0] !== c1 || last[1] !== r1)) {
        const [c0, r0] = last;
        const n = Math.max(Math.abs(c1 - c0), Math.abs(r1 - r0));
        for (let i = 1; i < n; i++) {
          if (Math.random() < SKIP) continue;
          add(Math.round(c0 + ((c1 - c0) * i) / n), Math.round(r0 + ((r1 - r0) * i) / n), now, true);
        }
      }
      add(c1, r1, now, true);
      last = [c1, r1];
      if (!raf) raf = requestAnimationFrame(draw);
    };
    const onLeave = () => {
      last = null;
    };
    host.addEventListener("pointermove", onMove);
    host.addEventListener("pointerleave", onLeave);
    return () => {
      host.removeEventListener("pointermove", onMove);
      host.removeEventListener("pointerleave", onLeave);
      ro.disconnect();
      cancelAnimationFrame(raf);
    };
  }, []);

  return <canvas className="trail" ref={ref} aria-hidden="true" />;
}
