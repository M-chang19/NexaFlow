import "./styles.css";
import "./redesign.css";
import {
  ActivityPage,
  AssistantPage,
  BoardPage,
  CalendarPage,
  ConnectionStatus,
  CreateDialog,
  FirstRunDialog,
  FocusPage,
  makeId,
  nextRecurringTask,
  NotesPage,
  Overview,
  ProjectsPage,
  ProjectDetailPage,
  SearchResults,
  SettingsPage,
  ShortcutsDialog,
  splitTags,
  TasksPage,
  todayKey,
  WorkspaceErrorBoundary
} from "./WorkspacePages.jsx";
import { Fragment, lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { createCalendarFile } from "./calendarExport.js";
const GoalsPage = lazy(() => import("./ProductivityPages.jsx").then(module => ({ default: module.GoalsPage })));
const TemplatesPage = lazy(() => import("./ProductivityPages.jsx").then(module => ({ default: module.TemplatesPage })));
const PlanMyDay = lazy(() => import("./PlanningPages.jsx").then(module => ({ default: module.PlanMyDay })));
const QuickCaptureInbox = lazy(() => import("./PlanningPages.jsx").then(module => ({ default: module.QuickCaptureInbox })));
const WeeklyReview = lazy(() => import("./PlanningPages.jsx").then(module => ({ default: module.WeeklyReview })));
import {
  authenticateSupabase,
  readSupabaseSession,
  readSupabaseWorkspace,
  readSyncSettings,
  requestSelfHostedWorkspace,
  saveSyncSettings,
  signOutSupabase as revokeSupabaseSession,
  writeSupabaseSession,
  writeSupabaseWorkspace
} from "./sync.js";

const EMPTY_STATE = { projects: [], tasks: [], notes: [], messages: [], activity: [], goals: [], templates: [] };
const OVERVIEW_PANELS = [
  { id: "hero", label: "Welcome banner" },
  { id: "tasks", label: "Next steps" },
  { id: "insights", label: "Progress and priorities" },
  { id: "activity", label: "Recent activity" },
  { id: "stats", label: "Workspace summary" },
  { id: "focus", label: "Focus suggestion" }
];
const OVERVIEW_PANEL_GROUPS = {
  main: ["hero", "tasks", "insights", "activity"],
  side: ["stats", "focus"]
};
const DEFAULT_OVERVIEW_PREFERENCES = {
  order: OVERVIEW_PANELS.map(panel => panel.id),
  visible: OVERVIEW_PANELS.map(panel => panel.id)
};
const VIEW_TITLES = {
  overview: "Overview",
  tasks: "My tasks",
  calendar: "Calendar",
  activity: "Activity history",
  board: "Kanban board",
  focus: "Focus timer",
  projectDetail: "Project details",
  projects: "Projects",
  assistant: "AI assistant",
  notes: "Notes",
  settings: "Settings",
  goals: "Goals & milestones",
  templates: "Templates",
  dayPlan: "Plan my day",
  inbox: "Quick-capture inbox",
  weeklyReview: "Weekly review"
};

function readSavedTaskViews() {
  try {
    const saved = JSON.parse(localStorage.getItem("nexaflow-saved-task-views") || "[]");
    return Array.isArray(saved) ? saved.filter(view => view && typeof view.id === "string" && typeof view.name === "string" && view.filters && typeof view.filters === "object") : [];
  } catch (error) {
    console.error("Could not read saved task views:", error);
    return [];
  }
}
function readOverviewPreferences() {
  try {
    const saved = JSON.parse(localStorage.getItem("nexaflow-overview-preferences") || "null");
    if (!saved || typeof saved !== "object" || Array.isArray(saved)) return DEFAULT_OVERVIEW_PREFERENCES;
    const validIds = new Set(OVERVIEW_PANELS.map(panel => panel.id));
    const order = Array.isArray(saved.order) ? saved.order.filter(id => validIds.has(id)) : [];
    const visible = Array.isArray(saved.visible) ? saved.visible.filter(id => validIds.has(id)) : [];
    return {
      order: [...new Set([...order, ...DEFAULT_OVERVIEW_PREFERENCES.order])],
      visible: visible.length ? [...new Set(visible)] : DEFAULT_OVERVIEW_PREFERENCES.visible
    };
  } catch (error) {
    console.error("Could not read overview preferences:", error);
    return DEFAULT_OVERVIEW_PREFERENCES;
  }
}



function logActivity(state, label, projectId = "") {
  return [{ id: makeId(), label, projectId, createdAt: new Date().toISOString() }, ...(state.activity || [])].slice(0, 100);
}

function playFocusCompletionSound() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const playNote = (freq, start, duration) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, ctx.currentTime + start);
      gain.gain.setValueAtTime(0.12, ctx.currentTime + start);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime + start + duration);
    };
    playNote(523.25, 0, 0.6); // C5
    playNote(659.25, 0.22, 0.6); // E5
    playNote(783.99, 0.44, 0.9); // G5
  } catch {
    // AudioContext blocked or unsupported
  }
}



async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers }
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || `Request failed (${response.status}).`);
  return result;
}



