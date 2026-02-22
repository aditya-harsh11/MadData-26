"""LLM service using Phi-3.5-mini via onnxruntime-genai for on-device text generation."""

import json
import logging
import re
from pathlib import Path

from app.config import settings

logger = logging.getLogger(__name__)

# Guard import -- onnxruntime_genai may not be installed everywhere.
try:
    import onnxruntime_genai as og

    _OG_AVAILABLE = True
except ImportError:
    og = None  # type: ignore[assignment]
    _OG_AVAILABLE = False
    logger.warning("onnxruntime_genai is not installed -- LLM service will be unavailable.")


WORKFLOW_SYSTEM_PROMPT = """\
You are a workflow generator for a smart camera system called CamerAI.
Convert the user's natural-language request into a JSON workflow.

Output ONLY valid JSON (no markdown fences, no explanation) with this schema:
{
  "name": "<workflow name>",
  "nodes": [
    {
      "id": "<unique string>",
      "type": "camera" | "trigger" | "condition" | "action",
      "data": { ... },
      "position": {"x": <number>, "y": <number>}
    }
  ],
  "edges": [
    {"source": "<node id>", "target": "<node id>"}
  ]
}

Trigger types: object_detected, face_recognized, scene_change, motion_detected
Condition types: object_class, confidence_threshold, time_range, zone
Action types: alert, sound, log, webhook, tts_announce

Always start the pipeline with a camera node, then a trigger, optional conditions, and one or more actions.
Assign sensible default positions for a top-to-bottom layout (increment y by 150 for each layer).
"""

SCENE_SYSTEM_PROMPT = """\
You are a scene description assistant for a smart camera system.
Given a list of detected objects with their classes and confidences, write
a concise, natural-language description of the scene (2-3 sentences).
"""


