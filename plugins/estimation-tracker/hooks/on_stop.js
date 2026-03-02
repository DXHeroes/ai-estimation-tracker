#!/usr/bin/env node
/**
 * on_stop.js — Stop hook
 *
 * Fires when the AI finishes responding. Computes:
 *   - actual wall-clock time (stop - start)
 *   - AI's human-time estimate (parsed from response)
 *   - model used (from transcript, hook input, or env vars)
 *   - tool used (claude-code vs cursor)
 *   - LOC changed (optional, only if git is available)
 *
 * Sends to OTEL via Node.js http/https. Falls back gracefully.
 * Zero dependencies. Cross-platform.
 */

const fs = require("fs");
const path = require("path");
const os = require("os");
const http = require("http");
const https = require("https");
const { execSync } = require("child_process");

const TRACKER_DIR = path.join(os.homedir(), ".ai-estimation-tracker");
const LOG_FILE = path.join(TRACKER_DIR, "tracker.log");

// ─── Helpers ───

function tryReadJson(fp) {
  try {
    return JSON.parse(fs.readFileSync(fp, "utf8"));
  } catch (_) {
    return null;
  }
}

/**
 * Convert a numeric value + unit string to minutes.
 * Supported units: m/min/mins/minutes, h/hr/hrs/hours, d/day/days.
 * No unit (legacy format) is treated as minutes.
 */
function toMinutes(value, unit) {
  if (!unit) return value;
  switch (unit.toLowerCase()) {
    case "m":
    case "min":
    case "mins":
    case "minutes":
      return value;
    case "h":
    case "hr":
    case "hrs":
    case "hours":
      return value * 60;
    case "d":
    case "day":
    case "days":
      return value * 8 * 60;
    default:
      return value;
  }
}

/**
 * Parse transcript for estimate and model.
 * Transcript is JSONL (Claude Code) or may not exist (Cursor).
 * Estimate is normalized to minutes.
 */
function parseTranscript(transcriptPath) {
  const result = { estimate: 0, model: "" };
  if (!transcriptPath) return result;

  try {
    const content = fs.readFileSync(transcriptPath, "utf8");

    // ─── Estimate (with optional unit suffix: m, h, d) ───
    const estMatch = content.match(
      /<!--\s*ESTIMATE:\s*(\d+(?:\.\d+)?)\s*(m|min|mins|minutes|h|hr|hrs|hours|d|day|days)?\s*-->/i
    );
    if (estMatch) {
      result.estimate = toMinutes(parseFloat(estMatch[1]), estMatch[2]);
    }

    // ─── Model from JSONL ───
    for (const line of content.split("\n")) {
      if (!line.trim()) continue;
      try {
        const obj = JSON.parse(line);
        const m =
          obj.model || obj.message?.model || obj.request?.model || "";
        if (m) {
          result.model = m;
          break;
        }
      } catch (_) {}
    }

    // Fallback: regex for "model":"..." anywhere
    if (!result.model) {
      const mm = content.match(
        /"model"\s*:\s*"(claude-[^"]+|gpt-[^"]+|gemini-[^"]+|o[1-9]-[^"]+|deepseek-[^"]+|[^"]*anthropic[^"]*|[^"]*openai[^"]*)"/i
      );
      if (mm) result.model = mm[1];
    }
  } catch (_) {}

  return result;
}

function detectModel(transcriptModel, hookInput) {
  if (transcriptModel) return transcriptModel;
  if (hookInput.model) return hookInput.model;
  return (
    process.env.CLAUDE_MODEL ||
    process.env.ANTHROPIC_MODEL ||
    process.env.CLAUDE_CODE_MODEL ||
    "unknown"
  );
}

function detectTool(hookInput) {
  if (process.env.CLAUDE_CODE_ENABLE_TELEMETRY) return "claude-code";
  if (process.env.CURSOR_SESSION_ID || hookInput.conversation_id)
    return "cursor";
  if (hookInput.transcript_path) return "claude-code";
  if (hookInput.generation_id) return "cursor";
  return "unknown";
}

