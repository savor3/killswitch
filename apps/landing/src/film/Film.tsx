// The product film for the landing's film section, in the grammar of the reference site's product video:
// a chapter title over the blurred app, then the app sharpens and does that one thing. The owner gives the
// Payments bot a budget, a payment passes every check, one that looks unusual waits and is denied, and one
// signature stops every agent. Words and numbers are the dashboard's own (apps/dashboard: the new-agent
// form, the Payments template, the approval card, the stop-all modal) and match the landing's story: a
// 1,000 USDC wallet, Trading bot 100 a day, Payments bot 50 a day.
// Every frame is a pure function of `t`, so the recorder can step through it with window.__seek.
import { useLayoutEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { Mark, Wordmark } from "../brand/Logo";

export const DURATION = 54;

// ------------------------------------------------------------------ time
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const prog = (t: number, a: number, d: number) => clamp01((t - a) / d);
const io = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const out = (x: number) => 1 - Math.pow(1 - x, 3);
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

/** Values eased between keys [time, ...values], held before the first key and after the last. */
function keys(ks: number[][], t: number): number[] {
  if (t <= ks[0][0]) return ks[0].slice(1);
  for (let i = 1; i < ks.length; i++) {
    if (t <= ks[i][0]) {
      const a = ks[i - 1];
      const b = ks[i];
      const k = io(clamp01((t - a[0]) / (b[0] - a[0])));
      return a.slice(1).map((v, j) => lerp(v, b[j + 1], k));
    }
  }
  return ks[ks.length - 1].slice(1);
}

// ------------------------------------------------------------------ where the pointer aims
// The centre of every element marked data-hit, in the camera's own coordinates (layout offsets, so the
// camera's zoom does not change them). Measured after each frame is drawn; a scene's pointer only sets off
// once the scene has been on screen for a while, so its targets are known by then.
type Pt = [number, number];
const HITS = new Map<string, Pt>();
const HEIGHTS = new Map<string, number>(); // elements marked data-h, for cards that resize between steps
function measure(root: HTMLElement) {
  root.querySelectorAll<HTMLElement>("[data-h]").forEach((el) => HEIGHTS.set(el.dataset.h!, el.offsetHeight));
  root.querySelectorAll<HTMLElement>("[data-hit]").forEach((el) => {
    let x = el.offsetWidth / 2;
    let y = el.offsetHeight / 2;
    let e: HTMLElement | null = el;
    while (e && !e.classList.contains("cam")) {
      x += e.offsetLeft;
      y += e.offsetTop;
      e = e.offsetParent as HTMLElement | null;
    }
    HITS.set(el.dataset.hit!, [x, y]);
  });
}

// ------------------------------------------------------------------ icons
const Ic = ({ d, size = 26, w = 2.4 }: { d: string; size?: number; w?: number }) => (
  <svg className="ic" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={w} strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);
const Check = ({ size }: { size?: number }) => <Ic size={size} w={2.8} d="M4.5 12.5l4.8 4.8L19.5 7" />;
const Cross = ({ size }: { size?: number }) => <Ic size={size} d="M6.5 6.5l11 11M17.5 6.5l-11 11" />;
const Alert = ({ size }: { size?: number }) => <Ic size={size} d="M12 3.8L2.9 19.6h18.2zM12 10v4.2M12 16.9v.1" />;
const Send = ({ size }: { size?: number }) => <Ic size={size} d="M7 17L17 7M9 7h8v8" />;
const Swap = ({ size }: { size?: number }) => <Ic size={size} d="M6 8.5h12l-3.2-3.2M18 15.5H6l3.2 3.2" />;
const Shield = ({ size }: { size?: number }) => <Ic size={size} d="M12 3.2l7.6 2.9v5.8c0 4.4-3.2 8-7.6 8.9-4.4-.9-7.6-4.5-7.6-8.9V6.1z" />;
const ShieldOk = ({ size }: { size?: number }) => <Ic size={size} d="M12 3.2l7.6 2.9v5.8c0 4.4-3.2 8-7.6 8.9-4.4-.9-7.6-4.5-7.6-8.9V6.1zM8.6 12.2l2.4 2.4 4.4-4.6" />;
const Power = ({ size = 26 }: { size?: number }) => (
  <span style={{ display: "inline-grid", width: size, height: size, placeItems: "center" }}>
    <Mark className="film-mark" />
  </span>
);
const Spin = ({ t, red }: { t: number; red?: boolean }) => (
  <span className="spin" style={{ transform: `rotate(${(t * 420) % 360}deg)`, color: red ? "#ff2028" : undefined }} />
);
/** A tick that draws itself in as `k` goes from 0 to 1. */
const CheckDraw = ({ k, size = 30 }: { k: number; size?: number }) => (
  <svg className="ic" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round">
    <path d="M4.5 12.5l4.8 4.8L19.5 7" pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - out(clamp01(k))} />
  </svg>
);

