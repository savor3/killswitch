// "Killswitch is a ceiling on loss." A pinned frame walks one wallet through four moments while the page
// scrolls. The field behind the card is the wallet: 1,000 squares, one per USDC. Bright squares are what the
// agents may still spend today; dim ones are out of their reach; spent ones are gone. Figures follow the
// project's attack run (scripts/demo.ts): Trading bot 100 USDC a day, Payments bot 50 USDC a day.
// The field is alive: each change sweeps across it as a wave, a faint light drifts over it now and then,
// and the squares under the pointer light up and fade behind it.
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { reduceMotion, useScrollFrame } from "../lib/motion";
import { WordReveal } from "./WordReveal";

type Row = [string, string, boolean?];
const STEPS: { tag: string; title: string; desc: string; rows: Row[] }[] = [
  {
    tag: "Grant",
    title: "You give each agent a budget, not your keys.",
    desc: "Each agent gets its own session key with a daily cap and an end date. Your main key never leaves your wallet.",
    rows: [
      ["Trading bot", "100.00 USDC a day"],
      ["Payments bot", "50.00 USDC a day"],
      ["Out of their reach", "850.00 USDC"],
    ],
  },
  {
    tag: "Spend",
    title: "They spend inside the line.",
    desc: "Every operation is checked on-chain before it moves. Above the co-sign line, the guardian has to sign as well.",
    rows: [
      ["Swap 20.00 USDC for WETH", "Allowed"],
      ["Swap 60.00 USDC for WETH", "Co-signed"],
      ["Left to spend today", "70.00 USDC"],
    ],
  },
  {
    tag: "Attack",
    title: "When one reaches for more, the contract says no.",
    desc: "An injected instruction tells the Trading bot to send 920 USDC to a stranger. The contract reverts it, and the guardian pauses the bot.",
    rows: [
      ["Send 920.00 USDC to 0x15d3⁠…⁠6A65", "Reverted", true],
      ["Why", "Not on its allowlist"],
      ["Guardian", "Trading bot paused"],
    ],
  },
  {
    tag: "Stop",
    title: "Stopped. Nothing else can leave the wallet.",
    desc: "killAll() voids every session key in one transaction. Nothing moves again until you grant a new budget.",
    rows: [
      ["killAll()", "Signed in your wallet"],
      ["Agents that can still spend", "0"],
      ["Your funds", "Never moved"],
    ],
  },
];

// what each square shows at each step: the budget is the last stretch of the wallet
const N = 1000;
type Look = { bright: [number, number] | null; goneFrom: number; flash?: [number, number] };
const LOOKS: Look[] = [
  { bright: [850, 1000], goneFrom: 1000 },
  { bright: [850, 920], goneFrom: 920 },
  { bright: [870, 920], goneFrom: 920, flash: [0, 920] },
  { bright: null, goneFrom: 920, flash: [870, 920] },
];

