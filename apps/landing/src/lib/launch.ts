// Going into the web app: the three panels of the opening sweep in from the left and cover the page (the last one
// black, the ground the app's opening starts from), then the app loads. A note in the session tells the app to
// play its opening on arrival. A click with a modifier (new tab, new window) is left to the browser, and with
// reduced motion the link simply goes.
import type { MouseEvent } from "react";
import { reduceMotion } from "./motion";

// the last panel's 520 ms sweep after its 100 ms delay (header.css), and a frame to spare
const SWEEP_MS = 640;

export function goToApp(e: MouseEvent<HTMLAnchorElement>) {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const href = e.currentTarget.href;
  try {
    sessionStorage.setItem("ks.enter", "1");
  } catch {
    // private mode: the app opens without its opening
  }
  if (reduceMotion()) return;
  e.preventDefault();
  const cover = document.createElement("div");
  cover.className = "launch";
  cover.setAttribute("aria-hidden", "true");
  cover.innerHTML = "<i></i><i></i><i></i>";
  document.body.append(cover);
  document.documentElement.classList.add("is-launching");
  requestAnimationFrame(() => requestAnimationFrame(() => cover.classList.add("is-on")));
  setTimeout(() => location.assign(href), SWEEP_MS);
}

// back from the app: the browser may bring this page back as it was left, cover and all
if (typeof window !== "undefined")
  addEventListener("pageshow", (e) => {
    if (!e.persisted) return;
    document.querySelectorAll(".launch").forEach((n) => n.remove());
    document.documentElement.classList.remove("is-launching");
  });
