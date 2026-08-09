#!/usr/bin/env node

import path from "node:path";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import {
    normalizeTranscriptReviewRequest,
} from "../services/transcriptReviewContract.js";
import {
    createTranscriptReviewBenchmarkService,
} from "../services/transcriptReviewBenchmarkService.js";
import {
    createTranscriptReviewBenchmarkJobs,
    renderTranscriptReviewAccuracyMarkdown,
    renderTranscriptReviewBenchmarkMarkdown,
    runTranscriptReviewBenchmark,
} from "../services/transcriptReviewBenchmarkRunner.js";
import {
    TRANSCRIPT_REVIEW_BENCHMARK_CASES,
} from "./transcript-review-benchmark-cases.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(scriptDir, "../.env"), quiet: true });

const DEFAULT_EFFORTS = ["none", "low", "medium"];
const DEFAULT_DELAY_MS = 100;
const DEFAULT_SEED = 20_260_805;

function parseList(value) {
    return String(value || "")
        .split(",")
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean);
}

function parseArgs(argv) {
    const options = {
        confirmPaidRun: false,
        efforts: [],
        models: [],
        modelEfforts: [],
        cases: [],
        delayMs: DEFAULT_DELAY_MS,
        seed: DEFAULT_SEED,
        output: "transcript-review-benchmark-results.md",
        accuracyOnly: false,
        help: false,
    };

    for (let index = 0; index < argv.length; index += 1) {
        const argument = argv[index];
        const [rawName, inlineValue] = argument.split("=", 2);
        const readValue = () => {
            if (inlineValue != null) return inlineValue;
            index += 1;
            if (index >= argv.length) throw new Error(`${rawName} requires a value`);
            return argv[index];
        };

        switch (rawName) {
        case "--confirm-paid-run":
            options.confirmPaidRun = true;
            break;
        case "--effort":
            options.efforts.push(...parseList(readValue()));
            break;
        case "--model":
            options.models.push(...parseList(readValue()));
            break;
        case "--model-effort":
            options.modelEfforts.push(...parseList(readValue()));
            break;
        case "--case":
            options.cases.push(...parseList(readValue()));
            break;
        case "--delay-ms":
            options.delayMs = Number(readValue());
            break;
        case "--seed":
            options.seed = Number(readValue());
            break;
        case "--output":
            options.output = readValue();
            break;
        case "--accuracy-only":
            options.accuracyOnly = true;
            break;
        case "--help":
        case "-h":
            options.help = true;
            break;
        default:
            throw new Error(`Unknown option: ${argument}`);
        }
    }

    if (!Number.isFinite(options.delayMs) || options.delayMs < 0) {
        throw new Error("--delay-ms must be a non-negative number");
    }
    if (!Number.isInteger(options.seed) || options.seed < 0) {
        throw new Error("--seed must be a non-negative integer");
    }
    return options;
}

function assertKnownValues(values, allowed, optionName) {
    const unknown = values.filter((value) => !allowed.includes(value));
    if (unknown.length > 0) {
        throw new Error(`${optionName} contains unsupported values: ${unknown.join(", ")}`);
    }
}

function printHelp() {
    console.log(`Transcript review latency and outcome benchmark

Dry run (default, no API calls):
  npm run benchmark:transcript-review

Full paid run (DeepSeek 3 efforts plus 3 models x 2 efforts x 50 cases = 450 calls):
  npm run benchmark:transcript-review -- --confirm-paid-run

One-effort-per-model comparison (4 model configurations = 200 calls):
  npm run benchmark:transcript-review -- --confirm-paid-run --model-effort deepseek:none,gemini:low,terra:medium,luna:low --accuracy-only --output transcript-review-benchmark-50-results.md

DeepSeek non-thinking only (50 calls):
  npm run benchmark:transcript-review -- --confirm-paid-run --model deepseek --effort none --output transcript-review-benchmark-deepseek-none.md

Save the Markdown report:
  npm run benchmark:transcript-review -- --confirm-paid-run

Optional filters:
  --model deepseek,gemini,terra,luna
  --effort none,low,medium
  --model-effort deepseek:none,gemini:low,terra:medium,luna:low
  --case case-01,case-02
  --accuracy-only
  --delay-ms 100
  --seed 20260805
  --output transcript-review-benchmark-results.md`);
}