export function Story() {
  const pin = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState(0);

  useScrollFrame(() => {
    const el = pin.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const total = r.height - window.innerHeight;
    const p = total > 0 ? Math.min(1, Math.max(0, -r.top / total)) : 0;
    const s = Math.min(STEPS.length - 1, Math.floor(p * STEPS.length));
    setStep((cur) => (cur === s ? cur : s));
    bar.current?.style.setProperty("--p", String(p * STEPS.length - s));
  });

  return (
    <section className="story" id="loss" aria-labelledby="story-h2">
      <header className="story-head">
        <WordReveal as="h2" id="story-h2" className="h2" text="Killswitch is a ceiling on loss." />
        <WordReveal className="sub story-sub" text="An agent gets a permission, not a key. The limit lives in a contract *you* *own.*" />
      </header>
      <div className="story-pin" ref={pin} style={{ "--steps": STEPS.length } as CSSProperties}>
        <div className="story-sticky">
          <div className="story-frame" data-rv="scale">
            <Field step={step} />
            <div className="story-cards">
              {STEPS.map((s, i) => (
                <article key={s.tag} className={`scard ${i === step ? "is-on" : i < step ? "is-past" : ""}`} aria-hidden={i !== step}>
                  <div className="scard-tag">
                    <span>/{i + 1}</span> {s.tag}
                  </div>
                  <h3 className="scard-title">{s.title}</h3>
                  <p className="scard-desc">{s.desc}</p>
                  <dl className="scard-rows">
                    {s.rows.map(([k, v, bad], r) => (
                      <div key={k} className={bad ? "is-bad" : ""} style={{ "--r": r } as CSSProperties}>
                        <dt>{k}</dt>
                        <dd>{v}</dd>
                      </div>
                    ))}
                  </dl>
                </article>
              ))}
            </div>
            <div className="story-progress" ref={bar}>
              {STEPS.map((s, i) => (
                <span key={s.tag} className={i < step ? "is-done" : i === step ? "is-on" : ""}>
                  <i />
                  {s.tag}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

const WAVE_MS = 7; // per column plus row: a change crosses the wallet as a diagonal wave in about half a second
const SCAN_MS = 6500; // a faint light drifts across the field once in this time
const HOVER_R = 120; // px around the pointer that light up

/** The wallet as a field of squares on a canvas: each step's look sweeps in as a wave; the field also
 * answers the pointer and carries a faint drifting light while it is on screen. */
function Field({ step }: { step: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const stepRef = useRef(step);
  const prevRef = useRef(step);
  const flashAt = useRef(0);
  const kick = useRef<() => void>(() => {});
  useEffect(() => {
    if (stepRef.current !== step) prevRef.current = stepRef.current;
    stepRef.current = step;
    flashAt.current = performance.now();
    kick.current();
  }, [step]);

  useEffect(() => {
    const c = ref.current!;
    const ctx = c.getContext("2d")!;
    const host = c.parentElement as HTMLElement;
    const cur = new Float32Array(N).fill(0.12); // brightness 0..1
    const heat = new Float32Array(N); // the pointer's light, fading
    const still = reduceMotion();
    let raf = 0;
    let last = performance.now();
    let visible = false;
    let px = -1e4;
    let py = -1e4;
    const start = () => {
      if (visible && !raf) {
        last = performance.now();
        raf = requestAnimationFrame(frame);
      }
    };
    kick.current = start;
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible) start();
    });
    io.observe(c);
    const ro = new ResizeObserver(start);
    ro.observe(c);
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    const onMove = (e: PointerEvent) => {
      if (still || !fine) return;
      const r = c.getBoundingClientRect();
      px = e.clientX - r.left;
      py = e.clientY - r.top;
      start();
    };
    const onLeave = () => {
      px = py = -1e4;
    };
    host.addEventListener("pointermove", onMove);
    host.addEventListener("pointerleave", onLeave);

    function frame(now: number) {
      raf = 0;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = c.clientWidth;
      const h = c.clientHeight;
      let busy = !still; // the drifting light keeps the field moving while it is on screen
      if (w && h) {
        if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
          c.width = Math.round(w * dpr);
          c.height = Math.round(h * dpr);
        }
        const look = LOOKS[stepRef.current];
        const before = LOOKS[prevRef.current];
        const since = now - flashAt.current;
        const cols = Math.max(10, Math.round(Math.sqrt((N * w) / h)));
        const rows = Math.ceil(N / cols);
        const pitch = Math.min(w / cols, h / rows);
        const size = Math.max(1, Math.round(pitch * 0.66 * dpr) / dpr);
        const ox = (w - pitch * cols) / 2;
        const oy = (h - pitch * rows) / 2;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, h);
        const k = still ? 1 : 1 - Math.exp(-dt * 9);
        const cool = Math.exp(-dt * 2.4);
        // the drifting light: a soft diagonal band, crossing the field and resting off it between passes
        const span = cols + rows;
        const scanPos = ((now % SCAN_MS) / SCAN_MS) * span * 1.6 - span * 0.3;
        for (let i = 0; i < N; i++) {
          const col = i % cols;
          const row = (i / cols) | 0;
          const lk = still || since >= (col + row) * WAVE_MS ? look : before;
          const gone = i >= lk.goneFrom;
          const bright = lk.bright && i >= lk.bright[0] && i < lk.bright[1];
          const target = gone ? 0.03 : bright ? 0.95 : 0.1;
          cur[i] += (target - cur[i]) * k;
          const x = Math.round((ox + col * pitch) * dpr) / dpr;
          const y = Math.round((oy + row * pitch) * dpr) / dpr;
          let hv = heat[i] * cool;
          if (px > -1e3) {
            const dx = x + size / 2 - px;
            const dy = y + size / 2 - py;
            const d = Math.sqrt(dx * dx + dy * dy);
            if (d < HOVER_R) hv = Math.max(hv, (1 - d / HOVER_R) ** 1.6);
          }
          heat[i] = hv < 0.004 ? 0 : hv;
          if (heat[i] > 0) busy = true;
          let r = 0;
          if (look.flash && i >= look.flash[0] && i < look.flash[1] && !still) {
            // the reach travels backwards from the end of the wallet, then fades
            const fspan = look.flash[1] - look.flash[0];
            const delay = ((look.flash[1] - 1 - i) / Math.max(1, fspan)) * 520 + 250;
            const t = since - delay;
            r = t < 0 ? 0 : t < 450 ? 1 : Math.max(0, 1 - (t - 450) / 650);
            if (t < 1100) busy = true;
          }
          const sd = col + row - scanPos;
          const scan = still ? 0 : Math.exp(-(sd * sd) / 22) * (gone ? 0.04 : 0.09);
          const lum = Math.min(1, cur[i] + heat[i] * 0.5 + scan);
          if (r > 0.01) ctx.fillStyle = `rgba(255,32,40,${Math.max(r, lum).toFixed(3)})`;
          else ctx.fillStyle = `rgba(255,255,255,${lum.toFixed(3)})`;
          ctx.fillRect(x, y, size, size);
        }
      }
      if (visible && busy) raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    return () => {
      io.disconnect();
      ro.disconnect();
      host.removeEventListener("pointermove", onMove);
      host.removeEventListener("pointerleave", onLeave);
      cancelAnimationFrame(raf);
    };
  }, []);

  return <canvas ref={ref} className="story-field" aria-hidden="true" />;
}
