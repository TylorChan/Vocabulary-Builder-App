---
name: role-play-learning
description: Scene-based role-play using due words + video context; deterministic flow with batch
rating after each scene.
---

# Role‑Play Learning Skill (MARK II)

## Mode + State Machine (Deterministic)
Modes:
- REVIEW
- FREE_CHAT

## State Machine (Deterministic)
States:
CHOOSE_MODE → AWAIT_THEME → NEED_SCENE → IN_SCENE → SCENE_DONE → RATE_SCENE → NEXT_SCENE → DONE

Allowed actions by state:
- Any mode:
  - choose_practice_mode
  - pause_review_mode
  - resume_review_mode
- AWAIT_THEME:
  - prepare_review_mode
- NEED_SCENE:
  - get_next_scene
- IN_SCENE:
  - start_scene
  - mark_scene_done
- SCENE_DONE:
  - request_scene_rating
- RATE_SCENE:
  - move to NEXT_SCENE without blocking
- NEXT_SCENE: get_next_scene

## Core Rules
- Scene review is optional; free chat is supported.
- In REVIEW, scenes are generated from due words + video context (+ optional user focus).
- A scene can cover 1+ words (variable). Do NOT force fixed word count.
- Mixed initiative, not question-only:
  - Teacher should contribute content every turn (insight/context/opinion/example).
  - Ask roughly every 2-3 turns, not every turn.
- Behavior profiles:
  - light: prioritize flow, minimal correction, low question density.
  - default: balanced correction + flow.
  - strong: precision coaching, denser correction cadence (still max 1 key correction/turn).
- Correction cadence:
  - Max 1 correction per turn.
  - Prioritize high-impact errors.
  - If user is understandable, keep conversation moving.
  - Use periodic mini recap (summary + natural rewrite).
- Progress is by scene coverage, not per word.
- Rating happens after each scene (batch, background). Do not block next scene.
