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

export function App() {
  const [revealed, setRevealed] = useState(false);
  const onReveal = useCallback(() => setRevealed(true), []);
  useEffect(() => {
    document.documentElement.classList.toggle("is-revealed", revealed);
  }, [revealed]);
  useEffect(() => smoothScroll(), []);
  // the page's scroll choreography starts once the loader has gone, so nothing plays behind it
  useEffect(() => (revealed ? startReveals() : undefined), [revealed]);

  return (
    <RevealContext.Provider value={revealed}>
      <Loader onReveal={onReveal} />
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
