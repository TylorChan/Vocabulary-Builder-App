const REVIEW_PHASE_TO_LEGACY_STEP = Object.freeze({
    CHOOSE_MODE: "CHOOSE_MODE",
    FREE_CHAT: "FREE_CHAT",
    AWAIT_THEME: "AWAIT_THEME",
    PLANNING: "PLANNING",
    IN_SCENE: "IN_SCENE",
    PAUSED: "PAUSED",
    DONE: "DONE",
    ERROR: "ERROR",
});

function cleanText(value, maxLength = 2_000) {
    const text = String(value ?? "").replace(/\s+/g, " ").trim();
    return text.length <= maxLength ? text : `${text.slice(0, maxLength - 1).trim()}…`;
}

export function unwrapGlobalReviewProgress(value) {
    if (!value || typeof value !== "object") {
        return { reviewRunId: null, legacyProgress: null };
    }
    if (Number(value.schemaVersion || 1) !== 2) {
        return { reviewRunId: null, legacyProgress: value };
    }
    return {
        reviewRunId: value.activeReviewRunId || value.controlPacket?.reviewRunId || null,
        legacyProgress: value.legacyMirror && typeof value.legacyMirror === "object"
            ? value.legacyMirror
            : null,
    };
}

export function buildLegacyReviewMirror(context = {}) {
    const {
        reviewSchemaVersion: _reviewSchemaVersion,
        activeReviewRunId: _activeReviewRunId,
        reviewControlPacket: _reviewControlPacket,
        reviewShadowControlPacket: _reviewShadowControlPacket,
        reviewSceneEvidenceStarts: _reviewSceneEvidenceStarts,
        ...legacyMirror
    } = context || {};
    return legacyMirror;
}

function hasBreadcrumb(transcriptItems, predicate) {
    return (Array.isArray(transcriptItems) ? transcriptItems : [])
        .some((item) => item?.type === "BREADCRUMB" && predicate(item));
}

export function buildReviewControlBreadcrumbs({
    previousPacket = null,
    packet,
    transcriptItems = [],
} = {}) {
    if (!packet?.reviewRunId) return [];

    const breadcrumbs = [];
    const runChanged = Boolean(
        previousPacket?.reviewRunId
        && previousPacket.reviewRunId !== packet.reviewRunId
    );
    const phaseChanged = runChanged || previousPacket?.phase !== packet.phase;

    if (phaseChanged) {
        if (runChanged && packet.phase === "CHOOSE_MODE") {
            breadcrumbs.push({
                title: "Scene review progress cleared",
                data: { kind: "REVIEW_RESET" },
            });
        } else if (packet.phase === "AWAIT_THEME") {
            breadcrumbs.push({
                title: "Review mode selected. Waiting for your preferred scene/topic",
                data: { kind: "REVIEW_MODE" },
            });
        } else if (packet.phase === "FREE_CHAT") {
            breadcrumbs.push({
                title: "Switched to free-style chat mode",
                data: { kind: "REVIEW_MODE" },
            });
        } else if (packet.phase === "PAUSED") {
            breadcrumbs.push({
                title: "Review paused. Say 'continue review' when you're ready.",
                data: { kind: "REVIEW_STATUS" },
            });
        } else if (packet.phase === "DONE") {
            breadcrumbs.push({
                title: "All scenes completed",
                data: { kind: "REVIEW_STATUS" },
            });
        } else if (packet.phase === "ERROR") {
            breadcrumbs.push({
                title: "Review planning failed. Try another topic.",
                data: { kind: "REVIEW_ERROR" },
            });
        } else if (packet.phase === "IN_SCENE" && previousPacket?.phase === "PAUSED") {
            breadcrumbs.push({
                title: "Resuming review from your last progress",
                data: { kind: "REVIEW_STATUS" },
            });
        }
    }

    if (packet.phase !== "IN_SCENE" || !packet.activeScene?.sceneId) {
        return breadcrumbs;
    }

    const scene = packet.activeScene;
    const sceneId = scene.sceneId;
    const sceneIndex = Math.max(0, Number(packet.currentSceneIndex || 0));
    const sceneCount = Math.max(sceneIndex + 1, Number(packet.sceneCount || 0));
    const sceneTitle = cleanText(scene.title || sceneId, 180);
    const sceneBreadcrumbTitle = `Scene ${sceneIndex + 1} / ${sceneCount}: ${sceneTitle}`;
    const previousSceneId = previousPacket?.activeScene?.sceneId || null;
    const sceneChanged = previousSceneId !== sceneId;
    const sceneAlreadyShown = hasBreadcrumb(transcriptItems, (item) => (
        item?.data?.kind === "REVIEW_SCENE" && item?.data?.sceneId === sceneId
    )) || hasBreadcrumb(transcriptItems, (item) => item?.title === sceneBreadcrumbTitle);

    if (!sceneChanged && sceneAlreadyShown) return breadcrumbs;

    const targetWords = (Array.isArray(scene.targetWords) ? scene.targetWords : [])
        .map((word) => cleanText(word, 180))
        .filter(Boolean);
    if (targetWords.length > 0) {
        breadcrumbs.push({
            title: `Now reviewing: ${targetWords.join(", ")}`,
            data: { kind: "NOW_REVIEWING", sceneId, words: targetWords },
        });
    }
    breadcrumbs.push({
        title: sceneBreadcrumbTitle,
        data: { kind: "REVIEW_SCENE", sceneId, sceneIndex, sceneCount },
    });

    return breadcrumbs;
}

