#!/usr/bin/env node
/**
 * stats.js — Estimation accuracy report with per-model breakdown
 *
 * Usage: node stats.js [days]
 */

const fs = require("fs");
const path = require("path");
const os = require("os");

const TRACKER_DIR = path.join(os.homedir(), ".ai-estimation-tracker");
const days = parseInt(process.argv[2] || "30", 10);
const cutoff = Date.now() - days * 86400000;

let tasks = [];
try {
  for (const file of fs
    .readdirSync(TRACKER_DIR)
    .filter((f) => f.startsWith("task_") && f.endsWith(".json"))) {
    try {
      const data = JSON.parse(
        fs.readFileSync(path.join(TRACKER_DIR, file), "utf8")
      );
      if (data.start_ms >= cutoff) tasks.push(data);
    } catch (_) {}
  }
} catch (_) {
  console.log("No tracking data found yet.");
  process.exit(0);
}

tasks.sort((a, b) => (b.start_ms || 0) - (a.start_ms || 0));
const completed = tasks.filter((t) => t.status === "completed");
const withEst = completed.filter((t) => t.estimated_minutes > 0);

console.log("");
console.log("═══════════════════════════════════════════════");
console.log(`  AI Estimation Accuracy Report (last ${days} days)`);
console.log("═══════════════════════════════════════════════");
console.log("");
console.log(`  Tasks tracked:        ${tasks.length}`);
console.log(`  Tasks completed:      ${completed.length}`);
console.log(`  With AI estimates:    ${withEst.length}`);
console.log("");

if (!withEst.length) {
  console.log("  No tasks with estimates yet.");
  process.exit(0);
}

const sum = (a) => a.reduce((x, y) => x + y, 0);
const avg = (a) => (a.length ? sum(a) / a.length : 0);

const estimates = withEst.map((t) => t.estimated_minutes);
const actuals = withEst.map((t) => t.actual_minutes);
const accuracies = withEst.map((t) => t.estimation_accuracy || 0);
const locs = withEst.map((t) => (t.loc_added || 0) + (t.loc_removed || 0));

const under = withEst.filter((t) => t.estimation_accuracy < 0.9).length;
const over = withEst.filter((t) => t.estimation_accuracy > 1.1).length;
const accurate = withEst.length - under - over;

console.log("  ┌─────────────────────────────────────────┐");
console.log(`  │ Avg AI Estimate:     ${avg(estimates).toFixed(1)}m`);
console.log(`  │ Avg Actual Time:     ${avg(actuals).toFixed(1)}m`);
console.log(`  │ Accuracy Ratio:      ${avg(accuracies).toFixed(2)}x  (1.0 = perfect)`);
console.log(`  │ Total LOC Changed:   ${sum(locs)}`);
console.log("  ├─────────────────────────────────────────┤");
console.log(`  │ Underestimates:      ${under}  (AI too optimistic)`);
console.log(`  │ Overestimates:       ${over}  (AI too pessimistic)`);
console.log(`  │ Accurate (±10%):     ${accurate}`);
console.log("  └─────────────────────────────────────────┘");
console.log("");

// ─── Per-model ───
const byModel = {};
for (const t of withEst) {
  const m = t.model || "unknown";
  if (!byModel[m]) byModel[m] = [];
  byModel[m].push(t);
}

if (Object.keys(byModel).length > 1 || !byModel["unknown"]) {
  console.log("  Per-model breakdown:");
  console.log("  ─────────────────────────────────────────────────────────────────────");
  console.log("  Model                              Tasks  Avg Est  Avg Actual  Accuracy");
  console.log("  ─────────────────────────────────────────────────────────────────────");
  for (const [model, mt] of Object.entries(byModel).sort((a, b) => b[1].length - a[1].length)) {
    const name = model.length > 35 ? model.slice(0, 32) + "..." : model;
    console.log(
      `  ${name.padEnd(35)}  ${String(mt.length).padStart(5)}  ` +
        `${avg(mt.map((t) => t.estimated_minutes)).toFixed(1).padStart(7)}m  ` +
        `${avg(mt.map((t) => t.actual_minutes)).toFixed(1).padStart(9)}m  ` +
        `${avg(mt.map((t) => t.estimation_accuracy || 0)).toFixed(2).padStart(8)}x`
    );
  }
  console.log("");
}

// ─── Per-tool ───
const byTool = {};
for (const t of withEst) {
  const tool = t.tool || "unknown";
  if (!byTool[tool]) byTool[tool] = [];
  byTool[tool].push(t);
}

if (Object.keys(byTool).length > 1 || !byTool["unknown"]) {
  console.log("  Per-tool breakdown:");
  console.log("  ──────────────────────────────────────────────────");
  console.log("  Tool            Tasks  Avg Est  Avg Actual  Accuracy");
  console.log("  ──────────────────────────────────────────────────");
  for (const [tool, tt] of Object.entries(byTool).sort((a, b) => b[1].length - a[1].length)) {
    console.log(
      `  ${tool.padEnd(16)}  ${String(tt.length).padStart(5)}  ` +
        `${avg(tt.map((t) => t.estimated_minutes)).toFixed(1).padStart(7)}m  ` +
        `${avg(tt.map((t) => t.actual_minutes)).toFixed(1).padStart(9)}m  ` +
        `${avg(tt.map((t) => t.estimation_accuracy || 0)).toFixed(2).padStart(8)}x`
    );
  }
  console.log("");
}

// ─── Recent tasks ───
console.log("  Recent tasks:");
console.log("  ─────────────");
for (const t of withEst.slice(0, 5)) {
  const prompt = (t.prompt || "").slice(0, 40).padEnd(40);
  const model = (t.model || "?").slice(0, 20).padEnd(20);
  console.log(
    `  ${prompt}  ${model}  est=${t.estimated_minutes}m  actual=${t.actual_minutes}m`
  );
}
console.log("");
