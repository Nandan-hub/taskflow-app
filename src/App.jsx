import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "taskflow_v3_tasks";
const THEME_KEY = "taskflow_theme";
const NOTIF_KEY = "taskflow_notified";

const PRIORITIES = {
  high:   { label: "High",   color: "#ff5050", bg: "rgba(255,80,80,0.12)",   icon: "▲" },
  medium: { label: "Medium", color: "#f5a623", bg: "rgba(245,166,35,0.12)",  icon: "●" },
  low:    { label: "Low",    color: "#00c48c", bg: "rgba(0,196,140,0.12)",   icon: "▼" },
};

const STAGES = [
  { id: "todo",       label: "To Do",       icon: "✦", color: "#6c63ff" },
  { id: "inprogress", label: "In Progress", icon: "◈", color: "#f5a623" },
  { id: "done",       label: "Done",        icon: "✔", color: "#00c48c" },
];

// ── Theme ──────────────────────────────────────────────────────────────────
function useTheme() {
  const [dark, setDark] = useState(() => localStorage.getItem(THEME_KEY) !== "light");
  const toggle = () => setDark(d => { localStorage.setItem(THEME_KEY, d ? "light" : "dark"); return !d; });
  return [dark, toggle];
}

function useTasks() {
  const [tasks, setTasks] = useState(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; } catch { return []; }
  });
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks)); } catch {}
  }, [tasks]);
  return [tasks, setTasks];
}

const th = (dark) => ({
  bg:      dark ? "#080a10" : "#f4f4f8",
  surface: dark ? "#0f1117" : "#ffffff",
  surface2:dark ? "#0a0c13" : "#f0f0f5",
  border:  dark ? "#1e2130" : "#e0e0ea",
  border2: dark ? "#2a2d3a" : "#d0d0de",
  text:    dark ? "#f0f0f0" : "#111120",
  text2:   dark ? "#888"    : "#666",
  text3:   dark ? "#555"    : "#999",
});

// ── Notifications ──────────────────────────────────────────────────────────
function useNotifications(tasks) {
  const requestPermission = useCallback(async () => {
    if ("Notification" in window && Notification.permission === "default") {
      await Notification.requestPermission();
    }
  }, []);

  useEffect(() => {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    const notified = JSON.parse(localStorage.getItem(NOTIF_KEY) || "{}");
    const now = new Date();

    tasks.forEach(task => {
      if (task.stage === "done" || !task.etaDate) return;
      const eta = new Date(`${task.etaDate}T${task.etaTime || "23:59"}`);
      const diff = eta - now;
      const tag30  = `${task.id}_30`;
      const tagDue = `${task.id}_due`;

      // 30-min warning: fire if within 25–35 min window
      if (diff > 0 && diff <= 35 * 60000 && diff >= 25 * 60000 && !notified[tag30]) {
        new Notification("⏰ TaskFlow — Due Soon", {
          body: `"${task.name}" is due in ~30 minutes.`,
          icon: "/favicon.ico",
        });
        notified[tag30] = true;
      }
      // At due time: fire within a 1-min window past due
      if (diff <= 0 && diff >= -60000 && !notified[tagDue]) {
        new Notification("🚨 TaskFlow — Task Due Now", {
          body: `"${task.name}" is due right now!`,
          icon: "/favicon.ico",
        });
        notified[tagDue] = true;
      }
    });

    localStorage.setItem(NOTIF_KEY, JSON.stringify(notified));
  }, [tasks]);

  return { requestPermission };
}

// ── AI Priority ────────────────────────────────────────────────────────────
async function fetchAIPriority(name, details, etaDate, etaTime) {
  const etaStr = etaDate
    ? `Due: ${etaDate}${etaTime ? " at " + etaTime : ""}. Today is ${new Date().toISOString().slice(0, 10)}.`
    : "No deadline set.";
  const prompt = `You are a task prioritization assistant. Given the task below, respond with ONLY a JSON object like: {"priority":"high"|"medium"|"low","reason":"one sentence"}.

Task: "${name}"
Details: "${details || "none"}"
${etaStr}`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 100,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const data = await res.json();
    const text = data.content?.find(b => b.type === "text")?.text || "";
    const clean = text.replace(/```json|```/g, "").trim();
    return JSON.parse(clean);
  } catch { return null; }
}

