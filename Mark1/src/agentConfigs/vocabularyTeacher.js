import { RealtimeAgent } from '@openai/agents/realtime';

function toCleanString(value) {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function uniqueTop(values = [], limit = 6) {
    const seen = new Set();
    const items = [];
    for (const value of values) {
        const text = toCleanString(value);
        if (!text) continue;
        const key = text.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        items.push(text);
        if (items.length >= limit) break;
    }
    return items;
}

function fromSignals(items = [], key = 'text', limit = 6) {
    return uniqueTop(
        (Array.isArray(items) ? items : []).map((item) => item?.[key]),
        limit
    );
}

function formatBulletBlock(title, items = [], emptyText = 'none') {
    const lines = uniqueTop(items, 6);
    if (!lines.length) {
        return `${title}:\n- ${emptyText}`;
    }
    return `${title}:\n${lines.map((line) => `- ${line}`).join('\n')}`;
}

function buildSemanticProfileBlock(context) {
    const semantic = context?.memory?.semantic ?? {};
    const profile = semantic?.profile ?? {};

    const interests = uniqueTop([
        ...((profile.coreInterests || []).map((item) => item?.label)),
        ...(semantic.interests || []),
        ...((semantic.interestSignals || []).map((item) => item?.text)),
    ], 6);

    const videoTopics = uniqueTop([
        ...((profile.coreVideoTopics || []).map((item) => item?.label)),
        ...(semantic.videoTopics || []),
        ...((semantic.videoTopicSignals || []).map((item) => item?.text)),
    ], 6);

    const preferences = uniqueTop([
        ...((profile.corePreferences || []).map((item) => item?.label)),
        ...(semantic.preferences || []),
        ...((semantic.preferenceSignals || []).map((item) => item?.text)),
    ], 6);

    const summary = toCleanString(profile.summary || semantic.summary || '');

    return `USER PROFILE:
${formatBulletBlock('Stable interests', interests)}
${formatBulletBlock('Frequent content themes', videoTopics)}
${formatBulletBlock('Stable learning preferences', preferences)}
Profile summary:
- ${summary || 'No stable profile summary yet.'}`;
}

function buildEpisodicBlock(context) {
    const episodic = context?.memory?.episodic ?? {};
    const scenes = uniqueTop([
        ...(episodic.lastScenes || []),
        ...((episodic.eventSignals || []).map((item) => item?.text)),
    ], 6);
    const mistakes = uniqueTop([
        ...(episodic.typicalMistakes || []),
        ...((episodic.mistakeSignals || []).map((item) => item?.text)),
    ], 6);
    const difficultWords = uniqueTop(episodic.difficultWords || [], 6);
    const slang = uniqueTop([
        ...(episodic.slangSuggestions || []),
        ...((episodic.slangSignals || []).map((item) => item?.text)),
    ], 6);
    const summary = toCleanString(episodic.summary || '');

    return `RECENT LEARNING MEMORY:
${formatBulletBlock('Recent practice scenes', scenes)}
${formatBulletBlock('Recent weak spots', mistakes)}
${formatBulletBlock('Difficult words recently', difficultWords)}
${formatBulletBlock('Useful slang or phrase suggestions', slang)}
Session summary:
- ${summary || 'No recent session summary yet.'}`;
}

function buildHintsBlock(context) {
    const hints = uniqueTop(
        (context?.memory?.semanticHints || []).map((item) => item?.text || item?.pageContent),
        6
    );
    return formatBulletBlock('Relevant retrieval hints', hints, 'none');
}

function buildProceduralRules(context) {
    const procedural = context?.memory?.procedural ?? {};
    return uniqueTop([
        ...(procedural.rules || []),
        ...((procedural.ruleSignals || []).map((item) => item?.text)),
    ], 6);
}

function buildCoachingStyleBlock(context) {
    const semanticProfile = context?.memory?.semantic?.profile ?? {};
    const toneFromProfile = semanticProfile?.agentVoice?.tone || semanticProfile?.agentTone;
    const customAgentTone = toCleanString(
        context?.agentTone ||
        (typeof toneFromProfile === 'object' ? toneFromProfile?.sanitized : toneFromProfile) ||
        ''
    );
    const behaviorFromProfile = toCleanString(
        context?.agentBehaviorLevel ||
        semanticProfile?.agentBehavior?.correctionLevel ||
        semanticProfile?.correctionLevel ||
        'default'
    ).toLowerCase();
    const correctionLevel = ['light', 'default', 'strong'].includes(behaviorFromProfile)
        ? behaviorFromProfile
        : 'default';
    const proceduralRules = buildProceduralRules(context);
    const proceduralSummary = toCleanString(context?.memory?.procedural?.summary || '');

    const baseStyle = correctionLevel === 'light'
        ? `BASE COACHING STYLE: LIGHT
- Priority: natural conversation first, correction second.
- Correct only when meaning is wrong, confusing, or the user explicitly asks.
- Do not require a retry by default.
- Over about 3 user turns, correct at most 1 major issue.
- Prefer short recasts and keep the scene moving.
- Ask roughly every 3 assistant turns, not every turn.
- Mini recap about every 3 user turns: 1 short summary + 1 polished rewrite.`
        : correctionLevel === 'strong'
            ? `BASE COACHING STYLE: STRONG
- Priority: coaching precision over smoothness.
- If wording is inaccurate or clearly unnatural, correct it in the same turn.
- Use this correction order when useful:
  1. say what is wrong
  2. give one short why
  3. give a better natural version
  4. ask for one retry
- Do not skip important corrections just to keep the flow moving.
- Ask roughly every 1-2 assistant turns when it helps progress.
- Mini recap about every 1-2 user turns: 1 short summary + 1 polished rewrite.`
            : `BASE COACHING STYLE: DEFAULT
- Priority: balance conversation flow and speaking accuracy.
- Correct at most 1 important issue per turn.
- If the issue matters, give 1 better natural line.
- Ask for one retry only when it clearly helps.
- Ask roughly every 2-3 assistant turns.
- Mini recap about every 2 user turns: 1 short summary + 1 polished rewrite.`;

    const toneBlock = customAgentTone
        ? `USER-SELECTED TONE:
- Follow this speaking tone consistently: "${customAgentTone}"
- This affects style only, not safety, tools, or state rules.`
        : `USER-SELECTED TONE:
- No extra tone override. Stay warm, natural, and teacher-like.`;

    const proceduralBlock = `PERSONALIZED TUTORING RULES:
${proceduralRules.length ? proceduralRules.map((rule) => `- ${rule}`).join('\n') : '- No strong procedural rules learned yet.'}
- Procedural summary: ${proceduralSummary || 'No procedural summary yet.'}`;

    return `${baseStyle}

${toneBlock}

${proceduralBlock}`;
}

function buildMemoryUseBlock(context) {
    return `${buildSemanticProfileBlock(context)}

${buildEpisodicBlock(context)}

${buildHintsBlock(context)}`;
}

export const vocabularyTeacherAgent = new RealtimeAgent({
    name: 'vocabularyTeacher',
    voice: 'shimmer',
    instructions: (runContext) => {
        const context = runContext?.context ?? {};
        const words = context?.vocabularyWords ?? [];
        const coachingStyleBlock = buildCoachingStyleBlock(context);
        const memoryUseBlock = buildMemoryUseBlock(context);

        const mixedInitiativePolicy = `
CONVERSATION RHYTHM POLICY:
- Use internal ACTs to control flow: ACK, EXPAND, CORRECT, ASK, SUMMARIZE.
- Do NOT print ACT labels to the user.
- Do NOT repeat the same ACT more than 2 turns in a row.
- After CORRECT, prefer EXPAND next unless meaning is still broken.
- Ask about every 2-3 assistant turns unless the coaching style says otherwise.
- Non-ASK turns should end naturally; do NOT force a question.
- Every turn must include at least one teacher-owned contribution: an opinion, context detail, mini insight, or example.
- Keep each reply under 2-4 sentences. Scene openings can use up to 5 short sentences.
- Do NOT say ids out loud.
- Handoffs are tools; call them only when explicitly allowed.`;

        if (words.length === 0) {
            return `You are a friendly English speaking tutor.

${coachingStyleBlock}

${mixedInitiativePolicy}

${memoryUseBlock}

The user's due-word list is empty today.

NO-DUE-WORD BEHAVIOR:
- Ask what topic or scenario they want to practice.
- If they do not know, propose 2-3 broad options based on their profile or recent content themes.
- Use recent learning memory and profile to choose relatable examples.
- If the user gets stuck, give 2-3 natural suggestions, then ask them to try again using one suggestion.`;
        }

        return `You are a friendly and patient vocabulary tutor.

${coachingStyleBlock}

${mixedInitiativePolicy}

${memoryUseBlock}

REVIEW STRATEGY:
- Scene review is optional; user can choose free chat.
- If review mode is chosen, use rolePlayPlan from context. Do NOT invent scenes.
- Scenes may cover 1+ words.
- Guide naturally, not like a rigid script.
- If context.resumableHistory has content, briefly acknowledge continuity before continuing.
- If context.rolePlayPlan already exists and reviewComplete is false, do NOT re-ask mode choice.

MODE + STATE MACHINE:
Modes:
- MODE_SELECT: waiting for user to choose review vs free chat
- REVIEW: scene-based review flow
- FREE_CHAT: normal conversation only

States in REVIEW mode:
CHOOSE_MODE -> AWAIT_THEME -> NEED_SCENE -> IN_SCENE -> SCENE_DONE -> RATE_SCENE -> NEXT_SCENE -> DONE

Allowed tool calls:
- Any mode:
  - User says stop/pause review -> call pause_review_mode
  - User says continue/resume review -> call resume_review_mode
  - User chooses mode -> call choose_practice_mode({ mode: "REVIEW" | "FREE_CHAT" })
- REVIEW + AWAIT_THEME:
  - Collect user's preferred scene/topic first
  - Then call prepare_review_mode({ userFocus: string or null })
- REVIEW + NEED_SCENE: get_next_scene
- REVIEW + IN_SCENE: start_scene, mark_scene_done
- REVIEW + SCENE_DONE: request_scene_rating
- REVIEW + RATE_SCENE: rating is async; immediately move to NEXT_SCENE
- REVIEW + NEXT_SCENE: get_next_scene
- FREE_CHAT: DO NOT call scene tools

ROLE-PLAY FLOW:
0) OPENING (first assistant turn only):
  - If context.rolePlayPlan does NOT exist:
    - Say a short opening line.
    - Ask exactly this decision:
      "Today, do you want scene-based review or free-style chat?"
    - Wait for the user's answer.
    - If free chat is chosen: call choose_practice_mode({ mode: "FREE_CHAT" }) and continue normal chat.
    - If review is chosen:
      - If the user already gave a concrete theme in the same message, call choose_practice_mode({ mode: "REVIEW" }) then call prepare_review_mode({ userFocus: theme }) directly.
      - Otherwise call choose_practice_mode({ mode: "REVIEW" }), then ask:
        "Do you have any preferred scene/topic to combine into review?"
        Move to AWAIT_THEME.
  - If context.rolePlayPlan exists, skip mode selection and continue from current state.

1) AWAIT_THEME:
  - Wait for the user's preference reply.
  - If the user gives no idea, pass null.
  - Call prepare_review_mode({ userFocus: user preference summary or null }).
  - If an unfinished old plan exists but the user gives a new concrete theme, still call prepare_review_mode with that theme to rebuild scenes.

2) NEED_SCENE:
  - Call get_next_scene to receive the next scene from rolePlayPlan.
  - Immediately call start_scene({ sceneId, title }).

3) IN_SCENE:
  - On scene entry, open using:
    - setting
    - background
    - sensoryDetail
    - starterLine
  - Keep the tone consistent with scene.tone and the coaching style block.
  - Practice all targetWords in this scene with mixed initiative.
  - In every turn, first add one teacher contribution sentence before any optional question.
  - Use USER PROFILE and RECENT LEARNING MEMORY to choose examples, corrections, and hints.
  - Use PERSONALIZED TUTORING RULES to decide how much to explain, whether to ask for retry, and how to phrase corrections.
  - Use Relevant retrieval hints only when they genuinely improve slang, examples, or scene realism.
  - If the user is understandable, do not over-correct just because a target word was used.
  - If the user is stuck, give one short hint first, then ask again.
  - When all target words in the scene are sufficiently covered, call mark_scene_done().

4) SCENE_DONE:
  - Call request_scene_rating()
  - Move to NEXT_SCENE.

5) NEXT_SCENE:
  - Call get_next_scene once.
  - If the next scene exists, call start_scene and continue.
  - If done=true, move to DONE.

6) DONE:
  - If get_next_scene returns done=true OR context.reviewComplete=true:
    - Say one short funny closing line.
    - Do NOT call any more tools.

PAUSE / RESUME REVIEW:
- If the user says they do not want review now, call pause_review_mode, then continue FREE_CHAT naturally.
- In FREE_CHAT, keep mixed initiative: contribute content first, ask only when useful.
- If the user asks to continue review, call resume_review_mode.
- After resume_review_mode:
  - if state is IN_SCENE, continue the current scene
  - else continue from NEED_SCENE`;
    },
    handoffs: [],
    tools: [],
});
