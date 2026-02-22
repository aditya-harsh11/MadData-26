"""YOLOv8 object detection service running on ONNX Runtime."""

import logging
import random
import time

import numpy as np
from PIL import Image

from app.config import settings
from app.models.schemas import Detection
from app.services.onnx_runtime_manager import OnnxRuntimeManager, _ORT_AVAILABLE

logger = logging.getLogger(__name__)


# 80 COCO class names in canonical order
COCO_CLASSES: list[str] = [
    "person", "bicycle", "car", "motorcycle", "airplane", "bus", "train",
    "truck", "boat", "traffic light", "fire hydrant", "stop sign",
    "parking meter", "bench", "bird", "cat", "dog", "horse", "sheep", "cow",
    "elephant", "bear", "zebra", "giraffe", "backpack", "umbrella",
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


def _nms_numpy(
    boxes: np.ndarray,
    scores: np.ndarray,
    iou_threshold: float,
) -> np.ndarray:
    """Pure-numpy Non-Maximum Suppression.

    Parameters
    ----------
    boxes : (N, 4) float32 array of [x1, y1, x2, y2]
    scores : (N,) float32 confidence scores
    iou_threshold : IoU threshold for suppression

    Returns
    -------
    np.ndarray of kept indices
    """
    if len(boxes) == 0:
        return np.array([], dtype=np.int64)

    x1 = boxes[:, 0]
    y1 = boxes[:, 1]
    x2 = boxes[:, 2]
    y2 = boxes[:, 3]

    areas = (x2 - x1) * (y2 - y1)
    order = scores.argsort()[::-1]

    keep: list[int] = []
    while order.size > 0:
        i = order[0]
        keep.append(int(i))

        if order.size == 1:
            break

        xx1 = np.maximum(x1[i], x1[order[1:]])
        yy1 = np.maximum(y1[i], y1[order[1:]])
        xx2 = np.minimum(x2[i], x2[order[1:]])
        yy2 = np.minimum(y2[i], y2[order[1:]])

        w = np.maximum(0.0, xx2 - xx1)
        h = np.maximum(0.0, yy2 - yy1)
        intersection = w * h

        union = areas[i] + areas[order[1:]] - intersection
        iou = np.where(union > 0, intersection / union, 0.0)

        # Keep boxes with IoU below threshold
        inds = np.where(iou <= iou_threshold)[0]
        order = order[inds + 1]

    return np.array(keep, dtype=np.int64)


class YOLOService:
    """YOLOv8-nano detection backed by ONNX Runtime (QNN or CPU)."""

    COCO_CLASSES = COCO_CLASSES
    INPUT_SIZE = 640

    def __init__(self) -> None:
        self._manager = OnnxRuntimeManager()

    # ------------------------------------------------------------------
    # Pre / Post processing
    # ------------------------------------------------------------------

    def preprocess(self, frame: np.ndarray) -> np.ndarray:
        """Resize, normalise, and reshape *frame* for YOLOv8 input.

        Parameters
        ----------
        frame : np.ndarray
            RGB uint8 image of any size.

        Returns
        -------
        np.ndarray
            float32 tensor shaped (1, 3, 640, 640).
        """
        pil_img = Image.fromarray(frame)
        pil_img = pil_img.resize((self.INPUT_SIZE, self.INPUT_SIZE), Image.BILINEAR)
        img = np.array(pil_img, dtype=np.float32) / 255.0
        # HWC -> CHW
        img = np.transpose(img, (2, 0, 1))
        # Add batch dimension
        img = np.expand_dims(img, axis=0)
        return img

    def postprocess(
        self,
        outputs: np.ndarray,
        orig_shape: tuple[int, int],
        conf_thresh: float | None = None,
        iou_thresh: float = 0.45,
    ) -> list[Detection]:
        """Decode raw YOLOv8 output tensor into a list of `Detection`.

        The YOLOv8 detection head produces shape (1, 84, 8400).
        After transposing: (8400, 84) where columns are
        [cx, cy, w, h, class_score_0 ... class_score_79].

        Parameters
        ----------
        outputs : raw ONNX output (1, 84, 8400)
        orig_shape : (height, width) of the original frame
        conf_thresh : confidence threshold (default from settings)
        iou_thresh : IoU threshold for NMS

        Returns
        -------
        list[Detection]
        """
        if conf_thresh is None:
            conf_thresh = settings.confidence_threshold

        orig_h, orig_w = orig_shape

        # (1, 84, 8400) -> (8400, 84)
        preds = outputs[0].T  # shape (8400, 84)

        # Centre-format boxes (cx, cy, w, h)
        cx = preds[:, 0]
        cy = preds[:, 1]
        w = preds[:, 2]
        h = preds[:, 3]

        # Class scores start at column 4
        class_scores = preds[:, 4:]  # (8400, 80)
        class_ids = np.argmax(class_scores, axis=1)
        confidences = class_scores[np.arange(len(class_ids)), class_ids]

        # Filter by confidence
        mask = confidences >= conf_thresh
        if not np.any(mask):
            return []

        cx, cy, w, h = cx[mask], cy[mask], w[mask], h[mask]
        class_ids = class_ids[mask]
        confidences = confidences[mask]

        # Convert to corner format (x1, y1, x2, y2) in input-image coords
        x1 = cx - w / 2.0
        y1 = cy - h / 2.0
        x2 = cx + w / 2.0
        y2 = cy + h / 2.0

        boxes = np.stack([x1, y1, x2, y2], axis=1)

        # Apply NMS
        keep = _nms_numpy(boxes, confidences, iou_thresh)
        if len(keep) == 0:
            return []

        boxes = boxes[keep]
        class_ids = class_ids[keep]
        confidences = confidences[keep]

        # Normalise boxes to 0-1 relative to original image
        scale_x = orig_w / self.INPUT_SIZE
        scale_y = orig_h / self.INPUT_SIZE
        boxes[:, 0] *= scale_x
        boxes[:, 2] *= scale_x
        boxes[:, 1] *= scale_y
        boxes[:, 3] *= scale_y

        # Clip and normalise to 0-1
        boxes[:, 0] = np.clip(boxes[:, 0] / orig_w, 0.0, 1.0)
        boxes[:, 1] = np.clip(boxes[:, 1] / orig_h, 0.0, 1.0)
        boxes[:, 2] = np.clip(boxes[:, 2] / orig_w, 0.0, 1.0)
        boxes[:, 3] = np.clip(boxes[:, 3] / orig_h, 0.0, 1.0)

        detections: list[Detection] = []
        for i in range(len(boxes)):
            cid = int(class_ids[i])
            detections.append(
                Detection(
                    class_id=cid,
                    class_name=self.COCO_CLASSES[cid] if cid < len(self.COCO_CLASSES) else f"class_{cid}",
                    confidence=round(float(confidences[i]), 4),
                    bbox=[round(float(v), 5) for v in boxes[i]],
                )
            )

        return detections

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def _demo_detect(self, frame: np.ndarray) -> list[Detection]:
        """Return synthetic detections for demo purposes when no model is loaded."""
        h, w = frame.shape[:2]

        # Deterministic seed based on frame content hash for consistency
        sample = frame[::32, ::32].sum()
        rng = random.Random(int(sample) % 100000)

        num_detections = rng.randint(1, 4)
        demo_objects = [
            ("person", 0),
            ("car", 2),
            ("dog", 16),
            ("laptop", 63),
            ("cell phone", 67),
            ("chair", 56),
            ("bottle", 39),
            ("cup", 41),
            ("book", 73),
            ("backpack", 24),
        ]

        detections: list[Detection] = []
        for i in range(num_detections):
            obj_name, class_id = rng.choice(demo_objects)
            # Generate a random box within the frame
            cx = rng.uniform(0.15, 0.85)
            cy = rng.uniform(0.15, 0.85)
            bw = rng.uniform(0.08, 0.30)
            bh = rng.uniform(0.08, 0.30)
            x1 = max(0.0, cx - bw / 2)
            y1 = max(0.0, cy - bh / 2)
            x2 = min(1.0, cx + bw / 2)
            y2 = min(1.0, cy + bh / 2)
            conf = round(rng.uniform(0.55, 0.97), 4)

            detections.append(
                Detection(
                    class_id=class_id,
                    class_name=obj_name,
                    confidence=conf,
                    bbox=[round(x1, 5), round(y1, 5), round(x2, 5), round(y2, 5)],
                )
            )

        return detections

    def detect(self, frame: np.ndarray) -> list[Detection]:
        """Run end-to-end detection on an RGB frame.

        Falls back to demo detections if ONNX Runtime or model is unavailable.
        """
        # Check if real inference is possible
        model_path = settings.models_dir / settings.yolo_model
        if not _ORT_AVAILABLE or not model_path.exists():
            logger.debug("Using demo detection mode (ort=%s, model_exists=%s)",
                         _ORT_AVAILABLE, model_path.exists())
            return self._demo_detect(frame)

        session = self._manager.get_session(settings.yolo_model)
        input_name = session.get_inputs()[0].name

        tensor = self.preprocess(frame)
        orig_shape = (frame.shape[0], frame.shape[1])

        t0 = time.perf_counter()
        outputs = session.run(None, {input_name: tensor})
        elapsed = (time.perf_counter() - t0) * 1000
        logger.debug("YOLO inference: %.1f ms", elapsed)

        return self.postprocess(outputs[0], orig_shape)
