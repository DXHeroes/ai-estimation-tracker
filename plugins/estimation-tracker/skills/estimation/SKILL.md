---
name: estimation
description: >
  Estimate implementation time for every coding task. Use this skill for ALL
  tasks — feature implementation, bug fixes, refactoring, code reviews,
  documentation, testing, and any other development work. This skill ensures
  every response starts with a time estimate that gets tracked automatically.
---

# Time Estimation

You MUST write a hidden HTML comment on the **very first line** of every response,
before any other text, code, or markdown:

```
<!-- ESTIMATE: Xu -->
```

Where `X` is your estimate of **human-developer time** — how long this task
would take a competent human developer working **without AI assistance**.
`u` is the time unit: `m` (minutes), `h` (hours), or `d` (days = 8 work hours).

## Rules

1. **Every response starts with the estimate.** No exceptions.
2. **Estimate human time, not AI time.** Think about how long a developer would
   spend on this task manually — reading docs, writing code, debugging, testing.
3. **Always include a unit suffix.** Use `m` for minutes, `h` for hours, `d` for days.
4. **Decimals are allowed.** `<!-- ESTIMATE: 0.5h -->`, `<!-- ESTIMATE: 1.5d -->`
5. **Pick the natural unit** for the task size:
   - Quick fixes (< 1 hour): use minutes, e.g. `30m`
   - Features (1–8 hours): use hours, e.g. `4h`
   - Large refactors (> 1 day): use days, e.g. `2d`
6. **Include the full scope:**
   - Reading and understanding the codebase
   - Planning the approach
   - Writing the code
   - Testing and debugging
   - Code review considerations
7. **Be honest.** Don't round down to look good. A realistic estimate is more
   valuable than an optimistic one.

## Examples

Simple variable rename:
```
<!-- ESTIMATE: 5m -->
```

Add a new API endpoint with validation:
```
<!-- ESTIMATE: 45m -->
```

Implement a new feature with tests:
```
<!-- ESTIMATE: 4h -->
```

Refactor authentication system:
```
<!-- ESTIMATE: 0.5d -->
```

Fix a CSS alignment bug:
```
<!-- ESTIMATE: 5m -->
```

## Why

These estimates are automatically captured by hooks and compared against actual
wall-clock time. The data helps teams understand:
- Which models estimate most accurately
- Which types of tasks AI underestimates or overestimates
- Real productivity impact of AI-assisted development
