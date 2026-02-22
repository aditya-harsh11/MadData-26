"""
Reasoning Brain — Heavy multimodal inference tier.

Uses the Nexa SDK (nexaai) to run OmniNeural-4B (VLM) on the Qualcomm NPU
for rich scene understanding, and Llama-3.2-3B for text generation.
"""

import io
import os
import time
import base64
import logging
import threading
from pathlib import Path

from PIL import Image as PILImage

logger = logging.getLogger("snapflow.reasoning")

DEBUG_DIR = Path(__file__).parent / "debug_frames"

IMAGE_CACHE = Path("C:/snapflow_cache")
IMAGE_CACHE.mkdir(exist_ok=True)


class ReasoningBrain:
    """Tier 2 — Nexa SDK multimodal reasoning engine on Qualcomm NPU."""

    def __init__(self):
        self._vlm_model_name: str = "NexaAI/OmniNeural-4B"
        self._vlm_loaded = False
        self._vlm_lock = threading.Lock()
        self.llm = None
        self._llm_loaded = False

    # ── Model loading ─────────────────────────────────────────────

    def load_vlm(self, model_name: str = "NexaAI/OmniNeural-4B"):
        try:
            import nexaai
            self._vlm_model_name = model_name
            logger.info(f"Loading VLM (warmup): {model_name}")
            vlm = nexaai.VLM.from_(model_name, config=nexaai.ModelConfig())
            del vlm
            self._vlm_loaded = True
            logger.info(f"VLM ready: {model_name}")
        except ImportError:
            logger.warning("Nexa SDK not installed.")
        except Exception as e:
            logger.error(f"Failed to load VLM: {e}")

    def load_llm(self, model_name: str = "NexaAI/Llama-3.2-3B"):
        try:
            import nexaai
            logger.info(f"Loading LLM: {model_name}")
            self.llm = nexaai.LLM.from_(model_name)
            self._llm_loaded = True
            logger.info(f"LLM loaded: {model_name}")
        except ImportError:
            logger.warning("Nexa SDK not installed.")
        except Exception as e:
            logger.error(f"Failed to load LLM: {e}")

    @property
    def vlm_loaded(self) -> bool:
        return self._vlm_loaded

    @property
    def llm_loaded(self) -> bool:
        return self._llm_loaded

    # ── Image prep ────────────────────────────────────────────────

    @staticmethod
    def _save_frame(base64_image: str) -> str:
        if "," in base64_image:
            base64_image = base64_image.split(",", 1)[1]

        img_bytes = base64.b64decode(base64_image)
        pil = PILImage.open(io.BytesIO(img_bytes)).convert("RGB")

        MAX_W = 640
        w, h = pil.size
        if w > MAX_W:
            pil = pil.resize((MAX_W, round(h * MAX_W / w)), PILImage.LANCZOS)

        out = str(IMAGE_CACHE / "frame.jpg")
        pil.save(out, format="JPEG", quality=95)
        logger.info(f"Frame: {w}x{h} → {pil.size[0]}x{pil.size[1]}")
        return out

    # ── VLM inference — fresh instance every call ─────────────────

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

        image_path = self._save_frame(base64_image)

        with self._vlm_lock:
            try:
                import nexaai

                vlm = nexaai.VLM.from_(
                    self._vlm_model_name, config=nexaai.ModelConfig()
                )

                messages = [
                    nexaai.VlmChatMessage(
                        role="user",
                        contents=[
                            nexaai.VlmContent(type="text", text=prompt),
                            nexaai.VlmContent(type="image", text=image_path),
                        ],
                    )
                ]
                formatted = vlm.apply_chat_template(messages)

                gen_config = nexaai.GenerationConfig(
                    max_tokens=256,
                    image_paths=[image_path],
                )

                logger.info(f"VLM image: {image_path}")
                logger.info(f"VLM prompt: {prompt[:200]}")

                result = vlm.generate(formatted, config=gen_config)
                analysis_text = result.full_text

                del vlm

            except Exception as e:
                logger.error(f"VLM inference error: {e}", exc_info=True)
                analysis_text = f"[VLM error: {e}]"

        dt = (time.perf_counter() - t0) * 1000
        logger.info(f"VLM done: {dt:.0f}ms | {analysis_text[:120]}")

        return {"analysis": analysis_text, "latency_ms": round(dt, 1)}

    def clear_client(self, client_id: str):
        pass

    # ── LLM text generation ───────────────────────────────────────

    def generate_text(self, prompt: str, max_tokens: int = 256) -> dict:
        t0 = time.perf_counter()

        if not self._llm_loaded:
            return {"text": "[LLM not loaded]", "latency_ms": 0}

        try:
            import nexaai
            result = self.llm.generate(
                prompt, config=nexaai.GenerationConfig(max_tokens=max_tokens)
            )
            text = result.full_text
        except Exception as e:
            logger.error(f"LLM inference error: {e}")
            text = f"[LLM error: {e}]"

        dt = (time.perf_counter() - t0) * 1000
        logger.info(f"LLM done: {dt:.0f}ms")
        return {"text": text, "latency_ms": round(dt, 1)}
