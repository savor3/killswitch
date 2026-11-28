import { useCallback, useEffect, useState } from "react";
import { Developers } from "./components/Developers";
import { FilmSection } from "./components/FilmSection";
import { Footer } from "./components/Footer";
import { Header } from "./components/Header";
import { Hero } from "./components/Hero";
import { Loader } from "./components/Loader";
import { Security } from "./components/Security";
import { Story } from "./components/Story";
import { Token } from "./components/Token";
import { Workflow } from "./components/Workflow";
import { RevealContext } from "./lib/motion";
import { startReveals } from "./lib/reveal";
import { smoothScroll } from "./lib/smooth";

const INTRO_SEEN = "ks.intro";
const introSeen = () => {
  try {
    return sessionStorage.getItem(INTRO_SEEN) === "1";
  } catch {
    return false;
  }
};

export function App() {
  // The opening plays once a visit: coming back from another page of the site, or straight to a section of
  // this one (/#security), goes to the page at once.
  const [intro] = useState(() => !location.hash && !introSeen());
  const [revealed, setRevealed] = useState(false);
  const onReveal = useCallback(() => setRevealed(true), []);
  useEffect(() => {
    try {
      sessionStorage.setItem(INTRO_SEEN, "1");
    } catch {
      // private mode: the opening simply plays again next time
    }
  }, []);
  useEffect(() => {
    document.documentElement.classList.toggle("is-revealed", revealed);
  }, [revealed]);
  useEffect(() => smoothScroll(), []);
  // the page's scroll choreography starts once the loader has gone, so nothing plays behind it
  useEffect(() => (revealed ? startReveals() : undefined), [revealed]);
  // arriving at a section from another page: the page is drawn by script, after the browser looked for it
  useEffect(() => {
    if (!revealed || !location.hash) return;
    document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView({ behavior: "instant" as ScrollBehavior });
  }, [revealed]);

  return (
    <RevealContext.Provider value={revealed}>
      <Loader onReveal={onReveal} skip={!intro} />
      <div className="page">
        <Header />
        <main id="top">
          <Hero />
          <FilmSection />
          <Story />
          <Workflow />
          <Security />
          <Developers />
          <Token />
        </main>
        <Footer />
      </div>
    </RevealContext.Provider>
  );
}
