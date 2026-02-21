"""
Reasoning Brain — Heavy multimodal inference tier.

Uses the Nexa SDK to run OmniNeural-4B (VLM) on the Qualcomm NPU
for rich scene understanding, and Llama-3.2-3B for text generation.

This tier is only invoked when the Watchdog detects a trigger condition.
"""

import time
import base64
import logging
from pathlib import Path

logger = logging.getLogger("snapflow.reasoning")


class ReasoningBrain:
    """Tier 2 — Nexa SDK multimodal reasoning engine."""

    def __init__(self):
        self.vlm = None
        self.llm = None
        self._vlm_loaded = False
        self._llm_loaded = False

    def load_vlm(self, model_name: str = "NexaAI/OmniNeural-4B"):
        """Load the Vision-Language Model via Nexa SDK targeting NPU."""
        try:
            from nexa.gguf import NexaVLMInference

            self.vlm = NexaVLMInference(
                model_path=model_name,
                local_path=None,
                projector_local_path=None,
            )
            self._vlm_loaded = True
            logger.info(f"VLM loaded: {model_name}")
        except ImportError:
            logger.warning(
                "Nexa SDK not installed. Install with: pip install nexaai"
            )
            self._vlm_loaded = False
        except Exception as e:
            logger.error(f"Failed to load VLM: {e}")
            self._vlm_loaded = False

    def load_llm(self, model_name: str = "NexaAI/Llama-3.2-3B"):
        """Load the text generation LLM via Nexa SDK."""
        try:
            from nexa.gguf import NexaTextInference

            self.llm = NexaTextInference(
                model_path=model_name,
                local_path=None,
            )
            self._llm_loaded = True
            logger.info(f"LLM loaded: {model_name}")
        except ImportError:
            logger.warning(
                "Nexa SDK not installed. Install with: pip install nexaai"
            )
            self._llm_loaded = False
        except Exception as e:
            logger.error(f"Failed to load LLM: {e}")
            self._llm_loaded = False

    @property
    def vlm_loaded(self) -> bool:
        return self._vlm_loaded

    @property
    def llm_loaded(self) -> bool:
        return self._llm_loaded

    def analyze_frame(
        self,
        base64_image: str,
        prompt: str = "Describe what you see. If there is any safety concern, explain it.",
        trigger_label: str = "",
    ) -> dict:
        """
        Run multimodal reasoning on a single frame.

        Args:
            base64_image: Base64-encoded JPEG image (may include data URI prefix)
            prompt: The reasoning prompt to send to the VLM
            trigger_label: What the Watchdog detected (for context)

        Returns:
            dict with 'analysis' text and metadata
        """
        t0 = time.perf_counter()

        if not self._vlm_loaded:
            return {
                "analysis": "[VLM not loaded — install Nexa SDK and download OmniNeural-4B]",
                "trigger_label": trigger_label,
                "latency_ms": 0,
            }

        # Strip data URI prefix
        if "," in base64_image:
            base64_image = base64_image.split(",", 1)[1]

        # Save temp image for VLM input
        import tempfile
        img_bytes = base64.b64decode(base64_image)
        tmp = tempfile.NamedTemporaryFile(suffix=".jpg", delete=False)
        tmp.write(img_bytes)
        tmp.flush()
        tmp_path = tmp.name
        tmp.close()

        try:
            # Build context-aware prompt
            full_prompt = prompt
            if trigger_label:
                full_prompt = (
                    f"The object detection system detected: '{trigger_label}'. "
                    f"{prompt}"
                )

            result = self.vlm._chat(full_prompt, tmp_path)
            analysis_text = result if isinstance(result, str) else str(result)
        except Exception as e:
            logger.error(f"VLM inference error: {e}")
            analysis_text = f"[VLM error: {e}]"
        finally:
            Path(tmp_path).unlink(missing_ok=True)

        dt = (time.perf_counter() - t0) * 1000
        logger.info(f"VLM reasoning: {dt:.0f}ms")

        return {
            "analysis": analysis_text,
            "trigger_label": trigger_label,
            "latency_ms": round(dt, 1),
        }

    def generate_text(self, prompt: str, max_tokens: int = 256) -> dict:
        """
        Run text generation with Llama-3.2-3B.

        Args:
            prompt: The input prompt
            max_tokens: Maximum tokens to generate

        Returns:
            dict with 'text' and metadata
        """
        t0 = time.perf_counter()

        if not self._llm_loaded:
            return {
                "text": "[LLM not loaded — install Nexa SDK and download Llama-3.2-3B]",
                "latency_ms": 0,
            }

        try:
            result = self.llm.create_completion(prompt, max_tokens=max_tokens)
            if isinstance(result, dict) and "choices" in result:
                text = result["choices"][0]["text"]
            else:
                text = str(result)
        except Exception as e:
            logger.error(f"LLM inference error: {e}")
            text = f"[LLM error: {e}]"

        dt = (time.perf_counter() - t0) * 1000
        logger.info(f"LLM generation: {dt:.0f}ms")

        return {
            "text": text,
            "latency_ms": round(dt, 1),
        }
