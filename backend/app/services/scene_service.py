"""Scene understanding service using Florence-2 or fallback heuristic."""

import logging
import time
from collections import Counter
from datetime import datetime

import numpy as np
from PIL import Image

from app.config import settings
from app.models.schemas import Detection, SceneDescription
from app.services.onnx_runtime_manager import OnnxRuntimeManager

logger = logging.getLogger(__name__)


class SceneService:
    """Describe a camera scene using a vision-language model or detection summary."""

    def __init__(self) -> None:
        self._manager = OnnxRuntimeManager()
        self._florence_available: bool | None = None

    # ------------------------------------------------------------------
    # Florence-2 preprocessing
    # ------------------------------------------------------------------

    def _preprocess_florence(self, frame: np.ndarray) -> np.ndarray:
        """Prepare image for Florence-2: resize 384x384, normalise, CHW, batch.

        Returns float32 tensor (1, 3, 384, 384).
        """
        pil_img = Image.fromarray(frame)
        pil_img = pil_img.resize((384, 384), Image.BILINEAR)
        img = np.array(pil_img, dtype=np.float32) / 255.0
        # ImageNet normalisation
        mean = np.array([0.485, 0.456, 0.406], dtype=np.float32)
        std = np.array([0.229, 0.224, 0.225], dtype=np.float32)
        img = (img - mean) / std
        img = np.transpose(img, (2, 0, 1))  # CHW
        img = np.expand_dims(img, axis=0)     # NCHW
        return img

    def _is_florence_available(self) -> bool:
        """Check once whether the Florence-2 model file exists."""
        if self._florence_available is None:
            try:
                self._manager.get_session(settings.scene_model)
                self._florence_available = True
            except FileNotFoundError:
                self._florence_available = False
                logger.info(
                    "Florence-2 model not found -- using detection-based fallback."
                )
        return self._florence_available

    # ------------------------------------------------------------------
    # Florence-2 inference
    # ------------------------------------------------------------------

    def _describe_with_florence(self, frame: np.ndarray) -> str:
        """Run Florence-2 and decode the output caption."""
        session = self._manager.get_session(settings.scene_model)
        input_name = session.get_inputs()[0].name
        tensor = self._preprocess_florence(frame)

        t0 = time.perf_counter()
        outputs = session.run(None, {input_name: tensor})
        elapsed = (time.perf_counter() - t0) * 1000
        logger.debug("Florence-2 inference: %.1f ms", elapsed)

        # Florence-2 ONNX output is typically a float tensor that needs
        # greedy argmax decoding.  For a caption head the shape is
        # (1, seq_len, vocab_size).
        logits = outputs[0]
        if logits.ndim == 3:
            token_ids = np.argmax(logits, axis=-1)[0]  # (seq_len,)
            # Basic detokenisation: treat IDs as ASCII codepoints (best-effort).
            caption_chars: list[str] = []
            for tid in token_ids:
                tid = int(tid)
                if tid == 0:
                    break  # end-of-sequence / pad
                if 32 <= tid < 127:
                    caption_chars.append(chr(tid))
                elif tid >= 256:
                    caption_chars.append(" ")
            return "".join(caption_chars).strip() or "Scene captured."
        # Fallback for unexpected output layout
        return "Scene captured."

    # ------------------------------------------------------------------
    # Detection-based fallback
    # ------------------------------------------------------------------

    @staticmethod
    def _aggregate_detections(
        detections: list[Detection],
    ) -> tuple[list[str], dict[str, int]]:
        """Aggregate detection objects into a unique list and count dict."""
        counter: Counter[str] = Counter()
        for det in detections:
            counter[det.class_name] += 1
        objects = sorted(counter.keys())
        counts = dict(counter.most_common())
        return objects, counts

    @staticmethod
    def _compose_caption(counts: dict[str, int]) -> str:
        """Build a human-readable caption string from object counts."""
        if not counts:
            return "The scene appears empty with no detectable objects."

        parts: list[str] = []
        for name, count in counts.items():
            if count == 1:
                parts.append(f"1 {name}")
            else:
                parts.append(f"{count} {name}s")

        if len(parts) == 1:
            listing = parts[0]
        elif len(parts) == 2:
            listing = f"{parts[0]} and {parts[1]}"
        else:
            listing = ", ".join(parts[:-1]) + f", and {parts[-1]}"

        return f"Scene contains {listing}."

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def describe_scene(
        self,
        frame: np.ndarray,
        detections: list[Detection] | None = None,
    ) -> SceneDescription:
        """Produce a structured scene description.

        Strategy:
        1. If Florence-2 ONNX model is available, use it for a caption.
        2. Otherwise, compose a caption from the supplied detections list.
        """
        objects: list[str] = []
        counts: dict[str, int] = {}

        if detections:
            objects, counts = self._aggregate_detections(detections)

        # Try Florence-2
        if self._is_florence_available():
            caption = self._describe_with_florence(frame)
        else:
            caption = self._compose_caption(counts)

        return SceneDescription(
            caption=caption,
            objects=objects,
            object_counts=counts,
            timestamp=datetime.utcnow().isoformat(),
        )
