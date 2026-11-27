// "One operation, start to finish", drawn as the canvas of a node editor: the runs in a sidebar, a toolbar,
// the stations of one agent operation (whitepaper chapter 6) as nodes on a dotted grid, the station's own
// data in an inspector and the relay's lines in a log. Four runs, all with figures from the attack run
// (scripts/demo.ts) and the real messages of the relay, the guardian and the contract.
//
// The operation is a red square that moves like a thing with weight: it gathers speed out of a station,
// cruises, slows into the next one and sinks into it. The station then works on it (its fill sweeps across
// from the side the square came in by: five steps for the contract's five checks, a slow count for the
// guardian's score) and the square comes out of the far side. Each run tells its own story: one passes,
// one waits for your signature, one is stopped inside the guardian, which then pauses the agent on-chain,
// and one goes round our servers and is thrown back by the contract. One clock drives a run; every frame
// is drawn from it, so the square never jumps.
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { reduceMotion, useInView } from "../lib/motion";
import { WordReveal } from "./WordReveal";

// ------------------------------------------------------------------ the runs
type Check = [string, "ok" | "bad" | "off"];
type NodeId = "agent" | "key" | "guard" | "you" | "wallet" | "chain";
type EdgeId = "e1" | "e2" | "e3" | "e4" | "e5" | "e6" | "e7";
type Pt = [number, number];
/** pass: works on it and lets it through; hold: waits for the owner, then lets it through; fail: stops it
 * for good; end: it settles there */
type Mode = "pass" | "hold" | "fail" | "end";
/** One station on the way: reached along `via`, worked on for `ms`; `mark` is when a hold is approved or
 * a refusal lands, in ms from arrival. */
type Step = { node: NodeId; ms: number; mode: Mode; via?: EdgeId; mark?: number };
type Run = {
  tab: string;
  ask: string; // what the agent asks for, typed out over it as the run starts
  bypass?: boolean; // the guardian and you are skipped
  agent: { who: string; what: string; said?: string };
  key: { agentId: string; callsHash: string; nonce: number; signer: string };
  guardian:
    | { outflow?: string; revert?: string; signals: [string, string][]; score: number; verdict: string; bad?: boolean }
    | { skipped: string };
  you: { none: string } | { approve: string } | { skipped: string };
  contract: { checks: Check[]; result: string; bad?: boolean } | { never: string; sub: string };
  outcome: string;
  bad?: boolean;
  script: Step[];
  /** after a refusal: a signal along this edge, and the stations it stops when it lands */
  signal?: { edge: EdgeId; stops: NodeId[] };
  labels: Partial<Record<EdgeId, string>>;
};

const CHECK_MS = 300; // the wallet contract runs its five checks one after another, this long each

const RUNS: Run[] = [
  {
    tab: "Honest swap",
    ask: "swap 20 USDC for WETH",
    agent: { who: "Trading bot", what: "Swap 20.00 USDC for WETH", said: "Weekly DCA: buy ETH with 20 USDC" },
    key: { agentId: "0x7a3f…c91e", callsHash: "0x41d2…9b07", nonce: 7, signer: "0x5888…61ac" },
    guardian: { outflow: "−20.00 USDC", signals: [], score: 0, verdict: "Allow" },
    you: { none: "Nothing to approve." },
    contract: {
      checks: [["Agent is live", "ok"], ["Calls are allowed", "ok"], ["Outflow measured: 20.00", "ok"], ["Within cap: 20.00 of 100.00", "ok"], ["No leftover approvals", "ok"]],
      result: "Executed · tx 0x9c2e…41ab",
    },
    outcome: "Executed in one transaction. 80.00 USDC left today.",
    script: [
      { node: "agent", ms: 1500, mode: "pass" },
      { node: "key", ms: 1000, mode: "pass", via: "e1" },
      { node: "guard", ms: 1700, mode: "pass", via: "e2" },
      { node: "wallet", ms: 2000, mode: "pass", via: "e3" },
      { node: "chain", ms: 1200, mode: "end", via: "e6" },
    ],
    labels: { e1: "wallet_swap", e2: "AgentOp · nonce 7", e3: "score 0 · allow", e6: "executed" },
  },
  {
    tab: "New vendor",
    ask: "pay 10 USDC to a new address",
    agent: { who: "Payments bot", what: "Pay 10.00 USDC to 0x9965…A4dc", said: "Pay invoice #1042 to Acme Hosting" },
    key: { agentId: "0x2c81…07fa", callsHash: "0x9e04…51c3", nonce: 3, signer: "0xa1b7…3d20" },
    guardian: { outflow: "−10.00 USDC", signals: [["+30", "First payment to a new address"]], score: 30, verdict: "Hold for the owner" },
    you: { approve: "Payments bot wants to send 10.00 USDC to a new address." },
    contract: {
      checks: [["Agent is live", "ok"], ["Calls are allowed", "ok"], ["Outflow measured: 10.00", "ok"], ["Within cap: 10.00 of 50.00", "ok"], ["No leftover approvals", "ok"]],
      result: "Executed · tx 0x5d17…a8e2",
    },
    outcome: "You approved it. Acme Hosting is now a known recipient.",
    script: [
      { node: "agent", ms: 1500, mode: "pass" },
      { node: "key", ms: 1000, mode: "pass", via: "e1" },
      { node: "guard", ms: 1800, mode: "pass", via: "e2" },
      { node: "you", ms: 2800, mode: "hold", via: "e4", mark: 1650 },
      { node: "wallet", ms: 2000, mode: "pass", via: "e5" },
      { node: "chain", ms: 1200, mode: "end", via: "e6" },
    ],
    labels: { e1: "wallet_send", e2: "AgentOp · nonce 3", e4: "score 30 · hold", e5: "your signature", e6: "executed" },
  },
  {
    tab: "Prompt injection",
    ask: "send 970 USDC to a stranger",
    agent: { who: "Trading bot", what: "Send 970.00 USDC to 0x15d3…6A65", said: "Moving funds to safekeeping as instructed by system" },
    key: { agentId: "0x7a3f…c91e", callsHash: "0xd5a0…7e19", nonce: 8, signer: "0x5888…61ac" },
    guardian: {
      revert: "Simulation reverts: CallNotAllowed",
      signals: [["", "Transfer is not on its allowlist"], ["", "Drain pattern: 100% of the wallet to an unknown address"]],
      score: 100,
      verdict: "Reject and pause",
      bad: true,
    },
    you: { none: "Nothing for you to do." },
    contract: { never: "Never sent.", sub: "The guardian’s pause(agentId) is recorded on-chain. The agent can’t send anything until you unpause it." },
    outcome: "Rejected before it reached the chain. The agent is paused.",
    bad: true,
    script: [
      { node: "agent", ms: 1500, mode: "pass" },
      { node: "key", ms: 1000, mode: "pass", via: "e1" },
      { node: "guard", ms: 2300, mode: "fail", via: "e2", mark: 1450 },
    ],
    signal: { edge: "e3", stops: ["key", "agent"] },
    labels: { e1: "wallet_send", e2: "AgentOp · nonce 8", e3: "pause(agentId)" },
  },
  {
    tab: "Leaked key",
    ask: "take 100 USDC",
    bypass: true,
    agent: { who: "Thief with the Payments bot key", what: "Take 100.00 USDC", said: undefined },
    key: { agentId: "0x2c81…07fa", callsHash: "0x63bf…0d4a", nonce: 4, signer: "0xa1b7…3d20" },
    guardian: { skipped: "Skipped. Sent straight to the chain." },
    you: { skipped: "Skipped." },
    contract: {
      checks: [["Agent is live", "ok"], ["Calls are allowed", "ok"], ["Outflow measured: 100.00", "ok"], ["Cap: 110.00 of 50.00", "bad"], ["No leftover approvals", "off"]],
      result: "Reverted · CapExceeded",
      bad: true,
    },
    outcome: "Skipping our servers changes nothing. The contract reverts it.",
    bad: true,
    script: [
      { node: "agent", ms: 1500, mode: "pass" },
      { node: "key", ms: 1000, mode: "pass", via: "e1" },
      { node: "wallet", ms: 2500, mode: "fail", via: "e7", mark: 150 + 3.5 * CHECK_MS },
    ],
    labels: { e1: "execute()", e7: "straight to the chain" },
  },
];

