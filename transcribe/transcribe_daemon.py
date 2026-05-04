import logging
import os
import subprocess
import threading
import time
from pathlib import Path
from queue import Queue
from typing import Any, Optional

import torch
from fastapi import FastAPI, HTTPException
from huggingface_hub import login as hf_login
from pydantic import BaseModel
from transformers import pipeline

MODEL_NAME = os.environ.get("WHISPER_MODEL", "kotoba-tech/kotoba-whisper-v2.2")
LANGUAGE = os.environ.get("WHISPER_LANGUAGE", "ja")
CHUNK_LENGTH_S = int(os.environ.get("WHISPER_CHUNK_LENGTH_S", "15"))
BATCH_SIZE = int(os.environ.get("WHISPER_BATCH_SIZE", "8"))
ADD_PUNCTUATION = os.environ.get("WHISPER_ADD_PUNCTUATION", "1") not in ("0", "false", "False")
ADD_SILENCE_S = float(os.environ.get("WHISPER_ADD_SILENCE_S", "0.0"))
HF_TOKEN = os.environ.get("HF_TOKEN") or os.environ.get("HUGGINGFACE_HUB_TOKEN")
OUTPUT_DIR = Path(os.environ.get("TRANSCRIPT_OUTPUT_DIR", "/app/data/transcripts"))
TMP_DIR = Path(os.environ.get("TRANSCRIBE_TMP_DIR", "/tmp"))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
log = logging.getLogger("transcribe")

if HF_TOKEN:
    log.info("authenticating to Hugging Face")
    hf_login(token=HF_TOKEN, add_to_git_credential=False)
else:
    log.warning("HF_TOKEN is not set; pyannote diarization model load will fail")

app = FastAPI()
job_queue: "Queue[TranscribeRequest]" = Queue()
job_status: dict[str, dict[str, Any]] = {}
status_lock = threading.Lock()


class TranscribeRequest(BaseModel):
    recordedId: int | str
    recPath: str
    name: Optional[str] = None
    channelName: Optional[str] = None
    description: Optional[str] = None


def _update_status(rec_id: str, **kwargs: Any) -> None:
    with status_lock:
        job_status.setdefault(rec_id, {}).update(kwargs)


def _extract_wav(rec_path: str, out_wav: str) -> None:
    subprocess.run(
        [
            "ffmpeg", "-y", "-loglevel", "error",
            "-i", rec_path,
            "-vn", "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le",
            out_wav,
        ],
        check=True,
    )


def _format_line(start: float, end: float, speaker: Optional[str], text: str) -> str:
    text = (text or "").strip()
    if speaker:
        return f"[{start:7.1f}-{end:7.1f}] ({speaker}) {text}"
    return f"[{start:7.1f}-{end:7.1f}] {text}"


def _transcribe_one(req: "TranscribeRequest") -> None:
    rec_id = str(req.recordedId)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    TMP_DIR.mkdir(parents=True, exist_ok=True)

    wav_path = TMP_DIR / f"transcribe-{rec_id}.wav"
    out_txt = OUTPUT_DIR / f"{rec_id}.txt"

    _update_status(rec_id, state="extracting", recPath=req.recPath, startedAt=time.time())
    t0 = time.time()
    _extract_wav(req.recPath, str(wav_path))

    _update_status(rec_id, state="transcribing")
    t1 = time.time()
    pipe_kwargs: dict[str, Any] = {
        "chunk_length_s": CHUNK_LENGTH_S,
        "add_punctuation": ADD_PUNCTUATION,
    }
    if ADD_SILENCE_S > 0:
        pipe_kwargs["add_silence_start"] = ADD_SILENCE_S
        pipe_kwargs["add_silence_end"] = ADD_SILENCE_S
    result = PIPE(str(wav_path), **pipe_kwargs)
    elapsed = time.time() - t1

    chunks = result.get("chunks", []) if isinstance(result, dict) else []
    lines = []
    last_end = 0.0
    for c in chunks:
        ts = c.get("timestamp") or [0.0, 0.0]
        start = float(ts[0]) if ts[0] is not None else last_end
        end = float(ts[1]) if ts[1] is not None else start
        last_end = end
        speaker = c.get("speaker_id") or ""
        text = c.get("text") or ""
        lines.append(_format_line(start, end, speaker, text))

    out_txt.write_text("\n".join(lines) + "\n", encoding="utf-8")
    try:
        wav_path.unlink()
    except FileNotFoundError:
        pass

    _update_status(
        rec_id,
        state="done",
        outputPath=str(out_txt),
        transcribeSec=round(elapsed, 1),
        totalSec=round(time.time() - t0, 1),
        approxAudioSec=round(last_end, 1),
        speedRealtime=round(last_end / elapsed, 2) if elapsed > 0 and last_end > 0 else None,
        finishedAt=time.time(),
    )
    log.info(
        f"transcribed {rec_id}: elapsed={elapsed:.1f}s "
        f"approx_audio={last_end:.1f}s "
        f"speed={last_end / elapsed if elapsed > 0 else 0:.2f}x realtime"
    )


def _worker() -> None:
    while True:
        req = job_queue.get()
        rec_id = str(req.recordedId)
        try:
            _transcribe_one(req)
        except subprocess.CalledProcessError as e:
            log.exception(f"ffmpeg failed for {rec_id}")
            _update_status(rec_id, state="failed", error=f"ffmpeg: {e}")
        except Exception as e:
            log.exception(f"transcribe failed: {rec_id}")
            _update_status(rec_id, state="failed", error=str(e))
        finally:
            job_queue.task_done()


log.info(f"loading kotoba-whisper pipeline: {MODEL_NAME}")
_t0 = time.time()
PIPE = pipeline(
    model=MODEL_NAME,
    torch_dtype=torch.float32,
    device="cpu",
    batch_size=BATCH_SIZE,
    trust_remote_code=True,
)
log.info(f"pipeline ready in {time.time() - _t0:.1f}s")

threading.Thread(target=_worker, daemon=True).start()


@app.post("/transcribe")
def enqueue(req: TranscribeRequest) -> dict[str, Any]:
    rec_id = str(req.recordedId)
    if not Path(req.recPath).is_file():
        raise HTTPException(status_code=404, detail=f"recPath not found: {req.recPath}")
    _update_status(rec_id, state="queued", recPath=req.recPath, queuedAt=time.time())
    job_queue.put(req)
    return {"queued": rec_id, "queueSize": job_queue.qsize()}


@app.get("/status/{rec_id}")
def get_status(rec_id: str) -> dict[str, Any]:
    with status_lock:
        st = job_status.get(rec_id)
    if st is None:
        raise HTTPException(status_code=404, detail="unknown recordedId")
    return {"recordedId": rec_id, **st}


@app.get("/jobs")
def list_jobs() -> dict[str, Any]:
    with status_lock:
        return {"queueSize": job_queue.qsize(), "jobs": dict(job_status)}


@app.get("/healthz")
def healthz() -> dict[str, Any]:
    return {"ok": True, "queueSize": job_queue.qsize(), "model": MODEL_NAME}
