import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { consola } from "consola";

export function transcribe(
	inputFile: string,
	srtOut: string,
	whisperModel: string,
): void {
	consola.start("transcribing with faster-whisper...");
	const t0 = Date.now();
	const whisperScript = join(import.meta.dirname, "..", "whisper.py");
	execFileSync(
		"python3",
		[whisperScript, inputFile, srtOut, "--model", whisperModel],
		{ stdio: "inherit" },
	);
	const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
	consola.success(`transcription complete (${elapsed}s)`);
}
