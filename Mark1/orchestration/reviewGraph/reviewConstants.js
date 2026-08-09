export const REVIEW_STATE_SCHEMA_VERSION = 2;
export const REVIEW_FLOW_VERSION = 2;

export const REVIEW_MODES = Object.freeze({
    MODE_SELECT: "MODE_SELECT",
    REVIEW: "REVIEW",
    FREE_CHAT: "FREE_CHAT",
});

export const REVIEW_PHASES = Object.freeze({
    CHOOSE_MODE: "CHOOSE_MODE",
    FREE_CHAT: "FREE_CHAT",
    AWAIT_THEME: "AWAIT_THEME",
    PLANNING: "PLANNING",
    IN_SCENE: "IN_SCENE",
    PAUSED: "PAUSED",
    DONE: "DONE",
    ERROR: "ERROR",
});

export const REVIEW_EVENT_TYPES = Object.freeze({
    RUN_STARTED: "RUN_STARTED",
    MODE_SELECTED: "MODE_SELECTED",
    THEME_SUBMITTED: "THEME_SUBMITTED",
    USER_TURN_COMPLETED: "USER_TURN_COMPLETED",
    SCENE_COMPLETION_REQUESTED: "SCENE_COMPLETION_REQUESTED",
    PAUSE_REQUESTED: "PAUSE_REQUESTED",
    RESUME_REQUESTED: "RESUME_REQUESTED",
    RATING_CLAIMED: "RATING_CLAIMED",
    RATING_COMPLETED: "RATING_COMPLETED",
    RATING_FAILED: "RATING_FAILED",
});

export const REVIEW_EFFECT_TYPES = Object.freeze({
    RATE_SCENE: "RATE_SCENE",
});

export const REVIEW_EFFECT_STATUS = Object.freeze({
    PENDING: "PENDING",
    IN_PROGRESS: "IN_PROGRESS",
    COMPLETE: "COMPLETE",
    FAILED: "FAILED",
});

export const REVIEW_TARGET_STATUS = Object.freeze({
    UNSEEN: "unseen",
    ATTEMPTED: "attempted",
    USED_WITH_HINT: "used_with_hint",
    USED_UNPROMPTED: "used_unprompted",
    TRANSFERRED: "transferred",
    // Legacy values remain readable while V1 checkpoints are migrated.
    MENTIONED: "mentioned",
    COMPLETION_ATTEMPTED: "completion_attempted",
});

export const REVIEW_BEAT_TYPES = Object.freeze({
    ELICIT: "ELICIT",
    DEEPEN: "DEEPEN",
    REPAIR: "REPAIR",
    TRANSFER: "TRANSFER",
    WRAP: "WRAP",
});

export const REVIEW_BEAT_STATUS = Object.freeze({
    PENDING: "PENDING",
    ACTIVE: "ACTIVE",
    ACHIEVED: "ACHIEVED",
    EXHAUSTED: "EXHAUSTED",
    SKIPPED: "SKIPPED",
});

export const REVIEW_SUPPORT_LEVELS = Object.freeze({
    NONE: "NONE",
    CONTEXT_CUE: "CONTEXT_CUE",
    EXPRESSION_HINT: "EXPRESSION_HINT",
    SHORT_RECAST: "SHORT_RECAST",
});

export const REVIEW_TURN_OUTCOMES = Object.freeze({
    ACHIEVED: "ACHIEVED",
    MEANING_OK_TARGET_MISSING: "MEANING_OK_TARGET_MISSING",
    PARTIAL: "PARTIAL",
    STUCK: "STUCK",
    OFF_TOPIC: "OFF_TOPIC",
    ASR_UNCERTAIN: "ASR_UNCERTAIN",
});

export const REVIEW_TOOL_NAMES = Object.freeze({
    CHOOSE_MODE: "choose_practice_mode",
    SUBMIT_THEME: "submit_review_theme",
    REQUEST_COMPLETION: "request_scene_completion",
    PAUSE: "pause_review_mode",
    RESUME: "resume_review_mode",
    RESET: "reset_scene_review",
    SAVE_EXPRESSION: "propose_expression_save",
});

export const REVIEW_PROCESSED_EVENT_LIMIT = 100;
export const REVIEW_NO_PROGRESS_TURN_LIMIT = 3;
export const REVIEW_RECENT_EVIDENCE_LIMIT = 5;
export const REVIEW_MAX_BEATS_PER_SCENE = 12;
export const REVIEW_MAX_DUE_WORDS = 30;
export const REVIEW_MAX_TURN_CHARS = 4_000;
export const REVIEW_RATING_MAX_ATTEMPTS = 3;
export const REVIEW_RATING_LEASE_MS = 60_000;
