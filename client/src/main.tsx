/** Observatory Nightfall bootstrap: a local-first React experience with offline worker registration. */
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Offline enhancement is optional; the app remains usable without registration.
    });
  });
}
