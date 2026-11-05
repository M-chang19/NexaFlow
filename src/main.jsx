import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import LandingPage from "./LandingPage.jsx";
import "./styles.css";

const isWorkspace = window.location.pathname.replace(/\/+$/, "") === "/workspace";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {isWorkspace ? <App /> : <LandingPage />}
  </React.StrictMode>
);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").then(registration => registration.update()).catch(error => {
      console.error("Could not update the NexaFlow offline worker:", error);
    });
  });
}
