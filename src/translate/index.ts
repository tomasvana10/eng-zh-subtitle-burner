import { readFileSync, writeFileSync } from "node:fs";
import { consola } from "consola";
import { type SrtEntry, formatSrt, parseSrt } from "../srt.js";
import { chatChatgpt, translateBatchChatgpt } from "./chatgpt.js";
import { chatClaude, translateBatchClaude } from "./claude.js";
import { chatGemini, translateBatchGemini } from "./gemini.js";
import { chatLocal, translateBatchLocal } from "./local.js";
import {
	buildFixPrompt,
	buildFixSystem,
	parseTranslateResponse,
} from "./common.js";

export type ApiProvider = "claude" | "chatgpt" | "gemini";

export const DEFAULT_API_MODELS: Record<ApiProvider, string> = {
	claude: "claude-sonnet-4-20250514",
	chatgpt: "gpt-4o",
	gemini: "gemini-2.0-flash",
};

export interface TranslateConfig {
	via: "local" | "api";
	ollamaUrl: string;
	localModel: string;
	provider?: ApiProvider;
	apiKey?: string;
	apiModel?: string;
	batchSize: number;
}

function getChatFn(
	cfg: TranslateConfig,
): (system: string, user: string) => Promise<string> {
	if (cfg.via === "api") {
		const model = cfg.apiModel ?? DEFAULT_API_MODELS[cfg.provider!];
		switch (cfg.provider!) {
			case "claude":
				return (sys, usr) => chatClaude(sys, usr, cfg.apiKey!, model);
			case "chatgpt":
				return (sys, usr) => chatChatgpt(sys, usr, cfg.apiKey!, model);
			case "gemini":
				return (sys, usr) => chatGemini(sys, usr, cfg.apiKey!, model);
		}
	}
	return (sys, usr) => chatLocal(sys, usr, cfg.ollamaUrl, cfg.localModel);
}

function getTranslateFn(
	cfg: TranslateConfig,
): (texts: string[]) => Promise<string[]> {
	if (cfg.via === "api") {
		const model = cfg.apiModel ?? DEFAULT_API_MODELS[cfg.provider!];
		switch (cfg.provider!) {
			case "claude":
				return (texts) => translateBatchClaude(texts, cfg.apiKey!, model);
			case "chatgpt":
				return (texts) =>
					translateBatchChatgpt(texts, cfg.apiKey!, model);
			case "gemini":
				return (texts) =>
					translateBatchGemini(texts, cfg.apiKey!, model);
		}
	}
	return (texts) => translateBatchLocal(texts, cfg.ollamaUrl, cfg.localModel);
}

function describeTranslation(cfg: TranslateConfig): string {
	if (cfg.via === "api") {
		const model = cfg.apiModel ?? DEFAULT_API_MODELS[cfg.provider!];
		return `${cfg.provider} API (${model})`;
	}
	return `ollama (${cfg.localModel})`;
}

export async function fixTranscriptionSrt(
	enSrtPath: string,
	cfg: TranslateConfig,
	context?: string,
): Promise<void> {
	const entries = parseSrt(readFileSync(enSrtPath, "utf-8"));
	const totalBatches = Math.ceil(entries.length / cfg.batchSize);
	const via = describeTranslation(cfg);
	consola.start(
		`fixing transcription for ${entries.length} entries via ${via}, ${totalBatches} batches`,
	);
	const t0 = Date.now();
	const chat = getChatFn(cfg);
	const systemMsg = buildFixSystem(context);
	const fixedEntries: SrtEntry[] = [];

	for (let i = 0; i < entries.length; i += cfg.batchSize) {
		const batchNum = Math.floor(i / cfg.batchSize) + 1;
		const batch = entries.slice(i, i + cfg.batchSize);
		const texts = batch.map((e) => e.text);
		consola.info(
			`  batch ${batchNum}/${totalBatches} (${texts.length} lines)...`,
		);
		const batchT0 = Date.now();
		const content = await chat(systemMsg, buildFixPrompt(texts));
		const fixed = parseTranslateResponse(content, texts.length);
		const batchElapsed = ((Date.now() - batchT0) / 1000).toFixed(1);
		for (let j = 0; j < batch.length; j++) {
			fixedEntries.push({
				index: batch[j].index,
				time: batch[j].time,
				text: fixed[j] || batch[j].text,
			});
		}
		const done = Math.min(i + cfg.batchSize, entries.length);
		consola.success(
			`  batch ${batchNum} done: ${done}/${entries.length} entries (${batchElapsed}s)`,
		);
	}

	const totalElapsed = ((Date.now() - t0) / 1000).toFixed(1);
	consola.success(`transcription fix complete (${totalElapsed}s)`);
	writeFileSync(enSrtPath, formatSrt(fixedEntries), "utf-8");
}

export async function translateSrt(
	enSrtPath: string,
	zhSrtPath: string,
	cfg: TranslateConfig,
): Promise<void> {
	const entries = parseSrt(readFileSync(enSrtPath, "utf-8"));
	const totalBatches = Math.ceil(entries.length / cfg.batchSize);
	const via = describeTranslation(cfg);
	consola.start(
		`translating ${entries.length} entries to chinese via ${via}, ${totalBatches} batches`,
	);
	const t0 = Date.now();
	const zhEntries: SrtEntry[] = [];
	const translate = getTranslateFn(cfg);

	for (let i = 0; i < entries.length; i += cfg.batchSize) {
		const batchNum = Math.floor(i / cfg.batchSize) + 1;
		const batch = entries.slice(i, i + cfg.batchSize);
		const texts = batch.map((e) => e.text);
		consola.info(
			`  batch ${batchNum}/${totalBatches} (${texts.length} lines)...`,
		);
		const batchT0 = Date.now();
		const translated = await translate(texts);
		const batchElapsed = ((Date.now() - batchT0) / 1000).toFixed(1);
		for (let j = 0; j < batch.length; j++) {
			zhEntries.push({
				index: batch[j].index,
				time: batch[j].time,
				text: translated[j] || batch[j].text,
			});
		}
		const done = Math.min(i + cfg.batchSize, entries.length);
		consola.success(
			`  batch ${batchNum} done: ${done}/${entries.length} entries (${batchElapsed}s)`,
		);
	}

	const totalElapsed = ((Date.now() - t0) / 1000).toFixed(1);
	consola.success(`translation complete (${totalElapsed}s)`);
	writeFileSync(zhSrtPath, formatSrt(zhEntries), "utf-8");
}

export async function checkOllamaGpu(
	ollamaUrl: string,
	model: string,
): Promise<void> {
	try {
		const res = await fetch(`${ollamaUrl}/api/ps`);
		if (res.ok) {
			const data = (await res.json()) as {
				models?: { name: string; size: number }[];
			};
			consola.info(`ollama server reachable at ${ollamaUrl}`);
			if (data.models?.length) {
				for (const m of data.models) {
					consola.info(
						`loaded model: ${m.name} (${(m.size / 1e9).toFixed(1)} GB)`,
					);
				}
			} else {
				consola.info(
					`no models loaded yet (first request will load ${model})`,
				);
			}
		}
	} catch (err) {
		consola.warn(`cannot reach ollama at ${ollamaUrl}: ${err}`);
	}
}
