"""Scene understanding endpoints."""

import io
import logging
import re
import time
from collections import Counter

import numpy as np
from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from PIL import Image

from app.models.schemas import SceneDescription, SceneChatResponse
from app.services.scene_service import SceneService
from app.services.yolo_service import YOLOService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/scene", tags=["scene"])

_scene_service: SceneService | None = None
_yolo_service: YOLOService | None = None


def _get_scene_service() -> SceneService:
    global _scene_service
    if _scene_service is None:
        _scene_service = SceneService()
    return _scene_service


def _get_yolo_service() -> YOLOService:
    global _yolo_service
    if _yolo_service is None:
        _yolo_service = YOLOService()
    return _yolo_service


def _decode_image(data: bytes) -> np.ndarray:
    try:
        pil_img = Image.open(io.BytesIO(data))
        pil_img = pil_img.convert("RGB")
        return np.array(pil_img)
    except Exception:
        raise HTTPException(status_code=400, detail="Could not decode image.")


@router.post("/describe", response_model=SceneDescription)
async def describe_scene(file: UploadFile = File(...)) -> SceneDescription:
    """Upload an image and receive a natural-language scene description.

    Uses Florence-2 when available; otherwise returns a basic summary.
    """
    data = await file.read()
    img = _decode_image(data)

    svc = _get_scene_service()
    t0 = time.perf_counter()
    description = svc.describe_scene(img)
    elapsed = (time.perf_counter() - t0) * 1000
    logger.info("Scene description generated in %.1f ms", elapsed)

    return description


@router.post("/describe-with-detections", response_model=SceneDescription)
async def describe_scene_with_detections(
    file: UploadFile = File(...),
) -> SceneDescription:
    """Upload an image, run YOLOv8 first, then generate a scene description
    enriched with detection data.
    """
    data = await file.read()
    img = _decode_image(data)

    yolo = _get_yolo_service()
    try:
        detections = yolo.detect(img)
    except FileNotFoundError:
        detections = []
        logger.warning("YOLO model not available; scene description without detections.")

    svc = _get_scene_service()
    t0 = time.perf_counter()
    description = svc.describe_scene(img, detections=detections)
    elapsed = (time.perf_counter() - t0) * 1000
    logger.info(
        "Scene description (with %d detections) generated in %.1f ms",
        len(detections),
        elapsed,
    )

    return description


# -----------------------------------------------------------------
# Scene chat — answer questions about what the camera sees
# -----------------------------------------------------------------

def _describe_position(bbox: list[float]) -> str:
    cx = (bbox[0] + bbox[2]) / 2
    cy = (bbox[1] + bbox[3]) / 2
    h = "left" if cx < 0.33 else ("right" if cx > 0.66 else "center")
    v = "top" if cy < 0.33 else ("bottom" if cy > 0.66 else "middle")
    if h == "center" and v == "middle":
        return "in the center of the frame"
    if v == "middle":
        return f"on the {h} side"
    if h == "center":
        return f"at the {v}"
    return f"at the {v}-{h}"


