import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { App } from "./App";
import { markPainted } from "./lib/splash";

const el = document.getElementById("propagation-root");
if (el) {
  createRoot(el).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
  // After the first paint, not before it: the cover waits for React to have drawn,
  // for the loader's one full pass, and for the first data (see lib/splash).
  requestAnimationFrame(() => requestAnimationFrame(markPainted));
}