class LLMService:
    """Phi-3.5-mini text generation via onnxruntime-genai."""

    def __init__(self) -> None:
        self._model: "og.Model | None" = None
        self._tokenizer: "og.Tokenizer | None" = None
        self._available: bool = False

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    def initialize(self) -> None:
        """Load the Phi-3.5 model and tokenizer from disk."""
        if not _OG_AVAILABLE:
            logger.error("onnxruntime_genai not installed -- LLM unavailable.")
            return

        model_path = Path(settings.phi3_model_path)
        if not model_path.exists():
            logger.warning("Phi-3 model directory not found at %s", model_path)
            return

        try:
            logger.info("Loading Phi-3.5-mini from %s ...", model_path)
            self._model = og.Model(str(model_path))
            self._tokenizer = og.Tokenizer(self._model)
            self._available = True
            logger.info("Phi-3.5-mini loaded successfully.")
        except Exception:
            logger.exception("Failed to load Phi-3.5-mini model.")
            self._available = False

    @property
    def available(self) -> bool:
        return self._available

    # ------------------------------------------------------------------
    # Generation
    # ------------------------------------------------------------------

    def generate(
        self,
        prompt: str,
        max_tokens: int = 512,
        temperature: float = 0.7,
    ) -> str:
        """Generate text from a prompt using Phi-3.5-mini.

        Parameters
        ----------
        prompt : full prompt string (system + user combined)
        max_tokens : maximum new tokens to generate
        temperature : sampling temperature (0 = greedy)

        Returns
        -------
        str  generated text
        """
        if not self._available or self._model is None or self._tokenizer is None:
            return json.dumps({"error": "LLM model not available"})

        try:
            input_tokens = self._tokenizer.encode(prompt)

            params = og.GeneratorParams(self._model)
            params.set_search_options(
                max_length=max_tokens + len(input_tokens),
                temperature=max(temperature, 0.01),
                top_p=0.9,
                top_k=50,
                do_sample=temperature > 0,
            )
            params.input_ids = input_tokens

            generator = og.Generator(self._model, params)

            output_tokens: list[int] = []
            while not generator.is_done():
                generator.compute_logits()
                generator.generate_next_token()
                token = generator.get_next_tokens()[0]
                output_tokens.append(token)

                if len(output_tokens) >= max_tokens:
                    break

            decoded = self._tokenizer.decode(output_tokens)
            return decoded.strip()

        except Exception:
            logger.exception("LLM generation failed.")
            return json.dumps({"error": "LLM generation failed"})

    # ------------------------------------------------------------------
    # Workflow generation
    # ------------------------------------------------------------------

    def generate_workflow(self, natural_language: str) -> dict:
        """Convert a natural-language request into a workflow JSON dict.

        Uses the Phi-3.5 model with a structured system prompt.
        Falls back to a hand-crafted template if the model is unavailable.
        """
        if not self._available:
            return self._fallback_workflow(natural_language)

        prompt = (
            f"<|system|>\n{WORKFLOW_SYSTEM_PROMPT}<|end|>\n"
            f"<|user|>\n{natural_language}<|end|>\n"
            f"<|assistant|>\n"
        )

        raw = self.generate(prompt, max_tokens=1024, temperature=0.3)

        # Extract JSON from the response
        parsed = self._extract_json(raw)
        if parsed is not None:
            return parsed

        logger.warning("Could not parse JSON from LLM output; using fallback.")
        return self._fallback_workflow(natural_language)

    def generate_scene_description(self, detections: list[dict]) -> str:
        """Use Phi-3.5 to describe a scene from detection data."""
        if not self._available:
            return self._fallback_scene_description(detections)

        det_text = "\n".join(
            f"- {d.get('class_name', 'unknown')} (confidence: {d.get('confidence', 0):.2f})"
            for d in detections
        )

        prompt = (
            f"<|system|>\n{SCENE_SYSTEM_PROMPT}<|end|>\n"
            f"<|user|>\nDetected objects:\n{det_text}<|end|>\n"
            f"<|assistant|>\n"
        )

        return self.generate(prompt, max_tokens=256, temperature=0.5)

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _extract_json(text: str) -> dict | None:
        """Try to extract the first valid JSON object from *text*."""
        # Try the whole string first
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            pass

        # Try to find JSON between braces
        match = re.search(r"\{[\s\S]*\}", text)
        if match:
            try:
                return json.loads(match.group())
            except json.JSONDecodeError:
                pass

        return None

    @staticmethod
    def _fallback_workflow(description: str) -> dict:
        """Build a simple template workflow when the LLM is unavailable."""
        description_lower = description.lower()

        # Determine trigger type
        if "face" in description_lower or "person" in description_lower:
            trigger_type = "face_recognized"
        elif "motion" in description_lower or "move" in description_lower:
            trigger_type = "motion_detected"
        elif "scene" in description_lower or "change" in description_lower:
            trigger_type = "scene_change"
        else:
            trigger_type = "object_detected"

        # Determine action type
        if "alert" in description_lower or "notify" in description_lower:
            action_type = "alert"
        elif "sound" in description_lower or "alarm" in description_lower:
            action_type = "sound"
        elif "announce" in description_lower or "speak" in description_lower:
            action_type = "tts_announce"
        elif "webhook" in description_lower or "http" in description_lower:
            action_type = "webhook"
        else:
            action_type = "log"

        return {
            "name": f"Auto-generated: {description[:60]}",
            "nodes": [
                {
                    "id": "cam_1",
                    "type": "camera",
                    "data": {"camera_id": 0, "resolution": "640x480"},
                    "position": {"x": 250, "y": 0},
                },
                {
                    "id": "trigger_1",
                    "type": "trigger",
                    "data": {"trigger_type": trigger_type},
                    "position": {"x": 250, "y": 150},
                },
                {
                    "id": "action_1",
                    "type": "action",
                    "data": {
                        "action_type": action_type,
                        "message": description,
                    },
                    "position": {"x": 250, "y": 300},
                },
            ],
            "edges": [
                {"source": "cam_1", "target": "trigger_1"},
                {"source": "trigger_1", "target": "action_1"},
            ],
        }

    @staticmethod
    def _fallback_scene_description(detections: list[dict]) -> str:
        """Build a scene description without the LLM."""
        if not detections:
            return "The scene appears empty with no detected objects."

        from collections import Counter

        counts = Counter(d.get("class_name", "object") for d in detections)
        parts = [
            f"{count} {name}" + ("s" if count > 1 else "")
            for name, count in counts.most_common()
        ]
        listing = ", ".join(parts[:-1]) + (" and " + parts[-1] if len(parts) > 1 else parts[0] if parts else "")
        return f"The scene contains {listing}."
