#!/usr/bin/env python3
"""Download and compile ONNX models for CamerAI using Qualcomm AI Hub.

Usage
-----
    python -m scripts.download_models --all
    python -m scripts.download_models --model yolo
    python -m scripts.download_models --model face_det --model face_rec
"""

import argparse
import logging
import os
import shutil
import sys
import urllib.request
from pathlib import Path

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("download_models")

# Resolve models directory relative to the backend root
BACKEND_DIR = Path(__file__).resolve().parent.parent
MODELS_DIR = BACKEND_DIR / "models"

# ---------------------------------------------------------------------------
# Fallback direct-download URLs (public ONNX model zoo / HuggingFace)
# These are used when Qualcomm AI Hub compilation is not available.
# ---------------------------------------------------------------------------
FALLBACK_URLS: dict[str, str] = {
    "yolov8n_det.onnx": (
        "https://github.com/ultralytics/assets/releases/download/v8.2.0/yolov8n.onnx"
    ),
    "mediapipe_face_det.onnx": (
        "https://storage.googleapis.com/mediapipe-models/face_detector/"
        "blaze_face_short_range/float16/latest/blaze_face_short_range.tflite"
    ),
    "arcface_w600k_r50.onnx": (
        "https://huggingface.co/rocca/arcface-onnx/resolve/main/arcface_r100.onnx"
    ),
    "whisper_tiny_en.onnx": (
        "https://huggingface.co/onnx-community/whisper-tiny.en/resolve/main/"
        "onnx/encoder_model.onnx"
    ),
    "florence2_base.onnx": (
        "https://huggingface.co/onnx-community/Florence-2-base/resolve/main/"
        "onnx/vision_encoder.onnx"
    ),
}

# Qualcomm AI Hub model identifiers
QAI_HUB_MODELS: dict[str, str] = {
    "yolo": "yolov8_det",
    "face_det": "mediapipe_face",
    "face_rec": "arcface",
    "whisper": "whisper_tiny_en",
    "scene": "florence2",
}


def _ensure_models_dir() -> None:
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    logger.info("Models directory: %s", MODELS_DIR)


def _file_size_mb(path: Path) -> str:
    if path.exists():
        return f"{path.stat().st_size / (1024 * 1024):.1f} MB"
    return "N/A"


def _download_file(url: str, dest: Path) -> bool:
    """Download a file from *url* to *dest* with a progress indicator."""
    logger.info("Downloading %s", url)
    logger.info("  -> %s", dest)
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "CamerAI/1.0"})
        with urllib.request.urlopen(req, timeout=300) as resp:
            total = resp.headers.get("Content-Length")
            total = int(total) if total else None
            downloaded = 0
            chunk_size = 1024 * 256  # 256 KB

            with open(dest, "wb") as f:
                while True:
                    chunk = resp.read(chunk_size)
                    if not chunk:
                        break
                    f.write(chunk)
                    downloaded += len(chunk)
                    if total:
                        pct = downloaded * 100 / total
                        print(
                            f"\r  Progress: {downloaded / (1024*1024):.1f} / "
                            f"{total / (1024*1024):.1f} MB ({pct:.0f}%)",
                            end="",
                            flush=True,
                        )
                    else:
                        print(
                            f"\r  Downloaded: {downloaded / (1024*1024):.1f} MB",
                            end="",
                            flush=True,
                        )
            print()  # newline after progress
        logger.info("  Saved: %s (%s)", dest.name, _file_size_mb(dest))
        return True
    except Exception:
        logger.exception("  Download failed for %s", url)
        if dest.exists():
            dest.unlink()
        return False


