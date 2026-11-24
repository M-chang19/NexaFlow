// src/Gamification.jsx
// Productivity XP & Gamification Engine + Lightweight Canvas Confetti

export function triggerConfetti() {
  try {
    const canvas = document.createElement("canvas");
    canvas.style.position = "fixed";
    canvas.style.top = "0";
    canvas.style.left = "0";
    canvas.style.width = "100vw";
    canvas.style.height = "100vh";
    canvas.style.pointerEvents = "none";
    canvas.style.zIndex = "999999";
    document.body.appendChild(canvas);

    const ctx = canvas.getContext("2d");
    const width = (canvas.width = window.innerWidth);
    const height = (canvas.height = window.innerHeight);

    const colors = ["#4f46e5", "#06b6d4", "#10b981", "#f59e0b", "#ec4899", "#8b5cf6"];
    const particles = [];
    const count = 75;

    for (let i = 0; i < count; i++) {
      particles.push({
        x: width * (0.4 + Math.random() * 0.2),
        y: height * 0.65,
        vx: (Math.random() - 0.5) * 16,
        vy: -Math.random() * 18 - 6,
        size: Math.random() * 8 + 4,
        color: colors[Math.floor(Math.random() * colors.length)],
        rotation: Math.random() * 360,
        vr: (Math.random() - 0.5) * 12,
        opacity: 1
      });
    }

    let animationId;
    const start = performance.now();

    function render(time) {
      const elapsed = time - start;
      ctx.clearRect(0, 0, width, height);

      particles.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.42; // gravity
        p.vx *= 0.98; // drag
        p.rotation += p.vr;
        if (elapsed > 1200) {
          p.opacity = Math.max(0, 1 - (elapsed - 1200) / 800);
        }

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.opacity;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        ctx.restore();
      });

      if (elapsed < 2000) {
        animationId = requestAnimationFrame(render);
      } else {
        cancelAnimationFrame(animationId);
        if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
      }
    }

    animationId = requestAnimationFrame(render);
  } catch {
    // Canvas or animation not supported
  }
}

const RANKS = [
  "Apprentice",
  "Task Initiate",
  "Focus Strategist",
  "Deep Worker",
  "Flow Master",
  "Productivity Legend"
];

export function calculateProductivityXP(tasks = [], activity = [], notes = []) {
  let xp = 0;

  // Completed tasks: 20 XP each, +15 for high priority
  tasks.forEach(t => {
    if (t.status === "done") {
      xp += 20;
      if (t.priority === "high") xp += 15;
    }
  });

  // Notes: 10 XP each
  xp += (notes.length || 0) * 10;

  // Activity logged: 5 XP each (up to 50 items)
  xp += Math.min(50, (activity.length || 0)) * 5;

  // Level formula: level = floor(sqrt(xp / 60)) + 1
  const level = Math.floor(Math.sqrt(xp / 60)) + 1;
  const rank = RANKS[Math.min(RANKS.length - 1, level - 1)];

  // Current level threshold and next level threshold
  const currentThreshold = Math.pow(level - 1, 2) * 60;
  const nextThreshold = Math.pow(level, 2) * 60;
  const progressPercent = Math.min(
    100,
    Math.max(0, Math.round(((xp - currentThreshold) / (nextThreshold - currentThreshold)) * 100))
  );

  return {
    xp,
    level,
    rank,
    progressPercent,
    nextThreshold
  };
}

export function ProductivityLevelBadge({ tasks = [], activity = [], notes = [] }) {
  const stats = calculateProductivityXP(tasks, activity, notes);

  return (
    <div className="xp-level-badge card-surface" title={`Level ${stats.level}: ${stats.rank} (${stats.xp} XP total)`}>
      <div className="xp-badge-top">
        <span className="xp-badge-icon">⭐</span>
        <div className="xp-badge-info">
          <strong>Level {stats.level} • {stats.rank}</strong>
          <small>{stats.xp} / {stats.nextThreshold} XP</small>
        </div>
      </div>
      <div className="xp-progress-bar">
        <div className="xp-progress-fill" style={{ width: `${stats.progressPercent}%` }} />
      </div>
    </div>
  );
}
