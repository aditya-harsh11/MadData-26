#!/usr/bin/env python3
"""CamerAI QNN Verification & Benchmark Script.

Verifies that the Qualcomm QNN Execution Provider is available and working,
benchmarks NPU vs CPU inference speed, and validates all model files.
"""

import sys
import time
import json
import os
from pathlib import Path

# Add backend to path
SCRIPT_DIR = Path(__file__).resolve().parent
ROOT_DIR = SCRIPT_DIR.parent
BACKEND_DIR = ROOT_DIR / "backend"
sys.path.insert(0, str(BACKEND_DIR))

MODELS_DIR = BACKEND_DIR / "models"

# ANSI colors for terminal output
class Colors:
    GREEN = "\033[92m"
    RED = "\033[91m"
    YELLOW = "\033[93m"
    CYAN = "\033[96m"
    BOLD = "\033[1m"
    RESET = "\033[0m"


def header(text: str) -> None:
    print(f"\n{Colors.CYAN}{Colors.BOLD}{'=' * 50}{Colors.RESET}")
    print(f"{Colors.CYAN}{Colors.BOLD}  {text}{Colors.RESET}")
    print(f"{Colors.CYAN}{Colors.BOLD}{'=' * 50}{Colors.RESET}\n")


def ok(text: str) -> None:
    print(f"  {Colors.GREEN}[OK]{Colors.RESET} {text}")


def fail(text: str) -> None:
    print(f"  {Colors.RED}[FAIL]{Colors.RESET} {text}")


def warn(text: str) -> None:
    print(f"  {Colors.YELLOW}[WARN]{Colors.RESET} {text}")


def info(text: str) -> None:
    print(f"  {Colors.CYAN}[INFO]{Colors.RESET} {text}")


def check_onnxruntime() -> bool:
    """Check ONNX Runtime installation and providers."""
    header("ONNX Runtime Check")
    try:
        import onnxruntime as ort
        ok(f"onnxruntime version: {ort.__version__}")
    except ImportError:
        fail("onnxruntime not installed")
        return False

    providers = ort.get_available_providers()
    info(f"Available providers: {', '.join(providers)}")

    if "QNNExecutionProvider" in providers:
        ok("QNNExecutionProvider is available (Hexagon NPU)")
        return True
    else:
        warn("QNNExecutionProvider not found - will use CPU fallback")
        warn("Install Qualcomm AI Engine Direct SDK for NPU acceleration")
        return False


def check_onnxruntime_genai() -> bool:
    """Check ONNX Runtime GenAI for LLM inference."""
    header("ONNX Runtime GenAI Check")
    try:
        import onnxruntime_genai as og
        ok(f"onnxruntime-genai available")
        return True
    except ImportError:
        warn("onnxruntime-genai not installed - LLM features unavailable")
        return False


def check_qai_hub() -> bool:
    """Check Qualcomm AI Hub SDK."""
    header("Qualcomm AI Hub Check")
    try:
        import qai_hub
        ok("qai-hub SDK available")
        try:
            devices = qai_hub.get_devices()
            snapdragon_devices = [d for d in devices if "X Elite" in str(d)]
            if snapdragon_devices:
                ok(f"Snapdragon X Elite device found: {snapdragon_devices[0]}")
            else:
                info("Snapdragon X Elite not in device list (may still work locally)")
        except Exception:
            info("Could not query AI Hub devices (API key may not be configured)")
        return True
    except ImportError:
        warn("qai-hub not installed - cloud compilation unavailable")
        return False


def check_models() -> dict:
    """Check which models are downloaded."""
    header("Model Files Check")

    expected_models = {
        "yolov8n_det.onnx": "YOLOv8 Object Detection",
        "mediapipe_face_det.onnx": "MediaPipe Face Detection",
        "arcface_w600k_r50.onnx": "ArcFace Face Recognition",
        "whisper_tiny_en.onnx": "Whisper Speech-to-Text",
        "florence2_base.onnx": "Florence-2 Scene Understanding",
    }

    status = {}
    for filename, description in expected_models.items():
        model_path = MODELS_DIR / filename
        if model_path.exists():
            size_mb = model_path.stat().st_size / (1024 * 1024)
            ok(f"{description}: {filename} ({size_mb:.1f} MB)")
            status[filename] = True
        else:
            warn(f"{description}: {filename} - NOT FOUND")
            status[filename] = False

    phi3_dir = MODELS_DIR / "phi3-mini"
    if phi3_dir.exists() and any(phi3_dir.iterdir()):
        files = list(phi3_dir.glob("*"))
        total_size = sum(f.stat().st_size for f in files if f.is_file()) / (1024 * 1024)
        ok(f"Phi-3.5 Mini LLM: {len(files)} files ({total_size:.0f} MB)")
        status["phi3-mini"] = True
    else:
        warn("Phi-3.5 Mini LLM: NOT FOUND")
        status["phi3-mini"] = False

    found = sum(1 for v in status.values() if v)
    total = len(status)
    info(f"Models found: {found}/{total}")

    return status


