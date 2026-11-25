import { useMemo, useState } from "react";
import { triggerConfetti } from "./Gamification.jsx";

const dateKey = (value = new Date()) => {
  const date = new Date(value);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
};
const todayKey = (value = new Date()) => dateKey(value);
const makeId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const priorityRank = { high: 0, medium: 1, low: 2 };

function planTasks(tasks, availableMinutes, startTime) {
  const today = todayKey();
  const busy = tasks
    .filter(task => task.status !== "done" && task.scheduledAt && dateKey(task.scheduledAt) === today)
    .map(task => {
      const start = new Date(task.scheduledAt).getHours() * 60 + new Date(task.scheduledAt).getMinutes();
      return { start, end: start + Math.max(5, Number(task.estimatedMinutes) || 25) };
    })
    .sort((a, b) => a.start - b.start);
  const [startHour, startMinute] = startTime.split(":").map(Number);
  let cursor = startHour * 60 + startMinute;
  let plannedMinutes = 0;
  const plan = [];
  const candidates = tasks
    .filter(task => task.status !== "done" && task.status !== "waiting" && !task.inbox && !task.scheduledAt)
    .sort((a, b) =>
      (a.dueDate || "9999").localeCompare(b.dueDate || "9999") ||
      ((priorityRank[a.priority || "medium"] ?? 1) - (priorityRank[b.priority || "medium"] ?? 1)) ||
      (a.title || "").localeCompare(b.title || "")
    );

  for (const task of candidates) {
    const duration = Math.max(5, Number(task.estimatedMinutes) || 25);
    if (plannedMinutes + duration > availableMinutes) continue;
    let start = cursor;
    let conflict;
    do {
      conflict = busy.find(block => start < block.end && start + duration > block.start);
      if (conflict) start = conflict.end;
    } while (conflict);
    if (start + duration > 24 * 60) continue;
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setMinutes(start);
    plan.push({ task, start, duration, scheduledAt: date.toISOString() });
    busy.push({ start, end: start + duration });
    busy.sort((a, b) => a.start - b.start);
    cursor = start + duration;
    plannedMinutes += duration;
  }
  return plan;
}

