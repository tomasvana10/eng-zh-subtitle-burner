import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";

interface SrtEntry {
	index: number;
	time: string;
	text: string;
}

const TRANSLATION_BATCH_SIZE = 20;

const { values, positionals } = parseArgs({
	allowPositionals: true,
	options: {
		output: { type: "string", short: "o" },
		"ollama-url": { type: "string", default: "http://ollama:11434" },
		model: { type: "string", default: "qwen3:14b" },
	},
});

const inputPath = positionals[0];
if (!inputPath) {
	console.error("Usage: node translate.js <input.mp4> -o <output.mp4>");
	process.exit(1);
}

const input = resolve(inputPath);
const output = resolve(
	values.output ?? `${input.replace(/\.[^.]+$/, "")}_subtitled.mp4`,
);
const ollamaUrl = values["ollama-url"];
const model = values.model;

function parseSrt(content: string) {
	const entries: SrtEntry[] = [];
	const blocks = content.trim().split(/\n\n+/);
	for (const block of blocks) {
		const lines = block.trim().split("\n");
		if (lines.length < 3) continue;
		entries.push({
			index: parseInt(lines[0], 10),
			time: lines[1],
			text: lines.slice(2).join("\n"),
		});
	}
	return entries;
}

function sanitizeSrtText(text: string) {
	return text
		.replace(/\r/g, "") // strip carriage returns
		.replace(/\n{2,}/g, "\n") // collapse multiple newlines (blank lines break SRT blocks)
		.replace(/-->/g, "- >") // arrow breaks SRT timestamp parser
		.trim();
}

function formatSrt(entries: SrtEntry[]) {
	return entries
		.map((e) => `${e.index}\n${e.time}\n${sanitizeSrtText(e.text)}\n`)
		.join("\n");
}

function transcribe(inputFile: string, srtOut: string) {
	console.log("transcribing with faster-whisper...");
	const whisperScript = join(import.meta.dirname, "whisper.py");
	execFileSync("python3", [whisperScript, inputFile, srtOut], {
		stdio: "inherit",
	});
}

async function translateBatch(texts: string[]) {
	const numbered = texts.map((t, i) => `[${i}] ${t}`).join("\n");
	const prompt = `Translate each numbered line from English to Simplified Chinese. Keep the [number] prefix. Output ONLY the translated lines, nothing else.\n\n${numbered}`;

	const res = await fetch(`${ollamaUrl}/api/chat`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			model,
			messages: [
				{
					role: "system",
					content:
						"You are a professional English-to-Simplified-Chinese subtitle translator. Translate naturally and concisely. Output only the translations with their [number] prefixes, no explanations.",
				},
				{ role: "user", content: prompt },
			],
			stream: false,
			options: { temperature: 0.3, num_ctx: 4096 },
		}),
	});

	if (!res.ok) {
		throw new Error(`Ollama error: ${res.status} ${await res.text()}`);
	}

	const data = (await res.json()) as { message: { content: string } };
	const content = data.message.content.trim();

	const cleaned = content.replace(/<think>[\s\S]*?<\/think>/g, "").trim();

	const translated: string[] = new Array(texts.length).fill("");
	for (const line of cleaned.split("\n")) {
		const m = line.match(/^\[(\d+)\]\s*(.+)/);
		if (m) {
			const idx = parseInt(m[1], 10);
			if (idx >= 0 && idx < texts.length) {
				// collapse to single line — multi-line breaks SRT block boundaries
				translated[idx] = m[2].trim().replace(/\n/g, " ");
			}
		}
	}
	return translated;
}

async function translateSrt(
	enSrtPath: string,
	zhSrtPath: string,
): Promise<void> {
	console.log("translating to chinese via ollama...");
	const entries = parseSrt(readFileSync(enSrtPath, "utf-8"));
	const zhEntries: SrtEntry[] = [];

	for (let i = 0; i < entries.length; i += TRANSLATION_BATCH_SIZE) {
		const batch = entries.slice(i, i + TRANSLATION_BATCH_SIZE);
		const texts = batch.map((e) => e.text);
		const translated = await translateBatch(texts);
		for (let j = 0; j < batch.length; j++) {
			zhEntries.push({
				index: batch[j].index,
				time: batch[j].time,
				text: translated[j] || batch[j].text, // fallback to original if translation empty
			});
		}
		const done = Math.min(i + TRANSLATION_BATCH_SIZE, entries.length);
		console.log(`  translated ${done}/${entries.length} entries`);
	}

	writeFileSync(zhSrtPath, formatSrt(zhEntries), "utf-8");
}

function burnSubtitles(
	inputFile: string,
	enSrt: string,
	zhSrt: string,
	outputFile: string,
): void {
	console.log("burning subtitles with ffmpeg...");

	// libass needs : \ ' [ ] escaped in file paths
	const escPath = (p: string) =>
		p.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'");

	// chinese on top, english on bottom
	const filterComplex = [
		`subtitles='${escPath(enSrt)}':force_style='FontSize=18,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,Outline=2,Alignment=2,MarginV=30'`,
		`subtitles='${escPath(zhSrt)}':force_style='FontSize=20,PrimaryColour=&H0000FFFF,OutlineColour=&H00000000,Outline=2,Alignment=2,MarginV=60'`,
	].join(",");

	execFileSync(
		"ffmpeg",
		[
			"-i",
			inputFile,
			"-vf",
			filterComplex,
			"-c:v",
			"libx264",
			"-preset",
			"medium",
			"-crf",
			"18",
			"-c:a",
			"copy",
			"-y",
			outputFile,
		],
		{ stdio: "inherit" },
	);
}

async function main() {
	const tmp = mkdtempSync(join(tmpdir(), "subpipe-"));

	try {
		const enSrt = join(tmp, "en.srt");
		const zhSrt = join(tmp, "zh.srt");

		transcribe(input, enSrt);
		await translateSrt(enSrt, zhSrt);
		burnSubtitles(input, enSrt, zhSrt, output);

		console.log(`\nDone! Output: ${output}`);
	} finally {
		rmSync(tmp, { recursive: true, force: true });
	}
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
