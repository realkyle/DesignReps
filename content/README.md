# Lesson Content Format (v1)

Lessons are plain JSON files, so a new lesson or a whole new track is a content change rather than new screens or a schema change.

| | |
|---|---|
| **Location** | `content/<track-slug>/NN-<lesson-slug>.json`, e.g. `content/system-design/01-scaling-basics.json` |
| **Validated by** | `src/lib/lessons/lessonSchema.ts` (the single source of truth for this format) |
| **Checked automatically** | `npm test` validates every file in `content/`, so a broken lesson can't be merged |
| **Loaded into the database** | Each file becomes one row in `lessons`. `slug`, `title`, `kind` and `position` become columns, and the rest is stored in `lessons.content` (JSON) |

---

## File structure

```jsonc
{
  "schemaVersion": 1,
  "slug": "example-lesson",          // lower-kebab-case; must match the file name
  "title": "Example lesson",          // ≤ 80 chars
  "kind": "lesson",                   // "lesson" (10 XP) or "scenario" (25 XP)
  "position": 1,                      // 1-based order in the track; must match NN in the file name
  "estimatedMinutes": 8,              // 1–10
  "steps": [                          // shown in this order; 1–30 steps
    { "type": "concept", "id": "c1", "title": "…", "body": "…" },
    {
      "type": "question",
      "id": "q1",
      "prompt": "…?",
      "choices": [
        { "id": "a", "text": "…" },
        { "id": "b", "text": "…" }
      ],
      "correctChoiceId": "b",
      "explanation": "Why b is right and the others aren't."
    }
    // … exactly 5 questions in total
  ],
  "sources": [
    { "title": "System Design Primer: Performance vs scalability",
      "url": "https://github.com/donnemartin/system-design-primer#performance-vs-scalability",
      "license": "CC BY 4.0" }
  ]
}
```

## Fields

### Lesson
| Field | Type | Rules |
|---|---|---|
| `schemaVersion` | number | Must be `1` |
| `slug` | string | `lower-kebab-case`; unique within the track; matches the file name |
| `title` | string | 1–80 chars |
| `kind` | string | `lesson` or `scenario` |
| `position` | integer | ≥ 1; positions in a track run 1, 2, 3 … with no gaps; matches `NN` in the file name |
| `estimatedMinutes` | integer | 1–10 (plan: lessons take under 10 minutes) |
| `steps` | array | 1–30 steps; **exactly 5 `question` steps** and **at least 1 `concept` step**; step `id`s unique |
| `sources` | array | **At least 1**; every fact in the lesson must trace back to one of these |

### Step: `concept` (an explanation card)
| Field | Type | Rules |
|---|---|---|
| `type` | `"concept"` | |
| `id` | string | 1–32 chars of `a-z 0-9 -`; unique in the lesson |
| `title` | string | 1–80 chars |
| `body` | string | 1–1200 chars |

### Step: `question` (multiple choice, graded)
| Field | Type | Rules |
|---|---|---|
| `type` | `"question"` | |
| `id` | string | As above. **Never change it after publishing**: answers are stored by ID |
| `prompt` | string | 1–400 chars |
| `choices` | array | 2–5 choices, each `{ id, text }` with unique ids; `text` 1–200 chars |
| `correctChoiceId` | string | Must be one of the choice ids |
| `explanation` | string | 1–800 chars; shown after answering |

### Source
| Field | Type | Rules |
|---|---|---|
| `title` | string | 1–200 chars |
| `url` | string | Must start with `https://` |
| `license` | string | Optional. Set it when the license requires credit, e.g. `"CC BY 4.0"` for the System Design Primer |

## Scenarios

A guided scenario (e.g. *design a URL shortener*) uses the **same format** with `"kind": "scenario"`. Its 5 questions are the 5 guided steps, and concept cards set up the problem between them.

## Authoring rules

- Write in your own words. Cite, don't copy, unless the source's license allows reuse with credit (CC BY 4.0).
- AI may help draft or format, but every fact must come from a listed source, and the content expert reviews every lesson.
- Unknown fields are rejected, which catches typos like `"titel"`.
- Text is trimmed, so leading and trailing spaces don't matter.