function printDryRun({ cases, efforts, models, jobs, seed, delayMs, output, accuracyOnly }) {
    const activeModelIds = new Set(jobs.map((job) => job.model.id));
    console.log("# Transcript review benchmark dry run");
    console.log("");
    console.log(`API calls planned: ${jobs.length}`);
    console.log(`Models: ${models
        .filter((model) => activeModelIds.has(model.id))
        .map((model) => model.label)
        .join(", ")}`);
    console.log(`Efforts: ${efforts.join(", ")}`);
    console.log(`Configurations: ${models
        .map((model) => `${model.id}:${model.supportedEfforts.join("|")}`)
        .join(", ")}`);
    console.log(`Cases: ${cases.length}`);
    console.log(`Sequential delay: ${delayMs} ms`);
    console.log(`Shuffle seed: ${seed}`);
    console.log(`Report path: ${path.resolve(output)}`);
    console.log(`Report mode: ${accuracyOnly ? "accuracy only" : "detailed"}`);
    console.log("");
    if (!accuracyOnly) {
        console.log("Expected outcomes:");
        for (const benchmarkCase of cases) {
            console.log(`- ${benchmarkCase.id}: ${benchmarkCase.expectedOutcome} - ${benchmarkCase.title}`);
        }
        console.log("");
    }
    console.log("No API calls were made. Add --confirm-paid-run to execute the benchmark.");
}

function selectModelEffortConfigurations(specifications) {
    const selectedEfforts = new Map();
    for (const specification of specifications) {
        const [modelId, effort, extra] = specification.split(":");
        if (!modelId || !effort || extra != null) {
            throw new Error(`Invalid --model-effort value: ${specification}`);
        }
        const model = allModels.find((candidate) => candidate.id === modelId);
        if (!model) throw new Error(`--model-effort contains unsupported model: ${modelId}`);
        if (!model.supportedEfforts.includes(effort)) {
            throw new Error(`${modelId} does not support effort ${effort}`);
        }
        if (selectedEfforts.has(modelId)) {
            throw new Error(`--model-effort contains duplicate model: ${modelId}`);
        }
        selectedEfforts.set(modelId, effort);
    }

    return {
        models: allModels
            .filter((model) => selectedEfforts.has(model.id))
            .map((model) => ({
                ...model,
                supportedEfforts: [selectedEfforts.get(model.id)],
            })),
        efforts: DEFAULT_EFFORTS.filter((effort) => (
            [...selectedEfforts.values()].includes(effort)
        )),
    };
}

const service = createTranscriptReviewBenchmarkService();
const allModels = [
    {
        id: "deepseek",
        label: "deepseek v4 flash",
        requiredEnv: "DEEPSEEK_API_KEY",
        supportedEfforts: ["none", "low", "medium"],
        run: (request, effort) => service.reviewWithDeepSeek(request, {
            model: "deepseek-v4-flash",
            reasoningEffort: effort,
        }),
    },
    {
        id: "gemini",
        label: "gemini 3.6 flash",
        requiredEnv: "GEMINI_API_KEY",
        supportedEfforts: ["low", "medium"],
        run: (request, effort) => service.reviewWithGemini(request, {
            model: "gemini-3.6-flash",
            thinkingLevel: effort,
        }),
    },
    {
        id: "terra",
        label: "gpt-5.6 terra",
        requiredEnv: "OPENAI_API_KEY",
        supportedEfforts: ["low", "medium"],
        run: (request, effort) => service.reviewWithOpenAI(request, {
            model: "gpt-5.6-terra",
            reasoningEffort: effort,
        }),
    },
    {
        id: "luna",
        label: "gpt-5.6 luna",
        requiredEnv: "OPENAI_API_KEY",
        supportedEfforts: ["low", "medium"],
        run: (request, effort) => service.reviewWithOpenAI(request, {
            model: "gpt-5.6-luna",
            reasoningEffort: effort,
        }),
    },
];

