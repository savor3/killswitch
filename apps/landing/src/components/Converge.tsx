// Many paths run into one contract and leave it as one calm line, after the reference's convergence figure.
// Streaks (agents' operations) funnel in from the left; one in eight is red, an operation that reaches for
// too much, and it stops at the contract's edge with a small red flash. Out of the right side comes a bundle
// of thin lines moving in step: only what your limits allow; now and then one of them is traced in red from
// the contract outwards, then fades. The contract in the middle reads out what it decides, one operation
// after another, each line decoding from binary. Drawn on a canvas while it is on screen.
import { useEffect, useRef, useState } from "react";
import { reduceMotion } from "../lib/motion";
import { Decode } from "./Decode";

type Lane = { y: number; speed: number; off: number; len: number; red: boolean; a: number };

// what the contract says, in turn: the rule, then operations from How it works and what became of them
const SAYS: { lines: [string, string, string]; bad?: boolean }[] = [
  { lines: ["Every operation", "checked by your contract,", "before it moves."] },
  { lines: ["Swap 20 USDC for WETH", "inside the daily cap,", "allowed."] },
  { lines: ["Send 970 USDC to a stranger", "not on the allowlist,", "rejected."], bad: true },
  { lines: ["Pay 10 USDC to a new address", "a first payment,", "held for you."] },
  { lines: ["Take 100 USDC with a stolen key", "over the cap,", "reverted."], bad: true },
];
const SAY_MS = 4000;

