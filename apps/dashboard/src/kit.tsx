// The app's parts: the state square, buttons, the squares meter, numbers that ease to new values, dialogs and
// the drawer (with their way in and out, focus kept inside, the page held still), toasts, hold-to-confirm, copy.
import {
  useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore,
  type ButtonHTMLAttributes, type CSSProperties, type ReactNode,
} from "react";
import { Icon } from "./ui";

// ------------------------------------------------------------------ state
/** ok = fine or done · bad = stopped, blocked, failed · hold = paused or flagged · wait = needs you, or in
 *  progress · off = gone or denied. */
export type Tone = "ok" | "bad" | "hold" | "wait" | "off";

export const Sq = ({ s = "ok", lg }: { s?: Tone; lg?: boolean }) => <i className={`sq ${s} ${lg ? "lg" : ""}`} aria-hidden="true" />;

export function St({ s, children }: { s: Tone; children: ReactNode }) {
  return (
    <span className={`st ${s}`}>
      <Sq s={s} />
      {children}
    </span>
  );
}

export const reduceMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** The red box loader: nine squares, a red light running round the outer eight. */
export const Px = ({ lg }: { lg?: boolean }) => (
  <span className={`px ${lg ? "lg" : ""}`} aria-hidden="true">
    {Array.from({ length: 9 }, (_, i) => <i key={i} />)}
  </span>
);

// ------------------------------------------------------------------ buttons
type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  kind?: "ink" | "red" | "grey" | "line" | "ghost" | "glass";
  size?: "sm" | "lg";
  arrow?: ReactNode;
  busy?: string | false | null;
  full?: boolean;
};
/** The landing's split button. `arrow` adds the arrow cell; `busy` swaps the label for what is happening. */
export function Btn({ kind = "ink", size, arrow, busy, full, className = "", children, disabled, ...rest }: BtnProps) {
  return (
    <button
      type="button"
      {...rest}
      className={`btn ${kind} ${size ?? ""} ${full ? "full" : ""} ${className}`}
      disabled={disabled || !!busy}
      data-busy={busy ? "" : undefined}
      aria-busy={busy ? true : undefined}
    >
      <span>{busy ? <><Px />{busy}</> : children}</span>
      {arrow != null && arrow !== false && (
        <i aria-hidden="true">
          <b>{arrow}</b>
        </i>
      )}
    </button>
  );
}

