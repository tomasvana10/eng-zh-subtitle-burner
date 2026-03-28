export interface SrtEntry {
	index: number;
	time: string;
	text: string;
}

export function srtTimeToSeconds(time: string): number {
	const [hms, ms] = time.split(",");
	const [h, m, s] = hms.split(":").map(Number);
	return h * 3600 + m * 60 + s + parseInt(ms, 10) / 1000;
}

export function secondsToSrtTime(totalSec: number): string {
	const totalMs = Math.round(totalSec * 1000);
	const h = Math.floor(totalMs / 3600000);
	const m = Math.floor((totalMs % 3600000) / 60000);
	const s = Math.floor((totalMs % 60000) / 1000);
	const ms = totalMs % 1000;
	return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}

export function parseSrt(content: string): SrtEntry[] {
	const entries: SrtEntry[] = [];
	const blocks = content.trim().split(/\n\n+/);
	for (const block of blocks) {
		const lines = block.trim().split("\n");
		if (lines.length < 3) continue;
		if (!lines[1].includes(" --> ")) continue;
		entries.push({
			index: parseInt(lines[0], 10),
			time: lines[1],
			text: lines.slice(2).join("\n"),
		});
	}
	return entries;
}

export function fixOverlaps(entries: SrtEntry[]): SrtEntry[] {
	if (entries.length === 0) return entries;

	const parsed = entries.map((e) => {
		const [startStr, endStr] = e.time.split(" --> ");
		return {
			text: e.text,
			start: srtTimeToSeconds(startStr.trim()),
			end: srtTimeToSeconds(endStr.trim()),
		};
	});

	parsed.sort((a, b) => a.start - b.start);

	for (let i = 0; i < parsed.length - 1; i++) {
		if (parsed[i].end > parsed[i + 1].start) {
			parsed[i].end = parsed[i + 1].start;
		}
	}

	return parsed
		.filter((e) => e.end > e.start)
		.map((e, i) => ({
			index: i + 1,
			time: `${secondsToSrtTime(e.start)} --> ${secondsToSrtTime(e.end)}`,
			text: e.text,
		}));
}

export function sanitizeSrtText(text: string): string {
	return text
		.replace(/\r/g, "")
		.replace(/\n{2,}/g, "\n")
		.replace(/-->/g, "- >")
		.trim();
}

export function formatSrt(entries: SrtEntry[]): string {
	return entries
		.map((e) => `${e.index}\n${e.time}\n${sanitizeSrtText(e.text)}\n`)
		.join("\n");
}
