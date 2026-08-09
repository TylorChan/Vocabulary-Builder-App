import { readFileSync } from "node:fs";

const CORPUS_URL = new URL("../transcript-review-corpus-50.md", import.meta.url);
const EXPECTED_CASE_COUNT = 50;

function requireMatch(source, pattern, fieldName, caseId) {
    const match = source.match(pattern);
    if (!match) {
        throw new Error(`Transcript review corpus ${caseId} is missing ${fieldName}`);
    }
    return match[1].trim();
}

function parseDialogueGroups(source, caseId) {
    const matches = [...source.matchAll(
        /^([1-8])\. \*\*Teacher:\*\* (.*?) \*\*Learner:\*\* (.*)$/gm,
    )];
    if (matches.length !== 8) {
        throw new Error(`Transcript review corpus ${caseId} must contain exactly 8 dialogue groups`);
    }

    return matches.map((match, index) => {
        const groupNumber = Number(match[1]);
        if (groupNumber !== index + 1) {
            throw new Error(`Transcript review corpus ${caseId} has an invalid group sequence`);
        }
        return {
            groupNumber,
            teacher: match[2].trim(),
            learner: match[3].trim(),
        };
    });
}

function turnId(caseId, index) {
    return `${caseId}-turn-${index}`;
}

function buildRecentTurns(caseId, dialogueGroups) {
    const recentTurns = dialogueGroups.slice(3, 7).flatMap((group) => [
        {
            turnId: turnId(caseId, group.groupNumber * 2 - 1),
            role: "assistant",
            text: group.teacher,
        },
        {
            turnId: turnId(caseId, group.groupNumber * 2),
            role: "user",
            text: group.learner,
        },
    ]);
    const finalGroup = dialogueGroups[7];
    recentTurns.push({
        turnId: turnId(caseId, 15),
        role: "assistant",
        text: finalGroup.teacher,
    });
    return recentTurns;
}

function parseCase(source) {
    const heading = requireMatch(source, /^([^\n]+)$/m, "case heading", "unknown case");
    const headingMatch = heading.match(/^(\d{2}) - (.+)$/);
    if (!headingMatch) {
        throw new Error(`Invalid transcript review corpus case heading: ${heading}`);
    }

    const caseId = `case-${headingMatch[1]}`;
    const title = headingMatch[2].trim();
    const topic = requireMatch(source, /^- \*\*Topic:\*\* (.+)$/m, "Topic", caseId);
    const expression = requireMatch(
        source,
        /^- \*\*Target Expression:\*\* `([^`]+)`$/m,
        "Target Expression",
        caseId,
    );
    const targetId = requireMatch(
        source,
        /^- \*\*Target ID:\*\* `([^`]+)`$/m,
        "Target ID",
        caseId,
    );
    const intendedMeaning = requireMatch(
        source,
        /^- \*\*Intended meaning:\*\* (.+)$/m,
        "Intended meaning",
        caseId,
    );
    const communicativeGoal = requireMatch(
        source,
        /^- \*\*Communicative goal:\*\* (.+)$/m,
        "Communicative goal",
        caseId,
    );
    const expectedJson = requireMatch(
        source,
        /^- \*\*Expected output:\*\* `(.+)`$/m,
        "Expected output",
        caseId,
    );
    const rollingSummary = requireMatch(
        source,
        /^- \*\*Rolling summary:\*\* (.+)$/m,
        "Rolling summary",
        caseId,
    );
    const dialogueGroups = parseDialogueGroups(source, caseId);

    let expectedReview;
    try {
        expectedReview = JSON.parse(expectedJson);
    } catch (error) {
        throw new Error(`Transcript review corpus ${caseId} has invalid Expected output JSON: ${error.message}`);
    }
    if (expectedReview.targetEvidence?.[0]?.targetId !== targetId) {
        throw new Error(`Transcript review corpus ${caseId} Expected output has the wrong targetId`);
    }

    const currentTurn = dialogueGroups[7].learner;
    const normalizedExpression = expression.toLowerCase();
    const hasLexicalMatch = currentTurn.toLowerCase().includes(normalizedExpression);

    return {
        id: caseId,
        title,
        topic,
        expectedOutcome: expectedReview.outcome,
        expectedReview,
        request: {
            currentTurn: {
                turnId: turnId(caseId, 16),
                text: currentTurn,
            },
            conversationContext: {
                rollingSummary,
                summaryVersion: 1,
                coversThroughTurnId: turnId(caseId, 6),
                recentTurns: buildRecentTurns(caseId, dialogueGroups),
            },
            reviewContract: {
                activeScene: {
                    sceneId: `${caseId}-scene`,
                    title: topic,
                },
                activeBeat: {
                    beatId: `${caseId}-beat`,
                    targetIds: [targetId],
                    communicativeGoal,
                    targetExpressions: [{
                        targetId,
                        expression,
                        intendedMeaning,
                    }],
                },
                observation: {
                    matchedTargetIds: hasLexicalMatch ? [targetId] : [],
                    lexicalMatches: hasLexicalMatch ? [{ targetId, expression }] : [],
                },
                targetProgress: {
                    [targetId]: "active",
                },
                beatProgress: {
                    attempts: 1,
                },
            },
        },
    };
}

function loadBenchmarkCases() {
    const corpus = readFileSync(CORPUS_URL, "utf8");
    const sections = corpus.split(/^### Case /m).slice(1);
    if (sections.length !== EXPECTED_CASE_COUNT) {
        throw new Error(
            `Transcript review corpus must contain ${EXPECTED_CASE_COUNT} cases; found ${sections.length}`,
        );
    }

    const cases = sections.map(parseCase);
    const caseIds = new Set(cases.map((benchmarkCase) => benchmarkCase.id));
    if (caseIds.size !== cases.length) {
        throw new Error("Transcript review corpus contains duplicate case IDs");
    }
    return cases;
}

export const TRANSCRIPT_REVIEW_BENCHMARK_CASES = loadBenchmarkCases();
