"""Singleton manager for ONNX Runtime inference sessions with QNN EP support."""

import logging
from pathlib import Path

from app.config import settings

logger = logging.getLogger(__name__)

try:
    import onnxruntime as ort
    _ORT_AVAILABLE = True
except ImportError:
    ort = None  # type: ignore[assignment]
    _ORT_AVAILABLE = False
    logger.warning("onnxruntime is not installed -- all inference will be unavailable.")


class OnnxRuntimeManager:
    """Manages ONNX Runtime sessions across the application.

    Uses a singleton pattern so every service shares the same manager instance
    and session cache.
    """

    _instance: "OnnxRuntimeManager | None" = None

    def __new__(cls) -> "OnnxRuntimeManager":
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._sessions = {}
            cls._instance._initialized = False
        return cls._instance

    def __init__(self) -> None:
        if not hasattr(self, "_sessions"):
            self._sessions: dict = {}
            self._initialized: bool = False

    async def initialize(self) -> None:
        """Prepare the runtime: log providers, verify QNN, ensure dirs."""
        if _ORT_AVAILABLE:
            available = ort.get_available_providers()
            logger.info("ONNX Runtime %s", ort.__version__)
            logger.info("Available execution providers: %s", available)

            if "QNNExecutionProvider" in available:
                logger.info("QNNExecutionProvider detected -- NPU acceleration available")
            else:
                logger.warning("QNNExecutionProvider NOT available. Falling back to CPU.")
        else:
            logger.warning("ONNX Runtime not installed -- skipping provider check.")

        models_dir = Path(settings.models_dir)
        models_dir.mkdir(parents=True, exist_ok=True)
        logger.info("Models directory: %s", models_dir.resolve())
        self._initialized = True

    def shutdown(self) -> None:
        """Release every cached session."""
        logger.info("Shutting down OnnxRuntimeManager -- releasing %d sessions", len(self._sessions))
        self._sessions.clear()
        self._initialized = False

    def get_session(self, model_name: str):
        """Return a cached session or lazily create one."""
        if not _ORT_AVAILABLE:
            raise RuntimeError("onnxruntime is not installed")

        if model_name in self._sessions:
            return self._sessions[model_name]

        model_path = Path(settings.models_dir) / model_name
        if not model_path.exists():
            raise FileNotFoundError(f"Model file not found: {model_path.resolve()}")

        providers = []
        if self.is_npu_available() and settings.qnn_enabled:
            providers.append(("QNNExecutionProvider", settings.qnn_provider_options))
        providers.append("CPUExecutionProvider")

        logger.info("Loading ONNX model '%s' with providers %s",
                     model_name, [p if isinstance(p, str) else p[0] for p in providers])

        session_options = ort.SessionOptions()
        session_options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL

        try:
            session = ort.InferenceSession(str(model_path), sess_options=session_options, providers=providers)
        except Exception:
            logger.warning("Failed to load '%s' with QNN EP, retrying with CPU only.", model_name, exc_info=True)
            session = ort.InferenceSession(str(model_path), sess_options=session_options, providers=["CPUExecutionProvider"])

        active = session.get_providers()
        logger.info("Session '%s' active providers: %s", model_name, active)
        self._sessions[model_name] = session
        return session

    def is_npu_available(self) -> bool:
        if not _ORT_AVAILABLE:
            return False
        return "QNNExecutionProvider" in ort.get_available_providers()

    @property
    def active_provider(self) -> str:
        if self.is_npu_available() and settings.qnn_enabled:
            return "QNNExecutionProvider"
        return "CPUExecutionProvider"

    def get_provider_info(self) -> dict:
        available = ort.get_available_providers() if _ORT_AVAILABLE else []
        return {
            "active_provider": self.active_provider,
            "available_providers": available,
            "qnn_available": "QNNExecutionProvider" in available,
            "qnn_enabled": settings.qnn_enabled,
            "session_count": len(self._sessions),
            "loaded_models": list(self._sessions.keys()),
            "ort_available": _ORT_AVAILABLE,
        }
