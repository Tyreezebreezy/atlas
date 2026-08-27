# Workout/Program Import Format

**Status: not built yet.** This is a design placeholder — v0.0.9 implements it.
Recorded now so the schema shape isn't designed twice.

## Principle

Import is provider-agnostic. Never name or brand this feature around any
specific AI assistant — a workout can come from a trainer, a friend, a website,
an old document, or the user's own notes just as easily as from an LLM. The
feature is "Import Workout" / "Import Program," never "AI Import."

## Formats, in priority order

1. **Pasted free-form text** — the primary human workflow. Parsed into
   structured exercises/sets/reps/rest/notes.
2. **`atlas-plan-v1`** — a versioned, formally validated (JSON Schema or
   equivalent) portable workout/program format. The most reliable path for any
   tool that can generate ATLAS-native plans directly.
3. TXT / Markdown.
4. Manual creation (already covered by the workout/program builder, v0.0.3).
5. Later: PDF with extractable text (not scanned/OCR), CSV where it fits.

## Pipeline (never skip a step)

```
Input → Parse → Schema/structure validation → Exercise matching
  → Warnings/unresolved items → Preview → User edits → User approval → Save
```

Nothing is silently saved. Unresolved exercises present candidate matches plus
"Create Custom Exercise" / "Skip." The user approves the final structured
result before it becomes part of ATLAS.