// ── Helpers ────────────────────────────────────────────────────────────────
const inp = (t) => ({
  width: "100%", padding: "10px 13px", background: t.surface2,
  border: `1px solid ${t.border}`, borderRadius: 9, color: t.text,
  fontFamily: "'DM Sans',sans-serif", fontSize: 14, outline: "none", boxSizing: "border-box",
});

function Field({ label, children, required, t, hint }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 7 }}>
        <label style={{ fontSize: 10, color: t.text2, letterSpacing: "1.2px", textTransform: "uppercase", fontFamily: "'Syne',sans-serif" }}>
          {label}{required && <span style={{ color: "#6c63ff", marginLeft: 3 }}>*</span>}
        </label>
        {hint && <span style={{ fontSize: 10, color: t.text3, fontStyle: "italic" }}>{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function calcDuration(startDate, startTime, endDate, endTime) {
  if (!startDate || !endDate) return null;
  const s = new Date(`${startDate}T${startTime || "00:00"}`);
  const e = new Date(`${endDate}T${endTime || "23:59"}`);
  const diff = e - s;
  if (diff <= 0) return null;
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(mins / 60);
  const days  = Math.floor(hours / 24);
  if (days > 0)  return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${mins % 60}m`;
  return `${mins}m`;
}

// ── Modal ──────────────────────────────────────────────────────────────────
function Modal({ task, mode, onClose, onSave, dark }) {
  const t = th(dark);
  const blank = { name: "", details: "", startDate: "", startTime: "", etaDate: "", etaTime: "", priority: "medium", blocker: "", updateText: "" };
  const [form, setForm] = useState(task ? { ...blank, ...task } : blank);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiReason, setAiReason] = useState(null);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const valid = mode === "blocker" || mode === "update" ? true : form.name.trim();

  const duration = calcDuration(form.startDate, form.startTime, form.etaDate, form.etaTime);

  const handleAI = async () => {
    setAiLoading(true); setAiReason(null);
    const result = await fetchAIPriority(form.name, form.details, form.etaDate, form.etaTime);
    if (result) { set("priority", result.priority); setAiReason(result.reason); }
    setAiLoading(false);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, backdropFilter: "blur(6px)" }}>
      <div style={{ background: t.surface, border: `1px solid ${t.border2}`, borderRadius: 18, padding: 32, width: 560, maxWidth: "93vw", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 30px 80px rgba(0,0,0,0.4)", animation: "popIn .2s ease" }}>
        <h2 style={{ margin: "0 0 24px", fontFamily: "'Syne',sans-serif", fontSize: 20, color: t.text, letterSpacing: "-0.5px" }}>
          {{ create: "✦ New Task", edit: "✎ Edit Task", blocker: "🚧 Add Blocker", update: "📝 Add Update" }[mode]}
        </h2>

        {["create", "edit"].includes(mode) && <>
          <Field label="Task Name" required t={t}>
            <input value={form.name} onChange={e => set("name", e.target.value)} placeholder="What needs to be done?" style={inp(t)} />
          </Field>
          <Field label="Details" t={t}>
            <textarea value={form.details} onChange={e => set("details", e.target.value)} placeholder="Describe the task…" rows={3} style={{ ...inp(t), resize: "vertical", lineHeight: 1.6 }} />
          </Field>

          {/* Time Window */}
          <div style={{ background: dark ? "rgba(108,99,255,0.06)" : "rgba(108,99,255,0.04)", border: `1px solid ${dark ? "rgba(108,99,255,0.2)" : "rgba(108,99,255,0.15)"}`, borderRadius: 12, padding: "16px", marginBottom: 16 }}>
            <div style={{ fontSize: 10, color: "#6c63ff", textTransform: "uppercase", letterSpacing: "1.2px", fontFamily: "'Syne',sans-serif", marginBottom: 12 }}>
              🕐 Time Window {duration && <span style={{ background: "rgba(108,99,255,0.2)", padding: "2px 8px", borderRadius: 20, marginLeft: 8, color: "#a89fff" }}>Duration: {duration}</span>}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
              <Field label="Start Date" t={t}>
                <input type="date" value={form.startDate || ""} onChange={e => set("startDate", e.target.value)} style={inp(t)} />
              </Field>
              <Field label="Start Time" t={t}>
                <input type="time" value={form.startTime || ""} onChange={e => set("startTime", e.target.value)} style={inp(t)} />
              </Field>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Field label="End Date (ETA)" t={t}>
                <input type="date" value={form.etaDate || ""} onChange={e => set("etaDate", e.target.value)} style={inp(t)} />
              </Field>
              <Field label="End Time (ETA)" t={t}>
                <input type="time" value={form.etaTime || ""} onChange={e => set("etaTime", e.target.value)} style={inp(t)} />
              </Field>
            </div>
          </div>

          {/* Priority + AI */}
          <Field label="Priority" t={t} hint={aiLoading ? "Asking AI…" : aiReason || "or let AI decide →"}>
            <div style={{ display: "flex", gap: 8 }}>
              <select value={form.priority} onChange={e => set("priority", e.target.value)} style={{ ...inp(t), flex: 1 }}>
                {Object.entries(PRIORITIES).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
              </select>
              <button onClick={handleAI} disabled={aiLoading || !form.name.trim()} style={{ padding: "10px 14px", background: aiLoading ? t.surface2 : "linear-gradient(135deg,#6c63ff,#9b5de5)", border: "none", borderRadius: 9, color: "#fff", fontFamily: "'Syne',sans-serif", fontSize: 12, fontWeight: 700, cursor: aiLoading || !form.name.trim() ? "not-allowed" : "pointer", opacity: aiLoading || !form.name.trim() ? 0.5 : 1, whiteSpace: "nowrap" }}>
                {aiLoading ? "…" : "✦ AI Pick"}
              </button>
            </div>
          </Field>
          {aiReason && (
            <div style={{ marginTop: -8, marginBottom: 16, padding: "8px 12px", background: "rgba(108,99,255,0.08)", borderRadius: 8, borderLeft: "2px solid #6c63ff" }}>
              <span style={{ fontSize: 11, color: "#a89fff" }}>✦ {aiReason}</span>
            </div>
          )}
        </>}

        {mode === "blocker" && <Field label="What's blocking this?" t={t}>
          <textarea value={form.blocker || ""} onChange={e => set("blocker", e.target.value)} placeholder="Describe the blocker…" rows={3} style={{ ...inp(t), resize: "vertical", lineHeight: 1.6 }} />
        </Field>}

        {mode === "update" && <Field label="Progress Update" t={t}>
          <textarea value={form.updateText || ""} onChange={e => set("updateText", e.target.value)} placeholder="What's the latest?" rows={3} style={{ ...inp(t), resize: "vertical", lineHeight: 1.6 }} />
        </Field>}

        <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
          <button disabled={!valid} onClick={() => { if (valid) { onSave(form); onClose(); } }}
            style={{ flex: 1, padding: "12px", background: "linear-gradient(135deg,#6c63ff,#9b5de5)", border: "none", borderRadius: 10, color: "#fff", fontFamily: "'Syne',sans-serif", fontSize: 13, fontWeight: 700, cursor: valid ? "pointer" : "not-allowed", opacity: valid ? 1 : 0.45, letterSpacing: ".5px" }}>
            {mode === "create" ? "CREATE TASK" : mode === "update" ? "ADD UPDATE" : "SAVE"}
          </button>
          <button onClick={onClose} style={{ padding: "12px 18px", background: "transparent", border: `1px solid ${t.border2}`, borderRadius: 10, color: t.text2, fontFamily: "'Syne',sans-serif", fontSize: 13, cursor: "pointer" }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ── TaskCard ───────────────────────────────────────────────────────────────
function TaskCard({ task, onMoveForward, onMoveBack, onEdit, onDelete, onAddUpdate, dark, completing }) {
  const t = th(dark);
  const [exp, setExp] = useState(false);
  const p = PRIORITIES[task.priority] || PRIORITIES.medium;

  const etaDateTime  = task.etaDate  ? new Date(`${task.etaDate}T${task.etaTime || "23:59"}`)   : null;
  const startDateTime = task.startDate ? new Date(`${task.startDate}T${task.startTime || "00:00"}`) : null;
  const overdue = etaDateTime && etaDateTime < new Date() && task.stage !== "done";
  const duration = calcDuration(task.startDate, task.startTime, task.etaDate, task.etaTime);

  const fmtDT = (date, time) => {
    if (!date) return null;
    const d = new Date(`${date}T${time || "00:00"}`);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) +
      (time ? " · " + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "");
  };

  const fmtTs = ts => new Date(ts).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

  // Progress % through time window
  const progress = (() => {
    if (!startDateTime || !etaDateTime || task.stage === "done") return null;
    const now = new Date();
    const total = etaDateTime - startDateTime;
    const elapsed = now - startDateTime;
    if (total <= 0) return null;
    return Math.min(100, Math.max(0, Math.round((elapsed / total) * 100)));
  })();

  return (
    <div style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: 13, padding: 16, transition: "border-color .2s, transform .2s, box-shadow .2s", animation: completing === task.id ? "completePulse .5s ease" : "slideIn .3s ease", borderLeft: `3px solid ${p.color}` }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = t.border2; e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = dark ? "0 8px 24px rgba(0,0,0,0.3)" : "0 8px 24px rgba(0,0,0,0.08)"; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = t.border; e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "none"; }}
    >
      {/* Top */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 5, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, padding: "1px 7px", borderRadius: 20, background: p.bg, color: p.color, fontFamily: "'Syne',sans-serif", fontWeight: 700, letterSpacing: ".4px" }}>{p.icon} {p.label}</span>
            <span style={{ fontFamily: "'Syne',sans-serif", fontSize: 14, fontWeight: 700, color: t.text, flex: 1 }}>{task.name}</span>
          </div>
          {task.details && <p style={{ margin: "0 0 8px", fontSize: 12, color: t.text2, lineHeight: 1.5, display: exp ? "block" : "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{task.details}</p>}

          {/* Time window bar */}
          {(task.startDate || task.etaDate) && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: t.text3, marginBottom: 4, fontFamily: "'DM Sans',sans-serif" }}>
                <span>🟢 {task.startDate ? fmtDT(task.startDate, task.startTime) : "No start"}</span>
                <span style={{ color: overdue ? "#ff5050" : t.text3 }}>{overdue ? "⚠ " : "🔴 "}{task.etaDate ? fmtDT(task.etaDate, task.etaTime) : "No end"}</span>
              </div>
              {progress !== null && (
                <div style={{ height: 4, background: t.surface2, borderRadius: 99, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${progress}%`, background: progress > 85 ? "#ff5050" : progress > 60 ? "#f5a623" : "#6c63ff", borderRadius: 99, transition: "width .4s ease" }} />
                </div>
              )}
              {duration && (
                <div style={{ fontSize: 10, color: "#a89fff", marginTop: 3 }}>⏱ Duration: {duration}{progress !== null ? ` · ${progress}% elapsed` : ""}</div>
              )}
            </div>
          )}

          <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
            {task.blocker && <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, background: "rgba(245,166,35,0.1)", color: "#f5a623" }}>🚧 Blocked</span>}
            {task.updates?.length > 0 && <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, background: dark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)", color: t.text2 }}>💬 {task.updates.length} update{task.updates.length > 1 ? "s" : ""}</span>}
          </div>
        </div>

        <div style={{ display: "flex", gap: 3, marginLeft: 8, flexShrink: 0 }}>
          {(task.details || task.blocker || task.updates?.length) ? <button onClick={() => setExp(!exp)} style={icBtn(t)}>{exp ? "▲" : "▼"}</button> : null}
          {task.stage !== "done" && <button onClick={() => onEdit(task)} style={icBtn(t)}>✎</button>}
          {task.stage !== "done" && <button onClick={() => onAddUpdate(task)} style={icBtn(t)} title="Add update">💬</button>}
          <button onClick={() => onDelete(task.id)} style={{ ...icBtn(t), color: "#ff5050" }}>✕</button>
        </div>
      </div>

      {/* Expanded */}
      {exp && <>
        {task.blocker && <div style={{ marginTop: 10, padding: "8px 12px", background: "rgba(245,166,35,0.08)", borderRadius: 8, borderLeft: "2px solid #f5a623" }}>
          <div style={{ fontSize: 10, color: "#f5a623", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 4, fontFamily: "'Syne',sans-serif" }}>Blocker</div>
          <div style={{ fontSize: 12, color: t.text2 }}>{task.blocker}</div>
        </div>}
        {task.updates?.length > 0 && <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 10, color: t.text3, textTransform: "uppercase", letterSpacing: "1px", marginBottom: 6, fontFamily: "'Syne',sans-serif" }}>Progress Updates</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {task.updates.map((u, i) => (
              <div key={i} style={{ padding: "8px 12px", background: dark ? "rgba(108,99,255,0.07)" : "rgba(108,99,255,0.05)", borderRadius: 8, borderLeft: "2px solid #6c63ff" }}>
                <div style={{ fontSize: 10, color: "#6c63ff", marginBottom: 3 }}>{fmtTs(u.ts)}</div>
                <div style={{ fontSize: 12, color: t.text2 }}>{u.text}</div>
              </div>
            ))}
          </div>
        </div>}
      </>}

      {/* Actions */}
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        {task.stage === "todo" && <button onClick={() => onMoveForward(task)} style={actBtn("#f5a623", "rgba(245,166,35,0.1)")}>→ Start Task</button>}
        {task.stage === "inprogress" && <>
          <button onClick={() => onMoveBack(task)} style={actBtn(t.text3, dark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)")}>← Back</button>
          <button onClick={() => onMoveForward(task)} style={actBtn("#00c48c", "rgba(0,196,140,0.1)")}>✓ Mark Done</button>
        </>}
        {task.stage === "done" && <button onClick={() => onMoveBack(task)} style={actBtn(t.text3, dark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)")}>← Reopen</button>}
      </div>
    </div>
  );
}

const icBtn  = (t) => ({ background: "transparent", border: "none", color: t.text3, cursor: "pointer", padding: "4px 6px", fontSize: 13, borderRadius: 6 });
const actBtn = (color, bg) => ({ flex: 1, padding: "8px", background: bg, border: `1px solid ${color}44`, borderRadius: 8, color, fontFamily: "'Syne',sans-serif", fontSize: 11, fontWeight: 700, cursor: "pointer", letterSpacing: ".5px" });

// ── Dashboard ──────────────────────────────────────────────────────────────
function Dashboard({ tasks, dark }) {
  const t = th(dark);
  const total   = tasks.length;
  const done    = tasks.filter(x => x.stage === "done").length;
  const inprog  = tasks.filter(x => x.stage === "inprogress").length;
  const todo    = tasks.filter(x => x.stage === "todo").length;
  const overdue = tasks.filter(x => { const d = x.etaDate ? new Date(`${x.etaDate}T${x.etaTime || "23:59"}`) : null; return d && d < new Date() && x.stage !== "done"; }).length;
  const blocked = tasks.filter(x => x.blocker && x.stage === "inprogress").length;
  const pCounts = { high: 0, medium: 0, low: 0 };
  tasks.forEach(x => { if (pCounts[x.priority] !== undefined) pCounts[x.priority]++; });
  const pct = total ? Math.round((done / total) * 100) : 0;

  const stat = (label, val, color, sub) => (
    <div style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: 12, padding: "16px 20px", display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ fontSize: 11, color: t.text2, textTransform: "uppercase", letterSpacing: "1px", fontFamily: "'Syne',sans-serif" }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 800, color, fontFamily: "'Syne',sans-serif" }}>{val}</div>
      {sub && <div style={{ fontSize: 11, color: t.text3 }}>{sub}</div>}
    </div>
  );

  return (
    <div style={{ marginBottom: 32 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 12, marginBottom: 16 }}>
        {stat("Total",       total,   t.text)}
        {stat("To Do",       todo,    "#6c63ff")}
        {stat("In Progress", inprog,  "#f5a623")}
        {stat("Done",        done,    "#00c48c", `${pct}% complete`)}
        {stat("Overdue",     overdue, "#ff5050")}
        {stat("Blocked",     blocked, "#f5a623")}
      </div>
      <div style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: 12, padding: "16px 20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
          <span style={{ fontSize: 12, color: t.text2, fontFamily: "'Syne',sans-serif", textTransform: "uppercase", letterSpacing: "1px" }}>Overall Progress</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: "#00c48c", fontFamily: "'Syne',sans-serif" }}>{pct}%</span>
        </div>
        <div style={{ height: 8, background: t.surface2, borderRadius: 99, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${pct}%`, background: "linear-gradient(90deg,#6c63ff,#00c48c)", borderRadius: 99, transition: "width .6s ease" }} />
        </div>
        <div style={{ display: "flex", gap: 16, marginTop: 12 }}>
          {Object.entries(pCounts).map(([k, v]) => {
            const p = PRIORITIES[k];
            return <div key={k} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: p.color, display: "inline-block" }} />
              <span style={{ fontSize: 11, color: t.text2 }}>{p.label}: {v}</span>
            </div>;
          })}
        </div>
      </div>
    </div>
  );
}

// ── Export ─────────────────────────────────────────────────────────────────
function exportCSV(tasks) {
  const headers = ["ID","Name","Details","Stage","Priority","Start Date","Start Time","End Date","End Time","Duration","Blocker","Created","Updates"];
  const rows = tasks.map(tk => [
    tk.id,
    `"${(tk.name||"").replace(/"/g,'""')}"`,
    `"${(tk.details||"").replace(/"/g,'""')}"`,
    tk.stage, tk.priority,
    tk.startDate||"", tk.startTime||"",
    tk.etaDate||"",   tk.etaTime||"",
    calcDuration(tk.startDate, tk.startTime, tk.etaDate, tk.etaTime) || "",
    `"${(tk.blocker||"").replace(/"/g,'""')}"`,
    new Date(tk.createdAt).toLocaleString(),
    `"${(tk.updates||[]).map(u=>`[${new Date(u.ts).toLocaleString()}] ${u.text}`).join(" | ").replace(/"/g,'""')}"`
  ].join(","));
  const blob = new Blob([[headers.join(","), ...rows].join("\n")], { type: "text/csv" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `taskflow-${Date.now()}.csv`; a.click();
}

function exportJSON(tasks) {
  const blob = new Blob([JSON.stringify(tasks, null, 2)], { type: "application/json" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `taskflow-${Date.now()}.json`; a.click();
}

// ── App ────────────────────────────────────────────────────────────────────
export default function App() {
  const [dark, toggleDark]   = useTheme();
  const [tasks, setTasks]    = useTasks();
  const [modal, setModal]    = useState(null);
  const [completing, setCompleting] = useState(null);
  const [sortBy, setSortBy]  = useState("created");
  const [showDash, setShowDash] = useState(true);
  const [notifStatus, setNotifStatus] = useState(() =>
    "Notification" in window ? Notification.permission : "unsupported"
  );
  const t = th(dark);
  const { requestPermission } = useNotifications(tasks);

  // Poll every minute to check notifications
  useEffect(() => {
    const id = setInterval(() => {}, 60000);
    return () => clearInterval(id);
  }, []);

  const handleEnableNotifs = async () => {
    await requestPermission();
    setNotifStatus(Notification.permission);
  };

  const sorted = (list) => {
    if (sortBy === "eta") return [...list].sort((a, b) => {
      const da = a.etaDate ? new Date(`${a.etaDate}T${a.etaTime || "23:59"}`) : null;
      const db = b.etaDate ? new Date(`${b.etaDate}T${b.etaTime || "23:59"}`) : null;
      if (!da && !db) return 0; if (!da) return 1; if (!db) return -1; return da - db;
    });
    if (sortBy === "priority") {
      const order = { high: 0, medium: 1, low: 2 };
      return [...list].sort((a, b) => (order[a.priority]||1) - (order[b.priority]||1));
    }
    return [...list].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  };

  const addTask    = (form) => setTasks(p => [...p, { id: Date.now().toString(), stage: "todo", name: form.name, details: form.details, startDate: form.startDate, startTime: form.startTime, etaDate: form.etaDate, etaTime: form.etaTime, priority: form.priority || "medium", blocker: "", updates: [], createdAt: new Date().toISOString() }]);
  const editTask   = (form) => setTasks(p => p.map(tk => tk.id === modal.task.id ? { ...tk, name: form.name, details: form.details, startDate: form.startDate, startTime: form.startTime, etaDate: form.etaDate, etaTime: form.etaTime, priority: form.priority, blocker: form.blocker } : tk));
  const deleteTask = (id)   => setTasks(p => p.filter(tk => tk.id !== id));

  const moveForward = (task) => {
    if (task.stage === "todo") {
      const eta = task.etaDate ? new Date(`${task.etaDate}T${task.etaTime || "23:59"}`) : null;
      if (eta && eta < new Date()) { setModal({ mode: "blocker", task }); }
      else { setTasks(p => p.map(tk => tk.id === task.id ? { ...tk, stage: "inprogress" } : tk)); }
    } else if (task.stage === "inprogress") {
      setCompleting(task.id);
      setTimeout(() => { setTasks(p => p.map(tk => tk.id === task.id ? { ...tk, stage: "done" } : tk)); setCompleting(null); }, 500);
    }
  };

  const moveBack    = (task) => setTasks(p => p.map(tk => tk.id === task.id ? { ...tk, stage: task.stage === "done" ? "inprogress" : "todo" } : tk));
  const saveBlocker = (form) => setTasks(p => p.map(tk => tk.id === modal.task.id ? { ...tk, stage: "inprogress", blocker: form.blocker } : tk));
  const addUpdate   = (form) => setTasks(p => p.map(tk => tk.id === modal.task.id ? { ...tk, updates: [...(tk.updates||[]), { ts: new Date().toISOString(), text: form.updateText }] } : tk));

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;700;800&family=DM+Sans:wght@400;500&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        body{background:${t.bg};transition:background .3s;}
        @keyframes slideIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes popIn{from{opacity:0;transform:scale(.95)}to{opacity:1;transform:scale(1)}}
        @keyframes completePulse{0%{transform:scale(1)}40%{transform:scale(1.03);border-color:#00c48c}100%{transform:scale(1)}}
        ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:${t.border2};border-radius:4px}
        select option{background:${t.surface};color:${t.text}}
      `}</style>

      <div style={{ minHeight: "100vh", background: t.bg, fontFamily: "'DM Sans',sans-serif", padding: "28px 20px", transition: "background .3s" }}>
        <div style={{ maxWidth: 1260, margin: "0 auto" }}>

          {/* Notification banner */}
          {notifStatus === "default" && (
            <div style={{ background: "rgba(108,99,255,0.1)", border: "1px solid rgba(108,99,255,0.3)", borderRadius: 10, padding: "10px 16px", marginBottom: 20, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <span style={{ fontSize: 13, color: "#a89fff" }}>🔔 Enable browser notifications to get due-date alerts (30 min before + at due time)</span>
              <button onClick={handleEnableNotifs} style={{ padding: "6px 14px", background: "linear-gradient(135deg,#6c63ff,#9b5de5)", border: "none", borderRadius: 8, color: "#fff", fontFamily: "'Syne',sans-serif", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Enable</button>
            </div>
          )}
          {notifStatus === "granted" && (
            <div style={{ background: "rgba(0,196,140,0.08)", border: "1px solid rgba(0,196,140,0.2)", borderRadius: 10, padding: "8px 16px", marginBottom: 20, fontSize: 12, color: "#00c48c" }}>
              ✔ Browser notifications active — you'll be alerted 30 min before and at due time
            </div>
          )}

          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28, flexWrap: "wrap", gap: 12 }}>
            <div>
              <h1 style={{ fontFamily: "'Syne',sans-serif", fontSize: 26, fontWeight: 800, color: t.text, letterSpacing: "-1px" }}>✦ TaskFlow</h1>
              <p style={{ color: t.text2, fontSize: 12, marginTop: 3 }}>{tasks.length} task{tasks.length !== 1 ? "s" : ""} · sorted by {sortBy}</p>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={{ ...inp(t), width: "auto", fontSize: 12, padding: "8px 12px" }}>
                <option value="created">Sort: Created</option>
                <option value="eta">Sort: ETA</option>
                <option value="priority">Sort: Priority</option>
              </select>
              <button onClick={() => setShowDash(d => !d)} style={{ padding: "8px 14px", background: showDash ? "rgba(108,99,255,0.15)" : t.surface, border: `1px solid ${showDash ? "#6c63ff" : t.border2}`, borderRadius: 9, color: showDash ? "#6c63ff" : t.text2, fontFamily: "'Syne',sans-serif", fontSize: 12, cursor: "pointer" }}>
                {showDash ? "▲ Dashboard" : "▼ Dashboard"}
              </button>
              <button onClick={() => exportCSV(tasks)}  style={{ padding: "8px 14px", background: t.surface, border: `1px solid ${t.border2}`, borderRadius: 9, color: t.text2, fontFamily: "'Syne',sans-serif", fontSize: 12, cursor: "pointer" }}>↓ CSV</button>
              <button onClick={() => exportJSON(tasks)} style={{ padding: "8px 14px", background: t.surface, border: `1px solid ${t.border2}`, borderRadius: 9, color: t.text2, fontFamily: "'Syne',sans-serif", fontSize: 12, cursor: "pointer" }}>↓ JSON</button>
              <button onClick={toggleDark} style={{ padding: "8px 14px", background: t.surface, border: `1px solid ${t.border2}`, borderRadius: 9, color: t.text2, fontFamily: "'Syne',sans-serif", fontSize: 14, cursor: "pointer" }}>{dark ? "☀" : "🌙"}</button>
              <button onClick={() => setModal({ mode: "create" })} style={{ padding: "10px 20px", background: "linear-gradient(135deg,#6c63ff,#9b5de5)", border: "none", borderRadius: 10, color: "#fff", fontFamily: "'Syne',sans-serif", fontSize: 13, fontWeight: 700, cursor: "pointer", boxShadow: "0 4px 18px rgba(108,99,255,0.35)", letterSpacing: ".4px" }}>
                + New Task
              </button>
            </div>
          </div>

          {showDash && <Dashboard tasks={tasks} dark={dark} />}

          {/* Columns */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 18 }}>
            {STAGES.map(stage => {
              const col = sorted(tasks.filter(tk => tk.stage === stage.id));
              return (
                <div key={stage.id}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, padding: "0 4px" }}>
                    <span style={{ color: stage.color, fontSize: 15 }}>{stage.icon}</span>
                    <span style={{ fontFamily: "'Syne',sans-serif", fontSize: 12, fontWeight: 700, color: t.text, letterSpacing: "1px", textTransform: "uppercase" }}>{stage.label}</span>
                    <span style={{ marginLeft: "auto", background: `${stage.color}22`, color: stage.color, borderRadius: 20, padding: "2px 10px", fontSize: 12, fontFamily: "'Syne',sans-serif", fontWeight: 700 }}>{col.length}</span>
                  </div>
                  <div style={{ background: t.surface2, border: `1px solid ${t.border}`, borderRadius: 14, padding: 12, minHeight: 380, display: "flex", flexDirection: "column", gap: 10 }}>
                    {col.length === 0 && <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 8 }}>
                      <span style={{ fontSize: 22, opacity: .15 }}>{stage.icon}</span>
                      <span style={{ color: t.text3, fontSize: 12 }}>No tasks here</span>
                    </div>}
                    {col.map(task => (
                      <TaskCard key={task.id} task={task} dark={dark} completing={completing}
                        onMoveForward={moveForward} onMoveBack={moveBack}
                        onEdit={tk => setModal({ mode: "edit", task: tk })}
                        onAddUpdate={tk => setModal({ mode: "update", task: tk })}
                        onDelete={deleteTask}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {modal?.mode === "create"  && <Modal mode="create"  dark={dark} onClose={() => setModal(null)} onSave={addTask} />}
      {modal?.mode === "edit"    && <Modal mode="edit"    task={modal.task} dark={dark} onClose={() => setModal(null)} onSave={editTask} />}
      {modal?.mode === "blocker" && <Modal mode="blocker" task={modal.task} dark={dark} onClose={() => setModal(null)} onSave={saveBlocker} />}
      {modal?.mode === "update"  && <Modal mode="update"  task={modal.task} dark={dark} onClose={() => setModal(null)} onSave={addUpdate} />}
    </>
  );
}