import React from "react";
import { createRoot } from "react-dom/client";

const isWorkspace = window.location.pathname.replace(/\/+$/, "") === "/workspace";
const root = createRoot(document.getElementById("root"));

root.render(
  <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", color: "#29263d", fontFamily: "'Segoe UI', sans-serif" }}>
    Loading NexaFlow…
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
