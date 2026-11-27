// Scroll choreography: every element marked `data-rv` comes into place as it scrolls into view, once. The CSS
// in base.css says how ("up" rises, "fade" fades, "scale" grows a little, "self" leaves it to the element's
// own styles); `--rv-i` on an element makes it follow its neighbours one after another. Only opacity and
// transform move, so it stays on the compositor and smooth. With reduced motion everything is simply there.
// Arrival is marked with a `data-in` attribute, not a class: React rewrites the class list of an element whose
// className changes (a row lighting up on hover), but leaves alone an attribute it never rendered.
import { reduceMotion } from "./motion";

export function startReveals(): () => void {
  const els = [...document.querySelectorAll<HTMLElement>("[data-rv]")];
  if (reduceMotion() || !("IntersectionObserver" in window)) {
    els.forEach((e) => e.setAttribute("data-in", ""));
    return () => {};
  }
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        e.target.setAttribute("data-in", "");
        io.unobserve(e.target);
      }
    },
    { rootMargin: "0px 0px -10% 0px", threshold: 0.08 },
  );
  els.forEach((e) => io.observe(e));
  return () => io.disconnect();
}
