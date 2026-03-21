import sys
from faster_whisper import WhisperModel


def seconds_to_srt_time(s: float) -> str:
    hours = int(s // 3600)
    minutes = int((s % 3600) // 60)
    secs = int(s % 60)
    millis = int((s % 1) * 1000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d},{millis:03d}"


def transcribe(input_path: str, output_path: str) -> None:
    model = WhisperModel("large-v3", device="cuda", compute_type="float16")
    segments, info = model.transcribe(input_path, language="en", vad_filter=True)

    with open(output_path, "w", encoding="utf-8") as f:
        idx = 0
        for seg in segments:
            text = seg.text.strip()
            if not text:
                continue
            # skip zero/negative duration segments
            if seg.end <= seg.start:
                continue
            # collapse internal newlines and strip SRT-breaking chars
            text = " ".join(text.split())
            text = text.replace("-->", "- >")
            idx += 1
            start = seconds_to_srt_time(seg.start)
            end = seconds_to_srt_time(seg.end)
            f.write(f"{idx}\n{start} --> {end}\n{text}\n\n")

    print(f"transcribed {info.duration:.1f}s of audio to {output_path}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print(f"Usage: {sys.argv[0]} <input> <output.srt>")
        sys.exit(1)
    transcribe(sys.argv[1], sys.argv[2])
