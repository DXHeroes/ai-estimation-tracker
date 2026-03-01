#!/usr/bin/env node
/**
 * on_prompt_submit.js — UserPromptSubmit hook
 *
 * Saves start timestamp keyed by session_id.
 * The estimation instruction comes from the SKILL.md — no need for
 * additionalContext injection (which only works in Claude Code anyway).
 *
 * Zero dependencies. Cross-platform.
 */

const fs = require("fs");
const path = require("path");
const os = require("os");

const TRACKER_DIR = path.join(os.homedir(), ".ai-estimation-tracker");

function main() {
  let raw = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => (raw += chunk));
  process.stdin.on("end", () => {
    try {
      const input = JSON.parse(raw);
      const sessionId = input.session_id || input.sessionId || "";
      const prompt =
        (input.prompt || input.message || input.content || "").slice(0, 500);

      if (!sessionId || !prompt.trim()) {
        process.exit(0);
      }

      try {
        fs.mkdirSync(TRACKER_DIR, { recursive: true });
      } catch (_) {}

      const taskData = {
        session_id: sessionId,
        prompt: prompt,
        start_ms: Date.now(),
        start_iso: new Date().toISOString(),
      };

      fs.writeFileSync(
        path.join(TRACKER_DIR, `task_${sessionId}.json`),
        JSON.stringify(taskData, null, 2)
      );
    } catch (err) {
      process.stderr.write(
        `[estimation-tracker] prompt hook error: ${err.message}\n`
      );
    }

    process.exit(0);
  });
}

main();
