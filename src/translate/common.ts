export const TRANSLATE_SYSTEM =
	"You are a professional English-to-Simplified-Chinese subtitle translator. Translate naturally and concisely. Output only the translations with their [number] prefixes, no explanations.";

export function buildTranslatePrompt(texts: string[]): string {
	const numbered = texts.map((t, i) => `[${i}] ${t}`).join("\n");
	return `Translate each numbered line from English to Simplified Chinese. Keep the [number] prefix. Output ONLY the translated lines, nothing else.\n\n${numbered}`;
}

export function buildFixSystem(context?: string): string {
	let system =
		"You are a transcription proofreader. Fix words that were likely misheard by automatic speech recognition. Output only the corrected lines with their [number] prefixes, no explanations. If a line is already correct, output it unchanged.";
	if (context) {
		system += `\n\nContext about this video: ${context}`;
	}
	return system;
}

export function buildFixPrompt(texts: string[]): string {
	const numbered = texts.map((t, i) => `[${i}] ${t}`).join("\n");
	return `Review and fix any speech recognition errors in these subtitle lines. Keep the [number] prefix. Output ALL lines, corrected or unchanged.\n\n${numbered}`;
}

export function parseTranslateResponse(
	content: string,
	count: number,
): string[] {
	const cleaned = content.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
	const translated: string[] = new Array(count).fill("");
	for (const line of cleaned.split("\n")) {
		const m = line.match(/^\[(\d+)\]\s*(.+)/);
		if (m) {
			const idx = parseInt(m[1], 10);
			if (idx >= 0 && idx < count) {
				translated[idx] = m[2].trim().replace(/\n/g, " ");
			}
		}
	}
	return translated;
}
