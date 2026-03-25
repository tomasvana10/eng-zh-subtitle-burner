import logging
import sys
import time

from faster_whisper import WhisperModel

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("whisper")


def seconds_to_srt_time(s: float) -> str:
    hours = int(s // 3600)
    minutes = int((s % 3600) // 60)
    secs = int(s % 60)
    millis = int((s % 1) * 1000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d},{millis:03d}"


def transcribe(input_path: str, output_path: str) -> None:
    import torch

    device = "cpu"
    compute_type = "int8"
    if torch.cuda.is_available():
        gpu_name = torch.cuda.get_device_name(0)
        gpu_mem = torch.cuda.get_device_properties(0).total_memory / 1024**3
        log.info(f"CUDA available: {gpu_name} ({gpu_mem:.1f} GB)")
        device = "cuda"
        compute_type = "float16"
    else:
        log.warning("CUDA not available — falling back to CPU (this will be slow)")

    # also check ctranslate2 backend
    try:
        import ctranslate2
        log.info(f"ctranslate2 {ctranslate2.__version__}, CUDA supported: {ctranslate2.get_cuda_device_count() > 0}")
    except Exception as e:
        log.warning(f"cannot check ctranslate2: {e}")

    log.info(f"loading whisper model (large-v3) on {device} ({compute_type})...")
    t0 = time.time()
    model = WhisperModel("large-v3", device=device, compute_type=compute_type)
    log.info(f"model loaded in {time.time() - t0:.1f}s")

    log.info(f"transcribing: {input_path}")
    t0 = time.time()
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

    elapsed = time.time() - t0
    log.info(f"transcribed {info.duration:.1f}s of audio -> {idx} segments in {elapsed:.1f}s ({info.duration / elapsed:.1f}x realtime)")
    log.info(f"output: {output_path}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print(f"Usage: {sys.argv[0]} <input> <output.srt>")
        sys.exit(1)
    transcribe(sys.argv[1], sys.argv[2])
