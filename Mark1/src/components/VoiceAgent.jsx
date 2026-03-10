import React, { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { TranscriptProvider, useTranscript } from "../contexts/TranscriptContext";
import { Transcript } from "./Transcript";
import { useRealtimeSession } from "../hooks/useRealtimeSession";
import { vocabularyTeacherAgent } from "../agentConfigs/vocabularyTeacher";
import {
    startReviewSession,
    fetchVocabularyEntries,
    updateVocabularyDueDate,
    deleteVocabularyEntry,
} from "../utils/graphql";
import { fetchRolePlayPlan } from "../utils/rolePlayClient";
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

// Import memory tool
import { loadMemoryBootstrap, searchSemanticMemory, updateMemoryBucket, addSemanticMemory, consolidateSemanticMemory } from
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
const ENABLE_KEYBOARD_TEST_INPUT = true;

function VoiceAgentContent({ onNavigateBack, userId }) {
    const {
        addTranscriptBreadcrumb,
        setActiveWords,
        transcriptItems,
        activeWords,
        setTranscriptSnapshot,
        clearTranscript,
        removeBreadcrumbsByKinds,
    } = useTranscript();
    const [isConnecting, setIsConnecting] = useState(false);
    const memoryRef = useRef(null);
    const transcriptWrapperRef = useRef(null);
    const sceneRatingQueueRef = useRef([]);
    const sceneRatingWorkerRunningRef = useRef(false);
    const runContextRef = useRef({ context: {} });
    const sceneRatingStatusRef = useRef(new Map());
    const connectionStatusRef = useRef("DISCONNECTED");
    const stopPracticeInProgressRef = useRef(false);
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
    const [startInProgress, setStartInProgress] = useState(false);
    const [drawerAnchorX] = useState(null);
    const [wordListEntries, setWordListEntries] = useState([]);
    const [wordListLoading, setWordListLoading] = useState(false);
    const [wordListError, setWordListError] = useState("");
    const [wordOverlayOpen, setWordOverlayOpen] = useState(false);
    const [wordDrawerActivated, setWordDrawerActivated] = useState(false);
    const [wordDrawerAnchorX, setWordDrawerAnchorX] = useState(null);
    const [practiceMode, setPracticeMode] = useState("UNKNOWN");

    const entriesByIdRef = useRef(new Map());
    const persistTimerRef = useRef(null);
    const startPracticeLockRef = useRef(false);
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
            resumableHistory: ctx.resumableHistory ?? [],
            agentTone: String(ctx.agentTone || ""),
            agentVoiceProfile: normalizeVoiceProfile(ctx.agentVoiceProfile),
            agentVoiceTestingText: String(ctx.agentVoiceTestingText || ""),
            agentBehaviorLevel: normalizeCorrectionLevel(ctx.agentBehaviorLevel),
        };
    }, []);

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

    const stripTransientBreadcrumbs = useCallback((items = []) => {
        return (items || []).filter((item) => {
            if (item?.type !== "BREADCRUMB") return true;
            const title = String(item?.title || "");
            return !TRANSIENT_BREADCRUMB_PREFIXES.some((prefix) => title.startsWith(prefix));
        });
    }, []);

    // Tools for scene-based role-play
    const enqueueSceneRating = useCallback((payload) => {
        const sceneId = payload?.scene?.id || payload?.scene?.title;
        if (!sceneId) return;

        const status = sceneRatingStatusRef.current.get(sceneId);
        if (status === "pending" || status === "done") {
            // addTranscriptBreadcrumb(`Rating already queued for scene "${payload.scene.title}"`);
            return;
        }
        sceneRatingStatusRef.current.set(sceneId, "pending");
        sceneRatingQueueRef.current.push(payload);
        runSceneRatingWorker(); // Call Rater Agent to rate words in scene in background
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

        let semanticHints = Array.isArray(ctx?.memory?.semanticHints)
            ? ctx.memory.semanticHints
            : [];

        if (!semanticHints.length) {
            const profileSignals = [
                ...((semanticMemory?.profile?.coreInterests || []).map((item) => item?.label).filter(Boolean)),
                ...((semanticMemory?.profile?.coreVideoTopics || []).map((item) => item?.label).filter(Boolean)),
                ...((semanticMemory?.profile?.corePreferences || []).map((item) => item?.label).filter(Boolean)),
            ];
            const query = [
                ...profileSignals,
                ...(semanticMemory?.interests || []),
                ...dueWords.map((w) => w.text),
                cleanedFocus,
            ].join(" ").trim();

            if (query.length > 0) {
                const semanticResults = await searchSemanticMemory({
                    userId,
                    query,
                    k: 5,
                });
                semanticHints = semanticResults.results ?? [];
            }
        }

        addTranscriptBreadcrumb("Planning role-play scenes");
        const rolePlayPlan = await fetchRolePlayPlan({
            dueWords,
            memory: { semantic: semanticMemory },
            semanticHints,
            currentUserFocus: cleanedFocus,
        });

        return {
            rolePlayPlan,
            memoryPatch: {
                semantic: semanticMemory,
                semanticHints,
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
    }), [addTranscriptBreadcrumb, enqueueSceneRating, buildRolePlayPlanFromRuntime, setActiveWords]);

    const runSceneRatingWorker = useCallback(async () => {
        if (sceneRatingWorkerRunningRef.current) return;
        sceneRatingWorkerRunningRef.current = true;

        try {
            while (sceneRatingQueueRef.current.length > 0) {
                const job = sceneRatingQueueRef.current.shift();
                if (!job?.scene?.targetWordIds?.length) continue;
                const { scene, evidence } = job;
                const sceneId = scene.sceneId || scene.title;

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
                        if (result?.ok !== true) {
                            const reason = typeof result === "string"
                                ? result
                                : (result?.reason || result?.error || "unknown reason");
                            throw new Error(`submit_word_rating failed: ${reason}`);
                        }
                    }
                    sceneRatingStatusRef.current.set(sceneId, "done");
                    addTranscriptBreadcrumb(`Scene rated: ${scene.title}`);

                    if (runContextRef.current?.context?.reviewComplete) {
                        await handleStopPractice({ fromRatingWorker: true });
                    }
                } catch (err) {
                    sceneRatingStatusRef.current.set(sceneId, "failed");
                    addTranscriptBreadcrumb(`Scene rating failed: ${scene.title} (${err?.message || err})`);
                    console.error("rateScene failed", err);
                }
            }
        } finally {
            sceneRatingWorkerRunningRef.current = false;
        }
    }, [addTranscriptBreadcrumb, dueEntries]);


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

    const openSelectedSession = useCallback(async () => {
        let targetSessionId = selectedSessionId;
        if (!targetSessionId) {
            const created = await createVoiceSession(userId, { title: "New session" });
            targetSessionId = created.sessionId;
            await refreshSessionList({ withLoading: true });
        }

        const snapshot = await loadVoiceSessionSnapshot(userId, targetSessionId);
        const cleanedItems = stripTransientBreadcrumbs(snapshot?.transcriptItems || []);
        if (cleanedItems.length || snapshot?.activeWords?.length) {
            setTranscriptSnapshot({
                items: cleanedItems,
                words: snapshot.activeWords || [],
            });
        } else {
            clearTranscript();
        }

        const resumableHistory = buildResumableHistory(cleanedItems);
        runContextRef.current = {
            context: {
                ...(snapshot?.runtimeContext ?? {}),
                resumableHistory,
            }
        };
        await setActiveVoiceSession(userId, targetSessionId);
        setSelectedSessionId(targetSessionId);
        const loadedDueEntries = await loadDueAndPending();
        await loadWordList();
        setOverlayOpen(false);
        setSessionPanelMode("drawer");
        setDrawerActivated(false);
        setWordOverlayOpen(false);
        setWordDrawerActivated(false);
        return { sessionId: targetSessionId, dueEntries: loadedDueEntries };
    }, [
        buildResumableHistory,
        clearTranscript,
        loadDueAndPending,
        loadWordList,
        refreshSessionList,
        selectedSessionId,
        setTranscriptSnapshot,
        stripTransientBreadcrumbs,
        userId,
    ]);

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

                if (ctx?.rolePlayPlan && !ctx.reviewComplete) {
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
    const { status, connect, disconnect, sendTextMessage } = useRealtimeSession({
        onConnectionChange: (newStatus) => {
            // console.log('Connection status changed:', newStatus);
            connectionStatusRef.current = newStatus;
            setIsConnecting(newStatus === 'CONNECTING');
        },
    });

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
            // Request microphone permission immediately while click interaction is still fresh.
            addTranscriptBreadcrumb('Requesting microphone permission');
            await requestMicrophonePermission();
            addTranscriptBreadcrumb('Microphone permission granted');

            let workingDueEntries = dueEntries;
            if (overlayOpen || !selectedSessionId) {
                const opened = await openSelectedSession();
                workingDueEntries = opened?.dueEntries ?? [];
            } else if (!workingDueEntries.length && !loadingDue) {
                workingDueEntries = await loadDueAndPending();
            }

            addTranscriptBreadcrumb('Connecting to voice agent');
            addTranscriptBreadcrumb('Trying to remember something from past');
            let persistedProgress = await loadGlobalReviewProgress(userId);
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
                const profileSignals = [
                    ...((memory?.semantic?.profile?.coreInterests || []).map((item) => item?.label).filter(Boolean)),
                    ...((memory?.semantic?.profile?.coreVideoTopics || []).map((item) => item?.label).filter(Boolean)),
                    ...((memory?.semantic?.profile?.corePreferences || []).map((item) => item?.label).filter(Boolean)),
                ];
                const query = [
                    ...profileSignals,
                    ...(memory?.semantic?.interests || []),
                    ...(workingDueEntries.map(e => e.text) || []),
                ].join(" ");
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

                const semanticResults = query
                    ? await searchSemanticMemory({
                        userId,
                        query,
                        k: 5
                    })
                    : { results: [] };

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
                        fsrsCard: e.fsrsCard,
                    })),
                    totalWords: workingDueEntries.length,

                    memory: {
                        semantic: memory?.semantic ?? null,
                        episodic: memory?.episodic ?? null,
                        procedural: memory?.procedural ?? null,
                        semanticHints: semanticResults.results ?? []
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

            // Tool assignment
            vocabularyTeacherAgent.tools = [
                sceneTools.choosePracticeMode,
                sceneTools.prepareReviewMode,
                sceneTools.pauseReviewMode,
                sceneTools.resumeReviewMode,
                sceneTools.getNextScene,
                sceneTools.startScene,
                sceneTools.markSceneDone,
                sceneTools.requestSceneRating
            ];
            vocabularyTeacherAgent.voice = normalizeVoiceProfile(runtimeContext?.agentVoiceProfile);

            runContextRef.current = { context: runtimeContext };


            await connect({
                getEphemeralKey: fetchEphemeralKey,
                initialAgents: [vocabularyTeacherAgent],
                audioElement: sdkAudioElement,
                extraContext: runtimeContext,
            });
            addTranscriptBreadcrumb('Connected! Start speaking to practice');

        } catch (error) {
            console.error('Connection failed:', error);
            addTranscriptBreadcrumb('Connection failed');
            const msg = String(error?.message || "").toLowerCase();
            if (msg.includes("microphone permission denied")) {
                addTranscriptBreadcrumb(
                    "Microphone blocked. Allow mic access for Chrome/extension, then retry."
                );
            } else if (msg.includes("no microphone device found")) {
                addTranscriptBreadcrumb("No microphone detected. Connect a mic and retry.");
            }
        } finally {
            startPracticeLockRef.current = false;
            setStartInProgress(false);
        }
    };

    // Flush pending review updates when disconnecting
    const flushPendingReviewUpdates = async () => {
        const pending = await loadPendingReviewUpdates(userId);

        if (!pending.length) {
            addTranscriptBreadcrumb("No pending review updates to sync");
            return { reviewedWordIds: [], difficultWordIds: [] };
        }

        // Backend CardUpdateInput does NOT include rating/evidence; strip extras
        const updates = pending.map(({ rating, evidence, ...rest }) => rest);

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
    };

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

    const persistConversationMemory = async ({ difficultWordIds = [] } = {}) => {
        const messages = transcriptItems
            .filter((it) => it?.type === "MESSAGE" && (it.role === "user" || it.role === "assistant"))
            .map((it) => ({
                role: it.role,
                text: String(it.title || "").trim(),
            }))
            .filter((it) => it.text.length > 0);

        const vocabularyForSession =
            runContextRef.current?.context?.vocabularyWords
            || dueEntries
            || [];
        const sessionVideoTitles = [...new Set(
            vocabularyForSession
                .map((w) => String(w?.videoTitle || "").trim())
                .filter((t) => t.length > 0)
        )];

        const userMessageCount = messages.filter((m) => m.role === "user").length;
        if (userMessageCount < 3 && sessionVideoTitles.length === 0) {
            return;
        }

        const result = await consolidateSemanticMemory({
            userId,
            messages,
            videoTitles: sessionVideoTitles,
            sessionId: selectedSessionId,
            difficultWordIds,
        });
        if (result?.memory?.semantic) {
            memoryRef.current = {
                ...(memoryRef.current || {}),
                semantic: result.memory.semantic,
                episodic: result?.memory?.episodic ?? memoryRef.current?.episodic ?? null,
                procedural: result?.memory?.procedural ?? memoryRef.current?.procedural ?? null,
            };
        }
    };

    // // TEST flush update
    // useEffect(() => {
    //     window.__flushReview = flushPendingReviewUpdates;
    //     return () => {
    //         delete window.__flushReview;
    //     };
    // }, [flushPendingReviewUpdates]);

    // Disconnect from API
    const handleStopPractice = useCallback(async ({ fromRatingWorker = false } = {}) => {
        if (stopPracticeInProgressRef.current) return;
        stopPracticeInProgressRef.current = true;

        disconnect();
        setPracticeMode("DISCONNECTED");
        addTranscriptBreadcrumb('Disconnected from voice agent');

        let reviewSyncSummary = { difficultWordIds: [] };
        try {
            if (!fromRatingWorker &&
                (sceneRatingWorkerRunningRef.current || sceneRatingQueueRef.current.length > 0)) {
                addTranscriptBreadcrumb("Waiting for background scene rating to finish");
                await waitForSceneRatingDrain();
            }

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
            await persistConversationMemory({
                difficultWordIds: reviewSyncSummary?.difficultWordIds || [],
            });
            removeBreadcrumbsByKinds(
                ["MEMORY_SHAPING", "MEMORY_SHAPED"],
                ["Shaping your memory", "Memory shaped"]
            );
            addTranscriptBreadcrumb("Memory shaped", { kind: "MEMORY_SHAPED" });
        } catch (e) {
            removeBreadcrumbsByKinds(
                ["MEMORY_SHAPING"],
                ["Shaping your memory"]
            );
            addTranscriptBreadcrumb(`Memory update skipped: ${e.message || e}`);
        } finally {
            stopPracticeInProgressRef.current = false;
        }
    }, [addTranscriptBreadcrumb, disconnect, persistConversationMemory, removeBreadcrumbsByKinds, userId]);

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
            await updateVocabularyDueDate(userId, vocabularyId, end.toISOString());
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
    }, [status, transcriptItems.length]);

    const reviewStatusByWordId = useMemo(() => {
        const result = {};
        if (status !== "CONNECTED") return result;

        const ctx = runContextRef.current?.context || {};
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
    }, [status, transcriptItems.length]);

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

    const showSessionOverlay =
        (!sessionBootstrapped && overlayOpen) ||
        (sessionBootstrapped && (
            (sessionPanelMode === "initial" && overlayOpen) ||
            (sessionPanelMode === "drawer" && drawerActivated)
        ));
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

    return (
        <div className={`voice-page${showKeyboardTestComposer ? " has-keyboard-input" : ""}`}>
            <div className="voice-transcript-wrapper" ref={transcriptWrapperRef}>
                <Transcript
                    userText=""
                    setUserText={() => {
                    }}
                    onSendMessage={() => {
                    }}
                    canSend={false}
                    downloadRecording={() => console.log("Download clicked")}
                    isVoiceOnly={true}
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
            </div>
            <KeyboardTestComposer
                visible={showKeyboardTestComposer}
                disabled={status !== "CONNECTED"}
                onSend={handleSendKeyboardInput}
            />
            <div className="voice-footer">
                <button
                    className="voice-back-button"
                    onClick={onNavigateBack}
                    aria-label="Back to captions"
                    title="Back to captions"
                >
                    &lt;
                </button>

                {(status === 'DISCONNECTED' || status === 'CONNECTING') && (<button
                    onClick={handleStartPractice}
                    className={`voice-connect-button${isConnecting ? " is-connecting" : ""}`}
                    disabled={isConnecting || startInProgress || !!dueError || loadingDue}
                >
                    {isConnecting || startInProgress ? 'Connecting' : 'Connect'}
                </button>)}

                {status === 'CONNECTED' && (<button
                    onClick={handleStopPractice}
                    className="voice-disconnect-button"
                >
                    Disconnect
                </button>)}

                {canShowWordList && (
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
