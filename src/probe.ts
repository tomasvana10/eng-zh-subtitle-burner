import { execFileSync } from "node:child_process";

export interface ProbeResult {
	format: string;
	duration: number;
	fileSize: number;
	videoCodec: string;
	audioCodec: string;
	resolution: string;
	fps: number;
}

export function probeInput(inputFile: string): ProbeResult {
	const raw = execFileSync(
		"ffprobe",
		[
			"-v",
			"quiet",
			"-print_format",
			"json",
			"-show_format",
			"-show_streams",
			inputFile,
		],
		{ encoding: "utf-8" },
	);

	const info = JSON.parse(raw) as {
		format: { format_name: string; duration: string; size: string };
		streams: {
			codec_type: string;
			codec_name: string;
			width?: number;
			height?: number;
			r_frame_rate?: string;
		}[];
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

export function checkNvenc(): boolean {
	try {
		const result = execFileSync("ffmpeg", ["-hide_banner", "-encoders"], {
			encoding: "utf-8",
			stdio: ["pipe", "pipe", "pipe"],
		});
		return result.includes("h264_nvenc");
	} catch {
		return false;
	}
}
