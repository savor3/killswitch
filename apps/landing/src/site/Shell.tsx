// The frame of every page but the home page: the bar along the top, the page, the footer. There is no opening
// loader here (it belongs to the home page); the scroll choreography and the wheel smoothing start at once.
import { useEffect, type ReactNode } from "react";
import { Footer } from "../components/Footer";
import { Header } from "../components/Header";
import { RevealContext } from "../lib/motion";
import { startReveals } from "../lib/reveal";
import { smoothScroll } from "../lib/smooth";
import { PathContext } from "./where";

export function Shell({ path, className = "", children }: { path: string; className?: string; children: ReactNode }) {
  useEffect(() => smoothScroll(), []);
  useEffect(() => startReveals(), []);
  return (
    <PathContext.Provider value={path}>
      <RevealContext.Provider value={true}>
        <div className={`page ${className}`}>
          <Header />
          <main id="top">{children}</main>
          <Footer />
        </div>
      </RevealContext.Provider>
    </PathContext.Provider>
  );
}