def _try_qai_hub_compile(model_key: str, output_path: Path) -> bool:
    """Attempt to compile a model via Qualcomm AI Hub for Snapdragon X Elite.

    Returns True on success, False if AI Hub is unavailable or compilation fails.
    """
    try:
        import qai_hub as hub
    except ImportError:
        logger.info("  qai_hub not installed -- skipping AI Hub compilation.")
        return False

    hub_model_id = QAI_HUB_MODELS.get(model_key)
    if not hub_model_id:
        logger.info("  No AI Hub model mapping for '%s'.", model_key)
        return False

    try:
        logger.info("  Submitting compile job to Qualcomm AI Hub for '%s' ...", hub_model_id)

        # Attempt to load from qai_hub_models
        try:
            from qai_hub_models.utils.base_model import BaseModel as QAIBaseModel
            import qai_hub_models
            model_module = getattr(qai_hub_models.models, hub_model_id, None)
            if model_module is None:
                logger.info("  Model '%s' not found in qai_hub_models.", hub_model_id)
                return False

            model_cls = getattr(model_module, "Model", None)
            if model_cls is None:
                logger.info("  No Model class in qai_hub_models.models.%s.", hub_model_id)
                return False

            model_instance = model_cls.from_pretrained()
            input_spec = model_instance.get_input_spec()

            # Compile for Snapdragon X Elite (QCS8550)
            compile_job = hub.submit_compile_job(
                model=model_instance.get_traced_model(),
                device=hub.Device("Snapdragon X Elite CRD"),
                input_specs=input_spec,
                options="--target_runtime onnx",
            )
            logger.info("  Compile job submitted: %s", compile_job.job_id)
            logger.info("  Waiting for compilation to complete ...")

            compile_job.wait()

            if compile_job.get_status().success:
                target_model = compile_job.get_target_model()
                target_model.download(str(output_path))
                logger.info(
                    "  AI Hub compilation succeeded: %s (%s)",
                    output_path.name,
                    _file_size_mb(output_path),
                )
                return True
            else:
                logger.warning("  AI Hub compilation failed.")
                return False

        except Exception:
            logger.warning("  qai_hub_models approach failed.", exc_info=True)
            return False

    except Exception:
        logger.exception("  AI Hub compilation error.")
        return False


# ---------------------------------------------------------------------------
# Per-model download functions
# ---------------------------------------------------------------------------

def download_yolo() -> None:
    """Download or compile YOLOv8-nano detection model."""
    dest = MODELS_DIR / "yolov8n_det.onnx"
    if dest.exists():
        logger.info("YOLO model already exists: %s (%s)", dest, _file_size_mb(dest))
        return

    logger.info("--- YOLOv8-nano Detection ---")
    if _try_qai_hub_compile("yolo", dest):
        return

    url = FALLBACK_URLS.get("yolov8n_det.onnx")
    if url:
        _download_file(url, dest)


def download_face_det() -> None:
    """Download or compile MediaPipe face detection model."""
    dest = MODELS_DIR / "mediapipe_face_det.onnx"
    if dest.exists():
        logger.info("Face detection model already exists: %s (%s)", dest, _file_size_mb(dest))
        return

    logger.info("--- MediaPipe Face Detection ---")
    if _try_qai_hub_compile("face_det", dest):
        return

    url = FALLBACK_URLS.get("mediapipe_face_det.onnx")
    if url:
        _download_file(url, dest)


def download_face_rec() -> None:
    """Download or compile ArcFace recognition model."""
    dest = MODELS_DIR / "arcface_w600k_r50.onnx"
    if dest.exists():
        logger.info("Face recognition model already exists: %s (%s)", dest, _file_size_mb(dest))
        return

    logger.info("--- ArcFace W600K R50 ---")
    if _try_qai_hub_compile("face_rec", dest):
        return

    url = FALLBACK_URLS.get("arcface_w600k_r50.onnx")
    if url:
        _download_file(url, dest)


def download_whisper() -> None:
    """Download or compile Whisper tiny.en model."""
    dest = MODELS_DIR / "whisper_tiny_en.onnx"
    if dest.exists():
        logger.info("Whisper model already exists: %s (%s)", dest, _file_size_mb(dest))
        return

    logger.info("--- Whisper Tiny EN ---")
    if _try_qai_hub_compile("whisper", dest):
        return

    url = FALLBACK_URLS.get("whisper_tiny_en.onnx")
    if url:
        _download_file(url, dest)


def download_scene() -> None:
    """Download or compile Florence-2 scene understanding model."""
    dest = MODELS_DIR / "florence2_base.onnx"
    if dest.exists():
        logger.info("Scene model already exists: %s (%s)", dest, _file_size_mb(dest))
        return

    logger.info("--- Florence-2 Base ---")
    if _try_qai_hub_compile("scene", dest):
        return

    url = FALLBACK_URLS.get("florence2_base.onnx")
    if url:
        _download_file(url, dest)


