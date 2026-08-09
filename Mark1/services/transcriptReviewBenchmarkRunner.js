function roundMs(value) {
    return Math.round(value * 10) / 10;
}

function average(values) {
    const finiteValues = values.filter(Number.isFinite);
    if (finiteValues.length === 0) return null;
    return roundMs(finiteValues.reduce((sum, value) => sum + value, 0) / finiteValues.length);
}

function createSeededRandom(seed) {
    let state = Number(seed) >>> 0;
    return () => {
        state = (state * 1_664_525 + 1_013_904_223) >>> 0;
        return state / 0x1_0000_0000;
    };
}

function shuffleJobs(jobs, seed) {
    const random = createSeededRandom(seed);
    const shuffled = [...jobs];
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(random() * (index + 1));
        [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
    }
    return shuffled;
}

function wait(delayMs) {
    if (!delayMs) return Promise.resolve();
    return new Promise((resolve) => setTimeout(resolve, delayMs));
}

export function createTranscriptReviewBenchmarkJobs({ cases, efforts, models, seed = 20_260_805 }) {
    const jobs = efforts.flatMap((effort) => cases.flatMap((benchmarkCase) => models
        .filter((model) => (
            !Array.isArray(model.supportedEfforts) || model.supportedEfforts.includes(effort)
        ))
        .map((model) => ({
            benchmarkCase,
            effort,
            model,
        }))));
    return shuffleJobs(jobs, seed);
}

export async function runTranscriptReviewBenchmark({
    cases,
    efforts,
    models,
    seed = 20_260_805,
    delayMs = 0,
    onProgress = () => {},
}) {
    const jobs = createTranscriptReviewBenchmarkJobs({ cases, efforts, models, seed });
    const records = [];

    for (const [jobIndex, job] of jobs.entries()) {
        const startedAt = performance.now();
        let record;
        try {
            const result = await job.model.run(job.benchmarkCase.request, job.effort);
            record = {
                caseId: job.benchmarkCase.id,
                caseTitle: job.benchmarkCase.title,
                modelId: job.model.id,
                modelLabel: job.model.label,
                effort: job.effort,
                expectedOutcome: job.benchmarkCase.expectedOutcome,
                actualOutcome: result.review.outcome,
                success: true,
                latencyMs: roundMs(performance.now() - startedAt),
                providerLatencyMs: result.latencyMs.provider,
                usage: result.usage,
                confidence: result.review.confidence,
                error: null,
            };
        } catch (error) {
            record = {
                caseId: job.benchmarkCase.id,
                caseTitle: job.benchmarkCase.title,
                modelId: job.model.id,
                modelLabel: job.model.label,
                effort: job.effort,
                expectedOutcome: job.benchmarkCase.expectedOutcome,
                actualOutcome: null,
                success: false,
                latencyMs: roundMs(performance.now() - startedAt),
                providerLatencyMs: null,
                usage: null,
                confidence: null,
                error: {
                    code: error?.code || error?.name || "unknown_error",
                    message: error?.message || String(error),
                },
            };
        }

        records.push(record);
        onProgress({
            completed: jobIndex + 1,
            total: jobs.length,
            record,
        });
        if (jobIndex < jobs.length - 1) await wait(delayMs);
    }

    return {
        generatedAt: new Date().toISOString(),
        seed,
        cases: cases.map(({ id, title, expectedOutcome }) => ({ id, title, expectedOutcome })),
        efforts: [...efforts],
        models: models.map(({ id, label }) => ({ id, label })),
        records,
    };
}

function formatOutcomeList(records, field) {
    return records
        .map((record) => {
            const value = field === "actualOutcome" && !record.success
                ? `ERROR(${record.error.code})`
                : record[field];
            return `${record.caseId}=${value}`;
        })
        .join(", ");
}

function summarizeRecords(records) {
    const successes = records.filter((record) => record.success);
    const exactMatches = records.filter((record) => (
        record.success && record.actualOutcome === record.expectedOutcome
    ));
    return {
        averageLatencyMs: average(successes.map((record) => record.latencyMs)),
        averageProviderLatencyMs: average(successes.map((record) => record.providerLatencyMs)),
        successCount: successes.length,
        exactMatchCount: exactMatches.length,
        totalCount: records.length,
    };
}

export function renderTranscriptReviewBenchmarkMarkdown(report) {
    const lines = [];

    for (const effort of report.efforts) {
        lines.push(`# ${effort}`, "");
        for (const model of report.models) {
            const records = report.records
                .filter((record) => record.effort === effort && record.modelId === model.id)
                .sort((left, right) => left.caseId.localeCompare(right.caseId));
            if (records.length === 0) continue;
            const summary = summarizeRecords(records);
            const averageText = summary.averageLatencyMs == null
                ? "N/A"
                : `${summary.averageLatencyMs} ms`;
            const providerText = summary.averageProviderLatencyMs == null
                ? "N/A"
                : `${summary.averageProviderLatencyMs} ms`;
            const accuracy = summary.totalCount === 0
                ? "N/A"
                : `${summary.exactMatchCount}/${summary.totalCount}`;
            const reliability = summary.totalCount === 0
                ? "N/A"
                : `${summary.successCount}/${summary.totalCount}`;

            lines.push(
                `${model.label}: 平均延迟时间 ${averageText}`,
                `Provider 平均延迟：${providerText}`,
                `预期结果：${formatOutcomeList(records, "expectedOutcome")}`,
                `真实结果：${formatOutcomeList(records, "actualOutcome")}`,
                `准确率：${accuracy}`,
                `结构化输出成功率：${reliability}`,
                "",
            );
        }
    }

    lines.push("# Cases", "");
    for (const benchmarkCase of report.cases) {
        lines.push(`- ${benchmarkCase.id}: ${benchmarkCase.title} (${benchmarkCase.expectedOutcome})`);
    }
    lines.push("");

    return lines.join("\n");
}

function formatPercentage(numerator, denominator) {
    if (denominator === 0) return "N/A";
    const percentage = Math.round((numerator / denominator) * 1_000) / 10;
    return `${percentage}%`;
}

export function renderTranscriptReviewAccuracyMarkdown(report) {
    const lines = [];

    for (const effort of report.efforts) {
        const effortRecords = report.records.filter((record) => record.effort === effort);
        if (effortRecords.length === 0) continue;
        lines.push(`# ${effort}`, "");

        for (const model of report.models) {
            const records = effortRecords.filter((record) => record.modelId === model.id);
            if (records.length === 0) continue;
            const summary = summarizeRecords(records);
            lines.push(
                `${model.label}:`,
                `准确率：${summary.exactMatchCount}/${summary.totalCount} (${formatPercentage(
                    summary.exactMatchCount,
                    summary.totalCount,
                )})`,
                "",
            );
        }
    }

    return lines.join("\n");
}
