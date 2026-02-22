"""
Watchdog — Lightweight ONNX object detection tier.

Runs on Qualcomm NPU via onnxruntime-qnn with QNNExecutionProvider.
Supports QNN context binary caching for instant subsequent loads.

Supports two model formats:
  1. Standard ONNX (local ultralytics export) — JIT-compiled for QNN HTP
     Input:  [1, 3, 640, 640]  NCHW float32
     Output: [1, 84, 8400]     raw xywh + class scores

  2. Qualcomm AI Hub precompiled QNN context binary ONNX
     Input:  [1, 640, 640, 3]  NHWC float32
     Output: boxes [1,8400,4], scores [1,8400], class_idx [1,8400]
"""

import io
import time
import logging
from pathlib import Path

import numpy as np
from PIL import Image

logger = logging.getLogger("snapflow.watchdog")

# COCO class names (80 classes for YOLO)
COCO_CLASSES = [
    "person", "bicycle", "car", "motorcycle", "airplane", "bus", "train",
    "truck", "boat", "traffic light", "fire hydrant", "stop sign",
    "parking meter", "bench", "bird", "cat", "dog", "horse", "sheep",
    "cow", "elephant", "bear", "zebra", "giraffe", "backpack", "umbrella",
    "handbag", "tie", "suitcase", "frisbee", "skis", "snowboard",
    "sports ball", "kite", "baseball bat", "baseball glove", "skateboard",
    "surfboard", "tennis racket", "bottle", "wine glass", "cup", "fork",
    "knife", "spoon", "bowl", "banana", "apple", "sandwich", "orange",
    "broccoli", "carrot", "hot dog", "pizza", "donut", "cake", "chair",
    "couch", "potted plant", "bed", "dining table", "toilet", "tv",
    "laptop", "mouse", "remote", "keyboard", "cell phone", "microwave",
    "oven", "toaster", "sink", "refrigerator", "book", "clock", "vase",
    "scissors", "teddy bear", "hair drier", "toothbrush",
]

INPUT_SIZE = 640


