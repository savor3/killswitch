// Smooth scrolling for the wheel and for in-page links: the page glides to where the wheel sends it instead
// of stepping, and a link to a section travels there with one eased motion. Touch screens, the keyboard and
// the scrollbar keep the browser's own scrolling, as does anyone who asks for reduced motion. The page's
// real scroll position is moved every frame, so sticky parts, scroll-linked motion and anchors work as before.
export function smoothScroll(): () => void {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches || !matchMedia("(hover: hover) and (pointer: fine)").matches) {
    return () => {};
  }
  const root = document.documentElement;
  let target = scrollY;
  let pos = scrollY;
  let raf = 0;
  let prev = 0;
  let tween: { from: number; to: number; t0: number; d: number } | null = null;

  const max = () => root.scrollHeight - innerHeight;
  const clamp = (y: number) => Math.max(0, Math.min(max(), y));
  const set = (y: number) => {
    pos = y;
    window.scrollTo({ top: y, behavior: "instant" as ScrollBehavior });
  };
  const step = (now: number) => {
    raf = 0;
    const dt = prev ? Math.min(50, now - prev) : 16.7;
    prev = now;
    if (tween) {
      const k = Math.min(1, (now - tween.t0) / tween.d);
      const e = k < 0.5 ? 8 * k * k * k * k : 1 - Math.pow(-2 * k + 2, 4) / 2;
      set(tween.from + (tween.to - tween.from) * e);
      if (k >= 1) {
        tween = null;
        target = pos;
        prev = 0;
        return;
      }
    } else {
      // eases towards the target, a seventh of the way each frame, the same at any frame rate
      const next = pos + (target - pos) * (1 - Math.exp(-dt / 105));
      if (Math.abs(target - next) < 0.35) {
        set(target);
        prev = 0;
        return;
      }
      set(next);
    }
    raf = requestAnimationFrame(step);
  };
  const run = () => {
    if (!raf) raf = requestAnimationFrame(step);
  };

  // a part of the page with its own scrolling keeps the wheel while it can still move that way
  const ownScroll = (el: Element | null, dy: number) => {
    for (let e = el; e && e !== document.body && e !== root; e = e.parentElement) {
      const s = getComputedStyle(e);
      if ((s.overflowY === "auto" || s.overflowY === "scroll") && e.scrollHeight > e.clientHeight + 1) {
        if (dy > 0 ? e.scrollTop + e.clientHeight < e.scrollHeight - 1 : e.scrollTop > 0) return true;
      }
    }
    return false;
  };

  const onWheel = (e: WheelEvent) => {
    if (e.ctrlKey || e.metaKey || e.defaultPrevented) return; // zooming
    if (root.classList.contains("is-loading") || root.classList.contains("is-menu")) return;
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    if (ownScroll(e.target as Element, e.deltaY)) return;
    e.preventDefault();
    const dy = e.deltaMode === 1 ? e.deltaY * 32 : e.deltaMode === 2 ? e.deltaY * innerHeight : e.deltaY;
    tween = null;
    if (!raf) {
      pos = target = scrollY;
      prev = 0;
    }
    target = clamp(target + dy);
    run();
  };
  // the keyboard, the scrollbar or find-in-page moved the page: start from there next time
  const onScroll = () => {
    if (!raf) pos = target = scrollY;
  };
  const onClick = (e: MouseEvent) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = (e.target as Element | null)?.closest?.('a[href^="#"]') as HTMLAnchorElement | null;
    if (!a) return;
    const id = a.getAttribute("href")!.slice(1);
    const el = id ? document.getElementById(id) : null;
    if (id && !el) return;
    e.preventDefault();
    const to = clamp(!el || id === "top" ? 0 : el.getBoundingClientRect().top + scrollY);
    history.pushState(null, "", `#${id}`);
    tween = { from: scrollY, to, t0: performance.now(), d: Math.min(1700, Math.max(800, Math.abs(to - scrollY) * 0.3)) };
    pos = scrollY;
    prev = 0;
    run();
  };

  addEventListener("wheel", onWheel, { passive: false });
  addEventListener("scroll", onScroll, { passive: true });
  document.addEventListener("click", onClick);
  return () => {
    removeEventListener("wheel", onWheel);
    removeEventListener("scroll", onScroll);
    document.removeEventListener("click", onClick);
    cancelAnimationFrame(raf);
  };
}
