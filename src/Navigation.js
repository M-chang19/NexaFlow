// src/navigation.js
// Logic for the sidebar tabs: URL per tab (back/forward work), remembered tab,
// page titles, "g then key" shortcuts, and badge counts.
import { useCallback, useEffect, useRef, useState } from "react";

const LAST_VIEW_KEY = "nexaflow-last-view";

// Views that can't be reopened from a bare URL (they need a selected record).
const URL_FALLBACKS = { projectDetail: "projects" };

// "g" then a key jumps to a tab, for example g t = My tasks.
export const TAB_SHORTCUTS = {
  o: "overview",
  d: "dayPlan",
  t: "tasks",
  i: "inbox",
  b: "board",
  c: "calendar",
  g: "goals",
  w: "weeklyReview",
  p: "projects",
  n: "notes",
  e: "templates",
  y: "activity",
  f: "focus",
  a: "assistant",
  s: "settings"
};

function viewFromHash(validViews) {
  const name = window.location.hash.replace(/^#\/?/, "");
  return validViews.includes(name) ? name : null;
}

function viewFromStorage(validViews) {
  try {
    const saved = localStorage.getItem(LAST_VIEW_KEY);
    return saved && validViews.includes(saved) ? saved : null;
  } catch {
    return null;
  }
}

/**
 * Drop-in replacement for useState("overview") for the active tab.
 * Returns [activeView, setActiveView].
 */
export function useViewRouter(validViews, defaultView = "overview", titles = {}) {
  const validRef = useRef(validViews);
  validRef.current = validViews;
  const [view, setView] = useState(() => viewFromHash(validViews) || viewFromStorage(validViews) || defaultView);
  const firstRun = useRef(true);

  const setActiveView = useCallback(next => {
    setView(current => {
      const resolved = typeof next === "function" ? next(current) : next;
      return validRef.current.includes(resolved) ? resolved : current;
    });
  }, []);

  // Keep the URL, saved tab and page title in step with the active tab.
  useEffect(() => {
    const urlView = URL_FALLBACKS[view] || view;
    if (viewFromHash(validRef.current) !== urlView) {
      const url = `${window.location.pathname}${window.location.search}#/${urlView}`;
      if (firstRun.current) window.history.replaceState(null, "", url);
      else window.history.pushState(null, "", url);
    }
    firstRun.current = false;
    try { localStorage.setItem(LAST_VIEW_KEY, urlView); } catch { /* storage unavailable */ }
    if (titles[view]) document.title = `${titles[view]} · NexaFlow`;
  }, [view]);

  // Back/forward buttons and edited URLs.
  useEffect(() => {
    const onHashChange = () => {
      const next = viewFromHash(validRef.current);
      if (next) setView(next);
    };
    window.addEventListener("hashchange", onHashChange);
    window.addEventListener("popstate", onHashChange);
    return () => {
      window.removeEventListener("hashchange", onHashChange);
      window.removeEventListener("popstate", onHashChange);
    };
  }, []);

  return [view, setActiveView];
}

/** "g" then a letter switches tabs. Ignored while typing or when a dialog is open. */
export function useTabShortcuts(navigate) {
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

  useEffect(() => {
    let armedUntil = 0;
    function onKeyDown(event) {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (document.querySelector("dialog[open]")) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || target.matches("input, textarea, select, [role='textbox']"))) return;
      const key = event.key.toLowerCase();
      if (Date.now() < armedUntil) {
        armedUntil = 0;
        const view = TAB_SHORTCUTS[key];
        if (view) {
          event.preventDefault();
          navigateRef.current(view);
        }
        return;
      }
      if (key === "g") armedUntil = Date.now() + 1200;
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}

/** Counts shown next to tabs. Only non-zero counts need to be rendered. */
export function getTabBadges(state) {
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const open = (state.tasks || []).filter(task => task.status !== "done");
  return {
    tasks: open.length,
    inbox: open.filter(task => task.inbox).length,
    calendar: open.filter(task => task.dueDate && task.dueDate < todayKey).length, // overdue
    board: open.filter(task => task.status === "waiting").length // waiting on someone
  };
}