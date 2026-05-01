import { useState, useEffect } from "react";
import { supabase } from "./supabase";

const TASKS = [
  "MECH DISTRI", "SOFT INSTAL", "TUBING", "BOMMING",
  "UBOLTS", "MODULE RAILS DISTRI", "MODRAIL INSTALLATION", "DAMPERS", "ALIGNMENT",
  "SWAGGING", "SPC", "MECH QA", "MECH REM"
];

const WORKFLOW_ORDER = {
  NORTH: ["B11", "B1", "B2", "B7", "B8", "B9", "B10", "B10", "B9", "B8", "B7", "B3", "B4", "B5", "B6"],
  SOUTH: ["B14", "B15", "B14", "B15", "B16", "B17", "B21", "B22", "B22", "B21", "B20", "B19", "B19", "B13", "B12", "B18"]
};

const uniqueBlocks = (zone) => [...new Set(WORKFLOW_ORDER[zone])];

const ZONE_COLOR = { NORTH: "#3B82F6", SOUTH: "#F59E0B" };

const LAYDOWN = {
  "B1": "LD1", "B2": "LD2",
  "B3": "LD3", "B4": "LD3", "B5": "LD3", "B6": "LD3",
  "B7": "LD4", "B8": "LD4", "B9": "LD4", "B10": "LD4", "B11": "LD4",
  "B12": "LD5", "B13": "LD5",
  "B18": "LD6",
  "B14": "LD7", "B15": "LD7",
  "B16": "LD8", "B17": "LD8", "B21": "LD8", "B22": "LD8",
  "B19": "LD9", "B20": "LD9",
};

const key = (zone, block, task) => `${zone}|${block}|${task}`;