export function PlanMyDay({ state, tasks, update, persist, notify, logActivity, navigate }) {
  const [availableMinutes, setAvailableMinutes] = useState(180);
  const [startTime, setStartTime] = useState("09:00");
  const [showBacklog, setShowBacklog] = useState(false);
  const plan = useMemo(() => planTasks(tasks, availableMinutes, startTime), [tasks, availableMinutes, startTime]);
  const today = todayKey();

  const unscheduledTasks = useMemo(() => {
    return tasks.filter(t => t.status !== "done" && !t.scheduledAt && !t.inbox);
  }, [tasks]);

  async function schedulePlan(proposed) {
    const assignments = proposed.filter(item => {
      const task = tasks.find(record => record.id === item.id);
      return task && task.status !== "done" && task.status !== "waiting" && !task.inbox;
    });
    const scheduled = tasks.filter(task => task.status !== "done" && task.scheduledAt && !assignments.some(item => item.id === task.id));
    const intervals = scheduled.map(task => ({
      start: new Date(task.scheduledAt).getTime(),
      end: new Date(task.scheduledAt).getTime() + Math.max(5, Number(task.estimatedMinutes) || 25) * 60000
    }));
    for (const assignment of assignments) {
      const task = tasks.find(record => record.id === assignment.id);
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
      tasks: tasks.map(task => byId.has(task.id) ? { ...task, scheduledAt: byId.get(task.id) } : task),
      activity: logActivity(state, `Scheduled ${assignments.length} tasks for today`)
    };
    update(next);
    if (await persist(next)) notify(`Scheduled ${assignments.length} tasks for today.`);
  }

  function handleCompleteTask(taskId) {
    triggerConfetti();
    const next = {
      ...state,
      tasks: tasks.map(t => t.id === taskId ? { ...t, status: "done" } : t),
      activity: logActivity(state, "Completed planned task")
    };
    update(next);
    persist(next);
    notify("Task marked as completed!");
  }

  function handleScheduleSingleTask(task) {
    const now = new Date();
    const next = {
      ...state,
      tasks: tasks.map(t => t.id === task.id ? { ...t, scheduledAt: now.toISOString(), dueDate: today } : t),
      activity: logActivity(state, `Added "${task.title}" to today's schedule`)
    };
    update(next);
    persist(next);
    notify(`Added "${task.title}" to today's schedule.`);
  }

  return <section className="view active">
    <div className="page-intro">
      <div>
        <p className="eyebrow">A REALISTIC PLAN FOR TODAY</p>
        <h1>Plan my day</h1>
        <p>Choose a little time and NexaFlow will suggest a focused, priority-first plan.</p>
      </div>
      <button
        type="button"
        className="button button-secondary"
        onClick={() => setShowBacklog(s => !s)}
      >
        {showBacklog ? "Hide Backlog" : `📋 Browse Backlog (${unscheduledTasks.length})`}
      </button>
    </div>

    {showBacklog && (
      <div className="card-surface backlog-picker-card">
        <h3>Unscheduled Backlog Tasks</h3>
        <p className="planning-note">Click "+ Add to today" to schedule any task into today's plan.</p>
        {unscheduledTasks.length === 0
          ? <p className="empty-state">No unscheduled tasks found in backlog!</p>
          : (
            <div className="backlog-items-grid">
              {unscheduledTasks.slice(0, 10).map(t => (
                <div key={t.id} className="backlog-item-row">
                  <div>
                    <strong>{t.title}</strong>
                    <small>{t.priority} priority · {t.estimatedMinutes || 25} min</small>
                  </div>
                  <button
                    type="button"
                    className="button button-small button-primary"
                    onClick={() => handleScheduleSingleTask(t)}
                  >
                    + Add to today
                  </button>
                </div>
              ))}
            </div>
          )}
      </div>
    )}

    <section className="card-surface day-plan-controls">
      <label>Available focus time<select value={availableMinutes} onChange={event => setAvailableMinutes(Number(event.target.value))}><option value={60}>1 hour</option><option value={120}>2 hours</option><option value={180}>3 hours</option><option value={240}>4 hours</option><option value={360}>6 hours</option></select></label>
      <label>Start at<input type="time" value={startTime} onChange={event => setStartTime(event.target.value)} /></label>
      <span>{plan.reduce((sum, item) => sum + item.duration, 0)} min planned</span>
    </section>

    <div className="day-plan-list card-surface">
      {plan.length ? plan.map(({ task, start, duration }) => <article className="day-plan-item" key={task.id}>
        <time>{`${String(Math.floor(start / 60) % 24).padStart(2, "0")}:${String(start % 60).padStart(2, "0")}`}</time>
        <div><strong>{task.title}</strong><small>{duration} min · {task.priority || "medium"} priority{task.dueDate ? ` · Due ${task.dueDate}` : ""}</small></div>
        <div className="day-plan-item-actions">
          <button
            type="button"
            className="button button-small button-secondary"
            title="Mark completed"
            onClick={() => handleCompleteTask(task.id)}
          >
            ✓ Done
          </button>
          <button className="row-edit" onClick={() => navigate("tasks")} aria-label={`Open task list for ${task.title}`}>↗</button>
        </div>
      </article>) : <div className="empty-state"><span className="empty-icon">◷</span><strong>No tasks fit this plan yet</strong><p>Add or triage a task, or increase your available focus time.</p><button className="button button-secondary" onClick={() => navigate("tasks")}>View tasks</button></div>}
    </div>
    {plan.length > 0 && <div className="day-plan-footer"><p>Suggested times avoid focus blocks already on today’s calendar.</p><button className="button button-primary" onClick={() => schedulePlan(plan.map(item => ({ id: item.task.id, scheduledAt: item.scheduledAt })))}>Schedule this plan</button></div>}
    {tasks.some(task => task.status !== "done" && task.scheduledAt && dateKey(task.scheduledAt) === today) && <p className="planning-note">Tasks already scheduled today are left in place and their time is reserved.</p>}
  </section>;
}

