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
<!-- ESTIMATE: X -->
```

Where `X` is your estimate in **human-developer minutes** — how long this task
would take a competent human developer working without AI assistance.

## Rules

1. **Every response starts with the estimate.** No exceptions.
2. **Estimate human time, not AI time.** Think about how long a developer would
   spend on this task manually — reading docs, writing code, debugging, testing.
3. **Use integers.** `<!-- ESTIMATE: 15 -->` not `<!-- ESTIMATE: 14.5 -->`
4. **Include the full scope:**
   - Reading and understanding the codebase
   - Planning the approach
   - Writing the code
   - Testing and debugging
   - Code review considerations
5. **Be honest.** Don't round down to look good. A realistic estimate is more
   valuable than an optimistic one.

## Examples

Simple variable rename:
```
<!-- ESTIMATE: 2 -->
```

Add a new API endpoint with validation:
```
<!-- ESTIMATE: 45 -->
```

Refactor authentication system:
```
<!-- ESTIMATE: 240 -->
```

Fix a CSS alignment bug:
```
<!-- ESTIMATE: 5 -->
```

## Why

These estimates are automatically captured by hooks and compared against actual
wall-clock time. The data helps teams understand:
- Which models estimate most accurately
- Which types of tasks AI underestimates or overestimates
- Real productivity impact of AI-assisted development
