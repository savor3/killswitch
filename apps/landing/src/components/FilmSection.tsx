// The product film on black satin, after the reference site's product video: a 16:9 film of the app (made
// from src/film, recorded to public/media/killswitch-film.mp4) centred in a wide box. It plays only while
// the box is on screen; with reduced motion it rests on its poster with the player's own controls.
import { useEffect, useRef, useState } from "react";
import fabricS from "../assets/media/film-fabric-1280.webp";
import fabric from "../assets/media/film-fabric.webp";
import { reduceMotion, useScrollFrame } from "../lib/motion";
import { PixelTrail } from "./PixelTrail";
import { WordReveal } from "./WordReveal";

export function FilmSection() {
  const box = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [still] = useState(reduceMotion);

  useEffect(() => {
    const el = box.current;
    const v = video.current;
    if (!el || !v || still) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          v.preload = "auto";
          v.play().catch(() => {});
        } else v.pause();
      },
      { threshold: 0.2 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [still]);

  // the box comes up the screen a little small and settles to full size as it arrives: scrubbed by the
  // scroll, a transform only, measured from layout offsets so the scale never feeds back into the measure
  useScrollFrame(() => {
    const el = box.current;
    if (!el || still) return;
    let y = 0;
    for (let n: HTMLElement | null = el; n; n = n.offsetParent as HTMLElement | null) y += n.offsetTop;
    const top = y - window.scrollY;
    const vh = window.innerHeight;
    if (top > vh || top + el.offsetHeight < 0) return;
    const p = Math.min(1, Math.max(0, (vh - top) / (vh * 0.7)));
    const k = 1 - Math.pow(1 - p, 3);
    el.style.transform = k >= 0.999 ? "" : `scale(${(0.94 + 0.06 * k).toFixed(4)})`;
  }, [still]);

  return (
    <section className="film" aria-labelledby="film-h">
      <WordReveal as="h2" id="film-h" className="h2 film-h" text="Your agent asks. Killswitch checks. *You* *decide.*" />
      <div className="film-box" ref={box}>
        <img
          className="film-bg"
          src={fabric}
          srcSet={`${fabricS} 1280w, ${fabric} 2560w`}
          sizes="100vw"
          alt=""
          loading="lazy"
          decoding="async"
        />
        <video
          ref={video}
          className="film-video"
          src="/media/killswitch-film.mp4"
          poster="/media/killswitch-film-poster.webp"
          muted
          loop
          playsInline
          preload="none"
          controls={still}
          aria-label="The Killswitch app: give an agent a budget, every payment checked, an unusual one waiting for you, and one signature that stops every agent."
        />
        <PixelTrail />
      </div>
    </section>
  );
}