// a fixed sequence, so the figure is the same on every visit
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function Converge() {
  const ref = useRef<HTMLCanvasElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [say, setSay] = useState(0);
  const [seen, setSeen] = useState(false);

  // the readout moves on while the figure is on screen
  useEffect(() => {
    if (!seen || reduceMotion()) return;
    const id = setTimeout(() => setSay((n) => (n + 1) % SAYS.length), SAY_MS);
    return () => clearTimeout(id);
  }, [seen, say]);

  useEffect(() => {
    const c = ref.current!;
    const ctx = c.getContext("2d")!;
    const still = reduceMotion();
    const rand = rng(7);
    const lanes: Lane[] = Array.from({ length: 128 }, () => ({
      y: Math.sign(rand() - 0.5) * Math.pow(rand(), 0.8),
      speed: 0.1 + rand() * 0.16,
      off: rand(),
      len: 0.03 + rand() * 0.08,
      red: rand() < 0.125,
      a: 0.28 + rand() * 0.6,
    }));
    let raf = 0;
    let visible = false;
    let w = 0;
    let h = 0;
    let dpr = 1;
    // the red trace on the calm side: which line, when it started, and when the next one comes
    let trace = { line: 4, t0: -10 };
    let nextTrace = 1.2;
    const size = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      w = c.clientWidth;
      h = c.clientHeight;
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
      if (!raf) frame(performance.now());
    };
    const ro = new ResizeObserver(size);
    ro.observe(c);
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      setSeen((s) => s || e.isIntersecting);
      if (visible && !raf && !still) raf = requestAnimationFrame(frame);
    });
    io.observe(c);

    function frame(now: number) {
      raf = 0;
      if (!w || !h) return;
      const t = still ? 3 : now / 1000;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const cx = w / 2;
      const cy = h / 2;
      const bw = box.current?.offsetWidth ?? 280;
      const x1 = cx - bw / 2 - 4; // the streaks end at the box's left edge
      const H = h * 0.5;
      // straight at first, then bending into a narrow band at the box
      const pinch = (u: number) => {
        const s = Math.min(1, Math.max(0, (u - 0.12) / 0.88));
        return 1 - s * s * (3 - 2 * s);
      };
      const yAt = (l: Lane, u: number) => {
        const g = pinch(u);
        return cy + l.y * (H * 0.96 * g + 7 * (1 - g));
      };
      ctx.lineCap = "round";
      for (const l of lanes) {
        const p = (l.off + t * l.speed) % 1;
        const u0 = Math.max(0, p - l.len);
        ctx.beginPath();
        for (let k = 0; k <= 6; k++) {
          const u = u0 + ((p - u0) * k) / 6;
          const x = x1 * u;
          const y = yAt(l, u);
          if (k) ctx.lineTo(x, y);
          else ctx.moveTo(x, y);
        }
        const a = l.a * (0.18 + 0.82 * p) * Math.min(1, p * 8);
        ctx.strokeStyle = l.red ? `rgba(255,32,40,${Math.min(1, a + 0.25).toFixed(3)})` : `rgba(255,255,255,${a.toFixed(3)})`;
        ctx.lineWidth = l.red ? 1.5 : 1.1;
        ctx.stroke();
        // a red one is stopped at the contract: a small red square flashes where it hit
        if (l.red && p > 0.955) {
          const k = (p - 0.955) / 0.045;
          ctx.fillStyle = `rgba(255,32,40,${(1 - k).toFixed(3)})`;
          const s = 5 + 3 * k;
          ctx.fillRect(x1 - s / 2, yAt(l, 1) - s / 2, s, s);
        }
      }
      // out of the contract: a bundle of thin lines in step, the swell growing away from the box
      const xs = cx + bw / 2 + 4;
      const span = w - xs;
      const lineY = (i: number, x: number) => {
        const u = x / span;
        const amp = h * 0.15 * Math.sin(Math.min(1, u * 1.4) * (Math.PI / 2));
        return cy + amp * Math.sin(u * 5.4 - t * 0.9 + i * 0.11) + (i - 4.5) * 0.9 * Math.min(1, u * 3);
      };
      for (let i = 0; i < 10; i++) {
        ctx.beginPath();
        for (let x = 0; x <= span; x += 5) {
          const y = lineY(i, x);
          if (x) ctx.lineTo(xs + x, y);
          else ctx.moveTo(xs + x, y);
        }
        ctx.strokeStyle = `rgba(255,255,255,${(0.1 + i * 0.05).toFixed(3)})`;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      // now and then one line is traced in red from the contract outwards, holds a moment, and fades
      if (!still) {
        if (t > nextTrace && t - trace.t0 > 3) {
          trace = { line: 1 + Math.floor(Math.random() * 8), t0: t };
          nextTrace = t + 3.2 + Math.random() * 3.6;
        }
        const e = t - trace.t0;
        if (e >= 0 && e < 3) {
          const reach = 1 - Math.pow(1 - Math.min(1, e / 1.3), 3);
          const fade = 1 - Math.max(0, Math.min(1, (e - 1.9) / 1.1));
          ctx.beginPath();
          for (let x = 0; x <= span * reach; x += 5) {
            const y = lineY(trace.line, x);
            if (x) ctx.lineTo(xs + x, y);
            else ctx.moveTo(xs + x, y);
          }
          ctx.strokeStyle = `rgba(255,32,40,${(0.8 * fade).toFixed(3)})`;
          ctx.lineWidth = 1.4;
          ctx.stroke();
        }
      }
      if (visible && !still) raf = requestAnimationFrame(frame);
    }
    return () => {
      ro.disconnect();
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, []);

  const s = SAYS[say];
  return (
    <div className="cv">
      <canvas ref={ref} className="cv-canvas" aria-hidden="true" />
      <div className={`cv-box ${s.bad ? "is-bad" : ""}`} ref={box} aria-hidden="true">
        <span>
          <Decode text={s.lines[0]} run ms={520} />
        </span>
        <b>
          <Decode text={s.lines[1]} run ms={620} />
        </b>
        <span className="cv-verdict">
          <Decode text={s.lines[2]} run ms={720} />
        </span>
      </div>
      <p className="sr-only">Every operation is checked by your contract before it moves.</p>
    </div>
  );
}