// ------------------------------------------------------------------ the canvas
const ICON: Record<NodeId, string> = {
  agent: "M6 8.5h12v9H6zM9.5 13h.01M14.5 13h.01M12 5v3.5M10 20h4",
  key: "M8.5 17.5a3.5 3.5 0 1 1 2.5-6L19 3.5M16 6.5l2.5 2.5M13.5 9l2 2",
  guard: "M12 3.2l7.6 2.9v5.8c0 4.4-3.2 8-7.6 8.9-4.4-.9-7.6-4.5-7.6-8.9V6.1z",
  you: "M12 11.5a3.3 3.3 0 1 0 0-6.6 3.3 3.3 0 0 0 0 6.6zM5.5 19.5c1.2-3.3 3.6-5 6.5-5s5.3 1.7 6.5 5",
  wallet: "M7 3.5h7l4 4v13H7zM14 3.5v4h4M9.5 12h6M9.5 15.5h6",
  chain: "M12 3.5l7.5 4.2v8.6L12 20.5l-7.5-4.2V7.7zM12 12l7.5-4.3M12 12v8.5M12 12L4.5 7.7",
};
const NODES: { id: NodeId; name: string; sub: string }[] = [
  { id: "agent", name: "Agent", sub: "Asks, with a reason" },
  { id: "key", name: "Session key", sub: "Signs these calls only" },
  { id: "guard", name: "Guardian", sub: "Simulates and scores" },
  { id: "you", name: "You", sub: "Approves the unusual" },
  { id: "wallet", name: "Wallet contract", sub: "Enforces the limits" },
  { id: "chain", name: "Base", sub: "Settles" },
];
const PANEL: Record<NodeId, number> = { agent: 0, key: 1, guard: 2, you: 3, wallet: 4, chain: 4 };

type Layout = {
  w: number;
  h: number;
  side: "below" | "left";
  pos: Record<NodeId, Pt>;
  edges: Record<EdgeId, string>;
  label: Partial<Record<EdgeId, [number, number, "start" | "middle" | "end"]>>; // an edge without a place has no label
};
// wide screens: left to right; the owner's detour branches off the guardian's output and joins the wallet
// contract's input, below the line; the leaked key's bypass arcs over the top
const WIDE: Layout = {
  w: 1000,
  h: 384,
  side: "below",
  pos: { agent: [80, 160], key: [255, 160], guard: [430, 160], you: [610, 300], wallet: [790, 160], chain: [930, 160] },
  edges: {
    e1: "M108 160H227",
    e2: "M283 160H402",
    e3: "M458 160H762",
    e4: "M458 160C506 160 524 300 582 300",
    e5: "M638 300C696 300 714 160 762 160",
    e6: "M818 160H902",
    e7: "M255 132C255 40 790 40 790 132",
  },
  label: {
    e1: [167, 150, "middle"],
    e2: [342, 150, "middle"],
    e3: [610, 150, "middle"],
    e4: [502, 248, "end"],
    e5: [718, 248, "start"],
    e6: [860, 150, "middle"],
    e7: [522, 52, "middle"],
  },
};
// phones: top to bottom, the allow and bypass routes arcing round the right
const TALL: Layout = {
  w: 360,
  h: 680,
  side: "left",
  pos: { agent: [250, 46], key: [250, 156], guard: [250, 266], you: [250, 386], wallet: [250, 506], chain: [250, 622] },
  edges: {
    e1: "M250 74V128",
    e2: "M250 184V238",
    e3: "M278 266C330 266 330 506 278 506",
    e4: "M250 294V358",
    e5: "M250 414V478",
    e6: "M250 534V594",
    e7: "M278 156C352 156 352 506 278 506",
  },
  label: {
    e1: [238, 105, "end"],
    e2: [238, 215, "end"],
    e4: [238, 330, "end"],
    e5: [238, 450, "end"],
    e6: [238, 568, "end"],
  },
};

