import { execFileSync } from "node:child_process";
import { statSync } from "node:fs";
import { extname } from "node:path";
import { consola } from "consola";
import { formatFileSize } from "./utils.js";

export interface EncodeOptions {
	crf: number;
	preset: string;
}

function getCodecArgs(
	outputFile: string,
	useNvenc: boolean,
	opts: EncodeOptions,
): string[] {
	const ext = extname(outputFile).toLowerCase();
	switch (ext) {
		case ".webm":
			return [
				"-c:v",
				"libvpx-vp9",
				"-crf",
				String(opts.crf),
				"-b:v",
				"0",
				"-c:a",
				"libopus",
			];
		case ".ogv":
			return ["-c:v", "libtheora", "-q:v", "7", "-c:a", "libvorbis"];
		default:
			if (useNvenc) {
				return [
					"-c:v",
					"h264_nvenc",
					"-preset",
					"p4",
					"-cq",
					String(opts.crf),
					"-b:v",
					"0",
					"-c:a",
					"copy",
				];
			}
			return [
				"-c:v",
				"libx264",
				"-preset",
				opts.preset,
				"-crf",
				String(opts.crf),
				"-c:a",
				"copy",
			];
	}
}

function escPath(p: string): string {
	return p
		.replace(/\\/g, "\\\\")
		.replace(/:/g, "\\:")
		.replace(/'/g, "\\'")
		.replace(/\[/g, "\\[")
		.replace(/\]/g, "\\]");
}

export function burnSubtitles(
	inputFile: string,
	assFile: string,
	outputFile: string,
	useNvenc: boolean,
	opts: EncodeOptions,
): void {
	const codecArgs = getCodecArgs(outputFile, useNvenc, opts);
	consola.start(
		`burning subtitles with ffmpeg (${codecArgs[1]}, crf=${opts.crf})...`,
	);
	const t0 = Date.now();

	execFileSync(
		"ffmpeg",
		[
			"-hwaccel",
			"auto",
			"-i",
			inputFile,
			"-vf",
			`ass='${escPath(assFile)}'`,
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

export function muxSubtitles(
	inputFile: string,
	assFile: string,
	outputFile: string,
): void {
	consola.start("muxing subtitles (soft subs, no re-encode)...");
	const t0 = Date.now();

	execFileSync(
		"ffmpeg",
		[
			"-i",
			inputFile,
			"-i",
			assFile,
			"-map",
			"0",
			"-map",
			"1",
			"-c",
			"copy",
			"-c:s",
			"ass",
			"-y",
			outputFile,
		],
		{ stdio: "inherit" },
	);

	const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
	const outSize = formatFileSize(statSync(outputFile).size);
	consola.success(`muxing complete (${elapsed}s, ${outSize})`);
}