def _build_rich_answer(question: str, detections: list, objects: list[str], counts: dict[str, int]) -> str:
    """Generate a natural-language answer grounded in real detections."""
    q = question.lower().strip()
    total = len(detections)

    # --- "how many" questions ---
    how_many = re.search(r"how many\s+(\w+)", q)
    if how_many:
        target = how_many.group(1).rstrip("s")
        matched = [d for d in detections if target in d.class_name.lower()]
        if matched:
            return f"I can see {len(matched)} {target}{'s' if len(matched) != 1 else ''} in the current frame."
        return f"I don't see any {target} in the frame right now."

    # --- "is there a ..." / "do you see ..." ---
    is_there = re.search(r"(?:is there|are there|do you see|can you see|any|find)\s+(?:a |an |the )?(\w+)", q)
    if is_there:
        target = is_there.group(1).rstrip("s")
        matched = [d for d in detections if target in d.class_name.lower()]
        if matched:
            best = max(matched, key=lambda d: d.confidence)
            return (
                f"Yes! I can see {len(matched)} {target}{'s' if len(matched) != 1 else ''}. "
                f"The most confident detection ({best.confidence * 100:.0f}%) is {_describe_position(best.bbox)}."
            )
        return f"No, I don't see any {target} in the current frame."

    # --- "where is ..." ---
    where_is = re.search(r"where\s+(?:is|are)\s+(?:the |a )?(\w+)", q)
    if where_is:
        target = where_is.group(1).rstrip("s")
        matched = [d for d in detections if target in d.class_name.lower()]
        if matched:
            lines = [
                f"A {d.class_name} ({d.confidence * 100:.0f}% confidence) is {_describe_position(d.bbox)}"
                for d in matched
            ]
            return ".\n".join(lines) + "."
        return f"I can't locate any {target} in the frame right now."

    # --- "describe person" / "who" / person-related ---
    describe_person = (
        "person" in q
        and any(kw in q for kw in ["describe", "tell me about", "what does", "look like", "wearing", "who"])
    )
    if describe_person:
        people = [d for d in detections if d.class_name == "person"]
        if not people:
            return "I don't see any people in the frame right now."
        nearby_objects = [d.class_name for d in detections if d.class_name != "person"]
        nearby_str = ""
        if nearby_objects:
            obj_counts = Counter(nearby_objects)
            parts = [f"{c} {n}{'s' if c > 1 else ''}" for n, c in obj_counts.most_common()]
            nearby_str = " Nearby objects include: " + ", ".join(parts) + "."

        lines = []
        for i, p in enumerate(people):
            pos = _describe_position(p.bbox)
            size_w = p.bbox[2] - p.bbox[0]
            size_h = p.bbox[3] - p.bbox[1]
            distance = "close to the camera" if (size_w * size_h) > 0.15 else (
                "at a medium distance" if (size_w * size_h) > 0.04 else "far from the camera"
            )
            lines.append(
                f"Person {i + 1} is {pos}, {distance} "
                f"(detected with {p.confidence * 100:.0f}% confidence)."
            )
        return " ".join(lines) + nearby_str

    # --- General "what do you see" / "describe the scene" / "what is happening" ---
    if total == 0:
        return "I don't see any objects in the frame right now. The scene appears empty, or detection may not be active."

    parts = []
    for name, count in counts.items():
        parts.append(f"{count} {name}{'s' if count > 1 else ''}")
    if len(parts) == 1:
        listing = parts[0]
    elif len(parts) == 2:
        listing = f"{parts[0]} and {parts[1]}"
    else:
        listing = ", ".join(parts[:-1]) + f", and {parts[-1]}"

    summary = f"I can see {listing} in the current frame."

    # Add positional details for up to 5 objects
    details = []
    for d in detections[:5]:
        details.append(
            f"A {d.class_name} ({d.confidence * 100:.0f}%) {_describe_position(d.bbox)}"
        )
    remaining = total - len(details)
    detail_str = ". ".join(details) + "."
    if remaining > 0:
        detail_str += f" Plus {remaining} more object{'s' if remaining != 1 else ''}."

    return f"{summary}\n\n{detail_str}"


@router.post("/chat", response_model=SceneChatResponse)
async def scene_chat(
    file: UploadFile = File(...),
    question: str = Form(default="What do you see?"),
) -> SceneChatResponse:
    """Send a camera frame and a question; get a natural-language answer
    grounded in real YOLOv8 detections."""
    data = await file.read()
    img = _decode_image(data)

    # Run real YOLO detection on the frame
    yolo = _get_yolo_service()
    try:
        detections = yolo.detect(img)
    except FileNotFoundError:
        detections = []

    objects_list = sorted(set(d.class_name for d in detections))
    counts = dict(Counter(d.class_name for d in detections).most_common())

    t0 = time.perf_counter()
    answer = _build_rich_answer(question, detections, objects_list, counts)
    elapsed = (time.perf_counter() - t0) * 1000
    logger.info("Scene chat answered in %.1f ms (%d detections)", elapsed, len(detections))

    return SceneChatResponse(
        answer=answer,
        detections_used=len(detections),
        objects=objects_list,
    )
