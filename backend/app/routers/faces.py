"""Face registration and recognition endpoints."""

import io
import logging
import time

import numpy as np
from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from PIL import Image

from app.models.schemas import FaceDetection, FaceMatch, FaceRecord
from app.services.face_service import FaceService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/faces", tags=["faces"])

_face_service: FaceService | None = None


def _get_face_service() -> FaceService:
    global _face_service
    if _face_service is None:
        _face_service = FaceService()
    return _face_service


def _decode_image(data: bytes) -> np.ndarray:
    try:
        pil_img = Image.open(io.BytesIO(data))
        pil_img = pil_img.convert("RGB")
        return np.array(pil_img)
    except Exception:
        raise HTTPException(status_code=400, detail="Could not decode image.")


# ------------------------------------------------------------------
# Endpoints
# ------------------------------------------------------------------

@router.post("/register")
async def register_face(
    name: str = Form(...),
    file: UploadFile = File(...),
) -> dict:
    """Upload an image and a name to register a face in the database.

    The image must contain exactly one clearly visible face.
    """
    svc = _get_face_service()
    await svc.init_db()

    data = await file.read()
    img = _decode_image(data)

    faces = svc.detect_faces(img)
    if not faces:
        raise HTTPException(status_code=400, detail="No face detected in the image.")

    # Use the highest-confidence detection
    best = max(faces, key=lambda f: f.confidence)
    embedding = svc.extract_embedding(img, best.bbox)
    face_id = await svc.register_face(name, embedding)

    return {
        "id": face_id,
        "name": name,
        "message": f"Face registered successfully as '{name}'.",
        "bbox": best.bbox,
        "confidence": best.confidence,
    }


@router.post("/recognize")
async def recognize_faces(file: UploadFile = File(...)) -> dict:
    """Upload an image and match detected faces against the database."""
    svc = _get_face_service()
    await svc.init_db()

    data = await file.read()
    img = _decode_image(data)

    faces = svc.detect_faces(img)
    if not faces:
        return {"matches": [], "faces_detected": 0}

    matches: list[dict] = []
    for face in faces:
        try:
            embedding = svc.extract_embedding(img, face.bbox)
        except FileNotFoundError:
            raise HTTPException(
                status_code=503,
                detail="Face recognition model not available.",
            )
        result = await svc.find_matching_face(embedding)
        if result is not None:
            matched_name, score = result
            matches.append(
                FaceMatch(
                    name=matched_name,
                    confidence=score,
                    bbox=face.bbox,
                ).model_dump()
            )
        else:
            matches.append({
                "name": "unknown",
                "confidence": 0.0,
                "bbox": face.bbox,
            })

    return {"matches": matches, "faces_detected": len(faces)}


@router.get("")
async def list_faces() -> dict:
    """List all registered faces."""
    svc = _get_face_service()
    await svc.init_db()
    faces = await svc.list_faces()
    return {"faces": faces, "total": len(faces)}


@router.delete("/{face_id}")
async def delete_face(face_id: int) -> dict:
    """Delete a registered face by ID."""
    svc = _get_face_service()
    await svc.init_db()
    deleted = await svc.delete_face(face_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"Face with id={face_id} not found.")
    return {"message": f"Face {face_id} deleted.", "id": face_id}


@router.post("/compare")
async def compare_faces(
    file1: UploadFile = File(...),
    file2: UploadFile = File(...),
) -> dict:
    """Upload two images and compare the similarity of the faces found in each."""
    svc = _get_face_service()

    data1 = await file1.read()
    data2 = await file2.read()
    img1 = _decode_image(data1)
    img2 = _decode_image(data2)

    faces1 = svc.detect_faces(img1)
    faces2 = svc.detect_faces(img2)

    if not faces1:
        raise HTTPException(status_code=400, detail="No face detected in the first image.")
    if not faces2:
        raise HTTPException(status_code=400, detail="No face detected in the second image.")

    best1 = max(faces1, key=lambda f: f.confidence)
    best2 = max(faces2, key=lambda f: f.confidence)

    try:
        emb1 = svc.extract_embedding(img1, best1.bbox)
        emb2 = svc.extract_embedding(img2, best2.bbox)
    except FileNotFoundError:
        raise HTTPException(status_code=503, detail="Face recognition model not available.")

    similarity = svc.compare_embeddings(emb1, emb2)

    return {
        "similarity": round(similarity, 4),
        "same_person": similarity >= 0.6,
        "face1_confidence": best1.confidence,
        "face2_confidence": best2.confidence,
    }
