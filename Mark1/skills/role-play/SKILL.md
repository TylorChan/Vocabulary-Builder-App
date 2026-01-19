---
name: role-play-learning
description: Scene-based role-play using due words + video context; deterministic flow with batch
rating after each scene.
---

# Role‑Play Learning Skill (MARK II)

## State Machine (Deterministic)
States:
NEED_SCENE → IN_SCENE → SCENE_DONE → RATE_SCENE → NEXT_SCENE

Allowed actions by state:
- NEED_SCENE: get_scene_plan
- IN_SCENE: start_scene, guide_conversation
- SCENE_DONE: request_batch_rating
- RATE_SCENE: submit_scene_ratings
- NEXT_SCENE: get_next_scene

## Core Rules
- Role‑play only (no old word‑by‑word drill mode).
- Scenes are generated from due words + video context.
- A scene can cover 1+ words (variable). Do NOT force fixed word count.
- Guide the user naturally; don’t sound scripted.
- If user is vague, ask follow‑ups and give hints.
- Progress is by scene coverage, not per word.
- Rating happens after each scene (batch, background). Do not block next scene.