// ------------------------------------------------------------------ a choice of a few
export type SegOption<T extends string> = { id: T; label: ReactNode; n?: number; sq?: Tone };
/** A grey track; a white plate slides under the chosen option. */
export function Seg<T extends string>({ value, options, onChange, full, label }: {
  value: T | null; options: SegOption<T>[]; onChange: (v: T) => void; full?: boolean; label: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [ind, setInd] = useState<{ x: number; w: number } | null>(null);
  const [ready, setReady] = useState(false);
  useLayoutEffect(() => {
    const box = ref.current;
    if (!box) return;
    const measure = () => {
      const on = box.querySelector<HTMLElement>("button.on");
      setInd(on ? { x: on.offsetLeft, w: on.offsetWidth } : null);
    };
    measure();
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(measure) : null;
    ro?.observe(box);
    return () => ro?.disconnect();
  }, [value, options.length]);
  useEffect(() => {
    if (!ind || ready) return;
    const r = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(r);
  }, [ind, ready]);
  return (
    <div ref={ref} className={`seg ${full ? "full" : ""} ${ready ? "ready" : ""}`} role="radiogroup" aria-label={label}>
      {ind && <span className="seg-ind" aria-hidden="true" style={{ width: ind.w, transform: `translateX(${ind.x}px)` }} />}
      {options.map((o) => (
        <button key={o.id} type="button" role="radio" aria-checked={o.id === value} className={o.id === value ? "on" : ""} onClick={() => onChange(o.id)}>
          {o.sq && <Sq s={o.sq} />}
          {o.label}
          {o.n != null && o.n > 0 && <span className="n">{o.n}</span>}
        </button>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ the squares meter
/** A budget as a row of squares: used ones black, red once 80 % is gone; a red tick where the guardian's extra
 *  check starts. */
export function Meter({ used, max, n = 20, cos, tall, label }: { used: number; max: number; n?: number; cos?: number; tall?: boolean; label?: string }) {
  const r = max > 0 ? Math.min(1, used / max) : 0;
  const on = used > 0 ? Math.max(1, Math.round(r * n)) : 0;
  const hot = r >= 0.8;
  return (
    <div
      className={`meter ${tall ? "tall" : ""}`}
      style={{ "--n": n } as CSSProperties}
      role="meter"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={used}
      aria-label={label}
    >
      {Array.from({ length: n }, (_, k) => (
        <i key={k} className={k < on ? (hot ? "hot" : "on") : ""} style={{ "--k": k } as CSSProperties} />
      ))}
      {cos != null && max > 0 && cos < max && <b style={{ left: `${(cos / max) * 100}%` }} title="Extra guardian check above this" />}
    </div>
  );
}

// ------------------------------------------------------------------ numbers that ease to their new value
export function Tween({ value, format }: { value: number; format: (n: number) => string }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const a = from.current;
    if (a === value || reduceMotion()) {
      from.current = value;
      setShown(value);
      return;
    }
    const t0 = performance.now();
    const dur = 700;
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / dur);
      const e = 1 - Math.pow(1 - k, 4);
      const v = a + (value - a) * e;
      from.current = v;
      setShown(v);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <span className="num">{format(shown)}</span>;
}

// ------------------------------------------------------------------ time
/** Re-render every `ms`, so "2m ago" stays true. */
export function useNow(ms = 30000) {
  const [, set] = useState(0);
  useEffect(() => {
    const t = setInterval(() => set((x) => x + 1), ms);
    return () => clearInterval(t);
  }, [ms]);
}

// ------------------------------------------------------------------ overlays: presence, stack, focus, scroll
/** Mount on open, then mark open on the next frame (so the way in animates); on close mark closing, unmount
 *  when the way out is over. */
export function usePresence(open: boolean, outMs: number) {
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (open) {
      setMounted(true);
      let r2 = 0;
      const r1 = requestAnimationFrame(() => (r2 = requestAnimationFrame(() => setShown(true))));
      return () => {
        cancelAnimationFrame(r1);
        cancelAnimationFrame(r2);
      };
    }
    setShown(false);
    const t = setTimeout(() => setMounted(false), reduceMotion() ? 0 : outMs);
    return () => clearTimeout(t);
  }, [open, outMs]);
  return { mounted, shown, closing: mounted && !open };
}

/** Keep showing the last real value while a closing overlay plays its way out. */
export function useLatest<T>(v: T | null | undefined): T | null {
  const ref = useRef<T | null>(v ?? null);
  if (v != null) ref.current = v;
  return ref.current;
}

const stack: number[] = [];
let stackSeq = 0;
let locks = 0;
function lockScroll(on: boolean) {
  const el = document.documentElement;
  if (on) {
    if (locks++ === 0) {
      const w = window.innerWidth - el.clientWidth;
      el.style.overflow = "hidden";
      if (w > 0) el.style.paddingRight = `${w}px`;
    }
  } else if (--locks === 0) {
    el.style.overflow = "";
    el.style.paddingRight = "";
  }
}
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** While `active`: this overlay is on top of the stack, Escape closes it, Tab stays inside it, the page under it
 *  does not scroll; on the way out focus goes back where it was. */
function useOverlay(ref: React.RefObject<HTMLElement | null>, active: boolean, onClose?: () => void) {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!active) return;
    const id = ++stackSeq;
    stack.push(id);
    lockScroll(true);
    const before = document.activeElement as HTMLElement | null;
    const el = ref.current;
    const first = el?.querySelector<HTMLElement>("[autofocus]") ?? el?.querySelector<HTMLElement>(FOCUSABLE) ?? el;
    requestAnimationFrame(() => first?.focus({ preventScroll: true }));
    const onKey = (e: KeyboardEvent) => {
      if (stack[stack.length - 1] !== id) return;
      if (e.key === "Escape" && close.current) {
        e.preventDefault();
        close.current();
      }
      if (e.key === "Tab" && el) {
        const f = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((x) => x.offsetParent !== null);
        if (!f.length) return;
        const a = f[0];
        const b = f[f.length - 1];
        if (e.shiftKey && document.activeElement === a) {
          e.preventDefault();
          b.focus();
        } else if (!e.shiftKey && document.activeElement === b) {
          e.preventDefault();
          a.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      const i = stack.indexOf(id);
      if (i >= 0) stack.splice(i, 1);
      lockScroll(false);
      before?.focus?.({ preventScroll: true });
    };
  }, [active, ref]);
}

export function Dialog({ open, onClose, wide, confirm, label, children }: { open: boolean; onClose?: () => void; wide?: boolean; confirm?: boolean; label: string; children: ReactNode }) {
  const { mounted, shown, closing } = usePresence(open, 220);
  const ref = useRef<HTMLDivElement>(null);
  useOverlay(ref, mounted && !closing, onClose);
  if (!mounted) return null;
  const st = shown && !closing ? { "data-open": "" } : {};
  return (
    <>
      <div className={`scrim top ${closing ? "closing" : ""}`} {...st} />
      <div className="dialog-wrap" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
        <div ref={ref} className={`dialog ${wide ? "wide" : ""} ${confirm ? "confirm" : ""} ${closing ? "closing" : ""}`} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1} {...st}>
          {onClose && (
            <button type="button" className="icon-btn dialog-x" aria-label="Close" onClick={onClose}>
              <Icon name="x" size={18} />
            </button>
          )}
          {children}
        </div>
      </div>
    </>
  );
}

export function Drawer({ open, onClose, head, foot, label, children }: { open: boolean; onClose: () => void; head: ReactNode; foot?: ReactNode; label: string; children: ReactNode }) {
  const { mounted, shown, closing } = usePresence(open, 260);
  const ref = useRef<HTMLDivElement>(null);
  useOverlay(ref, mounted && !closing, onClose);
  if (!mounted) return null;
  const st = shown && !closing ? { "data-open": "" } : {};
  return (
    <>
      <div className={`scrim ${closing ? "closing" : ""}`} {...st} onMouseDown={onClose} />
      <aside ref={ref} className={`drawer ${closing ? "closing" : ""}`} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1} {...st}>
        <div className="drawer-h">
          {head}
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
            <Icon name="x" size={18} />
          </button>
        </div>
        <div className="drawer-b">{children}</div>
        {foot && <div className="drawer-f">{foot}</div>}
      </aside>
    </>
  );
}

