const ICON_NAMES = new Set([
    "MIC",
    "CONNECT",
    "MEMORY",
    "LOAD",
    "MODE",
    "PLAN",
    "REVIEW",
    "SCENE",
    "RATE",
    "SYNC",
    "SHAPE",
    "CHECK",
    "SAVE",
    "RESTORE",
    "ERROR",
    "PAUSE",
]);

const ICON_BY_KIND = {
    DUE_LOADING: "LOAD",
    DUE_LOADED: "LOAD",
    DUE_ERROR: "ERROR",
    PENDING_FOUND: "SYNC",
    MEMORY_SHAPING: "SHAPE",
    MEMORY_SHAPED: "SHAPE",
    EXPRESSION_ASSIST_LOADING: "CHECK",
    EXPRESSION_ASSIST_ERROR: "ERROR",
    EXPRESSION_SAVED: "SAVE",
    EXPRESSION_LEARN_TODAY: "SAVE",
    NOW_REVIEWING: "REVIEW",
    REVIEW_ERROR: "ERROR",
    REVIEW_MODE: "MODE",
    REVIEW_RESET: "RESTORE",
    REVIEW_STATUS: "REVIEW",
};

// Persisted sessions can predate explicit icon metadata.
const LEGACY_ICON_RULES = [
    [/(failed|failure|blocked|not found|couldn't finish)/i, "ERROR"],
    [/(microphone|\bmic\b)/i, "MIC"],
    [/(connecting|connected|disconnected|calling bob|bob is online)/i, "CONNECT"],
    [/(remember|past context)/i, "MEMORY"],
    [/(loading due words|loaded \d+ due words|no due words|fetching due words|nothing due)/i, "LOAD"],
    [/(review mode|free-style|free chat|plot twist|off-script)/i, "MODE"],
    [/(planning|replanning|rebuilding|setting the stage|reworking the scene)/i, "PLAN"],
    [/(now reviewing|working on|all scenes completed|completed all scenes)/i, "REVIEW"],
    [/(^scene \d+|scene done|completing scene|wrapping the scene)/i, "SCENE"],
    [/(rating|rated|scene rating|judge|judging|verdict)/i, "RATE"],
    [/(sync|pending review|catching up|caught up)/i, "SYNC"],
    [/(shaping memory|memory shaped|memory tidied)/i, "SHAPE"],
    [/(checking expressions|scouting expressions)/i, "CHECK"],
    [/(saved|learning|pocketed|bringing)/i, "SAVE"],
    [/(restore|resume|reset|clearing review|wiping the slate|picking up)/i, "RESTORE"],
    [/(review paused|pausing review|holding the scene)/i, "PAUSE"],
];

export function isBreadcrumbIconName(name) {
    return ICON_NAMES.has(name);
}

export function resolveBreadcrumbIcon(item) {
    if (item?.data?.kind === "REVIEW_SCENE") return null;

    const explicitIcon = String(item?.data?.icon || "").toUpperCase();
    if (isBreadcrumbIconName(explicitIcon)) return explicitIcon;

    const kindIcon = ICON_BY_KIND[item?.data?.kind];
    if (kindIcon) return kindIcon;

    const title = String(item?.title || "");
    return LEGACY_ICON_RULES.find(([pattern]) => pattern.test(title))?.[1] || "CHECK";
}
