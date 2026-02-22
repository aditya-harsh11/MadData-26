"""Face detection (MediaPipe) and recognition (ArcFace) service with SQLite store."""

import logging
import time
from datetime import datetime
from pathlib import Path

import aiosqlite
import numpy as np
from PIL import Image

from app.config import settings
from app.models.schemas import FaceDetection, FaceMatch
from app.services.onnx_runtime_manager import OnnxRuntimeManager

logger = logging.getLogger(__name__)


def _embedding_to_bytes(emb: np.ndarray) -> bytes:
    """Pack a float32 numpy vector into raw bytes."""
    return emb.astype(np.float32).tobytes()


def _bytes_to_embedding(raw: bytes) -> np.ndarray:
    """Unpack raw bytes back to a float32 numpy vector."""
    return np.frombuffer(raw, dtype=np.float32).copy()


class FaceService:
    """Detect, embed, and recognise faces using ONNX Runtime sessions.

    Detection  -- MediaPipe face detection (128x128 input)
    Recognition -- ArcFace W600K R50 (112x112 input, 512-d embedding)
    Storage     -- SQLite via aiosqlite
    """

    # MediaPipe short-range face detector anchors (generated for 128x128 grid)
    # We generate them on first use and cache.
    _anchors: np.ndarray | None = None

    def __init__(self) -> None:
        self._manager = OnnxRuntimeManager()
        self._db_path = settings.db_path

    # ------------------------------------------------------------------
    # Anchor generation for MediaPipe face detector
    # ------------------------------------------------------------------

    @staticmethod
    def _generate_anchors(input_size: int = 128) -> np.ndarray:
        """Generate SSD anchors matching MediaPipe BlazeFace short-range.

        Returns (N, 2) array of (cx, cy) normalised 0-1.
        """
        strides = [8, 16]
        anchors: list[list[float]] = []
        for stride in strides:
            grid_size = input_size // stride
            num_anchors_per_cell = 2
            for y in range(grid_size):
                for x in range(grid_size):
                    cx = (x + 0.5) / grid_size
                    cy = (y + 0.5) / grid_size
                    for _ in range(num_anchors_per_cell):
                        anchors.append([cx, cy])
        return np.array(anchors, dtype=np.float32)

    @classmethod
    def _get_anchors(cls) -> np.ndarray:
        if cls._anchors is None:
            cls._anchors = cls._generate_anchors()
        return cls._anchors

    # ------------------------------------------------------------------
    # Face detection
    # ------------------------------------------------------------------

    def _preprocess_for_detection(self, frame: np.ndarray) -> np.ndarray:
        """Prepare image for MediaPipe face detector (128x128, RGB, float -1..1)."""
        pil_img = Image.fromarray(frame)
        pil_img = pil_img.resize((128, 128), Image.BILINEAR)
        img = np.array(pil_img, dtype=np.float32) / 127.5 - 1.0  # range [-1, 1]
        img = np.expand_dims(img, axis=0)  # (1, 128, 128, 3)
        return img

    def detect_faces(self, frame: np.ndarray) -> list[FaceDetection]:
        """Detect faces in a BGR frame using the MediaPipe ONNX model.

        Returns
        -------
        list[FaceDetection]
            Each item contains bbox (normalised 0-1), confidence, landmarks.
        """
        try:
            session = self._manager.get_session(settings.face_det_model)
        except FileNotFoundError:
            logger.warning("Face detection model not found -- returning empty.")
            return []

        input_name = session.get_inputs()[0].name
        tensor = self._preprocess_for_detection(frame)

        t0 = time.perf_counter()
        outputs = session.run(None, {input_name: tensor})
        elapsed = (time.perf_counter() - t0) * 1000
        logger.debug("Face detection inference: %.1f ms", elapsed)

        # MediaPipe outputs: [regressors (1, N, 16), classificators (1, N, 1)]
        raw_boxes = outputs[0][0]   # (N, 16) -- cx_off, cy_off, w, h, + 6 landmark pairs
        raw_scores = outputs[1][0]  # (N, 1)

        anchors = self._get_anchors()
        scores = 1.0 / (1.0 + np.exp(-raw_scores[:, 0]))  # sigmoid

        # Decode boxes
        # raw_boxes columns: dx, dy, w, h, then 6 x (lx, ly)
        cx = anchors[:, 0] + raw_boxes[:, 0] / 128.0
        cy = anchors[:, 1] + raw_boxes[:, 1] / 128.0
        w = raw_boxes[:, 2] / 128.0
        h = raw_boxes[:, 3] / 128.0

        x1 = cx - w / 2.0
        y1 = cy - h / 2.0
        x2 = cx + w / 2.0
        y2 = cy + h / 2.0

        # Filter by confidence
        conf_mask = scores >= settings.confidence_threshold
        indices = np.where(conf_mask)[0]

        if len(indices) == 0:
            return []

        # Simple NMS (greedy, since face count is usually small)
        kept: list[int] = []
        used = set()
        order = indices[np.argsort(-scores[indices])]
        for idx in order:
            if idx in used:
                continue
            kept.append(int(idx))
            for other in order:
                if other in used or other == idx:
                    continue
                iou = self._compute_iou(
                    [x1[idx], y1[idx], x2[idx], y2[idx]],
                    [x1[other], y1[other], x2[other], y2[other]],
                )
                if iou > 0.3:
                    used.add(other)

        detections: list[FaceDetection] = []
        for idx in kept:
            bbox = [
                float(np.clip(x1[idx], 0, 1)),
                float(np.clip(y1[idx], 0, 1)),
                float(np.clip(x2[idx], 0, 1)),
                float(np.clip(y2[idx], 0, 1)),
            ]
            # Extract 6 landmarks
            landmarks: list[list[float]] = []
            for lm_i in range(6):
                lx = float(anchors[idx, 0] + raw_boxes[idx, 4 + lm_i * 2] / 128.0)
                ly = float(anchors[idx, 1] + raw_boxes[idx, 5 + lm_i * 2] / 128.0)
                landmarks.append([np.clip(lx, 0, 1), np.clip(ly, 0, 1)])

            detections.append(
                FaceDetection(
                    bbox=bbox,
                    confidence=round(float(scores[idx]), 4),
                    landmarks=landmarks,
                )
            )

        return detections

    @staticmethod
    def _compute_iou(a: list[float], b: list[float]) -> float:
        ix1 = max(a[0], b[0])
        iy1 = max(a[1], b[1])
        ix2 = min(a[2], b[2])
        iy2 = min(a[3], b[3])
        inter = max(0.0, ix2 - ix1) * max(0.0, iy2 - iy1)
        area_a = (a[2] - a[0]) * (a[3] - a[1])
        area_b = (b[2] - b[0]) * (b[3] - b[1])
        union = area_a + area_b - inter
        return inter / union if union > 0 else 0.0

    # ------------------------------------------------------------------
    # Face embedding (ArcFace)
    # ------------------------------------------------------------------

    def _preprocess_for_recognition(
        self, frame: np.ndarray, bbox: list[float]
    ) -> np.ndarray:
        """Crop face from frame, resize to 112x112, normalise for ArcFace.

        Parameters
        ----------
        frame : BGR uint8 image
        bbox : [x1, y1, x2, y2] normalised 0-1
        """
        h, w = frame.shape[:2]
        x1 = max(0, int(bbox[0] * w))
        y1 = max(0, int(bbox[1] * h))
        x2 = min(w, int(bbox[2] * w))
        y2 = min(h, int(bbox[3] * h))

        face_crop = frame[y1:y2, x1:x2]
        if face_crop.size == 0:
            face_crop = frame  # fallback: use full image

        pil_crop = Image.fromarray(face_crop)
        pil_crop = pil_crop.resize((112, 112), Image.BILINEAR)
        face_crop = np.array(pil_crop, dtype=np.float32)
        # Standard ArcFace normalisation: (pixel - 127.5) / 127.5
        face_crop = (face_crop - 127.5) / 127.5
        # CHW + batch
        face_crop = np.transpose(face_crop, (2, 0, 1))
        face_crop = np.expand_dims(face_crop, axis=0)
        return face_crop

    def extract_embedding(
        self, frame: np.ndarray, face_box: list[float]
    ) -> np.ndarray:
        """Produce a 512-d L2-normalised embedding for the face region.

        Parameters
        ----------
        frame : BGR uint8 full image
        face_box : [x1, y1, x2, y2] normalised 0-1

        Returns
        -------
        np.ndarray  shape (512,) float32
        """
        session = self._manager.get_session(settings.face_rec_model)
        input_name = session.get_inputs()[0].name
        tensor = self._preprocess_for_recognition(frame, face_box)

        t0 = time.perf_counter()
        outputs = session.run(None, {input_name: tensor})
        elapsed = (time.perf_counter() - t0) * 1000
        logger.debug("ArcFace inference: %.1f ms", elapsed)

        embedding = outputs[0][0].astype(np.float32)
        # L2-normalise
        norm = np.linalg.norm(embedding)
        if norm > 0:
            embedding = embedding / norm
        return embedding

    # ------------------------------------------------------------------
    # Comparison
    # ------------------------------------------------------------------

    @staticmethod
    def compare_embeddings(emb1: np.ndarray, emb2: np.ndarray) -> float:
        """Cosine similarity between two L2-normalised embeddings."""
        return float(np.dot(emb1, emb2))

    # ------------------------------------------------------------------
    # SQLite face database
    # ------------------------------------------------------------------

    async def init_db(self) -> None:
        """Create the faces table if it does not exist."""
        async with aiosqlite.connect(self._db_path) as db:
            await db.execute(
                """
                CREATE TABLE IF NOT EXISTS faces (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    embedding BLOB NOT NULL,
                    created_at TEXT NOT NULL
                )
                """
            )
            await db.commit()
        logger.info("Face database initialised at %s", self._db_path)

    async def register_face(self, name: str, embedding: np.ndarray) -> int:
        """Store a face embedding and return its ID."""
        async with aiosqlite.connect(self._db_path) as db:
            cursor = await db.execute(
                "INSERT INTO faces (name, embedding, created_at) VALUES (?, ?, ?)",
                (name, _embedding_to_bytes(embedding), datetime.utcnow().isoformat()),
            )
            await db.commit()
            face_id = cursor.lastrowid
        logger.info("Registered face '%s' with id=%d", name, face_id)
        return face_id

    async def find_matching_face(
        self, embedding: np.ndarray
    ) -> tuple[str, float] | None:
        """Search all stored embeddings and return the best match above threshold."""
        best_name: str | None = None
        best_score: float = -1.0

        async with aiosqlite.connect(self._db_path) as db:
            async with db.execute("SELECT name, embedding FROM faces") as cursor:
                async for row in cursor:
                    stored_name: str = row[0]
                    stored_emb = _bytes_to_embedding(row[1])
                    score = self.compare_embeddings(embedding, stored_emb)
                    if score > best_score:
                        best_score = score
                        best_name = stored_name

        if best_name is not None and best_score >= settings.face_similarity_threshold:
            return best_name, round(best_score, 4)
        return None

    async def list_faces(self) -> list[dict]:
        """Return all registered face records (without embeddings)."""
        results: list[dict] = []
        async with aiosqlite.connect(self._db_path) as db:
            async with db.execute("SELECT id, name, created_at FROM faces") as cursor:
                async for row in cursor:
                    results.append(
                        {"id": row[0], "name": row[1], "created_at": row[2]}
                    )
        return results

    async def delete_face(self, face_id: int) -> bool:
        """Delete a face by ID.  Returns True if a row was deleted."""
        async with aiosqlite.connect(self._db_path) as db:
            cursor = await db.execute(
                "DELETE FROM faces WHERE id = ?", (face_id,)
            )
            await db.commit()
            return cursor.rowcount > 0
