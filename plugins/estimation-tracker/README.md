# Estimation Tracker Plugin

Measures AI estimation accuracy — how long AI thinks a task takes vs how long it actually takes.

## Components

- **Skill** (`estimation`): Instructs the AI to write `<!-- ESTIMATE: X -->` on every response
- **Hooks**: `UserPromptSubmit` (start timer) → `Stop` (compute metrics, send to OTEL)

## Tracked Metrics

| Attribute | Description |
|-----------|-------------|
| `ai.model` | Model used (e.g. claude-sonnet-4-20250514) |
| `ai.tool` | Tool used (claude-code, cursor) |
| `task.estimated_minutes` | AI's estimate in human-minutes |
| `task.actual_minutes` | Wall-clock time |
| `task.estimation_accuracy` | Ratio estimate/actual (1.0 = perfect) |
| `task.loc_added` / `task.loc_removed` | Lines changed (0 without git) |

## Local Data

All task data is stored in `~/.ai-estimation-tracker/` as JSON files.
