import { useState } from "react";

const makeId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;

export function TemplatesPage({ templates, onCreate, onUse, onDelete }) {
  const [type, setType] = useState("task");
  return <section className="view active">
    <div className="page-intro"><div><p className="eyebrow">REPEAT THE GOOD ROUTINES</p><h1>Templates</h1><p>Save a useful starting point for tasks and projects you create often.</p></div></div>
    <form className="card-surface productivity-form" onSubmit={event => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      onCreate({
        id: makeId(),
        type,
        title: String(data.get("title") || "").trim(),
        details: String(data.get("details") || "").trim(),
        priority: String(data.get("priority") || "medium"),
        estimatedMinutes: Math.max(0, Number(data.get("estimatedMinutes") || 0))
      });
      event.currentTarget.reset();
    }}>
      <h2>Create a template</h2>
      <div className="form-grid">
        <label>Template for<select value={type} onChange={event => setType(event.target.value)}><option value="task">Task</option><option value="project">Project</option></select></label>
        <label>Name<input name="title" required maxLength={120} placeholder="e.g. Weekly review" /></label>
      </div>
      <label>Starter details<textarea name="details" rows="3" maxLength={1200} placeholder="A reusable description or checklist…" /></label>
      {type === "task" && <div className="form-grid"><label>Default priority<select name="priority" defaultValue="medium"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label><label>Estimated minutes<input name="estimatedMinutes" type="number" min="0" max="1440" step="5" defaultValue="25" /></label></div>}
      <button className="button button-primary" type="submit">Save template</button>
    </form>
    <div className="template-grid">
      {templates.length ? templates.map(template => <article className="card-surface template-card" key={template.id}>
        <span className="template-kind">{template.type === "project" ? "PROJECT" : "TASK"}</span>
        <h2>{template.title}</h2><p>{template.details || "A blank reusable starting point."}</p>
        {template.type === "task" && <small>{template.priority || "medium"} priority{template.estimatedMinutes ? ` · ${template.estimatedMinutes} min` : ""}</small>}
        <div className="template-actions"><button className="button button-primary" onClick={() => onUse(template)}>Use template</button><button className="row-delete" onClick={() => onDelete(template.id)} aria-label={`Delete ${template.title}`}>×</button></div>
      </article>) : <div className="empty-card"><div className="empty-state"><span className="empty-icon">▤</span><strong>No templates yet</strong><p>Save a repeatable task or project outline to get started.</p></div></div>}
    </div>
  </section>;
}

export function GoalsPage({ goals, projects, onCreate, onToggleMilestone, onAddMilestone, onDelete }) {
  const [milestoneInputs, setMilestoneInputs] = useState({});
  return <section className="view active">
    <div className="page-intro"><div><p className="eyebrow">BIG PICTURE, SMALL STEPS</p><h1>Goals &amp; milestones</h1><p>Keep outcomes visible and break them into milestones you can check off.</p></div></div>
    <form className="card-surface productivity-form" onSubmit={event => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      onCreate({
        id: makeId(),
        title: String(data.get("title") || "").trim(),
        targetDate: String(data.get("targetDate") || ""),
        projectId: String(data.get("projectId") || ""),
        milestones: String(data.get("milestones") || "").split("\n").map(title => title.trim()).filter(Boolean).slice(0, 40).map(title => ({ id: makeId(), title, done: false })),
        createdAt: new Date().toISOString()
      });
      event.currentTarget.reset();
    }}>
      <h2>Set a goal</h2>
      <div className="form-grid"><label>Goal<input name="title" required maxLength={120} placeholder="What outcome are you aiming for?" /></label><label>Target date<input name="targetDate" type="date" /></label></div>
      {projects.length > 0 && <label>Related project (optional)<select name="projectId"><option value="">No project</option>{projects.map(project => <option value={project.id} key={project.id}>{project.name}</option>)}</select></label>}
      <label>Milestones (one per line)<textarea name="milestones" rows="3" maxLength={2400} placeholder={"Define the first milestone\nThen the next one"} /></label>
      <button className="button button-primary" type="submit">Add goal</button>
    </form>
    <div className="goal-list">
      {goals.length ? goals.map(goal => {
        const complete = goal.milestones.filter(item => item.done).length;
        const progress = goal.milestones.length ? Math.round(complete / goal.milestones.length * 100) : 0;
        const project = projects.find(item => item.id === goal.projectId);
        return <article className="card-surface goal-card" key={goal.id}>
          <div className="goal-card-heading"><div><span className="template-kind">GOAL{project ? ` · ${project.name}` : ""}</span><h2>{goal.title}</h2></div><button className="row-delete" onClick={() => onDelete(goal.id)} aria-label={`Delete goal ${goal.title}`}>×</button></div>
          {goal.targetDate && <p className="goal-target">Target · {new Date(`${goal.targetDate}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</p>}
          <div className="progress-caption"><span>{complete} of {goal.milestones.length} milestones</span><span>{progress}%</span></div><div className="progress-track"><div style={{ width: `${progress}%` }} /></div>
          <div className="goal-milestones">{goal.milestones.map(milestone => <label key={milestone.id}><input type="checkbox" checked={Boolean(milestone.done)} onChange={() => onToggleMilestone(goal.id, milestone.id)} /><span className={milestone.done ? "subtask-done" : ""}>{milestone.title}</span></label>)}</div>
          <form className="goal-add-milestone" onSubmit={event => {
            event.preventDefault();
            const title = String(new FormData(event.currentTarget).get("milestone") || "").trim();
            if (!title) return;
            onAddMilestone(goal.id, { id: makeId(), title, done: false });
            setMilestoneInputs(current => ({ ...current, [goal.id]: "" }));
          }}><input name="milestone" value={milestoneInputs[goal.id] || ""} onChange={event => setMilestoneInputs(current => ({ ...current, [goal.id]: event.target.value }))} maxLength={120} placeholder="Add a milestone…" /><button className="button button-secondary" type="submit">Add</button></form>
        </article>;
      }) : <div className="empty-card"><div className="empty-state"><span className="empty-icon">✦</span><strong>No goals yet</strong><p>Choose an outcome and give it a few milestones.</p></div></div>}
    </div>
  </section>;
}
