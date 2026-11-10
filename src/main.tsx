import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import katex from "katex";
import "katex/dist/katex.min.css";
import "./index.css";
import App from "./App";

// Делаем локально собранный KaTeX доступным сразу без обращения к внешним CDN (работает без VPN и офлайн)
if (typeof window !== "undefined") {
  (window as unknown as { katex: typeof katex }).katex = katex;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
