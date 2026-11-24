// src/naturalLanguage.js
// Smart Natural Language Task Parser

const pad = n => String(n).padStart(2, "0");

function toDateKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

const WEEKDAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const WEEKDAY_ABBR = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

export function parseNaturalLanguageTask(rawText, projects = []) {
  if (!rawText || !rawText.trim()) {
    return { title: "", priority: "medium", tags: [], dueDate: "", projectId: "" };
  }

  let text = rawText.trim();
  let priority = "medium";
  const tags = [];
  let dueDate = "";
  let projectId = "";

  // 1. Extract Priority: !high, !urgent, !med, !medium, !low
  const priorityMatch = text.match(/(?:^|\s)!([a-zA-Z]+)(?=\s|$)/i);
  if (priorityMatch) {
    const p = priorityMatch[1].toLowerCase();
    if (["high", "urgent", "p1", "critical"].includes(p)) priority = "high";
    else if (["low", "minor", "p3"].includes(p)) priority = "low";
    else if (["med", "medium", "normal", "p2"].includes(p)) priority = "medium";
    text = text.replace(priorityMatch[0], " ");
  }

  // 2. Extract Tags: #tag
  const tagMatches = text.match(/(?:^|\s)#([a-zA-Z0-9_-]+)/g);
  if (tagMatches) {
    tagMatches.forEach(m => {
      const tag = m.trim().replace(/^#/, "");
      if (tag && !tags.includes(tag.toLowerCase())) {
        tags.push(tag.toLowerCase());
      }
    });
    text = text.replace(/(?:^|\s)#[a-zA-Z0-9_-]+/g, " ");
  }

  // 3. Extract Project: @projectName
  const projectMatch = text.match(/(?:^|\s)@([a-zA-Z0-9_ -]+?)(?=\s[!#]|$)/);
  if (projectMatch && projects && projects.length > 0) {
    const rawProj = projectMatch[1].trim().toLowerCase();
    const found = projects.find(p => p.name.toLowerCase() === rawProj || p.name.toLowerCase().startsWith(rawProj));
    if (found) {
      projectId = found.id;
      text = text.replace(projectMatch[0], " ");
    }
  }

  // 4. Extract Due Dates
  const now = new Date();
  
  // "in X days"
  const inDaysMatch = text.match(/(?:^|\s)in\s+(\d+)\s+days?(?=\s|$)/i);
  if (inDaysMatch) {
    const days = parseInt(inDaysMatch[1], 10);
    const d = new Date(now);
    d.setDate(d.getDate() + days);
    dueDate = toDateKey(d);
    text = text.replace(inDaysMatch[0], " ");
  }

  // "today"
  if (!dueDate && /(?:^|\s)today(?=\s|$)/i.test(text)) {
    dueDate = toDateKey(now);
    text = text.replace(/(?:^|\s)today(?=\s|$)/i, " ");
  }

  // "tomorrow" / "tmrw"
  if (!dueDate && /(?:^|\s)(?:tomorrow|tmrw)(?=\s|$)/i.test(text)) {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    dueDate = toDateKey(d);
    text = text.replace(/(?:^|\s)(?:tomorrow|tmrw)(?=\s|$)/i, " ");
  }

  // "next week"
  if (!dueDate && /(?:^|\s)next\s+week(?=\s|$)/i.test(text)) {
    const d = new Date(now);
    d.setDate(d.getDate() + 7);
    dueDate = toDateKey(d);
    text = text.replace(/(?:^|\s)next\s+week(?=\s|$)/i, " ");
  }

  // Weekdays: e.g. "on friday", "friday", "next monday"
  if (!dueDate) {
    const dayMatch = text.match(/(?:^|\s)(?:on\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)(?=\s|$)/i);
    if (dayMatch) {
      const dayWord = dayMatch[1].toLowerCase();
      let targetDay = WEEKDAY_NAMES.indexOf(dayWord);
      if (targetDay === -1) targetDay = WEEKDAY_ABBR.indexOf(dayWord);

      if (targetDay !== -1) {
        const currentDay = now.getDay();
        let diff = targetDay - currentDay;
        if (diff <= 0) diff += 7; // next occurrence
        const d = new Date(now);
        d.setDate(d.getDate() + diff);
        dueDate = toDateKey(d);
        text = text.replace(dayMatch[0], " ");
      }
    }
  }

  // Explicit YYYY-MM-DD
  if (!dueDate) {
    const isoMatch = text.match(/(?:^|\s)(\d{4}-\d{2}-\d{2})(?=\s|$)/);
    if (isoMatch) {
      dueDate = isoMatch[1];
      text = text.replace(isoMatch[0], " ");
    }
  }

  // Clean title
  const title = text.replace(/\s+/g, " ").trim();

  return {
    title: title || rawText.trim(),
    priority,
    tags,
    dueDate,
    projectId
  };
}
