// The rail's quiet game: red pieces made of the hero's LED squares fall into the empty middle of the black rail
// and stack. A small Tetris bot places each one (the usual height / lines / holes / bumpiness score), so rows fill
// and clear with a short flash instead of piling up. One row per step, drawn only when something moves; it runs
// only while the rail is shown and the tab is visible, and with reduced motion it is a still stack.
import { useEffect, useRef } from "react";

const PITCH = 7; // the LED grid of the rail's background: a 1 px line, then a 6 px square
const LED = 6;
const CELL = PITCH * 2; // one block is 2 x 2 LED squares
const STEP_MS = 135;
const RED = "255, 32, 40";

type Pt = [number, number];
const BASE: Pt[][] = [
  [[0, 0], [1, 0], [2, 0], [3, 0]],
  [[0, 0], [1, 0], [0, 1], [1, 1]],
  [[0, 0], [1, 0], [2, 0], [1, 1]],
  [[1, 0], [2, 0], [0, 1], [1, 1]],
  [[0, 0], [1, 0], [1, 1], [2, 1]],
  [[0, 0], [0, 1], [1, 1], [2, 1]],
  [[2, 0], [0, 1], [1, 1], [2, 1]],
];
function rotations(s: Pt[]) {
  const out: Pt[][] = [];
  let cur = s;
  for (let i = 0; i < 4; i++) {
    const mx = Math.min(...cur.map((p) => p[0]));
    const my = Math.min(...cur.map((p) => p[1]));
    const n = cur.map(([x, y]) => [x - mx, y - my] as Pt).sort((a, b) => a[1] - b[1] || a[0] - b[0]);
    if (!out.some((o) => o.every((p, k) => p[0] === n[k][0] && p[1] === n[k][1]))) out.push(n);
    cur = cur.map(([x, y]) => [y, -x] as Pt);
  }
  return out;
}
const ROTS = BASE.map(rotations);

type Board = number[][]; // 0 = empty, otherwise the cell's strength (alpha)
const width = (s: Pt[]) => Math.max(...s.map((p) => p[0])) + 1;
const height = (s: Pt[]) => Math.max(...s.map((p) => p[1])) + 1;

function fits(b: Board, s: Pt[], px: number, py: number) {
  const rows = b.length;
  const cols = b[0].length;
  for (const [x, y] of s) {
    const c = px + x;
    const r = py + y;
    if (c < 0 || c >= cols || r >= rows) return false;
    if (r >= 0 && b[r][c]) return false;
  }
  return true;
}
function landing(b: Board, s: Pt[], px: number) {
  let y = -height(s);
  if (!fits(b, s, px, y)) return null;
  while (fits(b, s, px, y + 1)) y++;
  return y;
}
function score(b: Board) {
  const rows = b.length;
  const cols = b[0].length;
  let agg = 0;
  let holes = 0;
  let bump = 0;
  let lines = 0;
  let prev = -1;
  for (let c = 0; c < cols; c++) {
    let h = 0;
    let seen = false;
    for (let r = 0; r < rows; r++) {
      if (b[r][c]) {
        if (!seen) h = rows - r;
        seen = true;
      } else if (seen) holes++;
    }
    agg += h;
    if (prev >= 0) bump += Math.abs(h - prev);
    prev = h;
  }
  for (const row of b) if (row.every(Boolean)) lines++;
  return -0.51 * agg + 0.76 * lines - 0.36 * holes - 0.18 * bump;
}
/** Where the bot puts a piece: the best spot most of the time, the second best now and then, for variety. */
function choose(b: Board, kind: number) {
  const opts: { s: Pt[]; x: number; y: number; v: number }[] = [];
  for (const s of ROTS[kind]) {
    for (let x = 0; x <= b[0].length - width(s); x++) {
      const y = landing(b, s, x);
      if (y === null || y < 0) continue;
      const t = b.map((row) => row.slice());
      for (const [px, py] of s) t[y + py][x + px] = 1;
      opts.push({ s, x, y, v: score(t) });
    }
  }
  opts.sort((a, c) => c.v - a.v);
  return opts.length > 1 && Math.random() < 0.18 ? opts[1] : opts[0] ?? null;
}

