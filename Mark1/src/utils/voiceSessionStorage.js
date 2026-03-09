import { GRAPHQL_ENDPOINT } from "../config/apiConfig";

async function graphqlRequest(query, variables = {}) {
    const response = await fetch(GRAPHQL_ENDPOINT, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ query, variables }),
    });

    const result = await response.json();
    if (result.errors?.length) {
        throw new Error(result.errors[0].message || "GraphQL request failed");
    }
    return result.data;
}

function parseJsonString(raw, fallback) {
    if (raw == null || raw === "") return fallback;
    try {
        return JSON.parse(raw);
    } catch {
        return fallback;
    }
}

function normalizeMeta(meta) {
    return {
        sessionId: String(meta.sessionId),
        title: meta.title || "Untitled session",
        createdAt: meta.createdAt,
        updatedAt: meta.updatedAt,
        messageCount: Number(meta.messageCount || 0),
        titleSource: meta.titleSource || "auto",
    };
}

function normalizeSnapshot(snapshot) {
    if (!snapshot) return null;
    return {
        sessionId: String(snapshot.sessionId),
        title: snapshot.title || "Untitled session",
        createdAt: snapshot.createdAt,
        updatedAt: snapshot.updatedAt,
        messageCount: Number(snapshot.messageCount || 0),
        titleSource: snapshot.titleSource || "auto",
        transcriptItems: parseJsonString(snapshot.transcriptJson, []),
        activeWords: parseJsonString(snapshot.activeWordsJson, []),
        runtimeContext: parseJsonString(snapshot.runtimeContextJson, null),
    };
}

export async function loadVoiceSessions(userId) {
    const query = `
      query VoiceSessions($userId: String!) {
        voiceSessions(userId: $userId) {
          sessionId
          title
          titleSource
          createdAt
          updatedAt
          messageCount
        }
      }
    `;

    const data = await graphqlRequest(query, { userId });
    return (data?.voiceSessions ?? []).map(normalizeMeta);
}

export async function createVoiceSession(userId, { title = "New session" } = {}) {
    const mutation = `
      mutation CreateVoiceSession($userId: String!, $title: String) {
        createVoiceSession(userId: $userId, title: $title) {
          sessionId
          title
          titleSource
          createdAt
          updatedAt
          messageCount
        }
      }
    `;

    const data = await graphqlRequest(mutation, { userId, title });
    return normalizeMeta(data?.createVoiceSession);
}

export async function loadVoiceSessionSnapshot(userId, sessionId) {
    if (!sessionId) return null;

    const query = `
      query VoiceSessionSnapshot($userId: String!, $sessionId: ID!) {
        voiceSessionSnapshot(userId: $userId, sessionId: $sessionId) {
          sessionId
          title
          titleSource
          createdAt
          updatedAt
          messageCount
          transcriptJson
          activeWordsJson
          runtimeContextJson
        }
      }
    `;

    const data = await graphqlRequest(query, { userId, sessionId });
    return normalizeSnapshot(data?.voiceSessionSnapshot);
}

export async function saveVoiceSessionSnapshot({
    userId,
    sessionId,
    title,
    titleSource = null,
    transcriptItems = [],
    activeWords = [],
    runtimeContext = null,
}) {
    if (!userId || !sessionId) {
        throw new Error("userId and sessionId are required");
    }

    const mutation = `
      mutation SaveVoiceSessionSnapshot(
        $userId: String!
        $sessionId: ID!
        $title: String!
        $titleSource: String
        $transcriptJson: String!
        $activeWordsJson: String!
        $runtimeContextJson: String
      ) {
        saveVoiceSessionSnapshot(
          userId: $userId
          sessionId: $sessionId
          title: $title
          titleSource: $titleSource
          transcriptJson: $transcriptJson
          activeWordsJson: $activeWordsJson
          runtimeContextJson: $runtimeContextJson
        ) {
          sessionId
          title
          titleSource
          createdAt
          updatedAt
          messageCount
          transcriptJson
          activeWordsJson
          runtimeContextJson
        }
      }
    `;

    const data = await graphqlRequest(mutation, {
        userId,
        sessionId,
        title: title || "Untitled session",
        titleSource,
        transcriptJson: JSON.stringify(transcriptItems || []),
        activeWordsJson: JSON.stringify(activeWords || []),
        runtimeContextJson: runtimeContext == null ? null : JSON.stringify(runtimeContext),
    });

    return normalizeSnapshot(data?.saveVoiceSessionSnapshot);
}

export async function updateVoiceSessionMeta(userId, sessionId, patch = {}) {
    if (!userId || !sessionId) {
        throw new Error("userId and sessionId are required");
    }

    const mutation = `
      mutation UpdateVoiceSessionMeta(
        $userId: String!
        $sessionId: ID!
        $title: String!
        $titleSource: String
      ) {
        updateVoiceSessionMeta(
          userId: $userId
          sessionId: $sessionId
          title: $title
          titleSource: $titleSource
        ) {
          sessionId
          title
          titleSource
          createdAt
          updatedAt
          messageCount
        }
      }
    `;

    const data = await graphqlRequest(mutation, {
        userId,
        sessionId,
        title: patch.title || "Untitled session",
        titleSource: patch.titleSource || null,
    });

    return data?.updateVoiceSessionMeta ? normalizeMeta(data.updateVoiceSessionMeta) : null;
}

export async function deleteVoiceSessions(userId, sessionIds) {
    const ids = Array.isArray(sessionIds) ? sessionIds.filter(Boolean) : [];
    if (!ids.length) return;

    const mutation = `
      mutation DeleteVoiceSessions($userId: String!, $sessionIds: [ID!]!) {
        deleteVoiceSessions(userId: $userId, sessionIds: $sessionIds) {
          deletedCount
        }
      }
    `;

    await graphqlRequest(mutation, { userId, sessionIds: ids });
}

export async function setActiveVoiceSession(userId, sessionId) {
    const mutation = `
      mutation SetActiveVoiceSession($userId: String!, $sessionId: String) {
        setActiveVoiceSession(userId: $userId, sessionId: $sessionId)
      }
    `;

    const data = await graphqlRequest(mutation, { userId, sessionId });
    return data?.setActiveVoiceSession ?? null;
}

export async function loadActiveVoiceSession(userId) {
    const query = `
      query ActiveVoiceSession($userId: String!) {
        activeVoiceSession(userId: $userId)
      }
    `;

    const data = await graphqlRequest(query, { userId });
    return data?.activeVoiceSession ?? null;
}

export async function clearActiveVoiceSession(userId) {
    await setActiveVoiceSession(userId, null);
}

export async function loadGlobalReviewProgress(userId) {
    const query = `
      query GlobalReviewProgress($userId: String!) {
        globalReviewProgress(userId: $userId)
      }
    `;

    const data = await graphqlRequest(query, { userId });
    return parseJsonString(data?.globalReviewProgress, null);
}

export async function saveGlobalReviewProgress(userId, progress) {
    const mutation = `
      mutation SaveGlobalReviewProgress($userId: String!, $progressJson: String!) {
        saveGlobalReviewProgress(userId: $userId, progressJson: $progressJson)
      }
    `;

    await graphqlRequest(mutation, {
        userId,
        progressJson: JSON.stringify({ ...(progress || {}), updatedAt: new Date().toISOString() }),
    });
}

export async function clearGlobalReviewProgress(userId) {
    const mutation = `
      mutation ClearGlobalReviewProgress($userId: String!) {
        clearGlobalReviewProgress(userId: $userId)
      }
    `;

    await graphqlRequest(mutation, { userId });
}