export default function App() {
  const [state, setState] = useState(EMPTY_STATE);
  const [savedTaskViews, setSavedTaskViews] = useState(readSavedTaskViews);
  const [ready, setReady] = useState(false);
  const [syncSettings, setSyncSettingsState] = useState(readSyncSettings);
  const [syncSession, setSyncSession] = useState(readSupabaseSession);
  const [syncStatus, setSyncStatus] = useState("Saved on this device.");
  const [overviewPreferences, setOverviewPreferences] = useState(readOverviewPreferences);
  const [activeView, setActiveView] = useState("overview");
  const [showFirstRun, setShowFirstRun] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [aiConfigured, setAiConfigured] = useState(false);
  const [aiModel, setAiModel] = useState("gpt-4o-mini");
  const [dataFile, setDataFile] = useState("");
  const [saveStatus, setSaveStatus] = useState({ label: "Connecting…", kind: "" });
  const [connectionError, setConnectionError] = useState("");
  const [toast, setToast] = useState(null);
  const [createItem, setCreateItem] = useState(null);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [globalQuery, setGlobalQuery] = useState("");
  const [focusMessageId, setFocusMessageId] = useState("");
  const [installPrompt, setInstallPrompt] = useState(null);
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem("nexaflow-theme") === "dark");
  const [isOnline, setIsOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));
  const [timer, setTimer] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("nexaflow-focus-timer") || "{}");
      const remaining = saved.running ? Math.max(0, Math.ceil((saved.endsAt - Date.now()) / 1000)) : saved.remaining;
      return { duration: saved.duration || 25, remaining: Number.isFinite(remaining) ? remaining : 1500, running: Boolean(saved.running && remaining > 0), endsAt: saved.endsAt || 0, taskId: saved.taskId || "" };
    } catch {
      return { duration: 25, remaining: 1500, running: false, endsAt: 0, taskId: "" };
    }
  });
  const saveQueue = useRef(Promise.resolve());
  const saveTimer = useRef(null);
  const toastTimer = useRef(null);
  const searchInputRef = useRef(null);
  const undoRef = useRef(null);
  const firedReminderKeys = useRef(new Set());
  const syncWarningShown = useRef(false);
  const reminderHistoryWarningShown = useRef(false);
  const stateRef = useRef(state);
  const syncSettingsRef = useRef(syncSettings);
  const syncSessionRef = useRef(syncSession);
  const syncRevisionRef = useRef({ revision: 0, exists: false });
  const syncReadyRef = useRef(true);
  stateRef.current = state;
  syncSettingsRef.current = syncSettings;
  syncSessionRef.current = syncSession;

  function notify(message, type = "success") {
    setToast({ message, type });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => { undoRef.current = null; setToast(null); }, 5000);
  }

  function offerUndo(message, reverse) {
    undoRef.current = reverse;
    setToast({ message, type: "success", actionLabel: "Undo" });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => { undoRef.current = null; setToast(null); }, 7000);
  }

  function undoLastChange() {
    const reverse = undoRef.current;
    if (!reverse) return;
    undoRef.current = null;
    clearTimeout(toastTimer.current);
    setState(current => reverse(current));
    setToast({ message: "Change undone", type: "success" });
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  }

  function persist(nextState) {
    if (!ready) {
      setSaveStatus({ label: "Server unavailable", kind: "error" });
      notify("Your local server is not connected. Start it before saving workspace changes.", "error");
      return Promise.resolve(false);
    }
    clearTimeout(saveTimer.current);
    setSaveStatus({ label: "Saving…", kind: "saving" });
    const snapshot = JSON.stringify(nextState);
    const activeSettings = syncSettingsRef.current;
    const activeSession = syncSessionRef.current;
    try {
      localStorage.setItem("nexaflow-workspace-cache", snapshot);
      localStorage.setItem(activeSettings.mode === "local" ? "nexaflow-workspace-dirty" : "nexaflow-sync-dirty", "true");
    } catch (error) {
      setSaveStatus({ label: "Local storage unavailable", kind: "error" });
      notify(`Could not save an offline copy: ${error.message}`, "error");
      return Promise.resolve(false);
    }
    if (activeSettings.mode !== "local" && !syncReadyRef.current) {
      setSaveStatus({ label: "Saved on this device", kind: "offline" });
      setSyncStatus("Your changes are saved on this device. Connect and choose whether to load or upload before syncing.");
      if (!syncWarningShown.current) {
        notify("Your changes are saved on this device. Connect your sync account or server to sync them.", "error");
        syncWarningShown.current = true;
      }
      return Promise.resolve(false);
    }
    syncWarningShown.current = false;
    saveQueue.current = saveQueue.current.catch(() => false).then(async () => {
      if (activeSettings.mode === "supabase") {
        const currentRevision = syncRevisionRef.current;
        const revision = await writeSupabaseWorkspace(activeSettings, activeSession, nextState, currentRevision.revision, currentRevision.exists);
        syncRevisionRef.current = { revision, exists: true };
        const savedSession = readSupabaseSession();
        syncSessionRef.current = savedSession;
        setSyncSession(savedSession);
      } else if (activeSettings.mode === "self-hosted") {
        const currentRevision = syncRevisionRef.current;
        const result = await requestSelfHostedWorkspace(activeSettings, "POST", nextState, currentRevision.revision);
        syncRevisionRef.current = { revision: result.revision, exists: true };
      } else {
        await api("/api/state", { method: "POST", body: snapshot });
      }
      const dirtyKey = activeSettings.mode === "local" ? "nexaflow-workspace-dirty" : "nexaflow-sync-dirty";
      if (localStorage.getItem("nexaflow-workspace-cache") !== snapshot) return false;
      localStorage.setItem(dirtyKey, "false");
      setSyncStatus(activeSettings.mode === "local" ? "Saved on this device." : "All changes synced.");
      setConnectionError("");
      setSaveStatus({ label: activeSettings.mode === "local" ? "All changes saved" : "All changes synced", kind: "" });
      return true;
    }).catch(error => {
      setConnectionError(error.message);
      setSyncStatus(`Sync needs attention: ${error.message}`);
      setSaveStatus({ label: "Saved on this device", kind: "offline" });
      notify(`Your changes are saved in this browser, but could not sync: ${error.message}`, "error");
      return false;
    });
    return saveQueue.current;
  }

  useEffect(() => {
    if (!ready || localStorage.getItem("nexaflow-onboarding-complete") === "true") return;
    const hasWorkspaceData = state.projects.length || state.tasks.length || state.notes.length || state.messages.length;
    if (hasWorkspaceData) {
      localStorage.setItem("nexaflow-onboarding-complete", "true");
      return;
    }
    setShowFirstRun(true);
  }, [ready, state.projects.length, state.tasks.length, state.notes.length, state.messages.length]);

  function finishFirstRun() {
    localStorage.setItem("nexaflow-onboarding-complete", "true");
    setShowFirstRun(false);
  }

  function startSampleWorkspace() {
    const dayKey = offset => {
      const date = new Date();
      date.setDate(date.getDate() + offset);
      return todayKey(date);
    };
    const now = new Date().toISOString();
    const projectId = makeId();
    const secondProjectId = makeId();
    const sample = {
      projects: [
        { id: projectId, name: "A personal project", description: "A little space for something you want to make or learn.", folder: "Personal", tags: ["getting started"], createdAt: now, sampleData: true },
        { id: secondProjectId, name: "Plan the week", description: "Gather the small steps that will make this week feel clearer.", folder: "Personal", tags: ["planning"], createdAt: now, sampleData: true }
      ],
      tasks: [
        { id: makeId(), title: "Write down the first idea", details: "Keep it simple. A sentence is enough to get started.", status: "todo", projectId, dueDate: dayKey(0), priority: "high", recurrence: "", tags: ["first step"], subtasks: [], createdAt: now, sampleData: true },
        { id: makeId(), title: "Choose one small next step", details: "Make the first action easy to begin.", status: "in-progress", projectId, dueDate: dayKey(2), priority: "medium", recurrence: "", tags: ["focus"], subtasks: [], createdAt: now, sampleData: true },
        { id: makeId(), title: "Set aside 25 minutes to plan", details: "", status: "todo", projectId: secondProjectId, dueDate: dayKey(1), priority: "low", recurrence: "", tags: [], subtasks: [], createdAt: now, sampleData: true }
      ],
      notes: [
        { id: makeId(), title: "A thought to come back to", body: "What would feel good to make progress on this week?", projectId, createdAt: now, updatedAt: now, sampleData: true }
      ],
      messages: [],
      goals: [],
      templates: [],
      activity: [
        { id: makeId(), label: "Sample workspace is ready to explore", projectId, createdAt: now, sampleData: true }
      ]
    };
    finishFirstRun();
    setState(sample);
    setActiveView("overview");
    persist(sample).then(saved => {
      if (saved) notify("Sample workspace added. You can remove the sample items in Settings.");
    });
  }

  useEffect(() => {
    let active = true;
    const settings = syncSettingsRef.current;
    const session = syncSessionRef.current;

    function readCachedWorkspace() {
      try {
        const cached = JSON.parse(localStorage.getItem("nexaflow-workspace-cache") || "null");
        if (cached && ["projects", "tasks", "notes", "messages"].every(key => Array.isArray(cached[key]))) {
          return { ...EMPTY_STATE, ...cached };
        }
      } catch (error) {
        console.error("Could not read the offline workspace cache:", error);
      }
      return null;
    }

    async function loadWorkspace() {
      setReady(false);
      syncReadyRef.current = true;
      try {
        if (settings.mode === "supabase") {
          const cached = readCachedWorkspace();
          if (!session) {
            setState(cached || EMPTY_STATE);
            syncReadyRef.current = false;
            setSyncStatus("Sign in to Supabase to load or sync this workspace.");
            setSaveStatus({ label: "Sign in to sync", kind: "offline" });
            setReady(true);
            return;
          }
          const remote = await readSupabaseWorkspace(settings, session);
          if (!active) return;
          syncRevisionRef.current = { revision: remote.revision, exists: remote.exists };
          const hasUnsyncedCopy = localStorage.getItem("nexaflow-sync-dirty") === "true" && cached;
          if (hasUnsyncedCopy) {
            setState(cached);
            syncReadyRef.current = false;
            setSyncStatus("This device has unsynced changes. Choose whether to upload them or load the cloud copy in Settings.");
            setSaveStatus({ label: "Review sync", kind: "offline" });
          } else {
            const workspace = remote.state ? { ...EMPTY_STATE, ...remote.state } : EMPTY_STATE;
            setState(workspace);
            localStorage.setItem("nexaflow-workspace-cache", JSON.stringify(workspace));
            setSyncStatus(remote.exists ? "Connected to your Supabase workspace." : "Cloud account is ready; add your first item.");
            setSaveStatus({ label: remote.exists ? "All changes synced" : "Cloud ready", kind: "" });
          }
          setConnectionError("");
          setSyncSession(readSupabaseSession());
          setReady(true);
          return;
        }

        if (settings.mode === "self-hosted") {
          const cached = readCachedWorkspace();
          const remote = await requestSelfHostedWorkspace(settings);
          if (!active) return;
          if (!remote.state || !["projects", "tasks", "notes", "messages"].every(key => Array.isArray(remote.state[key]))) {
            throw new Error("The self-hosted server returned invalid workspace data.");
          }
          syncRevisionRef.current = { revision: remote.revision, exists: true };
          const hasUnsyncedCopy = localStorage.getItem("nexaflow-sync-dirty") === "true" && cached;
          if (hasUnsyncedCopy) {
            setState(cached);
            syncReadyRef.current = false;
            setSyncStatus("This device has unsynced changes. Choose whether to upload them or load the server copy in Settings.");
            setSaveStatus({ label: "Review sync", kind: "offline" });
          } else {
            const workspace = { ...EMPTY_STATE, ...remote.state };
            setState(workspace);
            localStorage.setItem("nexaflow-workspace-cache", JSON.stringify(workspace));
            setSyncStatus("Connected to your self-hosted workspace.");
            setSaveStatus({ label: "All changes synced", kind: "" });
          }
          setConnectionError("");
          setReady(true);
          return;
        }

        const response = await api("/api/state");
        if (!active) return;
        const loaded = { ...EMPTY_STATE, ...response.state };
        const cached = readCachedWorkspace();
        const hasUnsyncedCopy = localStorage.getItem("nexaflow-workspace-dirty") === "true" && cached;
        const workspace = hasUnsyncedCopy ? cached : loaded;
        setState(workspace);
        setAiConfigured(response.aiConfigured);
        setAiModel(response.aiModel || "gpt-4o-mini");
        setDataFile(response.dataFile);
        setConnectionError("");
        setSyncStatus("Saved on this device.");
        setSaveStatus({ label: hasUnsyncedCopy ? "Syncing saved changes…" : "All changes saved", kind: hasUnsyncedCopy ? "saving" : "" });
        setReady(true);
      } catch (error) {
        if (!active) return;
        const cached = readCachedWorkspace();
        setState(cached || EMPTY_STATE);
        syncReadyRef.current = settings.mode === "local";
        setConnectionError(error.message);
        setSyncStatus(settings.mode === "local"
          ? `Offline. ${error.message}`
          : `Offline. Changes stay on this device until you reconnect and choose what to sync. ${error.message}`);
        setSaveStatus({ label: cached ? "Saved on this device" : "Offline mode", kind: "offline" });
        setReady(true);
        notify(`Could not connect to the workspace: ${error.message}`, "error");
      }
    }

    loadWorkspace();
    return () => { active = false; clearTimeout(toastTimer.current); clearTimeout(saveTimer.current); };
  }, [syncSettings.mode, syncSession?.user?.id]);

  useEffect(() => {
    const syncOfflineChanges = () => {
      if (syncSettingsRef.current.mode === "local") {
        if (localStorage.getItem("nexaflow-workspace-dirty") === "true") persist(stateRef.current);
        return;
      }
      if (localStorage.getItem("nexaflow-sync-dirty") === "true") persist(stateRef.current);
    };
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", syncOfflineChanges);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", syncOfflineChanges);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    const captureInstallPrompt = event => {
      event.preventDefault();
      setInstallPrompt(event);
    };
    window.addEventListener("beforeinstallprompt", captureInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", captureInstallPrompt);
  }, []);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return undefined;
    const handleNotificationClick = event => {
      if (event.data?.type !== "open-task" || !event.data.taskId) return;
      const task = stateRef.current.tasks.find(item => item.id === event.data.taskId);
      if (task) openEdit("task", task);
      navigate("tasks");
    };
    navigator.serviceWorker.addEventListener("message", handleNotificationClick);
    return () => navigator.serviceWorker.removeEventListener("message", handleNotificationClick);
  }, []);

  useEffect(() => {
    if (!ready) return;
    const taskId = new URLSearchParams(window.location.search).get("task");
    const task = state.tasks.find(item => item.id === taskId);
    if (!task) return;
    setCreateItem({ type: "task", record: task });
    navigate("tasks");
    window.history.replaceState({}, "", "/workspace");
  }, [ready, state.tasks]);

  useEffect(() => {
    function handleShortcuts(event) {
      if (document.querySelector("dialog[open]")) return;
      const key = event.key.toLowerCase();
      const commandKey = event.ctrlKey || event.metaKey;
      if (commandKey && key === "k") {
        event.preventDefault();
        searchInputRef.current?.focus();
        return;
      }
      if (event.altKey && event.shiftKey && ["t", "p", "n"].includes(key)) {
        const target = event.target;
        if (target instanceof HTMLElement && (target.isContentEditable || target.matches("input, textarea, select, [role='textbox']"))) return;
        event.preventDefault();
        setCreateItem({ type: key === "t" ? "task" : key === "p" ? "project" : "note" });
        setMobileNavOpen(false);
        return;
      }
      if (key === "?" && !event.ctrlKey && !event.metaKey && !event.altKey) {
        const target = event.target;
        if (target instanceof HTMLElement && (target.isContentEditable || target.matches("input, textarea, select, [role='textbox']"))) return;
        event.preventDefault();
        setShowShortcuts(true);
      }
    }
    window.addEventListener("keydown", handleShortcuts);
    return () => window.removeEventListener("keydown", handleShortcuts);
  }, []);

  useEffect(() => {
    if (!ready) return undefined;
    saveTimer.current = setTimeout(() => { persist(state); }, 200);
    return () => clearTimeout(saveTimer.current);
  }, [state, ready]);

  useEffect(() => {
    localStorage.setItem("nexaflow-theme", darkMode ? "dark" : "light");
  }, [darkMode]);

  useEffect(() => {
    localStorage.setItem("nexaflow-focus-timer", JSON.stringify(timer));
  }, [timer]);

  useEffect(() => {
    if (timer.remaining !== 0 || !timer.endsAt) return;
    notify("Your focus session finished while NexaFlow was closed.");
    setTimer(current => ({ ...current, endsAt: 0 }));
  }, []);

  useEffect(() => {
    if (!timer.running) return undefined;
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((timer.endsAt - Date.now()) / 1000));
      setTimer(current => ({ ...current, remaining, running: remaining > 0 }));
      if (remaining === 0) {
        playFocusCompletionSound();
        notify("Focus session complete. Take a short break.");
        update(current => ({ ...current, activity: logActivity(current, `Completed a ${timer.duration}-minute focus session${timer.taskId ? ` on ${current.tasks.find(task => task.id === timer.taskId)?.title || "a task"}` : ""}`, current.tasks.find(task => task.id === timer.taskId)?.projectId || "") }));
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [timer.running, timer.endsAt]);

  useEffect(() => {
    if (!ready) return undefined;
    const checkReminders = () => {
      let savedReminders = [];
      try {
        const saved = JSON.parse(sessionStorage.getItem("nexaflow-fired-reminders") || "[]");
        if (!Array.isArray(saved) || saved.some(item => typeof item !== "string")) {
          throw new Error("Reminder history has an unexpected format.");
        }
        savedReminders = saved;
      } catch (error) {
        console.error("Could not read reminder history:", error);
        if (!reminderHistoryWarningShown.current) {
          notify("Reminder history could not be read. Some reminders may appear again.", "error");
          reminderHistoryWarningShown.current = true;
        }
      }
      const fired = new Set([...savedReminders, ...firedReminderKeys.current]);
      const now = Date.now();
      const due = state.tasks.filter(task => task.reminderAt && task.status !== "done" && new Date(task.reminderAt).getTime() <= now && !fired.has(`${task.id}:${task.reminderAt}`));
      if (!due.length) return;
      due.forEach(task => {
        const key = `${task.id}:${task.reminderAt}`;
        fired.add(key);
        firedReminderKeys.current.add(key);
      });
      const missedCount = due.filter(task => now - new Date(task.reminderAt).getTime() > 2 * 60 * 1000).length;
      const titles = due.slice(0, 3).map(task => task.title).join(", ");
      const more = due.length > 3 ? `, and ${due.length - 3} more` : "";
      const missedNote = missedCount ? ` (${missedCount} missed)` : "";
      const message = due.length === 1
        ? `Reminder${missedCount ? " missed" : ""}: ${titles}`
        : `${due.length} reminders are due${missedNote}: ${titles}${more}`;
      notify(message);
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        due.slice(0, 3).forEach(task => {
          const options = { body: task.title, tag: `nexaflow-reminder-${task.id}`, data: { taskId: task.id } };
          if ("serviceWorker" in navigator) {
            navigator.serviceWorker.ready.then(registration => registration.showNotification("NexaFlow reminder", options)).catch(error => {
              console.error("Could not show a browser reminder:", error);
            });
          } else {
            try {
              new Notification("NexaFlow reminder", options);
            } catch (error) {
              console.error("Could not show a browser reminder:", error);
            }
          }
        });
      }
      try {
        sessionStorage.setItem("nexaflow-fired-reminders", JSON.stringify([...fired]));
        reminderHistoryWarningShown.current = false;
      } catch (error) {
        console.error("Could not save reminder history:", error);
        notify("Reminder history could not be saved. Some reminders may appear again.", "error");
      }
    };
    checkReminders();
    const timer = setInterval(checkReminders, 30000);
    return () => clearInterval(timer);
  }, [ready, state.tasks]);

  function changeTaskStatus(id, requestedStatus) {
    const task = state.tasks.find(item => item.id === id);
    if (!task) return;
    const status = requestedStatus || (task.status === "done" ? "todo" : "done");
    if (task.status === status) return;
    if (status === "done") {
      const blockedBy = (task.dependencyIds || []).map(dependencyId => state.tasks.find(item => item.id === dependencyId)).filter(item => item && item.status !== "done");
      if (blockedBy.length) {
        notify(`Complete these tasks first: ${blockedBy.map(item => item.title).join(", ")}.`, "error");
        return;
      }
    }
    const recurringTask = task.status !== "done" && status === "done" ? nextRecurringTask(task) : null;
    const label = status === "done" ? "Completed" : task.status === "done" ? "Reopened" : "Updated";
    const next = {
      ...state,
      activity: logActivity(state, `${label} task: ${task.title}`, task.projectId),
      tasks: [...state.tasks.map(item => item.id === id ? { ...item, status, inbox: status === "done" ? false : item.inbox } : item), ...(recurringTask ? [recurringTask] : [])]
    };
    setState(next);
    offerUndo(status === "done" ? `Completed “${task.title}”` : "Task status updated", current => ({
      ...current,
      tasks: [
        ...current.tasks.filter(item => item.id !== recurringTask?.id && item.id !== id),
        task
      ],
      activity: logActivity(current, `Undid task status change: ${task.title}`, task.projectId)
    }));
  }

  const taskActions = useMemo(() => ({
    onToggle: id => changeTaskStatus(id),
    onStatus: (id, status) => changeTaskStatus(id, status),
    onReschedule: (id, newDueDate) => update(current => {
      const task = current.tasks.find(item => item.id === id);
      if (!task) return current;
      return {
        ...current,
        activity: logActivity(current, `Rescheduled "${task.title}" to ${newDueDate || "unscheduled"}`, task.projectId),
        tasks: current.tasks.map(item => item.id === id ? { ...item, dueDate: newDueDate } : item)
      };
    }),
    onToggleSubtask: (taskId, subtaskId) => update(current => {
      const task = current.tasks.find(item => item.id === taskId);
      const subtask = task?.subtasks?.find(item => item.id === subtaskId);
      return {
        ...current,
        activity: subtask ? logActivity(current, `${subtask.done ? "Reopened" : "Completed"} subtask: ${subtask.title}`, task?.projectId) : current.activity,
        tasks: current.tasks.map(item => item.id === taskId ? { ...item, subtasks: (item.subtasks || []).map(child => child.id === subtaskId ? { ...child, done: !child.done } : child) } : item)
      };
    }),
    onEdit: task => setCreateItem({ type: "task", record: task }),
    onDuplicate: task => {
      const source = state.tasks.find(item => item.id === task.id);
      if (!source) return;
      const duplicateId = makeId();
      const duplicate = {
        ...source,
        id: duplicateId,
        title: `${source.title} (Copy)`,
        status: source.status === "done" ? "todo" : source.status,
        createdAt: new Date().toISOString(),
        dependencyIds: [],
        relatedTaskIds: [],
        subtasks: (source.subtasks || []).map(subtask => ({ ...subtask, id: makeId(), done: false })),
        reminderAt: source.reminderAt || "",
        followUpDate: source.followUpDate || "",
        scheduledAt: source.scheduledAt || "",
        relatedNoteIds: [...(source.relatedNoteIds || [])]
      };
      update(current => ({
        ...current,
        activity: logActivity(current, `Duplicated task: ${source.title}`, source.projectId),
        tasks: [duplicate, ...current.tasks]
      }));
      offerUndo(`Duplicated “${source.title}”`, current => ({
        ...current,
        tasks: current.tasks.filter(item => item.id !== duplicateId),
        activity: logActivity(current, `Undid task duplication: ${source.title}`, source.projectId)
      }));
      notify(`Duplicated “${source.title}”.`);
    },
    onDelete: id => {
      const task = state.tasks.find(item => item.id === id);
      if (task && window.confirm(`Delete "${task.title}"?`)) {
        const linkedTasks = state.tasks.filter(item => item.dependencyIds?.includes(id) || item.relatedTaskIds?.includes(id));
        const linkedNotes = state.notes.filter(item => item.relatedTaskIds?.includes(id));
        setState(current => ({
          ...current,
          activity: logActivity(current, `Deleted task: ${task.title}`, task.projectId),
          tasks: current.tasks.filter(item => item.id !== id).map(item => ({ ...item, dependencyIds: (item.dependencyIds || []).filter(dependencyId => dependencyId !== id), relatedTaskIds: (item.relatedTaskIds || []).filter(taskId => taskId !== id) })),
          notes: current.notes.map(item => ({ ...item, relatedTaskIds: (item.relatedTaskIds || []).filter(taskId => taskId !== id) }))
        }));
        offerUndo(`Deleted “${task.title}”`, current => {
          const restoredTasks = current.tasks.map(item => linkedTasks.find(previous => previous.id === item.id) || item);
          if (!restoredTasks.some(item => item.id === task.id)) restoredTasks.push(task);
          return {
            ...current,
            tasks: restoredTasks,
            notes: current.notes.map(item => linkedNotes.find(note => note.id === item.id) || item),
            activity: logActivity(current, `Restored task: ${task.title}`, task.projectId)
          };
        });
      }
    }
  }), [state]);

  function update(updater) {
    setState(current => typeof updater === "function" ? updater(current) : updater);
  }

  function navigate(view) {
    if (VIEW_TITLES[view]) {
      setActiveView(view);
      setMobileNavOpen(false);
    }
  }

  function openCreate(type, projectId = "", initialValues = {}) {
    setCreateItem({ type, projectId, initialValues });
  }

  function openEdit(type, record) {
    setCreateItem({ type, record });
  }

  function saveTaskViews(views) {
    try {
      localStorage.setItem("nexaflow-saved-task-views", JSON.stringify(views));
      setSavedTaskViews(views);
    } catch (error) {
      notify(`Could not save this task view: ${error.message}`, "error");
    }
  }

  function updateSelectedTasks(ids, changes) {
    const selected = new Set(ids);
    if (changes.status === "done") {
      const blocked = state.tasks.filter(task => selected.has(task.id) && (task.dependencyIds || []).some(id => !selected.has(id) && state.tasks.find(dependency => dependency.id === id)?.status !== "done"));
      if (blocked.length) {
        notify(`Complete dependencies first for: ${blocked.map(task => task.title).join(", ")}.`, "error");
        return;
      }
    }
    const normalizedChanges = changes.projectId === "__unassigned__" ? { ...changes, projectId: "" } : changes;
    update(current => ({
      ...current,
      tasks: current.tasks.map(task => selected.has(task.id) ? { ...task, ...normalizedChanges, inbox: changes.status === "done" ? false : task.inbox } : task),
      activity: logActivity(current, `Updated ${selected.size} selected tasks`)
    }));
    notify(`Updated ${selected.size} tasks.`);
  }

  function deleteSelectedTasks(ids) {
    if (!ids.length || !window.confirm(`Delete ${ids.length} selected tasks?`)) return;
    const selected = new Set(ids);
    update(current => ({
      ...current,
      tasks: current.tasks.filter(task => !selected.has(task.id)).map(task => ({ ...task, dependencyIds: (task.dependencyIds || []).filter(id => !selected.has(id)), relatedTaskIds: (task.relatedTaskIds || []).filter(id => !selected.has(id)) })),
      notes: current.notes.map(note => ({ ...note, relatedTaskIds: (note.relatedTaskIds || []).filter(id => !selected.has(id)) })),
      activity: logActivity(current, `Deleted ${selected.size} selected tasks`)
    }));
    notify(`Deleted ${selected.size} tasks.`);
  }

  function startTimer() {
    setTimer(current => ({ ...current, running: true, endsAt: Date.now() + current.remaining * 1000 }));
  }

  function pauseTimer() {
    setTimer(current => ({ ...current, running: false, remaining: Math.max(0, Math.ceil((current.endsAt - Date.now()) / 1000)), endsAt: 0 }));
  }

  function resetTimer(duration = timer.duration) {
    setTimer(current => ({ ...current, duration, remaining: duration * 60, running: false, endsAt: 0 }));
  }

  function chooseSearchResult(item) {
    setGlobalQuery("");
    if (item.type === "task") {
      const task = state.tasks.find(record => record.id === item.id);
      if (task) openEdit("task", task);
      navigate("tasks");
    } else if (item.type === "project") {
      setSelectedProjectId(item.id);
      navigate("projectDetail");
    } else if (item.type === "note") {
      const note = state.notes.find(record => record.id === item.id);
      if (note) openEdit("note", note);
      navigate("notes");
    } else {
      setFocusMessageId(item.id);
      navigate("assistant");
    }
  }

  async function create(item) {
    const now = new Date().toISOString();
    if (item.id) {
      const next = {
        ...state,
        activity: logActivity(state, `Updated ${item.type}: ${item.title}`, item.projectId || (item.type === "project" ? item.id : "")),
        tasks: item.type === "task" ? state.tasks.map(task => task.id === item.id ? {
          ...task, title: item.title, details: item.details, projectId: item.projectId, dueDate: item.dueDate, reminderAt: item.reminderAt, priority: item.priority, recurrence: item.recurrence, tags: item.tags, status: item.status, followUpDate: item.followUpDate, inbox: item.inbox && item.status !== "done", dependencyIds: item.dependencyIds, relatedNoteIds: item.relatedNoteIds, scheduledAt: item.scheduledAt, estimatedMinutes: item.estimatedMinutes,
          subtasks: item.subtasks.map(title => {
            const existing = (task.subtasks || []).find(subtask => subtask.title === title);
            return { id: existing?.id || makeId(), title, done: existing?.done || false };
          })
        } : task) : state.tasks,
        projects: item.type === "project" ? state.projects.map(project => project.id === item.id ? { ...project, name: item.title, description: item.details, folder: item.folder, tags: item.tags } : project) : state.projects,
        notes: item.type === "note" ? state.notes.map(note => note.id === item.id ? { ...note, title: item.title, body: item.details, projectId: item.projectId, relatedTaskIds: item.relatedTaskIds, updatedAt: now } : note) : item.type === "task" ? state.notes.map(note => ({ ...note, relatedTaskIds: item.relatedNoteIds.includes(note.id) ? [...new Set([...(note.relatedTaskIds || []), item.id])] : (note.relatedTaskIds || []).filter(taskId => taskId !== item.id) })) : state.notes
      };
      if (item.type === "note") {
        next.tasks = state.tasks.map(task => ({ ...task, relatedNoteIds: item.relatedTaskIds.includes(task.id) ? [...new Set([...(task.relatedNoteIds || []), item.id])] : (task.relatedNoteIds || []).filter(noteId => noteId !== item.id) }));
      }
      setCreateItem(null);
      update(next);
      if (await persist(next)) notify(`${item.type} updated.`);
      return;
    }
    const task = item.type === "task" ? { id: makeId(), title: item.title, details: item.details, status: item.status || "todo", projectId: item.projectId, dueDate: item.dueDate, reminderAt: item.reminderAt, priority: item.priority, recurrence: item.recurrence, followUpDate: item.followUpDate, inbox: item.inbox, tags: item.tags, dependencyIds: item.dependencyIds, relatedNoteIds: item.relatedNoteIds, scheduledAt: item.scheduledAt, estimatedMinutes: item.estimatedMinutes, subtasks: item.subtasks.map(title => ({ id: makeId(), title, done: false })), createdAt: now } : null;
    const project = item.type === "project" ? { id: makeId(), name: item.title, description: item.details, folder: item.folder, tags: item.tags, createdAt: now } : null;
    const note = item.type === "note" ? { id: makeId(), title: item.title, body: item.details, projectId: item.projectId, relatedTaskIds: item.relatedTaskIds, createdAt: now, updatedAt: now } : null;
    const next = {
      ...state,
      activity: logActivity(state, `Created ${item.type}: ${item.title}`, item.projectId || project?.id || ""),
      tasks: task ? [task, ...state.tasks] : item.type === "note" ? state.tasks.map(existing => ({ ...existing, relatedNoteIds: item.relatedTaskIds.includes(existing.id) ? [...new Set([...(existing.relatedNoteIds || []), note.id])] : (existing.relatedNoteIds || []).filter(noteId => noteId !== note.id) })) : state.tasks,
      projects: project ? [...state.projects, project] : state.projects,
      notes: note ? [...state.notes, note] : item.type === "task" ? state.notes.map(existing => ({ ...existing, relatedTaskIds: item.relatedNoteIds.includes(existing.id) ? [...new Set([...(existing.relatedNoteIds || []), task.id])] : (existing.relatedNoteIds || []).filter(taskId => taskId !== task.id) })) : state.notes
    };
    update(next);
    setCreateItem(null);
    if (activeView === "calendar" || activeView === "board") {
      // stay on current view
    } else if (item.projectId && state.projects.some(project => project.id === item.projectId)) {
      setSelectedProjectId(item.projectId);
      navigate("projectDetail");
    } else {
      navigate(item.type === "task" ? "tasks" : item.type === "project" ? "projects" : "notes");
    }
    const saved = await persist(next);
    if (saved) notify(`${item.type === "task" ? "Task" : item.type === "project" ? "Project" : "Note"} saved to this workspace.`);
  }

  async function quickCreateTask({ title, dueDate, priority = "medium", projectId = "" }) {
    const now = new Date().toISOString();
    const task = {
      id: makeId(),
      title: title.trim(),
      details: "",
      status: "todo",
      projectId: projectId || "",
      dueDate: dueDate || "",
      priority: priority || "medium",
      recurrence: "",
      followUpDate: "",
      inbox: false,
      tags: [],
      dependencyIds: [],
      relatedNoteIds: [],
      scheduledAt: "",
      estimatedMinutes: 25,
      subtasks: [],
      createdAt: now
    };
    const next = {
      ...state,
      tasks: [task, ...state.tasks],
      activity: logActivity(state, `Created task: ${task.title}`, task.projectId)
    };
    update(next);
    if (await persist(next)) notify(`Added task "${task.title}".`);
  }

  async function sendMessage(prompt, mode) {
    const userMessage = { id: makeId(), role: "user", content: prompt, createdAt: new Date().toISOString() };
    const nextMessages = [...state.messages, userMessage];
    const withUserMessage = { ...state, messages: nextMessages };
    update(withUserMessage);
    if (!await persist(withUserMessage)) {
      update(current => ({ ...current, messages: [...current.messages, { id: makeId(), role: "assistant", content: "Your message could not be saved, so it was not sent. Check the local server connection and try again.", createdAt: new Date().toISOString(), localNotice: true }] }));
      return;
    }
    try {
      const response = await api("/api/assistant", { method: "POST", body: JSON.stringify({ message: prompt, mode }) });
      const next = { ...withUserMessage, messages: [...nextMessages, { id: makeId(), role: "assistant", content: response.reply, createdAt: new Date().toISOString() }] };
      update(next);
      await persist(next);
    } catch (error) {
      notify(error.message, "error");
      const notice = !aiConfigured
        ? "Your message is saved locally, but an AI provider isn’t connected yet. Open Settings to configure an API key on this computer, then restart the local server and try again."
        : `I couldn’t reach the AI provider just now. Your message is saved here. ${error.message}`;
      const next = { ...withUserMessage, messages: [...nextMessages, { id: makeId(), role: "assistant", content: notice, createdAt: new Date().toISOString(), localNotice: true }] };
      update(next);
      await persist(next);
    }
  }

  async function clearChat() {
    if (!state.messages.length || !window.confirm("Clear this conversation from your local workspace?")) return;
    const next = { ...state, messages: [] };
    update(next);
    if (await persist(next)) notify("Conversation cleared.");
  }

  function deleteProject(id) {
    const project = state.projects.find(item => item.id === id);
    if (!project || !window.confirm(`Delete "${project.name}"? Its tasks will stay in your task list, but will no longer be linked to it.`)) return;
    const linkedTasks = state.tasks.filter(task => task.projectId === id);
    const linkedNotes = state.notes.filter(note => note.projectId === id);
    const linkedGoals = (state.goals || []).filter(goal => goal.projectId === id);
    update(current => ({
      ...current,
      activity: logActivity(current, `Deleted project: ${project.name}`),
      projects: current.projects.filter(item => item.id !== id),
      tasks: current.tasks.map(task => task.projectId === id ? { ...task, projectId: "" } : task),
      notes: current.notes.map(note => note.projectId === id ? { ...note, projectId: "" } : note),
      goals: (current.goals || []).map(goal => goal.projectId === id ? { ...goal, projectId: "" } : goal)
    }));
    offerUndo(`Deleted project “${project.name}”`, current => ({
      ...current,
      projects: current.projects.some(item => item.id === project.id) ? current.projects : [...current.projects, project],
      tasks: current.tasks.map(task => linkedTasks.find(item => item.id === task.id) || task),
      notes: current.notes.map(note => linkedNotes.find(item => item.id === note.id) || note),
      goals: (current.goals || []).map(goal => linkedGoals.find(item => item.id === goal.id) || goal),
      activity: logActivity(current, `Restored project: ${project.name}`)
    }));
  }

  function deleteNote(id) {
    const note = state.notes.find(item => item.id === id);
    if (note && window.confirm(`Delete "${note.title}"?`)) {
      update(current => ({ ...current, activity: logActivity(current, `Deleted note: ${note.title}`), notes: current.notes.filter(item => item.id !== id), tasks: current.tasks.map(task => ({ ...task, relatedNoteIds: (task.relatedNoteIds || []).filter(noteId => noteId !== id) })) }));
      offerUndo(`Deleted note “${note.title}”`, current => ({
        ...current,
        notes: current.notes.some(item => item.id === note.id) ? current.notes : [...current.notes, note],
        tasks: current.tasks.map(task => note.relatedTaskIds?.includes(task.id) ? { ...task, relatedNoteIds: [...new Set([...(task.relatedNoteIds || []), note.id])] } : task),
        activity: logActivity(current, `Restored note: ${note.title}`)
      }));
    }
  }

  function removeSampleItems() {
    const sampleProjects = state.projects.filter(item => item.sampleData);
    const sampleTasks = state.tasks.filter(item => item.sampleData);
    const sampleNotes = state.notes.filter(item => item.sampleData);
    const sampleProjectIds = new Set(sampleProjects.map(item => item.id));
    const count = sampleProjects.length + sampleTasks.length + sampleNotes.length;
    if (!count || !window.confirm(`Remove ${count} sample projects, tasks, and notes? Items you created yourself will be kept.`)) return;
    update(current => ({
      ...current,
      projects: current.projects.filter(item => !item.sampleData),
      tasks: current.tasks.filter(item => !item.sampleData).map(task => sampleProjectIds.has(task.projectId) ? { ...task, projectId: "" } : task),
      notes: current.notes.filter(item => !item.sampleData).map(note => sampleProjectIds.has(note.projectId) ? { ...note, projectId: "" } : note),
      activity: (current.activity || []).filter(item => !item.sampleData)
    }));
    notify("Sample items removed. Your own work is unchanged.");
  }

  function cacheConnectedWorkspace(workspace, settings, session, revision, exists, status) {
    const snapshot = JSON.stringify(workspace);
    localStorage.setItem("nexaflow-workspace-cache", snapshot);
    localStorage.setItem(settings.mode === "local" ? "nexaflow-workspace-dirty" : "nexaflow-sync-dirty", "false");
    syncSettingsRef.current = settings;
    syncSessionRef.current = session;
    syncRevisionRef.current = { revision, exists };
    syncReadyRef.current = true;
    syncWarningShown.current = false;
    setSyncSettingsState(settings);
    setSyncSession(session);
    setSyncStatus(status);
    setState(workspace);
    setConnectionError("");
    setSaveStatus({ label: settings.mode === "local" ? "All changes saved" : "All changes synced", kind: "" });
    setReady(true);
  }

  async function connectSupabase({ settings: entered, email, password, accountAction, workspaceAction }) {
    const settings = { ...entered, mode: "supabase" };
    const auth = await authenticateSupabase(settings, accountAction, email, password);
    if (!auth.access_token || !auth.refresh_token || !auth.user?.id) {
      saveSyncSettings(settings);
      syncSettingsRef.current = settings;
      syncSessionRef.current = null;
      syncReadyRef.current = false;
      writeSupabaseSession(null);
      setSyncSettingsState(settings);
      setSyncSession(null);
      setReady(true);
      setSyncStatus("Check your email to confirm the account, then sign in to sync.");
      return "Check your email to confirm the account. Then sign in to load or sync your workspace.";
    }

    const session = auth;
    try {
    const remote = await readSupabaseWorkspace(settings, session);
    let workspace;
    let revision = remote.revision;
    let exists = remote.exists;

    if (remote.exists && workspaceAction === "upload") {
      if (!window.confirm("Replace the workspace in this Supabase account with this device's data? This cannot be undone. Export a backup first.")) {
        throw new Error("Upload cancelled. The cloud workspace was not changed.");
      }
      workspace = stateRef.current;
      revision = await writeSupabaseWorkspace(settings, session, workspace, remote.revision, true);
    } else if (remote.exists) {
      workspace = { ...EMPTY_STATE, ...remote.state };
    } else {
      if (workspaceAction !== "upload" && !window.confirm("There is no cloud workspace yet. Create one using the workspace currently on this device?")) {
        throw new Error("Cloud workspace setup cancelled. Your local workspace was not changed.");
      }
      workspace = stateRef.current;
      revision = await writeSupabaseWorkspace(settings, session, workspace, 0, false);
      exists = true;
    }

    saveSyncSettings(settings);
    cacheConnectedWorkspace(workspace, settings, session, revision, exists, "Connected to your private Supabase workspace.");
    setDataFile("");
    setAiConfigured(false);
    return remote.exists && workspaceAction === "upload"
      ? "This device's workspace was uploaded to Supabase."
      : remote.exists
        ? "Your Supabase workspace is loaded on this device."
        : "Your existing workspace was copied to your new Supabase account.";
    } catch (error) {
    writeSupabaseSession(null);
    syncSessionRef.current = null;
    setSyncSession(null);
    syncReadyRef.current = false;
    throw error;
    }
  }

  async function connectSelfHosted({ settings: entered, workspaceAction }) {
    const settings = { ...entered, mode: "self-hosted" };
    const remote = await requestSelfHostedWorkspace(settings);
    if (!remote.state || !["projects", "tasks", "notes", "messages"].every(key => Array.isArray(remote.state[key]))) {
      throw new Error("The self-hosted server returned invalid workspace data.");
    }
    let workspace;
    let revision = remote.revision;
    if (workspaceAction === "upload") {
      if (!window.confirm("Replace the workspace on your self-hosted server with this device's data? This cannot be undone. Export a backup first.")) {
        throw new Error("Upload cancelled. The server workspace was not changed.");
      }
      workspace = stateRef.current;
      const saved = await requestSelfHostedWorkspace(settings, "POST", workspace, remote.revision);
      revision = saved.revision;
    } else {
      workspace = { ...EMPTY_STATE, ...remote.state };
    }

    saveSyncSettings(settings);
    cacheConnectedWorkspace(workspace, settings, syncSessionRef.current, revision, true, "Connected to your self-hosted workspace.");
    setDataFile("");
    return workspaceAction === "upload"
      ? "This device's workspace was uploaded to your self-hosted server."
      : "Your self-hosted workspace is loaded on this device.";
  }

  function useLocalWorkspace() {
    const settings = { ...syncSettingsRef.current, mode: "local" };
    try {
      localStorage.setItem("nexaflow-workspace-cache", JSON.stringify(stateRef.current));
      localStorage.setItem("nexaflow-workspace-dirty", "true");
      saveSyncSettings(settings);
      syncSettingsRef.current = settings;
      syncReadyRef.current = true;
      setSyncSettingsState(settings);
      setReady(false);
      setSyncStatus("Switching to this device's local workspace…");
    } catch (error) {
      notify(`Could not switch to local mode: ${error.message}`, "error");
    }
  }

  async function signOutSupabase() {
    try {
      await revokeSupabaseSession(syncSettingsRef.current, syncSessionRef.current);
    } finally {
      syncSessionRef.current = null;
      setSyncSession(null);
      setReady(false);
      setSyncStatus("Signed out. The last synced copy remains on this device.");
    }
  }

  function updateOverviewPreferences(preferences) {
    try {
      const valid = preferences.visible.length > 0;
      if (!valid) {
        notify("Keep at least one overview section visible.", "error");
        return;
      }
      localStorage.setItem("nexaflow-overview-preferences", JSON.stringify(preferences));
      setOverviewPreferences(preferences);
    } catch (error) {
      notify(`Could not save overview preferences: ${error.message}`, "error");
    }
  }

  function exportCalendar() {
    try {
      const calendar = createCalendarFile(state.tasks);
      const blob = new Blob([calendar], { type: "text/calendar;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `nexaflow-calendar-${todayKey()}.ics`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      notify("Calendar file downloaded. Import it into your calendar app.");
    } catch (error) {
      notify(error.message, "error");
    }
  }

  async function retryConnection() {
    try {
      if (localStorage.getItem("nexaflow-workspace-dirty") === "true") {
        const snapshot = localStorage.getItem("nexaflow-workspace-cache");
        if (!snapshot) throw new Error("No saved workspace copy is available to sync.");
        const cached = JSON.parse(snapshot);
        if (!cached || typeof cached !== "object" || Array.isArray(cached)) throw new Error("The saved workspace copy is invalid.");
        await api("/api/state", { method: "POST", body: snapshot });
        if (localStorage.getItem("nexaflow-workspace-cache") !== snapshot) {
          setConnectionError("");
          return;
        }
        localStorage.setItem("nexaflow-workspace-dirty", "false");
        setSaveStatus({ label: "All changes synced", kind: "" });
      } else {
        const stateAtRequest = stateRef.current;
        const response = await api("/api/state");
        if (stateRef.current === stateAtRequest && localStorage.getItem("nexaflow-workspace-dirty") !== "true") {
          setState({ ...EMPTY_STATE, ...response.state });
        }
        setAiConfigured(response.aiConfigured);
        setAiModel(response.aiModel || "gpt-4o-mini");
        setDataFile(response.dataFile);
        setSaveStatus({ label: "All changes saved", kind: "" });
      }
      setConnectionError("");
      notify("NexaFlow is connected again.");
    } catch (error) {
      setConnectionError(error.message);
      setSaveStatus({ label: "Still offline", kind: "offline" });
      notify(`Could not reconnect: ${error.message}`, "error");
    }
  }

  async function importBackup(imported, mode) {
    const requiredKeys = ["projects", "tasks", "notes", "messages"];
    const keys = [...requiredKeys, "goals", "templates"];
    if (!imported || requiredKeys.some(key => !Array.isArray(imported[key]) || imported[key].some(item => !item || typeof item !== "object" || Array.isArray(item))) ||
      ["goals", "templates"].some(key => imported[key] !== undefined && (!Array.isArray(imported[key]) || imported[key].some(item => !item || typeof item !== "object" || Array.isArray(item))))) {
      throw new Error("The backup must contain valid projects, tasks, notes, and messages arrays.");
    }
    const source = { ...imported, goals: imported.goals || [], templates: imported.templates || [] };
    if (source.projects.some(item => typeof item.name !== "string") ||
      source.tasks.some(item => typeof item.title !== "string") ||
      source.notes.some(item => typeof item.title !== "string") ||
      source.messages.some(item => !["user", "assistant"].includes(item.role) || typeof item.content !== "string") ||
      source.goals.some(item => typeof item.title !== "string" || (item.milestones !== undefined && !Array.isArray(item.milestones))) ||
      source.templates.some(item => typeof item.title !== "string" || !["task", "project"].includes(item.type))) {
      throw new Error("The backup contains records with invalid or missing fields.");
    }
    if (mode === "replace" && !window.confirm("Replace all current workspace data with this backup? This cannot be undone.")) return;
    const idMaps = {};
    const mappedId = (map, id) => id ? map.get(id) : undefined;
    const records = Object.fromEntries(keys.map(key => {
      const existingIds = new Set(mode === "replace" ? [] : (state[key] || []).map(item => item.id).filter(Boolean));
      const mapped = source[key].map(item => {
        const id = item.id && !existingIds.has(item.id) ? item.id : makeId();
        existingIds.add(id);
        return { ...item, id };
      });
      idMaps[key] = new Map(source[key].map((item, index) => [item.id, mapped[index].id]));
      return [key, mapped];
    }));
    records.projects = records.projects.map(project => ({ ...project, tags: Array.isArray(project.tags) ? project.tags.filter(tag => typeof tag === "string") : [] }));
    records.tasks = records.tasks.map((task, index) => ({
      ...task,
      projectId: mappedId(idMaps.projects, source.tasks[index].projectId) || "",
      status: ["todo", "in-progress", "waiting", "done"].includes(task.status) ? task.status : "todo",
      followUpDate: typeof task.followUpDate === "string" ? task.followUpDate : "",
      inbox: Boolean(task.inbox),
      priority: ["low", "medium", "high"].includes(task.priority) ? task.priority : "medium",
      tags: Array.isArray(task.tags) ? task.tags.filter(tag => typeof tag === "string") : [],
      dependencyIds: Array.isArray(task.dependencyIds) ? [...new Set(task.dependencyIds.map(id => mappedId(idMaps.tasks, id)).filter(Boolean))] : [],
      relatedNoteIds: Array.isArray(task.relatedNoteIds) ? [...new Set(task.relatedNoteIds.map(id => mappedId(idMaps.notes, id)).filter(Boolean))] : [],
      estimatedMinutes: Math.max(0, Math.min(1440, Number(task.estimatedMinutes) || 0)),
      subtasks: Array.isArray(task.subtasks) ? task.subtasks.filter(subtask => subtask && typeof subtask.title === "string").map(subtask => ({ ...subtask, id: subtask.id || makeId(), done: Boolean(subtask.done) })) : []
    }));
    records.notes = records.notes.map((note, index) => ({
      ...note,
      projectId: mappedId(idMaps.projects, source.notes[index].projectId) || "",
      relatedTaskIds: Array.isArray(note.relatedTaskIds) ? [...new Set(note.relatedTaskIds.map(id => mappedId(idMaps.tasks, id)).filter(Boolean))] : []
    }));
    records.goals = records.goals.map((goal, index) => ({
      ...goal,
      projectId: mappedId(idMaps.projects, source.goals[index].projectId) || "",
      milestones: Array.isArray(goal.milestones) ? goal.milestones.filter(item => item && typeof item.title === "string").map(item => ({ ...item, id: item.id || makeId(), done: Boolean(item.done) })) : []
    }));
    let next;
    if (mode === "replace") {
      next = { ...EMPTY_STATE, ...records, activity: Array.isArray(source.activity) ? source.activity.filter(item => item && typeof item.label === "string").map(item => ({ ...item, projectId: mappedId(idMaps.projects, item.projectId) || "" })) : [] };
    } else {
      next = { ...state };
      for (const key of keys) {
        next[key] = [...(next[key] || []), ...records[key]];
      }
      next.activity = [...(next.activity || []), ...(Array.isArray(source.activity) ? source.activity.filter(item => item && typeof item.label === "string").map(item => ({ ...item, projectId: mappedId(idMaps.projects, item.projectId) || "" })) : [])];
    }
    next.activity = logActivity(next, `${mode === "replace" ? "Replaced" : "Merged"} workspace from backup`);
    update(next);
    if (await persist(next)) notify("Backup imported successfully.");
  }

  async function enableNotifications() {
    if (typeof Notification === "undefined" || !window.isSecureContext) return "unavailable";
    return Notification.requestPermission();
  }

  function toggleTheme() {
    setDarkMode(value => !value);
  }

  async function installApp() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  }

  const page = {
    overview: <Overview state={state} openCreate={openCreate} navigate={navigate} taskActions={taskActions} preferences={overviewPreferences} />,
    tasks: <TasksPage tasks={state.tasks} projects={state.projects} notes={state.notes} openCreate={openCreate} taskActions={taskActions} savedViews={savedTaskViews} onSaveView={saveTaskViews} onBulkUpdate={updateSelectedTasks} onBulkDelete={deleteSelectedTasks} />,
    board: <BoardPage tasks={state.tasks} projects={state.projects} taskActions={taskActions} openCreate={openCreate} />,
    calendar: <CalendarPage tasks={state.tasks} projects={state.projects} notes={state.notes} navigate={navigate} onExportCalendar={exportCalendar} openCreate={openCreate} taskActions={taskActions} onQuickCreate={quickCreateTask} />,
    focus: <FocusPage tasks={state.tasks} timer={timer} onStart={startTimer} onPause={pauseTimer} onReset={resetTimer} onTaskChange={taskId => setTimer(current => ({ ...current, taskId }))} onCompleteTask={id => taskActions.onStatus(id, "done")} />,
    activity: <ActivityPage items={state.activity || []} />,
    projects: <ProjectsPage projects={state.projects} tasks={state.tasks} openCreate={openCreate} onDelete={deleteProject} onEdit={project => openEdit("project", project)} onOpen={id => { setSelectedProjectId(id); navigate("projectDetail"); }} />,
    projectDetail: <ProjectDetailPage project={state.projects.find(item => item.id === selectedProjectId)} tasks={state.tasks} notes={state.notes} activity={state.activity || []} openCreate={openCreate} onEdit={project => openEdit("project", project)} onBack={() => navigate("projects")} taskActions={taskActions} noteActions={{ onEdit: note => openEdit("note", note), onDelete: deleteNote }} />,
    assistant: <AssistantPage messages={state.messages} aiConfigured={aiConfigured} syncMode={syncSettings.mode} onSend={sendMessage} onClear={clearChat} navigate={navigate} focusMessageId={focusMessageId} />,
    notes: <NotesPage notes={state.notes} projects={state.projects} tasks={state.tasks} openCreate={openCreate} onDelete={deleteNote} onEdit={note => openEdit("note", note)} />,
    goals: <GoalsPage goals={state.goals || []} projects={state.projects} update={update} notify={notify} logActivity={logActivity} />,
    templates: <TemplatesPage templates={state.templates || []} update={update} notify={notify} logActivity={logActivity} createItem={create} />,
    dayPlan: <PlanMyDay state={state} tasks={state.tasks} update={update} persist={persist} notify={notify} logActivity={logActivity} navigate={navigate} />,
    inbox: <QuickCaptureInbox state={state} tasks={state.tasks} update={update} persist={persist} notify={notify} logActivity={logActivity} onEdit={task => openEdit("task", task)} onComplete={id => taskActions.onStatus(id, "done")} onDelete={taskActions.onDelete} />,
    weeklyReview: <WeeklyReview tasks={state.tasks} activity={state.activity || []} projects={state.projects} navigate={navigate} />,
    settings: <SettingsPage
      aiConfigured={aiConfigured}
      aiModel={aiModel}
      dataFile={dataFile}
      state={state}
      darkMode={darkMode}
      onToggleTheme={toggleTheme}
      onImport={importBackup}
      onEnableNotifications={enableNotifications}
      onRemoveSamples={removeSampleItems}
      overviewPreferences={overviewPreferences}
      onUpdateOverview={updateOverviewPreferences}
      syncSettings={syncSettings}
      syncSession={syncSession}
      syncStatus={syncStatus}
      onUseLocal={useLocalWorkspace}
      onConnectSupabase={connectSupabase}
      onConnectSelfHosted={connectSelfHosted}
      onSignOutSupabase={signOutSupabase}
    />
  }[activeView];
  const openTaskCount = state.tasks.filter(task => task.status !== "done").length;

  return (
    <WorkspaceErrorBoundary>
      <div className={`app-shell ${darkMode ? "theme-dark" : ""} ${mobileNavOpen ? "mobile-nav-open" : ""}`}>
      {mobileNavOpen && <button className="mobile-nav-backdrop" onClick={() => setMobileNavOpen(false)} aria-label="Close navigation" />}
      <aside id="workspace-navigation" className={`sidebar ${mobileNavOpen ? "mobile-open" : ""}`} aria-label="Main navigation">
        <a className="brand" href="#" onClick={event => { event.preventDefault(); navigate("overview"); }} aria-label="NexaFlow home"><img className="brand-logo-image" src="/icon.svg" alt="" /><span>Nexa<span className="brand-light">Flow</span></span></a>
        <div className="workspace-label">WORKSPACE</div>
        <nav className="nav-list" aria-label="Workspace pages">
          {[{ title: "PLAN", items: [["overview", "⌂", "Overview"], ["dayPlan", "◷", "Plan my day"], ["tasks", "▤", "My tasks"], ["inbox", "✦", "Quick capture"], ["board", "▦", "Kanban board"], ["calendar", "▦", "Calendar"], ["goals", "✳", "Goals"], ["weeklyReview", "↻", "Weekly review"]] }, { title: "ORGANIZE", items: [["projects", "▧", "Projects"], ["notes", "▧", "Notes"], ["templates", "▤", "Templates"], ["activity", "◷", "Activity"]] }, { title: "FOCUS", items: [["focus", "◷", "Focus timer"], ["assistant", "✳", "AI assistant"]] }].map(group => <div className="nav-group" key={group.title}>
            <div className="nav-group-label" aria-hidden="true">{group.title}</div>
            {group.items.map(([view, icon, label]) => <button key={view} className={`nav-item ${activeView === view || (view === "projects" && activeView === "projectDetail") ? "active" : ""}`} onClick={() => navigate(view)} title={label} aria-current={activeView === view || (view === "projects" && activeView === "projectDetail") ? "page" : undefined}><span className="nav-icon" aria-hidden="true">{icon}</span>{label}{view === "tasks" && <span className="nav-count">{openTaskCount}</span>}{view === "inbox" && state.tasks.some(task => task.inbox && task.status !== "done") && <span className="nav-count">{state.tasks.filter(task => task.inbox && task.status !== "done").length}</span>}{view === "assistant" && <span className="ai-nav-dot" aria-label="AI assistant" />}</button>)}
          </div>)}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-tip"><span className="tip-sparkle">✳</span><p className="tip-title">A little more flow</p><p>Turn a big problem into one small next step.</p><button className="text-button" onClick={() => navigate("assistant")}>Talk it through <span>→</span></button></div>
          <button className={`nav-item settings-link ${activeView === "settings" ? "active" : ""}`} onClick={() => navigate("settings")} title="Settings"><span className="nav-icon">⚙</span>Settings</button>
          <div className="profile-row"><div className="avatar">N</div><div><strong>My workspace</strong><small>Personal space</small></div><span className="profile-menu">•••</span></div>
        </div>
      </aside>
      <div className="main-column">
        <header className="topbar">
          <button className="mobile-nav-toggle" aria-label={mobileNavOpen ? "Close navigation" : "Open navigation"} aria-expanded={mobileNavOpen} aria-controls="workspace-navigation" onClick={() => setMobileNavOpen(open => !open)}>{mobileNavOpen ? "×" : "☰"}</button>
          <div className="breadcrumb" aria-label={`Current page: ${VIEW_TITLES[activeView]}`}><span>My workspace</span><span className="breadcrumb-slash">/</span><strong>{VIEW_TITLES[activeView]}</strong></div>
          <div className="global-search-wrap"><input ref={searchInputRef} value={globalQuery} onChange={event => setGlobalQuery(event.target.value)} onKeyDown={event => { if (event.key === "Escape") setGlobalQuery(""); }} placeholder="Search everything…" title="Search everything (Ctrl/Cmd + K)" aria-label="Search tasks, projects, notes and messages. Press Control or Command K to focus search." /><SearchResults query={globalQuery} state={state} onChoose={chooseSearchResult} /></div>
          <div className="topbar-actions">{installPrompt && <button className="install-button" onClick={installApp}>Install app</button>}<ConnectionStatus online={isOnline} /><div className={`save-indicator ${saveStatus.kind}`} role="status" aria-live="polite" title={connectionError || "Your workspace save status"}><span className="save-dot" /><span>{saveStatus.label}</span></div><button className="icon-button" onClick={() => setShowShortcuts(true)} aria-label="Keyboard shortcuts" title="Keyboard shortcuts (?)">?</button><button className="icon-button" onClick={() => navigate("settings")} aria-label="Settings" title="Settings">⚙</button><div className="avatar avatar-small" aria-label="My workspace">N</div></div>
        </header>
        <main className="page-content">
          {connectionError && <div className="connection-banner" role="status" aria-live="polite"><strong>Working in offline mode.</strong><span>{connectionError} Changes are saved in this browser and will sync when the local server is reachable again.</span><button className="button button-secondary" onClick={retryConnection}>Retry connection</button></div>}
          <Suspense fallback={<div role="status">Loading {VIEW_TITLES[activeView]}…</div>}>{page}</Suspense>
        </main>
      </div>
      <CreateDialog key={`${createItem?.type || "closed"}-${createItem?.record?.id || ""}`} item={createItem} projects={state.projects} tasks={state.tasks} notes={state.notes} onClose={() => setCreateItem(null)} onCreate={create} />
      {showFirstRun && <FirstRunDialog onStartSample={startSampleWorkspace} onStartBlank={finishFirstRun} />}
      {showShortcuts && <ShortcutsDialog onClose={() => setShowShortcuts(false)} onCreate={openCreate} />}
      {toast && <div className={`toast visible ${toast.type}`} role="status" aria-live="polite"><span>{toast.message}</span>{toast.actionLabel && <button className="toast-action" onClick={undoLastChange}>{toast.actionLabel}</button>}</div>}
    </div>
    </WorkspaceErrorBoundary>
  );
}
