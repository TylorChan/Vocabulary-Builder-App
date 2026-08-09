import assert from "node:assert/strict";
import test from "node:test";
import {
    normalizeTranscriptReviewRequest,
    REVIEW_TURN_OUTCOMES,
} from "../services/transcriptReviewContract.js";
import {
    createTranscriptReviewBenchmarkJobs,
    renderTranscriptReviewAccuracyMarkdown,
    renderTranscriptReviewBenchmarkMarkdown,
    runTranscriptReviewBenchmark,
} from "../services/transcriptReviewBenchmarkRunner.js";
import {
    TRANSCRIPT_REVIEW_BENCHMARK_CASES,
} from "../scripts/transcript-review-benchmark-cases.js";

function countSentences(text) {
    return text
        .split(/[.!?](?:\s|$)/)
        .map((sentence) => sentence.trim())
        .filter(Boolean)
        .length;
}

test("benchmark fixture contains fifty substantial cases covering every review outcome", () => {
    assert.equal(TRANSCRIPT_REVIEW_BENCHMARK_CASES.length, 50);
    const coveredOutcomes = new Set();
    const targetIds = new Set();

    for (const benchmarkCase of TRANSCRIPT_REVIEW_BENCHMARK_CASES) {
        assert.ok(REVIEW_TURN_OUTCOMES.includes(benchmarkCase.expectedOutcome));
        assert.ok(countSentences(benchmarkCase.request.currentTurn.text) >= 5);
        assert.equal(benchmarkCase.request.conversationContext.recentTurns.length, 9);
        assert.match(benchmarkCase.request.currentTurn.turnId, /-turn-16$/);
        assert.doesNotThrow(() => normalizeTranscriptReviewRequest(benchmarkCase.request));
        targetIds.add(benchmarkCase.request.reviewContract.activeBeat.targetIds[0]);
        coveredOutcomes.add(benchmarkCase.expectedOutcome);
    }

    assert.equal(targetIds.size, 50);

    assert.deepEqual(
        [...coveredOutcomes].sort(),
        [...REVIEW_TURN_OUTCOMES].sort(),
    );
});

test("benchmark job order is reproducibly shuffled", () => {
    const input = {
        cases: TRANSCRIPT_REVIEW_BENCHMARK_CASES,
        efforts: ["none", "low", "medium"],
        models: [
            {
                id: "deepseek",
                label: "deepseek",
                supportedEfforts: ["none", "low", "medium"],
            },
            { id: "gemini", label: "gemini", supportedEfforts: ["low", "medium"] },
            { id: "terra", label: "terra", supportedEfforts: ["low", "medium"] },
            { id: "luna", label: "luna", supportedEfforts: ["low", "medium"] },
        ],
        seed: 42,
    };
    const first = createTranscriptReviewBenchmarkJobs(input);
    const second = createTranscriptReviewBenchmarkJobs(input);
    const identity = (job) => `${job.effort}/${job.model.id}/${job.benchmarkCase.id}`;

    assert.equal(first.length, 450);
    assert.deepEqual(first.map(identity), second.map(identity));
    assert.equal(new Set(first.map(identity)).size, 450);
    const noneJobs = first.filter((job) => job.effort === "none");
    assert.equal(noneJobs.length, 50);
    assert.ok(noneJobs.every((job) => job.model.id === "deepseek"));
});

test("benchmark report keeps failed calls visible and excludes them from latency averages", async () => {
    const cases = TRANSCRIPT_REVIEW_BENCHMARK_CASES.slice(0, 2).map((benchmarkCase) => ({
        ...benchmarkCase,
        request: normalizeTranscriptReviewRequest(benchmarkCase.request),
    }));
    const expectedByTurnId = new Map(cases.map((benchmarkCase) => [
        benchmarkCase.request.currentTurn.turnId,
        benchmarkCase.expectedOutcome,
    ]));
    const model = {
        id: "mock",
        label: "mock model",
        run: async (request) => {
            if (request.currentTurn.turnId.endsWith("case-02-turn-16")) {
                const error = new Error("invalid output");
                error.code = "invalid_structured_output";
                throw error;
            }
            return {
                latencyMs: { provider: 12.5 },
                usage: { inputTokens: 10, outputTokens: 5, reasoningTokens: 0, totalTokens: 15 },
                review: {
                    outcome: expectedByTurnId.get(request.currentTurn.turnId),
                    confidence: 0.9,
                },
            };
        },
    };

    const report = await runTranscriptReviewBenchmark({
        cases,
        efforts: ["low"],
        models: [model],
        seed: 1,
    });
    const markdown = renderTranscriptReviewBenchmarkMarkdown(report);
    const accuracyMarkdown = renderTranscriptReviewAccuracyMarkdown(report);

    assert.equal(report.records.length, 2);
    assert.match(markdown, /# low/);
    assert.match(markdown, /mock model: 平均延迟时间/);
    assert.match(markdown, /预期结果：case-01=PARTIAL, case-02=ACHIEVED/);
    assert.match(markdown, /真实结果：case-01=PARTIAL, case-02=ERROR\(invalid_structured_output\)/);
    assert.match(markdown, /准确率：1\/2/);
    assert.match(markdown, /结构化输出成功率：1\/2/);
    assert.equal(
        accuracyMarkdown,
        "# low\n\nmock model:\n准确率：1/2 (50%)\n",
    );
    assert.doesNotMatch(accuracyMarkdown, /延迟|预期结果|真实结果|Cases/);
});
