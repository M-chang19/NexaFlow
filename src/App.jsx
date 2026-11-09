import "./styles.css";
import "./redesign.css";
import { Fragment, lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import SyncSettings from "./SyncSettings.jsx";
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
const makeId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
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
const todayKey = (date = new Date()) => {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
};
const splitTags = value => [...new Set(value.split(",").map(tag => tag.trim()).filter(Boolean))].slice(0, 12);

function logActivity(state, label, projectId = "") {
  return [{ id: makeId(), label, projectId, createdAt: new Date().toISOString() }, ...(state.activity || [])].slice(0, 100);
}

function nextRecurringTask(task) {
  if (!task.recurrence || !task.dueDate) return null;
  const [year, month, day] = task.dueDate.split("-").map(Number);
  const next = new Date(year, month - 1, day);
  if (task.recurrence === "daily") next.setDate(next.getDate() + 1);
  else if (task.recurrence === "weekly") next.setDate(next.getDate() + 7);
  else if (task.recurrence === "monthly") {
    next.setDate(1);
    next.setMonth(next.getMonth() + 1);
    next.setDate(Math.min(day, new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()));
  }
  else return null;
  const dueDate = todayKey(next);
  const reminderTime = task.reminderAt?.match(/T(\d{2}:\d{2})/);
  return {
    ...task,
    id: makeId(),
    status: "todo",
    inbox: false,
    followUpDate: "",
    dueDate,
    reminderAt: reminderTime ? `${dueDate}T${reminderTime[1]}` : "",
    subtasks: (task.subtasks || []).map(subtask => ({ ...subtask, id: makeId(), done: false })),
    createdAt: new Date().toISOString()
  };
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

function Eyebrow({ children, line = false }) {
  return <p className="eyebrow">{line && <span className="eyebrow-line" />}{children}</p>;
}

function EmptyState({ icon = "✦", title, description, action }) {
  return (
    <div className="empty-state">
      <span className="empty-icon">{icon}</span>
      <strong>{title}</strong>
      <p>{description}</p>
      {action}
    </div>
  );
}

function TaskRow({ task, projects, allTasks = [], notes = [], onToggle, onStatus, onDelete, onToggleSubtask, onEdit }) {
  const project = projects.find(item => item.id === task.projectId);
  const dependencies = (task.dependencyIds || []).map(id => allTasks.find(item => item.id === id)).filter(Boolean);
  const linkedNotes = (task.relatedNoteIds || []).map(id => notes.find(item => item.id === id)).filter(Boolean);
  const blockedBy = dependencies.filter(item => item.status !== "done");
  const dueState = task.dueDate && task.status !== "done" ? (task.dueDate < todayKey() ? "overdue" : task.dueDate === todayKey() ? "due-today" : "") : "";
  return (
    <div className={`task-row-wrap ${dueState}`}>
    <div className="task-row">
      <button className={`task-check ${task.status === "done" ? "checked" : ""}`} onClick={() => onToggle(task.id)} aria-label={`${task.status === "done" ? "Reopen" : "Complete"} ${task.title}`}>
        {task.status === "done" ? "✓" : ""}
      </button>
      <div className="task-copy">
        <strong className={task.status === "done" ? "task-done" : ""}>{task.title}</strong>
        <small>{project && <><span className="task-project-dot" />{project.name} · </>}{task.details || (task.status === "done" ? "Completed" : "No extra details")}{task.dueDate && <> · <span className={`task-due ${dueState}`}>{dueState === "overdue" ? "Overdue" : dueState === "due-today" ? "Due today" : `Due ${task.dueDate}`}</span></>}</small>
        {(task.priority || task.tags?.length > 0) && <div className="task-badges">{task.priority && <span className={`priority-badge priority-${task.priority}`}>{task.priority} priority</span>}{(task.tags || []).map(tag => <span className="tag-chip" key={tag}>{tag}</span>)}</div>}
        {blockedBy.length > 0 && <small className="task-dependency-note">Blocked by: {blockedBy.map(item => item.title).join(", ")}</small>}
        {task.status === "waiting" && <small className="task-waiting-note">{task.followUpDate ? `Waiting · follow up ${task.followUpDate}` : "Waiting on someone or something"}</small>}
        {task.scheduledAt && <small className="task-schedule-note">◷ Scheduled {new Date(task.scheduledAt).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</small>}
        {linkedNotes.length > 0 && <small className="task-link-note">Linked notes: {linkedNotes.map(item => item.title).join(", ")}</small>}
      </div>
      <select className={`task-status status-${task.status}`} value={task.status} onChange={event => onStatus(task.id, event.target.value)} aria-label={`Status for ${task.title}`}>
        <option value="todo">To do</option>
        <option value="in-progress">In progress</option>
        <option value="waiting">Waiting</option>
        <option value="done">Done</option>
      </select>
      <button className="row-edit" onClick={() => onEdit(task)} aria-label={`Edit ${task.title}`} title="Edit task">✎</button>
      <button className="row-delete" onClick={() => onDelete(task.id)} aria-label={`Delete ${task.title}`} title="Delete task">×</button>
    </div>
    {task.subtasks?.length > 0 && <div className="subtask-list">{task.subtasks.map(subtask => <label className="subtask-row" key={subtask.id}><input type="checkbox" checked={subtask.done} onChange={() => onToggleSubtask(task.id, subtask.id)} /><span className={subtask.done ? "subtask-done" : ""}>{subtask.title}</span></label>)}</div>}
    </div>
  );
}

function PageIntro({ eyebrow, title, description, action, badge }) {
  return (
    <div className={`page-intro ${badge ? "assistant-intro" : ""}`}>
      <div><Eyebrow line>{eyebrow}</Eyebrow><h1>{title}</h1><p>{description}</p></div>
      {action}
      {badge}
    </div>
  );
}

function FirstRunDialog({ onStartSample, onStartBlank }) {
  const dialogRef = useRef(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return undefined;
    dialog.showModal();
    return () => { if (dialog.open) dialog.close(); };
  }, []);
  return (
    <dialog className="welcome-dialog" ref={dialogRef} onCancel={event => { event.preventDefault(); onStartBlank(); }}>
      <div className="welcome-dialog-content">
        <span className="welcome-dialog-mark" aria-hidden="true">✳</span>
        <Eyebrow line>WELCOME TO NEXAFLOW</Eyebrow>
        <h2>A little space to get started.</h2>
        <p>Keep projects, next steps, and notes together. Start with a small example workspace, or jump straight into your own.</p>
        <div className="welcome-guide">
          <div><span>01</span><p><strong>Capture a next step</strong><small>Give a task a name and a clear place to start.</small></p></div>
          <div><span>02</span><p><strong>Give related work a home</strong><small>Group tasks and notes inside a project.</small></p></div>
          <div><span>03</span><p><strong>Make it your own</strong><small>Everything stays on this device; AI is optional.</small></p></div>
        </div>
        <div className="welcome-dialog-actions">
          <button className="button button-secondary" onClick={onStartBlank}>Start with a blank workspace</button>
          <button className="button button-primary" onClick={onStartSample}>Try a sample workspace</button>
        </div>
        <p className="welcome-dialog-footnote">You can remove sample items anytime from Settings.</p>
      </div>
    </dialog>
  );
}

function ShortcutsDialog({ onClose, onCreate }) {
  const dialogRef = useRef(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return undefined;
    dialog.showModal();
    return () => { if (dialog.open) dialog.close(); };
  }, []);
  return (
    <dialog className="welcome-dialog shortcuts-dialog" ref={dialogRef} onCancel={event => { event.preventDefault(); onClose(); }} onClose={onClose}>
      <div className="welcome-dialog-content">
        <Eyebrow line>QUICKER WAYS TO WORK</Eyebrow>
        <h2>Keyboard shortcuts</h2>
        <p>Use these shortcuts from anywhere in your workspace.</p>
        <div className="shortcut-list">
          <div><span>Search everything</span><kbd>Ctrl</kbd><b>+</b><kbd>K</kbd><small>or ⌘ K on Mac</small></div>
          <div><span>New task</span><kbd>Alt</kbd><b>+</b><kbd>Shift</kbd><b>+</b><kbd>T</kbd></div>
          <div><span>New project</span><kbd>Alt</kbd><b>+</b><kbd>Shift</kbd><b>+</b><kbd>P</kbd></div>
          <div><span>New note</span><kbd>Alt</kbd><b>+</b><kbd>Shift</kbd><b>+</b><kbd>N</kbd></div>
          <div><span>Show shortcuts</span><kbd>?</kbd></div>
        </div>
        <div className="welcome-dialog-actions">
          <button className="button button-secondary" onClick={onClose}>Close</button>
          <button className="button button-primary" onClick={() => { onClose(); onCreate("task"); }}>＋ New task</button>
        </div>
      </div>
    </dialog>
  );
}

function wouldCreateDependencyCycle(taskId, dependencyId, tasks) {
  const pending = [dependencyId];
  const visited = new Set();
  while (pending.length) {
    const currentId = pending.pop();
    if (currentId === taskId) return true;
    if (visited.has(currentId)) continue;
    visited.add(currentId);
    const current = tasks.find(task => task.id === currentId);
    pending.push(...(current?.dependencyIds || []));
  }
  return false;
}

function CreateDialog({ item, projects, tasks, notes, onClose, onCreate }) {
  const dialogRef = useRef(null);
  const nameRef = useRef(null);
  const configs = {
    task: {
      title: item?.record ? "Edit this task" : "Add a next step", eyebrow: "SMALL STEPS, REAL MOMENTUM",
      description: "A clear next step makes a big goal feel a little closer.",
      name: "Task name", details: "Any helpful details", namePlaceholder: "What needs doing?",
      detailsPlaceholder: "Add context, a deadline, or a small first step…", button: item?.record ? "Save task" : "Add task"
    },
    project: {
      title: item?.record ? "Edit project" : "Give it a home", eyebrow: "MAKE SPACE FOR AN IDEA",
      description: "Create a space to bring related tasks and ideas together.",
      name: "Project name", details: "What is this project about?", namePlaceholder: "A name that feels right",
      detailsPlaceholder: "What are you hoping to make, learn, or change?", button: item?.record ? "Save project" : "Create project"
    },
    note: {
      title: item?.record ? "Edit note" : "Save a thought", eyebrow: "KEEP WHAT MATTERS",
      description: "A quick note can help you pick up where you left off.",
      name: "Note title", details: "Your note", namePlaceholder: "Give this thought a title",
      detailsPlaceholder: "Start writing…", button: item?.record ? "Save note" : "Save note"
    }
  };
  const config = item ? configs[item.type] : null;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!item || !dialog) return undefined;
    dialog.showModal();
    nameRef.current?.focus();
    return () => { if (dialog.open) dialog.close(); };
  }, [item]);

  if (!item || !config) return null;

  function submit(event) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    if (item.type === "task" && formData.get("recurrence") && !formData.get("dueDate")) {
      window.alert("Add a due date before setting a task to repeat.");
      return;
    }
    if (item.type === "task" && formData.get("scheduledAt")) {
      const start = new Date(String(formData.get("scheduledAt"))).getTime();
      const duration = Math.max(5, Number(formData.get("estimatedMinutes") || 25)) * 60000;
      const overlaps = tasks.find(task => task.id !== item.record?.id && task.status !== "done" && task.scheduledAt &&
        start < new Date(task.scheduledAt).getTime() + (task.estimatedMinutes || 25) * 60000 &&
        start + duration > new Date(task.scheduledAt).getTime());
      if (overlaps) {
        window.alert(`This focus block overlaps "${overlaps.title}". Choose a different time.`);
        return;
      }
    }
    onCreate({
      type: item.type,
      id: item.record?.id,
      folder: String(formData.get("folder") || "").trim(),
      projectId: String(formData.get("projectId") || item.projectId || ""),
      title: String(formData.get("title") || "").trim(),
      details: String(formData.get("details") || "").trim(),
      dueDate: String(formData.get("dueDate") || ""),
      reminderAt: String(formData.get("reminderAt") || ""),
      priority: String(formData.get("priority") || "medium"),
      recurrence: String(formData.get("recurrence") || ""),
      followUpDate: String(formData.get("followUpDate") || ""),
      inbox: Boolean(formData.get("inbox")),
      tags: splitTags(String(formData.get("tags") || "")),
      subtasks: String(formData.get("subtasks") || "").split("\n").map(title => title.trim()).filter(Boolean).slice(0, 30),
      dependencyIds: formData.getAll("dependencyIds").map(String),
      relatedNoteIds: formData.getAll("relatedNoteIds").map(String),
      relatedTaskIds: formData.getAll("relatedTaskIds").map(String),
      scheduledAt: String(formData.get("scheduledAt") || ""),
      estimatedMinutes: Math.max(0, Math.min(1440, Number(formData.get("estimatedMinutes") || 0))),
      status: String(formData.get("status") || item.record?.status || "todo")
    });
  }

  return (
    <dialog className="modal" ref={dialogRef} onCancel={onClose} onClose={onClose}>
      <form method="dialog" className="modal-close-form"><button className="modal-close" aria-label="Close dialog">×</button></form>
      <div className="modal-content">
        <Eyebrow>{config.eyebrow}</Eyebrow>
        <h2>{config.title}</h2>
        <p className="modal-description">{config.description}</p>
        <form className="create-form" onSubmit={submit}>
          <label>{config.name}<input ref={nameRef} name="title" required maxLength={120} defaultValue={item.record?.title || ""} placeholder={config.namePlaceholder} autoComplete="off" /></label>
          {item.type === "task" && projects.length > 0 && (
            <label>Project (optional)
              <select name="projectId" defaultValue={item.record?.projectId || item.projectId || ""}>
                <option value="">No project</option>
                {projects.map(project => <option value={project.id} key={project.id}>{project.name}</option>)}
              </select>
            </label>
          )}
          {item.type === "task" && <>
            <div className="form-grid">
              <label>Due date<input name="dueDate" type="date" defaultValue={item.record?.dueDate || ""} /></label>
              <label>Priority<select name="priority" defaultValue={item.record?.priority || "medium"}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label>
            </div>
            <label>Repeat<select name="recurrence" defaultValue={item.record?.recurrence || ""}><option value="">Does not repeat</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></label>
            <label>Reminder (optional)<input name="reminderAt" type="datetime-local" defaultValue={item.record?.reminderAt ? item.record.reminderAt.slice(0, 16) : ""} /></label>
            <label>Schedule a focus block<input name="scheduledAt" type="datetime-local" defaultValue={item.record?.scheduledAt ? item.record.scheduledAt.slice(0, 16) : ""} /></label>
            <label>Estimated focus time (minutes)<input name="estimatedMinutes" type="number" min="0" max="1440" step="5" defaultValue={item.record?.estimatedMinutes || 25} /></label>
            <label>Follow-up date (optional)<input name="followUpDate" type="date" defaultValue={item.record?.followUpDate || ""} /></label>
            <label className="checkbox-field"><input name="inbox" type="checkbox" defaultChecked={Boolean(item.record?.inbox)} /> Keep in quick-capture inbox until triaged</label>
            {tasks.filter(task => task.id !== item.record?.id && !wouldCreateDependencyCycle(item.record?.id || "", task.id, tasks)).length > 0 && <label>Depends on (select one or more)
              <select name="dependencyIds" multiple size={Math.min(4, tasks.filter(task => task.id !== item.record?.id && !wouldCreateDependencyCycle(item.record?.id || "", task.id, tasks)).length)} defaultValue={item.record?.dependencyIds || []}>
                {tasks.filter(task => task.id !== item.record?.id && !wouldCreateDependencyCycle(item.record?.id || "", task.id, tasks)).map(task => <option value={task.id} key={task.id}>{task.title}</option>)}
              </select>
            </label>}
            {notes.length > 0 && <label>Related notes (select one or more)
              <select name="relatedNoteIds" multiple size={Math.min(4, notes.length)} defaultValue={item.record?.relatedNoteIds || []}>{notes.map(note => <option value={note.id} key={note.id}>{note.title}</option>)}</select>
            </label>}
            <label>Tags (comma-separated)<input name="tags" maxLength={240} defaultValue={(item.record?.tags || []).join(", ")} placeholder="design, launch, follow-up" /></label>
            {item.record && <label>Status<select name="status" defaultValue={item.record.status}><option value="todo">To do</option><option value="in-progress">In progress</option><option value="waiting">Waiting</option><option value="done">Done</option></select></label>}
            <label>Subtasks (one per line)<textarea name="subtasks" rows="3" maxLength={1200} defaultValue={(item.record?.subtasks || []).map(subtask => subtask.title).join("\n")} placeholder={"Research options\nDraft the first version"} /></label>
          </>}
          {item.type === "project" && <>
            <label>Folder (optional)<input name="folder" list="project-folders" maxLength={80} defaultValue={item.record?.folder || ""} placeholder="e.g. Work, Personal, Learning" /><datalist id="project-folders">{[...new Set(projects.map(project => project.folder?.trim()).filter(Boolean))].map(folder => <option value={folder} key={folder} />)}</datalist></label>
            <label>Tags (comma-separated)<input name="tags" maxLength={240} defaultValue={(item.record?.tags || []).join(", ")} placeholder="work, personal, learning" /></label>
          </>}
          {item.type === "note" && projects.length > 0 && <label>Project (optional)<select name="projectId" defaultValue={item.record?.projectId || item.projectId || ""}><option value="">No project</option>{projects.map(project => <option value={project.id} key={project.id}>{project.name}</option>)}</select></label>}
          {item.type === "note" && tasks.length > 0 && <label>Related tasks (select one or more)
            <select name="relatedTaskIds" multiple size={Math.min(4, tasks.length)} defaultValue={item.record?.relatedTaskIds || []}>{tasks.map(task => <option value={task.id} key={task.id}>{task.title}</option>)}</select>
          </label>}
          <label>{config.details}<textarea name="details" rows="4" maxLength="1200" required={item.type === "note"} defaultValue={item.record?.details ?? item.record?.description ?? item.record?.body ?? ""} placeholder={config.detailsPlaceholder} /></label>
          <div className="modal-actions">
            <button type="button" className="button button-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="button button-primary">{config.button}</button>
          </div>
        </form>
      </div>
    </dialog>
  );
}