export function QuickCaptureInbox({ state, tasks, update, persist, notify, logActivity, onEdit, onComplete, onDelete }) {
  const [title, setTitle] = useState("");
  const inboxTasks = tasks.filter(task => task.inbox && task.status !== "done");

  async function captureTask(capturedTitle) {
    const task = {
      id: makeId(),
      title: capturedTitle,
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
      tasks: [task, ...tasks],
      activity: logActivity(state, `Captured in inbox: ${capturedTitle}`)
    };
    update(next);
    if (await persist(next)) notify("Saved to your quick-capture inbox.");
  }

  function submit(event) {
    event.preventDefault();
    const value = title.trim();
    if (!value) return;
    captureTask(value);
    setTitle("");
  }

  function handleScheduleToday(taskId) {
    const today = todayKey();
    const next = {
      ...state,
      tasks: tasks.map(t => t.id === taskId ? { ...t, dueDate: today, inbox: false } : t),
      activity: logActivity(state, "Moved inbox item to Today")
    };
    update(next);
    persist(next);
    notify("Scheduled for Today & moved to tasks.");
  }

  function handleSetPriority(taskId, priority) {
    const next = {
      ...state,
      tasks: tasks.map(t => t.id === taskId ? { ...t, priority } : t)
    };
    update(next);
    persist(next);
    notify(`Priority set to ${priority}.`);
  }

  function handleAssignProject(taskId, projectId) {
    const next = {
      ...state,
      tasks: tasks.map(t => t.id === taskId ? { ...t, projectId, inbox: false } : t),
      activity: logActivity(state, "Assigned inbox item to project")
    };
    update(next);
    persist(next);
    notify("Assigned to project.");
  }

  function handleTriageAllToTasks() {
    if (!inboxTasks.length) return;
    const next = {
      ...state,
      tasks: tasks.map(t => t.inbox ? { ...t, inbox: false } : t),
      activity: logActivity(state, "Triaged all inbox items to tasks")
    };
    update(next);
    persist(next);
    notify(`Moved ${inboxTasks.length} items to tasks list.`);
  }

  return <section className="view active">
    <div className="page-intro">
      <div>
        <p className="eyebrow">CATCH IT, SORT IT LATER</p>
        <h1>Quick-capture inbox</h1>
        <p>Save a thought in one line, then turn it into a task when you’re ready.</p>
      </div>
      {inboxTasks.length > 1 && (
        <button
          type="button"
          className="button button-secondary"
          onClick={handleTriageAllToTasks}
        >
          Move all to tasks ({inboxTasks.length})
        </button>
      )}
    </div>

    <form className="card-surface inbox-capture-form" onSubmit={submit}>
      <label htmlFor="quick-capture-title">What do you need to remember?</label>
      <div>
        <input id="quick-capture-title" value={title} onChange={event => setTitle(event.target.value)} maxLength={120} placeholder="Capture a task or idea (press Enter)…" autoComplete="off" />
        <button className="button button-primary" type="submit">＋ Capture</button>
      </div>
    </form>

    <div className="inbox-list card-surface">
      {inboxTasks.length ? inboxTasks.map(task => <article className="inbox-item modern-inbox-item" key={task.id}>
        <div className="inbox-item-copy">
          <strong>{task.title}</strong>
          <small>{task.createdAt ? `Captured ${new Date(task.createdAt).toLocaleDateString()}` : "Captured in inbox"}</small>
        </div>
        <div className="inbox-quick-triage-bar">
          <button
            type="button"
            className="button button-small button-secondary triage-btn"
            onClick={() => handleScheduleToday(task.id)}
            title="Schedule for Today"
          >
            📅 Today
          </button>
          <button
            type="button"
            className={`button button-small button-secondary triage-btn ${task.priority === "high" ? "active" : ""}`}
            onClick={() => handleSetPriority(task.id, task.priority === "high" ? "medium" : "high")}
            title="Toggle High Priority"
          >
            ⚡ High
          </button>
          {state.projects.length > 0 && (
            <select
              value={task.projectId || ""}
              onChange={e => handleAssignProject(task.id, e.target.value)}
              aria-label="Assign to project"
              className="inbox-project-select"
            >
              <option value="">Move to Project…</option>
              {state.projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
        </div>
        <div className="inbox-actions">
          <button className="button button-secondary" onClick={() => onEdit(task)}>Edit</button>
          <button className="button button-primary" onClick={() => { onComplete(task.id); triggerConfetti(); }}>Complete</button>
          <button className="row-delete" onClick={() => onDelete(task.id)} aria-label={`Delete ${task.title}`}>×</button>
        </div>
      </article>) : <div className="empty-state"><span className="empty-icon">✦</span><strong>Your inbox is clear</strong><p>Capture a thought now and organize it when you have a moment.</p></div>}
    </div>
  </section>;
}

export function WeeklyReview({ tasks, activity, projects, navigate }) {
  const [activeStep, setActiveStep] = useState(1);
  const [copiedReport, setCopiedReport] = useState(false);

  const since = new Date();
  since.setHours(0, 0, 0, 0);
  since.setDate(since.getDate() - 6);
  const weekActivity = activity.filter(item => new Date(item.createdAt).getTime() >= since.getTime());
  const completed = weekActivity.filter(item => /^Completed task:/.test(item.label));
  const overdue = tasks.filter(task => task.status !== "done" && task.dueDate && task.dueDate < todayKey());
  const nextWeek = new Date();
  nextWeek.setDate(nextWeek.getDate() + 7);
  const dueSoonThrough = todayKey(nextWeek);
  const dueSoon = tasks.filter(task => task.status !== "done" && task.dueDate && task.dueDate >= todayKey() && task.dueDate <= dueSoonThrough);
  const waiting = tasks.filter(task => task.status === "waiting");

  function copyWeeklyReport() {
    const report = `# Weekly Review - ${new Date().toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}

## Summary
- Completed this week: ${completed.length} tasks
- Currently overdue: ${overdue.length} tasks
- Coming up in 7 days: ${dueSoon.length} tasks
- Blocked / Waiting: ${waiting.length} tasks

## Projects
${projects.map(p => {
  const pTasks = tasks.filter(t => t.projectId === p.id && t.status !== "done");
  return `- **${p.name}**: ${pTasks.length} open tasks`;
}).join("\n")}
`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(report);
      setCopiedReport(true);
      setTimeout(() => setCopiedReport(false), 2500);
    }
  }

  return <section className="view active">
    <div className="page-intro">
      <div>
        <p className="eyebrow">NOTICE WHAT MOVED</p>
        <h1>Weekly review</h1>
        <p>A quick look back at the last seven days and what could use your attention next.</p>
      </div>
      <div className="review-top-buttons">
        <button
          type="button"
          className="button button-secondary"
          onClick={copyWeeklyReport}
        >
          {copiedReport ? "✓ Report Copied!" : "📋 Copy Weekly Report"}
        </button>
      </div>
    </div>

    <div className="review-wizard-steps card-surface">
      {[
        [1, "1. Celebrate Wins"],
        [2, "2. Clear Blockers"],
        [3, "3. Next Week Focus"]
      ].map(([stepNum, label]) => (
        <button
          key={stepNum}
          type="button"
          className={`wizard-step-tab ${activeStep === stepNum ? "active" : ""}`}
          onClick={() => setActiveStep(stepNum)}
        >
          {label}
        </button>
      ))}
    </div>

    {activeStep === 1 && (
      <div className="review-step-content">
        <div className="review-summary">
          <article className="card-surface">
            <span>COMPLETED THIS WEEK</span>
            <strong>{completed.length}</strong>
            <small>tasks moved to done</small>
            <button
              type="button"
              className="button button-small button-secondary celebrate-btn"
              onClick={() => triggerConfetti()}
            >
              🎉 Celebrate!
            </button>
          </article>
          <article className="card-surface">
            <span>ACTIVITY ENTRIES</span>
            <strong>{weekActivity.length}</strong>
            <small>logged actions this week</small>
          </article>
        </div>

        <section className="card-surface review-section">
          <div className="section-heading">
            <div><p className="eyebrow">A LOOK BACK</p><h2>Completed &amp; recent activity</h2></div>
            <button className="link-button" onClick={() => navigate("activity")}>Activity history →</button>
          </div>
          {weekActivity.length ? weekActivity.slice(0, 8).map(item => (
            <div className="review-activity" key={item.id}>
              <span>{item.label}</span>
              <time>{new Date(item.createdAt).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}</time>
            </div>
          )) : <p className="planning-note">Workspace activity from this week will appear here.</p>}
        </section>

        <div className="day-plan-footer">
          <button className="button button-primary" onClick={() => setActiveStep(2)}>Next: Clear Blockers →</button>
        </div>
      </div>
    )}

    {activeStep === 2 && (
      <div className="review-step-content">
        <div className="review-summary">
          <article className="card-surface"><span>OVERDUE</span><strong>{overdue.length}</strong><small>tasks past due date</small></article>
          <article className="card-surface"><span>WAITING</span><strong>{waiting.length}</strong><small>tasks blocked / waiting</small></article>
        </div>

        <section className="card-surface review-section">
          <div className="section-heading">
            <div><p className="eyebrow">NEEDS ATTENTION</p><h2>Overdue tasks</h2></div>
            <button className="link-button" onClick={() => navigate("tasks")}>Open tasks →</button>
          </div>
          {overdue.length === 0
            ? <p className="planning-note">🎉 No overdue tasks! Your workspace is clear.</p>
            : overdue.map(t => (
              <div key={t.id} className="review-activity">
                <div>
                  <strong>{t.title}</strong>
                  <small>Due {t.dueDate} · {t.priority} priority</small>
                </div>
                <button className="button button-small button-secondary" onClick={() => navigate("tasks")}>Triage in tasks</button>
              </div>
            ))}
        </section>

        <div className="day-plan-footer">
          <button className="button button-secondary" onClick={() => setActiveStep(1)}>← Back</button>
          <button className="button button-primary" onClick={() => setActiveStep(3)}>Next: Plan Ahead →</button>
        </div>
      </div>
    )}

    {activeStep === 3 && (
      <div className="review-step-content">
        <div className="review-summary">
          <article className="card-surface"><span>COMING UP NEXT WEEK</span><strong>{dueSoon.length}</strong><small>tasks due in 7 days</small></article>
          <article className="card-surface"><span>ACTIVE PROJECTS</span><strong>{projects.length}</strong><small>ongoing outcomes</small></article>
        </div>

        <section className="card-surface review-section">
          <div className="section-heading">
            <div><p className="eyebrow">PROJECT CHECK-IN</p><h2>Where things stand</h2></div>
            <button className="link-button" onClick={() => navigate("projects")}>All projects →</button>
          </div>
          {projects.length ? projects.map(project => {
            const projectTasks = tasks.filter(task => task.projectId === project.id && task.status !== "done");
            const problemCount = projectTasks.filter(task => task.status === "waiting" || (task.dueDate && task.dueDate < todayKey())).length;
            return <div className="review-project" key={project.id}><strong>{project.name}</strong><span>{projectTasks.length} open</span><span>{problemCount ? `${problemCount} need${problemCount === 1 ? "s" : ""} attention` : "No overdue or waiting tasks"}</span></div>;
          }) : <p className="planning-note">Create a project to see its weekly check-in here.</p>}
        </section>

        <div className="day-plan-footer">
          <button className="button button-secondary" onClick={() => setActiveStep(2)}>← Back</button>
          <button className="button button-primary" onClick={() => navigate("tasks")}>Finish Review &amp; Go to Tasks ✓</button>
        </div>
      </div>
    )}
  </section>;
}
