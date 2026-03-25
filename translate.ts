import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, extname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { consola } from "consola";

interface SrtEntry {
	index: number;
	time: string;
	text: string;
}

interface ProbeResult {
	format: string;
	duration: number;
	fileSize: number;
	videoCodec: string;
	audioCodec: string;
	resolution: string;
	fps: number;
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
	consola.error("Usage: node translate.js <input video> [-o <output>]");
	process.exit(1);
}

const input = resolve(inputPath);
const inputExt = extname(input) || ".mp4";
const output = resolve(
	values.output ?? `${input.replace(/\.[^.]+$/, "")}_subtitled${inputExt}`,
);
const ollamaUrl = values["ollama-url"];
const model = values.model;

function formatDuration(seconds: number): string {
	const h = Math.floor(seconds / 3600);
	const m = Math.floor((seconds % 3600) / 60);
	const s = Math.floor(seconds % 60);
	if (h > 0) return `${h}h${m}m${s}s`;
	if (m > 0) return `${m}m${s}s`;
	return `${s}s`;
}

function formatFileSize(bytes: number): string {
	if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(2)} GB`;
	if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
	return `${(bytes / 1e3).toFixed(0)} KB`;
}

function probeInput(inputFile: string): ProbeResult {
	const raw = execFileSync("ffprobe", [
		"-v", "quiet",
		"-print_format", "json",
		"-show_format",
		"-show_streams",
		inputFile,
	], { encoding: "utf-8" });

	const info = JSON.parse(raw) as {
		format: { format_name: string; duration: string; size: string };
		streams: { codec_type: string; codec_name: string; width?: number; height?: number; r_frame_rate?: string }[];
	};

	const video = info.streams.find((s) => s.codec_type === "video");
	const audio = info.streams.find((s) => s.codec_type === "audio");

	let fps = 0;
	if (video?.r_frame_rate) {
		const [num, den] = video.r_frame_rate.split("/").map(Number);
		if (den) fps = Math.round((num / den) * 100) / 100;
	}

	return {
		format: info.format.format_name,
		duration: parseFloat(info.format.duration),
		fileSize: parseInt(info.format.size, 10),
		videoCodec: video?.codec_name ?? "unknown",
		audioCodec: audio?.codec_name ?? "none",
		resolution: video ? `${video.width}x${video.height}` : "unknown",
		fps,
	};
}

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
	consola.start("transcribing with faster-whisper...");
	const t0 = Date.now();
	const whisperScript = join(import.meta.dirname, "whisper.py");
	execFileSync("python3", [whisperScript, inputFile, srtOut], {
		stdio: "inherit",
	});
	const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
	consola.success(`transcription complete (${elapsed}s)`);
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
	const entries = parseSrt(readFileSync(enSrtPath, "utf-8"));
	const totalBatches = Math.ceil(entries.length / TRANSLATION_BATCH_SIZE);
	consola.start(`translating ${entries.length} entries to chinese via ollama (${model}, ${totalBatches} batches)`);
	const t0 = Date.now();
	const zhEntries: SrtEntry[] = [];

	for (let i = 0; i < entries.length; i += TRANSLATION_BATCH_SIZE) {
		const batchNum = Math.floor(i / TRANSLATION_BATCH_SIZE) + 1;
		const batch = entries.slice(i, i + TRANSLATION_BATCH_SIZE);
		const texts = batch.map((e) => e.text);
		consola.info(`  batch ${batchNum}/${totalBatches} (${texts.length} lines)...`);
		const batchT0 = Date.now();
		const translated = await translateBatch(texts);
		const batchElapsed = ((Date.now() - batchT0) / 1000).toFixed(1);
		for (let j = 0; j < batch.length; j++) {
			zhEntries.push({
				index: batch[j].index,
				time: batch[j].time,
				text: translated[j] || batch[j].text, // fallback to original if translation empty
			});
		}
		const done = Math.min(i + TRANSLATION_BATCH_SIZE, entries.length);
		consola.success(`  batch ${batchNum} done: ${done}/${entries.length} entries (${batchElapsed}s)`);
	}

	const totalElapsed = ((Date.now() - t0) / 1000).toFixed(1);
	consola.success(`translation complete (${totalElapsed}s)`);
	writeFileSync(zhSrtPath, formatSrt(zhEntries), "utf-8");
}

function getCodecArgs(outputFile: string): string[] {
	const ext = extname(outputFile).toLowerCase();
	switch (ext) {
		case ".webm":
			return ["-c:v", "libvpx-vp9", "-crf", "30", "-b:v", "0", "-c:a", "libopus"];
		case ".ogv":
			return ["-c:v", "libtheora", "-q:v", "7", "-c:a", "libvorbis"];
		default:
			// mp4, mkv, mov, avi, ts, etc. — H.264 is widely supported
			return ["-c:v", "libx264", "-preset", "medium", "-crf", "18", "-c:a", "copy"];
	}
}

function burnSubtitles(
	inputFile: string,
	enSrt: string,
	zhSrt: string,
	outputFile: string,
): void {
	const codecArgs = getCodecArgs(outputFile);
	consola.start(`burning subtitles with ffmpeg (${codecArgs[1]})...`);
	const t0 = Date.now();

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
			...codecArgs,
			"-y",
			outputFile,
		],
		{ stdio: "inherit" },
	);

	const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
	const outSize = formatFileSize(statSync(outputFile).size);
	consola.success(`encoding complete (${elapsed}s, ${outSize})`);
}

async function checkOllamaGpu() {
	try {
		const res = await fetch(`${ollamaUrl}/api/ps`);
		if (res.ok) {
			const data = (await res.json()) as {
				models?: { name: string; size: number; details?: { family: string } }[];
			};
			consola.info(`ollama server reachable at ${ollamaUrl}`);
			if (data.models?.length) {
				for (const m of data.models) {
					consola.info(`loaded model: ${m.name} (${(m.size / 1e9).toFixed(1)} GB)`);
				}
			} else {
				consola.info(`no models loaded yet (first request will load ${model})`);
			}
		}
	} catch (err) {
		consola.warn(`cannot reach ollama at ${ollamaUrl}: ${err}`);
	}
}

async function main() {
	const pipelineT0 = Date.now();

	consola.box(`eng-zh-subtitle-burner`);

	// probe input file
	const probe = probeInput(input);
	consola.info(`input: ${basename(input)}`);
	consola.info(`  format: ${probe.format} | ${probe.resolution} | ${probe.fps}fps`);
	consola.info(`  codecs: video=${probe.videoCodec} audio=${probe.audioCodec}`);
	consola.info(`  duration: ${formatDuration(probe.duration)} | size: ${formatFileSize(probe.fileSize)}`);
	consola.info(`output: ${basename(output)} (${extname(output)})`);

	const tmp = mkdtempSync(join(tmpdir(), "subpipe-"));

	try {
		const enSrt = join(tmp, "en.srt");
		const zhSrt = join(tmp, "zh.srt");

		await checkOllamaGpu();
		transcribe(input, enSrt);
		await translateSrt(enSrt, zhSrt);
		burnSubtitles(input, enSrt, zhSrt, output);

		const totalElapsed = ((Date.now() - pipelineT0) / 1000).toFixed(1);
		consola.success(`done in ${totalElapsed}s! output: ${output}`);
	} finally {
		rmSync(tmp, { recursive: true, force: true });
	}
}

main().catch((err) => {
	consola.error(err);
	process.exit(1);
});