// ------------------------------------------------------------------ buttons with states
/** 0..1 while the pointer is over a button: from a moment before its click until shortly after. */
const hover = (t: number, click: number) => Math.min(prog(t, click - 0.42, 0.16), 1 - prog(t, click + 0.4, 0.25));
/** 0..1..0 over the press. */
const press = (t: number, click: number) => Math.sin(prog(t, click, 0.2) * Math.PI);
const mix = (a: number[], b: number[], k: number) => `rgb(${a.map((v, i) => Math.round(lerp(v, b[i], k))).join(",")})`;
const TONES = {
  light: { bg: [255, 255, 255], hov: [242, 242, 242], fg: "#0a0a0a" },
  dark: { bg: [10, 10, 10], hov: [52, 52, 52], fg: "#fff" },
  red: { bg: [255, 32, 40], hov: [214, 14, 24], fg: "#fff" },
};
function Btn({ t, click, tone = "light", hit, style, children }: { t: number; click?: number; tone?: keyof typeof TONES; hit?: string; style?: CSSProperties; children: ReactNode }) {
  const c = TONES[tone];
  const h = click === undefined ? 0 : hover(t, click);
  const p = click === undefined ? 0 : press(t, click);
  const bg = mix(c.bg, c.hov, h);
  return (
    <span
      className={`btn ${tone === "light" ? "" : tone}`}
      data-hit={hit}
      style={{ ...style, background: bg, borderColor: tone === "light" ? undefined : bg, color: c.fg, transform: `scale(${1 - 0.045 * p})` }}
    >
      {children}
    </span>
  );
}

// ------------------------------------------------------------------ building blocks
function Title({ t, s, e, text }: { t: number; s: number; e: number; text: string }) {
  if (t < s || t > e) return null;
  const gone = io(prog(t, e - 0.5, 0.5));
  const words = text.split(" ");
  return (
    <div className="title" style={{ opacity: 1 - gone, filter: gone > 0 ? `blur(${gone * 8}px)` : undefined }}>
      {words.map((w, i) => {
        const k = out(prog(t, s + i * 0.1, 0.6));
        return (
          <span key={i}>
            {i > 0 && " "}
            <span
              className={w.startsWith("*") ? "red" : undefined}
              style={{ display: "inline-block", opacity: k, filter: k < 1 ? `blur(${(1 - k) * 12}px)` : undefined, transform: `translateY(${(1 - k) * 18}px)` }}
            >
              {w.replace(/\*/g, "")}
            </span>
          </span>
        );
      })}
    </div>
  );
}

/** One chapter: the title over the blurred app, the app sharp in the middle, blurred again at the end. */
function Scene({ t, s, e, titleEnd, title, children }: { t: number; s: number; e: number; titleEnd: number; title: string; children: ReactNode }) {
  if (t < s || t > e) return null;
  const blur = Math.max(1 - io(prog(t, titleEnd - 0.35, 0.75)), io(prog(t, e - 0.75, 0.6)));
  const op = Math.min(prog(t, s, 0.3), 1 - prog(t, e - 0.25, 0.25));
  return (
    <div className="scene" style={{ opacity: op }}>
      <div className="ui" style={{ filter: blur > 0.002 ? `blur(${blur * 20}px)` : undefined }}>
        {children}
      </div>
      <div className="veil" style={{ opacity: blur * 0.62 }} />
      <Title t={t} s={s + 0.15} e={titleEnd} text={title} />
    </div>
  );
}

/** The camera: keys are [time, focus x, focus y, zoom] on the 1920 x 1080 board. */
function Cam({ t, path, children }: { t: number; path: number[][]; children: ReactNode }) {
  const [fx, fy, s] = keys(path, t);
  return (
    <div className="cam" style={{ transform: `translate(${960 - fx * s}px, ${540 - fy * s}px) scale(${s})` }}>
      {children}
    </div>
  );
}

