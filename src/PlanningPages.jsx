import { useMemo, useState } from "react";

const dateKey = (value = new Date()) => {
  const date = new Date(value);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
};
const todayKey = () => dateKey();

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

export function PlanMyDay({ tasks, onSchedule, navigate }) {
  const [availableMinutes, setAvailableMinutes] = useState(180);
  const [startTime, setStartTime] = useState("09:00");
  const plan = useMemo(() => planTasks(tasks, availableMinutes, startTime), [tasks, availableMinutes, startTime]);
  const today = todayKey();

  return <section className="view active">
    <div className="page-intro"><div><p className="eyebrow">A REALISTIC PLAN FOR TODAY</p><h1>Plan my day</h1><p>Choose a little time and NexaFlow will suggest a focused, priority-first plan.</p></div></div>
    <section className="card-surface day-plan-controls">
      <label>Available focus time<select value={availableMinutes} onChange={event => setAvailableMinutes(Number(event.target.value))}><option value={60}>1 hour</option><option value={120}>2 hours</option><option value={180}>3 hours</option><option value={240}>4 hours</option><option value={360}>6 hours</option></select></label>
      <label>Start at<input type="time" value={startTime} onChange={event => setStartTime(event.target.value)} /></label>
      <span>{plan.reduce((sum, item) => sum + item.duration, 0)} min planned</span>
    </section>
    <div className="day-plan-list card-surface">
      {plan.length ? plan.map(({ task, start, duration }) => <article className="day-plan-item" key={task.id}>
        <time>{`${String(Math.floor(start / 60) % 24).padStart(2, "0")}:${String(start % 60).padStart(2, "0")}`}</time>
        <div><strong>{task.title}</strong><small>{duration} min · {task.priority || "medium"} priority{task.dueDate ? ` · Due ${task.dueDate}` : ""}</small></div>
        <button className="row-edit" onClick={() => navigate("tasks")} aria-label={`Open task list for ${task.title}`}>↗</button>
      </article>) : <div className="empty-state"><span className="empty-icon">◷</span><strong>No tasks fit this plan yet</strong><p>Add or triage a task, or increase your available focus time.</p><button className="button button-secondary" onClick={() => navigate("tasks")}>View tasks</button></div>}
    </div>
    {plan.length > 0 && <div className="day-plan-footer"><p>Suggested times avoid focus blocks already on today’s calendar.</p><button className="button button-primary" onClick={() => onSchedule(plan.map(item => ({ id: item.task.id, scheduledAt: item.scheduledAt })))}>Schedule this plan</button></div>}
    {tasks.some(task => task.status !== "done" && task.scheduledAt && dateKey(task.scheduledAt) === today) && <p className="planning-note">Tasks already scheduled today are left in place and their time is reserved.</p>}
  </section>;
}

export function QuickCaptureInbox({ tasks, onCapture, onEdit, onComplete, onDelete }) {
  const [title, setTitle] = useState("");
  const inboxTasks = tasks.filter(task => task.inbox && task.status !== "done");
  function submit(event) {
    event.preventDefault();
    const value = title.trim();
    if (!value) return;
    onCapture(value);
    setTitle("");
  }

  return <section className="view active">
    <div className="page-intro"><div><p className="eyebrow">CATCH IT, SORT IT LATER</p><h1>Quick-capture inbox</h1><p>Save a thought in one line, then turn it into a task when you’re ready.</p></div></div>
    <form className="card-surface inbox-capture-form" onSubmit={submit}><label htmlFor="quick-capture-title">What do you need to remember?</label><div><input id="quick-capture-title" value={title} onChange={event => setTitle(event.target.value)} maxLength={120} placeholder="Capture a task or idea…" autoComplete="off" /><button className="button button-primary" type="submit">＋ Capture</button></div></form>
    <div className="inbox-list card-surface">{inboxTasks.length ? inboxTasks.map(task => <article className="inbox-item" key={task.id}>
      <div><strong>{task.title}</strong><small>{task.createdAt ? `Captured ${new Date(task.createdAt).toLocaleDateString()}` : "Captured in inbox"}</small></div>
      <div className="inbox-actions"><button className="button button-secondary" onClick={() => onEdit(task)}>Triage</button><button className="button button-secondary" onClick={() => onComplete(task.id)}>Complete</button><button className="row-delete" onClick={() => onDelete(task.id)} aria-label={`Delete ${task.title}`}>×</button></div>
    </article>) : <div className="empty-state"><span className="empty-icon">✦</span><strong>Your inbox is clear</strong><p>Capture a thought now and organize it when you have a moment.</p></div>}</div>
  </section>;
}

export function WeeklyReview({ tasks, activity, projects, navigate }) {
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

  return <section className="view active">
    <div className="page-intro"><div><p className="eyebrow">NOTICE WHAT MOVED</p><h1>Weekly review</h1><p>A quick look back at the last seven days and what could use your attention next.</p></div></div>
    <div className="review-summary">
      <article className="card-surface"><span>COMPLETED THIS WEEK</span><strong>{completed.length}</strong><small>tasks moved to done</small></article>
      <article className="card-surface"><span>OVERDUE</span><strong>{overdue.length}</strong><small>open tasks past their due date</small></article>
      <article className="card-surface"><span>COMING UP</span><strong>{dueSoon.length}</strong><small>tasks due in the next 7 days</small></article>
      <article className="card-surface"><span>WAITING</span><strong>{waiting.length}</strong><small>tasks waiting on someone or something</small></article>
    </div>
    <section className="card-surface review-section"><div className="section-heading"><div><p className="eyebrow">PROJECT CHECK-IN</p><h2>Where things stand</h2></div><button className="link-button" onClick={() => navigate("projects")}>All projects →</button></div>
      {projects.length ? projects.map(project => {
        const projectTasks = tasks.filter(task => task.projectId === project.id && task.status !== "done");
        const problemCount = projectTasks.filter(task => task.status === "waiting" || (task.dueDate && task.dueDate < todayKey())).length;
        return <div className="review-project" key={project.id}><strong>{project.name}</strong><span>{projectTasks.length} open</span><span>{problemCount ? `${problemCount} need${problemCount === 1 ? "s" : ""} attention` : "No overdue or waiting tasks"}</span></div>;
      }) : <p className="planning-note">Create a project to see its weekly check-in here.</p>}
    </section>
    <section className="card-surface review-section"><div className="section-heading"><div><p className="eyebrow">A LOOK BACK</p><h2>Recent activity</h2></div><button className="link-button" onClick={() => navigate("activity")}>Activity history →</button></div>
      {weekActivity.length ? weekActivity.slice(0, 8).map(item => <div className="review-activity" key={item.id}><span>{item.label}</span><time>{new Date(item.createdAt).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}</time></div>) : <p className="planning-note">Workspace activity from this week will appear here.</p>}
    </section>
    {(overdue.length > 0 || dueSoon.length > 0) && <div className="day-plan-footer"><p>Choose one next step to make the coming week feel clearer.</p><button className="button button-primary" onClick={() => navigate("tasks")}>Review tasks</button></div>}
  </section>;
}