/** Close a popover on a click outside it or on Escape. */
export function useDismiss(ref: React.RefObject<HTMLElement | null>, open: boolean, close: () => void) {
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", down);
      document.removeEventListener("keydown", key);
    };
  }, [ref, open, close]);
}

// ------------------------------------------------------------------ toasts
/** `busy` shows the red box loader in place of the square, for something still going. */
export type ToastIn = { tone: Tone; title?: string; text: string; ms?: number; sticky?: boolean; busy?: boolean; action?: { label: string; run: () => void } };
type ToastT = ToastIn & { id: number; v: number; out?: boolean };
let list: ToastT[] = [];
let seq = 0;
const subs = new Set<() => void>();
const emitToasts = () => subs.forEach((f) => f());

export const toasts = {
  show(t: ToastIn) {
    const id = ++seq;
    list = [...list.filter((x) => !x.out).slice(-3), { ...t, id, v: 0 }];
    emitToasts();
    return id;
  },
  update(id: number, patch: Partial<ToastIn>) {
    if (!list.some((x) => x.id === id)) return toasts.show({ tone: "ok", text: "", ...patch } as ToastIn);
    list = list.map((x) => (x.id === id ? { ...x, ...patch, v: x.v + 1 } : x));
    emitToasts();
    return id;
  },
  dismiss(id: number) {
    list = list.map((x) => (x.id === id ? { ...x, out: true } : x));
    emitToasts();
    setTimeout(() => {
      list = list.filter((x) => x.id !== id);
      emitToasts();
    }, 230);
  },
};
const subscribe = (f: () => void) => {
  subs.add(f);
  return () => {
    subs.delete(f);
  };
};

/** The toasts: a red hairline drains while one waits to leave (a pointer over it holds it); sticky ones stay
 *  until they are updated or closed. */
