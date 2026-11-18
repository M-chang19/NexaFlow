// src/MarkdownViewer.jsx
// Lightweight, safe Markdown Renderer with interactive checklists

export function renderMarkdownToJSX(content = "") {
  if (!content) return null;

  const lines = content.split("\n");
  const elements = [];
  let inCodeBlock = false;
  let codeBuffer = [];
  let keyIndex = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Fenced Code Block
    if (line.trim().startsWith("```")) {
      if (inCodeBlock) {
        elements.push(
          <pre key={`code-${keyIndex++}`} className="md-code-block">
            <code>{codeBuffer.join("\n")}</code>
          </pre>
        );
        codeBuffer = [];
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeBuffer.push(line);
      continue;
    }

    // Headings
    if (line.startsWith("### ")) {
      elements.push(<h4 key={`h3-${keyIndex++}`} className="md-h3">{formatInline(line.slice(4))}</h4>);
      continue;
    }
    if (line.startsWith("## ")) {
      elements.push(<h3 key={`h2-${keyIndex++}`} className="md-h2">{formatInline(line.slice(3))}</h3>);
      continue;
    }
    if (line.startsWith("# ")) {
      elements.push(<h2 key={`h1-${keyIndex++}`} className="md-h1">{formatInline(line.slice(2))}</h2>);
      continue;
    }

    // Checklists: - [ ] or - [x]
    const checkMatch = line.match(/^(\s*)-\s*\[([ xX])\]\s*(.*)$/);
    if (checkMatch) {
      const isChecked = checkMatch[2].toLowerCase() === "x";
      const itemText = checkMatch[3];
      elements.push(
        <div key={`check-${keyIndex++}`} className={`md-checklist-item ${isChecked ? "checked" : ""}`}>
          <input type="checkbox" checked={isChecked} readOnly className="md-checkbox" />
          <span>{formatInline(itemText)}</span>
        </div>
      );
      continue;
    }

    // Bullet lists: - or *
    if (line.match(/^(\s*)[-*]\s+(.*)$/)) {
      const text = line.replace(/^(\s*)[-*]\s+/, "");
      elements.push(
        <li key={`li-${keyIndex++}`} className="md-list-item">
          {formatInline(text)}
        </li>
      );
      continue;
    }

    // Blockquote
    if (line.startsWith("> ")) {
      elements.push(
        <blockquote key={`quote-${keyIndex++}`} className="md-blockquote">
          {formatInline(line.slice(2))}
        </blockquote>
      );
      continue;
    }

    // Empty line
    if (!line.trim()) {
      elements.push(<div key={`br-${keyIndex++}`} className="md-spacer" />);
      continue;
    }

    // Standard paragraph
    elements.push(
      <p key={`p-${keyIndex++}`} className="md-paragraph">
        {formatInline(line)}
      </p>
    );
  }

  // Handle unclosed code block
  if (inCodeBlock && codeBuffer.length > 0) {
    elements.push(
      <pre key={`code-${keyIndex++}`} className="md-code-block">
        <code>{codeBuffer.join("\n")}</code>
      </pre>
    );
  }

  return <div className="markdown-body">{elements}</div>;
}

// Inline formatting helper (bold, italic, code)
function formatInline(text = "") {
  // Simple regex replacement for bold, italic, code
  const parts = [];
  let remaining = text;
  let partIndex = 0;

  while (remaining.length > 0) {
    // Inline code `code`
    const codeMatch = remaining.match(/`([^`]+)`/);
    // Bold **text**
    const boldMatch = remaining.match(/\*\*([^*]+)\*\*/);
    // Italic *text*
    const italicMatch = remaining.match(/\*([^*]+)\*/);

    const matches = [
      codeMatch ? { type: "code", match: codeMatch, index: codeMatch.index } : null,
      boldMatch ? { type: "bold", match: boldMatch, index: boldMatch.index } : null,
      italicMatch ? { type: "italic", match: italicMatch, index: italicMatch.index } : null
    ].filter(Boolean).sort((a, b) => a.index - b.index);

    if (matches.length === 0) {
      parts.push(remaining);
      break;
    }

    const first = matches[0];
    if (first.index > 0) {
      parts.push(remaining.slice(0, first.index));
    }

    if (first.type === "code") {
      parts.push(<code key={`ic-${partIndex++}`} className="md-inline-code">{first.match[1]}</code>);
    } else if (first.type === "bold") {
      parts.push(<strong key={`ib-${partIndex++}`}>{first.match[1]}</strong>);
    } else if (first.type === "italic") {
      parts.push(<em key={`ii-${partIndex++}`}>{first.match[1]}</em>);
    }

    remaining = remaining.slice(first.index + first.match[0].length);
  }

  return parts;
}

export function MarkdownViewer({ content }) {
  return renderMarkdownToJSX(content);
}