class Watchdog:
    """Lightweight ONNX object-detection tier (Tier 1)."""

    def __init__(self, model_path: str | None = None, confidence: float = 0.45, use_cpu: bool = False):
        self.confidence = confidence
        self.session = None
        self.model_path = model_path
        self._loaded = False
        self._qnn_format = False  # True if Qualcomm AI Hub precompiled model
        self._use_cpu = use_cpu

        if model_path and Path(model_path).exists():
            self._load_model(model_path)

    def _load_model(self, path: str):
        try:
            import onnxruntime as ort

            providers = ort.get_available_providers()
            logger.info(f"Available ONNX providers: {providers}")

            # Build provider list with QNN-specific options
            provider_options = []
            preferred = []

            if self._use_cpu:
                logger.info("CPU-only mode requested — skipping QNN/DML providers")
                preferred.append("CPUExecutionProvider")
                provider_options.append({})

            elif "QNNExecutionProvider" in providers:
                preferred.append("QNNExecutionProvider")

                # QNN context binary cache path — avoids re-compilation on restart
                cache_dir = Path(path).parent / "qnn_cache"
                cache_dir.mkdir(exist_ok=True)
                ctx_binary = str(cache_dir / (Path(path).stem + "_ctx.onnx"))

                qnn_opts = {
                    "backend_path": "QnnHtp.dll",           # Target Qualcomm HTP (NPU)
                    "htp_performance_mode": "burst",         # Max NPU performance
                    "htp_graph_finalization_optimization_mode": "3",  # Highest optimization
                    "enable_htp_fp16_precision": "1",        # FP16 for speed
                    "ep_context_enable": "1",                # Enable context caching
                    "ep_context_file_path": ctx_binary,      # Cache path
                }

                # If a cached context binary exists, load it directly
                if Path(ctx_binary).exists():
                    logger.info(f"Loading cached QNN context binary: {ctx_binary}")
                    path = ctx_binary  # Load from cache instead of re-compiling

                provider_options.append(qnn_opts)
            else:
                logger.warning("QNNExecutionProvider not available — falling back")

            if not self._use_cpu and "DmlExecutionProvider" in providers:
                preferred.append("DmlExecutionProvider")
                provider_options.append({})

            if not self._use_cpu:
                preferred.append("CPUExecutionProvider")
                provider_options.append({})

            sess_opts = ort.SessionOptions()
            sess_opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL

            self.session = ort.InferenceSession(
                path,
                sess_options=sess_opts,
                providers=preferred,
                provider_options=provider_options,
            )
            self._loaded = True

            active_providers = self.session.get_providers()

            # Detect model format from output names
            output_names = [o.name for o in self.session.get_outputs()]
            input_shape = self.session.get_inputs()[0].shape

            if "boxes" in output_names or "scores" in output_names:
                self._qnn_format = True
                logger.info("QNN precompiled model detected (NHWC input, postprocessed output)")
            else:
                self._qnn_format = False
                logger.info("Standard ONNX model detected (NCHW input, raw output)")

            logger.info(f"Watchdog model loaded: {path}")
            logger.info(f"  Active providers: {active_providers}")
            logger.info(f"  Input: {self.session.get_inputs()[0].name} {input_shape}")
            logger.info(f"  Outputs: {output_names}")

            if "QNNExecutionProvider" in active_providers:
                logger.info("  NPU acceleration: ACTIVE (Qualcomm HTP)")
            else:
                logger.warning("  NPU acceleration: INACTIVE (running on CPU)")
        except Exception as e:
            logger.error(f"Failed to load watchdog model: {e}")
            self._loaded = False

    @property
    def loaded(self) -> bool:
        return self._loaded

    def _preprocess_nchw(self, img_rgb: np.ndarray) -> np.ndarray:
        """Standard ONNX: resize, normalize, HWC→CHW → [1, 3, H, W]."""
        pil_img = Image.fromarray(img_rgb).resize((INPUT_SIZE, INPUT_SIZE), Image.BILINEAR)
        img = np.array(pil_img, dtype=np.float32) / 255.0
        img = np.transpose(img, (2, 0, 1))  # HWC → CHW
        img = np.expand_dims(img, 0)          # → NCHW
        return img

    def _preprocess_nhwc(self, img_rgb: np.ndarray) -> np.ndarray:
        """QNN precompiled: resize, normalize, keep HWC → [1, H, W, 3]."""
        pil_img = Image.fromarray(img_rgb).resize((INPUT_SIZE, INPUT_SIZE), Image.BILINEAR)
        img = np.array(pil_img, dtype=np.float32) / 255.0
        img = np.expand_dims(img, 0)  # → NHWC [1, 640, 640, 3]
        return img

    def _postprocess_raw(self, output: np.ndarray, conf_threshold: float) -> list[dict]:
        """
        Parse standard YOLO [1, 84, 8400] output.
        Each column: [cx, cy, w, h, class0_score, ...class79_score].
        """
        predictions = output[0]  # [84, 8400]

        if predictions.shape[0] == 84:
            predictions = predictions.T  # → [8400, 84]

        boxes = predictions[:, :4]
        scores = predictions[:, 4:]

        max_scores = np.max(scores, axis=1)
        mask = max_scores > conf_threshold

        boxes = boxes[mask]
        scores = scores[mask]
        max_scores = max_scores[mask]
        class_ids = np.argmax(scores, axis=1)

        detections = []
        for i in range(len(boxes)):
            cx, cy, w, h = boxes[i]
            x1 = (cx - w / 2) / INPUT_SIZE
            y1 = (cy - h / 2) / INPUT_SIZE
            x2 = (cx + w / 2) / INPUT_SIZE
            y2 = (cy + h / 2) / INPUT_SIZE

            class_id = int(class_ids[i])
            label = COCO_CLASSES[class_id] if class_id < len(COCO_CLASSES) else f"class_{class_id}"

            detections.append({
                "label": label,
                "confidence": round(float(max_scores[i]), 3),
                "bbox": [
                    round(float(x1), 4),
                    round(float(y1), 4),
                    round(float(x2), 4),
                    round(float(y2), 4),
                ],
            })

        detections.sort(key=lambda d: d["confidence"], reverse=True)
        return detections[:20]

    def _postprocess_qnn(self, outputs: list[np.ndarray], conf_threshold: float) -> list[dict]:
        """
        Parse Qualcomm AI Hub postprocessed output.
        outputs[0] = boxes  [1, 8400, 4]  (x1, y1, x2, y2 in pixel coords)
        outputs[1] = scores [1, 8400]
        outputs[2] = class_idx [1, 8400]  (uint8)
        """
        boxes = outputs[0][0]       # [8400, 4]
        scores = outputs[1][0]      # [8400]
        class_ids = outputs[2][0]   # [8400]

        mask = scores > conf_threshold
        boxes = boxes[mask]
        scores = scores[mask]
        class_ids = class_ids[mask]

        detections = []
        for i in range(len(boxes)):
            x1, y1, x2, y2 = boxes[i]
            class_id = int(class_ids[i])
            label = COCO_CLASSES[class_id] if class_id < len(COCO_CLASSES) else f"class_{class_id}"

            detections.append({
                "label": label,
                "confidence": round(float(scores[i]), 3),
                "bbox": [
                    round(float(x1) / INPUT_SIZE, 4),
                    round(float(y1) / INPUT_SIZE, 4),
                    round(float(x2) / INPUT_SIZE, 4),
                    round(float(y2) / INPUT_SIZE, 4),
                ],
            })

        detections.sort(key=lambda d: d["confidence"], reverse=True)
        return detections[:20]

    def detect(self, frame_rgb: np.ndarray) -> list[dict]:
        """Run full detection pipeline on an RGB frame (HWC numpy array)."""
        if not self._loaded:
            return []

        t0 = time.perf_counter()

        # Preprocess based on model format
        if self._qnn_format:
            input_tensor = self._preprocess_nhwc(frame_rgb)
        else:
            input_tensor = self._preprocess_nchw(frame_rgb)

        input_name = self.session.get_inputs()[0].name
        outputs = self.session.run(None, {input_name: input_tensor})

        # Postprocess based on model format
        if self._qnn_format:
            detections = self._postprocess_qnn(outputs, self.confidence)
        else:
            detections = self._postprocess_raw(outputs[0], self.confidence)

        dt = (time.perf_counter() - t0) * 1000
        logger.debug(f"Watchdog inference: {dt:.1f}ms, {len(detections)} detections")

        return detections

    def detect_from_base64(self, base64_str: str) -> list[dict]:
        """Convenience: decode base64 JPEG → detect."""
        import base64 as b64

        # Strip data URI prefix if present
        if "," in base64_str:
            base64_str = base64_str.split(",", 1)[1]

        img_bytes = b64.b64decode(base64_str)
        try:
            pil_img = Image.open(io.BytesIO(img_bytes)).convert("RGB")
        except Exception:
            return []

        frame_rgb = np.array(pil_img)
        return self.detect(frame_rgb)