async function main() {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
        printHelp();
        return;
    }

    const modelIds = allModels.map((model) => model.id);
    const caseIds = TRANSCRIPT_REVIEW_BENCHMARK_CASES.map((benchmarkCase) => benchmarkCase.id);
    assertKnownValues(options.models, modelIds, "--model");
    assertKnownValues(options.efforts, DEFAULT_EFFORTS, "--effort");
    assertKnownValues(options.cases, caseIds, "--case");

    if (options.modelEfforts.length > 0 && (options.models.length > 0 || options.efforts.length > 0)) {
        throw new Error("--model-effort cannot be combined with --model or --effort");
    }

    const selectedConfiguration = options.modelEfforts.length > 0
        ? selectModelEffortConfigurations(options.modelEfforts)
        : null;
    const models = selectedConfiguration?.models || (options.models.length > 0
        ? allModels.filter((model) => options.models.includes(model.id))
        : allModels);
    const efforts = selectedConfiguration?.efforts || (options.efforts.length > 0
        ? DEFAULT_EFFORTS.filter((effort) => options.efforts.includes(effort))
        : DEFAULT_EFFORTS);
    const cases = TRANSCRIPT_REVIEW_BENCHMARK_CASES
        .filter((benchmarkCase) => (
            options.cases.length === 0 || options.cases.includes(benchmarkCase.id)
        ))
        .map((benchmarkCase) => ({
            ...benchmarkCase,
            request: normalizeTranscriptReviewRequest(benchmarkCase.request),
        }));
    const jobs = createTranscriptReviewBenchmarkJobs({
        cases,
        efforts,
        models,
        seed: options.seed,
    });
    if (jobs.length === 0) {
        throw new Error("No model supports the selected effort combination");
    }

    if (!options.confirmPaidRun) {
        printDryRun({
            cases,
            efforts,
            models,
            jobs,
            seed: options.seed,
            delayMs: options.delayMs,
            output: options.output,
            accuracyOnly: options.accuracyOnly,
        });
        return;
    }

    const activeModelIds = new Set(jobs.map((job) => job.model.id));
    const activeModels = models.filter((model) => activeModelIds.has(model.id));
    const missingKeys = [...new Set(activeModels
        .map((model) => model.requiredEnv)
        .filter((envName) => !process.env[envName]))];
    if (missingKeys.length > 0) {
        throw new Error(`Missing API keys: ${missingKeys.join(", ")}`);
    }

    console.error(`[benchmark] Starting ${jobs.length} sequential paid API calls`);
    const report = await runTranscriptReviewBenchmark({
        cases,
        efforts,
        models,
        seed: options.seed,
        delayMs: options.delayMs,
        onProgress: ({ completed, total, record }) => {
            const outcome = record.success
                ? record.actualOutcome
                : `ERROR(${record.error.code})`;
            console.error(
                `[benchmark] ${completed}/${total} ${record.effort} ${record.modelId} `
                + `${record.caseId} ${record.latencyMs}ms ${outcome}`,
            );
        },
    });

    const markdown = options.accuracyOnly
        ? renderTranscriptReviewAccuracyMarkdown(report)
        : renderTranscriptReviewBenchmarkMarkdown(report);
    const outputPath = path.resolve(options.output);
    await writeFile(outputPath, markdown, "utf8");
    console.log(markdown);
    console.error(`[benchmark] Markdown report written to ${outputPath}`);
    if (report.records.some((record) => !record.success)) process.exitCode = 1;
}

main().catch((error) => {
    console.error(`[benchmark][failed] ${error.message}`);
    process.exitCode = 1;
});