export function applyReviewPacketToRuntimeContext(context, packet, {
    authority = false,
    sourceSessionId = null,
    messageCount = 0,
} = {}) {
    if (!context || typeof context !== "object" || !packet?.reviewRunId) {
        return { applied: false, controlChanged: false };
    }

    const previousPacket = authority
        ? context.reviewControlPacket
        : context.reviewShadowControlPacket;
    const previousRevision = Number(previousPacket?.revision ?? -1);
    const nextRevision = Number(packet.revision ?? -1);
    const runChanged = Boolean(
        previousPacket?.reviewRunId
        && previousPacket.reviewRunId !== packet.reviewRunId
    );
    if (!Number.isInteger(nextRevision) || (!runChanged && nextRevision < previousRevision)) {
        return { applied: false, controlChanged: false };
    }

    context.reviewSchemaVersion = 2;
    context.activeReviewRunId = packet.reviewRunId;
    if (!authority) {
        context.reviewShadowControlPacket = packet;
        return {
            applied: true,
            controlChanged: runChanged || Number(previousPacket?.controlRevision ?? -1)
                !== Number(packet.controlRevision ?? -1),
        };
    }

    if (runChanged) {
        context.rolePlayPlan = null;
        context.currentUserFocus = "";
        context.reviewSceneEvidenceStarts = {};
    }
    context.reviewControlPacket = packet;
    context.currentSceneMode = packet.mode || "MODE_SELECT";
    context.currentSceneStep = REVIEW_PHASE_TO_LEGACY_STEP[packet.phase] || "CHOOSE_MODE";
    context.currentSceneIndex = Math.max(0, Number(packet.currentSceneIndex || 0));
    context.currentScene = packet.activeScene || null;
    context.activeSceneId = packet.activeScene?.sceneId || null;
    context.targetProgress = packet.targetProgress || {};
    context.reviewComplete = packet.phase === "DONE";

    const sceneId = packet.activeScene?.sceneId;
    if (sceneId) {
        const starts = context.reviewSceneEvidenceStarts && typeof context.reviewSceneEvidenceStarts === "object"
            ? context.reviewSceneEvidenceStarts
            : {};
        const currentStart = starts[sceneId];
        if (!currentStart || currentStart.sessionId !== sourceSessionId) {
            context.reviewSceneEvidenceStarts = {
                ...starts,
                [sceneId]: {
                    sessionId: sourceSessionId || null,
                    messageIndex: Math.max(0, Number(messageCount || 0)),
                },
            };
        }
    }

    return {
        applied: true,
        controlChanged: runChanged || Number(previousPacket?.controlRevision ?? -1)
            !== Number(packet.controlRevision ?? -1),
        practiceMode: packet.mode || "MODE_SELECT",
        activeWords: packet.activeScene?.targetWords || [],
    };
}

export function buildReviewSceneEvidence({
    transcriptItems = [],
    sceneStart = null,
    sourceSessionId = null,
    maxMessages = 24,
    maxCharacters = 6_000,
} = {}) {
    const messages = (Array.isArray(transcriptItems) ? transcriptItems : [])
        .filter((item) => (
            item?.type === "MESSAGE"
            && (item.role === "user" || item.role === "assistant")
        ))
        .map((item) => ({
            role: item.role,
            text: cleanText(item.title, 1_200),
        }))
        .filter((item) => item.text);

    const storedIndex = sceneStart?.sessionId === sourceSessionId
        ? Number(sceneStart?.messageIndex)
        : Number.NaN;
    const startIndex = Number.isInteger(storedIndex) && storedIndex >= 0 && storedIndex < messages.length
        ? storedIndex
        : Math.max(0, messages.length - maxMessages);
    const selected = messages.slice(startIndex).slice(-maxMessages);
    const lines = selected.map((item) => `${item.role === "user" ? "USER" : "TEACHER"}: ${item.text}`);

    let evidence = lines.join("\n");
    if (evidence.length > maxCharacters) {
        evidence = evidence.slice(evidence.length - maxCharacters);
        const firstLineBreak = evidence.indexOf("\n");
        if (firstLineBreak >= 0) evidence = evidence.slice(firstLineBreak + 1);
    }
    return evidence;
}

export function buildRatingScoreSummary(ratings = []) {
    const scores = (Array.isArray(ratings) ? ratings : [])
        .map((item) => Number(item?.rating))
        .filter((score) => Number.isFinite(score) && score >= 1 && score <= 4);
    if (!scores.length) return { ratingCount: 0 };
    const sum = scores.reduce((total, score) => total + score, 0);
    return {
        ratingCount: scores.length,
        minimum: Math.min(...scores),
        maximum: Math.max(...scores),
        average: Number((sum / scores.length).toFixed(2)),
    };
}
