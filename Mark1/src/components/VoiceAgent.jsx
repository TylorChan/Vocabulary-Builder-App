import React, { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { TranscriptProvider, useTranscript } from "../contexts/TranscriptContext";
import { Transcript } from "./Transcript";
import { useRealtimeSession } from "../hooks/useRealtimeSession";
import { useExpressionSaveFlow } from "../hooks/useExpressionSaveFlow";
import { useExpressionAssistFlow } from "../hooks/useExpressionAssistFlow";
import { useExpressionAssistGraphFlow } from "../hooks/useExpressionAssistGraphFlow";
import {
    createVocabularyTeacherAgent,
    vocabularyTeacherAgent,
} from "../agentConfigs/vocabularyTeacher";
import {
    startReviewSession,
    fetchVocabularyEntries,
    updateVocabularyDueDate,
    deleteVocabularyEntry,
} from "../utils/graphql";
import { formatLocalDateTime } from "../utils/dateTime";
import { fetchRolePlayPlan, fetchRolePlayRetrievalPlan } from "../utils/rolePlayClient";
import { createSceneTools } from "../utils/sceneTools";
import { rateScene } from "../utils/sceneRatingClient";

import { createSubmitWordRatingTool } from "../utils/submitWordRatingTool";

import { loadPendingReviewUpdates, clearPendingReviewUpdates } from "../utils/reviewSessionStorage";
import { saveReviewSession } from "../utils/graphql";
import PracticeSessionOverlay from "./PracticeSessionOverlay";
import WordListOverlay from "./WordListOverlay";
import KeyboardTestComposer from "./KeyboardTestComposer";
import {
    clearGlobalReviewProgress,
    createVoiceSession,
    deleteVoiceSessions,
    loadActiveVoiceSession,
    loadGlobalReviewProgress,
    loadVoiceSessionSnapshot,
    loadVoiceSessions,
    saveGlobalReviewProgress,
    saveVoiceSessionSnapshot,
    setActiveVoiceSession,
    updateVoiceSessionMeta,
} from "../utils/voiceSessionStorage";
import { summarizeSessionTitle } from "../utils/sessionTitleClient";
import { VOICE_BASE_URL } from "../config/apiConfig";
import {
    REVIEW_GRAPH_MODE,
    REVIEW_GRAPH_MODES,
    sendReviewGraphEvent,
    startReviewGraphRun,
} from "../utils/reviewGraphClient";
import { ReviewGraphEventQueue } from "../utils/reviewGraphEventQueue";
import {
    EXPRESSION_ASSIST_GRAPH_MODE,
    EXPRESSION_ASSIST_GRAPH_MODES,
} from "../utils/expressionAssistGraphClient";
import {
    createReviewGraphTools,
    REVIEW_GRAPH_EVENT_TYPES,
    selectReviewGraphTools,
} from "../utils/reviewTools";
import {
    applyReviewPacketToRuntimeContext,
    buildLegacyReviewMirror,
    buildRatingScoreSummary,
    buildReviewControlBreadcrumbs,
    buildReviewSceneEvidence,
    unwrapGlobalReviewProgress,
} from "../utils/reviewGraphAdapter";
import {
    flushVoiceSessionTrace,
    traceVoiceSessionEvent,
} from "../utils/voiceSessionTraceClient";

// Import memory tool
import { loadMemoryBootstrap, searchSemanticMemory, consolidateSemanticMemory } from
    "../utils/memoryClient";

const TRANSIENT_BREADCRUMB_PREFIXES = [
    "Loading due words",
    "Loaded ",
    "No due words yet",
    "Failed to load due words",
    "Disconnected from voice agent",
    "No pending review updates to sync",
    "Requesting microphone permission",
    "Microphone permission granted",
    "Connecting to voice agent",
    "Trying to remember something from past",
    "Connected! Start speaking to practice",
    "Connection failed",
    "Syncing ",
    "Synced ",
    "Pending load failed:",
    "Found ",
];
const REALTIME_SOUND_PROFILES = new Set([
    "alloy",
    "ash",
    "ballad",
    "coral",
    "echo",
    "sage",
    "shimmer",
    "verse",
    "marin",
    "cedar",
]);
const normalizeVoiceProfile = (value) => {
    const next = String(value || "").trim().toLowerCase();
    return REALTIME_SOUND_PROFILES.has(next) ? next : "shimmer";
};
const CORRECTION_LEVELS = new Set(["light", "default", "strong"]);
const normalizeCorrectionLevel = (value) => {
    const next = String(value || "").trim().toLowerCase();
    return CORRECTION_LEVELS.has(next) ? next : "default";
};

// Temporary testing hook: keyboard input for quiet environments.
const ENABLE_KEYBOARD_TEST_INPUT = false;
const DEBUG_SESSION_RESUME = false;
const DEBUG_ROLEPLAY_RETRIEVAL = false;
const ROLEPLAY_GROUP_MEMORY_TOP_K = 3;
const REVIEW_GRAPH_ENABLED = REVIEW_GRAPH_MODE !== REVIEW_GRAPH_MODES.OFF;
const REVIEW_GRAPH_AUTHORITY = REVIEW_GRAPH_MODE === REVIEW_GRAPH_MODES.AUTHORITY;
const REVIEW_GRAPH_SHADOW = REVIEW_GRAPH_MODE === REVIEW_GRAPH_MODES.SHADOW;
const EXPRESSION_ASSIST_GRAPH_ENABLED = EXPRESSION_ASSIST_GRAPH_MODE
    !== EXPRESSION_ASSIST_GRAPH_MODES.OFF;
const EXPRESSION_ASSIST_GRAPH_AUTHORITY = EXPRESSION_ASSIST_GRAPH_MODE
    === EXPRESSION_ASSIST_GRAPH_MODES.AUTHORITY;

function debugSessionResume(...args) {
    if (!DEBUG_SESSION_RESUME) return;
    console.log("[VoiceSessionDebug]", ...args);
}

function debugRolePlayRetrieval(...args) {
    if (!DEBUG_ROLEPLAY_RETRIEVAL) return;
    console.log("[RolePlayRetrieval]", ...args);
}

function VoiceAgentContent({ onNavigateBack, userId }) {
    const {
        addTranscriptBreadcrumb,
        setActiveWords,
        transcriptItems,
        activeWords,
        setTranscriptSnapshot,
        clearTranscript,
        removeBreadcrumbsByKinds,
        addExpressionCard,
        transitionExpressionCard,
        updateTranscriptItem,
        removeTranscriptItem,
    } = useTranscript();
    const [isConnecting, setIsConnecting] = useState(false);
    const memoryRef = useRef(null);
    const transcriptWrapperRef = useRef(null);
    const sceneRatingQueueRef = useRef([]);
    const sceneRatingWorkerRunningRef = useRef(false);
    const runSceneRatingWorkerRef = useRef(() => {});
    const runContextRef = useRef({ context: {} });
    const sceneRatingStatusRef = useRef(new Map());
    const connectionStatusRef = useRef("DISCONNECTED");
    const stopPracticeInProgressRef = useRef(false);
    const selectedSessionIdRef = useRef(null);
    const transcriptItemsRef = useRef([]);
    const reviewGraphQueueRef = useRef(null);
    const reviewControlPacketRef = useRef(null);
    const applyReviewControlPacketRef = useRef(async () => false);
    const processReviewEffectsRef = useRef(() => {});
    const syncReviewAndMemoryRef = useRef(async () => {});
    const reviewDataSyncPromiseRef = useRef(null);
    const expressionAssistCancelRef = useRef(() => {});
    const expressionAssistGraphObserveRef = useRef(async () => null);
    const expressionAssistGraphSpeechStartedRef = useRef(() => {});
    const resetSceneReviewRef = useRef(async () => {
        throw new Error("Scene review reset is not initialized");
    });
    const reviewEffectsInFlightRef = useRef(new Set());
    // values: "pending" | "done" | "failed"

    // State for due vocabulary entries
    const [dueEntries, setDueEntries] = useState([]);
    const [loadingDue, setLoadingDue] = useState(false);
    const [dueError, setDueError] = useState("");
    const [sessions, setSessions] = useState([]);
    const [sessionsLoading, setSessionsLoading] = useState(false);
    const [selectedSessionId, setSelectedSessionId] = useState(null);
    const [overlayOpen, setOverlayOpen] = useState(true);
    const [sessionPanelMode, setSessionPanelMode] = useState("initial");
    const [drawerActivated, setDrawerActivated] = useState(false);
    const [sessionBootstrapped, setSessionBootstrapped] = useState(false);
    const [openingSessionId, setOpeningSessionId] = useState(null);
    const [startInProgress, setStartInProgress] = useState(false);
    const [drawerAnchorX] = useState(null);
    const [wordListEntries, setWordListEntries] = useState([]);
    const [wordListLoading, setWordListLoading] = useState(false);
    const [wordListError, setWordListError] = useState("");
    const [wordOverlayOpen, setWordOverlayOpen] = useState(false);
    const [wordDrawerActivated, setWordDrawerActivated] = useState(false);
    const [wordDrawerAnchorX, setWordDrawerAnchorX] = useState(null);
    const [practiceMode, setPracticeMode] = useState("UNKNOWN");
    const [reviewControlPacket, setReviewControlPacket] = useState(null);

    const entriesByIdRef = useRef(new Map());
    const persistTimerRef = useRef(null);
    const startPracticeLockRef = useRef(false);
    const memoryConsolidationBaselineRef = useRef({ sessionId: null, messageCount: 0 });
    const titleGenRunningRef = useRef(new Set());
    const lastTitleSignatureRef = useRef(new Map());
    const lastTitleGenAtRef = useRef(new Map());
    const wordToggleButtonRef = useRef(null);

    const submitWordRatingTool = useMemo(() => {
        return createSubmitWordRatingTool({
            userId,
            getEntryById: (id) => entriesByIdRef.current.get(id),
            onBreadcrumb: (msg) => addTranscriptBreadcrumb(msg),
        });
    }, [addTranscriptBreadcrumb, userId]);

    const snapshotRuntimeContext = useCallback((ctx) => {
        if (!ctx || typeof ctx !== "object") return null;

        return {
            vocabularyWords: ctx.vocabularyWords ?? [],
            totalWords: ctx.totalWords ?? 0,
            memory: ctx.memory ?? null,
            rolePlayPlan: ctx.rolePlayPlan ?? null,
            currentSceneIndex: ctx.currentSceneIndex ?? 0,
            reviewComplete: !!ctx.reviewComplete,
            currentSceneStep: ctx.currentSceneStep ?? "NEED_SCENE",
            currentScene: ctx.currentScene ?? null,
            activeSceneId: ctx.activeSceneId ?? null,
            activeSceneStartHistoryIndex: ctx.activeSceneStartHistoryIndex ?? 0,
            currentSceneMode: ctx.currentSceneMode ?? "REVIEW",
            currentUserFocus: ctx.currentUserFocus ?? "",
            targetProgress: ctx.targetProgress ?? {},
            turnsInScene: Number(ctx.turnsInScene || 0),
            noProgressTurns: Number(ctx.noProgressTurns || 0),
            resumableHistory: ctx.resumableHistory ?? [],
            agentTone: String(ctx.agentTone || ""),
            agentVoiceProfile: normalizeVoiceProfile(ctx.agentVoiceProfile),
            agentVoiceTestingText: String(ctx.agentVoiceTestingText || ""),
            agentBehaviorLevel: normalizeCorrectionLevel(ctx.agentBehaviorLevel),
            reviewSchemaVersion: Number(ctx.reviewSchemaVersion || 1),
            activeReviewRunId: ctx.activeReviewRunId ?? null,
            reviewControlPacket: ctx.reviewControlPacket ?? null,
            reviewShadowControlPacket: ctx.reviewShadowControlPacket ?? null,
            reviewSceneEvidenceStarts: ctx.reviewSceneEvidenceStarts ?? {},
            activeExpressionAssistRunId: ctx.activeExpressionAssistRunId ?? null,
            expressionAssistControlPacket: ctx.expressionAssistControlPacket ?? null,
        };
    }, []);

    useEffect(() => {
        selectedSessionIdRef.current = selectedSessionId;
    }, [selectedSessionId]);

    useEffect(() => {
        transcriptItemsRef.current = transcriptItems;
    }, [transcriptItems]);

    const refreshSessionList = useCallback(async ({ withLoading = false } = {}) => {
        if (withLoading) {
            setSessionsLoading(true);
        }
        try {
            const list = await loadVoiceSessions(userId);
            setSessions(list);
            return list;
        } finally {
            if (withLoading) {
                setSessionsLoading(false);
            }
        }
    }, [userId]);

    const loadDueAndPending = useCallback(async () => {
        setLoadingDue(true);
        setDueError("");
        removeBreadcrumbsByKinds(
            ["DUE_LOADING", "DUE_LOADED", "DUE_ERROR", "PENDING_FOUND"],
            ["Loading due words", "Loaded ", "No due words yet", "Failed to load due words", "Found "]
        );
        addTranscriptBreadcrumb("Loading due words", { kind: "DUE_LOADING" });

        try {
            const [pending, entries] = await Promise.all([
                loadPendingReviewUpdates(userId),
                startReviewSession(userId),
            ]);

            if (pending.length > 0) {
                addTranscriptBreadcrumb(`Found ${pending.length} pending review updates (sync on disconnect).`, {
                    kind: "PENDING_FOUND",
                });
            }

            setDueEntries(entries);
            if (entries.length === 0) {
                addTranscriptBreadcrumb("No due words yet", { kind: "DUE_LOADED", count: 0 });
            } else {
                addTranscriptBreadcrumb(`Loaded ${entries.length} due words`, {
                    kind: "DUE_LOADED",
                    count: entries.length,
                });
            }
            return entries;
        } catch (e) {
            const message = e.message || "Failed to load due words";
            setDueError(message);
            removeBreadcrumbsByKinds(
                ["DUE_LOADING", "DUE_LOADED", "DUE_ERROR"],
                ["Loading due words", "Loaded ", "No due words yet", "Failed to load due words"]
            );
            addTranscriptBreadcrumb("Failed to load due words", {
                kind: "DUE_ERROR",
                error: message,
            });
            throw e;
        } finally {
            setLoadingDue(false);
        }
    }, [addTranscriptBreadcrumb, removeBreadcrumbsByKinds, userId]);

    const loadWordList = useCallback(async () => {
        setWordListLoading(true);
        setWordListError("");
        try {
            const rows = await fetchVocabularyEntries(userId);
            setWordListEntries(rows);
            return rows;
        } catch (e) {
            const msg = e?.message || "Failed to load word list";
            setWordListError(msg);
            throw e;
        } finally {
            setWordListLoading(false);
        }
    }, [userId]);

    const buildResumableHistory = useCallback((items = []) => {
        return (items || [])
            .filter((it) => it?.type === "MESSAGE" && (it.role === "user" || it.role === "assistant"))
            .slice(-8)
            .map((it) => ({
                role: it.role,
                text: it.title || "",
            }));
    }, []);

    const getConversationMessages = useCallback((items = []) => {
        return (items || [])
            .filter((it) => it?.type === "MESSAGE" && (it.role === "user" || it.role === "assistant"))
            .map((it) => ({
                role: it.role,
                text: String(it.title || "").trim(),
            }))
            .filter((it) => it.text.length > 0);
    }, []);

    const stripTransientBreadcrumbs = useCallback((items = []) => {
        return (items || []).filter((item) => {
            if (item?.type !== "BREADCRUMB") return true;
            const title = String(item?.title || "");
            return !TRANSIENT_BREADCRUMB_PREFIXES.some((prefix) => title.startsWith(prefix));
        });
    }, []);

    // Tools for scene-based role-play
    const enqueueSceneRating = useCallback((payload) => {
        const sceneId = payload?.scene?.sceneId || payload?.scene?.id || payload?.scene?.title;
        if (!sceneId) return;

        const ratingKey = payload?.effectId || sceneId;
        const status = sceneRatingStatusRef.current.get(ratingKey);
        if (status === "pending" || status === "done") {
            // addTranscriptBreadcrumb(`Rating already queued for scene "${payload.scene.title}"`);
            return;
        }
        sceneRatingStatusRef.current.set(ratingKey, "pending");
        sceneRatingQueueRef.current.push(payload);
        runSceneRatingWorkerRef.current(); // Call Rater Agent to rate words in scene in background
        addTranscriptBreadcrumb(`Queued scene rating for ${payload?.scene?.targetWordIds?.length || 0}
  words`);
    }, [addTranscriptBreadcrumb]);

    const buildRolePlayPlanFromRuntime = useCallback(async ({ userFocus, runContext }) => {
        const ctx = runContext?.context ?? {};
        const cleanedFocus = String(userFocus || "").trim();

        const dueWords = (ctx.vocabularyWords || [])
            .map((e) => ({
                id: e.id,
                text: e.text,
                definition: e.definition,
                realLifeDef: e.realLifeDef,
                surroundingText: e.surroundingText,
                videoTitle: e.videoTitle,
                learningContext: e.learningContext,
                fsrsCard: e.fsrsCard,
            }))
            .filter((w) => w.id && w.text);

        if (!dueWords.length) {
            throw new Error("No due words found for role-play planning");
        }

        let semanticMemory = ctx?.memory?.semantic || memoryRef.current?.semantic || null;
        if (!semanticMemory) {
            const { memory } = await loadMemoryBootstrap(userId);
            memoryRef.current = memory;
            semanticMemory = memory?.semantic ?? null;
        }

        const retrievalPlan = await fetchRolePlayRetrievalPlan({
            dueWords,
            semantic: semanticMemory,
            currentUserFocus: cleanedFocus,
        });
        const wordGroups = Array.isArray(retrievalPlan?.groups) ? retrievalPlan.groups : [];
        const groupSemanticHints = await Promise.all(wordGroups.map(async (group) => {
            const retrievalQuery = String(group?.retrievalQuery || "").trim();
            debugRolePlayRetrieval("retrievalQuery", {
                groupId: group?.groupId,
                targetWords: group?.targetWords,
                retrievalQuery,
            });
            if (!retrievalQuery) {
                return {
                    groupId: group?.groupId,
                    targetWordIds: group?.targetWordIds || [],
                    targetWords: group?.targetWords || [],
                    hints: [],
                };
            }
            const semanticResults = await searchSemanticMemory({
                userId,
                query: retrievalQuery,
                k: ROLEPLAY_GROUP_MEMORY_TOP_K,
            });
            return {
                groupId: group?.groupId,
                targetWordIds: group?.targetWordIds || [],
                targetWords: group?.targetWords || [],
                retrievalQuery,
                hints: semanticResults.results ?? [],
            };
        }));
        const semanticHints = groupSemanticHints.flatMap((group) => (
            Array.isArray(group.hints)
                ? group.hints.map((hint) => ({ ...hint, groupId: group.groupId, targetWords: group.targetWords }))
                : []
        ));

        addTranscriptBreadcrumb("Planning role-play scenes");
        const rolePlayPlan = await fetchRolePlayPlan({
            dueWords,
            memory: { semantic: semanticMemory },
            semanticHints,
            wordGroups,
            groupSemanticHints,
            currentUserFocus: cleanedFocus,
        });

        return {
            rolePlayPlan,
            memoryPatch: {
                semantic: semanticMemory,
                semanticHints,
                wordGroups,
                groupSemanticHints,
            },
        };
    }, [addTranscriptBreadcrumb, userId]);

    const sceneTools = useMemo(() => createSceneTools({
        onBreadcrumb: (msg, data) => addTranscriptBreadcrumb(msg, data),
        onSceneRatingRequested: enqueueSceneRating,
        onBuildRolePlayPlan: buildRolePlayPlanFromRuntime,
        onModeChange: (mode) => setPracticeMode(String(mode || "").toUpperCase()),
        onSceneStart: (scene) => {
            // console.log("scene.start", scene);
            setActiveWords(scene?.targetWords ?? []);
        },
        onReviewEvent: REVIEW_GRAPH_SHADOW
            ? (type, payload) => reviewGraphQueueRef.current?.enqueue(type, payload)
            : null,
    }), [addTranscriptBreadcrumb, enqueueSceneRating, buildRolePlayPlanFromRuntime, setActiveWords]);

    const runSceneRatingWorker = useCallback(async () => {
        if (sceneRatingWorkerRunningRef.current) return;
        sceneRatingWorkerRunningRef.current = true;

        try {
            while (sceneRatingQueueRef.current.length > 0) {
                const job = sceneRatingQueueRef.current.shift();
                const { scene, evidence, effectId = null } = job || {};
                const sceneId = scene?.sceneId || scene?.id || scene?.title;
                const ratingKey = effectId || sceneId;
                if (!sceneId) {
                    if (effectId) reviewEffectsInFlightRef.current.delete(effectId);
                    continue;
                }

                addTranscriptBreadcrumb(`Rating scene "${scene.title}" (${scene.targetWordIds.length}
  words)`);

                let wordsInScene = scene.targetWordIds
                    .map((id) => entriesByIdRef.current.get(id))
                    .filter(Boolean)
                    .map((w) => ({
                        id: w.id,
                        text: w.text,
                        definition: w.definition,
                        realLifeDef: w.realLifeDef
                    }));

                if (!wordsInScene.length && Array.isArray(scene?.targetWords)) {
                    const byText = new Map(
                        dueEntries.map((w) => [String(w?.text || "").trim().toLowerCase(), w])
                    );
                    const recovered = scene.targetWords
                        .map((t) => byText.get(String(t || "").trim().toLowerCase()))
                        .filter(Boolean)
                        .map((w) => ({
                            id: w.id,
                            text: w.text,
                            definition: w.definition,
                            realLifeDef: w.realLifeDef
                        }));

                    if (recovered.length > 0) {
                        wordsInScene = recovered;
                        scene.targetWordIds = recovered.map((w) => w.id);
                        addTranscriptBreadcrumb(`Recovered scene word ids by target words for "${scene.title}"`);
                    }
                }

                try {
                    if (!scene?.targetWordIds?.length) {
                        throw new Error("Scene has no target words for rating");
                    }
                    if (!wordsInScene.length) {
                        throw new Error("No valid words found in scene for rating");
                    }

                    const { ratings } = await rateScene({ sceneEvidence: evidence, wordsInScene });
                    if (!Array.isArray(ratings) || ratings.length === 0) {
                        throw new Error("Rater returned no ratings for this scene");
                    }
                    for (const r of ratings) {
                        // console.log("rating item:", r)
                        const result = await submitWordRatingTool.invoke(
                            runContextRef.current,
                            JSON.stringify({
                                vocabularyId: r.vocabularyId,
                                rating: r.rating,
                                evidence: r.evidence
                            })
                        );
                        const alreadyRated = effectId && result?.reason === "already rated";
                        if (result?.ok !== true && !alreadyRated) {
                            const reason = typeof result === "string"
                                ? result
                                : (result?.reason || result?.error || "unknown reason");
                            throw new Error(`submit_word_rating failed: ${reason}`);
                        }
                    }
                    if (effectId) {
                        await reviewGraphQueueRef.current?.enqueue(
                            REVIEW_GRAPH_EVENT_TYPES.RATING_COMPLETED,
                            {
                                effectId,
                                scoreSummary: buildRatingScoreSummary(ratings),
                            },
                        );
                    }
                    sceneRatingStatusRef.current.set(ratingKey, "done");
                    addTranscriptBreadcrumb(`Scene rated: ${scene.title}`);

                } catch (err) {
                    sceneRatingStatusRef.current.set(ratingKey, "failed");
                    addTranscriptBreadcrumb(`Scene rating failed: ${scene.title} (${err?.message || err})`);
                    console.error("rateScene failed", err);
                    if (effectId) {
                        try {
                            await reviewGraphQueueRef.current?.enqueue(
                                REVIEW_GRAPH_EVENT_TYPES.RATING_FAILED,
                                {
                                    effectId,
                                    error: String(err?.message || err).slice(0, 240),
                                },
                            );
                        } catch (settleError) {
                            console.error("Unable to settle failed review rating effect", settleError);
                        }
                    }
                } finally {
                    if (effectId) {
                        reviewEffectsInFlightRef.current.delete(effectId);
                        queueMicrotask(() => processReviewEffectsRef.current(reviewControlPacketRef.current));
                    }
                }
            }
        } finally {
            sceneRatingWorkerRunningRef.current = false;
            const packet = reviewControlPacketRef.current;
            const reviewFinished = packet?.phase === "DONE";
            const hasOutstandingRatings = (packet?.effects || []).length > 0
                || sceneRatingQueueRef.current.length > 0
                || reviewEffectsInFlightRef.current.size > 0;
            if (reviewFinished && !hasOutstandingRatings) {
                queueMicrotask(() => {
                    syncReviewAndMemoryRef.current().catch((error) => {
                        console.error("Completed review data sync failed", error);
                    });
                });
            }
        }
    }, [addTranscriptBreadcrumb, dueEntries, submitWordRatingTool]);

    useEffect(() => {
        runSceneRatingWorkerRef.current = runSceneRatingWorker;
    }, [runSceneRatingWorker]);


    useEffect(() => {
        const map = new Map();
        for (const e of dueEntries) map.set(e.id, e);
        entriesByIdRef.current = map;
    }, [dueEntries]);

    // Bootstrap session selector state on mount
    useEffect(() => {
        let cancelled = false;

        async function bootstrapSessions() {
            const list = await refreshSessionList({ withLoading: true });
            let active = await loadActiveVoiceSession(userId);

            if (!active && list.length > 0) {
                active = list[0].sessionId;
            }

            if (!active && list.length === 0) {
                const created = await createVoiceSession(userId, { title: "New session" });
                if (cancelled) return;
                active = created.sessionId;
                await refreshSessionList({ withLoading: true });
            }

            if (cancelled) return;
            setSelectedSessionId(active ?? null);
            setOverlayOpen(true);
            setSessionPanelMode("initial");
            setDrawerActivated(false);
            setWordOverlayOpen(false);
            setWordDrawerActivated(false);
            setSessionBootstrapped(true);
            await loadWordList();
        }

        bootstrapSessions().catch((e) => {
            console.error("session bootstrap failed", e);
            setSessionBootstrapped(true);
        });

        return () => {
            cancelled = true;
        };
    }, [loadWordList, refreshSessionList, userId]);

    const openSelectedSession = useCallback(async (sessionIdArg = null) => {
        let targetSessionId = sessionIdArg || selectedSessionId;
        if (!targetSessionId) {
            const created = await createVoiceSession(userId, { title: "New session" });
            targetSessionId = created.sessionId;
            await refreshSessionList({ withLoading: true });
        }

        const snapshot = await loadVoiceSessionSnapshot(userId, targetSessionId);
        const cleanedItems = stripTransientBreadcrumbs(snapshot?.transcriptItems || []);
        const cleanedMessages = getConversationMessages(cleanedItems);
        const resumableHistory = buildResumableHistory(cleanedItems);
        debugSessionResume("openSelectedSession:loadedSnapshot", {
            sessionId: targetSessionId,
            snapshotTranscriptCount: snapshot?.transcriptItems?.length || 0,
            cleanedItemsCount: cleanedItems.length,
            cleanedMessageCount: cleanedMessages.length,
            cleanedBreadcrumbCount: cleanedItems.filter((item) => item?.type === "BREADCRUMB").length,
            resumableHistoryCount: resumableHistory.length,
            resumableHistoryPreview: resumableHistory,
        });
        if (cleanedItems.length || snapshot?.activeWords?.length) {
            setTranscriptSnapshot({
                items: cleanedItems,
                words: snapshot.activeWords || [],
            });
        } else {
            clearTranscript();
        }

        runContextRef.current = {
            context: {
                ...(snapshot?.runtimeContext ?? {}),
                resumableHistory,
            }
        };
        await setActiveVoiceSession(userId, targetSessionId);
        selectedSessionIdRef.current = targetSessionId;
        setSelectedSessionId(targetSessionId);
        const loadedDueEntries = await loadDueAndPending();
        await loadWordList();
        setOverlayOpen(false);
        setSessionPanelMode("drawer");
        setDrawerActivated(false);
        setWordOverlayOpen(false);
        setWordDrawerActivated(false);
        return {
            sessionId: targetSessionId,
            dueEntries: loadedDueEntries,
            existingMessageCount: cleanedMessages.length,
        };
    }, [
        buildResumableHistory,
        clearTranscript,
        getConversationMessages,
        loadDueAndPending,
        loadWordList,
        refreshSessionList,
        selectedSessionId,
        setTranscriptSnapshot,
        stripTransientBreadcrumbs,
        userId,
    ]);

    const handleChooseInitialSession = useCallback(async (sessionId) => {
        if (openingSessionId) return;
        setOpeningSessionId(sessionId);
        try {
            await openSelectedSession(sessionId);
        } catch (error) {
            console.error("Failed to open selected session", error);
            addTranscriptBreadcrumb(`Failed to open session: ${error?.message || error}`);
        } finally {
            setOpeningSessionId(null);
        }
    }, [addTranscriptBreadcrumb, openingSessionId, openSelectedSession]);

    const createAndSelectSession = useCallback(async () => {
        const created = await createVoiceSession(userId, { title: "New session" });
        await refreshSessionList({ withLoading: true });

        const inDrawerMode = sessionPanelMode === "drawer";
        const isConnected = connectionStatusRef.current === "CONNECTED";

        if (inDrawerMode && isConnected) {
            // Keep live conversation session unchanged while connected.
            if (selectedSessionId) {
                await setActiveVoiceSession(userId, selectedSessionId);
            }
            setOverlayOpen(true);
            setDrawerActivated(true);
            setWordOverlayOpen(false);
            setWordDrawerActivated(false);
            return;
        }

        setSelectedSessionId(created.sessionId);
        clearTranscript();
        runContextRef.current = { context: {} };
        await setActiveVoiceSession(userId, created.sessionId);
        setDueEntries([]);
        setDueError("");
        setLoadingDue(false);
        setWordOverlayOpen(false);
        setWordDrawerActivated(false);

        if (inDrawerMode) {
            setOverlayOpen(true);
            setDrawerActivated(true);
        } else {
            setSessionPanelMode("initial");
            setDrawerActivated(false);
            setOverlayOpen(true);
        }
    }, [
        clearTranscript,
        refreshSessionList,
        selectedSessionId,
        sessionPanelMode,
        userId,
    ]);

    const renameSelectedSession = useCallback(async (sessionIdArg) => {
        const targetSessionId = sessionIdArg || selectedSessionId;
        if (!targetSessionId) return;
        const current = sessions.find((s) => s.sessionId === targetSessionId);
        const nextTitle = window.prompt("Rename session", current?.title || "Untitled session");
        const trimmed = nextTitle?.trim();
        if (!trimmed) return;
        await updateVoiceSessionMeta(userId, targetSessionId, {
            title: trimmed,
            titleSource: "manual",
        });
        if (selectedSessionId !== targetSessionId) {
            setSelectedSessionId(targetSessionId);
            await setActiveVoiceSession(userId, targetSessionId);
        }
        await refreshSessionList({ withLoading: true });
    }, [refreshSessionList, selectedSessionId, sessions, userId]);

    const deleteSelectedSession = useCallback(async (sessionIdArg) => {
        const targetSessionId = sessionIdArg || selectedSessionId;
        if (!targetSessionId) return;

        const currentSelectedId = selectedSessionId;
        const connectionStatus = connectionStatusRef.current;
        const isLiveConnection = connectionStatus === "CONNECTED" || connectionStatus === "CONNECTING";

        await deleteVoiceSessions(userId, [targetSessionId]);
        let list = await refreshSessionList({ withLoading: true });
        let nextSelected = currentSelectedId;

        if (targetSessionId === currentSelectedId || !list.some((s) => s.sessionId === currentSelectedId)) {
            nextSelected = list[0]?.sessionId || null;
        }

        if (!nextSelected) {
            const created = await createVoiceSession(userId, { title: "New session" });
            nextSelected = created.sessionId;
            list = await refreshSessionList({ withLoading: true });
        }

        if (nextSelected) {
            setSelectedSessionId(nextSelected);
            await setActiveVoiceSession(userId, nextSelected);
        }

        if (isLiveConnection) {
            if (targetSessionId === currentSelectedId) {
                clearTranscript();
                runContextRef.current = { context: {} };
                setDueEntries([]);
                setDueError("");
                setLoadingDue(false);
                setSessionPanelMode("initial");
                setDrawerActivated(false);
                setOverlayOpen(true);
                setWordOverlayOpen(false);
                setWordDrawerActivated(false);
            }
            return;
        }

        const deletedCurrentSession = targetSessionId === currentSelectedId;
        if (!deletedCurrentSession) {
            return;
        }

        clearTranscript();
        runContextRef.current = { context: {} };
        setDueEntries([]);
        setDueError("");
        setLoadingDue(false);
        setSessionPanelMode("initial");
        setDrawerActivated(false);
        setOverlayOpen(true);
        setWordOverlayOpen(false);
        setWordDrawerActivated(false);
    }, [clearTranscript, refreshSessionList, selectedSessionId, userId]);

    const updateDrawerAnchor = useCallback(() => {
        const wrapper = transcriptWrapperRef.current;
        if (!wrapper) return;

        const wrapperRect = wrapper.getBoundingClientRect();
        const panelWidth = Math.max(0, Math.min(wrapperRect.width - 24, 640));
        const halfPanel = panelWidth / 2;
        const edgePadding = 2;
        const minX = halfPanel + edgePadding;
        const maxX = wrapperRect.width - halfPanel - edgePadding;

        const clampAnchor = (rawX) => {
            if (minX > maxX) return wrapperRect.width / 2;
            return Math.max(minX, Math.min(maxX, rawX));
        };

        const wordBtn = wordToggleButtonRef.current;
        if (wordBtn) {
            const buttonRect = wordBtn.getBoundingClientRect();
            const x = buttonRect.left - wrapperRect.left + buttonRect.width / 2;
            setWordDrawerAnchorX(clampAnchor(x));
        }
    }, []);

    useEffect(() => {
        updateDrawerAnchor();
    }, [updateDrawerAnchor, wordDrawerActivated, wordOverlayOpen]);

    useEffect(() => {
        window.addEventListener("resize", updateDrawerAnchor);
        return () => window.removeEventListener("resize", updateDrawerAnchor);
    }, [updateDrawerAnchor]);

    const maybeAutoSummarizeSessionTitle = useCallback(async (sessionId, persistedItems) => {
        if (!sessionId) return;
        const sessionMeta = sessions.find((s) => s.sessionId === sessionId);
        if (!sessionMeta || sessionMeta.titleSource === "manual") return;

        const messageItems = (persistedItems || [])
            .filter((it) => it?.type === "MESSAGE" && (it.role === "user" || it.role === "assistant"))
            .map((it) => ({ role: it.role, text: String(it.title || "").trim() }))
            .filter((it) => it.text.length > 0)
            .slice(-8);

        if (messageItems.length < 4) return;

        const signature = messageItems.map((m) => `${m.role}:${m.text}`).join("|");
        if (lastTitleSignatureRef.current.get(sessionId) === signature) return;
        if (titleGenRunningRef.current.has(sessionId)) return;

        const lastAt = lastTitleGenAtRef.current.get(sessionId) || 0;
        if (Date.now() - lastAt < 60_000) return;

        titleGenRunningRef.current.add(sessionId);
        try {
            const generatedTitle = await summarizeSessionTitle({ messages: messageItems });
            const trimmedTitle = String(generatedTitle || "").trim();
            if (!trimmedTitle) return;

            await updateVoiceSessionMeta(userId, sessionId, {
                title: trimmedTitle,
                titleSource: "auto",
            });
            lastTitleSignatureRef.current.set(sessionId, signature);
            lastTitleGenAtRef.current.set(sessionId, Date.now());
            await refreshSessionList();
        } catch (e) {
            console.error("session title summary failed", e);
        } finally {
            titleGenRunningRef.current.delete(sessionId);
        }
    }, [refreshSessionList, sessions, userId]);

    // Persist transcript/session snapshot with debounce
    useEffect(() => {
        if (!sessionBootstrapped || !selectedSessionId || overlayOpen) return;

        if (persistTimerRef.current) {
            clearTimeout(persistTimerRef.current);
        }

        persistTimerRef.current = setTimeout(async () => {
            const ctx = snapshotRuntimeContext(runContextRef.current?.context);
            const persistedItems = stripTransientBreadcrumbs(transcriptItems);
            const sessionMeta = sessions.find((s) => s.sessionId === selectedSessionId);
            const title = sessionMeta?.title || "New session";
            const titleSource = sessionMeta?.titleSource || "auto";
            debugSessionResume("persistSnapshot:beforeSave", {
                sessionId: selectedSessionId,
                transcriptItemsCount: transcriptItems.length,
                persistedItemsCount: persistedItems.length,
                persistedMessageCount: persistedItems.filter((item) => item?.type === "MESSAGE").length,
                persistedBreadcrumbCount: persistedItems.filter((item) => item?.type === "BREADCRUMB").length,
                persistedMessagePreview: persistedItems
                    .filter((item) => item?.type === "MESSAGE")
                    .slice(-8)
                    .map((item) => ({
                        itemId: item?.itemId,
                        role: item?.role,
                        title: item?.title,
                        status: item?.status,
                    })),
                resumableHistoryCount: ctx?.resumableHistory?.length || 0,
            });

            try {
                await saveVoiceSessionSnapshot({
                    userId,
                    sessionId: selectedSessionId,
                    title,
                    titleSource,
                    transcriptItems: persistedItems,
                    activeWords,
                    runtimeContext: ctx,
                });
                debugSessionResume("persistSnapshot:afterSave", {
                    sessionId: selectedSessionId,
                    savedTranscriptCount: persistedItems.length,
                    savedMessageCount: persistedItems.filter((item) => item?.type === "MESSAGE").length,
                });

                const graphPacket = ctx?.reviewControlPacket || ctx?.reviewShadowControlPacket || null;
                if (REVIEW_GRAPH_ENABLED && ctx?.activeReviewRunId && graphPacket) {
                    const graphFinished = REVIEW_GRAPH_AUTHORITY && graphPacket.phase === "DONE";
                    const legacyFinished = REVIEW_GRAPH_SHADOW && ctx.reviewComplete;
                    if (graphFinished || legacyFinished) {
                        await clearGlobalReviewProgress(userId);
                    } else {
                        await saveGlobalReviewProgress(userId, {
                            schemaVersion: 2,
                            activeReviewRunId: ctx.activeReviewRunId,
                            controlPacket: graphPacket,
                            legacyMirror: buildLegacyReviewMirror(ctx),
                            status: ["FREE_CHAT", "PAUSED"].includes(graphPacket.phase)
                                ? "paused"
                                : "in_progress",
                        });
                    }
                } else if (ctx?.rolePlayPlan && !ctx.reviewComplete) {
                    await saveGlobalReviewProgress(userId, {
                        ...ctx,
                        status: ctx.currentSceneMode === "FREE_CHAT" ? "paused" : "in_progress",
                    });
                } else if (ctx?.reviewComplete) {
                    await clearGlobalReviewProgress(userId);
                }

                await refreshSessionList();
                await maybeAutoSummarizeSessionTitle(selectedSessionId, persistedItems);
            } catch (e) {
                console.error("session persistence failed", e);
            }
        }, 450);

        return () => {
            if (persistTimerRef.current) {
                clearTimeout(persistTimerRef.current);
            }
        };
    }, [
        activeWords,
        overlayOpen,
        refreshSessionList,
        reviewControlPacket,
        maybeAutoSummarizeSessionTitle,
        selectedSessionId,
        sessionBootstrapped,
        sessions,
        snapshotRuntimeContext,
        stripTransientBreadcrumbs,
        transcriptItems,
        userId,
    ]);

    // Create audio element for playback
    const sdkAudioElement = useMemo(() => {
        const el = document.createElement('audio');
        el.autoplay = true;
        el.style.display = 'none';
        document.body.appendChild(el);
        return el;
    }, []);

    // Use the Realtime session hook
    const {
        status,
        connect,
        disconnect,
        sendTextMessage,
        requestUiFeedback,
        requestResponse,
        setResponseControlMode,
        updateAgent,
    } = useRealtimeSession({
        onConnectionChange: (newStatus) => {
            // console.log('Connection status changed:', newStatus);
            connectionStatusRef.current = newStatus;
            setIsConnecting(newStatus === 'CONNECTING');
        },
        onTrace: (event, data) => {
            traceVoiceSessionEvent({
                sessionId: selectedSessionIdRef.current,
                event,
                source: "browser.realtime",
                data,
            });
        },
        onUserSpeechStarted: () => {
            expressionAssistCancelRef.current("new_user_speech");
            expressionAssistGraphSpeechStartedRef.current();
        },
        onUserTranscriptCompleted: ({ itemId, transcript, occurredAt }) => {
            if (REVIEW_GRAPH_ENABLED && reviewControlPacketRef.current?.phase === "IN_SCENE") {
                reviewGraphQueueRef.current?.enqueueObservation(transcript, { occurredAt }).catch((error) => {
                    console.warn("Review turn observation failed:", error);
                });
            }
            expressionAssistGraphObserveRef.current({ itemId, transcript, occurredAt }).catch((error) => {
                console.warn("Expression Assist turn observation failed:", error);
            });
        },
    });

    const {
        expressionSaveTool,
        handleDeferExpression,
        handleLearnTodayExpression,
        handleSaveExpression,
    } = useExpressionSaveFlow({
        userId,
        sessionId: selectedSessionId,
        mode: practiceMode,
        transcriptItems,
        addExpressionCard,
        transitionExpressionCard,
        addTranscriptBreadcrumb,
        requestUiFeedback,
        onWordListChanged: loadWordList,
        onTrace: (event, data) => {
            traceVoiceSessionEvent({
                sessionId: selectedSessionIdRef.current,
                source: "browser.expression_save",
                event,
                data,
            });
        },
    });

    const {
        expressionAssistTool,
        cancelExpressionAssist,
    } = useExpressionAssistFlow({
        userId,
        sessionId: selectedSessionId,
        mode: practiceMode,
        status,
        transcriptItems,
        addExpressionCard,
    });
    expressionAssistCancelRef.current = cancelExpressionAssist;

    const {
        startRun: startExpressionAssistControlRun,
        observeCompletedTurn: observeExpressionAssistTurn,
        markUserSpeechStarted: markExpressionAssistSpeechStarted,
    } = useExpressionAssistGraphFlow({
        userId,
        sessionId: selectedSessionId,
        practiceMode,
        reviewPhase: reviewControlPacket?.phase || null,
        status,
        transcriptItems,
        addExpressionCard,
        addTranscriptBreadcrumb,
        updateTranscriptItem,
        removeTranscriptItem,
        requestResponse,
        setResponseControlMode,
    });
    expressionAssistGraphObserveRef.current = observeExpressionAssistTurn;
    expressionAssistGraphSpeechStartedRef.current = markExpressionAssistSpeechStarted;
    const effectiveExpressionAssistTool = EXPRESSION_ASSIST_GRAPH_AUTHORITY
        ? null
        : expressionAssistTool;

    const buildReviewGraphTools = useCallback((packet) => createReviewGraphTools({
        dispatchEvent: (type, payload) => reviewGraphQueueRef.current?.enqueue(type, payload)
            || Promise.reject(new Error("Review graph queue is not initialized")),
        activeSceneId: packet?.activeScene?.sceneId || null,
        resetReview: () => resetSceneReviewRef.current(),
    }), []);

    const processReviewEffects = useCallback((packet = reviewControlPacketRef.current) => {
        if (!REVIEW_GRAPH_AUTHORITY || !packet?.reviewRunId) return;
        const effects = Array.isArray(packet.effects) ? packet.effects : [];

        effects.forEach((effect) => {
            if (!effect?.claimable || effect.type !== "RATE_SCENE" || !effect.effectId) return;
            if (reviewEffectsInFlightRef.current.has(effect.effectId)) return;
            if (!effect.scene?.targetWordIds?.length) {
                console.warn("Review rating effect has no scene payload", {
                    reviewRunId: packet.reviewRunId,
                    effectId: effect.effectId,
                });
                return;
            }

            reviewEffectsInFlightRef.current.add(effect.effectId);
            queueMicrotask(async () => {
                try {
                    const queue = reviewGraphQueueRef.current;
                    if (!queue) throw new Error("Review graph queue is unavailable");
                    await queue.enqueue(REVIEW_GRAPH_EVENT_TYPES.RATING_CLAIMED, {
                        effectId: effect.effectId,
                    });

                    const ctx = runContextRef.current?.context || {};
                    const evidence = buildReviewSceneEvidence({
                        transcriptItems: transcriptItemsRef.current,
                        sceneStart: ctx.reviewSceneEvidenceStarts?.[effect.sceneId],
                        sourceSessionId: selectedSessionIdRef.current,
                    });
                    enqueueSceneRating({
                        effectId: effect.effectId,
                        scene: effect.scene,
                        evidence,
                    });
                } catch (error) {
                    reviewEffectsInFlightRef.current.delete(effect.effectId);
                    console.error("Unable to claim review rating effect", error);
                }
            });
        });
    }, [enqueueSceneRating]);

    useEffect(() => {
        processReviewEffectsRef.current = processReviewEffects;
    }, [processReviewEffects]);

    const applyReviewControlPacket = useCallback(async (packet) => {
        const ctx = runContextRef.current?.context;
        const previousPacket = ctx?.reviewControlPacket || null;
        const result = applyReviewPacketToRuntimeContext(ctx, packet, {
            authority: REVIEW_GRAPH_AUTHORITY,
            sourceSessionId: selectedSessionIdRef.current,
            messageCount: getConversationMessages(transcriptItemsRef.current).length,
        });
        if (!result.applied) return false;

        reviewControlPacketRef.current = packet;
        setReviewControlPacket(packet);

        if (REVIEW_GRAPH_SHADOW) {
            queueMicrotask(() => {
                const legacy = runContextRef.current?.context || {};
                const mismatches = [];
                if (Number(legacy.currentSceneIndex || 0) !== Number(packet.currentSceneIndex || 0)) {
                    mismatches.push("sceneIndex");
                }
                if (legacy.activeSceneId && packet.activeScene?.sceneId
                    && legacy.activeSceneId !== packet.activeScene.sceneId) {
                    mismatches.push("activeSceneId");
                }
                if (mismatches.length) {
                    console.warn("[ReviewGraphShadow] state mismatch", {
                        reviewRunId: packet.reviewRunId,
                        revision: packet.revision,
                        mismatches,
                    });
                }
            });
            return true;
        }

        if (REVIEW_GRAPH_AUTHORITY) {
            setPracticeMode(String(result.practiceMode || "UNKNOWN").toUpperCase());
            setActiveWords(result.activeWords || []);

            buildReviewControlBreadcrumbs({
                previousPacket,
                packet,
                transcriptItems: transcriptItemsRef.current,
            }).forEach((breadcrumb) => {
                addTranscriptBreadcrumb(breadcrumb.title, breadcrumb.data);
            });

            if (result.controlChanged && connectionStatusRef.current === "CONNECTED") {
                const nextAgent = createVocabularyTeacherAgent({
                    controlPacket: packet,
                    tools: selectReviewGraphTools(
                        packet,
                        buildReviewGraphTools(packet),
                        expressionSaveTool,
                        effectiveExpressionAssistTool,
                    ),
                    voice: normalizeVoiceProfile(ctx?.agentVoiceProfile),
                });
                const updateResult = await updateAgent(nextAgent);
                if (updateResult?.ok !== true) {
                    throw new Error(`Unable to update Realtime agent: ${updateResult?.reason || "unknown"}`);
                }
                const responseMode = EXPRESSION_ASSIST_GRAPH_AUTHORITY
                    && packet.phase === "FREE_CHAT"
                    ? "manual"
                    : "automatic";
                const responseModeResult = setResponseControlMode(responseMode);
                if (responseModeResult?.ok !== true) {
                    throw new Error(
                        `Unable to update Realtime response control: ${responseModeResult?.reason || "unknown"}`,
                    );
                }
            }

            queueMicrotask(() => processReviewEffectsRef.current(packet));
        }
        return true;
    }, [
        addTranscriptBreadcrumb,
        buildReviewGraphTools,
        effectiveExpressionAssistTool,
        expressionSaveTool,
        getConversationMessages,
        setActiveWords,
        setResponseControlMode,
        updateAgent,
    ]);

    useEffect(() => {
        applyReviewControlPacketRef.current = applyReviewControlPacket;
    }, [applyReviewControlPacket]);

    useEffect(() => {
        if (!REVIEW_GRAPH_ENABLED) {
            reviewGraphQueueRef.current = null;
            reviewControlPacketRef.current = null;
            setReviewControlPacket(null);
            return undefined;
        }

        const queue = new ReviewGraphEventQueue({
            sendEvent: (event) => sendReviewGraphEvent({
                ...event,
                userId,
                sessionId: selectedSessionIdRef.current,
            }),
            onPacket: (packet, response) => applyReviewControlPacketRef.current(packet, response),
            onError: (error, event) => {
                const eventType = event?.type || "UNKNOWN_EVENT";
                const code = error?.code || "REVIEW_GRAPH_ERROR";
                const message = error?.message || String(error);
                const details = {
                    reviewRunId: reviewGraphQueueRef.current?.reviewRunId || null,
                    eventType,
                    code,
                    message,
                    requestedSceneId: event?.payload?.sceneId || null,
                    activeSceneId: error?.controlPacket?.activeScene?.sceneId || null,
                    expectedRevision: reviewGraphQueueRef.current?.revision ?? null,
                    serverRevision: error?.controlPacket?.revision ?? null,
                };
                console.error(`[ReviewGraph] ${eventType} failed (${code}): ${message}`, details);
                traceVoiceSessionEvent({
                    sessionId: selectedSessionIdRef.current,
                    source: "browser.review_graph",
                    event: "review_graph_error",
                    data: details,
                });
            },
        });
        reviewGraphQueueRef.current = queue;

        return () => {
            if (reviewGraphQueueRef.current === queue) {
                queue.reset();
                reviewGraphQueueRef.current = null;
            }
        };
    }, [userId]);

    useEffect(() => {
        connectionStatusRef.current = status;
    }, [status]);

    useEffect(() => {
        return () => {
            disconnect();
        };
    }, [disconnect]);

    const canShowWordList = (() => {
        if (sessionPanelMode !== "drawer") return false;
        if (status !== "CONNECTED") return false;
        return practiceMode === "REVIEW";
    })();

    const toggleWordPanel = useCallback(async () => {
        if (!canShowWordList) return;
        const nextOpen = !wordOverlayOpen;
        if (nextOpen && !wordListLoading) {
            try {
                await loadWordList();
            } catch {
                // keep existing error state from loader
            }
        }
        setWordOverlayOpen((prev) => {
            const next = !prev;
            if (next) {
                setWordDrawerActivated(true);
            } else {
                setWordDrawerActivated(false);
            }
            return next;
        });
    }, [canShowWordList, loadWordList, wordListLoading, wordOverlayOpen]);

    useEffect(() => {
        if (canShowWordList) return;
        setWordOverlayOpen(false);
        setWordDrawerActivated(false);
    }, [canShowWordList]);

    // Fetch ephemeral key from voice server
    const fetchEphemeralKey = async () => {
        try {
            const response = await fetch(`${VOICE_BASE_URL}/api/session`, {
                method: 'POST',
            });

            if (!response.ok) {
                throw new Error(`Server error: ${response.status}`);
            }

            const data = await response.json();

            if (!data.client_secret?.value) {
                throw new Error('No ephemeral key received');
            }

            // console.log('Ephemeral key received');
            return data.client_secret.value;

        } catch (error) {
            console.error('Failed to fetch ephemeral key:', error);
            throw error;
        }
    };

    // Request microphone permission helper
    const requestMicrophonePermission = async () => {
        if (!navigator?.mediaDevices?.getUserMedia) {
            throw new Error('Microphone API unavailable');
        }

        console.log('[VoiceAgent] Requesting microphone permission...');

        let stream = null;
        try {
            stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (error) {
            const code = error?.name || "";
            if (code === "NotAllowedError" || code === "SecurityError") {
                throw new Error("Microphone permission denied");
            }
            if (code === "NotFoundError" || code === "DevicesNotFoundError") {
                throw new Error("No microphone device found");
            }
            throw new Error(error?.message || "Microphone permission failed");
        } finally {
            stream?.getTracks?.().forEach((track) => track.stop());
        }
    };

    // Connect to OpenAI Realtime API
    const handleStartPractice = async () => {
        if (startPracticeLockRef.current || status !== "DISCONNECTED") return;
        startPracticeLockRef.current = true;
        setStartInProgress(true);

        try {
            // Trigger the permission request while the click interaction is still
            // fresh, but only render the result after the session view is open.
            const microphonePermissionPromise = requestMicrophonePermission()
                .then(() => ({ ok: true }))
                .catch((error) => ({ ok: false, error }));

            let workingDueEntries = dueEntries;
            let sessionIdForMemoryBaseline = selectedSessionId;
            let existingMessageCountAtConnect = getConversationMessages(transcriptItems).length;
            if (overlayOpen || !selectedSessionId) {
                const opened = await openSelectedSession();
                workingDueEntries = opened?.dueEntries ?? [];
                sessionIdForMemoryBaseline = opened?.sessionId ?? sessionIdForMemoryBaseline;
                existingMessageCountAtConnect = Number(opened?.existingMessageCount || 0);
            } else if (!workingDueEntries.length && !loadingDue) {
                workingDueEntries = await loadDueAndPending();
            }

            // The mic request was already triggered above; render its status only
            // after entering the session so errors do not appear behind the picker.
            addTranscriptBreadcrumb('Requesting microphone permission');
            const microphonePermission = await microphonePermissionPromise;
            if (!microphonePermission.ok) {
                throw microphonePermission.error;
            }
            addTranscriptBreadcrumb('Microphone permission granted');

            memoryConsolidationBaselineRef.current = {
                sessionId: sessionIdForMemoryBaseline || null,
                messageCount: existingMessageCountAtConnect,
            };
            debugSessionResume("memoryBaseline:setOnConnect", {
                sessionId: sessionIdForMemoryBaseline || null,
                messageCount: existingMessageCountAtConnect,
                selectedSessionId,
            });

            addTranscriptBreadcrumb('Connecting to voice agent');
            addTranscriptBreadcrumb('Trying to remember something from past');
            const persistedEnvelope = await loadGlobalReviewProgress(userId);
            const unwrappedProgress = unwrapGlobalReviewProgress(persistedEnvelope);
            let persistedReviewRunId = unwrappedProgress.reviewRunId;
            const persistedLegacyProgress = unwrappedProgress.legacyProgress;
            const persistedExpressionAssistRunId = runContextRef.current?.context
                ?.activeExpressionAssistRunId || null;
            let persistedProgress = persistedLegacyProgress;
            let runtimeContext = null;

            // If persisted global progress references words no longer in current due list,
            // treat it as stale and rebuild scenes from fresh due entries.
            if (persistedProgress?.rolePlayPlan && !persistedProgress?.reviewComplete) {
                const dueIdSet = new Set((workingDueEntries || []).map((e) => String(e?.id || "")));
                const persistedWordIds = (persistedProgress?.vocabularyWords || [])
                    .map((w) => String(w?.id || ""))
                    .filter((id) => id.length > 0);

                const hasDanglingWords = persistedWordIds.some((id) => !dueIdSet.has(id));

                if (hasDanglingWords) {
                    await clearGlobalReviewProgress(userId);
                    persistedReviewRunId = null;
                    persistedProgress = null;
                    addTranscriptBreadcrumb("Saved review progress was outdated. Starting fresh with current due words.");
                }
            }

            if (persistedProgress?.rolePlayPlan && !persistedProgress?.reviewComplete) {
                addTranscriptBreadcrumb("Restored unfinished review progress");
                let latestSemantic = null;
                try {
                    const bootstrap = await loadMemoryBootstrap(userId);
                    latestSemantic = bootstrap?.memory?.semantic ?? null;
                    if (bootstrap?.memory) {
                        memoryRef.current = bootstrap.memory;
                    }
                } catch {
                    // Keep existing persisted context if bootstrap fails.
                }
                const restoredTone = String(
                    latestSemantic?.profile?.agentVoice?.tone?.sanitized
                    || latestSemantic?.profile?.agentTone?.sanitized
                    || latestSemantic?.profile?.agentTone
                    || persistedProgress?.agentTone
                    || persistedProgress?.memory?.semantic?.profile?.agentTone?.sanitized
                    || persistedProgress?.memory?.semantic?.profile?.agentTone
                    || ""
                ).trim();
                const restoredVoiceProfile = normalizeVoiceProfile(
                    latestSemantic?.profile?.agentVoice?.soundProfile
                    || persistedProgress?.agentVoiceProfile
                    || "shimmer"
                );
                const restoredTestingText = String(
                    latestSemantic?.profile?.agentVoice?.testingText?.sanitized
                    || persistedProgress?.agentVoiceTestingText
                    || ""
                ).trim();
                const restoredBehaviorLevel = normalizeCorrectionLevel(
                    latestSemantic?.profile?.agentBehavior?.correctionLevel
                    || latestSemantic?.profile?.correctionLevel
                    || persistedProgress?.agentBehaviorLevel
                );
                runtimeContext = {
                    ...persistedProgress,
                    memory: {
                        ...(persistedProgress?.memory || {}),
                        ...(latestSemantic ? { semantic: latestSemantic } : {}),
                    },
                    currentSceneStep: persistedProgress.currentSceneStep || "NEED_SCENE",
                    currentSceneMode: persistedProgress.currentSceneMode || "REVIEW",
                    reviewComplete: false,
                    resumableHistory: runContextRef.current?.context?.resumableHistory ?? [],
                    agentTone: restoredTone,
                    agentVoiceProfile: restoredVoiceProfile,
                    agentVoiceTestingText: restoredTestingText,
                    agentBehaviorLevel: restoredBehaviorLevel,
                };
                setPracticeMode(String(runtimeContext.currentSceneMode || "UNKNOWN").toUpperCase());

                if (runtimeContext?.currentScene?.targetWords?.length) {
                    setActiveWords(runtimeContext.currentScene.targetWords);
                }
            } else {
                // Connect first, then let teacher decide FREE_CHAT or REVIEW.
                // Scene planning now happens only when prepare_review_mode is called.
                const { memory } = await loadMemoryBootstrap(userId);
                memoryRef.current = memory;
                const customAgentTone = String(
                    memory?.semantic?.profile?.agentVoice?.tone?.sanitized
                    || memory?.semantic?.profile?.agentTone?.sanitized
                    || memory?.semantic?.profile?.agentTone
                    || ""
                ).trim();
                const selectedVoiceProfile = normalizeVoiceProfile(
                    memory?.semantic?.profile?.agentVoice?.soundProfile
                    || "shimmer"
                );
                const selectedVoiceTestingText = String(
                    memory?.semantic?.profile?.agentVoice?.testingText?.sanitized || ""
                ).trim();
                const selectedBehaviorLevel = normalizeCorrectionLevel(
                    memory?.semantic?.profile?.agentBehavior?.correctionLevel
                    || memory?.semantic?.profile?.correctionLevel
                );

                runtimeContext = {
                    vocabularyWords: workingDueEntries.map(e => ({
                        id: e.id,
                        text: e.text,
                        definition: e.definition,
                        example: e.example,
                        exampleTrans: e.exampleTrans,
                        realLifeDef: e.realLifeDef,
                        surroundingText: e.surroundingText,
                        videoTitle: e.videoTitle,
                        learningContext: e.learningContext,
                        fsrsCard: e.fsrsCard,
                    })),
                    totalWords: workingDueEntries.length,

                    memory: {
                        semantic: memory?.semantic ?? null,
                        episodic: memory?.episodic ?? null,
                        procedural: memory?.procedural ?? null,
                        semanticHints: [],
                    },
                    rolePlayPlan: null,
                    currentSceneIndex: 0,
                    reviewComplete: false,
                    currentSceneStep: "CHOOSE_MODE",
                    currentSceneMode: "MODE_SELECT",
                    currentUserFocus: "",
                    resumableHistory: runContextRef.current?.context?.resumableHistory ?? [],
                    agentTone: customAgentTone,
                    agentVoiceProfile: selectedVoiceProfile,
                    agentVoiceTestingText: selectedVoiceTestingText,
                    agentBehaviorLevel: selectedBehaviorLevel,
                };
                setPracticeMode(String(runtimeContext.currentSceneMode || "UNKNOWN").toUpperCase());
            }

            runContextRef.current = { context: runtimeContext };
            let initialAgent = vocabularyTeacherAgent;
            let graphStart = null;
            let expressionAssistGraphStart = null;
            if (REVIEW_GRAPH_ENABLED) {
                try {
                    const queue = reviewGraphQueueRef.current;
                    if (!queue) throw new Error("Review graph queue is not initialized");
                    graphStart = await startReviewGraphRun({
                        userId,
                        sessionId: sessionIdForMemoryBaseline,
                        dueWords: runtimeContext.vocabularyWords,
                        legacyProgress: persistedProgress,
                        reviewRunId: persistedReviewRunId || runtimeContext.activeReviewRunId || null,
                    });
                    await queue.setRun(graphStart);
                } catch (error) {
                    if (REVIEW_GRAPH_AUTHORITY) throw error;
                    console.error("Review graph shadow start failed; continuing with legacy workflow", error);
                }
            }
            if (EXPRESSION_ASSIST_GRAPH_ENABLED) {
                try {
                    expressionAssistGraphStart = await startExpressionAssistControlRun({
                        assistRunId: persistedExpressionAssistRunId,
                        sourceSessionId: sessionIdForMemoryBaseline,
                    });
                    runtimeContext.activeExpressionAssistRunId = expressionAssistGraphStart.assistRunId;
                    runtimeContext.expressionAssistControlPacket = expressionAssistGraphStart.controlPacket;
                } catch (error) {
                    if (EXPRESSION_ASSIST_GRAPH_AUTHORITY) throw error;
                    console.error(
                        "Expression Assist graph shadow start failed; continuing with V1 tool flow",
                        error,
                    );
                }
            }

            if (REVIEW_GRAPH_AUTHORITY) {
                const packet = reviewControlPacketRef.current || graphStart?.controlPacket;
                if (!packet) throw new Error("Review graph returned no control packet");
                initialAgent = createVocabularyTeacherAgent({
                    controlPacket: packet,
                    tools: selectReviewGraphTools(
                        packet,
                        buildReviewGraphTools(packet),
                        expressionSaveTool,
                        effectiveExpressionAssistTool,
                    ),
                    voice: normalizeVoiceProfile(runtimeContext?.agentVoiceProfile),
                });
            } else {
                // Keep the legacy tools intact for off mode and as the shadow-mode authority.
                vocabularyTeacherAgent.tools = [
                    sceneTools.choosePracticeMode,
                    sceneTools.prepareReviewMode,
                    sceneTools.pauseReviewMode,
                    sceneTools.resumeReviewMode,
                    sceneTools.getNextScene,
                    sceneTools.startScene,
                    sceneTools.markSceneDone,
                    sceneTools.requestSceneRating,
                    expressionSaveTool,
                    ...(effectiveExpressionAssistTool ? [effectiveExpressionAssistTool] : []),
                ];
                vocabularyTeacherAgent.voice = normalizeVoiceProfile(runtimeContext?.agentVoiceProfile);
            }

            await connect({
                getEphemeralKey: fetchEphemeralKey,
                initialAgents: [initialAgent],
                audioElement: sdkAudioElement,
                extraContext: runtimeContext,
                responseControlMode: EXPRESSION_ASSIST_GRAPH_AUTHORITY
                    && (
                        (reviewControlPacketRef.current || graphStart?.controlPacket)?.phase === "FREE_CHAT"
                        || String(runtimeContext.currentSceneMode || "").toUpperCase() === "FREE_CHAT"
                    )
                    ? "manual"
                    : "automatic",
            });
            addTranscriptBreadcrumb('Connected! Start speaking to practice');

        } catch (error) {
            console.error('Connection failed:', error);
            addTranscriptBreadcrumb('Connection failed');
            const msg = String(error?.message || "").toLowerCase();
            if (msg.includes("microphone permission denied")) {
                addTranscriptBreadcrumb(
                    "Microphone blocked. Allow mic access."
                );
            } else if (msg.includes("no microphone device found")) {
                addTranscriptBreadcrumb("No microphone detected. Connect a mic and retry.");
            }
        } finally {
            startPracticeLockRef.current = false;
            setStartInProgress(false);
        }
    };

    // Sync review updates both after a completed review and on disconnect.
    const flushPendingReviewUpdates = useCallback(async () => {
        const pending = await loadPendingReviewUpdates(userId);

        if (!pending.length) {
            addTranscriptBreadcrumb("No pending review updates to sync");
            return { reviewedWordIds: [], difficultWordIds: [] };
        }

        // Backend CardUpdateInput does NOT include rating/evidence; strip extras
        const updates = pending.map((item) => Object.fromEntries(
            Object.entries(item).filter(([key]) => key !== "rating" && key !== "evidence")
        ));

        addTranscriptBreadcrumb(`Syncing ${updates.length} review updates`);
        const result = await saveReviewSession(updates);

        if (!result?.success) {
            throw new Error(result?.message || "saveReviewSession failed");
        }

        await clearPendingReviewUpdates(userId);
        addTranscriptBreadcrumb(`Synced ${result.savedCount} updates`);

        const difficult = pending
            .filter(p => (p.rating ?? 4) <= 2)
            .map(p => p.vocabularyId);
        return {
            reviewedWordIds: pending.map((p) => p.vocabularyId).filter(Boolean),
            difficultWordIds: difficult.filter(Boolean),
        };
    }, [addTranscriptBreadcrumb, userId]);

    const waitForSceneRatingDrain = useCallback(async (timeoutMs = 20000) => {
        const startedAt = Date.now();
        while (sceneRatingWorkerRunningRef.current || sceneRatingQueueRef.current.length > 0) {
            if (Date.now() - startedAt > timeoutMs) {
                addTranscriptBreadcrumb("Background rating is still running; syncing available updates now");
                break;
            }
            await new Promise((resolve) => setTimeout(resolve, 150));
        }
    }, [addTranscriptBreadcrumb]);

    const resetSceneReview = useCallback(async () => {
        if (!REVIEW_GRAPH_AUTHORITY) {
            throw new Error("Scene review reset requires authority mode");
        }
        const queue = reviewGraphQueueRef.current;
        if (!queue?.reviewRunId) {
            throw new Error("Review graph run is not initialized");
        }

        if (sceneRatingWorkerRunningRef.current || sceneRatingQueueRef.current.length > 0) {
            addTranscriptBreadcrumb("Finishing the current scene rating before reset");
            await waitForSceneRatingDrain();
        }
        await queue.flush();
        await flushPendingReviewUpdates();

        const context = runContextRef.current?.context || {};
        const sourceSessionId = selectedSessionIdRef.current
            || reviewControlPacketRef.current?.sourceSessionId
            || null;
        if (!sourceSessionId) {
            throw new Error("Cannot reset review without an active voice session");
        }

        const freshRun = await startReviewGraphRun({
            userId,
            sessionId: sourceSessionId,
            dueWords: Array.isArray(context.vocabularyWords)
                ? context.vocabularyWords
                : dueEntries,
            reviewRunId: queue.reviewRunId,
            legacyProgress: null,
            restart: true,
        });

        removeBreadcrumbsByKinds([
            "NOW_REVIEWING",
            "REVIEW_SCENE",
            "REVIEW_STATUS",
            "REVIEW_MODE",
            "REVIEW_ERROR",
            "REVIEW_RESET",
        ], []);
        reviewEffectsInFlightRef.current.clear();
        sceneRatingStatusRef.current.clear();
        await queue.setRun(freshRun);

        const nextContext = runContextRef.current?.context || {};
        await saveGlobalReviewProgress(userId, {
            schemaVersion: 2,
            activeReviewRunId: freshRun.reviewRunId,
            controlPacket: freshRun.controlPacket,
            legacyMirror: buildLegacyReviewMirror(nextContext),
            status: "in_progress",
        });
        return freshRun;
    }, [
        addTranscriptBreadcrumb,
        dueEntries,
        flushPendingReviewUpdates,
        removeBreadcrumbsByKinds,
        userId,
        waitForSceneRatingDrain,
    ]);

    useEffect(() => {
        resetSceneReviewRef.current = resetSceneReview;
    }, [resetSceneReview]);

    const persistConversationMemory = useCallback(async ({ difficultWordIds = [] } = {}) => {
        const messages = getConversationMessages(transcriptItemsRef.current);
        const baseline = memoryConsolidationBaselineRef.current;
        const currentSessionId = selectedSessionIdRef.current;
        const sessionIdForMemory = baseline?.sessionId || currentSessionId || null;
        const baselineCount = Math.max(0, Number(baseline?.messageCount || 0));
        const incrementalMessages = messages.slice(baselineCount);
        debugSessionResume("persistConversationMemory:delta", {
            sessionIdForMemory,
            selectedSessionId: currentSessionId,
            baselineSessionId: baseline?.sessionId || null,
            baselineCount,
            totalMessages: messages.length,
            incrementalMessages: incrementalMessages.length,
        });

        const vocabularyForSession =
            runContextRef.current?.context?.vocabularyWords
            || dueEntries
            || [];
        const sessionVideoTitles = [...new Set(
            vocabularyForSession
                .map((w) => String(w?.videoTitle || "").trim())
                .filter((t) => t.length > 0)
        )];

        if (incrementalMessages.length <= 4) {
            return {
                skipped: true,
                reason: "Not enough turns to shape memory",
            };
        }

        const result = await consolidateSemanticMemory({
            userId,
            messages: incrementalMessages,
            videoTitles: sessionVideoTitles,
            sessionId: sessionIdForMemory,
            difficultWordIds,
        });
        memoryConsolidationBaselineRef.current = {
            sessionId: sessionIdForMemory,
            messageCount: messages.length,
        };
        if (result?.memory?.semantic) {
            memoryRef.current = {
                ...(memoryRef.current || {}),
                semantic: result.memory.semantic,
                episodic: result?.memory?.episodic ?? memoryRef.current?.episodic ?? null,
                procedural: result?.memory?.procedural ?? memoryRef.current?.procedural ?? null,
            };
        }
        return result;
    }, [dueEntries, getConversationMessages, userId]);

    const syncReviewAndMemory = useCallback(() => {
        if (reviewDataSyncPromiseRef.current) {
            return reviewDataSyncPromiseRef.current;
        }

        const syncTask = (async () => {
            let reviewSyncSummary = { difficultWordIds: [] };
            try {
                reviewSyncSummary = await flushPendingReviewUpdates();
                if (runContextRef.current?.context?.reviewComplete) {
                    await clearGlobalReviewProgress(userId);
                }
            } catch (e) {
                addTranscriptBreadcrumb(`Sync failed (will retry next time): ${e.message || e}`);
            }

            try {
                removeBreadcrumbsByKinds(
                    ["MEMORY_SHAPING", "MEMORY_SHAPED"],
                    ["Shaping your memory", "Memory shaped"]
                );
                addTranscriptBreadcrumb("Shaping your memory", { kind: "MEMORY_SHAPING" });
                const memoryResult = await persistConversationMemory({
                    difficultWordIds: reviewSyncSummary?.difficultWordIds || [],
                });
                removeBreadcrumbsByKinds(
                    ["MEMORY_SHAPING", "MEMORY_SHAPED"],
                    ["Shaping your memory", "Memory shaped"]
                );
                if (memoryResult?.skipped) {
                    addTranscriptBreadcrumb("Memory shaping skipped", {
                        kind: "MEMORY_SHAPED",
                        reason: memoryResult.reason || "Not enough turns",
                    });
                } else {
                    addTranscriptBreadcrumb("Memory shaped", { kind: "MEMORY_SHAPED" });
                }
            } catch (e) {
                removeBreadcrumbsByKinds(
                    ["MEMORY_SHAPING"],
                    ["Shaping your memory"]
                );
                addTranscriptBreadcrumb(`Memory update skipped: ${e.message || e}`);
            }
        })();

        const trackedTask = syncTask.finally(() => {
            if (reviewDataSyncPromiseRef.current === trackedTask) {
                reviewDataSyncPromiseRef.current = null;
            }
        });
        reviewDataSyncPromiseRef.current = trackedTask;
        return trackedTask;
    }, [
        addTranscriptBreadcrumb,
        flushPendingReviewUpdates,
        persistConversationMemory,
        removeBreadcrumbsByKinds,
        userId,
    ]);

    useEffect(() => {
        syncReviewAndMemoryRef.current = syncReviewAndMemory;
    }, [syncReviewAndMemory]);

    // // TEST flush update
    // useEffect(() => {
    //     window.__flushReview = flushPendingReviewUpdates;
    //     return () => {
    //         delete window.__flushReview;
    //     };
    // }, [flushPendingReviewUpdates]);

    // Disconnect from API
    const handleStopPractice = useCallback(async () => {
        if (stopPracticeInProgressRef.current) return;
        stopPracticeInProgressRef.current = true;

        disconnect();
        void flushVoiceSessionTrace();
        setPracticeMode("DISCONNECTED");
        addTranscriptBreadcrumb('Disconnected from voice agent');

        try {
            if (sceneRatingWorkerRunningRef.current || sceneRatingQueueRef.current.length > 0) {
                addTranscriptBreadcrumb("Waiting for background scene rating to finish");
                await waitForSceneRatingDrain();
            }
            await syncReviewAndMemory();
        } finally {
            stopPracticeInProgressRef.current = false;
        }
    }, [
        addTranscriptBreadcrumb,
        disconnect,
        syncReviewAndMemory,
        waitForSceneRatingDrain,
    ]);

    // Cleanup audio element
    useEffect(() => {
        return () => {
            if (sdkAudioElement && document.body.contains(sdkAudioElement)) {
                document.body.removeChild(sdkAudioElement);
            }
        };
    }, [sdkAudioElement]);

    const handleWordLearnToday = useCallback(async (vocabularyId) => {
        try {
            const end = new Date();
            end.setHours(23, 59, 59, 999);
            await updateVocabularyDueDate(userId, vocabularyId, formatLocalDateTime(end));
            await loadWordList();
        } catch (e) {
            setWordListError(e?.message || "Failed to update due date");
        }
    }, [loadWordList, userId]);

    const handleWordDelete = useCallback(async (vocabularyId) => {
        try {
            await deleteVocabularyEntry(userId, vocabularyId);
            await loadWordList();
        } catch (e) {
            setWordListError(e?.message || "Failed to delete word");
        }
    }, [loadWordList, userId]);

    const reviewModeLabel = useMemo(() => {
        if (status !== "CONNECTED") {
            return "Not reviewing vocabulary";
        }

        const ctx = runContextRef.current?.context || {};
        if (REVIEW_GRAPH_AUTHORITY && reviewControlPacket) {
            if (["FREE_CHAT", "PAUSED"].includes(reviewControlPacket.phase)) {
                return "Free-style chat mode";
            }
            if (reviewControlPacket.phase === "DONE") {
                return "Review completed";
            }
            if (["AWAIT_THEME", "PLANNING", "IN_SCENE"].includes(reviewControlPacket.phase)) {
                return "Reviewing due vocabulary";
            }
            if (reviewControlPacket.phase === "CHOOSE_MODE") {
                return "Choose review mode";
            }
        }
        if (ctx.currentSceneMode === "FREE_CHAT") {
            return "Free-style chat mode";
        }
        if (ctx.reviewComplete) {
            return "Review completed";
        }
        if (ctx.rolePlayPlan?.scenes?.length) {
            return "Reviewing due vocabulary";
        }
        if (ctx.currentSceneStep === "CHOOSE_MODE") {
            return "Choose review mode";
        }
        return "Not reviewing vocabulary";
    }, [reviewControlPacket, status, transcriptItems.length]);

    const reviewStatusByWordId = useMemo(() => {
        const result = {};
        if (status !== "CONNECTED") return result;

        const ctx = runContextRef.current?.context || {};
        if (REVIEW_GRAPH_AUTHORITY && reviewControlPacket) {
            (reviewControlPacket.completedTargetIds || []).forEach((id) => {
                if (id) result[id] = "done";
            });
            if (reviewControlPacket.phase === "IN_SCENE") {
                (reviewControlPacket.activeScene?.targetWordIds || []).forEach((id) => {
                    if (id && result[id] !== "done") result[id] = "in_progress";
                });
            }
            return result;
        }
        if (!ctx.rolePlayPlan?.scenes?.length) return result;

        const scenes = ctx.rolePlayPlan.scenes || [];
        const completedWordIds = new Set();
        const completedSceneCount = ctx.reviewComplete
            ? scenes.length
            : Math.max(0, Number(ctx.currentSceneIndex || 0));

        for (let i = 0; i < completedSceneCount && i < scenes.length; i += 1) {
            const ids = scenes[i]?.targetWordIds || [];
            ids.forEach((id) => {
                if (id) completedWordIds.add(id);
            });
        }

        completedWordIds.forEach((id) => {
            result[id] = "done";
        });

        if (!ctx.reviewComplete && ctx.currentSceneMode !== "FREE_CHAT") {
            const activeIds = ctx.currentScene?.targetWordIds || [];
            activeIds.forEach((id) => {
                if (id && !completedWordIds.has(id)) {
                    result[id] = "in_progress";
                }
            });
        }

        return result;
    }, [reviewControlPacket, status, transcriptItems.length]);

    // // test
    // const handleFsrsTest = async () => {
    //     try {
    //         const first = dueEntries[0];
    //         if (!first) {
    //             addTranscriptBreadcrumb("No due entries to test FSRS.");
    //             return;
    //         }

    //         const updated = await fsrsReview({
    //             fsrsCard: first.fsrsCard,
    //             rating: 3, // Good
    //         });

    //         console.log("[FSRS TEST] updated:", updated);
    //         addTranscriptBreadcrumb(`FSRS ok → next due: ${updated.dueDate}`);
    //     } catch (e) {
    //         console.error("[FSRS TEST] error:", e);
    //         addTranscriptBreadcrumb(`FSRS failed: ${e.message || e}`);
    //     }
    // };

    const showInitialSessionPage = sessionPanelMode === "initial" && overlayOpen;
    const showSessionOverlay =
        sessionBootstrapped &&
        sessionPanelMode === "drawer" &&
        drawerActivated;
    const showWordOverlay =
        sessionBootstrapped &&
        sessionPanelMode === "drawer" &&
        wordDrawerActivated &&
        canShowWordList;
    const showKeyboardTestComposer =
        ENABLE_KEYBOARD_TEST_INPUT &&
        status === "CONNECTED" &&
        sessionPanelMode === "drawer" &&
        !overlayOpen &&
        !showWordOverlay;

    const handleSendKeyboardInput = useCallback(async (text) => {
        const result = sendTextMessage(text);
        return result;
    }, [sendTextMessage]);

    const handleBackButton = useCallback(() => {
        if (showInitialSessionPage) {
            onNavigateBack();
            return;
        }

        setOpeningSessionId(null);
        setSessionPanelMode("initial");
        setOverlayOpen(true);
        setDrawerActivated(false);
        setWordOverlayOpen(false);
        setWordDrawerActivated(false);

        if (status === "CONNECTED" || status === "CONNECTING") {
            handleStopPractice().catch((error) => {
                console.error("Failed to stop practice before returning to sessions", error);
            });
        }
    }, [handleStopPractice, onNavigateBack, showInitialSessionPage, status]);

    return (
        <div className={`voice-page${showKeyboardTestComposer ? " has-keyboard-input" : ""}${showInitialSessionPage ? " is-session-picker-page" : ""}`}>
            <div className="voice-transcript-wrapper" ref={transcriptWrapperRef}>
                {showInitialSessionPage ? (
                    <PracticeSessionOverlay
                        sessions={sessions}
                        loading={sessionsLoading || !sessionBootstrapped}
                        selectedSessionId={selectedSessionId}
                        openingSessionId={openingSessionId}
                        onChooseSession={handleChooseInitialSession}
                        onCreateNew={createAndSelectSession}
                        onRenameSession={renameSelectedSession}
                        onDeleteSession={deleteSelectedSession}
                        open={true}
                        variant="initial"
                        drawerAnchorX={drawerAnchorX}
                    />
                ) : (
                    <>
                        <Transcript
                            userText=""
                            setUserText={() => {
                            }}
                            onSendMessage={() => {
                            }}
                            canSend={false}
                            downloadRecording={() => console.log("Download clicked")}
                            isVoiceOnly={true}
                            onDeferExpression={handleDeferExpression}
                            onLearnTodayExpression={handleLearnTodayExpression}
                            onSaveExpression={handleSaveExpression}
                        />
                        {showSessionOverlay ? (
                            <PracticeSessionOverlay
                                sessions={sessions}
                                loading={sessionsLoading || !sessionBootstrapped}
                                selectedSessionId={selectedSessionId}
                                onChooseSession={setSelectedSessionId}
                                onCreateNew={createAndSelectSession}
                                onRenameSession={renameSelectedSession}
                                onDeleteSession={deleteSelectedSession}
                                open={overlayOpen}
                                variant={sessionPanelMode}
                                drawerAnchorX={drawerAnchorX}
                            />
                        ) : null}
                        {showWordOverlay ? (
                            <WordListOverlay
                                entries={wordListEntries}
                                loading={wordListLoading}
                                error={wordListError}
                                open={wordOverlayOpen}
                                variant="drawer"
                                drawerAnchorX={wordDrawerAnchorX}
                                reviewModeLabel={reviewModeLabel}
                                reviewStatusByWordId={reviewStatusByWordId}
                                disableEditing={status === "CONNECTED"}
                                disableEditingHint="Disconnect first to edit your word list."
                                onLearnToday={handleWordLearnToday}
                                onDelete={handleWordDelete}
                                onClose={() => {
                                    setWordOverlayOpen(false);
                                    setWordDrawerActivated(false);
                                }}
                            />
                        ) : null}
                    </>
                )}
            </div>
            <KeyboardTestComposer
                visible={!showInitialSessionPage && showKeyboardTestComposer}
                disabled={status !== "CONNECTED"}
                onSend={handleSendKeyboardInput}
            />
            <div className="voice-footer">
                <button
                    className="voice-back-button"
                    onClick={handleBackButton}
                    aria-label="Back to captions"
                    title="Back to captions"
                >
                    &lt;
                </button>

                {!showInitialSessionPage && (status === 'DISCONNECTED' || status === 'CONNECTING') && (<button
                    onClick={handleStartPractice}
                    className={`voice-connect-button${isConnecting ? " is-connecting" : ""}`}
                    disabled={isConnecting || startInProgress || !!dueError || loadingDue}
                >
                    {isConnecting || startInProgress ? 'Connecting' : 'Connect'}
                </button>)}

                {!showInitialSessionPage && status === 'CONNECTED' && (<button
                    onClick={handleStopPractice}
                    className="voice-disconnect-button"
                >
                    Disconnect
                </button>)}

                {!showInitialSessionPage && canShowWordList && (
                    <button
                        onClick={toggleWordPanel}
                        className={`voice-session-toggle-button${wordOverlayOpen ? " is-open" : ""}`}
                        ref={wordToggleButtonRef}
                    >
                        {wordOverlayOpen ? "Close" : "Word List"}
                    </button>
                )}
                {/* <button className="voice-disconnect-button" onClick={handleFsrsTest}>
                    FSRS Test
                </button> */}
            </div>
        </div>);
}

function VoiceAgent({ onNavigateBack, userId }) {
    return (<TranscriptProvider>
        <VoiceAgentContent onNavigateBack={onNavigateBack} userId={userId} />
    </TranscriptProvider>);
}

export default VoiceAgent;
