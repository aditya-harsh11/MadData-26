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

logger = logging.getLogger("snapflow.reasoning")

NEXA_API = "http://127.0.0.1:18181"
VLM_MODEL = "NexaAI/OmniNeural-4B"


class ReasoningBrain:

    def __init__(self):
        self._vlm_loaded = False
        self._llm_loaded = False
        self._serve_proc = None

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
        }

        try:
            resp = httpx.post(
                f"{NEXA_API}/v1/chat/completions",
                json=payload,
                timeout=120,
            )
            data = resp.json()
            analysis_text = data["choices"][0]["message"]["content"]
        except httpx.TimeoutException:
            logger.error("VLM API timeout (120 s)")
            analysis_text = "[VLM timeout]"
        except Exception as e:
            logger.error(f"VLM API error: {e}")
            analysis_text = f"[VLM error: {e}]"

        dt = (time.perf_counter() - t0) * 1000
        logger.info(f"VLM done: {dt:.0f}ms | {analysis_text[:120]}")

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
