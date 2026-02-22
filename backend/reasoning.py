"""
Reasoning Brain — Multimodal inference via Nexa serve REST API.

Uses the OpenAI-compatible API at http://127.0.0.1:18181 served by `nexa serve`.
OmniNeural-4B (VLM) runs on the Qualcomm NPU for scene understanding.
Images are passed as base64 data URIs — no file I/O, no ffmpeg.
"""

import os
import time
import logging
import subprocess
import httpx

logger = logging.getLogger("arcflow.reasoning")

NEXA_API = "http://127.0.0.1:18181"
VLM_MODEL = "NexaAI/OmniNeural-4B"


def _is_repetitive_garbage(text: str, min_len: int = 20, repeat_threshold: float = 0.5) -> bool:
    """Detect output that is mostly one short token repeated (e.g. 'ThereThereThere...')."""
    if not text or len(text) < min_len:
        return False
    text = text.strip()
    # Check if a short substring (2–10 chars) repeats over most of the string
    for n in range(2, min(11, len(text) // 2 + 1)):
        segment = text[:n]
        if not segment.strip():
            continue
        count = text.count(segment)
        if count * n >= repeat_threshold * len(text):
            return True
    return False


class ReasoningBrain:

    def __init__(self):
        self._vlm_loaded = False
        self._llm_loaded = False
        self._serve_proc = None
        self._audio_vlm = None

    # ── Start / check nexa serve ──────────────────────────────────

    def load_vlm(self, model_name: str = "NexaAI/OmniNeural-4B"):
        global VLM_MODEL
        VLM_MODEL = model_name

        if self._check_serve():
            self._vlm_loaded = True
            logger.info(f"nexa serve already running — VLM ready ({model_name})")
            return

        logger.info("Starting nexa serve …")
        try:
            self._serve_proc = subprocess.Popen(
                ["nexa", "serve"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
        except FileNotFoundError:
            logger.error("'nexa' CLI not found on PATH")
            return

        for i in range(60):
            time.sleep(1)
            if self._check_serve():
                self._vlm_loaded = True
                logger.info(f"nexa serve ready after {i+1}s — VLM ready ({model_name})")
                return

        logger.error("nexa serve did not become healthy within 60 s")

    def load_llm(self, model_name: str = "NexaAI/Llama-3.2-3B"):
        self._llm_loaded = self._vlm_loaded
        if self._llm_loaded:
            logger.info(f"LLM available via nexa serve ({model_name})")

    @staticmethod
    def _check_serve() -> bool:
        try:
            r = httpx.get(f"{NEXA_API}/v1/models", timeout=2)
            return r.status_code == 200
        except Exception:
            return False

    @property
    def vlm_loaded(self) -> bool:
        return self._vlm_loaded

    @property
    def llm_loaded(self) -> bool:
        return self._llm_loaded

    # ── VLM inference via REST API ────────────────────────────────

    def analyze_frame(
        self,
        base64_image: str,
        prompt: str = "Describe what you see.",
        client_id: str = "",
    ) -> dict:
        t0 = time.perf_counter()

        if not self._vlm_loaded:
            return {"analysis": "[VLM not loaded]", "latency_ms": 0}
        if not base64_image:
            return {"analysis": "[No frame received]", "latency_ms": 0}

        if not base64_image.startswith("data:"):
            image_url = f"data:image/jpeg;base64,{base64_image}"
        else:
            image_url = base64_image

        payload = {
            "model": VLM_MODEL,
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {"type": "image_url", "image_url": {"url": image_url}},
                    ],
                }
            ],
            "max_tokens": 256,
            "stream": False,
            "repetition_penalty": 1.15,
            "temperature": 0.3,
        }

        try:
            resp = httpx.post(
                f"{NEXA_API}/v1/chat/completions",
                json=payload,
                timeout=120,
            )
            data = resp.json()
            analysis_text = (data.get("choices") or [{}])[0].get("message", {}).get("content") or ""
            if _is_repetitive_garbage(analysis_text):
                logger.warning("VLM returned repetitive output, using fallback")
                analysis_text = "[Vision glitch: response was repetitive. Try again.]"
        except httpx.TimeoutException:
            logger.error("VLM API timeout (120 s)")
            analysis_text = "[VLM timeout]"
        except Exception as e:
            logger.error(f"VLM API error: {e}")
            analysis_text = f"[VLM error: {e}]"

        dt = (time.perf_counter() - t0) * 1000
        logger.info(f"VLM done: {dt:.0f}ms | {analysis_text[:120]}")

        return {"analysis": analysis_text, "latency_ms": round(dt, 1)}

    # ── Audio LLM inference via nexaai Python SDK ────────────────

    def _ensure_audio_vlm(self):
        """Lazy-load a dedicated VLM instance for audio via the Python SDK."""
        if self._audio_vlm is not None:
            return
        try:
            from nexaai import VLM, ModelConfig
            self._audio_vlm = VLM.from_(model=VLM_MODEL, config=ModelConfig())
            logger.info("Audio VLM (Python SDK) loaded successfully")
        except Exception as e:
            logger.error(f"Failed to load Audio VLM via Python SDK: {e}")
            self._audio_vlm = None

    def analyze_audio(
        self,
        base64_pcm: str,
        prompt: str = "Describe what you hear.",
        client_id: str = "",
    ) -> dict:
        """Send audio to OmniNeural-4B via nexaai Python SDK."""
        import wave
        import tempfile
        import base64 as b64mod

        t0 = time.perf_counter()

        if not self._vlm_loaded:
            return {"analysis": "[Model not loaded]", "latency_ms": 0}
        if not base64_pcm:
            return {"analysis": "[No audio received]", "latency_ms": 0}

        # Convert float32 PCM → WAV temp file
        tmp_path = None
        try:
            import numpy as np
            raw = b64mod.b64decode(base64_pcm)
            pcm_f32 = np.frombuffer(raw, dtype=np.float32)
            logger.info(f"Audio PCM: {len(pcm_f32)} samples, "
                        f"rms={np.sqrt(np.mean(pcm_f32**2)):.4f}, "
                        f"max={np.max(np.abs(pcm_f32)):.4f}")
            pcm_f32 = np.clip(pcm_f32, -1.0, 1.0)
            pcm_i16 = (pcm_f32 * 32767).astype(np.int16)

            cache_dir = os.path.join(os.path.dirname(__file__), "_vlm_cache")
            os.makedirs(cache_dir, exist_ok=True)
            fd, tmp_path = tempfile.mkstemp(suffix=".wav", dir=cache_dir)
            os.close(fd)

            with wave.open(tmp_path, "wb") as wf:
                wf.setnchannels(1)
                wf.setsampwidth(2)
                wf.setframerate(16000)
                wf.writeframes(pcm_i16.tobytes())

            logger.info(f"Audio WAV written: {tmp_path} ({os.path.getsize(tmp_path)} bytes)")
        except Exception as e:
            logger.error(f"Audio WAV conversion failed: {e}")
            if tmp_path:
                try: os.unlink(tmp_path)
                except: pass
            return {"analysis": f"[Audio encoding error: {e}]", "latency_ms": 0}

        try:
            from nexaai import GenerationConfig

            self._ensure_audio_vlm()
            if self._audio_vlm is None:
                return {"analysis": "[Audio VLM failed to load]", "latency_ms": 0}

            # Skip apply_chat_template (it's a no-op on C interface).
            # Pass the prompt text directly — generate() handles the chat
            # template internally. audio_paths tells the C library which
            # files to encode as audio embeddings.
            gen_config = GenerationConfig(
                max_tokens=256,
                audio_paths=[tmp_path],
            )

            logger.info(f"Audio generate: prompt={prompt!r}, audio={tmp_path}")
            self._audio_vlm.reset()
            result = self._audio_vlm.generate(prompt, config=gen_config)
            analysis_text = result.text if hasattr(result, "text") else str(result)

            if _is_repetitive_garbage(analysis_text):
                logger.warning("Audio LLM returned repetitive output")
                analysis_text = "[Audio glitch: response was repetitive. Try again.]"

        except Exception as e:
            logger.error(f"Audio LLM SDK error: {e}")
            analysis_text = f"[Audio LLM error: {e}]"
        finally:
            try: os.unlink(tmp_path)
            except: pass

        dt = (time.perf_counter() - t0) * 1000
        logger.info(f"Audio LLM done: {dt:.0f}ms | {analysis_text[:120]}")

        return {"analysis": analysis_text, "latency_ms": round(dt, 1)}

    def clear_client(self, client_id: str):
        pass

    # ── LLM text generation via REST API ──────────────────────────

    def generate_text(self, prompt: str, max_tokens: int = 256) -> dict:
        t0 = time.perf_counter()

        if not self._llm_loaded:
            return {"text": "[LLM not loaded]", "latency_ms": 0}

        payload = {
            "model": VLM_MODEL,
            "messages": [{"role": "user", "content": prompt}],
            "max_tokens": max_tokens,
            "stream": False,
        }

        try:
            resp = httpx.post(
                f"{NEXA_API}/v1/chat/completions",
                json=payload,
                timeout=120,
            )
            data = resp.json()
            text = data["choices"][0]["message"]["content"]
        except Exception as e:
            logger.error(f"LLM API error: {e}")
            text = f"[LLM error: {e}]"

        dt = (time.perf_counter() - t0) * 1000
        logger.info(f"LLM done: {dt:.0f}ms")
        return {"text": text, "latency_ms": round(dt, 1)}

    def shutdown(self):
        if self._serve_proc:
            logger.info("Stopping nexa serve …")
            self._serve_proc.terminate()
            self._serve_proc = None