export function Toasts() {
  const items = useSyncExternalStore(subscribe, () => list);
  return (
    <div className="toasts" role="status" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={`toast ${t.tone} ${t.out ? "out" : ""}`}>
          {t.busy ? <Px /> : <Sq s={t.tone} />}
          <div className="toast-b">
            {t.title && <span className="lbl">{t.title}</span>}
            <p>{t.text}</p>
            {t.action && (
              <button
                type="button"
                className="link"
                onClick={() => {
                  t.action!.run();
                  toasts.dismiss(t.id);
                }}
              >
                {t.action.label} <span className="arr">→</span>
              </button>
            )}
          </div>
          <button type="button" className="icon-btn" aria-label="Dismiss" onClick={() => toasts.dismiss(t.id)}>
            <Icon name="x" size={15} />
          </button>
          {!t.sticky && !t.out && (
            <span
              key={t.v}
              className="toast-t"
              style={{ animationDuration: `${t.ms ?? 6000}ms` }}
              onAnimationEnd={() => toasts.dismiss(t.id)}
            />
          )}
        </div>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ press and hold
/** For what cannot be undone: hold for `ms` (pointer, or Space / Enter); let go early and it drains back. */
export function HoldButton({ ms = 900, onDone, disabled, busy, children, kind = "red" }: { ms?: number; onDone: () => void; disabled?: boolean; busy?: string | false | null; children: ReactNode; kind?: "red" | "ink" }) {
  const ref = useRef<HTMLButtonElement>(null);
  const raf = useRef(0);
  const p = useRef(0);
  const holding = useRef(false);
  const done = useRef(onDone);
  done.current = onDone;
  const paint = () => ref.current?.style.setProperty("--p", p.current.toFixed(4));
  const run = useCallback(
    (dir: 1 | -1) => {
      cancelAnimationFrame(raf.current);
      let last = performance.now();
      const tick = (t: number) => {
        const dt = t - last;
        last = t;
        p.current = Math.min(1, Math.max(0, p.current + (dir * dt) / (dir > 0 ? ms : ms * 0.45)));
        paint();
        if (dir > 0 && p.current >= 1) {
          holding.current = false;
          p.current = 0;
          paint();
          done.current();
          return;
        }
        if ((dir > 0 && holding.current) || (dir < 0 && p.current > 0)) raf.current = requestAnimationFrame(tick);
      };
      raf.current = requestAnimationFrame(tick);
    },
    [ms],
  );
  const start = () => {
    if (disabled || busy || holding.current) return;
    holding.current = true;
    run(1);
  };
  const stop = () => {
    if (!holding.current) return;
    holding.current = false;
    run(-1);
  };
  useEffect(() => () => cancelAnimationFrame(raf.current), []);
  return (
    <button
      ref={ref}
      type="button"
      className={`btn ${kind} lg holdbtn`}
      disabled={disabled || !!busy}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture?.(e.pointerId);
        start();
      }}
      onPointerUp={stop}
      onPointerCancel={stop}
      onLostPointerCapture={stop}
      onKeyDown={(e) => {
        if ((e.key === " " || e.key === "Enter") && !e.repeat) {
          e.preventDefault();
          start();
        }
      }}
      onKeyUp={(e) => (e.key === " " || e.key === "Enter") && stop()}
      onContextMenu={(e) => e.preventDefault()}
    >
      <span>{busy ? <><Px />{busy}</> : children}</span>
      <i aria-hidden="true">
        <b>→</b>
      </i>
    </button>
  );
}

// ------------------------------------------------------------------ a wallet's face
/** A wallet at a glance: 5 x 5 LED squares, mirrored left to right, read from its address. */
export function Identicon({ address, size = 30 }: { address: string; size?: number }) {
  const hex = address.toLowerCase().replace(/^0x/, "").padEnd(40, "0");
  const n = (i: number) => parseInt(hex[i], 16) || 0;
  const cells: { x: number; y: number; on: number }[] = [];
  for (let y = 0; y < 5; y++)
    for (let x = 0; x < 3; x++) {
      const on = n(y * 3 + x) >= 8 ? (n(20 + y * 3 + x) >= 6 ? 2 : 1) : 0;
      cells.push({ x, y, on });
      if (x < 2) cells.push({ x: 4 - x, y, on });
    }
  if (!cells.some((c) => c.on)) cells[cells.length - 1].on = 2;
  return (
    <svg className="idn" width={size} height={size} viewBox="0 0 30 30" aria-hidden="true">
      <rect className="idn-bg" width="30" height="30" rx="7" />
      {cells.map((c) => (
        <rect key={`${c.x}.${c.y}`} className={c.on === 2 ? "on" : c.on ? "dim" : "off"} x={3 + c.x * 5} y={3 + c.y * 5} width="4" height="4" />
      ))}
    </svg>
  );
}

// ------------------------------------------------------------------ copy
export function Copy({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => setDone(false), 1400);
    return () => clearTimeout(t);
  }, [done]);
  return (
    <button
      type="button"
      className="icon-btn"
      aria-label={done ? "Copied" : `${label}`}
      title={done ? "Copied" : label}
      onClick={() => {
        navigator.clipboard?.writeText(text).then(() => setDone(true), () => {});
      }}
    >
      <Icon name={done ? "check" : "copy"} size={15} />
    </button>
  );
}

// ------------------------------------------------------------------ small things
export function Empty({ title, text, children }: { title: string; text: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <b>{title}</b>
      <p>{text}</p>
      {children}
    </div>
  );
}

/** Remember which rows were already on screen, so only new ones play their way in, and which changed state. */
export function useArrivals<T extends { id: string; status: string }>(items: T[]) {
  const seen = useRef<Map<string, string> | null>(null);
  const first = seen.current === null;
  const marks = new Map<string, "new" | "flash">();
  if (!first) {
    for (const o of items) {
      const was = seen.current!.get(o.id);
      if (was === undefined) marks.set(o.id, "new");
      else if (was !== o.status) marks.set(o.id, "flash");
    }
  }
  useLayoutEffect(() => {
    const m = new Map<string, string>();
    for (const o of items) m.set(o.id, o.status);
    seen.current = m;
  });
  return marks;
}
