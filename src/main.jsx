import React from "react";
import { createRoot } from "react-dom/client";

const isWorkspace = window.location.pathname.replace(/\/+$/, "") === "/workspace";
const root = createRoot(document.getElementById("root"));

root.render(
  <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: "24px", background: "#f4f6f1", color: "#1b2b22", fontFamily: "'Segoe UI', sans-serif" }} aria-live="polite">
    <div style={{ display: "grid", gap: "12px", justifyItems: "center", textAlign: "center" }}>
      <div style={{ width: "44px", height: "44px", borderRadius: "12px", background: "linear-gradient(145deg, #6b5bd3, #8a7fe6)", boxShadow: "0 12px 24px rgba(107, 91, 211, .25)" }} />
      <strong style={{ fontSize: "1rem", letterSpacing: ".06em", textTransform: "uppercase" }}>Loading NexaFlow</strong>
      <span style={{ color: "#5f6d64", fontSize: "0.95rem" }}>Preparing your workspace…</span>
    </div>
  </main>
);

const page = isWorkspace ? import("./App.jsx") : import("./LandingPage.jsx");
page.then(({ default: Page }) => {
  root.render(
    <React.StrictMode>
      <Page />
    </React.StrictMode>
  );
}).catch(error => {
  console.error("Could not load the NexaFlow page:", error);
  root.render(
    <main role="alert" style={{ minHeight: "100vh", display: "grid", placeContent: "center", gap: "12px", padding: "24px", color: "#29263d", fontFamily: "'Segoe UI', sans-serif" }}>
      <strong>NexaFlow couldn’t load.</strong>
      <span>Check your connection, then reload the page.</span>
      <button onClick={() => window.location.reload()}>Reload</button>
    </main>
  );
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").then(registration => registration.update()).catch(error => {
      console.error("Could not update the NexaFlow offline worker:", error);
    });
  });
}