export default function App() {
  const [checked, setChecked] = useState({});
  const [activeZone, setActiveZone] = useState("NORTH");
  const [expandedBlock, setExpandedBlock] = useState(null);
  const [view, setView] = useState("tracker");
  const [syncing, setSyncing] = useState(false);

  // Load all checks from Supabase on mount
  useEffect(() => {
    const loadData = async () => {
      const { data, error } = await supabase.from("workflow_checks").select("*");
      if (error) { console.error(error); return; }
      const map = {};
      data.forEach(row => { if (row.checked) map[row.id] = true; });
      setChecked(map);
    };
    loadData();

    // Real-time subscription — updates from other users
    const channel = supabase
      .channel("workflow_checks")
      .on("postgres_changes", { event: "*", schema: "public", table: "workflow_checks" }, (payload) => {
        const { new: newRow, old: oldRow, eventType } = payload;
        if (eventType === "DELETE") {
          setChecked(prev => { const next = { ...prev }; delete next[oldRow.id]; return next; });
        } else {
          setChecked(prev => ({ ...prev, [newRow.id]: newRow.checked }));
        }
      })
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  const toggle = async (k) => {
    const newVal = !checked[k];
    // Optimistic update
    setChecked(prev => ({ ...prev, [k]: newVal }));
    setSyncing(true);
    await supabase.from("workflow_checks").upsert({ id: k, checked: newVal, updated_at: new Date().toISOString() });
    setSyncing(false);
  };

  const isTaskDone = (zone, block, task) => {
    if (task === "MODULE RAILS DISTRI") {
      return !!checked[key(zone, block, "MODULE RAILS DISTRI")] ||
             !!checked[key(zone, block, "MODRAIL INSTALLATION")];
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

  const getTaskStatus = (zone, task) => {
    const slots = WORKFLOW_ORDER[zone];
    const uniqueSlots = [...new Set(slots)];
    const checkedUnique = uniqueSlots.filter(b => isTaskDone(zone, b, task));
    const allChecked = checkedUnique.length === uniqueSlots.length;
    let lastCheckedIdx = -1;
    for (let i = 0; i < uniqueSlots.length; i++) {
      if (isTaskDone(zone, uniqueSlots[i], task)) lastCheckedIdx = i;
    }
    const firstUncheckedIdx = uniqueSlots.findIndex(b => !isTaskDone(zone, b, task));
    if (lastCheckedIdx === -1) return { status: "notstarted", next: uniqueSlots[0], doneSoFar: 0, total: uniqueSlots.length };
    if (allChecked) return { status: "done" };
    return { status: "active", current: uniqueSlots[lastCheckedIdx], next: uniqueSlots[firstUncheckedIdx], doneSoFar: checkedUnique.length, total: uniqueSlots.length };
  };

  const color = ZONE_COLOR[activeZone];

  return (
    <div style={{ fontFamily: "'DM Sans', 'Segoe UI', sans-serif", background: "#0F172A", minHeight: "100vh", color: "#E2E8F0", paddingBottom: 60 }}>

      {/* Header */}
      <div style={{ background: "linear-gradient(135deg, #1E293B 0%, #0F172A 100%)", borderBottom: "1px solid #334155", padding: "20px 24px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 11, letterSpacing: 3, color: "#64748B", fontWeight: 700, marginBottom: 2 }}>WNSF SITE</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: "#F8FAFC" }}>Workflow Tracker</div>
              {syncing && <div style={{ fontSize: 10, color: "#64748B" }}>syncing...</div>}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setView("tracker")} style={{ padding: "7px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700, background: view === "tracker" ? "#3B82F6" : "#1E293B", color: view === "tracker" ? "#fff" : "#94A3B8" }}>TRACKER</button>
            <button onClick={() => setView("summary")} style={{ padding: "7px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700, background: view === "summary" ? "#3B82F6" : "#1E293B", color: view === "summary" ? "#fff" : "#94A3B8" }}>SUMMARY</button>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          {["NORTH", "SOUTH"].map(zone => (
            <button key={zone} onClick={() => { setActiveZone(zone); setExpandedBlock(null); }} style={{ flex: 1, padding: "10px 0", borderRadius: 10, border: "none", cursor: "pointer", background: activeZone === zone ? ZONE_COLOR[zone] : "#1E293B", color: activeZone === zone ? "#fff" : "#64748B", fontWeight: 800, fontSize: 13, letterSpacing: 1, transition: "all 0.2s" }}>
              {zone}
              <div style={{ fontSize: 18, fontWeight: 900, marginTop: 2 }}>{pct(zone)}%</div>
              <div style={{ fontSize: 10, fontWeight: 600, opacity: 0.8 }}>{doneCells(zone)}/{totalCells(zone)} tasks</div>
            </button>
          ))}
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
                      <span style={{ fontWeight: 700, fontSize: 14 }}>{block} {LAYDOWN[block] && <span style={{ fontSize: 10, color: "#EF4444", fontWeight: 900 }}>{LAYDOWN[block]}</span>}</span>
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
                          <div key={task} onClick={() => !isAuto && toggle(k)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 8, cursor: isAuto ? "default" : "pointer", background: taskDone ? "#14532D" : "#1E293B", border: `1px solid ${taskDone ? "#16A34A" : "#334155"}`, opacity: isAuto ? 0.7 : 1, transition: "all 0.15s" }}>
                            <div style={{ width: 18, height: 18, borderRadius: 5, flexShrink: 0, background: taskDone ? "#16A34A" : "transparent", border: `2px solid ${taskDone ? "#16A34A" : "#475569"}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "#fff" }}>{taskDone ? (isAuto ? "A" : "✓") : ""}</div>
                            <span style={{ fontSize: 10, fontWeight: 700, color: taskDone ? "#4ADE80" : "#94A3B8", letterSpacing: 0.5, lineHeight: 1.2 }}>{task}{isAuto ? " (auto)" : ""}</span>
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

          {/* MOVING TO SOUTH */}
          {(() => {
            const transitioning = TASKS.filter(task => getTaskStatus("NORTH", task).status === "done" && getTaskStatus("SOUTH", task).status === "notstarted");
            if (transitioning.length === 0) return null;
            const northColor = ZONE_COLOR["NORTH"];
            const southColor = ZONE_COLOR["SOUTH"];
            const lastNorth = uniqueBlocks("NORTH").slice(-1)[0];
            const firstSouth = uniqueBlocks("SOUTH")[0];
            return (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, letterSpacing: 2, color: "#A855F7", fontWeight: 700, marginBottom: 10, paddingLeft: 2 }}>🔄 MOVING TO SOUTH</div>
                {transitioning.map(task => (
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
                ))}
              </div>
            );
          })()}

          {/* Per task NOW/NEXT */}
          {["NORTH", "SOUTH"].map(zone => {
            const zcolor = ZONE_COLOR[zone];
            return (
              <div key={zone} style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, letterSpacing: 2, color: zcolor, fontWeight: 700, marginBottom: 10, paddingLeft: 2 }}>{zone} — PER TASK</div>
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

          {/* Blocks to go */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, letterSpacing: 2, color: "#94A3B8", fontWeight: 700, marginBottom: 10, paddingLeft: 2 }}>BLOCKS TO GO — PER TASK</div>
            {TASKS.map(task => {
              const allSlots = [...WORKFLOW_ORDER["NORTH"].map(b => ({ block: b, zone: "NORTH" })), ...WORKFLOW_ORDER["SOUTH"].map(b => ({ block: b, zone: "SOUTH" }))];
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
                    <span style={{ fontWeight: 900, fontSize: 13, color: allDone ? "#4ADE80" : "#F8FAFC" }}>{allDone ? "✅" : "⚙️"} {task}</span>
                    {allDone ? <span style={{ fontSize: 11, color: "#4ADE80", fontWeight: 700 }}>ALL DONE</span> : <span style={{ fontSize: 11, color: "#64748B", fontWeight: 600 }}>{remaining.length} block{remaining.length > 1 ? "s" : ""} left</span>}
                  </div>
                  {!allDone && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {remaining.map(({ block, zone }, i) => (
                        <div key={block + zone + i} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <span style={{ padding: "4px 10px", borderRadius: 6, fontSize: 12, fontWeight: 800, background: zone === "NORTH" ? "#1D4ED822" : "#B4530922", color: zone === "NORTH" ? "#3B82F6" : "#F59E0B", border: `1px solid ${zone === "NORTH" ? "#3B82F6" : "#F59E0B"}55` }}>{block}</span>
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
  );
}
