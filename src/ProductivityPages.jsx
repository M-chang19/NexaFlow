// src/ProductivityPages.jsx
import { useMemo, useState } from "react";
import { triggerConfetti } from "./Gamification.jsx";

const makeId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const STARTER_TEMPLATES = [
  {
    id: "tpl-weekly-review",
    title: "Weekly Review & Planning",
    category: "Routines",
    type: "task",
    icon: "🔄",
    priority: "high",
    estimatedMinutes: 30,
    tags: ["routine", "planning"],
    details: "A comprehensive weekly check-in to clear backlogs, evaluate progress, and line up the next 7 days.",
    subtasks: [
      "Process email and task inbox to zero",
      "Review open tasks and follow-ups",
      "Evaluate progress against monthly goals",
      "Select top 3 needle-moving priorities for next week",
      "Block focus time on calendar"
    ]
  },
  {
    id: "tpl-morning-standup",
    title: "Daily Morning Kickoff",
    category: "Routines",
    type: "task",
    icon: "🌅",
    priority: "medium",
    estimatedMinutes: 15,
    tags: ["routine", "daily"],
    details: "Start the day intentional: review today's schedule, choose the one must-win task, and clear urgent blockers.",
    subtasks: [
      "Review calendar events & meetings today",
      "Identify the #1 most important task",
      "Clear immediate urgent blockers"
    ]
  },
  {
    id: "tpl-deep-work",
    title: "Deep Work Focus Block (45m)",
    category: "Routines",
    type: "task",
    icon: "🧘",
    priority: "high",
    estimatedMinutes: 45,
    tags: ["focus", "deep-work"],
    details: "Single-task distraction-free flow session with zero context switching.",
    subtasks: [
      "Silence notifications and close chat apps",
      "Define single tangible deliverable",
      "Turn on ambient focus sound and start 45m timer"
    ]
  },
  {
    id: "tpl-feature-launch",
    title: "Product Feature Launch",
    category: "Development",
    type: "project",
    icon: "🚀",
    folder: "Engineering",
    tags: ["release", "feature"],
    details: "End-to-end milestone tracker for scoping, implementing, testing, and shipping a new user feature.",
    subtasks: [
      "Write PRD and technical architecture spec",
      "UI design review & design system components",
      "Implementation and automated test coverage",
      "QA regression testing in staging",
      "Production deployment & release changelog"
    ]
  },
  {
    id: "tpl-bug-fix",
    title: "Bug Triage & Resolution",
    category: "Development",
    type: "task",
    icon: "🐛",
    priority: "high",
    estimatedMinutes: 30,
    tags: ["bug", "dev"],
    details: "Disciplined bug resolution workflow to prevent regressions.",
    subtasks: [
      "Reproduce bug with minimal steps",
      "Isolate root cause in codebase",
      "Write regression test to capture bug",
      "Implement fix and submit pull request"
    ]
  },
  {
    id: "tpl-content-article",
    title: "Blog Post / Documentation Guide",
    category: "Content",
    type: "project",
    icon: "📝",
    folder: "Marketing",
    tags: ["content", "writing"],
    details: "Full pipeline for researching, drafting, reviewing, and publishing high-impact content.",
    subtasks: [
      "Keyword research and topic outline",
      "First draft writing",
      "Peer review & copy editing",
      "Create banner diagrams and screenshots",
      "Publish and distribute"
    ]
  },
  {
    id: "tpl-client-onboarding",
    title: "Client Onboarding Sequence",
    category: "Operations",
    type: "project",
    icon: "🤝",
    folder: "Operations",
    tags: ["client", "onboarding"],
    details: "Smooth handoff and onboarding checklist for new accounts and partnerships.",
    subtasks: [
      "Send welcome packet & kickoff questionnaire",
      "Schedule kickoff call",
      "Set up shared Google Drive & Slack channel",
      "Confirm project deliverables & milestone dates"
    ]
  },
  {
    id: "tpl-code-review",
    title: "Peer Code Review",
    category: "Development",
    type: "task",
    icon: "🔍",
    priority: "medium",
    estimatedMinutes: 20,
    tags: ["review", "dev"],
    details: "Thorough peer review checking architecture, edge cases, test coverage, and documentation.",
    subtasks: [
      "Verify PR matches issue requirements",
      "Inspect edge cases and error handling",
      "Check unit test coverage and CI results",
      "Leave constructive feedback or approve"
    ]
  }
];