def benchmark_inference(qnn_available: bool) -> None:
    """Benchmark NPU vs CPU inference speed."""
    header("Inference Benchmark")

    import numpy as np

    try:
        import onnxruntime as ort
    except ImportError:
        fail("Cannot benchmark without onnxruntime")
        return

    # Find a model to benchmark with
    test_model = None
    for model_name in ["yolov8n_det.onnx", "mediapipe_face_det.onnx"]:
        path = MODELS_DIR / model_name
        if path.exists():
            test_model = path
            break

    if test_model is None:
        warn("No models available for benchmarking. Download models first.")
        info("Run: python backend/scripts/download_models.py --all")
        return

    info(f"Benchmarking with: {test_model.name}")
    num_iterations = 20
    warmup = 5

    # Create dummy input matching expected shape
    if "yolo" in test_model.name:
        dummy_input = np.random.rand(1, 3, 640, 640).astype(np.float32)
        input_name = "images"
    elif "face" in test_model.name:
        dummy_input = np.random.rand(1, 3, 128, 128).astype(np.float32)
        input_name = "input"
    else:
        dummy_input = np.random.rand(1, 3, 224, 224).astype(np.float32)
        input_name = "input"

    results = {}

    # CPU benchmark
    info("Running CPU benchmark...")
    try:
        sess_cpu = ort.InferenceSession(str(test_model), providers=["CPUExecutionProvider"])
        actual_input_name = sess_cpu.get_inputs()[0].name
        actual_shape = sess_cpu.get_inputs()[0].shape
        # Reshape input if needed
        shape = [s if isinstance(s, int) else 1 for s in actual_shape]
        dummy_input = np.random.rand(*shape).astype(np.float32)

        # Warmup
        for _ in range(warmup):
            sess_cpu.run(None, {actual_input_name: dummy_input})

        # Timed runs
        times = []
        for _ in range(num_iterations):
            start = time.perf_counter()
            sess_cpu.run(None, {actual_input_name: dummy_input})
            times.append((time.perf_counter() - start) * 1000)

        avg_cpu = sum(times) / len(times)
        min_cpu = min(times)
        results["cpu"] = avg_cpu
        ok(f"CPU avg: {avg_cpu:.1f}ms | min: {min_cpu:.1f}ms")
    except Exception as e:
        fail(f"CPU benchmark failed: {e}")

    # NPU benchmark
    if qnn_available:
        info("Running NPU (QNN) benchmark...")
        try:
            provider_options = {
                "backend_path": "QnnHtp.dll",
                "htp_performance_mode": "burst",
                "htp_graph_finalization_optimization_mode": "3",
            }
            sess_npu = ort.InferenceSession(
                str(test_model),
                providers=["QNNExecutionProvider"],
                provider_options=[provider_options],
            )
            actual_input_name = sess_npu.get_inputs()[0].name
            actual_shape = sess_npu.get_inputs()[0].shape
            shape = [s if isinstance(s, int) else 1 for s in actual_shape]
            dummy_input = np.random.rand(*shape).astype(np.float32)

            # Warmup
            for _ in range(warmup):
                sess_npu.run(None, {actual_input_name: dummy_input})

            # Timed runs
            times = []
            for _ in range(num_iterations):
                start = time.perf_counter()
                sess_npu.run(None, {actual_input_name: dummy_input})
                times.append((time.perf_counter() - start) * 1000)

            avg_npu = sum(times) / len(times)
            min_npu = min(times)
            results["npu"] = avg_npu
            ok(f"NPU avg: {avg_npu:.1f}ms | min: {min_npu:.1f}ms")

            if "cpu" in results:
                speedup = results["cpu"] / avg_npu
                ok(f"NPU speedup: {speedup:.1f}x faster than CPU")
        except Exception as e:
            fail(f"NPU benchmark failed: {e}")
    else:
        warn("Skipping NPU benchmark (QNN EP not available)")


def check_system_info() -> None:
    """Display system information."""
    header("System Information")

    import platform
    info(f"OS: {platform.system()} {platform.version()}")
    info(f"Architecture: {platform.machine()}")
    info(f"Python: {platform.python_version()}")
    info(f"Processor: {platform.processor()}")

    try:
        import cpuinfo
        cpu = cpuinfo.get_cpu_info()
        if "brand_raw" in cpu:
            info(f"CPU: {cpu['brand_raw']}")
    except ImportError:
        pass

    # Check for Snapdragon X Elite
    proc = platform.processor()
    if "Snapdragon" in proc or "Qualcomm" in proc:
        ok("Snapdragon processor detected!")
    else:
        info("Non-Snapdragon processor (NPU features may be limited)")


def main() -> None:
    header("CamerAI QNN Verification")
    print(f"  Project root: {ROOT_DIR}")
    print(f"  Models directory: {MODELS_DIR}")
    print()

    check_system_info()
    qnn_ok = check_onnxruntime()
    check_onnxruntime_genai()
    check_qai_hub()
    model_status = check_models()
    benchmark_inference(qnn_ok)

    # Summary
    header("Summary")
    if qnn_ok:
        ok("Qualcomm NPU acceleration: ENABLED")
    else:
        warn("Qualcomm NPU acceleration: DISABLED (CPU fallback)")

    models_found = sum(1 for v in model_status.values() if v)
    models_total = len(model_status)
    if models_found == models_total:
        ok(f"All models present: {models_found}/{models_total}")
    elif models_found > 0:
        warn(f"Some models missing: {models_found}/{models_total}")
        info("Run: python backend/scripts/download_models.py --all")
    else:
        fail(f"No models found: {models_found}/{models_total}")
        info("Run: python backend/scripts/download_models.py --all")

    print()
    if qnn_ok and models_found == models_total:
        print(f"  {Colors.GREEN}{Colors.BOLD}CamerAI is ready to run!{Colors.RESET}")
    elif models_found > 0:
        print(f"  {Colors.YELLOW}{Colors.BOLD}CamerAI can run with limited features.{Colors.RESET}")
    else:
        print(f"  {Colors.YELLOW}{Colors.BOLD}Download models before running CamerAI.{Colors.RESET}")
    print()


if __name__ == "__main__":
    main()
