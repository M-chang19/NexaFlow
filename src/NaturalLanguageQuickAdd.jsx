// src/NaturalLanguageQuickAdd.jsx
// Smart Quick-Add Bar with real-time natural language parsing & voice dictation
import { useMemo, useRef, useState } from "react";
import { parseNaturalLanguageTask } from "./naturalLanguage.js";

export function NaturalLanguageQuickAdd({ projects = [], onAddTask }) {
  const [text, setText] = useState("");
  const [showTips, setShowTips] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [voiceNotice, setVoiceNotice] = useState("");
  const recognitionRef = useRef(null);

  const parsed = useMemo(() => {
    return parseNaturalLanguageTask(text, projects);
  }, [text, projects]);

  const hasContent = Boolean(text.trim());
  const selectedProject = projects.find(p => p.id === parsed.projectId);

  // Web Speech API Voice Dictation
  function toggleVoice() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setVoiceNotice("Voice dictation is supported in Chrome, Edge, and Safari.");
      setTimeout(() => setVoiceNotice(""), 4000);
      return;
    }

    if (isListening) {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      setIsListening(false);
      setVoiceNotice("");
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = "en-US";
      recognition.continuous = false;
      recognition.interimResults = false;

      recognition.onstart = () => {
        setIsListening(true);
        setVoiceNotice("Listening... speak your task");
      };

      recognition.onresult = event => {
        const transcript = event.results[0][0].transcript;
        if (transcript) {
          setText(prev => (prev ? `${prev} ${transcript}` : transcript));
        }
        setIsListening(false);
        setVoiceNotice("");
      };

      recognition.onerror = () => {
        setIsListening(false);
        setVoiceNotice("");
      };

      recognition.onend = () => {
        setIsListening(false);
        setVoiceNotice("");
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch {
      setIsListening(false);
    }
  }

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
            placeholder={isListening ? "Listening... Speak now..." : "Quick-add task... e.g. “Prepare slide deck tomorrow !high #work @Design” (Press Enter)"}
            value={text}
            onChange={e => setText(e.target.value)}
          />
          <button
            type="button"
            className={`quick-add-voice-btn ${isListening ? "listening" : ""}`}
            onClick={toggleVoice}
            title={isListening ? "Stop listening" : "Voice dictation (Click to speak)"}
          >
            {isListening ? "🔴" : "🎙️"}
          </button>
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

        {voiceNotice && (
          <div className="voice-notice-bar" role="status" aria-live="polite">
            <span className="voice-notice-dot" />
            <span>{voiceNotice}</span>
          </div>
        )}

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
