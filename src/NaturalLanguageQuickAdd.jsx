// src/NaturalLanguageQuickAdd.jsx
// Smart Quick-Add Bar with real-time natural language parsing
import { useMemo, useState } from "react";
import { parseNaturalLanguageTask } from "./naturalLanguage.js";

export function NaturalLanguageQuickAdd({ projects = [], onAddTask }) {
  const [text, setText] = useState("");
  const [showTips, setShowTips] = useState(false);

  const parsed = useMemo(() => {
    return parseNaturalLanguageTask(text, projects);
  }, [text, projects]);

  const hasContent = Boolean(text.trim());
  const selectedProject = projects.find(p => p.id === parsed.projectId);

  const handleSubmit = e => {
    e.preventDefault();
    if (!parsed.title) return;

    onAddTask({
      title: parsed.title,
      priority: parsed.priority,
      tags: parsed.tags,
      dueDate: parsed.dueDate,
      projectId: parsed.projectId,
      status: "todo",
      details: ""
    });

    setText("");
  };

  return (
    <div className="quick-add-container card-surface">
      <form onSubmit={handleSubmit} className="quick-add-form">
        <div className="quick-add-input-wrapper">
          <span className="quick-add-icon">⚡</span>
          <input
            type="text"
            className="quick-add-input"
            placeholder="Quick-add task... e.g. “Prepare slide deck tomorrow !high #work @Design” (Press Enter)"
            value={text}
            onChange={e => setText(e.target.value)}
          />
          <button
            type="button"
            className="quick-add-tips-btn"
            onClick={() => setShowTips(!showTips)}
            title="Formatting syntax tips"
          >
            ?
          </button>
          <button
            type="submit"
            className="button button-primary quick-add-submit-btn"
            disabled={!hasContent}
          >
            Add Task
          </button>
        </div>

        {hasContent && (
          <div className="quick-add-preview-ribbon">
            <span className="preview-label">Parsed:</span>
            {parsed.title && <span className="preview-pill title-pill">{parsed.title}</span>}
            {parsed.dueDate && <span className="preview-pill date-pill">📅 Due {parsed.dueDate}</span>}
            <span className={`preview-pill priority-pill priority-${parsed.priority}`}>
              ⚡ {parsed.priority.toUpperCase()}
            </span>
            {selectedProject && <span className="preview-pill project-pill">📁 @{selectedProject.name}</span>}
            {parsed.tags.map(t => (
              <span key={t} className="preview-pill tag-pill">#{t}</span>
            ))}
          </div>
        )}
      </form>

      {showTips && (
        <div className="quick-add-tips-card">
          <div className="tips-grid">
            <div>
              <strong>Due dates:</strong> <code>today</code>, <code>tomorrow</code>, <code>in 3 days</code>, <code>friday</code>
            </div>
            <div>
              <strong>Priorities:</strong> <code>!high</code>, <code>!med</code>, <code>!low</code>
            </div>
            <div>
              <strong>Tags:</strong> <code>#work</code>, <code>#urgent</code>, <code>#bug</code>
            </div>
            <div>
              <strong>Projects:</strong> <code>@Marketing</code>, <code>@Design</code>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