function Overview({ state, openCreate, navigate, taskActions, preferences }) {
  const todayDate = todayKey();
  const openTasks = state.tasks.filter(task => task.status !== "done").sort((a, b) =>
    (a.dueDate || "9999").localeCompare(b.dueDate || "9999") ||
    ({ high: 0, medium: 1, low: 2 }[a.priority || "medium"] - { high: 0, medium: 1, low: 2 }[b.priority || "medium"]) ||
    (b.createdAt || "").localeCompare(a.createdAt || "")
  );
  const overdueTasks = openTasks.filter(task => task.dueDate && task.dueDate < todayDate).length;
  const dueTodayTasks = openTasks.filter(task => task.dueDate === todayDate).length;
  const doneTasks = state.tasks.filter(task => task.status === "done");
  const completion = state.tasks.length ? Math.round(doneTasks.length / state.tasks.length * 100) : 0;
  const priorityCounts = ["high", "medium", "low"].map(priority => ({ priority, count: state.tasks.filter(task => task.priority === priority && task.status !== "done").length }));
  const today = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" }).format(new Date());
  const visible = new Set(preferences.visible);
  const orderedMainPanels = preferences.order.filter(id => ["hero", "tasks", "insights", "activity"].includes(id) && visible.has(id));
  const orderedSidePanels = preferences.order.filter(id => ["stats", "focus"].includes(id) && visible.has(id));
  const panels = {
    hero: <section className="hero-card">
      <div className="hero-content"><div className="hero-kicker"><span className="hero-kicker-dot" />YOUR NEXT CHAPTER</div><h2>Big ideas. Clear<br />next steps.</h2><p>Bring your projects, to-dos, and questions together. We’ll help you find your flow.</p><button className="button button-light" onClick={() => navigate("assistant")}>Start with a question <span>↗</span></button></div>
      <div className="hero-art" aria-hidden="true"><div className="orbit orbit-one" /><div className="orbit orbit-two" /><div className="art-center"><span>✳</span></div><div className="art-orb orb-one">✦</div><div className="art-orb orb-two">•</div><div className="art-orb orb-three">✧</div></div><div className="hero-glow" />
    </section>,
    tasks: <section className="section-block">
      <div className="section-heading"><div><Eyebrow>YOUR NEXT STEPS</Eyebrow><h2>Tasks to move forward <span className="heading-count">{openTasks.length}</span></h2></div><button className="link-button" onClick={() => navigate("tasks")}>All tasks <span>→</span></button></div>
      <div className="task-list card-surface">
        {openTasks.length ? openTasks.slice(0, 5).map(task => <TaskRow key={task.id} task={task} {...taskActions} projects={state.projects} allTasks={state.tasks} notes={state.notes} />) : <EmptyState title={state.tasks.length ? "Everything is wrapped up." : "Your next step starts here."} description={state.tasks.length ? "Take a breath, or capture your next idea." : "Add a task to give your ideas a little momentum."} action={!state.tasks.length && <button className="link-button" onClick={() => openCreate("task")}>Create your first task <span>→</span></button>} />}
      </div>
    </section>,
    insights: <section className="section-block">
      <div className="section-heading"><div><Eyebrow>WORKSPACE PULSE</Eyebrow><h2>Progress at a glance</h2></div><button className="link-button" onClick={() => navigate("activity")}>Activity history <span>→</span></button></div>
      <div className="insights-card card-surface">
        <div className="insight-completion"><strong>{completion}%</strong><span>of all tasks complete</span><div className="progress-track"><div style={{ width: `${completion}%` }} /></div></div>
        <div className="priority-chart" aria-label="Open tasks grouped by priority">{priorityCounts.map(item => <div className="priority-chart-row" key={item.priority}><span>{item.priority}</span><div className="progress-track"><div className={`priority-fill priority-fill-${item.priority}`} style={{ width: `${openTasks.length ? item.count / openTasks.length * 100 : 0}%` }} /></div><strong>{item.count}</strong></div>)}</div>
      </div>
    </section>,
    activity: <ActivityPanel items={(state.activity || []).slice(0, 5)} />,
    stats: <section className="stats-card card-surface"><div className="card-title-row"><div><Eyebrow>A QUICK LOOK</Eyebrow><h2>Your rhythm</h2></div><span className="stat-spark">✳</span></div>
      <div className="stat-row"><span className="stat-icon stat-violet">▤</span><span className="stat-label">Open tasks</span><strong>{openTasks.length}</strong></div>
      <div className="stat-row"><span className="stat-icon stat-peach">!</span><span className="stat-label">Overdue</span><strong>{overdueTasks}</strong></div>
      <div className="stat-row"><span className="stat-icon stat-mint">◷</span><span className="stat-label">Due today</span><strong>{dueTodayTasks}</strong></div>
      <div className="stat-row"><span className="stat-icon stat-mint">▧</span><span className="stat-label">Projects</span><strong>{state.projects.length}</strong></div>
      <div className="stat-row"><span className="stat-icon stat-violet">✓</span><span className="stat-label">Completed</span><strong>{doneTasks.length}</strong></div>
      <div className="progress-caption"><span>This week</span><span>{completion}% complete</span></div><div className="progress-track"><div style={{ width: `${completion}%` }} /></div>
    </section>,
    focus: <section className="focus-card"><div className="focus-icon">✳</div><Eyebrow>A MOMENT TO RESET</Eyebrow><h3>Not sure where to start?</h3><p>Tell your AI assistant what’s on your mind. You don’t need to have it all figured out.</p><button className="link-button" onClick={() => navigate("assistant")}>Let’s untangle it <span>→</span></button></section>
  };
  return (
    <section className="view active">
      <div className="welcome-row">
        <div><Eyebrow line>YOUR SPACE, YOUR PACE</Eyebrow><h1>Make room for <span className="headline-accent">good work.</span></h1><p className="welcome-copy">A little clarity goes a long way. What would you like to move forward today?</p></div>
        <div className="date-pill"><span className="date-icon">✳</span><span><small>TODAY</small>{today}</span></div>
      </div>
      <div className="overview-quick-actions" aria-label="Quick create">
        <button className="overview-create-action" onClick={() => openCreate("task")}><span className="quick-action-icon quick-task">＋</span><span><strong>New task</strong><small>Capture a next step</small></span><span className="quick-arrow">↗</span></button>
        <button className="overview-create-action" onClick={() => openCreate("project")}><span className="quick-action-icon quick-project">▧</span><span><strong>New project</strong><small>Give an idea a home</small></span><span className="quick-arrow">↗</span></button>
        <button className="overview-create-action" onClick={() => openCreate("note")}><span className="quick-action-icon quick-note">✎</span><span><strong>New note</strong><small>Save a thought</small></span><span className="quick-arrow">↗</span></button>
      </div>
      <div className="overview-grid">
        <div className="overview-main">{orderedMainPanels.map(id => <div className={`overview-panel overview-panel-${id}`} key={id}>{panels[id]}</div>)}</div>
        <div className="overview-side">{orderedSidePanels.map(id => <div className={`overview-panel overview-panel-${id}`} key={id}>{panels[id]}</div>)}</div>
      </div>
    </section>
  );
}