/** The pointer: glides between targets (a data-hit name or a point), dips and opens a ring on a click. */
function Cursor({ t, path, clicks, show }: { t: number; path: [number, string | Pt][]; clicks: number[]; show: [number, number] }) {
  const vis = Math.min(prog(t, show[0], 0.3), 1 - prog(t, show[1] - 0.3, 0.3));
  if (vis <= 0) return null;
  const pts = path.map(([tt, p]) => [tt, ...(typeof p === "string" ? HITS.get(p) ?? [1700, 1000] : p)]);
  const [x, y] = keys(pts, t);
  let press = 0;
  let ring = -1;
  let at: number[] = [x, y];
  for (const c of clicks) {
    if (t >= c && t < c + 0.6) {
      press = Math.sin(prog(t, c, 0.18) * Math.PI);
      ring = prog(t, c, 0.55);
      at = keys(pts, c); // the ring stays where the click happened
    }
  }
  const r = 12 + ring * 40;
  return (
    <>
      {ring >= 0 && ring < 1 && <span className="ring" style={{ left: at[0] - r, top: at[1] - r, width: r * 2, height: r * 2, opacity: (1 - ring) * 0.45 }} />}
      <svg
        className="cursor"
        viewBox="0 0 24 24"
        style={{ transform: `translate(${x - 10.5}px, ${y - 6.1}px) scale(${1 - press * 0.14})`, transformOrigin: "10.5px 6.1px", opacity: vis }}
      >
        <path d="M5.5 3.2v16.1l4.3-4.1 2.7 6.1 2.6-1.1-2.7-6h6.1z" fill="#0a0a0a" stroke="#fff" strokeWidth="1.3" strokeLinejoin="round" />
      </svg>
    </>
  );
}

function Steps({ n }: { n: number }) {
  return (
    <div className="steps">
      {["What it does", "Limits", "Review"].map((l, i) => (
        <span key={l} className={i + 1 < n ? "done" : i + 1 === n ? "on" : ""}>
          <b>{i + 1 < n ? <Check size={20} /> : i + 1}</b>
          {l}
        </span>
      ))}
    </div>
  );
}

const appear = (t: number, at: number, d = 0.4): CSSProperties => {
  const k = out(prog(t, at, d));
  return { opacity: k, transform: `translateY(${(1 - k) * 14}px)` };
};
/** For words that change in place at `at`: the old ones fade out just before, the new ones rise in after. */
const swapped = (t: number, at: number): CSSProperties => {
  if (t < at - 0.16 || t > at + 0.36) return {};
  const k = t < at ? 1 - prog(t, at - 0.16, 0.16) : out(prog(t, at, 0.36));
  return { opacity: k, transform: t >= at ? `translateY(${(1 - k) * 8}px)` : undefined };
};
const SOFT = [246, 246, 246];
const INK = [10, 10, 10];
const PINK = [255, 241, 241];
const GREY = [139, 139, 139];
const RED = [255, 32, 40];

