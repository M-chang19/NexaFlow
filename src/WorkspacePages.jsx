// src/WorkspacePages.jsx
// Rebuilt from App.jsx's usage and styled with the class names in redesign.css.
import { Component, useEffect, useMemo, useRef, useState } from "react";

/* ------------------------------------------------------------------ */
/* Constants and helpers                                               */
/* ------------------------------------------------------------------ */

const STATUSES = [["todo", "To do"], ["in-progress", "In progress"], ["waiting", "Waiting"], ["done", "Done"]];
const PRIORITIES = [["low", "Low"], ["medium", "Medium"], ["high", "High"]];
const PRIORITY_RANK = { high: 0, medium: 1, low: 2 };
const RECURRENCES = [["", "Does not repeat"], ["daily", "Daily"], ["weekly", "Weekly"], ["monthly", "Monthly"]];
const OVERVIEW_PANELS = [
  { id: "hero", label: "Welcome banner" },
  { id: "tasks", label: "Next steps" },
  { id: "insights", label: "Progress and priorities" },
  { id: "activity", label: "Recent activity" },
  { id: "stats", label: "Workspace summary" },
  { id: "focus", label: "Focus suggestion" }
];
const OVERVIEW_GROUPS = { main: ["hero", "tasks", "insights", "activity"], side: ["stats", "focus"] };
const EMPTY_FILTERS = { query: "", status: "all", priority: "", projectId: "", tag: "" };
const PROJECT_TONES = ["lilac", "mint", "peach", "blue"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const pad = n => String(n).padStart(2, "0");

export function makeId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function todayKey(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function splitTags(value) {
  const list = Array.isArray(value) ? value : String(value || "").split(",");
  return [...new Set(list.map(tag => String(tag).trim()).filter(Boolean))];
}

function parseKey(key) {
  const [y, m, d] = String(key).split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}
function addDays(key, n) {
  const date = parseKey(key);
  date.setDate(date.getDate() + n);
  return todayKey(date);
}
function toLocalInput(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : `${todayKey(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
function fromLocalInput(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}
function formatDate(key) {
  return key ? parseKey(key).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "No date";
}
function formatLongDate(key) {
  return parseKey(key).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
}
function formatDateTime(iso) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
function formatTime(iso) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}
function byUrgency(a, b) {
  return (a.dueDate || "9999").localeCompare(b.dueDate || "9999") || (PRIORITY_RANK[a.priority] ?? 1) - (PRIORITY_RANK[b.priority] ?? 1);
}
function isOverdue(task) {
  return task.status !== "done" && Boolean(task.dueDate) && task.dueDate < todayKey();
}
function projectName(projects, id) {
  return projects.find(project => project.id === id)?.name || "";
}
function statusLabel(status) {
  return STATUSES.find(([value]) => value === status)?.[1] || "To do";
}
function priorityLabel(priority) {
  return PRIORITIES.find(([value]) => value === priority)?.[1] || "Medium";
}

export function nextRecurringTask(task) {
  if (!task?.recurrence) return null;
  const base = task.dueDate ? parseKey(task.dueDate) : new Date();
  const next = new Date(base);
  if (task.recurrence === "daily") next.setDate(next.getDate() + 1);
  else if (task.recurrence === "weekly") next.setDate(next.getDate() + 7);
  else if (task.recurrence === "monthly") next.setMonth(next.getMonth() + 1);
  else return null;
  const shift = next.getTime() - base.getTime();
  const shifted = value => (value ? new Date(new Date(value).getTime() + shift).toISOString() : "");
  return {
    ...task,
    id: makeId(),
    status: "todo",
    inbox: false,
    sampleData: undefined,
    createdAt: new Date().toISOString(),
    dueDate: todayKey(next),
    reminderAt: shifted(task.reminderAt),
    scheduledAt: shifted(task.scheduledAt),
    followUpDate: "",
    dependencyIds: [],
    subtasks: (task.subtasks || []).map(subtask => ({ ...subtask, id: makeId(), done: false }))
  };
}

function downloadFile(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ------------------------------------------------------------------ */
/* Shared building blocks                                              */
/* ------------------------------------------------------------------ */

export class WorkspaceErrorBoundary extends Component {
  state = { hasError: false, message: "" };

  static getDerivedStateFromError(error) {
    return { hasError: true, message: error?.message || "" };
  }

  componentDidCatch(error, info) {
    console.error("NexaFlow workspace error:", error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="error-boundary" role="alert">
        <div className="error-card card-surface">
          <p className="eyebrow">Something went wrong</p>
          <h2>NexaFlow hit an unexpected error</h2>
          <p>Your data is saved on this device. Reload the page to continue.</p>
          {this.state.message && <p><small>{this.state.message}</small></p>}
          <button className="button button-primary" onClick={() => window.location.reload()}>Reload NexaFlow</button>
        </div>
      </div>
    );
  }
}

export function ConnectionStatus({ online }) {
  return (
    <span className={`network-status ${online ? "online" : "offline"}`} role="status" title={online ? "Connected to the internet" : "No internet connection"}>
      <span className="network-dot" />{online ? "Online" : "Offline"}
    </span>
  );
}

function PageIntro({ eyebrow, title, description, children }) {
  return (
    <div className="page-intro">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {children && <div className="page-actions">{children}</div>}
    </div>
  );
}

function SectionHeading({ title, count, children }) {
  return (
    <div className="section-heading">
      <h2>{title}{count !== undefined && <span className="heading-count">{count}</span>}</h2>
      {children}
    </div>
  );
}

function Empty({ title, children }) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      {children && <p>{children}</p>}
    </div>
  );
}

function PriorityBadge({ priority }) {
  const level = PRIORITY_RANK[priority] === undefined ? "medium" : priority;
  return <span className={`priority-badge priority-${level}`}><i className="priority-dot" />{priorityLabel(level)}</span>;
}

function TaskRow({ task, projects, taskActions, selected, onSelect, extra }) {
  const done = task.status === "done";
  const subtasks = task.subtasks || [];
  const meta = [
    projectName(projects, task.projectId),
    task.dueDate && `${isOverdue(task) ? "Overdue" : "Due"} ${formatDate(task.dueDate)}`,
    task.estimatedMinutes ? `${task.estimatedMinutes} min` : "",
    task.recurrence && `Repeats ${task.recurrence}`
  ].filter(Boolean).join(" · ");
  return (
    <div className="task-row-wrap">
      <article className={`task-row ${done ? "task-done" : ""} ${isOverdue(task) ? "task-overdue" : ""}`}>
        {onSelect && <input type="checkbox" checked={Boolean(selected)} onChange={() => onSelect(task.id)} title="Select for bulk actions" aria-label={`Select ${task.title}`} />}
        <button type="button" className={`task-check ${done ? "checked" : ""}`} aria-pressed={done} aria-label={`Mark ${task.title} as ${done ? "not done" : "done"}`} onClick={() => taskActions.onToggle(task.id)}>{done ? "✓" : ""}</button>
        <div className="task-copy">
          <strong>{task.title}</strong>
          {meta && <small>{meta}</small>}
          {task.status === "waiting" && <small className="task-waiting-note">Waiting{task.followUpDate ? ` · follow up ${formatDate(task.followUpDate)}` : ""}</small>}
        </div>
        <div className="task-badges">
          <PriorityBadge priority={task.priority} />
          {(task.tags || []).map(tag => <span className="tag-chip" key={tag}>{tag}</span>)}
        </div>
        <select className={`task-status status-${task.status}`} value={task.status} onChange={event => taskActions.onStatus(task.id, event.target.value)} aria-label={`Status for ${task.title}`}>
          {STATUSES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <div className="task-row-actions">
          {extra}
          <button className="row-edit" onClick={() => taskActions.onEdit(task)}>Edit</button>
          <button className="row-duplicate" onClick={() => taskActions.onDuplicate(task)}>Duplicate</button>
          <button className="row-delete" onClick={() => taskActions.onDelete(task.id)}>Delete</button>
        </div>
      </article>
      {subtasks.length > 0 && (
        <ul className="task-subtasks">
          {subtasks.map(subtask => (
            <li key={subtask.id}>
              <label><input type="checkbox" checked={Boolean(subtask.done)} onChange={() => taskActions.onToggleSubtask(task.id, subtask.id)} /> {subtask.title}</label>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Modal({ label, onClose, children }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return undefined;
    if (!dialog.open) {
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
    }
    return () => { try { dialog.close(); } catch { /* already closed */ } };
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      aria-label={label}
      onCancel={event => { event.preventDefault(); onClose(); }}
      onClick={event => { if (event.target === ref.current) onClose(); }}
    >
      <div className="modal-content">
        <button type="button" className="modal-close" onClick={onClose} aria-label="Close">×</button>
        {children}
      </div>
    </dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Search                                                              */
/* ------------------------------------------------------------------ */

export function SearchResults({ query, state, onChoose }) {
  const q = (query || "").trim().toLowerCase();
  const results = useMemo(() => {
    if (!q) return [];
    const has = value => String(value || "").toLowerCase().includes(q);
    return [
      ...state.tasks.filter(t => has(t.title) || has(t.details) || (t.tags || []).some(has)).map(t => ({ type: "task", id: t.id, title: t.title, hint: statusLabel(t.status) })),
      ...state.projects.filter(p => has(p.name) || has(p.description)).map(p => ({ type: "project", id: p.id, title: p.name, hint: "Project" })),
      ...state.notes.filter(n => has(n.title) || has(n.body)).map(n => ({ type: "note", id: n.id, title: n.title, hint: "Note" })),
      ...(state.messages || []).filter(m => has(m.content)).map(m => ({ type: "message", id: m.id, title: m.content.slice(0, 80), hint: "Assistant chat" }))
    ].slice(0, 12);
  }, [q, state]);
  if (!q) return null;
  return (
    <div className="global-search-results" role="listbox" aria-label="Search results">
      {results.length === 0
        ? <p className="empty-state">No matches for “{query}”.</p>
        : results.map(item => (
          <button key={`${item.type}-${item.id}`} role="option" onClick={() => onChoose(item)}>
            <strong>{item.title}</strong>
            <small>{item.hint}</small>
          </button>
        ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Overview                                                            */
/* ------------------------------------------------------------------ */

export function Overview({ state, openCreate, navigate, taskActions, preferences }) {
  const today = todayKey();
  const open = state.tasks.filter(task => task.status !== "done");
  const overdue = open.filter(task => task.dueDate && task.dueDate < today);
  const dueToday = open.filter(task => task.dueDate === today);
  const nextSteps = [...open].sort(byUrgency).slice(0, 5);
  const doneCount = state.tasks.length - open.length;
  const percent = state.tasks.length ? Math.round((doneCount / state.tasks.length) * 100) : 0;
  const highPriority = open.filter(task => task.priority === "high").slice(0, 3);
  const suggestion = nextSteps[0];
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  const panels = {
    hero: (
      <section className="hero-card">
        <p className="hero-kicker"><span className="hero-kicker-dot" /> Today</p>
        <h2>{dueToday.length ? `${dueToday.length} ${dueToday.length === 1 ? "task is" : "tasks are"} due today` : "Nothing is due today"}{overdue.length ? `, ${overdue.length} overdue` : ""}.</h2>
        <p>{suggestion ? `Start with “${suggestion.title}”, then keep going from there.` : "Add a task to give the day a direction."}</p>
        <div className="page-actions">
          <button className="button button-light" onClick={() => navigate("dayPlan")}>Plan my day</button>
          <button className="button button-light" onClick={() => navigate("focus")}>Start focusing</button>
        </div>
        <span className="hero-art" aria-hidden="true">✦</span>
      </section>
    ),
    tasks: (
      <section className="section-block">
        <SectionHeading title="Next steps" count={open.length}>
          <button className="link-button" onClick={() => navigate("tasks")}>View all</button>
        </SectionHeading>
        {nextSteps.length === 0
          ? <div className="card-surface"><Empty title="No open tasks">Add a task to get started.</Empty></div>
          : <div className="task-list card-surface">{nextSteps.map(task => <TaskRow key={task.id} task={task} projects={state.projects} taskActions={taskActions} />)}</div>}
      </section>
    ),
    insights: (
      <section className="insights-card card-surface">
        <SectionHeading title="Progress and priorities" />
        <div className="progress-track" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label="Tasks completed"><div style={{ width: `${percent}%` }} /></div>
        <p>{doneCount} of {state.tasks.length} tasks done ({percent}%).</p>
        {highPriority.length > 0 && (
          <ul className="task-subtasks">
            {highPriority.map(task => <li key={task.id}><button className="link-button" onClick={() => taskActions.onEdit(task)}>{task.title}</button></li>)}
          </ul>
        )}
      </section>
    ),
    activity: (
      <section className="section-block">
        <SectionHeading title="Recent activity"><button className="link-button" onClick={() => navigate("activity")}>View all</button></SectionHeading>
        {(state.activity || []).length === 0
          ? <div className="card-surface"><Empty title="No activity yet">Changes you make will show up here.</Empty></div>
          : <ul className="activity-list card-surface">{state.activity.slice(0, 5).map(item => <li className="activity-item" key={item.id}><span>{item.label}</span><small>{formatDateTime(item.createdAt)}</small></li>)}</ul>}
      </section>
    ),
    stats: (
      <section className="stats-card card-surface">
        <SectionHeading title="Workspace summary" />
        {[["▤", "Open tasks", open.length], ["◷", "Overdue", overdue.length], ["▧", "Projects", state.projects.length], ["✦", "Notes", state.notes.length]].map(([icon, label, value]) => (
          <div className="stat-row" key={label}><span className="stat-icon" aria-hidden="true">{icon}</span><span>{label}</span><strong>{value}</strong></div>
        ))}
      </section>
    ),
    focus: (
      <section className="focus-card card-surface">
        <SectionHeading title="Focus suggestion" />
        {suggestion
          ? <><p>Give “{suggestion.title}” a full 25 minutes.</p><button className="link-button" onClick={() => navigate("focus")}>Open the focus timer</button></>
          : <p>Add a task, then pick one to focus on.</p>}
      </section>
    )
  };

  const visible = new Set(preferences.visible);
  const ordered = preferences.order.filter(id => visible.has(id));
  const renderGroup = ids => ordered.filter(id => ids.includes(id)).map(id => <div key={id}>{panels[id]}</div>);

  return (
    <>
      <div className="welcome-row">
        <div>
          <p className="eyebrow"><span className="eyebrow-line" /> Overview</p>
          <h1>{greeting}. <span className="headline-accent">Let’s make progress.</span></h1>
          <p className="welcome-copy">{open.length} open {open.length === 1 ? "task" : "tasks"} across {state.projects.length} {state.projects.length === 1 ? "project" : "projects"}.</p>
        </div>
        <div className="date-pill"><span className="date-icon" aria-hidden="true">▦</span><span><small>Today</small>{new Date().toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}</span></div>
      </div>
      <div className="overview-quick-actions">
        {[["task", "quick-task", "＋", "New task", "Capture the next step"], ["project", "quick-project", "▧", "New project", "Group related work"], ["note", "quick-note", "✎", "New note", "Write something down"]].map(([type, tone, icon, title, hint]) => (
          <button key={type} className="overview-create-action" onClick={() => openCreate(type)}>
            <span className={`quick-action-icon ${tone}`} aria-hidden="true">{icon}</span>
            <span className="quick-action-copy"><strong>{title}</strong><small>{hint}</small></span>
            <span className="quick-arrow" aria-hidden="true">→</span>
          </button>
        ))}
      </div>
      <div className="overview-grid">
        <div className="overview-main">{renderGroup(OVERVIEW_GROUPS.main)}</div>
        <div className="overview-side">{renderGroup(OVERVIEW_GROUPS.side)}</div>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Tasks                                                               */
/* ------------------------------------------------------------------ */

export function TasksPage({ tasks, projects, openCreate, taskActions, savedViews, onSaveView, onBulkUpdate, onBulkDelete }) {
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [sort, setSort] = useState("due");
  const [selected, setSelected] = useState(() => new Set());
  const allTags = useMemo(() => [...new Set(tasks.flatMap(task => task.tags || []))].sort(), [tasks]);

  const visible = useMemo(() => {
    const q = filters.query.trim().toLowerCase();
    const list = tasks.filter(task => {
      if (q && !`${task.title} ${task.details || ""} ${(task.tags || []).join(" ")}`.toLowerCase().includes(q)) return false;
      if (filters.status === "open" && task.status === "done") return false;
      if (!["all", "open"].includes(filters.status) && task.status !== filters.status) return false;
      if (filters.priority && task.priority !== filters.priority) return false;
      if (filters.projectId === "__unassigned__" && task.projectId) return false;
      if (filters.projectId && filters.projectId !== "__unassigned__" && task.projectId !== filters.projectId) return false;
      if (filters.tag && !(task.tags || []).includes(filters.tag)) return false;
      return true;
    });
    if (sort === "priority") return list.sort((a, b) => (PRIORITY_RANK[a.priority] ?? 1) - (PRIORITY_RANK[b.priority] ?? 1) || byUrgency(a, b));
    if (sort === "created") return list.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
    if (sort === "title") return list.sort((a, b) => a.title.localeCompare(b.title));
    return list.sort(byUrgency);
  }, [tasks, filters, sort]);

  const selectedIds = visible.filter(task => selected.has(task.id)).map(task => task.id);
  const setFilter = key => event => setFilters(current => ({ ...current, [key]: event.target.value }));
  const toggleSelect = id => setSelected(current => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next; });

  function bulk(changes) {
    if (!selectedIds.length) return;
    onBulkUpdate(selectedIds, changes);
    setSelected(new Set());
  }
  function saveCurrentView() {
    const name = window.prompt("Name this view");
    if (name && name.trim()) onSaveView([...savedViews, { id: makeId(), name: name.trim(), filters }]);
  }

  return (
    <>
      <PageIntro eyebrow="Tasks" title="My tasks" description={`${visible.length} of ${tasks.length} tasks shown.`}>
        <button className="button button-primary" onClick={() => openCreate("task")}>New task</button>
      </PageIntro>

      <div className="toolbar card-surface">
        <label className="search-field"><input type="search" value={filters.query} onChange={setFilter("query")} placeholder="Filter tasks…" aria-label="Filter tasks" /></label>
        {[["all", "All"], ["open", "Open"], ...STATUSES].map(([value, label]) => (
          <button key={value} className={`filter-tab ${filters.status === value ? "active" : ""}`} onClick={() => setFilters(current => ({ ...current, status: value }))}>{label}</button>
        ))}
        <label className="sort-field">
          <select value={sort} onChange={event => setSort(event.target.value)} aria-label="Sort by">
            <option value="due">Sort: due date</option>
            <option value="priority">Sort: priority</option>
            <option value="created">Sort: newest</option>
            <option value="title">Sort: title</option>
          </select>
        </label>
      </div>
      <div className="toolbar-extra">
        <label className="sort-field">
          <select value={filters.projectId} onChange={setFilter("projectId")} aria-label="Project">
            <option value="">All projects</option>
            <option value="__unassigned__">No project</option>
            {projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}
          </select>
        </label>
        <label className="sort-field">
          <select value={filters.priority} onChange={setFilter("priority")} aria-label="Priority">
            <option value="">Any priority</option>
            {PRIORITIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        {allTags.length > 0 && (
          <label className="sort-field">
            <select value={filters.tag} onChange={setFilter("tag")} aria-label="Tag">
              <option value="">Any tag</option>
              {allTags.map(tag => <option key={tag} value={tag}>{tag}</option>)}
            </select>
          </label>
        )}
        <button className="link-button" onClick={() => setFilters(EMPTY_FILTERS)}>Clear filters</button>
        <button className="link-button" onClick={saveCurrentView}>Save this view</button>
        {savedViews.map(view => (
          <span className="saved-view" key={view.id}>
            <button className="filter-tab" onClick={() => setFilters({ ...EMPTY_FILTERS, ...view.filters })}>{view.name}</button>
            <button className="link-button" aria-label={`Delete view ${view.name}`} onClick={() => onSaveView(savedViews.filter(item => item.id !== view.id))}>×</button>
          </span>
        ))}
      </div>

      {selectedIds.length > 0 && (
        <div className="bulk-toolbar card-surface" role="region" aria-label="Bulk actions">
          <strong>{selectedIds.length} selected</strong>
          <select value="" onChange={event => event.target.value && bulk({ status: event.target.value })} aria-label="Set status">
            <option value="">Set status…</option>
            {STATUSES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <select value="" onChange={event => event.target.value && bulk({ priority: event.target.value })} aria-label="Set priority">
            <option value="">Set priority…</option>
            {PRIORITIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <select value="" onChange={event => event.target.value && bulk({ projectId: event.target.value })} aria-label="Move to project">
            <option value="">Move to project…</option>
            <option value="__unassigned__">No project</option>
            {projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}
          </select>
          <button className="button button-secondary" onClick={() => { onBulkDelete(selectedIds); setSelected(new Set()); }}>Delete selected</button>
          <button className="link-button" onClick={() => setSelected(new Set())}>Clear selection</button>
        </div>
      )}

      {visible.length === 0
        ? <div className="card-surface"><Empty title={tasks.length ? "No tasks match these filters" : "No tasks yet"}>{tasks.length ? "Try clearing a filter." : "Create your first task to get started."}</Empty></div>
        : <div className="task-list card-surface">{visible.map(task => <TaskRow key={task.id} task={task} projects={projects} taskActions={taskActions} selected={selected.has(task.id)} onSelect={toggleSelect} />)}</div>}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Kanban board                                                        */
/* ------------------------------------------------------------------ */

export function BoardPage({ tasks, projects, taskActions, openCreate }) {
  const [overColumn, setOverColumn] = useState("");
  return (
    <>
      <PageIntro eyebrow="Board" title="Kanban board" description="Drag cards between columns, or use the arrows.">
        <button className="button button-primary" onClick={() => openCreate("task")}>New task</button>
      </PageIntro>
      <div className="kanban-board">
        {STATUSES.map(([status, label], columnIndex) => {
          const column = tasks.filter(task => task.status === status).sort(byUrgency);
          return (
            <section
              key={status}
              className={`kanban-column column-${status} ${overColumn === status ? "kanban-column-drop-target" : ""}`}
              aria-label={label}
              onDragOver={event => { event.preventDefault(); setOverColumn(status); }}
              onDragLeave={() => setOverColumn("")}
              onDrop={event => { event.preventDefault(); setOverColumn(""); const id = event.dataTransfer.getData("text/plain"); if (id) taskActions.onStatus(id, status); }}
            >
              <div className="kanban-column-heading">
                <div className="kanban-column-title-wrap">
                  <span className={`kanban-status-dot dot-${status}`} />
                  <h2>{label}</h2>
                  <span className="kanban-count-badge">{column.length}</span>
                </div>
                <button className="kanban-add-button" aria-label={`Add task to ${label}`} onClick={() => openCreate("task", "", { status })}>＋</button>
              </div>
              <div className="kanban-column-body">
                {column.length === 0 && (
                  <div className="kanban-empty-column"><span className="kanban-empty-icon" aria-hidden="true">▢</span><p>Nothing in {label.toLowerCase()}.</p></div>
                )}
                {column.map(task => {
                  const subtasks = task.subtasks || [];
                  const doneSubtasks = subtasks.filter(subtask => subtask.done).length;
                  const project = projectName(projects, task.projectId);
                  const level = PRIORITY_RANK[task.priority] === undefined ? "medium" : task.priority;
                  return (
                    <article key={task.id} className={`kanban-task priority-edge-${level}`} draggable onDragStart={event => event.dataTransfer.setData("text/plain", task.id)}>
                      <div className="kanban-task-top">
                        <PriorityBadge priority={task.priority} />
                        {task.dueDate && <small className={isOverdue(task) ? "task-waiting-note" : ""}>{formatDate(task.dueDate)}</small>}
                      </div>
                      <span className="kanban-task-title">{task.title}</span>
                      {project && <span className="kanban-task-project"><i className="task-project-dot" />{project}</span>}
                      {subtasks.length > 0 && (
                        <div className="kanban-subtask-progress">
                          <span className="subtask-fraction">{doneSubtasks}/{subtasks.length} subtasks</span>
                          <div className="kanban-subtask-bar"><div className="kanban-subtask-fill" style={{ width: `${(doneSubtasks / subtasks.length) * 100}%` }} /></div>
                        </div>
                      )}
                      {(task.tags || []).length > 0 && <div className="kanban-task-tags">{task.tags.map(tag => <span className="tag-chip" key={tag}>{tag}</span>)}</div>}
                      <div className="kanban-task-actions">
                        <button aria-label="Move left" disabled={columnIndex === 0} onClick={() => taskActions.onStatus(task.id, STATUSES[columnIndex - 1][0])}>←</button>
                        <button onClick={() => taskActions.onEdit(task)}>Edit</button>
                        <button aria-label="Move right" disabled={columnIndex === STATUSES.length - 1} onClick={() => taskActions.onStatus(task.id, STATUSES[columnIndex + 1][0])}>→</button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Calendar                                                            */
/* ------------------------------------------------------------------ */

export function CalendarPage({ tasks, projects, onExportCalendar, openCreate, taskActions, onQuickCreate }) {
  const [cursor, setCursor] = useState(() => { const now = new Date(); return new Date(now.getFullYear(), now.getMonth(), 1); });
  const [selected, setSelected] = useState(todayKey());
  const [filters, setFilters] = useState({ projectId: "", priority: "", status: "all" });
  const [quickTitle, setQuickTitle] = useState("");
  const [quickPriority, setQuickPriority] = useState("medium");
  const today = todayKey();

  const filtered = useMemo(() => tasks.filter(task => {
    if (filters.projectId && task.projectId !== filters.projectId) return false;
    if (filters.priority && task.priority !== filters.priority) return false;
    if (filters.status === "open" && task.status === "done") return false;
    if (filters.status === "done" && task.status !== "done") return false;
    return true;
  }), [tasks, filters]);

  const byDate = useMemo(() => {
    const map = new Map();
    filtered.forEach(task => { if (task.dueDate) map.set(task.dueDate, [...(map.get(task.dueDate) || []), task]); });
    return map;
  }, [filtered]);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const offset = cursor.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = Array.from({ length: Math.ceil((offset + daysInMonth) / 7) * 7 }, (_, index) => {
    const day = index - offset + 1;
    return day >= 1 && day <= daysInMonth ? todayKey(new Date(year, month, day)) : null;
  });

  const selectedTasks = (byDate.get(selected) || []).slice().sort(byUrgency);
  const selectedDone = selectedTasks.filter(task => task.status === "done").length;
  const selectedOverdue = selected < today ? selectedTasks.filter(task => task.status !== "done").length : 0;
  const hasFilters = Boolean(filters.projectId || filters.priority || filters.status !== "all");

  function selectDay(key) {
    setSelected(key);
    const date = parseKey(key);
    setCursor(new Date(date.getFullYear(), date.getMonth(), 1));
  }
  function submitQuick(event) {
    event.preventDefault();
    if (!quickTitle.trim()) return;
    onQuickCreate({ title: quickTitle, dueDate: selected, priority: quickPriority, projectId: filters.projectId });
    setQuickTitle("");
  }
  const onDropOn = key => event => {
    event.preventDefault();
    const id = event.dataTransfer.getData("text/plain");
    if (id) taskActions.onReschedule(id, key);
  };

  return (
    <>
      <PageIntro eyebrow="Calendar" title="Calendar" description="Drag a task onto a day to reschedule it.">
        <button className="button button-secondary" onClick={onExportCalendar}>Export .ics</button>
        <button className="button button-primary" onClick={() => openCreate("task", "", { dueDate: selected })}>New task</button>
      </PageIntro>

      <div className="calendar-filter-bar">
        <div className="calendar-filter-group">
          <label>Project
            <select value={filters.projectId} onChange={event => setFilters({ ...filters, projectId: event.target.value })}>
              <option value="">All</option>
              {projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}
            </select>
          </label>
          <label>Priority
            <select value={filters.priority} onChange={event => setFilters({ ...filters, priority: event.target.value })}>
              <option value="">Any</option>
              {PRIORITIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label>Show
            <select value={filters.status} onChange={event => setFilters({ ...filters, status: event.target.value })}>
              <option value="all">All tasks</option>
              <option value="open">Open</option>
              <option value="done">Done</option>
            </select>
          </label>
        </div>
        {hasFilters && <button className="button button-secondary calendar-clear-filters" onClick={() => setFilters({ projectId: "", priority: "", status: "all" })}>Clear filters</button>}
      </div>

      <section className="calendar-card">
        <div className="calendar-heading">
          <button className="icon-button" aria-label="Previous month" onClick={() => setCursor(new Date(year, month - 1, 1))}>‹</button>
          <h2>{cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</h2>
          <button className="icon-button" aria-label="Next month" onClick={() => setCursor(new Date(year, month + 1, 1))}>›</button>
          <button className="button calendar-today-button" onClick={() => selectDay(today)}>Today</button>
        </div>
        <div className="calendar-grid" role="grid">
          {WEEKDAYS.map(name => <div key={name} className="calendar-weekday" role="columnheader">{name}</div>)}
          {cells.map((key, index) => {
            if (key === null) {
              return <div key={`blank-${index}`} className="calendar-day calendar-blank"><div className="calendar-day-header"><button className="calendar-date-button" disabled aria-hidden="true" tabIndex={-1}>0</button></div></div>;
            }
            const items = byDate.get(key) || [];
            const open = items.filter(task => task.status !== "done");
            const hasOverdue = key < today && open.length > 0;
            const dots = [
              hasOverdue && "overdue",
              open.some(task => task.priority === "high") && "priority",
              open.some(task => task.scheduledAt) && "focus",
              items.length > 0 && open.length === 0 && "done"
            ].filter(Boolean);
            return (
              <div
                key={key}
                className={`calendar-day ${key === today ? "calendar-today" : ""} ${key === selected ? "calendar-day-selected" : ""} ${hasOverdue ? "calendar-day-has-overdue" : ""}`}
                onDragOver={event => event.preventDefault()}
                onDrop={onDropOn(key)}
              >
                <div className="calendar-day-header">
                  <button className="calendar-date-button" onClick={() => setSelected(key)} aria-label={`${formatDate(key)}, ${items.length} tasks`} aria-pressed={key === selected}>{Number(key.slice(8))}</button>
                  <span className="calendar-day-dots">{dots.map(dot => <i key={dot} className={`calendar-dot dot-${dot}`} />)}</span>
                </div>
                {items.slice(0, 3).map(task => (
                  <button
                    key={task.id}
                    className={`calendar-task ${task.scheduledAt ? "calendar-time-block" : ""} ${task.status === "done" ? "calendar-task-done" : ""}`}
                    draggable
                    onDragStart={event => event.dataTransfer.setData("text/plain", task.id)}
                    onClick={() => taskActions.onEdit(task)}
                    title={task.title}
                  >{task.scheduledAt ? `${formatTime(task.scheduledAt)} ` : ""}{task.title}</button>
                ))}
                {items.length > 3 && <span className="calendar-more-count">+{items.length - 3} more</span>}
              </div>
            );
          })}
        </div>
      </section>

      <section className="calendar-selected-day">
        <div className="calendar-day-heading">
          <div>
            <p className="eyebrow">{selected === today ? "Today" : "Selected day"}</p>
            <div className="calendar-day-title-row">
              <h2>{formatLongDate(selected)}</h2>
              <div className="calendar-day-nav-buttons">
                <button className="button button-small button-secondary" onClick={() => selectDay(addDays(selected, -1))}>Previous day</button>
                <button className="button button-small button-secondary" onClick={() => selectDay(addDays(selected, 1))}>Next day</button>
              </div>
            </div>
          </div>
        </div>

        <div className="calendar-day-metrics">
          <div className="calendar-metric"><span className="metric-label">Tasks</span><span className="metric-val">{selectedTasks.length}</span></div>
          <div className="calendar-metric">
            <span className="metric-label">Done</span>
            <div className="metric-progress-wrap">
              <div className="progress-bar-container"><div className="progress-bar-fill" style={{ width: `${selectedTasks.length ? (selectedDone / selectedTasks.length) * 100 : 0}%` }} /></div>
              <span className="metric-val">{selectedDone}/{selectedTasks.length}</span>
            </div>
          </div>
          {selectedOverdue > 0 && <div className="calendar-metric calendar-metric-overdue"><span className="metric-label">Overdue</span><span className="metric-val">{selectedOverdue}</span></div>}
        </div>

        <form className="calendar-quick-add" onSubmit={submitQuick}>
          <input value={quickTitle} onChange={event => setQuickTitle(event.target.value)} placeholder={`Add a task for ${formatDate(selected)}…`} aria-label="Quick add a task" />
          <select value={quickPriority} onChange={event => setQuickPriority(event.target.value)} aria-label="Priority">
            {PRIORITIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <button className="button button-primary" type="submit">Add task</button>
        </form>

        {selectedTasks.length === 0
          ? <div className="calendar-day-empty"><Empty title="Nothing scheduled">Add a task above, or drag one onto this day.</Empty></div>
          : (
            <div className="calendar-selected-tasks">
              {selectedTasks.map(task => (
                <TaskRow
                  key={task.id}
                  task={task}
                  projects={projects}
                  taskActions={taskActions}
                  extra={task.status !== "done" && <button className="row-reschedule" onClick={() => taskActions.onReschedule(task.id, addDays(task.dueDate || selected, 1))} title="Move to the next day">+1d</button>}
                />
              ))}
            </div>
          )}
      </section>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Focus timer                                                         */
/* ------------------------------------------------------------------ */

export function FocusPage({ tasks, timer, onStart, onPause, onReset, onTaskChange, onCompleteTask }) {
  const open = tasks.filter(task => task.status !== "done");
  const total = Math.max(1, timer.duration * 60);
  const remaining = Math.max(0, timer.remaining);
  const percent = Math.round(((total - remaining) / total) * 100);
  const clock = `${pad(Math.floor(remaining / 60))}:${pad(remaining % 60)}`;
  const task = tasks.find(item => item.id === timer.taskId);
  const state = timer.running ? "FOCUSING" : remaining === 0 ? "COMPLETE" : remaining < total ? "PAUSED" : "READY";
  return (
    <>
      <PageIntro eyebrow="Focus" title="Focus timer" description="One task, one block of time." />
      <section className="focus-timer-card">
        <div className={`timer-ring ${timer.running ? "timer-running" : ""}`} style={{ "--timer-progress": `${percent}%` }} role="timer" aria-label={`${clock} remaining`}>
          <div className="timer-ring-inner">
            <span className="timer-digits">{clock}</span>
            <span className="timer-status-text">{state}</span>
          </div>
        </div>
        <h2 className="focus-heading">{task ? task.title : "Pick a task, or just start"}</h2>
        {task && (
          <div className="focus-task-details-ribbon">
            {task.dueDate && <span className="focus-due-badge">Due {formatDate(task.dueDate)}</span>}
            <PriorityBadge priority={task.priority} />
            {task.status !== "done" && <button className="button button-secondary focus-complete-btn" onClick={() => onCompleteTask(task.id)}>Mark done</button>}
          </div>
        )}
        <label className="focus-task-select">
          <select value={timer.taskId || ""} onChange={event => onTaskChange(event.target.value)} aria-label="Task to focus on">
            <option value="">No specific task</option>
            {open.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
            {task && task.status === "done" && <option value={task.id}>{task.title} (done)</option>}
          </select>
        </label>
        <div className="focus-duration" role="group" aria-label="Session length">
          {[15, 25, 45].map(minutes => (
            <button key={minutes} className={timer.duration === minutes ? "active" : ""} aria-pressed={timer.duration === minutes} onClick={() => onReset(minutes)}>{minutes} min</button>
          ))}
          <button className={`break-button ${timer.duration === 5 ? "active" : ""}`} aria-pressed={timer.duration === 5} onClick={() => onReset(5)}>5 min break</button>
        </div>
        <div className="focus-controls">
          {timer.running
            ? <button className="button button-secondary" onClick={onPause}>Pause</button>
            : <button className="button button-primary focus-main-btn" onClick={onStart} disabled={remaining === 0}>{remaining < total ? "Resume" : "Start focus"}</button>}
          <button className="button button-secondary" onClick={() => onReset()}>Reset</button>
        </div>
      </section>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Activity                                                            */
/* ------------------------------------------------------------------ */

export function ActivityPage({ items }) {
  return (
    <>
      <PageIntro eyebrow="Activity" title="Activity history" description="The latest 100 changes in this workspace." />
      {items.length === 0
        ? <div className="card-surface"><Empty title="No activity yet">Create or complete something and it will appear here.</Empty></div>
        : <ul className="activity-list card-surface">{items.map(item => <li className="activity-item" key={item.id}><span>{item.label}</span><small>{formatDateTime(item.createdAt)}</small></li>)}</ul>}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Projects                                                            */
/* ------------------------------------------------------------------ */

export function ProjectsPage({ projects, tasks, openCreate, onDelete, onEdit, onOpen }) {
  return (
    <>
      <PageIntro eyebrow="Projects" title="Projects" description={`${projects.length} ${projects.length === 1 ? "project" : "projects"} in this workspace.`}>
        <button className="button button-primary" onClick={() => openCreate("project")}>New project</button>
      </PageIntro>
      {projects.length === 0
        ? <div className="card-surface"><Empty title="No projects yet">Projects group related tasks, notes and goals.</Empty></div>
        : (
          <div className="project-grid">
            {projects.map((project, index) => {
              const own = tasks.filter(task => task.projectId === project.id);
              const done = own.filter(task => task.status === "done").length;
              const late = own.filter(isOverdue).length;
              const percent = own.length ? Math.round((done / own.length) * 100) : 0;
              return (
                <article key={project.id} className={`project-card project-${PROJECT_TONES[index % PROJECT_TONES.length]}`}>
                  <span className="project-symbol" aria-hidden="true">▧</span>
                  <h2><button className="link-button" onClick={() => onOpen(project.id)}>{project.name}</button></h2>
                  {project.folder && <small>{project.folder}</small>}
                  {project.description && <p>{project.description}</p>}
                  <div className="progress-track" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label={`${project.name} progress`}><div style={{ width: `${percent}%` }} /></div>
                  <span className={`project-health ${late ? "project-health-risk" : ""}`}>{late ? `${late} overdue` : "On track"}<small>{done} of {own.length} tasks done</small></span>
                  {(project.tags || []).length > 0 && <div className="task-badges">{project.tags.map(tag => <span className="tag-chip" key={tag}>{tag}</span>)}</div>}
                  <div className="task-row-actions">
                    <button className="row-edit" onClick={() => onOpen(project.id)}>Open</button>
                    <button className="row-edit" onClick={() => onEdit(project)}>Edit</button>
                    <button className="row-delete" onClick={() => onDelete(project.id)}>Delete</button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
    </>
  );
}

export function ProjectDetailPage({ project, tasks, notes, activity, openCreate, onEdit, onBack, taskActions, noteActions }) {
  if (!project) {
    return <div className="card-surface"><Empty title="Project not found">It may have been deleted. <button className="link-button" onClick={onBack}>Back to projects</button></Empty></div>;
  }
  const ownTasks = tasks.filter(task => task.projectId === project.id).sort(byUrgency);
  const ownNotes = notes.filter(note => note.projectId === project.id);
  const ownActivity = activity.filter(item => item.projectId === project.id).slice(0, 8);
  return (
    <>
      <PageIntro eyebrow={project.folder || "Project"} title={project.name} description={project.description || "No description yet."}>
        <button className="button button-secondary" onClick={onBack}>All projects</button>
        <button className="button button-secondary" onClick={() => onEdit(project)}>Edit project</button>
      </PageIntro>
      <section className="section-block">
        <SectionHeading title="Tasks" count={ownTasks.length}>
          <button className="button button-primary" onClick={() => openCreate("task", project.id)}>Add task</button>
        </SectionHeading>
        {ownTasks.length === 0
          ? <div className="card-surface"><Empty title="No tasks in this project" /></div>
          : <div className="task-list card-surface">{ownTasks.map(task => <TaskRow key={task.id} task={task} projects={[project]} taskActions={taskActions} />)}</div>}
      </section>
      <section className="section-block">
        <SectionHeading title="Notes" count={ownNotes.length}>
          <button className="button button-secondary" onClick={() => openCreate("note", project.id)}>Add note</button>
        </SectionHeading>
        {ownNotes.length === 0
          ? <div className="card-surface"><Empty title="No notes in this project" /></div>
          : (
            <div className="note-grid">
              {ownNotes.map(note => (
                <article key={note.id} className="note-card">
                  <span className="note-symbol" aria-hidden="true">✎</span>
                  <h2>{note.title}</h2>
                  <p>{note.body}</p>
                  <div className="task-row-actions">
                    <button className="row-edit" onClick={() => noteActions.onEdit(note)}>Edit</button>
                    <button className="row-delete" onClick={() => noteActions.onDelete(note.id)}>Delete</button>
                  </div>
                </article>
              ))}
            </div>
          )}
      </section>
      {ownActivity.length > 0 && (
        <section className="section-block">
          <SectionHeading title="Recent activity" />
          <ul className="activity-list card-surface">{ownActivity.map(item => <li className="activity-item" key={item.id}><span>{item.label}</span><small>{formatDateTime(item.createdAt)}</small></li>)}</ul>
        </section>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Assistant                                                           */
/* ------------------------------------------------------------------ */

const SUGGESTED_PROMPTS = [
  ["plan", "Plan my day around what is due and high priority."],
  ["chat", "What should I work on first?"],
  ["summarize", "Summarize what I got done this week."]
];

export function AssistantPage({ messages, aiConfigured, syncMode, onSend, onClear, navigate, focusMessageId }) {
  const [draft, setDraft] = useState("");
  const [mode, setMode] = useState("chat");
  const [sending, setSending] = useState(false);
  const endRef = useRef(null);

  useEffect(() => {
    if (focusMessageId) document.getElementById(`message-${focusMessageId}`)?.scrollIntoView({ block: "center" });
    else endRef.current?.scrollIntoView?.({ block: "end" });
  }, [messages.length, focusMessageId]);

  async function send(prompt, sendMode) {
    const text = prompt.trim();
    if (!text || sending) return;
    setSending(true);
    setDraft("");
    try { await onSend(text, sendMode); } finally { setSending(false); }
  }

  return (
    <>
      <PageIntro eyebrow="Assistant" title="AI assistant" description="Ask for a plan, a summary, or a next step.">
        <button className="button button-secondary" onClick={onClear} disabled={!messages.length}>Clear chat</button>
      </PageIntro>
      <div className="assistant-layout">
        <section className="chat-card">
          <div className="chat-topline">
            <span className="assistant-avatar" aria-hidden="true">✦</span>
            <strong>NexaFlow assistant</strong>
            <span className="assistant-badge">{aiConfigured ? "Connected" : "Not connected"}</span>
          </div>
          {!aiConfigured && (
            <p className="empty-state">
              {syncMode === "local"
                ? <>No AI provider is connected yet. <button className="link-button" onClick={() => navigate("settings")}>Open Settings</button> to see how to add an API key.</>
                : <>The assistant runs through the local server, which isn’t used in {syncMode} mode.</>}
            </p>
          )}
          <div className="chat-messages" aria-live="polite">
            {messages.length === 0 && <Empty title="Start a conversation">Try one of the suggestions, or type your own message.</Empty>}
            {messages.map(message => (
              <div key={message.id} id={`message-${message.id}`} className={`message message-${message.role}`}>
                <div className="message-bubble">{message.content}</div>
              </div>
            ))}
            {sending && <div className="message message-assistant"><div className="message-bubble">Thinking…</div></div>}
            <div ref={endRef} />
          </div>
          <form className="chat-form" onSubmit={event => { event.preventDefault(); send(draft, mode); }}>
            <select value={mode} onChange={event => setMode(event.target.value)} aria-label="Assistant mode">
              <option value="chat">Ask</option>
              <option value="plan">Plan</option>
              <option value="summarize">Summarize</option>
            </select>
            <textarea value={draft} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) send(draft, mode); }} rows={2} placeholder="Message the assistant…" aria-label="Message" />
            <button className="button button-primary" type="submit" disabled={sending || !draft.trim()}>Send</button>
          </form>
        </section>
        <aside className="assistant-side-card">
          <h2>Try asking</h2>
          {SUGGESTED_PROMPTS.map(([promptMode, text]) => (
            <button key={text} className="button button-secondary" disabled={sending} onClick={() => send(text, promptMode)}>{text}</button>
          ))}
        </aside>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Notes                                                               */
/* ------------------------------------------------------------------ */

export function NotesPage({ notes, projects, tasks, openCreate, onDelete, onEdit }) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const visible = notes
    .filter(note => !q || `${note.title} ${note.body || ""}`.toLowerCase().includes(q))
    .sort((a, b) => String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || "")));
  return (
    <>
      <PageIntro eyebrow="Notes" title="Notes" description={`${notes.length} ${notes.length === 1 ? "note" : "notes"} saved.`}>
        <button className="button button-primary" onClick={() => openCreate("note")}>New note</button>
      </PageIntro>
      <div className="toolbar card-surface">
        <label className="search-field"><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search notes…" aria-label="Search notes" /></label>
      </div>
      {visible.length === 0
        ? <div className="card-surface"><Empty title={notes.length ? "No notes match your search" : "No notes yet"}>{notes.length ? "" : "Capture a thought and link it to a project or task."}</Empty></div>
        : (
          <div className="note-grid">
            {visible.map(note => {
              const linked = (note.relatedTaskIds || []).map(id => tasks.find(task => task.id === id)).filter(Boolean);
              return (
                <article key={note.id} className="note-card">
                  <span className="note-symbol" aria-hidden="true">✎</span>
                  <h2>{note.title}</h2>
                  {projectName(projects, note.projectId) && <small>{projectName(projects, note.projectId)}</small>}
                  <p>{(note.body || "").length > 220 ? `${note.body.slice(0, 220)}…` : note.body}</p>
                  {linked.length > 0 && <div className="task-badges">{linked.map(task => <span className="tag-chip" key={task.id}>{task.title}</span>)}</div>}
                  <small>Updated {formatDateTime(note.updatedAt || note.createdAt)}</small>
                  <div className="task-row-actions">
                    <button className="row-edit" onClick={() => onEdit(note)}>Edit</button>
                    <button className="row-delete" onClick={() => onDelete(note.id)}>Delete</button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

export function SettingsPage({
  aiConfigured, aiModel, dataFile, state, darkMode, onToggleTheme, onImport, onEnableNotifications, onRemoveSamples,
  overviewPreferences, onUpdateOverview, syncSettings, syncSession, syncStatus, onUseLocal, onConnectSupabase, onConnectSelfHosted, onSignOutSupabase
}) {
  const [message, setMessage] = useState("");
  const [importMode, setImportMode] = useState("merge");
  // NOTE: these field names must match what sync.js reads from the settings object.
  const [supabase, setSupabase] = useState({ supabaseUrl: syncSettings.supabaseUrl || "", supabaseAnonKey: syncSettings.supabaseAnonKey || "" });
  const [selfHosted, setSelfHosted] = useState({ serverUrl: syncSettings.serverUrl || "", serverToken: syncSettings.serverToken || "" });
  const [account, setAccount] = useState({ email: "", password: "", accountAction: "sign-in", workspaceAction: "load" });
  const [busy, setBusy] = useState(false);
  const hasSamples = [...state.projects, ...state.tasks, ...state.notes].some(item => item.sampleData);

  async function run(action) {
    setBusy(true);
    setMessage("");
    try { setMessage((await action()) || ""); } catch (error) { setMessage(error.message); } finally { setBusy(false); }
  }
  async function handleImport(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    await run(async () => {
      let parsed;
      try { parsed = JSON.parse(await file.text()); } catch { throw new Error("That file is not valid JSON."); }
      await onImport(parsed, importMode);
      return "";
    });
  }
  async function handleNotifications() {
    const result = await onEnableNotifications();
    setMessage(result === "granted" ? "Browser reminders are on." : result === "unavailable" ? "Browser notifications need a secure (https or localhost) page and a supported browser." : "Browser reminders were not allowed. You can change this in your browser's site settings.");
  }
  function moveSection(id, direction) {
    const order = [...overviewPreferences.order];
    const from = order.indexOf(id);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= order.length) return;
    [order[from], order[to]] = [order[to], order[from]];
    onUpdateOverview({ ...overviewPreferences, order });
  }
  function toggleSection(id) {
    const visible = overviewPreferences.visible.includes(id) ? overviewPreferences.visible.filter(item => item !== id) : [...overviewPreferences.visible, id];
    onUpdateOverview({ ...overviewPreferences, visible });
  }

  return (
    <>
      <PageIntro eyebrow="Settings" title="Settings" description="Appearance, data, sync and reminders." />
      {message && <p className="connection-banner" role="status">{message}</p>}
      <div className="settings-grid">
        <section className="settings-card">
          <span className="settings-icon" aria-hidden="true">◐</span>
          <h2>Appearance</h2>
          <label className="checkbox-field"><input type="checkbox" checked={darkMode} onChange={onToggleTheme} /> Dark mode</label>
        </section>

        <section className="settings-card">
          <span className="settings-icon settings-icon-mint" aria-hidden="true">◷</span>
          <h2>Reminders</h2>
          <p>Get a browser notification when a task reminder is due.</p>
          <button className="button button-secondary" onClick={handleNotifications}>Enable browser reminders</button>
        </section>

        <section className="settings-card">
          <span className="settings-icon" aria-hidden="true">✦</span>
          <h2>AI assistant</h2>
          <p>{aiConfigured ? `Connected. Model: ${aiModel}.` : "No API key found. Add one to your local server's environment and restart it."}</p>
        </section>

        <section className="settings-card">
          <span className="settings-icon settings-icon-mint" aria-hidden="true">⇅</span>
          <h2>Backup</h2>
          {dataFile && <p className="data-location">{dataFile}</p>}
          <div className="page-actions">
            <button className="button button-secondary" onClick={() => downloadFile(`nexaflow-backup-${todayKey()}.json`, JSON.stringify(state, null, 2), "application/json")}>Export backup</button>
            <select value={importMode} onChange={event => setImportMode(event.target.value)} aria-label="Import mode">
              <option value="merge">Import and merge</option>
              <option value="replace">Import and replace everything</option>
            </select>
            <label className="button button-secondary">Choose backup file<input type="file" accept="application/json,.json" onChange={handleImport} hidden /></label>
          </div>
          {hasSamples && <button className="button button-secondary" onClick={onRemoveSamples}>Remove sample items</button>}
        </section>

        <section className="settings-card">
          <span className="settings-icon" aria-hidden="true">▦</span>
          <h2>Overview layout</h2>
          {overviewPreferences.order.map((id, index) => {
            const panel = OVERVIEW_PANELS.find(item => item.id === id);
            if (!panel) return null;
            return (
              <div key={id} className="stat-row">
                <label className="checkbox-field"><input type="checkbox" checked={overviewPreferences.visible.includes(id)} onChange={() => toggleSection(id)} /> {panel.label}</label>
                <span className="task-row-actions">
                  <button className="icon-button" aria-label={`Move ${panel.label} up`} disabled={index === 0} onClick={() => moveSection(id, -1)}>↑</button>
                  <button className="icon-button" aria-label={`Move ${panel.label} down`} disabled={index === overviewPreferences.order.length - 1} onClick={() => moveSection(id, 1)}>↓</button>
                </span>
              </div>
            );
          })}
        </section>

        <section className="settings-card">
          <span className="settings-icon settings-icon-mint" aria-hidden="true">☁</span>
          <h2>Sync</h2>
          <p className="connection-status">Mode: {syncSettings.mode}. {syncStatus}</p>
          {syncSettings.mode !== "local" && <button className="button button-secondary" onClick={onUseLocal}>Use this device only</button>}

          <h3>Supabase</h3>
          <div className="create-form">
            <label>Project URL<input value={supabase.supabaseUrl} onChange={event => setSupabase({ ...supabase, supabaseUrl: event.target.value })} placeholder="https://xxxx.supabase.co" /></label>
            <label>Anon key<input value={supabase.supabaseAnonKey} onChange={event => setSupabase({ ...supabase, supabaseAnonKey: event.target.value })} /></label>
            <label>Email<input type="email" autoComplete="email" value={account.email} onChange={event => setAccount({ ...account, email: event.target.value })} /></label>
            <label>Password<input type="password" autoComplete="current-password" value={account.password} onChange={event => setAccount({ ...account, password: event.target.value })} /></label>
            <label>Account
              <select value={account.accountAction} onChange={event => setAccount({ ...account, accountAction: event.target.value })}>
                <option value="sign-in">Sign in</option>
                <option value="sign-up">Create account</option>
              </select>
            </label>
            <label>Workspace
              <select value={account.workspaceAction} onChange={event => setAccount({ ...account, workspaceAction: event.target.value })}>
                <option value="load">Load the cloud copy</option>
                <option value="upload">Upload this device's copy</option>
              </select>
            </label>
          </div>
          <div className="page-actions">
            <button className="button button-primary" disabled={busy} onClick={() => run(() => onConnectSupabase({ settings: supabase, ...account }))}>Connect Supabase</button>
            {syncSession && <button className="button button-secondary" disabled={busy} onClick={() => run(async () => { await onSignOutSupabase(); return "Signed out."; })}>Sign out</button>}
          </div>

          <h3>Self-hosted server</h3>
          <div className="create-form">
            <label>Server URL<input value={selfHosted.serverUrl} onChange={event => setSelfHosted({ ...selfHosted, serverUrl: event.target.value })} placeholder="https://example.com/nexaflow" /></label>
            <label>Access token<input type="password" value={selfHosted.serverToken} onChange={event => setSelfHosted({ ...selfHosted, serverToken: event.target.value })} /></label>
          </div>
          <div className="page-actions">
            <button className="button button-secondary" disabled={busy} onClick={() => run(() => onConnectSelfHosted({ settings: selfHosted, workspaceAction: "load" }))}>Connect and load</button>
            <button className="button button-secondary" disabled={busy} onClick={() => run(() => onConnectSelfHosted({ settings: selfHosted, workspaceAction: "upload" }))}>Connect and upload this device</button>
          </div>
        </section>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Dialogs                                                             */
/* ------------------------------------------------------------------ */

function CreateForm({ item, projects, tasks, notes, onClose, onCreate }) {
  const { type, record } = item;
  const initial = item.initialValues || {};
  const isEdit = Boolean(record);
  const [error, setError] = useState("");
  const [form, setForm] = useState(() => ({
    title: (record ? (record.title ?? record.name) : initial.title) || "",
    details: (record ? (type === "project" ? record.description : type === "note" ? record.body : record.details) : initial.details) || "",
    projectId: record?.projectId ?? item.projectId ?? initial.projectId ?? "",
    folder: record?.folder ?? initial.folder ?? "",
    tags: (record?.tags ?? initial.tags ?? []).join(", "),
    status: record?.status ?? initial.status ?? "todo",
    priority: record?.priority ?? initial.priority ?? "medium",
    dueDate: record?.dueDate ?? initial.dueDate ?? "",
    followUpDate: record?.followUpDate ?? initial.followUpDate ?? "",
    reminderAt: toLocalInput(record?.reminderAt ?? initial.reminderAt),
    scheduledAt: toLocalInput(record?.scheduledAt ?? initial.scheduledAt),
    estimatedMinutes: record?.estimatedMinutes ?? initial.estimatedMinutes ?? 25,
    recurrence: record?.recurrence ?? initial.recurrence ?? "",
    inbox: Boolean(record?.inbox ?? initial.inbox),
    subtasks: (record?.subtasks || []).map(subtask => subtask.title).join("\n"),
    dependencyIds: record?.dependencyIds || [],
    relatedNoteIds: record?.relatedNoteIds || [],
    relatedTaskIds: record?.relatedTaskIds || []
  }));

  const set = key => event => {
    const value = event.target.type === "checkbox" ? event.target.checked : event.target.value;
    setForm(current => ({ ...current, [key]: value }));
  };
  const setMulti = key => event => {
    const values = Array.from(event.target.selectedOptions, option => option.value);
    setForm(current => ({ ...current, [key]: values }));
  };

  function submit(event) {
    event.preventDefault();
    if (!form.title.trim()) {
      setError("Add a title to save.");
      return;
    }
    const result = {
      type,
      id: record?.id,
      title: form.title.trim(),
      details: form.details.trim(),
      projectId: form.projectId,
      folder: form.folder.trim(),
      tags: splitTags(form.tags),
      status: "todo",
      priority: "medium",
      dueDate: "",
      followUpDate: "",
      reminderAt: "",
      scheduledAt: "",
      estimatedMinutes: 0,
      recurrence: "",
      inbox: false,
      subtasks: [],
      dependencyIds: [],
      relatedNoteIds: [],
      relatedTaskIds: []
    };
    if (type === "task") {
      Object.assign(result, {
        status: form.status,
        priority: form.priority,
        dueDate: form.dueDate,
        followUpDate: form.followUpDate,
        reminderAt: fromLocalInput(form.reminderAt),
        scheduledAt: fromLocalInput(form.scheduledAt),
        estimatedMinutes: Math.max(0, Math.min(1440, Number(form.estimatedMinutes) || 0)),
        recurrence: form.recurrence,
        inbox: form.inbox,
        subtasks: form.subtasks.split("\n").map(line => line.trim()).filter(Boolean),
        dependencyIds: form.dependencyIds,
        relatedNoteIds: form.relatedNoteIds
      });
    } else if (type === "note") {
      result.relatedTaskIds = form.relatedTaskIds;
    }
    onCreate(result);
  }

  return (
    <Modal label={`${isEdit ? "Edit" : "New"} ${type}`} onClose={onClose}>
      <form onSubmit={submit} className="create-form">
        <h2>{isEdit ? "Edit" : "New"} {type}</h2>
        {error && <p className="task-waiting-note" role="alert">{error}</p>}
        <label>{type === "project" ? "Project name" : "Title"}<input autoFocus value={form.title} onChange={set("title")} /></label>
        <label>{type === "note" ? "Note" : "Description"}<textarea rows={type === "note" ? 6 : 3} value={form.details} onChange={set("details")} /></label>

        {type !== "project" && (
          <label>Project
            <select value={form.projectId} onChange={set("projectId")}>
              <option value="">No project</option>
              {projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}
            </select>
          </label>
        )}
        {type === "project" && <label>Folder<input value={form.folder} onChange={set("folder")} placeholder="Personal" /></label>}
        {type !== "note" && <label>Tags (comma separated)<input value={form.tags} onChange={set("tags")} /></label>}

        {type === "task" && (
          <>
            <div className="form-grid">
              <label>Status<select value={form.status} onChange={set("status")}>{STATUSES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label>Priority<select value={form.priority} onChange={set("priority")}>{PRIORITIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label>Due date<input type="date" value={form.dueDate} onChange={set("dueDate")} /></label>
              <label>Follow up on<input type="date" value={form.followUpDate} onChange={set("followUpDate")} /></label>
              <label>Reminder<input type="datetime-local" value={form.reminderAt} onChange={set("reminderAt")} /></label>
              <label>Scheduled for<input type="datetime-local" value={form.scheduledAt} onChange={set("scheduledAt")} /></label>
              <label>Estimate (minutes)<input type="number" min="0" max="1440" value={form.estimatedMinutes} onChange={set("estimatedMinutes")} /></label>
              <label>Repeat<select value={form.recurrence} onChange={set("recurrence")}>{RECURRENCES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            </div>
            <label className="checkbox-field"><input type="checkbox" checked={form.inbox} onChange={set("inbox")} /> Keep in quick-capture inbox</label>
            <label>Subtasks (one per line)<textarea rows={3} value={form.subtasks} onChange={set("subtasks")} /></label>
            <label>Blocked by (Ctrl/Cmd-click to select several)
              <select multiple value={form.dependencyIds} onChange={setMulti("dependencyIds")}>
                {tasks.filter(task => task.id !== record?.id).map(task => <option key={task.id} value={task.id}>{task.title}</option>)}
              </select>
            </label>
            <label>Related notes
              <select multiple value={form.relatedNoteIds} onChange={setMulti("relatedNoteIds")}>
                {notes.map(note => <option key={note.id} value={note.id}>{note.title}</option>)}
              </select>
            </label>
          </>
        )}

        {type === "note" && (
          <label>Related tasks
            <select multiple value={form.relatedTaskIds} onChange={setMulti("relatedTaskIds")}>
              {tasks.map(task => <option key={task.id} value={task.id}>{task.title}</option>)}
            </select>
          </label>
        )}

        <div className="modal-actions">
          <button type="button" className="button button-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="button button-primary">{isEdit ? "Save changes" : `Create ${type}`}</button>
        </div>
      </form>
    </Modal>
  );
}

export function CreateDialog({ item, projects, tasks, notes, onClose, onCreate }) {
  if (!item) return null;
  return <CreateForm item={item} projects={projects} tasks={tasks} notes={notes} onClose={onClose} onCreate={onCreate} />;
}

export function FirstRunDialog({ onStartSample, onStartBlank }) {
  return (
    <Modal label="Welcome to NexaFlow" onClose={onStartBlank}>
      <div className="create-form">
        <p className="eyebrow">Welcome</p>
        <h2>Welcome to NexaFlow</h2>
        <p>A calm place for your tasks, notes and projects. Explore a small sample workspace, or start with a blank one.</p>
        <div className="modal-actions">
          <button className="button button-secondary" onClick={onStartBlank}>Start blank</button>
          <button className="button button-primary" onClick={onStartSample}>Explore a sample workspace</button>
        </div>
      </div>
    </Modal>
  );
}

export function ShortcutsDialog({ onClose, onCreate }) {
  const shortcuts = [
    ["Ctrl/Cmd + K", "Search everything"],
    ["Alt + Shift + T", "New task"],
    ["Alt + Shift + P", "New project"],
    ["Alt + Shift + N", "New note"],
    ["G, then a letter", "Jump to a tab (G then T for Tasks)"],
    ["?", "Show this list"]
  ];
  return (
    <Modal label="Keyboard shortcuts" onClose={onClose}>
      <div className="create-form">
        <h2>Keyboard shortcuts</h2>
        {shortcuts.map(([keys, action]) => <div className="stat-row" key={keys}><kbd>{keys}</kbd><span>{action}</span></div>)}
        <div className="modal-actions">
          {["task", "project", "note"].map(type => (
            <button key={type} className="button button-secondary" onClick={() => { onClose(); onCreate(type); }}>New {type}</button>
          ))}
          <button className="button button-primary" onClick={onClose}>Close</button>
        </div>
      </div>
    </Modal>
  );
}