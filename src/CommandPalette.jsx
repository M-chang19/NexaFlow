// src/CommandPalette.jsx
// Raycast / Linear style global Command Palette (Ctrl+K / Cmd+K)
import { useEffect, useMemo, useRef, useState } from "react";

const VIEWS = [
  { id: "overview", label: "Overview", icon: "⌂", category: "Navigation" },
  { id: "tasks", label: "My Tasks", icon: "✓", category: "Navigation" },
  { id: "board", label: "Kanban Board", icon: "▦", category: "Navigation" },
  { id: "calendar", label: "Calendar", icon: "📅", category: "Navigation" },
  { id: "focus", label: "Focus Timer", icon: "⏱", category: "Navigation" },
  { id: "projects", label: "Projects", icon: "📁", category: "Navigation" },
  { id: "notes", label: "Notes", icon: "📝", category: "Navigation" },
  { id: "goals", label: "Goals & Milestones", icon: "🎯", category: "Navigation" },
  { id: "dayPlan", label: "Plan My Day", icon: "☀️", category: "Navigation" },
  { id: "weeklyReview", label: "Weekly Review", icon: "📊", category: "Navigation" },
  { id: "assistant", label: "AI Assistant", icon: "✦", category: "Navigation" },
  { id: "settings", label: "Settings", icon: "⚙", category: "Navigation" }
];

export function CommandPalette({
  isOpen,
  onClose,
  navigate,
  state,
  openCreate,
  onToggleTheme,
  onStartFocus,
  darkMode
}) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  // Auto-focus input on open
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [isOpen]);

  // Build items list based on query
  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    const result = [];

    // 1. Actions
    const actions = [
      {
        id: "act-new-task",
        label: "Create new task",
        category: "Action",
        icon: "+",
        action: () => { onClose(); openCreate("task"); }
      },
      {
        id: "act-new-project",
        label: "Create new project",
        category: "Action",
        icon: "+",
        action: () => { onClose(); openCreate("project"); }
      },
      {
        id: "act-new-note",
        label: "Create new note",
        category: "Action",
        icon: "+",
        action: () => { onClose(); openCreate("note"); }
      },
      {
        id: "act-toggle-theme",
        label: `Switch to ${darkMode ? "Light" : "Dark"} mode`,
        category: "Action",
        icon: darkMode ? "☀️" : "🌙",
        action: () => { onClose(); onToggleTheme(); }
      },
      {
        id: "act-start-focus",
        label: "Start 25-minute focus session",
        category: "Action",
        icon: "⏱",
        action: () => { onClose(); navigate("focus"); onStartFocus?.(); }
      }
    ];

    actions.forEach(act => {
      if (!q || act.label.toLowerCase().includes(q)) {
        result.push(act);
      }
    });

    // 2. Navigation Views
    VIEWS.forEach(view => {
      if (!q || view.label.toLowerCase().includes(q)) {
        result.push({
          id: `view-${view.id}`,
          label: `Go to ${view.label}`,
          category: "Navigation",
          icon: view.icon,
          action: () => { onClose(); navigate(view.id); }
        });
      }
    });

    // 3. Projects
    if (state?.projects?.length) {
      state.projects.forEach(proj => {
        if (!q || proj.name.toLowerCase().includes(q)) {
          result.push({
            id: `proj-${proj.id}`,
            label: proj.name,
            sublabel: "Project",
            category: "Project",
            icon: "📁",
            action: () => { onClose(); navigate("projects"); }
          });
        }
      });
    }

    // 4. Tasks (limit to 8)
    if (state?.tasks?.length) {
      let taskMatches = 0;
      state.tasks.forEach(task => {
        if (taskMatches >= 8) return;
        if (q && task.title.toLowerCase().includes(q)) {
          taskMatches++;
          result.push({
            id: `task-${task.id}`,
            label: task.title,
            sublabel: task.status === "done" ? "Completed task" : "Open task",
            category: "Task",
            icon: task.status === "done" ? "✓" : "○",
            action: () => { onClose(); navigate("tasks"); }
          });
        }
      });
    }

    // 5. Notes (limit to 5)
    if (state?.notes?.length) {
      let noteMatches = 0;
      state.notes.forEach(note => {
        if (noteMatches >= 5) return;
        if (q && (note.title || "").toLowerCase().includes(q)) {
          noteMatches++;
          result.push({
            id: `note-${note.id}`,
            label: note.title || "Untitled note",
            sublabel: "Note",
            category: "Note",
            icon: "📝",
            action: () => { onClose(); navigate("notes"); }
          });
        }
      });
    }

    return result;
  }, [query, darkMode, state, onClose, openCreate, onToggleTheme, navigate, onStartFocus]);

  // Adjust selection when items change
  useEffect(() => {
    setSelectedIndex(0);
  }, [items]);

  // Keyboard navigation
  const handleKeyDown = event => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelectedIndex(prev => (prev + 1) % Math.max(1, items.length));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelectedIndex(prev => (prev - 1 + items.length) % Math.max(1, items.length));
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      if (items[selectedIndex]) {
        items[selectedIndex].action();
      }
    }
  };

  // Scroll active item into view
  useEffect(() => {
    if (!listRef.current) return;
    const activeEl = listRef.current.querySelector(`.palette-item.active`);
    if (activeEl) {
      activeEl.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  if (!isOpen) return null;

  return (
    <div className="palette-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-label="Command Palette">
      <div className="palette-card" onClick={e => e.stopPropagation()}>
        <div className="palette-search-wrapper">
          <span className="palette-search-icon" aria-hidden="true">⌘</span>
          <input
            ref={inputRef}
            type="text"
            className="palette-search-input"
            placeholder="Type a command or search tasks, projects, notes…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <kbd className="palette-esc-hint" onClick={onClose}>ESC</kbd>
        </div>

        <div className="palette-list" ref={listRef}>
          {items.length === 0 ? (
            <div className="palette-empty">No results found for “{query}”</div>
          ) : (
            items.map((item, index) => (
              <div
                key={item.id}
                className={`palette-item ${index === selectedIndex ? "active" : ""}`}
                onClick={item.action}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                <span className="palette-item-icon">{item.icon}</span>
                <span className="palette-item-label">{item.label}</span>
                {item.sublabel && <span className="palette-item-sublabel">{item.sublabel}</span>}
                <span className="palette-item-badge">{item.category}</span>
              </div>
            ))
          )}
        </div>

        <div className="palette-footer">
          <span><kbd>↑</kbd> <kbd>↓</kbd> to navigate</span>
          <span><kbd>↵</kbd> to select</span>
          <span><kbd>esc</kbd> to close</span>
        </div>
      </div>
    </div>
  );
}