// ------------------------------------------------------------------ 1. a budget
function S1({ t }: { t: number }) {
  const tCap = 3.95;
  const tReview = 5.1;
  const tSign = 7.05;
  const tReady = 8.0;
  const k3 = io(prog(t, tReview + 0.08, 0.4));
  const cap = t >= tCap + 0.06 ? 50 : 100;
  // the card shrinks from the limits form to the shorter review as one moves into the other
  const hA = HEIGHTS.get("limits");
  const hB = HEIGHTS.get("review");
  const height = hA && hB ? lerp(hA, hB, k3) + 2 * 52 + 3 : undefined; // content, padding, border
  return (
    <Scene t={t} s={0} e={9.2} titleEnd={2.6} title="Give each agent a *budget*">
      <Cam t={t} path={[[0, 960, 540, 1], [2.6, 960, 500, 1.03], [4.9, 990, 590, 1.1], [5.4, 960, 470, 1.04], [8.7, 1000, 560, 1.12]]}>
        <div className="card" style={{ left: 420, top: 64, width: 1080, padding: 52, height, overflow: "hidden" }}>
          <div data-h="limits" style={{ opacity: 1 - k3 }}>
            <Steps n={2} />
            <h2 className="h2">Set the limits</h2>
            <p className="lead">The wallet contract enforces these. The agent can’t change them.</p>
            <div className="field">
              <span>Name</span>
              <div className="input">Payments bot</div>
            </div>
            <div className="field">
              <span>Most it can spend per day</span>
              <div className="presets">
                {[25, 50, 100, 500].map((c) => {
                  // the choice changes over from $100 to $50 as the click lands, not in a jump
                  const kk = io(prog(t, tCap + 0.02, 0.2));
                  const on = c === 50 ? kk : c === 100 ? 1 - kk : 0;
                  const h = c === 50 ? hover(t, tCap) * (1 - kk) : 0;
                  return (
                    <span
                      key={c}
                      className="pre"
                      data-hit={`cap${c}`}
                      style={{
                        background: on > 0.01 ? `rgba(10,10,10,${on})` : h > 0.01 ? `rgba(10,10,10,${0.08 * h})` : undefined,
                        borderColor: on > 0.5 ? "#0a0a0a" : undefined,
                        color: on > 0.5 ? "#fff" : undefined,
                        transform: c === 50 ? `scale(${1 - 0.05 * press(t, tCap)})` : undefined,
                      }}
                    >
                      ${c}
                    </span>
                  );
                })}
                <div className="input" style={{ flex: 1 }}>
                  <span className="muted">$</span>
                  {cap}
                  <span className="muted" style={{ marginLeft: "auto" }}>
                    USDC
                  </span>
                </div>
              </div>
            </div>
            <div className="field">
              <span>Extra guardian check for single payments over</span>
              <div className="input">
                <span className="muted">$</span>20
                <span className="muted" style={{ marginLeft: "auto" }}>
                  USDC
                </span>
              </div>
            </div>
            <div className="field">
              <span>Access ends after</span>
              <div className="seg">
                {["1 day", "1 week", "1 month", "3 months"].map((d) => (
                  <span key={d} className={d === "1 week" ? "on" : ""}>
                    {d}
                  </span>
                ))}
              </div>
            </div>
            <div className="foot">
              <Btn t={t}>Back</Btn>
              <Btn t={t} click={tReview} tone="dark" hit="review">
                Review
              </Btn>
            </div>
          </div>
          <div data-h="review" style={{ position: "absolute", left: 52, right: 52, top: 52, opacity: k3 }}>
            <Steps n={3} />
            <h2 className="h2" style={{ marginBottom: 32 }}>
              Review “Payments bot”
            </h2>
            <div className="review">
              <div className="rv">
                <span className="eyebrow">It can</span>
                <div>
                  <Check />
                  <span>Send USDC (new recipients are checked by the guardian)</span>
                </div>
                <div>
                  <Check />
                  <span>
                    Spend up to <b>$50 USDC</b> a day
                  </span>
                </div>
                <div>
                  <Check />
                  <span>
                    Keep working for <b>1 week</b>
                  </span>
                </div>
              </div>
              <div className="rv">
                <span className="eyebrow">It can’t</span>
                {["Trade or swap", "Touch WETH or ETH", "Go over the daily limit, even if hacked", "Change its own limits or touch your master key"].map((c) => (
                  <div key={c}>
                    <Cross />
                    <span>{c}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="note">
              <Shield />
              Single payments over $20 get an extra guardian check. Unusual ones wait for your approval.
            </div>
            <div className="foot">
              <Btn t={t}>Back</Btn>
              <Btn t={t} click={tSign} tone="dark" hit="sign" style={{ minWidth: 380 }}>
                {t < tSign + 0.1 ? (
                  "Sign & create agent"
                ) : t < tReady ? (
                  <>
                    <Spin t={t} /> Waiting for signature…
                  </>
                ) : (
                  <>
                    <CheckDraw k={prog(t, tReady, 0.35)} size={26} /> Payments bot is ready
                  </>
                )}
              </Btn>
            </div>
            <p className="muted" style={{ margin: "22px 0 0", textAlign: "center", fontSize: 21 }}>
              You’ll sign once with your wallet on Base Sepolia.
            </p>
          </div>
        </div>
        <Cursor
          t={t}
          show={[3.0, 8.7]}
          clicks={[tCap, tReview, tSign]}
          path={[[3.0, [1640, 1000]], [3.8, "cap50"], [4.1, "cap50"], [4.95, "review"], [5.4, "review"], [6.9, "sign"], [7.3, "sign"], [8.6, [1560, 1010]]]}
        />
      </Cam>
    </Scene>
  );
}

// ------------------------------------------------------------------ 2. every check
const CHECKS: [string, string][] = [
  ["Agent is live", "Payments bot · access for 7 more days"],
  ["Calls are allowed", "USDC transfer"],
  ["Real outflow measured", "25.00 USDC"],
  ["Caps hold", "25 of 50 USDC today"],
  ["No leftover approvals", "none open"],
];
function S2({ t }: { t: number }) {
  const t0 = 12.0; // the guardian starts
  const tg = 13.2; // the guardian is done
  const at = (i: number) => 13.4 + i * 0.5; // contract check i starts
  const tDone = at(5) + 0.2;
  const done = t >= tDone;
  const Row = ({ n, label, detail, s, e }: { n: string; label: string; detail: string; s: number; e: number }) => (
    <div className={`row ${t >= s && t < e ? "is-now" : ""}`} style={appear(t, s)}>
      {/* a red line runs along the row while its check runs, then settles back into the grey rule */}
      <i className="row-run" style={{ transform: `scaleX(${io(prog(t, s, e - s))})`, opacity: 1 - prog(t, e + 0.1, 0.4) }} />
      <span className="num mono">{n}</span>
      <span>{label}</span>
      <span style={{ display: "flex", alignItems: "center", gap: 18 }}>
        <em style={{ opacity: out(prog(t, e, 0.3)) }}>{detail}</em>
        <span className="st">{t < e ? <Spin t={t} red /> : <CheckDraw k={prog(t, e, 0.3)} />}</span>
      </span>
    </div>
  );
  return (
    <Scene t={t} s={9.0} e={21.4} titleEnd={11.7} title="Every payment is *checked* before it moves">
      <Cam t={t} path={[[9, 960, 520, 1], [11.7, 960, 470, 1.04], [13.0, 960, 400, 1.14], [15.8, 960, 640, 1.14], [16.9, 960, 560, 1.02], [21.4, 960, 560, 1.03]]}>
        <div className="card" style={{ left: 400, top: 50, width: 1120, padding: 48 }}>
          <div className="op-h">
            <span className="av">
              <Send />
            </span>
            <div className="op-t">
              <b>Send 25.00 USDC to Acme Hosting</b>
              <span className="muted">Payments bot · just now</span>
            </div>
            <span className="pill" style={{ background: mix(SOFT, INK, out(prog(t, tDone, 0.3))), color: done ? "#fff" : undefined }}>
              {done ? (
                <>
                  <CheckDraw k={prog(t, tDone, 0.35)} size={22} />
                  <span style={{ opacity: out(prog(t, tDone, 0.3)) }}>Done</span>
                </>
              ) : (
                <>
                  <Spin t={t} red /> Checking…
                </>
              )}
            </span>
          </div>
          <div className="quote" style={{ marginTop: 28 }}>
            <span className="eyebrow">Agent said</span>“Pay invoice #1042 to Acme Hosting”
          </div>
          <div className="grp eyebrow" style={appear(t, t0 - 0.2)}>
            Guardian
          </div>
          <Row n="" label="Extra check, above the co-sign amount" detail="AI review: approve · 97% sure" s={t0} e={tg} />
          <div className="grp eyebrow" style={appear(t, at(0) - 0.25)}>
            Wallet contract · five checks
          </div>
          {CHECKS.map(([label, detail], i) => (
            <Row key={label} n={String(i + 1).padStart(2, "0")} label={label} detail={detail} s={at(i)} e={at(i) + 0.42} />
          ))}
          <div className="tx" style={appear(t, tDone)}>
            <span className="muted">
              Transaction <span className="mono" style={{ color: "#0a0a0a" }}>0x3f8a…12c4</span> on Base Sepolia
            </span>
            <div className="spend">
              <div className="spend-h">
                <span className="muted">Spent today</span>
                <b>
                  {Math.round(25 * out(prog(t, tDone + 0.2, 0.8)))} / 50 USDC
                </b>
              </div>
              <div className="meter">
                <i style={{ width: `${50 * out(prog(t, tDone + 0.2, 0.8))}%` }} />
              </div>
            </div>
          </div>
        </div>
      </Cam>
    </Scene>
  );
}

// ------------------------------------------------------------------ 3. it waits for you
function S3({ t }: { t: number }) {
  const tDeny = 29.3;
  const gone = io(prog(t, tDeny + 0.3, 0.45)); // the approval card leaves
  const after = out(prog(t, tDeny + 0.75, 0.45)); // the activity row and the safe status arrive
  const toast = Math.min(out(prog(t, tDeny + 0.35, 0.4)), 1 - io(prog(t, 33.6, 0.4)));
  const tSafe = tDeny + 0.9;
  const safe = t >= tSafe;
  return (
    <Scene t={t} s={21.2} e={35.4} titleEnd={23.9} title="Anything unusual *waits* *for* *you*">
      <Cam t={t} path={[[21.2, 960, 480, 1], [23.9, 960, 400, 1.06], [25.2, 960, 360, 1.1], [27.0, 960, 560, 1.14], [28.9, 960, 640, 1.27], [29.9, 960, 640, 1.27], [31.2, 960, 480, 1.02], [35.4, 960, 480, 1.03]]}>
        <div className="card status" style={{ left: 360, top: 80, width: 1200 }}>
          <span className={`av ${safe ? "dark" : "red"}`} style={safe ? { transform: `scale(${0.86 + 0.14 * out(prog(t, tSafe, 0.35))})` } : undefined}>
            {safe ? <ShieldOk /> : <Alert />}
          </span>
          <div className="status-t" style={swapped(t, tSafe)}>
            <b>{safe ? "Everything is safe" : "1 payment waiting for you"}</b>
            <span>{safe ? "2 agents working inside your limits. The guardian is watching." : "An agent tried something unusual. Nothing moves until you decide."}</span>
          </div>
          {!safe && (
            <span className="btn" style={{ opacity: 1 - prog(t, tSafe - 0.16, 0.16) }}>
              Review
            </span>
          )}
        </div>
        <div className="h2" style={{ position: "absolute", left: 362, top: 262, fontSize: 34, opacity: 1 - gone }}>
          Needs your approval
        </div>
        <div className="card appr" style={{ left: 360, top: 322, width: 1200, padding: 40, opacity: 1 - gone, transform: `translateY(${-gone * 16}px)` }}>
          <div className="op-h">
            <span className="av red">
              <Send />
            </span>
            <div className="op-t">
              <span className="muted">Payments bot wants to</span>
              <b>Send 25.00 USDC to 0x15d3…6A65</b>
            </div>
            <span className="muted" style={{ fontSize: 22 }}>
              just now
            </span>
          </div>
          <div className="flags">
            <span className="flag">
              <Alert size={22} /> First payment to a new address
            </span>
            <span className="flag">
              <Alert size={22} /> Uses all of today’s cap
            </span>
          </div>
          <div className="quote">
            <span className="eyebrow">Agent said</span>“Pay invoice #1044 to Acme Hosting”
          </div>
          <div className="appr-f">
            <span>Nothing has moved. Your signature decides.</span>
            <span className="actions">
              <Btn t={t} click={tDeny} hit="deny">
                <Cross size={22} /> Deny
              </Btn>
              <Btn t={t} tone="dark">
                <Check size={22} /> Approve
              </Btn>
            </span>
          </div>
        </div>
        <div className="h2" style={{ position: "absolute", left: 362, top: 262, fontSize: 34, opacity: after }}>
          Activity
        </div>
        <div className="card agent" style={{ left: 360, top: 322, width: 1200, opacity: after, transform: `translateY(${(1 - after) * 14}px)` }}>
          <span className="av">
            <Send />
          </span>
          <div className="op-t">
            <b>Send 25.00 USDC to 0x15d3…6A65</b>
            <span className="muted">Payments bot · just now</span>
          </div>
          <span className="pill red">
            <Cross size={20} /> Denied by you
          </span>
        </div>
        <div className="card agent" style={{ left: 360, top: 452, width: 1200, opacity: after, transform: `translateY(${(1 - after) * 14}px)` }}>
          <span className="av">
            <Send />
          </span>
          <div className="op-t">
            <b>Send 25.00 USDC to Acme Hosting</b>
            <span className="muted">Payments bot · 2 min ago</span>
          </div>
          <span className="pill dark">
            <Check size={20} /> Done
          </span>
        </div>
        {toast > 0 && (
          <div className="toast" style={{ top: 880, opacity: toast, transform: `translate(-50%, ${(1 - toast) * 24}px)` }}>
            <i className="toast-sq" /> Denied. Nothing was sent.
          </div>
        )}
        <Cursor t={t} show={[27.0, 30.6]} clicks={[tDeny]} path={[[27.0, [1720, 1010]], [28.95, "deny"], [29.6, "deny"], [30.5, [1500, 960]]]} />
      </Cam>
    </Scene>
  );
}

// ------------------------------------------------------------------ 4. one signature
function S4({ t }: { t: number }) {
  const tOpen = 39.5;
  const tNow = 41.5;
  const tStopped = 42.6;
  const shade = Math.min(io(prog(t, tOpen, 0.3)), 1 - io(prog(t, tStopped + 0.05, 0.35)));
  const modal = Math.min(out(prog(t, tOpen + 0.05, 0.35)), 1 - io(prog(t, tStopped + 0.05, 0.3)));
  const tKill = tStopped + 0.25;
  const killed = t >= tKill;
  const tOff = (i: number) => tNow + 0.75 + i * 0.16;
  const off = (i: number) => t >= tOff(i);
  const offK = (i: number) => out(prog(t, tOff(i), 0.3));
  const drain = out(prog(t, tKill, 0.7)); // what the agents may still spend runs down to nothing
  const tStopAll = tOpen - 0.05;
  return (
    <Scene t={t} s={35.2} e={47.6} titleEnd={37.9} title="One signature *stops* *every* *agent*">
      <Cam t={t} path={[[35.2, 960, 480, 1], [37.9, 960, 440, 1.05], [39.1, 1180, 400, 1.12], [39.7, 960, 480, 1.06], [42.6, 960, 480, 1.06], [43.6, 960, 450, 1.0], [47.6, 960, 460, 1.02]]}>
        <div className="card status" style={{ left: 360, top: 70, width: 1200 }}>
          <span className={`av ${killed ? "red" : "dark"}`} style={killed ? { transform: `scale(${0.86 + 0.14 * out(prog(t, tKill, 0.35))})` } : undefined}>
            {killed ? <Power /> : <ShieldOk />}
          </span>
          <div className="status-t" style={swapped(t, tKill)}>
            <b>{killed ? "All agents stopped" : "Everything is safe"}</b>
            <span>{killed ? "You used the kill switch. Add a new agent to start again." : "2 agents working inside your limits. The guardian is watching."}</span>
          </div>
        </div>
        {/* three cards on one grid: label, then a slot of the same height for the figure or the button, then the note */}
        <div className="card stat" style={{ left: 360, top: 232, width: 390, height: 290 }}>
          <span className="eyebrow">Balance</span>
          <div className="slot">
            <div className="big">$1,000.00</div>
          </div>
          <div className="small">1,000.00 USDC in your wallet.</div>
        </div>
        <div className="card stat" style={{ left: 765, top: 232, width: 390, height: 290 }}>
          <span className="eyebrow">Max spend today</span>
          <div className="slot">
            <div className="big">${Math.round(150 * (1 - drain))}.00</div>
            <div className="meter">
              <i style={{ width: `${15 * (1 - drain)}%` }} />
            </div>
          </div>
          <div className="small">
            {Math.round(15 * (1 - drain))}% of your balance. <span style={swapped(t, tKill)}>{killed ? "No agent can spend now." : "Even a hacked agent can’t go past it."}</span>
          </div>
        </div>
        <div className="card stat" style={{ left: 1170, top: 232, width: 390, height: 290 }}>
          <span className="eyebrow">Emergency stop</span>
          <div className="slot">
            <div
              className="killbtn"
              data-hit="stopall"
              style={{
                background: mix(TONES.red.bg, TONES.red.hov, hover(t, tStopAll)),
                transform: `scale(${1 - 0.035 * press(t, tStopAll)})`,
                opacity: 1 - 0.65 * prog(t, tKill, 0.3),
              }}
            >
              <Power size={30} /> Stop all agents
            </div>
          </div>
          <div className="small" style={swapped(t, tKill)}>
            {killed ? "No agents left to stop." : "Cuts off 2 agents at once, with one signature."}
          </div>
        </div>
        <div className="h2" style={{ position: "absolute", left: 362, top: 572, fontSize: 34 }}>
          Agents
        </div>
        {[
          ["Trading bot", "Swaps USDC and WETH · up to $100 a day", <Swap key="s" />],
          ["Payments bot", "Sends USDC · up to $50 a day", <Send key="p" />],
        ].map(([name, line, icon], i) => (
          <div key={name as string} className="card agent" style={{ left: 360, top: 630 + i * 130, width: 1200 }}>
            <span className="av">{icon}</span>
            <div className="op-t">
              <b>{name}</b>
              <span className="muted">{line}</span>
            </div>
            {off(i) ? (
              <span className="pill red" style={{ opacity: offK(i), transform: `scale(${0.9 + 0.1 * offK(i)})` }}>
                <Power size={22} /> Stopped
              </span>
            ) : (
              <span className="pill">
                {/* a slow pulse while the agent is at work */}
                <i className="live" style={{ opacity: 0.3 + 0.7 * (0.5 + 0.5 * Math.cos((t - 35.2) * 3.6 + i * 1.3)) }} /> Working
              </span>
            )}
          </div>
        ))}
        {shade > 0 && <div className="shade" style={{ inset: -400, opacity: shade }} />}
        {modal > 0 && (
          <div className="card modal" style={{ left: 600, top: 236, width: 720, opacity: modal, transform: `scale(${0.97 + modal * 0.03})` }}>
            <div className="op-h" style={{ marginBottom: 18 }}>
              <span className="av red">
                <Power size={30} />
              </span>
              <h2 className="h2" style={{ fontSize: 40 }}>
                Stop all agents?
              </h2>
            </div>
            <p className="muted" style={{ margin: "0 0 18px", fontSize: 24 }}>
              Every agent loses access at once, in one signature. Your funds stay in your wallet.
            </p>
            {["Trading bot", "Payments bot"].map((a, i) => (
              <div key={a} className="mrow" style={{ background: mix(SOFT, PINK, offK(i)) }}>
                {a}
                <em style={{ color: mix(GREY, RED, offK(i)), ...swapped(t, tOff(i)) }}>{off(i) ? "Stopped" : "Will stop"}</em>
              </div>
            ))}
            <div className="foot" style={{ marginTop: 30 }}>
              <Btn t={t}>Cancel</Btn>
              <Btn t={t} click={tNow} tone="red" hit="stopnow" style={{ minWidth: 330 }}>
                {t < tNow + 0.1 ? (
                  <>
                    <Power size={24} /> Stop all agents now
                  </>
                ) : (
                  <>
                    <Spin t={t} /> Stopping…
                  </>
                )}
              </Btn>
            </div>
          </div>
        )}
        <Cursor
          t={t}
          show={[38.2, 43.2]}
          clicks={[tOpen - 0.05, tNow]}
          path={[[38.2, [1760, 960]], [39.25, "stopall"], [39.7, "stopall"], [41.3, "stopnow"], [41.9, "stopnow"], [43.1, [1620, 980]]]}
        />
      </Cam>
    </Scene>
  );
}

// ------------------------------------------------------------------ 5. the end
function S5({ t }: { t: number }) {
  if (t < 47.4) return null;
  const logo = Math.min(out(prog(t, 50.55, 0.6)), 1 - io(prog(t, 53.1, 0.7)));
  return (
    <div className="scene" style={{ opacity: prog(t, 47.4, 0.3) }}>
      <Title t={t} s={47.6} e={50.6} text="Humans set the limits. *Machines* *obey.*" />
      {logo > 0 && (
        <div className="lockup" style={{ opacity: logo, transform: `translate(-50%, -50%) scale(${0.985 + logo * 0.015})` }}>
          <Mark className="end-mark" />
          <Wordmark className="end-word" />
        </div>
      )}
    </div>
  );
}

export function Film({ t }: { t: number }) {
  const root = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (root.current) measure(root.current);
  });
  return (
    <div className="stage" ref={root}>
      <S1 t={t} />
      <S2 t={t} />
      <S3 t={t} />
      <S4 t={t} />
      <S5 t={t} />
    </div>
  );
}
