// src/ProductivityHeatmap.jsx
// GitHub-style productivity completion heatmap and streak tracker
import { useMemo, useState } from "react";

const pad = n => String(n).padStart(2, "0");
function toKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function ProductivityHeatmap({ tasks = [], activity = [] }) {
  const [hoveredDay, setHoveredDay] = useState(null);

  const stats = useMemo(() => {
    const today = new Date();
    const dayMap = new Map();

    // 1. Gather all completed task dates
    tasks.forEach(task => {
      if (task.status === "done") {
        const d = task.completedAt || task.updatedAt || task.createdAt;
        if (d) {
          const key = d.slice(0, 10);
          dayMap.set(key, (dayMap.get(key) || 0) + 1);
        }
      }
    });

    // 2. Also incorporate activity history
    activity.forEach(item => {
      if (item.createdAt) {
        const key = item.createdAt.slice(0, 10);
        // If not already counted from task, add fractional activity
        if (!dayMap.has(key)) {
          dayMap.set(key, 1);
        }
      }
    });

    // Build past 12 weeks (84 days)
    const days = [];
    const totalDays = 84;
    for (let i = totalDays - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = toKey(d);
      const count = dayMap.get(key) || 0;
      days.push({
        date: key,
        displayDate: d.toLocaleDateString(undefined, { month: "short", day: "numeric", weekday: "short" }),
        count,
        level: count === 0 ? 0 : count <= 2 ? 1 : count <= 4 ? 2 : 3
      });
    }

    // Calculate streaks
    let currentStreak = 0;
    let maxStreak = 0;
    let tempStreak = 0;

    for (let i = 0; i < days.length; i++) {
      if (days[i].count > 0) {
        tempStreak++;
        if (tempStreak > maxStreak) maxStreak = tempStreak;
      } else {
        tempStreak = 0;
      }
    }

    // Current streak working backwards from today
    for (let i = days.length - 1; i >= 0; i--) {
      if (days[i].count > 0) {
        currentStreak++;
      } else {
        // Allow today to still be 0 if yesterday had activity
        if (i === days.length - 1) continue;
        break;
      }
    }

    const totalCompletions = days.reduce((acc, d) => acc + d.count, 0);

    return {
      days,
      currentStreak,
      maxStreak,
      totalCompletions
    };
  }, [tasks, activity]);

  return (
    <section className="heatmap-card card-surface">
      <div className="heatmap-header">
        <div>
          <h3 className="section-title">Productivity Momentum</h3>
          <p className="section-sub">Last 12 weeks of completions and activity</p>
        </div>
        <div className="heatmap-streak-badges">
          <div className="streak-pill">
            <span className="streak-icon">🔥</span>
            <div>
              <strong>{stats.currentStreak} days</strong>
              <small>Current streak</small>
            </div>
          </div>
          <div className="streak-pill">
            <span className="streak-icon">⚡</span>
            <div>
              <strong>{stats.totalCompletions} done</strong>
              <small>Last 12 weeks</small>
            </div>
          </div>
        </div>
      </div>

      <div className="heatmap-grid-wrapper">
        <div className="heatmap-grid" role="region" aria-label="Activity heatmap">
          {stats.days.map(day => (
            <div
              key={day.date}
              className={`heatmap-cell level-${day.level}`}
              onMouseEnter={() => setHoveredDay(day)}
              onMouseLeave={() => setHoveredDay(null)}
              aria-label={`${day.displayDate}: ${day.count} contributions`}
            />
          ))}
        </div>
        {hoveredDay && (
          <div className="heatmap-tooltip">
            <strong>{hoveredDay.count} items completed</strong> on {hoveredDay.displayDate}
          </div>
        )}
      </div>

      <div className="heatmap-legend">
        <span>Less</span>
        <span className="heatmap-cell level-0" />
        <span className="heatmap-cell level-1" />
        <span className="heatmap-cell level-2" />
        <span className="heatmap-cell level-3" />
        <span>More</span>
      </div>
    </section>
  );
}
