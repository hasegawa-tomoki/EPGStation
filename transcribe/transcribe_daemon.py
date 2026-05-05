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
DENOISE_BACKEND = os.environ.get("DENOISE_BACKEND", "none").lower()  # none | deepfilternet
DENOISE_CHUNK_S = int(os.environ.get("DENOISE_CHUNK_S", "30"))  # DF enhance chunk size (sec) for long audio

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


def _extract_wav(rec_path: str, out_wav: str, sample_rate: int = 16000) -> None:
    subprocess.run(
        [
            "ffmpeg", "-y", "-loglevel", "error",
            "-i", rec_path,
            "-vn", "-ar", str(sample_rate), "-ac", "1", "-c:a", "pcm_s16le",
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


def _denoise_and_resample_to_16k(audio_48k: np.ndarray) -> np.ndarray:
    """DeepFilterNet 3 で BGM/ノイズを抑制し、whisper 用に 16kHz にダウンサンプルして返す。

    長尺音声 (45-60 分の TS) を一括で enhance すると intermediate tensor で 12GB 超えて
    OOM Kill される。DENOISE_CHUNK_S 秒ずつ chunk 処理して連結する。
    """
    import torch
    import torchaudio.functional as taF

    chunk_samples = 48000 * DENOISE_CHUNK_S
    enhanced_chunks: list[torch.Tensor] = []
    for start in range(0, len(audio_48k), chunk_samples):
        chunk = audio_48k[start:start + chunk_samples]
        chunk_t = torch.from_numpy(chunk).float().unsqueeze(0)
        enhanced = DF_ENHANCE(DF_MODEL, DF_STATE, chunk_t)  # type: ignore[name-defined]
        if isinstance(enhanced, torch.Tensor):
            t = enhanced
        else:
            t = torch.from_numpy(enhanced)
        if t.dim() == 2:
            t = t.squeeze(0)
        enhanced_chunks.append(t.detach())
    enhanced_full = torch.cat(enhanced_chunks) if len(enhanced_chunks) > 1 else enhanced_chunks[0]
    audio_16k = taF.resample(enhanced_full, 48000, 16000).numpy()
    return audio_16k.astype(np.float32, copy=False)


def _prepare_audio(req: "TranscribeRequest", rec_id: str) -> tuple[np.ndarray, int, float]:
    """rec_path から audio (16kHz mono float32) を取得。DENOISE_BACKEND=deepfilternet の場合は
    48kHz で抽出 → DF enhance → 16kHz にダウンサンプル。"""
    if DENOISE_BACKEND == "deepfilternet" and DF_MODEL is not None:
        wav_path = TMP_DIR / f"transcribe-{rec_id}-48k.wav"
        _extract_wav(req.recPath, str(wav_path), sample_rate=48000)
        audio_48k, sr_in = _load_audio(str(wav_path))
        try:
            wav_path.unlink()
        except FileNotFoundError:
            pass
        t_d0 = time.time()
        audio_16k = _denoise_and_resample_to_16k(audio_48k)
        denoise_sec = time.time() - t_d0
        return audio_16k, 16000, denoise_sec
    wav_path = TMP_DIR / f"transcribe-{rec_id}.wav"
    _extract_wav(req.recPath, str(wav_path), sample_rate=16000)
    audio, sr = _load_audio(str(wav_path))
    try:
        wav_path.unlink()
    except FileNotFoundError:
        pass
    return audio, sr, 0.0


def _transcribe_one(req: "TranscribeRequest") -> None:
    rec_id = str(req.recordedId)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    TMP_DIR.mkdir(parents=True, exist_ok=True)

    out_txt = OUTPUT_DIR / f"{rec_id}.txt"

    _update_status(rec_id, state="extracting", recPath=req.recPath, startedAt=time.time())
    t0 = time.time()
    audio, sr, denoise_sec = _prepare_audio(req, rec_id)
    duration = len(audio) / sr

    initial_prompt = _build_initial_prompt(req)
    _update_status(
        rec_id,
        state="transcribing",
        durationSec=round(duration, 1),
        denoiseSec=round(denoise_sec, 1) if denoise_sec > 0 else None,
        denoiseBackend=DENOISE_BACKEND if DENOISE_BACKEND != "none" else None,
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
        # ハルシネーション (連続ループ) 抑制
        no_repeat_ngram_size=3,           # 同じ 3-gram の繰り返しをデコード側で禁止
        repetition_penalty=1.05,          # 直前トークンへの軽いペナルティ
        compression_ratio_threshold=2.2,  # 圧縮率が高い (= 同じ文字の繰り返し) segment は fallback で再生成
    )
    lines = [f"[{s.start:7.1f}-{s.end:7.1f}] {s.text}" for s in segments]
    elapsed = time.time() - t1

    out_txt.write_text("\n".join(lines) + "\n", encoding="utf-8")

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
        f"transcribed {rec_id}: audio={duration:.1f}s denoise={denoise_sec:.1f}s "
        f"transcribe={elapsed:.1f}s speed={duration / elapsed:.2f}x realtime"
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
log.info(f"whisper model ready in {time.time() - _t0:.1f}s")

DF_MODEL = None
DF_STATE = None
DF_ENHANCE = None
if DENOISE_BACKEND == "deepfilternet":
    log.info("loading DeepFilterNet 3 for denoise/BGM suppression")
    _t1 = time.time()
    from df import enhance as _df_enhance, init_df as _df_init
    DF_MODEL, DF_STATE, _ = _df_init()
    DF_ENHANCE = _df_enhance
    log.info(f"DeepFilterNet ready in {time.time() - _t1:.1f}s (sr={DF_STATE.sr()})")
elif DENOISE_BACKEND != "none":
    log.warning(f"unknown DENOISE_BACKEND={DENOISE_BACKEND}, falling back to none")

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
    return {
        "ok": True,
        "queueSize": job_queue.qsize(),
        "model": MODEL_NAME,
        "denoise": DENOISE_BACKEND,
    }