function tryGetLoc() {
  try {
    const out = execSync("git diff --numstat", {
      encoding: "utf8",
      timeout: 5000,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let added = 0,
      removed = 0;
    for (const line of out.trim().split("\n")) {
      if (!line) continue;
      const [a, r] = line.split("\t");
      const an = parseInt(a, 10),
        rn = parseInt(r, 10);
      if (!isNaN(an)) added += an;
      if (!isNaN(rn)) removed += rn;
    }
    return { added, removed };
  } catch (_) {
    return { added: 0, removed: 0 };
  }
}

/**
 * Resolve the OTEL endpoint by reading the env block from Claude Code
 * settings files, then falling back to process.env and localhost.
 *
 * Priority: project settings > local settings > user settings > process.env > fallback
 */
function resolveOtelEndpoint(cwd) {
  const ENV_KEYS = ["AI_TRACKER_OTEL_ENDPOINT", "OTEL_EXPORTER_OTLP_ENDPOINT"];

  const settingsFiles = [
    cwd && path.join(cwd, ".claude", "settings.json"),
    cwd && path.join(cwd, ".claude", "settings.local.json"),
    path.join(os.homedir(), ".claude", "settings.json"),
  ].filter(Boolean);

  for (const fp of settingsFiles) {
    const settings = tryReadJson(fp);
    if (!settings || !settings.env) continue;
    for (const key of ENV_KEYS) {
      if (settings.env[key]) return settings.env[key];
    }
  }

  for (const key of ENV_KEYS) {
    if (process.env[key]) return process.env[key];
  }

  return "http://localhost:4318";
}

function sendToOtel(endpoint, payload) {
  try {
    const url = new URL(endpoint.replace(/\/$/, "") + "/v1/logs");
    const data = JSON.stringify(payload);
    const mod = url.protocol === "https:" ? https : http;
    const req = mod.request(
      {
        hostname: url.hostname,
        port: url.port || (url.protocol === "https:" ? 443 : 80),
        path: url.pathname,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(data),
        },
        timeout: 5000,
      },
      () => {}
    );
    req.on("error", () => {});
    req.write(data);
    req.end();
  } catch (_) {}
}

// ─── Main ───

function main() {
  let raw = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => (raw += chunk));
  process.stdin.on("end", () => {
    try {
      const input = JSON.parse(raw);
      const sessionId = input.session_id || input.sessionId || "";
      const transcriptPath = input.transcript_path || "";

      if (!sessionId) process.exit(0);

      try {
        fs.mkdirSync(TRACKER_DIR, { recursive: true });
      } catch (_) {}

      const taskFile = path.join(TRACKER_DIR, `task_${sessionId}.json`);
      const taskData = tryReadJson(taskFile);
      if (!taskData || !taskData.start_ms) process.exit(0);

      // ─── Compute ───
      const stopMs = Date.now();
      const actualMs = stopMs - taskData.start_ms;
      const actualMinutes = +(actualMs / 60000).toFixed(2);

      const transcript = parseTranscript(transcriptPath);
      const estimatedMinutes = +transcript.estimate.toFixed(2);
      const model = detectModel(transcript.model, input);
      const tool = detectTool(input);
      const loc = tryGetLoc();

      let accuracy = 0;
      if (actualMinutes > 0 && estimatedMinutes > 0) {
        accuracy = +(estimatedMinutes / actualMinutes).toFixed(4);
      }

      // ─── Save ───
      const result = {
        ...taskData,
        stop_ms: stopMs,
        stop_iso: new Date().toISOString(),
        actual_ms: actualMs,
        actual_minutes: actualMinutes,
        estimated_minutes: estimatedMinutes,
        estimation_accuracy: accuracy,
        model,
        tool,
        loc_added: loc.added,
        loc_removed: loc.removed,
        status: "completed",
      };

      fs.writeFileSync(taskFile, JSON.stringify(result, null, 2));

      try {
        fs.appendFileSync(
          LOG_FILE,
          `[${result.stop_iso}] session=${sessionId.slice(0, 12)} ` +
            `model=${model} tool=${tool} ` +
            `est=${estimatedMinutes}m actual=${actualMinutes}m ` +
            `accuracy=${accuracy} loc=+${loc.added}/-${loc.removed}\n`
        );
      } catch (_) {}

      // ─── OTEL ───
      const otelEndpoint = resolveOtelEndpoint(input.cwd || process.cwd());

      const timeNano = BigInt(stopMs) * BigInt(1000000);

      sendToOtel(otelEndpoint, {
        resourceLogs: [
          {
            resource: {
              attributes: [
                {
                  key: "service.name",
                  value: { stringValue: "ai-estimation-tracker" },
                },
                {
                  key: "service.version",
                  value: { stringValue: "2.0.0" },
                },
                {
                  key: "host.name",
                  value: { stringValue: os.hostname() },
                },
                {
                  key: "os.type",
                  value: { stringValue: os.platform() },
                },
              ],
            },
            scopeLogs: [
              {
                scope: { name: "estimation-tracker" },
                logRecords: [
                  {
                    timeUnixNano: timeNano.toString(),
                    severityNumber: 9,
                    severityText: "INFO",
                    body: {
                      stringValue: `model=${model} tool=${tool} est=${estimatedMinutes}m actual=${actualMinutes}m accuracy=${accuracy}`,
                    },
                    attributes: [
                      {
                        key: "session.id",
                        value: { stringValue: sessionId },
                      },
                      {
                        key: "ai.model",
                        value: { stringValue: model },
                      },
                      {
                        key: "ai.tool",
                        value: { stringValue: tool },
                      },
                      {
                        key: "task.prompt",
                        value: {
                          stringValue: (taskData.prompt || "").slice(0, 200),
                        },
                      },
                      {
                        key: "task.estimated_minutes",
                        value: { doubleValue: estimatedMinutes },
                      },
                      {
                        key: "task.actual_minutes",
                        value: { doubleValue: actualMinutes },
                      },
                      {
                        key: "task.actual_ms",
                        value: { intValue: String(actualMs) },
                      },
                      {
                        key: "task.estimation_accuracy",
                        value: { doubleValue: accuracy },
                      },
                      {
                        key: "task.loc_added",
                        value: { intValue: String(loc.added) },
                      },
                      {
                        key: "task.loc_removed",
                        value: { intValue: String(loc.removed) },
                      },
                      {
                        key: "task.loc_total",
                        value: {
                          intValue: String(loc.added + loc.removed),
                        },
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      });

      setTimeout(() => process.exit(0), 200);
    } catch (err) {
      process.stderr.write(
        `[estimation-tracker] stop hook error: ${err.message}\n`
      );
      process.exit(0);
    }
  });
}

main();
