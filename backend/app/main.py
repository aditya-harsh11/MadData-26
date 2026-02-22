"""CamerAI FastAPI application entry point."""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import detection, faces, health, scene, speech, workflow_nlp
from app.services.face_service import FaceService
from app.services.onnx_runtime_manager import OnnxRuntimeManager

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("camerai")


# ---------------------------------------------------------------------------
# Lifespan (startup / shutdown)
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Async context manager executed on application startup and shutdown."""
    logger.info("CamerAI starting up ...")

    # Initialise ONNX Runtime manager (checks providers, creates dirs)
    manager = OnnxRuntimeManager()
    await manager.initialize()

    # Prepare SQLite face database
    face_svc = FaceService()
    await face_svc.init_db()

    logger.info("CamerAI ready -- listening on %s:%s", settings.host, settings.port)

    yield  # ---- application is running ----

    logger.info("CamerAI shutting down ...")
    manager.shutdown()
    logger.info("CamerAI stopped.")


# ---------------------------------------------------------------------------
# Application
# ---------------------------------------------------------------------------

app = FastAPI(
    title="CamerAI",
    description=(
        "Smart camera orchestration platform powered by Qualcomm Snapdragon X Elite NPU. "
        "Provides real-time object detection, face recognition, scene understanding, "
        "speech-to-text, and natural-language workflow generation -- all running on-device."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

# CORS -- allow all origins during development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------
app.include_router(health.router)
app.include_router(detection.router)
app.include_router(faces.router)
app.include_router(scene.router)
app.include_router(speech.router)
app.include_router(workflow_nlp.router)


# ---------------------------------------------------------------------------
# Root
# ---------------------------------------------------------------------------

@app.get("/")
async def root() -> dict:
    return {"app": "CamerAI", "version": "1.0.0"}
