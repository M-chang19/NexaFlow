function escapeCalendarText(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function utcTimestamp(date) {
  const parsed = new Date(date);
  if (!Number.isFinite(parsed.getTime())) throw new Error("A task has an invalid reminder time. Fix it before exporting the calendar.");
  return parsed.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function isValidCalendarDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

function calendarDate(date) {
  return date.replace(/-/g, "");
}

function nextDay(date) {
  const [year, month, day] = date.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return next.toISOString().slice(0, 10);
}

function foldLine(line) {
  const characters = [...line];
  const parts = [];
  let current = "";
  let bytes = 0;
  const encoder = new TextEncoder();
  for (const character of characters) {
    const characterBytes = encoder.encode(character).length;
    if (bytes + characterBytes > 73) {
      parts.push(current);
      current = character;
      bytes = characterBytes;
    } else {
      current += character;
      bytes += characterBytes;
    }
  }
  if (current) parts.push(current);
  return parts.join("\r\n ");
}

function makeEvent(lines) {
  return ["BEGIN:VEVENT", ...lines, "END:VEVENT"].map(foldLine).join("\r\n");
}

export function createCalendarFile(tasks) {
  const datedTasks = tasks.filter(task => task.status !== "done" && (task.dueDate || task.reminderAt || task.scheduledAt));
  if (!datedTasks.length) throw new Error("Add a due date, schedule, or reminder to a task before exporting calendar events.");
  if (datedTasks.some(task => task.dueDate && !isValidCalendarDate(task.dueDate))) {
    throw new Error("A task has an invalid due date. Fix it before exporting the calendar.");
  }

  const stamp = utcTimestamp(new Date());
  const events = datedTasks.flatMap(task => {
    const details = [task.details, task.dueDate ? `Due date: ${task.dueDate}` : "", task.scheduledAt ? `Focus block: ${task.estimatedMinutes || 25} minutes` : ""].filter(Boolean).join("\n");
    const eventId = String(task.id || crypto.randomUUID()).replace(/[^a-zA-Z0-9._-]/g, "-");
    const dueEvent = task.dueDate ? makeEvent([
      `UID:${eventId}-due@nexaflow`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${calendarDate(task.dueDate)}`,
      `DTEND;VALUE=DATE:${calendarDate(nextDay(task.dueDate))}`,
      `SUMMARY:${escapeCalendarText(task.title)}`,
      `DESCRIPTION:${escapeCalendarText(details)}`,
      "CATEGORIES:NexaFlow"
    ]) : null;
    const reminderEvent = task.reminderAt ? makeEvent([
      `UID:${eventId}-reminder@nexaflow`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${utcTimestamp(task.reminderAt)}`,
      `DTEND:${utcTimestamp(new Date(new Date(task.reminderAt).getTime() + 15 * 60 * 1000))}`,
      `SUMMARY:${escapeCalendarText(`Reminder: ${task.title}`)}`,
      `DESCRIPTION:${escapeCalendarText(details)}`,
      "CATEGORIES:NexaFlow,Reminder",
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      "DESCRIPTION:Task reminder",
      "TRIGGER:PT0S",
      "END:VALARM"
    ]) : null;
    const scheduleEvent = task.scheduledAt ? makeEvent([
      `UID:${eventId}-focus@nexaflow`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${utcTimestamp(task.scheduledAt)}`,
      `DTEND:${utcTimestamp(new Date(new Date(task.scheduledAt).getTime() + (task.estimatedMinutes || 25) * 60 * 1000))}`,
      `SUMMARY:${escapeCalendarText(`Focus: ${task.title}`)}`,
      `DESCRIPTION:${escapeCalendarText(details)}`,
      "CATEGORIES:NexaFlow,Focus"
    ]) : null;
    return [dueEvent, reminderEvent, scheduleEvent].filter(Boolean);
  });

  const calendarHeaders = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//NexaFlow//Task Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH"
  ].map(foldLine);
  return [...calendarHeaders, ...events, foldLine("END:VCALENDAR"), ""].join("\r\n");
}