function useNarrow() {
  const [narrow, setNarrow] = useState(() => window.matchMedia("(max-width: 760px)").matches);
  useEffect(() => {
    const m = window.matchMedia("(max-width: 760px)");
    const on = () => setNarrow(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return narrow;
}

// ------------------------------------------------------------------ the clock of a run
const SPEED = 0.16; // canvas units a millisecond: about 170 px a second on a wide screen
const SINK = 320; // ms for the square to sink into a station
const RISE = 320; // ms for it to come out of the far side
const OUTRO = 3600; // ms the outcome stays before the next run
const GHOST_MS = 55; // the square's fading copies, this far behind it in time

type Side = "l" | "r" | "t" | "b";
type InSeg = { kind: "in"; node: NodeId; t0: number; t1: number; mode: Mode; mark: number; enter: Pt | null; exit: Pt | null; from: Side };
type GoSeg = { kind: "go"; edge: EdgeId; t0: number; t1: number; len: number };
type SigSeg = { kind: "sig"; edge: EdgeId; t0: number; t1: number; len: number };
type Seg = InSeg | GoSeg | SigSeg;
type Plan = { segs: Seg[]; stops: number; outcome: number; total: number; pausedAt: number; events: number[] };

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const io = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const out = (x: number) => 1 - Math.pow(1 - x, 3);
/** Distance along a leg for a share of its time: speeds up, cruises, slows down, like a thing with weight. */
function travel(u: number, a = 0.3) {
  const v = 1 / (1 - a);
  if (u <= 0) return 0;
  if (u >= 1) return 1;
  if (u < a) return (0.5 * v * u * u) / a;
  if (u > 1 - a) return 1 - (0.5 * v * (1 - u) * (1 - u)) / a;
  return 0.5 * v * a + v * (u - a);
}
const sideOf = (c: Pt, p: Pt): Side => {
  const dx = p[0] - c[0];
  const dy = p[1] - c[1];
  return Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? "l" : "r") : dy < 0 ? "t" : "b";
};
const OPP: Record<Side, Side> = { l: "r", r: "l", t: "b", b: "t" };
const unit = (from: Pt, to: Pt): Pt => {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const d = Math.hypot(dx, dy) || 1;
  return [dx / d, dy / d];
};

function plan(r: Run, L: Layout, paths: Partial<Record<EdgeId, SVGPathElement | null>>): Plan | null {
  const len = (e: EdgeId) => paths[e]?.getTotalLength() ?? 0;
  const end = (e: EdgeId, at: 0 | 1): Pt => {
    const el = paths[e]!;
    const p = el.getPointAtLength(at ? el.getTotalLength() : 0);
    return [p.x, p.y];
  };
  if (r.script.some((s) => s.via && !paths[s.via])) return null;
  const segs: Seg[] = [];
  let t = 0;
  r.script.forEach((s, i) => {
    if (s.via) {
      const l = len(s.via);
      const d = Math.min(2300, Math.max(800, l / SPEED));
      segs.push({ kind: "go", edge: s.via, t0: t, t1: t + d, len: l });
      t += d;
    }
    const next = r.script[i + 1]?.via;
    const enter = s.via ? end(s.via, 1) : null;
    const exit = next ? end(next, 0) : null;
    const c = L.pos[s.node];
    const from = enter ? sideOf(c, enter) : exit ? OPP[sideOf(c, exit)] : "l";
    segs.push({ kind: "in", node: s.node, t0: t, t1: t + s.ms, mode: s.mode, mark: t + (s.mark ?? s.ms), enter, exit, from });
    t += s.ms;
  });
  let pausedAt = Infinity;
  if (r.signal) {
    const l = len(r.signal.edge);
    const t0 = t - 500;
    const t1 = t0 + Math.max(900, l / (SPEED * 1.5));
    segs.push({ kind: "sig", edge: r.signal.edge, t0, t1, len: l });
    pausedAt = t1 + 380;
    t = pausedAt + 500;
  }
  const outcome = t + 250;
  const events = new Set<number>([0, outcome]);
  for (const s of segs) {
    events.add(s.t0);
    events.add(s.t1);
    if (s.kind === "in") events.add(s.mark);
  }
  if (isFinite(pausedAt)) events.add(pausedAt);
  // the bypass passes over the guardian halfway along its arc
  const by = segs.find((s): s is GoSeg => s.kind === "go" && s.edge === "e7");
  if (by) events.add((by.t0 + by.t1) / 2);
  return { segs, stops: t, outcome, total: outcome + OUTRO, pausedAt, events: [...events].sort((a, b) => a - b) };
}

/** How full a station is: it fills from the side the square came in by while it works on it. */
function fillOf(s: InSeg, t: number) {
  if (t <= s.t0) return 0;
  if (t >= s.t1 || (s.mode === "fail" && t >= s.mark)) return 1;
  const a = s.t0 + (s.enter ? SINK * 0.5 : 150);
  if (s.node === "wallet") {
    // five checks, one after another
    const x = Math.max(0, Math.min(5, (t - a) / CHECK_MS));
    const i = Math.floor(x);
    return Math.min(1, (i + io(x - i)) / 5);
  }
  if (s.mode === "hold") {
    // half full on arrival, held there while it waits for you, the rest once you approve
    if (t < s.mark) return 0.5 * io(clamp01((t - a) / 700));
    return 0.5 + 0.5 * io(clamp01((t - s.mark) / Math.max(1, s.t1 - RISE * 0.6 - s.mark)));
  }
  const e = s.mode === "fail" ? s.mark : s.mode === "end" ? s.t1 - 120 : s.t1 - RISE * 0.6;
  return io(clamp01((t - a) / Math.max(1, e - a)));
}

// ------------------------------------------------------------------ the section
export function Workflow() {
  const frame = useRef<HTMLDivElement>(null);
  const inView = useInView(frame, 0.25);
  const [run, setRun] = useState(0);
  const [round, setRound] = useState(0); // restarts a run when it is picked again
  const [held, setHeld] = useState(false);
  const heldRef = useRef(false);
  heldRef.current = held;
  const L = useNarrow() ? TALL : WIDE;
  const r = RUNS[run];
  const uid = useId().replace(/:/g, "");

  // the parts every frame moves
  const paths = useRef<Partial<Record<EdgeId, SVGPathElement | null>>>({});
  const trails = useRef<Partial<Record<EdgeId, SVGPathElement | null>>>({});
  const fills = useRef<Partial<Record<NodeId, SVGRectElement | null>>>({});
  const packet = useRef<SVGRectElement>(null);
  const ghosts = useRef<(SVGRectElement | null)[]>([]);
  const askText = useRef<SVGTextElement>(null);
  const scoreText = useRef<SVGTextElement>(null);
  const clockText = useRef<HTMLElement>(null);
  const timer = useRef<HTMLElement>(null);

  const [P, setP] = useState<Plan | null>(null);
  const planRef = useRef<Plan | null>(null);
  const clock = useRef(0);
  const [ts, setTs] = useState(0); // the time of the last event passed: what the discrete parts show
  const tsRef = useRef(0);
  const runRef = useRef(run);
  runRef.current = run;

  // a new run (or a new layout): plan its clock from the real lengths of its edges, start from zero
  useLayoutEffect(() => {
    const p = plan(r, L, paths.current);
    planRef.current = p;
    setP(p);
    // stations this run never reaches start empty
    NODES.forEach((n) => {
      const f = fills.current[n.id];
      if (f && !r.script.some((s) => s.node === n.id)) setFill(f, "l", 0);
    });
    clock.current = reduceMotion() && p ? p.outcome : 0;
    const e0 = p ? last(p.events, clock.current) : 0;
    tsRef.current = e0;
    setTs(e0);
    draw(clock.current);
  }, [run, round, L]); // eslint-disable-line react-hooks/exhaustive-deps

  // the clock runs while the canvas is on screen
  useEffect(() => {
    if (!inView || reduceMotion()) return;
    let raf = 0;
    let prev = performance.now();
    const tick = (now: number) => {
      const p = planRef.current;
      clock.current += Math.min(50, now - prev);
      prev = now;
      if (p) {
        if (clock.current >= p.total) {
          clock.current = p.total;
          if (!heldRef.current) {
            setRun((x) => (x + 1) % RUNS.length);
            return;
          }
        }
        draw(clock.current);
        const e = last(p.events, clock.current);
        if (e !== tsRef.current) {
          tsRef.current = e;
          setTs(e);
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, run, round, L]); // eslint-disable-line react-hooks/exhaustive-deps

  const pick = (i: number) => {
    setRun(i);
    setRound((n) => n + 1);
  };

  function draw(t: number) {
    const p = planRef.current;
    if (!p) return;
    let pos: Pt | null = null;
    let size = 12;
    let op = 1;
    const gh: (Pt | null)[] = [null, null, null];
    for (const s of p.segs) {
      if (s.kind === "go" || s.kind === "sig") {
        const el = paths.current[s.edge];
        const tr = trails.current[s.edge];
        if (!el) continue;
        const k = s.kind === "go" ? travel(clamp01((t - s.t0) / (s.t1 - s.t0))) : io(clamp01((t - s.t0) / (s.t1 - s.t0)));
        if (tr) {
          tr.style.strokeDasharray = `${s.len} ${s.len}`;
          tr.style.strokeDashoffset = String(s.len * (1 - k));
        }
        if (s.kind === "go" && t >= s.t0 && t < s.t1) {
          const q = el.getPointAtLength(s.len * k);
          pos = [q.x, q.y];
          for (let g = 0; g < 3; g++) {
            const tg = t - (g + 1) * GHOST_MS;
            if (tg > s.t0) {
              const qg = el.getPointAtLength(s.len * travel((tg - s.t0) / (s.t1 - s.t0)));
              gh[g] = [qg.x, qg.y];
            }
          }
        }
        continue;
      }
      const f = fills.current[s.node];
      if (f) setFill(f, s.from, fillOf(s, t));
      const c = L.pos[s.node];
      if (t < s.t0 || t >= s.t1 + 1000) continue;
      if (s.enter && t < s.t0 + SINK) {
        // sinks in: slows, shrinks and fades into the station from the side it came in by
        const q = (t - s.t0) / SINK;
        const d = unit(s.enter, c);
        const e = out(q);
        pos = [s.enter[0] + d[0] * 18 * e, s.enter[1] + d[1] * 18 * e];
        size = 12 - 9 * e;
        op = 1 - q * q;
      } else if (s.exit && (s.mode === "pass" || s.mode === "hold") && t >= s.t1 - RISE && t < s.t1) {
        // comes out of the far side, growing back to full size as it leaves
        const q = (t - (s.t1 - RISE)) / RISE;
        const d = unit(c, s.exit);
        const e = io(q);
        pos = [s.exit[0] - d[0] * 18 * (1 - e), s.exit[1] - d[1] * 18 * (1 - e)];
        size = 3 + 9 * e;
        op = Math.min(1, q * 4);
      } else if (s.mode === "fail" && s.enter && t >= s.mark && t < s.mark + 950) {
        // refused: thrown back out the way it came, then it flickers out like the loader's square
        const q = (t - s.mark) / 950;
        const d = unit(c, s.enter);
        const e = out(Math.min(1, q * 3));
        pos = [s.enter[0] + d[0] * 16 * e, s.enter[1] + d[1] * 16 * e];
        op = q < 0.3 ? 1 : q < 0.4 ? 0 : q < 0.5 ? 1 : q < 0.6 ? 0 : q < 0.68 ? 1 : 0;
      }
    }
    const pk = packet.current;
    if (pk) {
      if (pos && op > 0.01) {
        pk.setAttribute("x", String(pos[0] - size / 2));
        pk.setAttribute("y", String(pos[1] - size / 2));
        pk.setAttribute("width", String(size));
        pk.setAttribute("height", String(size));
        pk.style.opacity = String(op);
      } else pk.style.opacity = "0";
    }
    gh.forEach((g, i) => {
      const el = ghosts.current[i];
      if (!el) return;
      if (!g) {
        el.style.opacity = "0";
        return;
      }
      const s = 10 - i * 2;
      el.setAttribute("x", String(g[0] - s / 2));
      el.setAttribute("y", String(g[1] - s / 2));
      el.setAttribute("width", String(s));
      el.setAttribute("height", String(s));
      el.style.opacity = String([0.42, 0.24, 0.12][i]);
    });
    // what the agent asks, typed out while it composes the operation
    const ag = p.segs.find((s): s is InSeg => s.kind === "in" && s.node === "agent");
    if (askText.current && ag) {
      const run = RUNS[runRef.current];
      const n = Math.round(run.ask.length * clamp01((t - 120) / ((ag.t1 - ag.t0) * 0.7)));
      if (askText.current.textContent !== run.ask.slice(0, n)) askText.current.textContent = run.ask.slice(0, n);
    }
    // the guardian's score counts up while it simulates
    const gs = p.segs.find((s): s is InSeg => s.kind === "in" && s.node === "guard");
    const g = RUNS[runRef.current].guardian;
    if (scoreText.current && gs && "score" in g) {
      const a = gs.t0 + SINK * 0.5;
      const e = gs.mode === "fail" ? gs.mark : gs.t1 - RISE;
      const n = Math.round(g.score * out(clamp01((t - a) / Math.max(1, e - a))));
      scoreText.current.textContent = `score ${n}`;
    }
    if (clockText.current) clockText.current.textContent = `+${(Math.min(t, p.stops) / 1000).toFixed(1)}s`;
    if (timer.current) timer.current.style.transform = `scaleX(${clamp01(t / p.total)})`;
  }

  // ---------------------------------------------------------------- what the discrete parts show at `ts`
  const segIn = (n: NodeId) => P?.segs.find((s): s is InSeg => s.kind === "in" && s.node === n);
  const segGo = (e: EdgeId) => P?.segs.find((s): s is GoSeg => s.kind === "go" && s.edge === e);
  const sig = P?.segs.find((s): s is SigSeg => s.kind === "sig");
  const pausedAt = P?.pausedAt ?? Infinity;
  type NodeState = "idle" | "busy" | "waiting" | "done" | "bad" | "paused" | "noted" | "skip";
  const nodeState = (n: NodeId): NodeState => {
    if (r.bypass && (n === "guard" || n === "you")) return "skip";
    if (r.signal?.stops.includes(n) && ts >= pausedAt) return "paused";
    if (sig && n === "wallet" && ts >= sig.t1) return "noted";
    const s = segIn(n);
    if (!s || ts < s.t0) return "idle";
    if (s.mode === "fail" && ts >= s.mark) return "bad";
    if (ts < s.t1) return s.mode === "hold" && ts < s.mark ? "waiting" : "busy";
    return "done";
  };
  const edgeState = (e: EdgeId) => {
    if (sig?.edge === e) return ts >= sig.t1 ? "bad" : ts >= sig.t0 ? "sig" : "idle";
    const g = segGo(e);
    if (!g) return e === "e7" && !r.bypass ? "gone" : "idle";
    return ts < g.t0 ? "idle" : ts < g.t1 ? "run" : "on";
  };
  const badgeOf = (st: NodeState): "ok" | "bad" | "pause" | null =>
    st === "done" ? "ok" : st === "bad" ? "bad" : st === "paused" || st === "noted" ? "pause" : null;

  // the inspector follows the square; the outcome takes over at the end
  let insp: NodeId | "outcome" = "agent";
  for (const s of P?.segs ?? []) if (s.kind === "in" && ts >= s.t0) insp = s.node;
  if (sig && ts >= sig.t1) insp = "wallet";
  if (P && ts >= P.outcome) insp = "outcome";
  const node = NODES.find((n) => n.id === (insp === "outcome" ? "chain" : insp))!;
  const panelKey = insp === "outcome" ? 5 : PANEL[insp];

  const g = r.guardian;
  const guardSeg = segIn("guard");
  const showScore = "score" in g && guardSeg && ts >= guardSeg.t0;
  const finalScore = "score" in g ? g.score : 0;
  const scoreTone = !("score" in g) || !guardSeg ? "" : ts >= guardSeg.mark || ts >= guardSeg.t1 ? (finalScore >= 70 ? "is-high" : finalScore >= 30 ? "is-mid" : "") : "";

  // ports where the edges of this run meet the stations
  const ports = (id: NodeId): Pt[] => {
    const c = L.pos[id];
    const acc: Pt[] = [];
    (Object.keys(L.edges) as EdgeId[]).forEach((e) => {
      if (edgeState(e) === "gone") return;
      const d = L.edges[e];
      const nums = d.match(/-?\d+(\.\d+)?/g)!.map(Number);
      const ends: Pt[] = [
        [nums[0], nums[1]],
        d.includes("H") || d.includes("V")
          ? d.includes("H")
            ? [nums[2], nums[1]]
            : [nums[0], nums[2]]
          : [nums[nums.length - 2], nums[nums.length - 1]],
      ];
      ends.forEach(([x, y]) => {
        const p: Pt = [x - c[0], y - c[1]];
        if (Math.abs(p[0]) <= 29 && Math.abs(p[1]) <= 29 && !acc.some((o) => o[0] === p[0] && o[1] === p[1])) acc.push(p);
      });
    });
    return acc;
  };

  const lines = P ? logLines(r, P).filter((l) => ts >= l.at) : [];
  const checkMs = CHECK_MS;

  return (
    <section className="wf" id="how" aria-labelledby="wf-h">
      <header className="wf-head">
        <WordReveal as="h2" id="wf-h" className="h2" text="One operation, start to finish." />
        <WordReveal
          className="sub wf-sub"
          text={"Every agent action passes two gates:\na guardian that judges it,\nand a contract that *enforces~it.*"}
        />
      </header>

      <div className={`wfc ${r.bad ? "is-bad" : ""}`} ref={frame} data-rv="up">
        <aside className="wfc-side" onMouseEnter={() => setHeld(true)} onMouseLeave={() => setHeld(false)}>
          <span className="wfc-label">Operations</span>
          <div className="wfc-runs" role="tablist" aria-label="Example operations">
            {RUNS.map((x, i) => (
              <button key={x.tab} type="button" role="tab" aria-selected={i === run} className={i === run ? "is-on" : ""} onClick={() => pick(i)}>
                <b>{x.tab}</b>
                <span>{x.bypass ? "Thief" : x.agent.who}</span>
                {i === run && <i className="wf-timer" ref={timer} />}
              </button>
            ))}
          </div>
          <div className="wfc-hatch" aria-hidden="true" />
          <span className="wfc-hint">{held ? "Held while you look." : "Pick one to replay it."}</span>
        </aside>

        <div className="wfc-bar">
          <span className="wfc-chip">
            <em>Run</em>
            {r.tab}
          </span>
          <span className="wfc-chip">
            <em>Agent</em>
            {r.bypass ? "Thief" : r.agent.who}
          </span>
          <span className="wfc-chip wfc-net">
            <em>Network</em>Base Sepolia
          </span>
          <span className="wfc-clock">
            <em>Replay</em>
            <b ref={clockText}>+0.0s</b>
          </span>
        </div>

        <div className="wfc-graph">
          <svg className="wfc-svg" viewBox={`0 0 ${L.w} ${L.h}`} role="img" aria-label={`${r.tab}: ${r.outcome}`}>
            <defs>
              <clipPath id={`${uid}-box`}>
                <rect x={-28} y={-28} width={56} height={56} rx={13} />
              </clipPath>
            </defs>
            {(Object.keys(L.edges) as EdgeId[]).map((id) => {
              const st = edgeState(id);
              const place = L.label[id];
              const label = place ? r.labels[id] : undefined;
              const [lx, ly, anchor] = place ?? [0, 0, "middle"];
              return (
                <g key={`${id}-${run}-${round}`} className={`wfc-e is-${st} ${id === "e7" ? "is-bypass" : ""}`}>
                  <path
                    className="wfc-line"
                    ref={(el) => {
                      paths.current[id] = el;
                    }}
                    d={L.edges[id]}
                  />
                  {/* the stretch the square has travelled, drawn red behind it; it fades into the white route */}
                  <path
                    className="wfc-trail"
                    ref={(el) => {
                      trails.current[id] = el;
                    }}
                    d={L.edges[id]}
                  />
                  {label && st !== "idle" && st !== "gone" && (
                    <text x={lx} y={ly} textAnchor={anchor}>
                      {label}
                    </text>
                  )}
                </g>
              );
            })}
            {NODES.map((n) => {
              const [x, y] = L.pos[n.id];
              const st = nodeState(n.id);
              const sub = n.id === "agent" ? (r.bypass ? "Thief with its key" : r.agent.who) : n.sub;
              const below = L.side === "below";
              const b = badgeOf(st);
              const thief = r.bypass && n.id === "agent";
              return (
                <g key={n.id} className={`wfc-n is-${st} ${thief ? "is-thief" : ""}`} transform={`translate(${x} ${y})`}>
                  {ports(n.id).map(([px, py]) => (
                    <circle key={`${px},${py}`} className="wfc-port" cx={px} cy={py} r={3.4} />
                  ))}
                  {st === "waiting" && <rect className="wfc-wait" x={-28} y={-28} width={56} height={56} rx={13} />}
                  <g className="wfc-box">
                    <rect className="wfc-body" x={-28} y={-28} width={56} height={56} rx={13} />
                    <rect
                      className="wfc-fill"
                      clipPath={`url(#${uid}-box)`}
                      ref={(el) => {
                        fills.current[n.id] = el;
                      }}
                    />
                    <rect className="wfc-edge" x={-28} y={-28} width={56} height={56} rx={13} />
                    <path className="wfc-ic" d={ICON[n.id]} transform="translate(-12 -12)" />
                  </g>
                  {b && (
                    <g transform="translate(27 -27)">
                      <g className={`wfc-badge is-${b}`} key={`${b}-${run}-${round}`}>
                        <circle r={9} />
                        <path d={b === "ok" ? "M-3.8 0.3l2.5 2.6 5.1-5.3" : b === "bad" ? "M-3.1-3.1l6.2 6.2M3.1-3.1l-6.2 6.2" : "M-2.2-3.4v6.8M2.2-3.4v6.8"} />
                      </g>
                    </g>
                  )}
                  <text className="wfc-name" x={below ? 0 : -42} y={below ? 50 : -2} textAnchor={below ? "middle" : "end"}>
                    {n.name}
                  </text>
                  <text className="wfc-sub" x={below ? 0 : -42} y={below ? 66 : 14} textAnchor={below ? "middle" : "end"}>
                    {st === "paused" ? "Paused on-chain" : st === "bad" && n.id === "wallet" ? "Reverted" : st === "bad" ? "Rejected" : sub}
                  </text>
                </g>
              );
            })}
            {L.side === "below" && (
              // what the agent asks for, typed out over it as the run starts
              <g transform={`translate(${L.pos.agent[0] - 28} ${L.pos.agent[1] - 76})`}>
                <g className={`wfc-ask ${r.bypass ? "is-bad" : ""}`} key={`ask-${run}-${round}`}>
                  <rect width={r.ask.length * 6.3 + 20} height={26} rx={6} />
                  <text x={10} y={17} ref={askText} />
                </g>
              </g>
            )}
            {L.side === "below" && showScore && (
              <g transform={`translate(${L.pos.guard[0]} ${L.pos.guard[1] - 62})`}>
                <g className={`wfc-score ${scoreTone}`} key={`score-${run}-${round}`}>
                  <rect x={-(`score ${finalScore}`.length * 6.3 + 18) / 2} y={-13} width={`score ${finalScore}`.length * 6.3 + 18} height={24} rx={12} />
                  <text x={0} y={3.5} textAnchor="middle" ref={scoreText}>
                    score 0
                  </text>
                </g>
              </g>
            )}
            <g key={`p-${run}-${round}`}>
              {[0, 1, 2].map((i) => (
                <rect
                  key={i}
                  className="wfc-ghost"
                  ref={(el) => {
                    ghosts.current[i] = el;
                  }}
                />
              ))}
              <rect ref={packet} className="wfc-packet" />
            </g>
          </svg>
        </div>

        <div className="wfc-insp" aria-live="polite" onMouseEnter={() => setHeld(true)} onMouseLeave={() => setHeld(false)}>
          <div className="wfc-insp-h">
            <span className="wfc-label">{insp === "outcome" ? "Outcome" : "Inspector"}</span>
            <b>{insp === "outcome" ? r.tab : node.name}</b>
            <span>{insp === "outcome" ? (r.bad ? "Stopped" : "Settled on Base") : node.sub}</span>
          </div>
          <div className="wf-panel" key={`${run}-${round}-${panelKey}`}>
            {insp === "outcome" ? <p className="wfc-outcome">{r.outcome}</p> : <Panel run={r} i={panelKey} checkMs={checkMs} />}
          </div>
        </div>

        <ol className="wfc-log" aria-label="Relay log">
          {lines.map((l) => (
            <li key={`${run}-${round}-${l.who}-${l.at}`} className={l.bad ? "is-bad" : ""}>
              <span>+{(l.at / 1000).toFixed(1)}s</span>
              <em>{l.who}</em>
              {l.text}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/** The latest event at or before `t`. */
function last(events: number[], t: number) {
  let e = 0;
  for (const x of events) {
    if (x <= t) e = x;
    else break;
  }
  return e;
}

/** Sizes a station's fill for how far along it is, sweeping from the side the square came in by. */
function setFill(el: SVGRectElement, from: Side, k: number) {
  const w = 56 * k;
  const set = (x: number, y: number, ww: number, hh: number) => {
    el.setAttribute("x", String(x));
    el.setAttribute("y", String(y));
    el.setAttribute("width", String(Math.max(0, ww)));
    el.setAttribute("height", String(Math.max(0, hh)));
  };
  if (from === "l") set(-28, -28, w, 56);
  else if (from === "r") set(28 - w, -28, w, 56);
  else if (from === "t") set(-28, -28, 56, w);
  else set(-28, 28 - w, 56, w);
}

/** The relay's lines for a run, each at the moment its station is done with the square. */
function logLines(r: Run, P: Plan) {
  const seg = (n: NodeId) => P.segs.find((s): s is InSeg => s.kind === "in" && s.node === n);
  const lines: { at: number; who: string; text: string; bad?: boolean }[] = [];
  const ag = seg("agent");
  if (ag) lines.push({ at: ag.t1 - RISE, who: "agent", text: `${r.bypass ? "thief" : r.agent.who}: ${r.agent.what}${r.agent.said ? ` · “${r.agent.said}”` : ""}`, bad: r.bypass });
  const k = seg("key");
  if (k) lines.push({ at: k.t1 - RISE, who: "key", text: `AgentOp signed by ${r.key.signer} · nonce ${r.key.nonce}` });
  const g = r.guardian;
  const gs = seg("guard");
  if ("skipped" in g) {
    const by = P.segs.find((s): s is GoSeg => s.kind === "go" && s.edge === "e7");
    if (by) lines.push({ at: (by.t0 + by.t1) / 2, who: "guardian", text: "skipped: sent straight to the chain" });
  } else if (gs)
    lines.push({
      at: gs.mode === "fail" ? gs.mark : gs.t1 - RISE,
      who: "guardian",
      text: `${g.outflow ?? g.revert} · ${g.signals.length ? g.signals.map((x) => x[1].toLowerCase()).join(" · ") : "no risk signals"} · score ${g.score} · ${g.verdict.toLowerCase()}`,
      bad: g.bad,
    });
  const ys = seg("you");
  if (ys && "approve" in r.you) lines.push({ at: ys.mark, who: "you", text: "approved with your signature" });
  const sig = P.segs.find((s): s is SigSeg => s.kind === "sig");
  if (sig) lines.push({ at: sig.t1, who: "contract", text: "pause(agentId) recorded · the agent can’t send anything", bad: true });
  const c = r.contract;
  const ws = seg("wallet");
  if (ws && !("never" in c))
    lines.push({
      at: ws.mode === "fail" ? ws.mark : ws.t1 - RISE,
      who: "contract",
      text: `${c.checks.filter((x) => x[1] === "ok").length} of 5 checks passed · ${c.result.toLowerCase()}`,
      bad: c.bad,
    });
  return lines.sort((a, b) => a.at - b.at);
}

/** Keeps shortened addresses such as 0x15d3…6A65 on one line. */
function keepAddresses(text: string): ReactNode {
  return text.split(/(0x[0-9a-fA-F]+…[0-9a-fA-F]+)/).map((part, n) =>
    n % 2 ? (
      <span key={n} className="nowrap">
        {part}
      </span>
    ) : (
      part
    ),
  );
}

function Panel({ run, i, checkMs }: { run: Run; i: number; checkMs: number }): ReactNode {
  if (i === 0) {
    const a = run.agent;
    return (
      <div className="wf-msg">
        <span>{a.who}</span>
        <b>{keepAddresses(a.what)}</b>
        <q className={a.said ? "" : "is-none"}>{a.said ?? "No reason given"}</q>
      </div>
    );
  }
  if (i === 1) {
    const k = run.key;
    return (
      <div className="wf-op">
        <div className="wf-op-h">AgentOp</div>
        <dl>
          <div>
            <dt>agentId</dt>
            <dd>{k.agentId}</dd>
          </div>
          <div>
            <dt>callsHash</dt>
            <dd>{k.callsHash}</dd>
          </div>
          <div>
            <dt>nonce</dt>
            <dd>{k.nonce}</dd>
          </div>
          <div>
            <dt>deadline</dt>
            <dd>+30 min</dd>
          </div>
        </dl>
        <p className="wf-note">Signed by {k.signer}. One changed byte breaks it.</p>
      </div>
    );
  }
  if (i === 2) {
    const g = run.guardian;
    if ("skipped" in g) return <p className="wf-skip">{g.skipped}</p>;
    return (
      <div className={`wf-guard ${g.bad ? "is-bad" : ""}`}>
        {g.outflow && (
          <div className="wf-kv">
            <span>Simulated outflow</span>
            <b>{g.outflow}</b>
          </div>
        )}
        {g.revert && <div className="wf-revert">{g.revert}</div>}
        <ul className="wf-signals">
          {g.signals.length === 0 && <li className="is-none">No risk signals</li>}
          {g.signals.map(([pts, text], n) => (
            <li key={n} style={{ animationDelay: `${300 + n * 250}ms` }}>
              {pts && <b>{pts}</b>}
              {text}
            </li>
          ))}
        </ul>
        <div className="wf-score">
          <div className="wf-scale">
            <i style={{ left: `${g.score}%` }} />
          </div>
          <div className="wf-scale-l">
            <span>{g.score} / 100</span>
            <span>Allow · Review · Reject</span>
          </div>
        </div>
        <div className="wf-verdict">{g.verdict}</div>
      </div>
    );
  }
  if (i === 3) {
    const y = run.you;
    if ("skipped" in y) return <p className="wf-skip">{y.skipped}</p>;
    if ("none" in y) return <p className="wf-quiet">{y.none}</p>;
    return <Approve text={y.approve} />;
  }
  const c = run.contract;
  if ("never" in c)
    return (
      <div className="wf-never">
        <b>{c.never}</b>
        <span>{c.sub}</span>
      </div>
    );
  return (
    <div className={`wf-checks ${c.bad ? "is-bad" : ""}`}>
      {c.checks.map(([label, st], n) => (
        <div key={label} className={`is-${st}`} style={{ animationDelay: `${150 + n * checkMs}ms` }}>
          <i />
          {label}
        </div>
      ))}
      <p className="wf-result" style={{ animationDelay: `${150 + (c.bad ? 3.6 : 5) * checkMs}ms` }}>
        {c.result}
      </p>
    </div>
  );
}

/** The approval on your phone: it waits, your pointer comes in and lands on Approve, as the canvas's
 * "You" station is approved (its step's mark). */
function Approve({ text }: { text: string }) {
  const [s, setS] = useState(reduceMotion() ? 2 : 0);
  useEffect(() => {
    if (reduceMotion()) return;
    const a = setTimeout(() => setS(1), 1250);
    const b = setTimeout(() => setS(2), 1600);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, []);
  return (
    <div className="wf-phone">
      <span>Killswitch</span>
      <b>{text}</b>
      {s < 2 ? (
        <div className="wf-phone-b">
          <em>Deny</em>
          <em className={`is-dark ${s === 1 ? "is-press" : ""}`}>
            Approve
            <span className="wfc-you" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <path d="M5.5 3.2v16.1l4.3-4.1 2.7 6.1 2.6-1.1-2.7-6h6.1z" />
              </svg>
              <i>You</i>
            </span>
          </em>
        </div>
      ) : (
        <div className="wf-phone-ok">Approved with your signature</div>
      )}
    </div>
  );
}