function TasksPage({ tasks, projects, notes, openCreate, taskActions, savedViews, onSaveView, onBulkUpdate, onBulkDelete }) {
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("due");
  const [projectFilter, setProjectFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [selectedIds, setSelectedIds] = useState([]);
  const [activeSavedView, setActiveSavedView] = useState("");
  const filtered = tasks.filter(task => (filter === "all" || task.status === filter) &&
    (projectFilter === "all" || (projectFilter === "__unassigned__" ? !task.projectId : task.projectId === projectFilter)) &&
    (priorityFilter === "all" || (task.priority || "medium") === priorityFilter) &&
    `${task.title} ${task.details || ""} ${(task.tags || []).join(" ")}`.toLowerCase().includes(query.trim().toLowerCase())).sort((a, b) => {
    if (sort === "priority") return ({ high: 0, medium: 1, low: 2 }[a.priority || "medium"] - { high: 0, medium: 1, low: 2 }[b.priority || "medium"]) || (a.dueDate || "9999").localeCompare(b.dueDate || "9999");
    if (sort === "title") return a.title.localeCompare(b.title);
    if (sort === "created") return (b.createdAt || "").localeCompare(a.createdAt || "");
    return (a.dueDate || "9999").localeCompare(b.dueDate || "9999");
  });
  const hasFilters = query || filter !== "all" || projectFilter !== "all" || priorityFilter !== "all";
  function saveCurrentView() {
    const name = window.prompt("Name this task view:");
    if (!name?.trim()) return;
    const view = { id: makeId(), name: name.trim(), filters: { filter, query, sort, projectFilter, priorityFilter } };
    onSaveView([...savedViews, view]);
    setActiveSavedView(view.id);
  }
  function applySavedView(event) {
    const view = savedViews.find(item => item.id === event.target.value);
    setActiveSavedView(view?.id || "");
    if (!view) return;
    setFilter(view.filters.filter || "all");
    setQuery(view.filters.query || "");
    setSort(view.filters.sort || "due");
    setProjectFilter(view.filters.projectFilter || "all");
    setPriorityFilter(view.filters.priorityFilter || "all");
  }
  return (
    <section className="view active">
      <PageIntro eyebrow="ONE THING AT A TIME" title="Your tasks" description="Keep the next steps small, clear, and moving." action={<button className="button button-primary" onClick={() => openCreate("task")}><span>＋</span> Add a task</button>} />
      <div className="toolbar card-surface"><div className="filter-tabs" role="group" aria-label="Filter tasks">
        {[["all", `All ${tasks.length}`], ["todo", "To do"], ["in-progress", "In progress"], ["waiting", "Waiting"], ["done", "Done"]].map(([value, label]) => <button key={value} className={`filter-tab ${filter === value ? "active" : ""}`} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}
      </div></div><div className="toolbar-extra">
        <label className="sort-field">Saved view<select value={activeSavedView} onChange={applySavedView}><option value="">Choose a view</option>{savedViews.map(view => <option value={view.id} key={view.id}>{view.name}</option>)}</select></label>
        <button className="clear-filters" onClick={saveCurrentView}>Save current view</button>
        <label className="search-field"><span>⌕</span><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Find a task…" aria-label="Search tasks" /></label>
        <label className="sort-field">Project<select value={projectFilter} onChange={event => setProjectFilter(event.target.value)} aria-label="Filter tasks by project"><option value="all">All projects</option><option value="__unassigned__">No project</option>{projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
        <label className="sort-field">Priority<select value={priorityFilter} onChange={event => setPriorityFilter(event.target.value)} aria-label="Filter tasks by priority"><option value="all">All priorities</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select></label>
        <label className="sort-field">Sort<select value={sort} onChange={event => setSort(event.target.value)} aria-label="Sort tasks"><option value="due">Due date</option><option value="priority">Priority</option><option value="title">Title</option><option value="created">Recently added</option></select></label>
        <span className="result-count" aria-live="polite">{filtered.length} {filtered.length === 1 ? "task" : "tasks"}</span>
        {hasFilters && <button className="clear-filters" onClick={() => { setQuery(""); setFilter("all"); setProjectFilter("all"); setPriorityFilter("all"); }}>Clear filters</button>}
      </div>
      {savedViews.length > 0 && activeSavedView && <button className="clear-filters" onClick={() => { onSaveView(savedViews.filter(view => view.id !== activeSavedView)); setActiveSavedView(""); }}>Delete saved view</button>}
      {selectedIds.length > 0 && <div className="bulk-toolbar card-surface"><strong>{selectedIds.length} selected</strong><label>Status<select value="" onChange={event => { if (event.target.value) onBulkUpdate(selectedIds, { status: event.target.value }); setSelectedIds([]); }}><option value="">Set status…</option><option value="todo">To do</option><option value="in-progress">In progress</option><option value="waiting">Waiting</option><option value="done">Done</option></select></label><label>Priority<select value="" onChange={event => { if (event.target.value) onBulkUpdate(selectedIds, { priority: event.target.value }); setSelectedIds([]); }}><option value="">Set priority…</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select></label><label>Project<select value="" onChange={event => { if (event.target.value !== "") onBulkUpdate(selectedIds, { projectId: event.target.value }); setSelectedIds([]); }}><option value="">Move to project…</option><option value="__unassigned__">No project</option>{projects.map(project => <option value={project.id} key={project.id}>{project.name}</option>)}</select></label><button className="button button-secondary" onClick={() => { onBulkDelete(selectedIds); setSelectedIds([]); }}>Delete selected</button></div>}
      <div className="bulk-select-row"><label><input type="checkbox" checked={filtered.length > 0 && filtered.every(task => selectedIds.includes(task.id))} onChange={event => {
        const visibleIds = filtered.map(task => task.id);
        setSelectedIds(current => event.target.checked ? [...new Set([...current, ...visibleIds])] : current.filter(id => !visibleIds.includes(id)));
      }} /> Select all visible</label></div>
      <div className="task-list tasks-page-list card-surface">{filtered.length ? filtered.map(task => <div className="selectable-task" key={task.id}><label className="task-select"><input type="checkbox" checked={selectedIds.includes(task.id)} onChange={event => setSelectedIds(current => event.target.checked ? [...current, task.id] : current.filter(id => id !== task.id))} aria-label={`Select ${task.title}`} /></label><TaskRow task={task} projects={projects} allTasks={tasks} notes={notes} {...taskActions} /></div>) : <EmptyState title={tasks.length ? "No tasks match that view." : "A fresh page, full of possibility."} description={tasks.length ? "Try another filter or search." : "Create a task to capture your next step."} action={!tasks.length && <button className="button button-secondary" onClick={() => openCreate("task")}>＋ Add a task</button>} />}</div>
    </section>
  );
}

function BoardPage({ tasks, projects, taskActions }) {
  const [query, setQuery] = useState("");
  const [projectFilter, setProjectFilter] = useState("all");
  const columns = [["todo", "To do"], ["in-progress", "In progress"], ["waiting", "Waiting"], ["done", "Done"]];
  const visibleTasks = tasks.filter(task => (projectFilter === "all" || (projectFilter === "__unassigned__" ? !task.projectId : task.projectId === projectFilter)) &&
    `${task.title} ${task.details || ""} ${(task.tags || []).join(" ")}`.toLowerCase().includes(query.trim().toLowerCase()));
  function dragStart(event, taskId) {
    event.dataTransfer.setData("text/plain", taskId);
    event.dataTransfer.effectAllowed = "move";
  }
  return <section className="view active">
    <PageIntro eyebrow="SEE THE WHOLE FLOW" title="Kanban board" description="Move work across the board as it progresses." />
    <div className="board-toolbar toolbar-extra">
      <label className="search-field"><span>⌕</span><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Find a task…" aria-label="Search board tasks" /></label>
      <label className="sort-field">Project<select value={projectFilter} onChange={event => setProjectFilter(event.target.value)} aria-label="Filter board by project"><option value="all">All projects</option><option value="__unassigned__">No project</option>{projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
      <span className="result-count">{visibleTasks.length} {visibleTasks.length === 1 ? "task" : "tasks"}</span>
      {(query || projectFilter !== "all") && <button className="clear-filters" onClick={() => { setQuery(""); setProjectFilter("all"); }}>Clear filters</button>}
    </div>
    <div className="kanban-board">{columns.map(([status, title]) => {
      const columnTasks = visibleTasks.filter(task => task.status === status);
      return <section className="kanban-column card-surface" key={status} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); const id = event.dataTransfer.getData("text/plain"); if (id) taskActions.onStatus(id, status); }}>
        <div className="kanban-column-heading"><h2>{title}</h2><span>{columnTasks.length}</span></div>
        <div className="kanban-column-body">{columnTasks.map(task => {
          const project = projects.find(item => item.id === task.projectId);
          return <article className="kanban-task" key={task.id} draggable onDragStart={event => dragStart(event, task.id)}>
            <div className="kanban-task-top"><span className={`priority-badge priority-${task.priority || "medium"}`}>{task.priority || "medium"}</span><button className="row-edit" onClick={() => taskActions.onEdit(task)} aria-label={`Edit ${task.title}`}>✎</button></div>
            <strong>{task.title}</strong>{project && <small>{project.name}</small>}{task.dueDate && <small className={task.dueDate < todayKey() && status !== "done" ? "task-due overdue" : ""}>Due {task.dueDate}</small>}
            <div className="kanban-task-actions"><button disabled={status === "todo"} onClick={() => taskActions.onStatus(task.id, status === "done" ? "in-progress" : "todo")}>←</button><button disabled={status === "done"} onClick={() => taskActions.onStatus(task.id, status === "todo" ? "in-progress" : "done")}>→</button></div>
          </article>;
        })}</div>
      </section>;
    })}</div>
  </section>;
}

function FocusPage({ tasks, timer, onStart, onPause, onReset, onTaskChange }) {
  const minutes = Math.floor(timer.remaining / 60);
  const seconds = timer.remaining % 60;
  const selectedTask = tasks.find(task => task.id === timer.taskId);
  return <section className="view active">
    <PageIntro eyebrow="A LITTLE SPACE TO FOCUS" title="Focus timer" description="Choose one task, protect a work session, and take it one step at a time." />
    <div className="focus-timer-card card-surface">
      <div className={`timer-ring ${timer.running ? "timer-running" : ""}`} style={{ "--timer-progress": `${360 * (1 - timer.remaining / (timer.duration * 60))}deg` }}><div><strong>{String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}</strong><span>{timer.running ? "FOCUS SESSION" : "READY WHEN YOU ARE"}</span></div></div>
      <h2>{selectedTask ? selectedTask.title : "Make a little room to focus"}</h2>
      <label className="focus-task-select">Focus task<select value={timer.taskId} onChange={event => onTaskChange(event.target.value)} disabled={timer.running}><option value="">No specific task</option>{tasks.filter(task => task.status !== "done" && task.status !== "waiting" && !task.inbox).map(task => <option value={task.id} key={task.id}>{task.title}</option>)}</select></label>
      <div className="focus-duration"><button className={timer.duration === 25 ? "active" : ""} onClick={() => onReset(25)}>25 min</button><button className={timer.duration === 50 ? "active" : ""} onClick={() => onReset(50)}>50 min</button></div>
      <div className="focus-controls"><button className="button button-primary" onClick={timer.running ? onPause : onStart}>{timer.running ? "Pause session" : "Start focusing"}</button><button className="button button-secondary" onClick={() => onReset(timer.duration)}>Reset</button></div>
    </div>
  </section>;
}

function SearchResults({ query, state, onChoose }) {
  const term = query.trim().toLowerCase();
  if (!term) return null;
  const results = [
    ...state.tasks.filter(item => `${item.title} ${item.details || ""} ${(item.tags || []).join(" ")}`.toLowerCase().includes(term)).map(item => ({ type: "task", id: item.id, title: item.title, subtitle: `Task · ${item.status}` })),
    ...state.projects.filter(item => `${item.name} ${item.description || ""} ${item.folder || ""} ${(item.tags || []).join(" ")}`.toLowerCase().includes(term)).map(item => ({ type: "project", id: item.id, title: item.name, subtitle: item.folder ? `Project · ${item.folder}` : "Project" })),
    ...state.notes.filter(item => `${item.title} ${item.body || ""}`.toLowerCase().includes(term)).map(item => ({ type: "note", id: item.id, title: item.title, subtitle: "Note" })),
    ...state.messages.filter(item => item.content.toLowerCase().includes(term)).slice(-10).map(item => ({ type: "assistant", id: item.id, title: item.content.slice(0, 100), subtitle: `${item.role === "user" ? "You" : "Assistant"} · Conversation` }))
  ].slice(0, 12);
  return <div className="global-search-results">{results.length ? results.map(item => <button key={`${item.type}-${item.id}`} onClick={() => onChoose(item)}><strong>{item.title}</strong><small>{item.subtitle}</small></button>) : <p>No matching tasks, projects, notes, or messages.</p>}</div>;
}

function CalendarPage({ tasks, navigate, onExportCalendar }) {
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1);
  const offset = (firstDay.getDay() + 6) % 7;
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells = [...Array(offset).fill(null), ...Array.from({ length: days }, (_, index) => index + 1)];
  while (cells.length % 7) cells.push(null);
  const dateKey = day => `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return <section className="view active">
    <PageIntro eyebrow="MAKE TIME FOR WHAT MATTERS" title="Your calendar" description="See what’s coming up and make space for the next step." action={<><button className="button button-secondary" onClick={onExportCalendar}>Export calendar (.ics)</button><button className="button button-secondary" onClick={() => navigate("tasks")}>View task list</button></>} />
    <div className="calendar-card card-surface">
      <div className="calendar-heading"><button className="icon-button" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} aria-label="Previous month">←</button><h2>{month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</h2><button className="icon-button" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} aria-label="Next month">→</button></div>
      <div className="calendar-grid">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(day => <strong className="calendar-weekday" key={day}>{day}</strong>)}{cells.map((day, index) => {
        const due = day ? tasks.filter(task => task.dueDate === dateKey(day)) : [];
        const scheduled = day ? tasks.filter(task => task.scheduledAt?.slice(0, 10) === dateKey(day)) : [];
        return <div key={`${day || "blank"}-${index}`} className={`calendar-day ${day && dateKey(day) === todayKey() ? "calendar-today" : ""} ${day ? "" : "calendar-blank"}`}><span>{day || ""}</span>{scheduled.slice(0, 2).map(task => <button key={`schedule-${task.id}`} className="calendar-task calendar-time-block" onClick={() => navigate("tasks")} title={`${task.title} · ${task.estimatedMinutes || 25} minutes`}>{new Date(task.scheduledAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })} · {task.title}</button>)}{due.slice(0, Math.max(0, 3 - scheduled.length)).map(task => <button key={task.id} className={`calendar-task ${task.status === "done" ? "calendar-task-done" : ""}`} onClick={() => navigate("tasks")} title={task.title}>{task.title}</button>)}{due.length + scheduled.length > 3 && <small>+{due.length + scheduled.length - 3} more</small>}</div>;
      })}</div>
      {!tasks.some(task => task.dueDate || task.scheduledAt) && <p className="calendar-hint">Add due dates or schedule focus blocks on tasks to see them here.</p>}
    </div>
  </section>;
}

function ActivityPanel({ items, emptyMessage = "Workspace changes will appear here." }) {
  return <section className="section-block"><div className="section-heading"><div><Eyebrow>RECENT CHANGES</Eyebrow><h2>Activity history</h2></div></div><div className="activity-list card-surface">{items.length ? items.map(item => <div className="activity-row" key={item.id}><span className="activity-mark">✳</span><span>{item.label}</span><time>{new Date(item.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</time></div>) : <p className="activity-empty">{emptyMessage}</p>}</div></section>;
}

function ActivityPage({ items }) {
  const [query, setQuery] = useState("");
  const visibleItems = items.filter(item => item.label.toLowerCase().includes(query.trim().toLowerCase()));
  return <section className="view active"><PageIntro eyebrow="A RECORD OF YOUR MOMENTUM" title="Activity history" description="A recent timeline of what’s changed in your workspace." /><div className="toolbar-extra"><label className="search-field"><span>⌕</span><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Find an update…" aria-label="Search activity history" /></label><span className="result-count">{visibleItems.length} {visibleItems.length === 1 ? "update" : "updates"}</span></div><ActivityPanel items={visibleItems} emptyMessage={query ? "No updates match that search." : undefined} /></section>;
}

function ProjectsPage({ projects, tasks, openCreate, onDelete, onEdit, onOpen }) {
  const [query, setQuery] = useState("");
  const [folderFilter, setFolderFilter] = useState("all");
  const [sort, setSort] = useState("updated");
  const palettes = ["project-lilac", "project-mint", "project-peach", "project-blue"];
  const symbols = ["✳", "▧", "✦", "◈"];
  const folders = [...new Set(projects.map(project => project.folder?.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const visibleProjects = projects.filter(project => (folderFilter === "all" || (folderFilter === "__unfiled__" ? !project.folder?.trim() : project.folder?.trim() === folderFilter)) &&
    `${project.name} ${project.description || ""} ${project.folder || ""} ${(project.tags || []).join(" ")}`.toLowerCase().includes(query.trim().toLowerCase())).sort((a, b) => {
    if (sort === "name") return a.name.localeCompare(b.name);
    if (sort === "progress") {
      const progressA = tasks.filter(task => task.projectId === a.id).filter(task => task.status === "done").length / Math.max(1, tasks.filter(task => task.projectId === a.id).length);
      const progressB = tasks.filter(task => task.projectId === b.id).filter(task => task.status === "done").length / Math.max(1, tasks.filter(task => task.projectId === b.id).length);
      return progressB - progressA || a.name.localeCompare(b.name);
    }
    return (b.createdAt || "").localeCompare(a.createdAt || "");
  });
  const hasFilters = query || folderFilter !== "all";
  return (
    <section className="view active">
      <PageIntro eyebrow="IDEAS WITH A HOME" title="Your projects" description="Give the things you care about a little space to grow." action={<button className="button button-primary" onClick={() => openCreate("project")}><span>＋</span> New project</button>} />
      <div className="toolbar-extra">
        <label className="search-field"><span>⌕</span><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Find a project…" aria-label="Search projects" /></label>
        <label className="sort-field">Folder<select value={folderFilter} onChange={event => setFolderFilter(event.target.value)} aria-label="Filter projects by folder"><option value="all">All folders</option>{folders.map(folder => <option value={folder} key={folder}>{folder}</option>)}{projects.some(project => !project.folder?.trim()) && <option value="__unfiled__">Unfiled</option>}</select></label>
        <label className="sort-field">Sort<select value={sort} onChange={event => setSort(event.target.value)} aria-label="Sort projects"><option value="updated">Recently added</option><option value="name">Name</option><option value="progress">Progress</option></select></label>
        <span className="result-count">{visibleProjects.length} {visibleProjects.length === 1 ? "project" : "projects"}</span>
        {hasFilters && <button className="clear-filters" onClick={() => { setQuery(""); setFolderFilter("all"); }}>Clear filters</button>}
      </div>
      <div className="project-grid">
        {visibleProjects.length ? visibleProjects.map((project, index) => {
          const projectTasks = tasks.filter(task => task.projectId === project.id);
          const completed = projectTasks.filter(task => task.status === "done").length;
          const openProjectTasks = projectTasks.filter(task => task.status !== "done");
          const overdueCount = openProjectTasks.filter(task => task.dueDate && task.dueDate < todayKey()).length;
          const waitingCount = openProjectTasks.filter(task => task.status === "waiting").length;
          const health = projectTasks.length === 0 ? "Not started" : overdueCount ? "At risk" : waitingCount ? "Waiting" : "On track";
          const progress = projectTasks.length ? Math.round(completed / projectTasks.length * 100) : 0;
          return <article className={`project-card card-surface ${palettes[index % palettes.length]}`} key={project.id}>
            <div className="project-card-top"><span className="project-symbol">{symbols[index % symbols.length]}</span><div><button className="row-edit" onClick={() => onEdit(project)} aria-label={`Edit ${project.name}`} title="Edit project">✎</button><button className="row-delete" onClick={() => onDelete(project.id)} aria-label={`Delete ${project.name}`} title="Delete project">×</button></div></div>
            <Eyebrow>{project.folder?.trim() || `PROJECT ${String(index + 1).padStart(2, "0")}`}</Eyebrow><h2>{project.name}</h2><p className="project-description">{project.description || "A new space for your ideas and next steps."}</p>
              {(project.tags || []).length > 0 && <div className="project-tags">{project.tags.map(tag => <span className="tag-chip" key={tag}>{tag}</span>)}</div>}
            <div className="project-progress-caption"><span>{projectTasks.length} {projectTasks.length === 1 ? "task" : "tasks"}</span><span>{progress}%</span></div><div className="progress-track"><div style={{ width: `${progress}%` }} /></div>
            <div className={`project-health ${health === "At risk" ? "project-health-risk" : ""}`}><span>{health}</span>{overdueCount > 0 && <small>{overdueCount} overdue</small>}{waitingCount > 0 && <small>{waitingCount} waiting</small>}</div>
            <button className="project-add-task" onClick={() => onOpen(project.id)}>Open project details →</button>
            <button className="project-add-task" onClick={() => openCreate("task", project.id)}>＋ Add a task to this project</button>
          </article>;
        }) : <div className="empty-card"><EmptyState title={projects.length ? "No projects match those filters." : "Give your next big idea a home."} description={projects.length ? "Try a different search or folder." : "Projects make it easier to keep related work and next steps together."} action={projects.length ? <button className="button button-secondary" onClick={() => { setQuery(""); setFolderFilter("all"); }}>Clear filters</button> : <button className="button button-secondary" onClick={() => openCreate("project")}>＋ Create a project</button>} /></div>}
      </div>
    </section>
  );
}

function ProjectDetailPage({ project, tasks, notes, activity, openCreate, onEdit, onBack, taskActions, noteActions }) {
  if (!project) return <section className="view active"><EmptyState title="Project not found" description="This project may have been deleted." action={<button className="button button-secondary" onClick={onBack}>Back to projects</button>} /></section>;
  const projectTasks = tasks.filter(task => task.projectId === project.id);
  const projectNotes = notes.filter(note => note.projectId === project.id);
  const completed = projectTasks.filter(task => task.status === "done").length;
  const progress = projectTasks.length ? Math.round(completed / projectTasks.length * 100) : 0;
  return <section className="view active">
    <PageIntro eyebrow="PROJECT SPACE" title={project.name} description={project.description || "A dedicated space for this project's tasks, notes, and progress."} action={<><button className="button button-secondary" onClick={onBack}>← All projects</button><button className="button button-primary" onClick={() => openCreate("task", project.id)}>＋ Add task</button><button className="button button-secondary" onClick={() => openCreate("note", project.id)}>＋ Add note</button></>} />
    <div className="project-detail-stats card-surface"><div><strong>{projectTasks.length}</strong><span>Tasks</span></div><div><strong>{completed}</strong><span>Completed</span></div><div><strong>{progress}%</strong><span>Progress</span></div><button className="button button-secondary" onClick={() => onEdit(project)}>Edit project</button></div>
    <div className="project-detail-grid">
      <section><div className="section-heading"><h2>Tasks</h2></div><div className="task-list card-surface">{projectTasks.length ? projectTasks.map(task => <TaskRow key={task.id} task={task} projects={[project]} allTasks={tasks} notes={notes} {...taskActions} />) : <EmptyState title="No tasks in this project yet" description="Add a next step to get moving." action={<button className="button button-secondary" onClick={() => openCreate("task", project.id)}>Add a task</button>} />}</div></section>
      <section><div className="section-heading"><h2>Project notes</h2></div><div className="project-note-list card-surface">{projectNotes.length ? projectNotes.map(note => <article className="project-note" key={note.id}><div><strong>{note.title}</strong><p>{note.body}</p></div><div><button className="row-edit" onClick={() => noteActions.onEdit(note)} aria-label={`Edit ${note.title}`}>✎</button><button className="row-delete" onClick={() => noteActions.onDelete(note.id)} aria-label={`Delete ${note.title}`}>×</button></div></article>) : <EmptyState title="Keep project thoughts together" description="Add notes from this project space to find them here." action={<button className="button button-secondary" onClick={() => openCreate("note", project.id)}>Add a note</button>} />}</div></section>
    </div>
    <ActivityPanel items={activity.filter(item => item.projectId === project.id).slice(0, 10)} />
  </section>;
}

function NotesPage({ notes, projects, tasks, openCreate, onDelete, onEdit }) {
  const [query, setQuery] = useState("");
  const [projectFilter, setProjectFilter] = useState("all");
  const [sort, setSort] = useState("updated");
  const visibleNotes = notes.filter(note => (projectFilter === "all" || (projectFilter === "" ? !note.projectId : note.projectId === projectFilter)) &&
    `${note.title} ${note.body || ""} ${projects.find(project => project.id === note.projectId)?.name || ""}`.toLowerCase().includes(query.trim().toLowerCase())).sort((a, b) => {
    if (sort === "title") return a.title.localeCompare(b.title);
    const updatedA = a.updatedAt || a.createdAt || "";
    const updatedB = b.updatedAt || b.createdAt || "";
    return sort === "oldest" ? updatedA.localeCompare(updatedB) : updatedB.localeCompare(updatedA);
  });
  const hasFilters = query || projectFilter !== "all";
  return (
    <section className="view active">
      <PageIntro eyebrow="SPACE TO THINK" title="Your notes" description="Keep the little thoughts that might turn into something big." action={<button className="button button-primary" onClick={() => openCreate("note")}><span>＋</span> New note</button>} />
      <div className="toolbar-extra">
        <label className="search-field"><span>⌕</span><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Find a note…" aria-label="Search notes" /></label>
        <label className="sort-field">Project<select value={projectFilter} onChange={event => setProjectFilter(event.target.value)} aria-label="Filter notes by project"><option value="all">All projects</option><option value="">Unfiled</option>{projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
        <label className="sort-field">Sort<select value={sort} onChange={event => setSort(event.target.value)} aria-label="Sort notes"><option value="updated">Recently updated</option><option value="oldest">Oldest</option><option value="title">Title</option></select></label>
        <span className="result-count">{visibleNotes.length} {visibleNotes.length === 1 ? "note" : "notes"}</span>
        {hasFilters && <button className="clear-filters" onClick={() => { setQuery(""); setProjectFilter("all"); }}>Clear filters</button>}
      </div>
      <div className="notes-grid">
        {visibleNotes.length ? visibleNotes.map(note => <article className="note-card card-surface" key={note.id}>
          <div className="note-card-top"><span className="note-symbol">✎</span><div><button className="row-edit" onClick={() => onEdit(note)} aria-label={`Edit ${note.title}`} title="Edit note">✎</button><button className="row-delete" onClick={() => onDelete(note.id)} aria-label={`Delete ${note.title}`} title="Delete note">×</button></div></div>
          <h2>{note.title}</h2><p>{note.body || "A thought worth keeping."}</p>{note.projectId && projects.find(project => project.id === note.projectId) && <small>Project · {projects.find(project => project.id === note.projectId).name}</small>}{note.relatedTaskIds?.length > 0 && <small>Related tasks · {note.relatedTaskIds.map(id => tasks.find(task => task.id === id)?.title).filter(Boolean).join(", ")}</small>}<small>{new Date(note.updatedAt || note.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</small>
        </article>) : <div className="empty-card"><EmptyState icon="✎" title={notes.length ? "No notes match those filters." : "Save a thought for later."} description={notes.length ? "Try a different search or project." : "Keep a useful idea, a meeting note, or something you don’t want to forget."} action={notes.length ? <button className="button button-secondary" onClick={() => { setQuery(""); setProjectFilter("all"); }}>Clear filters</button> : <button className="button button-secondary" onClick={() => openCreate("note")}>＋ Write a note</button>} /></div>}
      </div>
    </section>
  );
}

function AssistantPage({ messages, aiConfigured, syncMode, onSend, onClear, navigate, focusMessageId }) {
  const [message, setMessage] = useState("");
  const [mode, setMode] = useState("general problem-solving");
  const [sending, setSending] = useState(false);
  const messagesRef = useRef(null);
  useEffect(() => {
    if (messagesRef.current) messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
  }, [messages, sending]);
  useEffect(() => {
    if (focusMessageId) document.getElementById(`message-${focusMessageId}`)?.scrollIntoView({ block: "center" });
  }, [focusMessageId]);

  async function submit(event) {
    event.preventDefault();
    const prompt = message.trim();
    if (!prompt || sending) return;
    setMessage("");
    setSending(true);
    try { await onSend(prompt, mode); }
    finally { setSending(false); }
  }

  return (
    <section className="view active">
      <PageIntro eyebrow="THINK BETTER, TOGETHER" title={<>Your thought partner<span className="headline-accent">.</span></>} description="Plan a project, work through a problem, or just get unstuck. Start wherever you are." badge={<span className="assistant-badge"><span>✳</span> AI ASSISTANT</span>} />
      <div className="assistant-layout">
        <div className="chat-card card-surface">
          <div className="chat-topline"><div className="assistant-avatar">✳</div><div><strong>Nexa assistant</strong><small><span className="online-dot" /> Here to help you think it through</small></div>
            <select className="assistant-mode" value={mode} onChange={event => setMode(event.target.value)} aria-label="Choose an assistant focus"><option value="general problem-solving">Everyday help</option><option value="project planning and productivity">Project planning</option><option value="customer support problem-solving">Customer support</option></select>
            <button className="icon-button chat-clear" onClick={onClear} aria-label="Clear conversation" title="Clear conversation">↺</button>
          </div>
          <div className="chat-messages" ref={messagesRef} aria-live="polite">
            {messages.length ? messages.map(item => <div id={`message-${item.id}`} className={`message ${item.role === "user" ? "message-user" : "message-assistant"}`} key={item.id}>
              {item.role === "assistant" && <span className="message-avatar">✳</span>}
              <div className="message-bubble">{item.content.split("\n").map((line, index) => <Fragment key={index}>{index > 0 && <br />}{line}</Fragment>)}</div>
            </div>) : <div className="chat-welcome"><div className="welcome-spark">✳</div><h2>Hey, where should we begin?</h2><p>Bring a question, a half-formed idea, or a knot you’d like to untangle. We’ll take it one step at a time.</p></div>}
            {sending && <div className="message message-assistant"><span className="message-avatar">✳</span><div className="message-bubble typing-indicator"><span /><span /><span /></div></div>}
          </div>
          <div className="chat-compose-wrap">
            {!messages.length && <div className="prompt-suggestions">
              <button onClick={() => setMessage("Help me break down a big goal into doable next steps.")}>Break down a big goal</button>
              <button onClick={() => setMessage("I feel stuck on a problem. Ask me a few questions to help me find a way forward.")}>Help me get unstuck</button>
              <button onClick={() => setMessage("Help me plan a simple, realistic week.")}>Plan my week</button>
            </div>}
            <form className="chat-compose" onSubmit={submit}><textarea rows="1" maxLength={12000} value={message} onChange={event => setMessage(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form.requestSubmit(); } }} placeholder="What’s on your mind?" aria-label="Message the AI assistant" disabled={sending} /><button className="send-button" type="submit" aria-label="Send message" title="Send message" disabled={sending}>↑</button></form>
            <p className="privacy-note">Your message is sent to the AI provider configured by your workspace admin. <button className="inline-link" onClick={() => navigate("settings")}>AI settings</button></p>
          </div>
        </div>
        <aside className="assistant-aside">
          <div className="assistant-side-card"><Eyebrow>A GOOD PLACE TO BEGIN</Eyebrow><h3>You can bring the messy version.</h3><p>Share what you know so far. We can make sense of the rest together.</p><div className="starter-list"><div><span>01</span> What’s the real challenge?</div><div><span>02</span> What have you tried so far?</div><div><span>03</span> What would “better” look like?</div></div></div>
          <div className="local-note"><span>◉</span><div><strong>Your workspace stays yours</strong><p>{syncMode === "local" ? "Tasks, notes, and conversations are saved in your local project folder." : "Your workspace is stored with the sync provider selected in Settings."} Only messages you send are shared with your configured AI provider. {aiConfigured ? "" : "Set up an AI key in Settings to get assistant replies."}</p></div></div>
        </aside>
      </div>
    </section>
  );
}

function SettingsPage({
  aiConfigured,
  aiModel,
  dataFile,
  state,
  darkMode,
  onToggleTheme,
  onImport,
  onEnableNotifications,
  onRemoveSamples,
  overviewPreferences,
  onUpdateOverview,
  syncSettings,
  syncSession,
  syncStatus,
  onUseLocal,
  onConnectSupabase,
  onConnectSelfHosted,
  onSignOutSupabase
}) {
  const fileRef = useRef(null);
  const [importMode, setImportMode] = useState("merge");
  const [notificationStatus, setNotificationStatus] = useState(() =>
    typeof Notification === "undefined" || !window.isSecureContext ? "unavailable" : Notification.permission
  );
  function exportBackup() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `nexaflow-backup-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }
  async function importBackup(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const imported = JSON.parse(await file.text());
      await onImport(imported, importMode);
    } catch (error) {
      window.alert(error instanceof SyntaxError ? "That file is not valid JSON. Choose a NexaFlow backup file." : error.message);
    } finally {
      event.target.value = "";
    }
  }
  async function enableNotifications() {
    try {
      const permission = await onEnableNotifications();
      setNotificationStatus(permission);
    } catch (error) {
      window.alert(`Could not enable notifications: ${error.message}`);
    }
  }
  function moveOverviewPanel(panelId, direction) {
    const groupIds = Object.values(OVERVIEW_PANEL_GROUPS).find(ids => ids.includes(panelId));
    if (!groupIds) return;
    const groupOrder = overviewPreferences.order.filter(id => groupIds.includes(id));
    const index = groupOrder.indexOf(panelId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= groupOrder.length) return;
    [groupOrder[index], groupOrder[target]] = [groupOrder[target], groupOrder[index]];
    let nextGroupIndex = 0;
    const order = overviewPreferences.order.map(id => groupIds.includes(id) ? groupOrder[nextGroupIndex++] : id);
    onUpdateOverview({ ...overviewPreferences, order });
  }
  return (
    <section className="view active">
      <PageIntro eyebrow="YOUR WORKSPACE, YOUR RULES" title="Settings" description="A few details about where your data lives and how AI works." />
      <div className="settings-grid">
        <SyncSettings settings={syncSettings} session={syncSession} syncStatus={syncStatus} onUseLocal={onUseLocal} onConnectSupabase={onConnectSupabase} onConnectSelfHosted={onConnectSelfHosted} onSignOut={onSignOutSupabase} />
        <section className="settings-card card-surface"><div className="settings-icon">✳</div><Eyebrow>AI CONNECTION</Eyebrow><h2>Make your assistant yours</h2>
          <p className="settings-copy">Connect an OpenAI-compatible provider using environment variables on this computer. Your API key stays on the server and is never stored in the browser or project data.</p>
          <div className="connection-status"><span className={`connection-dot ${aiConfigured ? "connected" : "disconnected"}`} /><span>{aiConfigured ? `Key configured · ${aiModel}` : "Not configured · add an API key below"}</span></div>
          <div className="settings-code"><code>$env:NEXAFLOW_AI_API_KEY = "your-key"</code><code>$env:NEXAFLOW_AI_BASE_URL = "https://api.openai.com/v1"</code><code>$env:NEXAFLOW_AI_MODEL = "gpt-4o-mini"</code><code>npm run dev</code></div>
          <p className="settings-footnote">Stop and restart the local server after changing these values. Compatible providers may use a different base URL and model.</p>
        </section>
        <section className="settings-card card-surface"><div className="settings-icon settings-icon-mint">▣</div><Eyebrow>{syncSettings.mode === "local" ? "LOCAL BY DESIGN" : "ON-DEVICE BACKUP"}</Eyebrow><h2>{syncSettings.mode === "local" ? "Your data, on your machine" : "A copy stays on this device"}</h2>
          <p className="settings-copy">{syncSettings.mode === "local"
            ? "Projects, tasks, notes, and assistant conversations are saved as a JSON file inside this project. They are not uploaded by NexaFlow."
            : "NexaFlow keeps a browser copy for offline recovery. Your primary workspace is stored with the sync provider you selected."}</p>
          {syncSettings.mode === "local" && <div className="data-location"><span>▤</span><code>{dataFile || "Loading…"}</code></div>}
          <button className="button button-secondary" onClick={exportBackup}>Export a backup <span>↗</span></button>
          <div className="import-controls"><label>Import behavior<select value={importMode} onChange={event => setImportMode(event.target.value)}><option value="merge">Merge into current workspace</option><option value="replace">Replace current workspace</option></select></label><input ref={fileRef} type="file" accept="application/json,.json" onChange={importBackup} hidden /><button className="button button-secondary" onClick={() => fileRef.current?.click()}>Import backup</button></div>
          <p className="settings-footnote">{syncSettings.mode === "local"
            ? "Use the backup button to download a copy. Keep the data folder private if other people can access this computer."
            : "Use the backup button to download a portable copy. Browser storage is not encrypted, so protect access to this device."}</p>
        </section>
        <section className="settings-card card-surface"><div className="settings-icon settings-icon-mint">◐</div><Eyebrow>PERSONALIZE</Eyebrow><h2>Make it comfortable</h2><p className="settings-copy">Choose the appearance that works best for you.</p><button className="button button-secondary" onClick={onToggleTheme}>{darkMode ? "Switch to light mode" : "Switch to dark mode"}</button></section>
        <section className="settings-card card-surface"><div className="settings-icon settings-icon-mint">▦</div><Eyebrow>YOUR OVERVIEW</Eyebrow><h2>Choose what you see first</h2><p className="settings-copy">Show or hide overview sections and reorder them within the main column or sidebar. Preferences stay on this device.</p><div className="overview-preference-list">{Object.entries(OVERVIEW_PANEL_GROUPS).map(([groupName, panelIds]) => {
          const groupOrder = overviewPreferences.order.filter(id => panelIds.includes(id));
          return <div className="overview-preference-group" key={groupName}>
            <h3>{groupName === "main" ? "Main column" : "Sidebar"}</h3>
            {groupOrder.map((panelId, index) => {
              const panel = OVERVIEW_PANELS.find(item => item.id === panelId);
              if (!panel) return null;
              const isVisible = overviewPreferences.visible.includes(panelId);
              return <div className="overview-preference-row" key={panelId}>
                <label><input type="checkbox" checked={isVisible} onChange={event => {
                  const visible = event.target.checked
                    ? [...overviewPreferences.visible, panelId]
                    : overviewPreferences.visible.filter(id => id !== panelId);
                  onUpdateOverview({ ...overviewPreferences, visible });
                }} />{panel.label}</label>
                <div><button className="icon-button" disabled={index === 0} onClick={() => moveOverviewPanel(panelId, -1)} aria-label={`Move ${panel.label} up`}>↑</button><button className="icon-button" disabled={index === groupOrder.length - 1} onClick={() => moveOverviewPanel(panelId, 1)} aria-label={`Move ${panel.label} down`}>↓</button></div>
              </div>;
            })}
          </div>;
        })}</div></section>
        <section className="settings-card card-surface"><div className="settings-icon">◷</div><Eyebrow>TASK REMINDERS</Eyebrow><h2>Stay in the loop</h2><p className="settings-copy">In-app reminders and optional browser notifications fire while a NexaFlow tab is open; missed reminders are checked when you return. Due dates are also highlighted in your task list and calendar.</p><div className="connection-status"><span className={`connection-dot ${notificationStatus === "granted" ? "connected" : "disconnected"}`} /><span>{notificationStatus === "granted" ? "Browser notifications enabled" : notificationStatus === "denied" ? "Browser notifications blocked in browser settings" : notificationStatus === "unavailable" ? "Browser notifications unavailable" : "Browser notifications not enabled"}</span></div>{notificationStatus !== "granted" && notificationStatus !== "denied" && notificationStatus !== "unavailable" && <button className="button button-secondary" onClick={enableNotifications}>Enable browser notifications</button>}</section>
        {state.projects.some(item => item.sampleData) || state.tasks.some(item => item.sampleData) || state.notes.some(item => item.sampleData) ? <section className="settings-card card-surface"><div className="settings-icon settings-icon-mint">⌫</div><Eyebrow>STARTER CONTENT</Eyebrow><h2>Remove sample items</h2><p className="settings-copy">Remove only the example projects, tasks, and notes. Anything you created yourself will stay in your workspace.</p><button className="button button-secondary" onClick={onRemoveSamples}>Remove sample items</button></section> : null}
      </div>
    </section>
  );
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
    window.addEventListener("online", syncOfflineChanges);
    return () => window.removeEventListener("online", syncOfflineChanges);
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

  function openCreate(type, projectId = "") {
    setCreateItem({ type, projectId });
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
    const task = item.type === "task" ? { id: makeId(), title: item.title, details: item.details, status: "todo", projectId: item.projectId, dueDate: item.dueDate, reminderAt: item.reminderAt, priority: item.priority, recurrence: item.recurrence, followUpDate: item.followUpDate, inbox: item.inbox, tags: item.tags, dependencyIds: item.dependencyIds, relatedNoteIds: item.relatedNoteIds, scheduledAt: item.scheduledAt, estimatedMinutes: item.estimatedMinutes, subtasks: item.subtasks.map(title => ({ id: makeId(), title, done: false })), createdAt: now } : null;
    const project = item.type === "project" ? { id: makeId(), name: item.title, description: item.details, folder: item.folder, tags: item.tags, createdAt: now } : null;
    const note = item.type === "note" ? { id: makeId(), title: item.title, body: item.details, projectId: item.projectId, relatedTaskIds: item.relatedTaskIds, createdAt: now, updatedAt: now } : null;
    const next = {
      ...state,
      activity: logActivity(state, `Created ${item.type}: ${item.title}`, item.projectId || project?.id || ""),
      tasks: task ? [task, ...state.tasks] : item.type === "note" ? state.tasks.map(existing => ({ ...existing, relatedNoteIds: item.relatedTaskIds.includes(existing.id) ? [...new Set([...(existing.relatedNoteIds || []), note.id])] : (existing.relatedNoteIds || []).filter(noteId => noteId !== note.id) })) : state.tasks,
      projects: project ? [...state.projects, project] : state.projects,
      notes: note ? [...state.notes, note] : item.type === "task" ? state.notes.map(existing => ({ ...existing, relatedTaskIds: item.relatedNoteIds.includes(existing.id) ? [...new Set([...(existing.relatedTaskIds || []), task.id])] : (existing.relatedTaskIds || []).filter(taskId => taskId !== task.id) })) : state.notes
    };
    update(next);
    setCreateItem(null);
    if (item.projectId && state.projects.some(project => project.id === item.projectId)) {
      setSelectedProjectId(item.projectId);
      navigate("projectDetail");
    } else {
      navigate(item.type === "task" ? "tasks" : item.type === "project" ? "projects" : "notes");
    }
    const saved = await persist(next);
    if (saved) notify(`${item.type === "task" ? "Task" : item.type === "project" ? "Project" : "Note"} saved to this workspace.`);
  }

  async function captureTask(title) {
    const task = {
      id: makeId(),
      title,
      details: "",
      status: "todo",
      projectId: "",
      dueDate: "",
      priority: "medium",
      inbox: true,
      tags: [],
      dependencyIds: [],
      relatedNoteIds: [],
      scheduledAt: "",
      estimatedMinutes: 25,
      subtasks: [],
      createdAt: new Date().toISOString()
    };
    const next = {
      ...state,
      tasks: [task, ...state.tasks],
      activity: logActivity(state, `Captured in inbox: ${title}`)
    };
    update(next);
    if (await persist(next)) notify("Saved to your quick-capture inbox.");
  }

  async function scheduleDayPlan(proposed) {
    const assignments = proposed.filter(item => {
      const task = state.tasks.find(record => record.id === item.id);
      return task && task.status !== "done" && task.status !== "waiting" && !task.inbox;
    });
    const scheduled = state.tasks.filter(task => task.status !== "done" && task.scheduledAt && !assignments.some(item => item.id === task.id));
    const intervals = scheduled.map(task => ({
      start: new Date(task.scheduledAt).getTime(),
      end: new Date(task.scheduledAt).getTime() + Math.max(5, Number(task.estimatedMinutes) || 25) * 60000
    }));
    for (const assignment of assignments) {
      const task = state.tasks.find(record => record.id === assignment.id);
      const start = new Date(assignment.scheduledAt).getTime();
      const end = start + Math.max(5, Number(task.estimatedMinutes) || 25) * 60000;
      if (intervals.some(block => start < block.end && end > block.start)) {
        notify("A focus block conflicts with this plan. Refresh the plan and try again.", "error");
        return;
      }
      intervals.push({ start, end });
    }
    if (!assignments.length) {
      notify("There are no available tasks to schedule.", "error");
      return;
    }
    const byId = new Map(assignments.map(item => [item.id, item.scheduledAt]));
    const next = {
      ...state,
      tasks: state.tasks.map(task => byId.has(task.id) ? { ...task, scheduledAt: byId.get(task.id) } : task),
      activity: logActivity(state, `Scheduled ${assignments.length} tasks for today`)
    };
    update(next);
    if (await persist(next)) notify(`Scheduled ${assignments.length} tasks for today.`);
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

  function createGoal(goal) {
    update(current => ({ ...current, goals: [...(current.goals || []), goal], activity: logActivity(current, `Created goal: ${goal.title}`, goal.projectId) }));
    notify("Goal added.");
  }

  function toggleGoalMilestone(goalId, milestoneId) {
    update(current => ({
      ...current,
      goals: (current.goals || []).map(goal => goal.id !== goalId ? goal : {
        ...goal,
        milestones: goal.milestones.map(milestone => milestone.id === milestoneId ? { ...milestone, done: !milestone.done } : milestone)
      })
    }));
  }

  function addGoalMilestone(goalId, milestone) {
    update(current => ({
      ...current,
      goals: (current.goals || []).map(goal => goal.id === goalId ? { ...goal, milestones: [...goal.milestones, milestone] } : goal)
    }));
  }

  function deleteGoal(goalId) {
    const goal = (state.goals || []).find(item => item.id === goalId);
    if (!goal || !window.confirm(`Delete goal "${goal.title}"?`)) return;
    update(current => ({ ...current, goals: current.goals.filter(item => item.id !== goalId), activity: logActivity(current, `Deleted goal: ${goal.title}`, goal.projectId) }));
    notify("Goal deleted.");
  }

  function createTemplate(template) {
    update(current => ({ ...current, templates: [...(current.templates || []), template], activity: logActivity(current, `Created ${template.type} template: ${template.title}`) }));
    notify("Template saved.");
  }

  function deleteTemplate(templateId) {
    update(current => ({ ...current, templates: (current.templates || []).filter(item => item.id !== templateId) }));
    notify("Template deleted.");
  }

  function useTemplate(template) {
    create({
      type: template.type,
      title: template.title,
      details: template.details || "",
      priority: template.priority || "medium",
      estimatedMinutes: template.estimatedMinutes || 25,
      subtasks: [],
      tags: [],
      dependencyIds: [],
      relatedNoteIds: [],
      relatedTaskIds: [],
      status: "todo"
    });
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
    board: <BoardPage tasks={state.tasks} projects={state.projects} taskActions={taskActions} />,
    calendar: <CalendarPage tasks={state.tasks} navigate={navigate} onExportCalendar={exportCalendar} />,
    focus: <FocusPage tasks={state.tasks} timer={timer} onStart={startTimer} onPause={pauseTimer} onReset={resetTimer} onTaskChange={taskId => setTimer(current => ({ ...current, taskId }))} />,
    activity: <ActivityPage items={state.activity || []} />,
    projects: <ProjectsPage projects={state.projects} tasks={state.tasks} openCreate={openCreate} onDelete={deleteProject} onEdit={project => openEdit("project", project)} onOpen={id => { setSelectedProjectId(id); navigate("projectDetail"); }} />,
    projectDetail: <ProjectDetailPage project={state.projects.find(item => item.id === selectedProjectId)} tasks={state.tasks} notes={state.notes} activity={state.activity || []} openCreate={openCreate} onEdit={project => openEdit("project", project)} onBack={() => navigate("projects")} taskActions={taskActions} noteActions={{ onEdit: note => openEdit("note", note), onDelete: deleteNote }} />,
    assistant: <AssistantPage messages={state.messages} aiConfigured={aiConfigured} syncMode={syncSettings.mode} onSend={sendMessage} onClear={clearChat} navigate={navigate} focusMessageId={focusMessageId} />,
    notes: <NotesPage notes={state.notes} projects={state.projects} tasks={state.tasks} openCreate={openCreate} onDelete={deleteNote} onEdit={note => openEdit("note", note)} />,
    goals: <GoalsPage goals={state.goals || []} projects={state.projects} onCreate={createGoal} onToggleMilestone={toggleGoalMilestone} onAddMilestone={addGoalMilestone} onDelete={deleteGoal} />,
    templates: <TemplatesPage templates={state.templates || []} onCreate={createTemplate} onUse={useTemplate} onDelete={deleteTemplate} />,
    dayPlan: <PlanMyDay tasks={state.tasks} onSchedule={scheduleDayPlan} navigate={navigate} />,
    inbox: <QuickCaptureInbox tasks={state.tasks} onCapture={captureTask} onEdit={task => openEdit("task", task)} onComplete={id => taskActions.onStatus(id, "done")} onDelete={taskActions.onDelete} />,
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
          <div className="topbar-actions">{installPrompt && <button className="install-button" onClick={installApp}>Install app</button>}<div className={`save-indicator ${saveStatus.kind}`} role="status" aria-live="polite" title={connectionError || "Your workspace save status"}><span className="save-dot" /><span>{saveStatus.label}</span></div><button className="icon-button" onClick={() => setShowShortcuts(true)} aria-label="Keyboard shortcuts" title="Keyboard shortcuts (?)">?</button><button className="icon-button" onClick={() => navigate("settings")} aria-label="Settings" title="Settings">⚙</button><div className="avatar avatar-small" aria-label="My workspace">N</div></div>
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
  );
}