def download_phi3() -> None:
    """Download Phi-3.5-mini ONNX model for onnxruntime-genai.

    The model directory should contain the ONNX weights plus tokenizer files.
    We attempt to download from HuggingFace via the onnxruntime-genai ecosystem.
    """
    dest = MODELS_DIR / "phi3-mini"
    if dest.exists() and any(dest.iterdir()):
        logger.info("Phi-3 model directory already exists: %s", dest)
        return

    logger.info("--- Phi-3.5-mini (onnxruntime-genai) ---")
    dest.mkdir(parents=True, exist_ok=True)

    # Try using huggingface_hub if available
    try:
        from huggingface_hub import snapshot_download

        logger.info("  Downloading Phi-3.5-mini-instruct ONNX from HuggingFace ...")
        snapshot_download(
            repo_id="microsoft/Phi-3.5-mini-instruct-onnx",
            local_dir=str(dest),
            allow_patterns=["*.onnx", "*.onnx.data", "*.json", "*.model", "*.txt"],
            local_dir_use_symlinks=False,
        )
        logger.info("  Phi-3.5-mini downloaded to %s", dest)
        return
    except ImportError:
        logger.info("  huggingface_hub not installed.")
    except Exception:
        logger.warning("  HuggingFace download failed.", exc_info=True)

    # Manual fallback: download the key files individually
    phi3_base_url = (
        "https://huggingface.co/microsoft/Phi-3.5-mini-instruct-onnx/resolve/main/cpu_and_mobile/cpu-int4-rtn-block-32-acc-level-4/"
    )
    phi3_files = [
        "phi3.5-mini-instruct-cpu-int4-rtn-block-32-acc-level-4.onnx",
        "phi3.5-mini-instruct-cpu-int4-rtn-block-32-acc-level-4.onnx.data",
        "genai_config.json",
        "tokenizer.json",
        "tokenizer_config.json",
        "special_tokens_map.json",
    ]

    for fname in phi3_files:
        file_dest = dest / fname
        if file_dest.exists():
            logger.info("  %s already exists, skipping.", fname)
            continue
        url = phi3_base_url + fname
        _download_file(url, file_dest)

    logger.info("  Phi-3.5-mini setup complete at %s", dest)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

DOWNLOAD_MAP = {
    "yolo": download_yolo,
    "face_det": download_face_det,
    "face_rec": download_face_rec,
    "whisper": download_whisper,
    "scene": download_scene,
    "phi3": download_phi3,
}


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Download and compile ONNX models for CamerAI."
    )
    parser.add_argument(
        "--model",
        action="append",
        choices=list(DOWNLOAD_MAP.keys()),
        help="Specific model(s) to download. Can be repeated.",
    )
    parser.add_argument(
        "--all",
        action="store_true",
        help="Download all models.",
    )
    parser.add_argument(
        "--models-dir",
        type=str,
        default=None,
        help="Override the models directory.",
    )

    args = parser.parse_args()

    if args.models_dir:
        global MODELS_DIR
        MODELS_DIR = Path(args.models_dir)

    _ensure_models_dir()

    if args.all:
        targets = list(DOWNLOAD_MAP.keys())
    elif args.model:
        targets = args.model
    else:
        parser.print_help()
        print("\nSpecify --all or --model <name>.")
        sys.exit(1)

    logger.info("Models to download: %s", targets)
    print()

    for name in targets:
        try:
            DOWNLOAD_MAP[name]()
        except Exception:
            logger.exception("Failed to download model '%s'.", name)
        print()

    # Summary
    print("=" * 60)
    print("Model download summary:")
    print("=" * 60)
    for name in targets:
        if name == "phi3":
            dest = MODELS_DIR / "phi3-mini"
            exists = dest.exists() and any(dest.iterdir()) if dest.exists() else False
            size = "directory" if exists else "MISSING"
        else:
            key_map = {
                "yolo": "yolov8n_det.onnx",
                "face_det": "mediapipe_face_det.onnx",
                "face_rec": "arcface_w600k_r50.onnx",
                "whisper": "whisper_tiny_en.onnx",
                "scene": "florence2_base.onnx",
            }
            dest = MODELS_DIR / key_map[name]
            exists = dest.exists()
            size = _file_size_mb(dest) if exists else "MISSING"

        status = "OK" if exists else "FAILED"
        print(f"  {name:12s}  {status:6s}  {size}")

    print("=" * 60)


if __name__ == "__main__":
    main()