export function TemplatesPage({ templates, update, notify, logActivity, createItem }) {
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newType, setNewType] = useState("task");
  const [expandedTplId, setExpandedTplId] = useState(null);

  // Combine built-in starter templates and user custom templates
  const allTemplates = useMemo(() => {
    const customList = (templates || []).map(t => ({
      ...t,
      isCustom: true,
      category: t.category || "My Custom",
      icon: t.icon || (t.type === "project" ? "📁" : "📋"),
      subtasks: t.subtasks || []
    }));
    return [...STARTER_TEMPLATES, ...customList];
  }, [templates]);

  // Categories list
  const categories = useMemo(() => {
    const set = new Set(["All", "Routines", "Development", "Content", "Operations"]);
    if (templates && templates.length > 0) set.add("My Custom");
    return Array.from(set);
  }, [templates]);

  // Filtered templates
  const filteredTemplates = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return allTemplates.filter(t => {
      if (selectedCategory !== "All") {
        if (selectedCategory === "My Custom" && !t.isCustom) return false;
        if (selectedCategory !== "My Custom" && t.category !== selectedCategory) return false;
      }
      if (q) {
        const text = `${t.title} ${t.details || ""} ${(t.tags || []).join(" ")}`.toLowerCase();
        if (!text.includes(q)) return false;
      }
      return true;
    });
  }, [allTemplates, selectedCategory, searchQuery]);

  function handleUseTemplate(template) {
    createItem({
      type: template.type,
      title: template.title,
      details: template.details || "",
      priority: template.priority || "medium",
      estimatedMinutes: template.estimatedMinutes || 25,
      folder: template.folder || "",
      tags: template.tags || [],
      subtasks: template.subtasks || [],
      dependencyIds: [],
      relatedNoteIds: [],
      relatedTaskIds: [],
      status: "todo"
    });
    triggerConfetti();
    notify(`Created ${template.type} from template "${template.title}"!`);
  }

  function handleCreateCustom(e) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const title = String(data.get("title") || "").trim();
    if (!title) return;

    const rawSubtasks = String(data.get("subtasks") || "")
      .split("\n")
      .map(s => s.trim())
      .filter(Boolean);

    const rawTags = String(data.get("tags") || "")
      .split(",")
      .map(s => s.trim())
      .filter(Boolean);

    const newTemplate = {
      id: makeId(),
      type: newType,
      title,
      category: "My Custom",
      details: String(data.get("details") || "").trim(),
      priority: String(data.get("priority") || "medium"),
      estimatedMinutes: Math.max(0, Number(data.get("estimatedMinutes") || 25)),
      folder: String(data.get("folder") || "").trim(),
      tags: rawTags,
      subtasks: rawSubtasks
    };

    update(current => ({
      ...current,
      templates: [...(current.templates || []), newTemplate],
      activity: logActivity(current, `Saved ${newTemplate.type} template: ${newTemplate.title}`)
    }));

    notify("Custom template created.");
    setShowCreateModal(false);
  }

  function handleDeleteCustom(templateId) {
    update(current => ({
      ...current,
      templates: (current.templates || []).filter(item => item.id !== templateId)
    }));
    notify("Template deleted.");
  }

  return (
    <section className="view active templates-view">
      <div className="page-intro templates-page-intro">
        <div>
          <p className="eyebrow">REUSABLE WORKFLOWS & ROUTINES</p>
          <h1>Workflow Templates</h1>
          <p>Instantiate battle-tested routines, project scaffolds, and sprint checklists in one click.</p>
        </div>
        <button
          className="button button-primary create-template-btn"
          onClick={() => setShowCreateModal(true)}
        >
          ＋ Create Custom Template
        </button>
      </div>

      <div className="templates-toolbar card-surface">
        <label className="search-field templates-search">
          <input
            type="search"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search templates (e.g. review, launch, bug)..."
            aria-label="Search templates"
          />
        </label>
        <div className="templates-categories">
          {categories.map(cat => (
            <button
              key={cat}
              className={`filter-tab ${selectedCategory === cat ? "active" : ""}`}
              onClick={() => setSelectedCategory(cat)}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      <div className="template-grid modern-template-grid">
        {filteredTemplates.map(template => {
          const subtasks = template.subtasks || [];
          const isExpanded = expandedTplId === template.id;
          const displaySubtasks = isExpanded ? subtasks : subtasks.slice(0, 3);

          return (
            <article className={`card-surface template-card modern-template-card ${template.isCustom ? "custom-card" : ""}`} key={template.id}>
              <div className="template-card-header">
                <div className="template-icon-wrap">
                  <span className="template-icon">{template.icon}</span>
                  <span className={`template-type-badge type-${template.type}`}>
                    {template.type.toUpperCase()}
                  </span>
                </div>
                {template.isCustom && (
                  <button
                    className="row-delete template-delete-btn"
                    onClick={() => handleDeleteCustom(template.id)}
                    title="Delete custom template"
                    aria-label={`Delete ${template.title}`}
                  >
                    ×
                  </button>
                )}
              </div>

              <h2 className="template-title">{template.title}</h2>
              <p className="template-desc">{template.details || "A blank reusable starting point."}</p>

              {subtasks.length > 0 && (
                <div className="template-subtasks-preview">
                  <span className="template-subtasks-title">Includes {subtasks.length} checklist items:</span>
                  <ul className="template-subtasks-list">
                    {displaySubtasks.map((st, i) => (
                      <li key={i}>
                        <span className="subtask-bullet">✓</span>
                        <span>{st}</span>
                      </li>
                    ))}
                  </ul>
                  {subtasks.length > 3 && (
                    <button
                      type="button"
                      className="template-expand-btn"
                      onClick={() => setExpandedTplId(isExpanded ? null : template.id)}
                    >
                      {isExpanded ? "Show fewer" : `+${subtasks.length - 3} more items`}
                    </button>
                  )}
                </div>
              )}

              <div className="template-card-footer">
                <div className="template-meta-pills">
                  {template.priority && (
                    <span className={`meta-pill priority-${template.priority}`}>
                      ⚡ {template.priority}
                    </span>
                  )}
                  {template.estimatedMinutes > 0 && (
                    <span className="meta-pill time-pill">
                      ⏱ {template.estimatedMinutes}m
                    </span>
                  )}
                  {(template.tags || []).slice(0, 2).map(tag => (
                    <span key={tag} className="meta-pill tag-pill">
                      #{tag}
                    </span>
                  ))}
                </div>

                <button
                  className="button button-primary template-use-btn"
                  onClick={() => handleUseTemplate(template)}
                >
                  Use Template →
                </button>
              </div>
            </article>
          );
        })}

        {filteredTemplates.length === 0 && (
          <div className="empty-card template-empty-card">
            <div className="empty-state">
              <span className="empty-icon">▤</span>
              <strong>No templates found</strong>
              <p>Try clearing your search or category filter.</p>
            </div>
          </div>
        )}
      </div>

      {showCreateModal && (
        <div className="palette-backdrop" onClick={() => setShowCreateModal(false)}>
          <div className="modal-content template-modal-card" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowCreateModal(false)}>×</button>
            <form onSubmit={handleCreateCustom} className="create-form">
              <h2>Create a Custom Template</h2>
              <p className="modal-subtitle">Save a reusable outline for tasks or projects you create often.</p>

              <div className="form-grid">
                <label>
                  Template Type
                  <select value={newType} onChange={e => setNewType(e.target.value)}>
                    <option value="task">Task Template</option>
                    <option value="project">Project Template</option>
                  </select>
                </label>
                <label>
                  Template Name
                  <input name="title" required maxLength={120} placeholder="e.g. Sprint Retrospective" />
                </label>
              </div>

              <label>
                Description / Purpose
                <textarea name="details" rows="2" maxLength={1000} placeholder="What is this template for?" />
              </label>

              {newType === "task" ? (
                <div className="form-grid">
                  <label>
                    Default Priority
                    <select name="priority" defaultValue="medium">
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </select>
                  </label>
                  <label>
                    Estimated Duration (min)
                    <input name="estimatedMinutes" type="number" min="0" max="1440" step="5" defaultValue="25" />
                  </label>
                </div>
              ) : (
                <label>
                  Project Folder
                  <input name="folder" placeholder="e.g. Engineering, Marketing" />
                </label>
              )}

              <label>
                Subtasks / Checklist (one per line)
                <textarea
                  name="subtasks"
                  rows="4"
                  placeholder={"Step 1: Gather background data\nStep 2: Draft proposal\nStep 3: Review with team"}
                />
              </label>

              <label>
                Tags (comma separated)
                <input name="tags" placeholder="e.g. weekly, planning, routine" />
              </label>

              <div className="modal-actions">
                <button type="button" className="button button-secondary" onClick={() => setShowCreateModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="button button-primary">
                  Save Template
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}

export function GoalsPage({ goals, projects, update, notify, logActivity }) {
  const [milestoneInputs, setMilestoneInputs] = useState({});
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
    const goal = goals.find(item => item.id === goalId);
    if (!goal || !window.confirm(`Delete goal "${goal.title}"?`)) return;
    update(current => ({ ...current, goals: (current.goals || []).filter(item => item.id !== goalId), activity: logActivity(current, `Deleted goal: ${goal.title}`, goal.projectId) }));
    notify("Goal deleted.");
  }

  return <section className="view active">
    <div className="page-intro"><div><p className="eyebrow">BIG PICTURE, SMALL STEPS</p><h1>Goals &amp; milestones</h1><p>Keep outcomes visible and break them into milestones you can check off.</p></div></div>
    <form className="card-surface productivity-form" onSubmit={event => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      createGoal({
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
        const milestones = goal.milestones || [];
        const complete = milestones.filter(item => item.done).length;
        const progress = milestones.length ? Math.round(complete / milestones.length * 100) : 0;
        const project = projects.find(item => item.id === goal.projectId);
        return <article className="card-surface goal-card" key={goal.id}>
          <div className="goal-card-heading"><div><span className="template-kind">GOAL{project ? ` · ${project.name}` : ""}</span><h2>{goal.title}</h2></div><button className="row-delete" onClick={() => deleteGoal(goal.id)} aria-label={`Delete goal ${goal.title}`}>×</button></div>
          {goal.targetDate && <p className="goal-target">Target · {new Date(`${goal.targetDate}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</p>}
          <div className="progress-caption"><span>{complete} of {milestones.length} milestones</span><span>{progress}%</span></div><div className="progress-track"><div style={{ width: `${progress}%` }} /></div>
          <div className="goal-milestones">{milestones.map(milestone => <label key={milestone.id}><input type="checkbox" checked={Boolean(milestone.done)} onChange={() => toggleGoalMilestone(goal.id, milestone.id)} /><span className={milestone.done ? "subtask-done" : ""}>{milestone.title}</span></label>)}</div>
          <form className="goal-add-milestone" onSubmit={event => {
            event.preventDefault();
            const title = String(new FormData(event.currentTarget).get("milestone") || "").trim();
            if (!title) return;
            addGoalMilestone(goal.id, { id: makeId(), title, done: false });
            setMilestoneInputs(current => ({ ...current, [goal.id]: "" }));
          }}><input name="milestone" value={milestoneInputs[goal.id] || ""} onChange={event => setMilestoneInputs(current => ({ ...current, [goal.id]: event.target.value }))} maxLength={120} placeholder="Add a milestone…" /><button className="button button-secondary" type="submit">Add</button></form>
        </article>;
      }) : <div className="empty-card"><div className="empty-state"><span className="empty-icon">✦</span><strong>No goals yet</strong><p>Choose an outcome and give it a few milestones.</p></div></div>}
    </div>
  </section>;
}