export function Blocks() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    const rail = cv?.parentElement;
    const ctx = cv?.getContext("2d");
    if (!cv || !rail || !ctx) return;
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let W = 0;
    let H = 0;
    let x0 = 0;
    let y0 = 0;
    let cols = 0;
    let rows = 0;
    let board: Board = [];
    let piece: { s: Pt[]; x: number; y: number; to: number; a: number } | null = null;
    let flash: { rows: number[]; n: number } | null = null;
    let fading = 0;
    let raf = 0;
    let last = 0;
    let acc = 0;

    const fresh = () => Array.from({ length: rows }, () => Array(cols).fill(0) as number[]);
    const measure = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      W = rail.clientWidth;
      H = rail.clientHeight;
      cv.width = Math.round(W * dpr);
      cv.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const nav = rail.querySelector<HTMLElement>(".nav");
      const foot = rail.querySelector<HTMLElement>(".side-foot");
      const top = nav ? nav.offsetTop + nav.offsetHeight + 30 : H * 0.4;
      const bottom = foot ? foot.offsetTop - 12 : H - 90;
      y0 = Math.ceil(top / PITCH) * PITCH;
      x0 = PITCH * 2;
      const c = Math.max(0, Math.floor((W - x0 * 2) / CELL));
      const r = Math.max(0, Math.floor((bottom - y0) / CELL));
      if (c !== cols || r !== rows) {
        cols = c;
        rows = r;
        board = fresh();
        piece = null;
        flash = null;
      }
    };
    // a block: its 2 x 2 LED squares, on the background's grid
    const cell = (c: number, r: number, a: number) => {
      if (a <= 0) return;
      ctx.fillStyle = `rgba(${RED}, ${a.toFixed(3)})`;
      const x = x0 + c * CELL + 1;
      const y = y0 + r * CELL + 1;
      ctx.fillRect(x, y, LED, LED);
      ctx.fillRect(x + PITCH, y, LED, LED);
      ctx.fillRect(x, y + PITCH, LED, LED);
      ctx.fillRect(x + PITCH, y + PITCH, LED, LED);
    };
    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      for (let r = 0; r < rows; r++) {
        const lit = flash?.rows.includes(r);
        for (let c = 0; c < cols; c++) {
          const v = board[r][c];
          if (!v) continue;
          cell(c, r, lit ? (flash!.n % 2 ? 0.95 : 0.45) : v * (fading ? Math.max(0, 1 - fading / 8) : 1));
        }
      }
      if (piece) {
        for (const [x, y] of piece.s) {
          const r = piece.y + y;
          if (r < 0) continue;
          cell(piece.x + x, r, piece.a * Math.min(1, (r + 1) / 3));
        }
      }
    };
    const spawn = () => {
      const pick = choose(board, Math.floor(Math.random() * ROTS.length));
      if (!pick) {
        fading = 1;
        return;
      }
      piece = { s: pick.s, x: pick.x, y: -height(pick.s), to: pick.y, a: 0.5 };
    };
    const lock = () => {
      if (!piece) return;
      const shade = 0.16 + Math.random() * 0.12;
      for (const [x, y] of piece.s) {
        const r = piece.y + y;
        if (r >= 0) board[r][piece.x + x] = shade;
      }
      piece = null;
      const full: number[] = [];
      board.forEach((row, i) => row.every(Boolean) && full.push(i));
      if (full.length) flash = { rows: full, n: 0 };
      // getting crowded: let the stack fade out and start over
      else if (board.slice(0, 4).some((row) => row.some(Boolean))) fading = 1;
    };
    const step = () => {
      if (fading) {
        if (++fading > 8) {
          board = fresh();
          fading = 0;
        }
        return;
      }
      if (flash) {
        if (++flash.n >= 4) {
          const keep = board.filter((_, i) => !flash!.rows.includes(i));
          board = [...Array.from({ length: flash.rows.length }, () => Array(cols).fill(0) as number[]), ...keep];
          flash = null;
        }
        return;
      }
      if (!piece) return spawn();
      if (piece.y < piece.to) piece.y++;
      else lock();
    };
    const tick = (t: number) => {
      raf = requestAnimationFrame(tick);
      if (!rows || !cols || rail.offsetWidth === 0) return;
      const dt = Math.min(500, t - (last || t));
      last = t;
      acc += dt;
      if (acc < STEP_MS) return;
      acc %= STEP_MS;
      step();
      draw();
    };

    measure();
    if (still) {
      // a quiet stack, placed by the same bot, drawn once
      type Piece = { s: Pt[]; x: number; y: number; to: number; a: number };
      for (let i = 0; i < 9 && rows > 6; i++) {
        spawn();
        const p = piece as Piece | null;
        if (!p) continue;
        p.y = p.to;
        lock();
        const f = flash as { rows: number[] } | null;
        if (f) {
          board = [...f.rows.map(() => Array(cols).fill(0) as number[]), ...board.filter((_, k) => !f.rows.includes(k))];
          flash = null;
        }
      }
      fading = 0;
      draw();
    } else raf = requestAnimationFrame(tick);
    const ro = new ResizeObserver(() => {
      measure();
      draw();
    });
    ro.observe(rail);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);
  return <canvas ref={ref} className="blocks" aria-hidden="true" />;
}
