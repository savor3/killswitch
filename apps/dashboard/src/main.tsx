import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles/base.css";
import "./styles/shell.css";
import "./styles/pages.css";
import "./styles/overlays.css";
import "./styles/gate.css";

createRoot(document.getElementById("root")!).render(<App />);

// installable, with its shell kept for offline; registered beside the app (at /app/ on the site), so it only
// ever looks after the app
if ("serviceWorker" in navigator && !import.meta.env.DEV) navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`);
