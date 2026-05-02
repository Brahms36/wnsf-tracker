import { useState, useEffect } from “react”;
import { supabase } from “./supabase”;

const TASKS = [
“MECH DISTRI”, “SOFT INSTAL”, “TUBING”, “BOMMING”,
“UBOLTS”, “MODULE RAILS DISTRI”, “MODRAIL INSTALLATION”, “DAMPERS”, “ALIGNMENT”,
“SWAGGING”, “SPC”, “MECH QA”, “MECH REM”
];

const WORKFLOW_ORDER = {
NORTH: [
“B11”, “B1”, “B2”, “B7”, “B8”, “B9”, “B10”,
“B10”, “B9”, “B8”, “B7”,
“B3”, “B4”, “B5”, “B6”
],
SOUTH: [
“B14”, “B15”, “B14”, “B15”,
“B16”, “B17”,
“B21”, “B22”, “B22”, “B21”,
“B20”, “B19”, “B19”,
“B13”, “B12”, “B18”
]
};

// Deduplicated block list for tracker display
const uniqueBlocks = (zone) => […new Set(WORKFLOW_ORDER[zone])];

const ZONE_COLOR = { NORTH: “#3B82F6”, SOUTH: “#F59E0B” };

const LAYDOWN = {
“B1”: “LD1”, “B2”: “LD2”,
“B3”: “LD3”, “B4”: “LD3”, “B5”: “LD3”, “B6”: “LD3”,
“B7”: “LD4”, “B8”: “LD4”, “B9”: “LD4”, “B10”: “LD4”, “B11”: “LD4”,
“B12”: “LD5”, “B13”: “LD5”,
“B18”: “LD6”,
“B14”: “LD7”, “B15”: “LD7”,
“B16”: “LD8”, “B17”: “LD8”, “B21”: “LD8”, “B22”: “LD8”,
“B19”: “LD9”, “B20”: “LD9”,
};

const key = (zone, block, task) => `${zone}|${block}|${task}`;

export default function App() {
const [checked, setChecked] = useState({});
const [activeZone, setActiveZone] = useState(“NORTH”);
const [expandedBlock, setExpandedBlock] = useState(null);
const [view, setView] = useState(“tracker”);
const [focus, setFocus] = useState(”- Quality over quantity\n- Check the trenches\n- Follow the workflow\n⚠️ Workflow change — B20 before B19, ground too wet\n\n*REMINDER BEFORE THE RAIN*\n- All rubbish secured\n- All Bins closed. Big one with lid too (@~B. has a tool for it)\n- Hydraulic pumps covered with tarp or big cyclone bag\n- Dampers boxes opened to be closed off with tarp under the lid\n- Dampers distributed on the field to be installed\n- All tools inside containers\n- All buggies tray empty : nothing that could potentially fly away to be left out including rubbish”);
const [editingFocus, setEditingFocus] = useState(false);
const [focusDraft, setFocusDraft] = useState(””);

const [syncing, setSyncing] = useState(false);

useEffect(() => {
// Load checks
const loadData = async () => {
const { data } = await supabase.from(“workflow_checks”).select(”*”);
if (data) {
const map = {};
data.forEach(row => { if (row.checked) map[row.id] = true; });
setChecked(map);
}
};
loadData();

```
// Load focus
const loadFocus = async () => {
  const { data } = await supabase.from("workflow_checks").select("*").eq("id", "FOCUS_TODAY").single();
  if (data && data.checked === false && data.updated_at) {
    // focus text stored in id field workaround - use a dedicated approach
  }
};

// Load focus from special key
const loadFocusText = async () => {
  const { data } = await supabase.from("workflow_focus").select("*").eq("id", "main").single();
  if (data) setFocus(data.text);
};
loadFocusText();

// Real-time checks
const channel = supabase.channel("workflow_checks")
  .on("postgres_changes", { event: "*", schema: "public", table: "workflow_checks" }, (payload) => {
    const { new: newRow, eventType } = payload;
    if (eventType === "DELETE") {
      setChecked(prev => { const next = { ...prev }; delete next[payload.old.id]; return next; });
    } else {
      setChecked(prev => ({ ...prev, [newRow.id]: newRow.checked }));
    }
  }).subscribe();

// Real-time focus
const focusChannel = supabase.channel("workflow_focus")
  .on("postgres_changes", { event: "*", schema: "public", table: "workflow_focus" }, (payload) => {
    if (payload.new) setFocus(payload.new.text);
  }).subscribe();

return () => { supabase.removeChannel(channel); supabase.removeChannel(focusChannel); };
```

}, []);

const toggle = async (k) => {
const newVal = !checked[k];
setChecked(prev => ({ …prev, [k]: newVal }));
setSyncing(true);
await supabase.from(“workflow_checks”).upsert({ id: k, checked: newVal, updated_at: new Date().toISOString() });
setSyncing(false);
};

const saveFocus = async () => {
setFocus(focusDraft);
setEditingFocus(false);
await supabase.from(“workflow_focus”).upsert({ id: “main”, text: focusDraft, updated_at: new Date().toISOString() });
};

const isTaskDone = (zone, block, task) => {
if (task === “MODULE RAILS DISTRI”) {
return !!checked[key(zone, block, “MODULE RAILS DISTRI”)] ||
!!checked[key(zone, block, “MODRAIL INSTALLATION”)];
}
return !!checked[key(zone, block, task)];
};

const blockProgress = (zone, block) => {
let done = 0;
TASKS.forEach(t => { if (isTaskDone(zone, block, t)) done++; });
return { done, total: TASKS.length };
};

const totalCells = (zone) => uniqueBlocks(zone).length * TASKS.length;
const doneCells = (zone) => {
let count = 0;
uniqueBlocks(zone).forEach(block => {
TASKS.forEach(task => { if (isTaskDone(zone, block, task)) count++; });
});
return count;
};
const pct = (zone) => totalCells(zone) === 0 ? 0 : Math.round((doneCells(zone) / totalCells(zone)) * 100);

// Summary logic:
// - NOT STARTED: nothing checked
// - HERE NOW: last checked block (even if it’s the last in workflow)
// - DONE: only when the block AFTER the last one in workflow is validated
//   i.e. we add a virtual “COMPLETE” signal — task is done only if ALL blocks checked
//   AND user has explicitly moved past the last block (checked a south block if north, etc)
//   Simpler: DONE only when every single block in this zone is checked
const getTaskStatus = (zone, task) => {
const slots = WORKFLOW_ORDER[zone];
// Use unique blocks only for checking done/notstarted
const uniqueSlots = […new Set(slots)];
const checkedUnique = uniqueSlots.filter(b => isTaskDone(zone, b, task));
const allChecked = checkedUnique.length === uniqueSlots.length;

```
// Find last checked unique block (in workflow order)
let lastCheckedIdx = -1;
for (let i = 0; i < uniqueSlots.length; i++) {
  if (isTaskDone(zone, uniqueSlots[i], task)) lastCheckedIdx = i;
}

// Find first unchecked unique block
const firstUncheckedIdx = uniqueSlots.findIndex(b => !isTaskDone(zone, b, task));

// Nothing checked
if (lastCheckedIdx === -1) return {
  status: "notstarted", next: uniqueSlots[0],
  doneSoFar: 0, total: uniqueSlots.length
};

// All unique blocks checked = DONE
if (allChecked) return { status: "done" };

// HERE NOW = last checked unique block, NEXT = first unchecked unique block
return {
  status: "active",
  current: uniqueSlots[lastCheckedIdx],
  next: uniqueSlots[firstUncheckedIdx],
  doneSoFar: checkedUnique.length,
  total: uniqueSlots.length
};
```

};

const color = ZONE_COLOR[activeZone];

return (
<div style={{ fontFamily: “‘DM Sans’, ‘Segoe UI’, sans-serif”, background: “#0F172A”, minHeight: “100vh”, color: “#E2E8F0”, paddingBottom: 60 }}>

```
  {/* Header */}
  <div style={{ background: "linear-gradient(135deg, #1E293B 0%, #0F172A 100%)", borderBottom: "1px solid #334155", padding: "20px 24px 16px" }}>
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
      <div>
        <div style={ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 4 }>
          <img src="data:image/png;base64,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" alt="Pilecom" style={ height: 28, objectFit: "contain" } />
          <div style={ fontSize: 11, letterSpacing: 3, color: "#F59E0B", fontWeight: 900 }>WNSF</div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={() => setView("tracker")} style={{ padding: "7px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700, background: view === "tracker" ? "#3B82F6" : "#1E293B", color: view === "tracker" ? "#fff" : "#94A3B8" }}>TRACKER</button>
        <button onClick={() => setView("summary")} style={{ padding: "7px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700, background: view === "summary" ? "#3B82F6" : "#1E293B", color: view === "summary" ? "#fff" : "#94A3B8" }}>SUMMARY</button>
      </div>
    </div>

    <div style={{ display: "flex", gap: 10 }}>
      {["NORTH", "SOUTH"].map(zone => (
        <button key={zone} onClick={() => { setActiveZone(zone); setExpandedBlock(null); }} style={{
          flex: 1, padding: "10px 0", borderRadius: 10, border: "none", cursor: "pointer",
          background: activeZone === zone ? ZONE_COLOR[zone] : "#1E293B",
          color: activeZone === zone ? "#fff" : "#64748B",
          fontWeight: 800, fontSize: 13, letterSpacing: 1, transition: "all 0.2s"
        }}>
          {zone}
          <div style={{ fontSize: 18, fontWeight: 900, marginTop: 2 }}>{pct(zone)}%</div>
          <div style={{ fontSize: 10, fontWeight: 600, opacity: 0.8 }}>{doneCells(zone)}/{totalCells(zone)} tasks</div>
        </button>
      ))}
    </div>

    {/* MAIN FOCUS TODAY */}
    <div style={{ marginTop: 14, background: "#0F172A", borderRadius: 12, padding: "14px 16px", border: "1px solid #F59E0B44" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: editingFocus ? 10 : 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 14 }}>🎯</span>
          <span style={{ fontSize: 10, letterSpacing: 2, color: "#F59E0B", fontWeight: 800 }}>MAIN FOCUS TODAY</span>
        </div>
        {!editingFocus
          ? <button onClick={() => { setFocusDraft(focus); setEditingFocus(true); }} style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid #334155", background: "#1E293B", color: "#94A3B8", fontSize: 10, fontWeight: 700, cursor: "pointer" }}>EDIT</button>
          : <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => setEditingFocus(false)} style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid #334155", background: "#1E293B", color: "#94A3B8", fontSize: 10, fontWeight: 700, cursor: "pointer" }}>CANCEL</button>
              <button onClick={saveFocus} style={{ padding: "4px 10px", borderRadius: 6, border: "none", background: "#F59E0B", color: "#000", fontSize: 10, fontWeight: 800, cursor: "pointer" }}>SAVE</button>
            </div>
        }
      </div>
      {!editingFocus
        ? <div style={{ fontSize: 13, color: "#F8FAFC", lineHeight: 1.8, whiteSpace: "pre-line" }}>{focus}</div>
        : <textarea value={focusDraft} onChange={e => setFocusDraft(e.target.value)} rows={4} style={{ width: "100%", background: "#1E293B", border: "1px solid #F59E0B", borderRadius: 8, color: "#F8FAFC", fontSize: 12, padding: 10, resize: "vertical", fontFamily: "inherit", lineHeight: 1.8 }} />
      }
    </div>
  </div>

  {/* TRACKER VIEW */}
  {view === "tracker" && (
    <div style={{ padding: 16 }}>
      {uniqueBlocks(activeZone).map(block => {
        const { done, total } = blockProgress(activeZone, block);
        const prog = Math.round((done / total) * 100);
        const isOpen = expandedBlock === block;
        const blockDone = total > 0 && done === total;

        return (
          <div key={block} style={{ marginBottom: 10, borderRadius: 14, overflow: "hidden", border: `1px solid ${blockDone ? "#166534" : "#334155"}`, background: blockDone ? "#052E16" : "#1E293B" }}>
            <div onClick={() => setExpandedBlock(isOpen ? null : block)} style={{ padding: "14px 16px", cursor: "pointer", display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 44, height: 44, borderRadius: 10, background: blockDone ? "#16A34A" : color, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 13, color: "#fff", flexShrink: 0 }}>
                <span>{block}</span>
                {LAYDOWN[block] && <span style={{ fontSize: 8, color: "#FCA5A5", fontWeight: 900, lineHeight: 1 }}>{LAYDOWN[block]}</span>}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontWeight: 700, fontSize: 14 }}>
                    {block}
                    {LAYDOWN[block] && <span style={{ fontSize: 10, color: "#EF4444", fontWeight: 900, marginLeft: 6 }}>{LAYDOWN[block]}</span>}
                  </span>
                  <span style={{ fontSize: 12, color: blockDone ? "#4ADE80" : "#94A3B8", fontWeight: 700 }}>{prog}%</span>
                </div>
                <div style={{ height: 6, background: "#0F172A", borderRadius: 99, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${prog}%`, background: blockDone ? "#16A34A" : color, borderRadius: 99, transition: "width 0.3s" }} />
                </div>
                <div style={{ fontSize: 11, color: "#64748B", marginTop: 4 }}>{done}/{total} tasks completed</div>
              </div>
              <div style={{ color: "#64748B", fontSize: 18 }}>{isOpen ? "▲" : "▼"}</div>
            </div>

            {isOpen && (
              <div style={{ borderTop: "1px solid #334155", padding: "12px 16px", background: "#0F172A" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                  {TASKS.map(task => {
                    const k = key(activeZone, block, task);
                    const taskDone = isTaskDone(activeZone, block, task);
                    const isAuto = task === "MODULE RAILS DISTRI" && !checked[k] && taskDone;
                    return (
                      <div key={task} onClick={() => !isAuto && toggle(k)} style={{
                        display: "flex", alignItems: "center", gap: 8, padding: "8px 10px",
                        borderRadius: 8, cursor: isAuto ? "default" : "pointer",
                        background: taskDone ? "#14532D" : "#1E293B",
                        border: `1px solid ${taskDone ? "#16A34A" : "#334155"}`,
                        opacity: isAuto ? 0.7 : 1, transition: "all 0.15s"
                      }}>
                        <div style={{
                          width: 18, height: 18, borderRadius: 5, flexShrink: 0,
                          background: taskDone ? "#16A34A" : "transparent",
                          border: `2px solid ${taskDone ? "#16A34A" : "#475569"}`,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 11, color: "#fff"
                        }}>{taskDone ? (isAuto ? "A" : "✓") : ""}</div>
                        <span style={{ fontSize: 10, fontWeight: 700, color: taskDone ? "#4ADE80" : "#94A3B8", letterSpacing: 0.5, lineHeight: 1.2 }}>
                          {task}{isAuto ? " (auto)" : ""}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  )}

  {/* SUMMARY VIEW */}
  {view === "summary" && (
    <div style={{ padding: 16 }}>

      {/* Overall progress */}
      <div style={{ background: "#1E293B", borderRadius: 14, padding: 20, marginBottom: 14, border: "1px solid #334155" }}>
        <div style={{ fontSize: 11, letterSpacing: 2, color: "#64748B", fontWeight: 700, marginBottom: 16 }}>OVERALL PROGRESS</div>
        {["NORTH", "SOUTH"].map(zone => (
          <div key={zone} style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontWeight: 800, color: ZONE_COLOR[zone], fontSize: 13 }}>{zone}</span>
              <span style={{ fontWeight: 900, fontSize: 16, color: "#F8FAFC" }}>{pct(zone)}%</span>
            </div>
            <div style={{ height: 10, background: "#0F172A", borderRadius: 99, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${pct(zone)}%`, background: ZONE_COLOR[zone], borderRadius: 99, transition: "width 0.4s" }} />
            </div>
            <div style={{ fontSize: 11, color: "#64748B", marginTop: 4 }}>{doneCells(zone)} / {totalCells(zone)} tasks</div>
          </div>
        ))}
      </div>

      {/* MOVING TO SOUTH — tasks done in North, not started in South */}
      {(() => {
        const transitioning = TASKS.filter(task => {
          const northStatus = getTaskStatus("NORTH", task);
          const southStatus = getTaskStatus("SOUTH", task);
          return northStatus.status === "done" && southStatus.status === "notstarted";
        });
        if (transitioning.length === 0) return null;
        const northColor = ZONE_COLOR["NORTH"];
        const southColor = ZONE_COLOR["SOUTH"];
        return (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, letterSpacing: 2, color: "#A855F7", fontWeight: 700, marginBottom: 10, paddingLeft: 2 }}>
              🔄 MOVING TO SOUTH
            </div>
            {transitioning.map(task => {
              const northSlots = [...new Set(WORKFLOW_ORDER["NORTH"])];
              const lastNorth = northSlots[northSlots.length - 1];
              const firstSouth = [...new Set(WORKFLOW_ORDER["SOUTH"])][0];
              return (
                <div key={task} style={{ marginBottom: 8, padding: "12px 14px", borderRadius: 12, background: "#1E293B", border: "1px solid #A855F755" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                    <span style={{ fontWeight: 900, fontSize: 14, color: "#F8FAFC" }}>🔄 {task}</span>
                    <span style={{ fontSize: 11, color: "#A855F7", fontWeight: 700 }}>NORTH ✅ → SOUTH</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ flex: 1, padding: "8px 12px", borderRadius: 8, background: "#0F172A", border: `2px solid ${northColor}` }}>
                      <div style={{ fontSize: 9, letterSpacing: 1.5, color: northColor, fontWeight: 700, marginBottom: 3 }}>✅ LAST NORTH</div>
                      <div style={{ fontSize: 18, fontWeight: 900, color: "#4ADE80" }}>{lastNorth}</div>
                      {LAYDOWN[lastNorth] && <div style={{ fontSize: 10, color: "#EF4444", fontWeight: 900, marginTop: 2 }}>{LAYDOWN[lastNorth]}</div>}
                    </div>
                    <div style={{ color: "#A855F7", fontSize: 20, fontWeight: 900 }}>→</div>
                    <div style={{ flex: 1, padding: "8px 12px", borderRadius: 8, background: "#0F172A", border: `2px solid ${southColor}` }}>
                      <div style={{ fontSize: 9, letterSpacing: 1.5, color: southColor, fontWeight: 700, marginBottom: 3 }}>🎯 FIRST SOUTH</div>
                      <div style={{ fontSize: 18, fontWeight: 900, color: southColor }}>{firstSouth}</div>
                      {LAYDOWN[firstSouth] && <div style={{ fontSize: 10, color: "#EF4444", fontWeight: 900, marginTop: 2 }}>{LAYDOWN[firstSouth]}</div>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* Per task — NOW / NEXT */}
      {["NORTH", "SOUTH"].map(zone => {
        const zcolor = ZONE_COLOR[zone];
        return (
          <div key={zone} style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, letterSpacing: 2, color: zcolor, fontWeight: 700, marginBottom: 10, paddingLeft: 2 }}>
              {zone} — PER TASK
            </div>
            {TASKS.map(task => {
              const status = getTaskStatus(zone, task);

              if (status.status === "done") return null;

              if (status.status === "notstarted") return (
                <div key={task} style={{ marginBottom: 6, padding: "10px 14px", borderRadius: 10, background: "#1E293B", border: "1px solid #334155", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontWeight: 800, fontSize: 13, color: "#64748B" }}>⏳ {task}</span>
                  <span style={{ fontSize: 11, color: "#64748B", fontWeight: 600 }}>NOT STARTED</span>
                </div>
              );

              const { current, next, doneSoFar, total } = status;
              const progress = Math.round((doneSoFar / total) * 100);

              return (
                <div key={task} style={{ marginBottom: 8, padding: "12px 14px", borderRadius: 12, background: "#1E293B", border: `1px solid ${zcolor}55` }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                    <span style={{ fontWeight: 900, fontSize: 14, color: "#F8FAFC" }}>⚙️ {task}</span>
                    <span style={{ fontSize: 11, color: "#64748B", fontWeight: 600 }}>{doneSoFar}/{total} · {progress}%</span>
                  </div>
                  <div style={{ height: 4, background: "#0F172A", borderRadius: 99, overflow: "hidden", marginBottom: 10 }}>
                    <div style={{ height: "100%", width: `${progress}%`, background: zcolor, borderRadius: 99 }} />
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ flex: 1, padding: "8px 12px", borderRadius: 8, background: "#0F172A", border: `2px solid ${zcolor}` }}>
                      <div style={{ fontSize: 9, letterSpacing: 1.5, color: zcolor, fontWeight: 700, marginBottom: 3 }}>📍 HERE NOW</div>
                      <div style={{ fontSize: 18, fontWeight: 900, color: "#F8FAFC" }}>{current}</div>
                      {LAYDOWN[current] && <div style={{ fontSize: 10, color: "#EF4444", fontWeight: 900, marginTop: 2 }}>{LAYDOWN[current]}</div>}
                    </div>
                    <div style={{ color: "#475569", fontSize: 20, fontWeight: 900 }}>→</div>
                    <div style={{ flex: 1, padding: "8px 12px", borderRadius: 8, background: "#0F172A", border: "1px solid #334155" }}>
                      <div style={{ fontSize: 9, letterSpacing: 1.5, color: "#64748B", fontWeight: 700, marginBottom: 3 }}>NEXT</div>
                      <div style={{ fontSize: 18, fontWeight: 900, color: "#94A3B8" }}>{next}</div>
                      {LAYDOWN[next] && <div style={{ fontSize: 10, color: "#EF4444", fontWeight: 900, marginTop: 2 }}>{LAYDOWN[next]}</div>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}

      {/* Blocks to go per task */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, letterSpacing: 2, color: "#94A3B8", fontWeight: 700, marginBottom: 10, paddingLeft: 2 }}>
          BLOCKS TO GO — PER TASK
        </div>
        {TASKS.map(task => {
          const allSlots = [
            ...WORKFLOW_ORDER["NORTH"].map(b => ({ block: b, zone: "NORTH" })),
            ...WORKFLOW_ORDER["SOUTH"].map(b => ({ block: b, zone: "SOUTH" })),
          ];
          const seen = new Set();
          const remaining = [];
          allSlots.forEach(({ zone, block }) => {
            const bkey = zone + block;
            if (seen.has(bkey)) return;
            seen.add(bkey);
            if (!isTaskDone(zone, block, task)) remaining.push({ block, zone });
          });
          const allDone = remaining.length === 0;

          return (
            <div key={task} style={{ marginBottom: 8, padding: "12px 14px", borderRadius: 12, background: "#1E293B", border: allDone ? "1px solid #166534" : "1px solid #334155" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: allDone ? 0 : 10 }}>
                <span style={{ fontWeight: 900, fontSize: 13, color: allDone ? "#4ADE80" : "#F8FAFC" }}>
                  {allDone ? "✅" : "⚙️"} {task}
                </span>
                {allDone
                  ? <span style={{ fontSize: 11, color: "#4ADE80", fontWeight: 700 }}>ALL DONE</span>
                  : <span style={{ fontSize: 11, color: "#64748B", fontWeight: 600 }}>{remaining.length} block{remaining.length > 1 ? "s" : ""} left</span>
                }
              </div>
              {!allDone && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {remaining.map(({ block, zone }, i) => (
                    <div key={block + zone + i} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <span style={{
                        padding: "4px 10px", borderRadius: 6, fontSize: 12, fontWeight: 800,
                        background: zone === "NORTH" ? "#1D4ED822" : "#B4530922",
                        color: zone === "NORTH" ? "#3B82F6" : "#F59E0B",
                        border: `1px solid ${zone === "NORTH" ? "#3B82F6" : "#F59E0B"}55`
                      }}>{block}</span>
                      {i < remaining.length - 1 && <span style={{ color: "#475569", fontSize: 12 }}>→</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  )}
</div>
```

);
}
