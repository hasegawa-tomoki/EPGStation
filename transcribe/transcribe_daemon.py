import logging
import os
import subprocess
import threading
import time
import wave
from pathlib import Path
from queue import Queue
from typing import Any, Optional

import numpy as np
from fastapi import FastAPI, HTTPException
from faster_whisper import WhisperModel
from pydantic import BaseModel

MODEL_NAME = os.environ.get("WHISPER_MODEL", "kotoba-tech/kotoba-whisper-v2.0-faster")
COMPUTE_TYPE = os.environ.get("WHISPER_COMPUTE_TYPE", "int8")
LANGUAGE = os.environ.get("WHISPER_LANGUAGE", "ja")
BEAM_SIZE = int(os.environ.get("WHISPER_BEAM_SIZE", "5"))
OUTPUT_DIR = Path(os.environ.get("TRANSCRIPT_OUTPUT_DIR", "/app/data/transcripts"))
TMP_DIR = Path(os.environ.get("TRANSCRIBE_TMP_DIR", "/tmp"))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
log = logging.getLogger("transcribe")

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


def _load_audio(wav_path: str) -> tuple[np.ndarray, int]:
    with wave.open(wav_path, "rb") as w:
        sr = w.getframerate()
        raw = w.readframes(w.getnframes())
    audio = np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0
    return audio, sr


def _build_initial_prompt(req: "TranscribeRequest") -> Optional[str]:
    """番組情報 (name / channelName / description) を whisper の文脈プロンプトとして組み立てる。
    Whisper の initial_prompt は 224 token 程度が上限なので合計 400 文字程度に切り詰める。"""
    parts: list[str] = []
    if req.channelName:
        parts.append(req.channelName.strip())
    if req.name:
        parts.append(req.name.strip())
    if req.description:
        parts.append(req.description.strip())
    if not parts:
        return None
    prompt = " ".join(parts)
    # 半角換算 ~400 文字 (日本語なら ~150-200 token、initial_prompt の 224 token 内に収まりやすい)
    if len(prompt) > 400:
        prompt = prompt[:400]
    return prompt


def _transcribe_one(req: "TranscribeRequest") -> None:
    rec_id = str(req.recordedId)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    TMP_DIR.mkdir(parents=True, exist_ok=True)

    wav_path = TMP_DIR / f"transcribe-{rec_id}.wav"
    out_txt = OUTPUT_DIR / f"{rec_id}.txt"

    _update_status(rec_id, state="extracting", recPath=req.recPath, startedAt=time.time())
    t0 = time.time()
    _extract_wav(req.recPath, str(wav_path))

    audio, sr = _load_audio(str(wav_path))
    duration = len(audio) / sr

    initial_prompt = _build_initial_prompt(req)
    _update_status(
        rec_id,
        state="transcribing",
        durationSec=round(duration, 1),
        promptLen=len(initial_prompt) if initial_prompt else 0,
    )
    t1 = time.time()
    segments, info = MODEL.transcribe(
        audio,
        language=LANGUAGE,
        beam_size=BEAM_SIZE,
        vad_filter=True,
        vad_parameters=dict(min_silence_duration_ms=500),
        condition_on_previous_text=False,
        initial_prompt=initial_prompt,
    )
    lines = [f"[{s.start:7.1f}-{s.end:7.1f}] {s.text}" for s in segments]
    elapsed = time.time() - t1

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
        speedRealtime=round(duration / elapsed, 2) if elapsed > 0 else None,
        finishedAt=time.time(),
    )
    log.info(
        f"transcribed {rec_id}: audio={duration:.1f}s elapsed={elapsed:.1f}s "
        f"speed={duration / elapsed:.2f}x realtime"
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


log.info(f"loading whisper model: {MODEL_NAME} (compute={COMPUTE_TYPE})")
_t0 = time.time()
MODEL = WhisperModel(MODEL_NAME, device="cpu", compute_type=COMPUTE_TYPE)
log.info(f"model ready in {time.time() - _t0:.1f}s")

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
