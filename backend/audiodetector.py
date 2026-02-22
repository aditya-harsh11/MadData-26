"""
AudioDetector — YamNet ONNX inference for audio classification.

Runs on Qualcomm NPU via onnxruntime-qnn, falls back to DML or CPU.
Computes mel-spectrogram with pure numpy (no librosa dependency).

YamNet input:  (batch, 1, 96, 64) — 0.96s mel-spectrogram patches
YamNet output: (batch, 521) — logits over AudioSet classes
"""

import csv
import time
import logging
import base64
from pathlib import Path

import numpy as np

logger = logging.getLogger("arcflow.audiodetector")

# ─── Mel-spectrogram constants ───
SAMPLE_RATE = 16000
STFT_WINDOW = 400       # 25ms at 16kHz
STFT_HOP = 160          # 10ms at 16kHz
STFT_NFFT = 512
MEL_BANDS = 64
MEL_FMIN = 125.0
MEL_FMAX = 7500.0
PATCH_FRAMES = 96        # YamNet expects 96 frames per patch
PATCH_HOP = 48           # Overlap patches by half


def _hz_to_mel(hz: float) -> float:
    return 2595.0 * np.log10(1.0 + hz / 700.0)


def _mel_to_hz(mel: float) -> float:
    return 700.0 * (10.0 ** (mel / 2595.0) - 1.0)


def _build_mel_filterbank(
    num_mels: int, nfft: int, sr: int, fmin: float, fmax: float
) -> np.ndarray:
    """Build a mel filterbank matrix: (num_mels, nfft//2 + 1)."""
    mel_min = _hz_to_mel(fmin)
    mel_max = _hz_to_mel(fmax)
    mels = np.linspace(mel_min, mel_max, num_mels + 2)
    hz_points = np.array([_mel_to_hz(m) for m in mels])
    bin_points = np.floor((nfft + 1) * hz_points / sr).astype(int)

    n_freqs = nfft // 2 + 1
    filterbank = np.zeros((num_mels, n_freqs), dtype=np.float32)

    for i in range(num_mels):
        left = bin_points[i]
        center = bin_points[i + 1]
        right = bin_points[i + 2]

        for j in range(left, center):
            if center != left:
                filterbank[i, j] = (j - left) / (center - left)
        for j in range(center, right):
            if right != center:
                filterbank[i, j] = (right - j) / (right - center)

    return filterbank


def _stft_magnitude(signal: np.ndarray, window_len: int, hop: int, nfft: int) -> np.ndarray:
    """Compute STFT magnitude spectrogram using numpy. Returns (n_frames, nfft//2+1)."""
    window = np.hanning(window_len).astype(np.float32)
    # Pad signal if needed
    n_frames = max(1, 1 + (len(signal) - window_len) // hop)
    pad_len = (n_frames - 1) * hop + window_len
    if len(signal) < pad_len:
        signal = np.pad(signal, (0, pad_len - len(signal)))

    frames = np.stack([
        signal[i * hop : i * hop + window_len] * window
        for i in range(n_frames)
    ])
    spectrum = np.fft.rfft(frames, n=nfft)
    return np.abs(spectrum)


# Pre-build the mel filterbank (singleton)
_mel_fb: np.ndarray | None = None


def _get_mel_fb() -> np.ndarray:
    global _mel_fb
    if _mel_fb is None:
        _mel_fb = _build_mel_filterbank(MEL_BANDS, STFT_NFFT, SAMPLE_RATE, MEL_FMIN, MEL_FMAX)
    return _mel_fb


def _softmax(x: np.ndarray) -> np.ndarray:
    e = np.exp(x - np.max(x, axis=-1, keepdims=True))
    return e / np.sum(e, axis=-1, keepdims=True)


class AudioDetector:
    """YamNet ONNX audio classifier."""

    def __init__(
        self,
        model_path: str,
        labels_path: str,
        confidence: float = 0.15,
        use_cpu: bool = False,
    ):
        self.confidence = confidence
        self.session = None
        self._loaded = False
        self._use_cpu = use_cpu
        self.labels: list[str] = []

        self._load_labels(labels_path)

        if Path(model_path).exists():
            self._load_model(model_path)
        else:
            logger.warning(f"YamNet model not found at {model_path}")

    def _load_labels(self, csv_path: str):
        """Parse yamnet_class_map.csv into display_name list."""
        path = Path(csv_path)
        if not path.exists():
            logger.warning(f"YamNet labels not found at {csv_path}")
            return

        with open(path, "r", encoding="utf-8") as f:
            reader = csv.reader(f)
            header = next(reader, None)
            # CSV columns: index, mid, display_name
            for row in reader:
                if len(row) >= 3:
                    self.labels.append(row[2].strip())

        logger.info(f"Loaded {len(self.labels)} YamNet class labels")

    def _load_model(self, path: str):
        """Load ONNX model with QNN > DML > CPU provider chain."""
        try:
            import onnxruntime as ort

            providers = ort.get_available_providers()
            logger.info(f"Available ONNX providers: {providers}")

            provider_options = []
            preferred = []

            if self._use_cpu:
                logger.info("CPU-only mode for AudioDetector")
                preferred.append("CPUExecutionProvider")
                provider_options.append({})
            else:
                if "QNNExecutionProvider" in providers:
                    preferred.append("QNNExecutionProvider")
                    cache_dir = Path(path).parent / "qnn_cache"
                    cache_dir.mkdir(exist_ok=True)
                    ctx_binary = str(cache_dir / (Path(path).stem + "_ctx.onnx"))
                    qnn_opts = {
                        "backend_path": "QnnHtp.dll",
                        "htp_performance_mode": "burst",
                        "htp_graph_finalization_optimization_mode": "3",
                        "enable_htp_fp16_precision": "1",
                        "ep_context_enable": "1",
                        "ep_context_file_path": ctx_binary,
                    }
                    if Path(ctx_binary).exists():
                        logger.info(f"Loading cached QNN context: {ctx_binary}")
                        path = ctx_binary
                    provider_options.append(qnn_opts)

                if "DmlExecutionProvider" in providers:
                    preferred.append("DmlExecutionProvider")
                    provider_options.append({})

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

            active = self.session.get_providers()
            input_info = self.session.get_inputs()[0]
            output_info = [o.name for o in self.session.get_outputs()]

            logger.info(f"AudioDetector model loaded: {path}")
            logger.info(f"  Active providers: {active}")
            logger.info(f"  Input: {input_info.name} {input_info.shape}")
            logger.info(f"  Outputs: {output_info}")
        except Exception as e:
            logger.error(f"Failed to load AudioDetector model: {e}")
            self._loaded = False

    @property
    def loaded(self) -> bool:
        return self._loaded

    def _preprocess(self, pcm: np.ndarray) -> np.ndarray:
        """Convert 16kHz PCM float32 to mel-spectrogram patches for YamNet.
        Returns shape (N, 1, 96, 64).
        """
        # Compute STFT magnitude
        mag = _stft_magnitude(pcm, STFT_WINDOW, STFT_HOP, STFT_NFFT)
        # mag shape: (n_frames, 257)

        # Apply mel filterbank
        mel_fb = _get_mel_fb()
        mel_spec = mag @ mel_fb.T  # (n_frames, 64)

        # Log scale
        mel_spec = np.log(mel_spec + 0.001)

        # Frame into 96-frame patches
        n_frames = mel_spec.shape[0]
        patches = []
        start = 0
        while start + PATCH_FRAMES <= n_frames:
            patch = mel_spec[start : start + PATCH_FRAMES]  # (96, 64)
            patches.append(patch)
            start += PATCH_HOP

        if len(patches) == 0:
            # Pad to minimum size
            padded = np.zeros((PATCH_FRAMES, MEL_BANDS), dtype=np.float32)
            padded[:n_frames] = mel_spec[:PATCH_FRAMES]
            patches.append(padded)

        batch = np.stack(patches)  # (N, 96, 64)
        batch = batch[:, np.newaxis, :, :]  # (N, 1, 96, 64)
        return batch.astype(np.float32)

    def classify(self, pcm: np.ndarray, top_n: int = 10) -> list[dict]:
        """Run classification on PCM float32 array. Returns top-N results."""
        if not self._loaded or self.session is None:
            return []

        t0 = time.perf_counter()

        patches = self._preprocess(pcm)  # (N, 1, 96, 64)
        input_name = self.session.get_inputs()[0].name

        # YamNet only accepts batch=1 — run each patch individually
        all_probs = []
        for i in range(patches.shape[0]):
            single = patches[i : i + 1]  # (1, 1, 96, 64)
            outputs = self.session.run(None, {input_name: single})
            logits = outputs[0]  # (1, 521)
            probs = _softmax(logits)
            all_probs.append(probs[0])

        # Average across patches
        avg_probs = np.mean(np.stack(all_probs), axis=0)  # (521,)

        # Top-N above confidence threshold
        top_indices = np.argsort(avg_probs)[::-1][:top_n]
        results = []
        for idx in top_indices:
            conf = float(avg_probs[idx])
            if conf < self.confidence:
                break
            label = self.labels[idx] if idx < len(self.labels) else f"class_{idx}"
            results.append({"label": label, "confidence": round(conf, 4)})

        dt = (time.perf_counter() - t0) * 1000
        logger.debug(f"AudioDetector inference: {dt:.1f}ms, {len(results)} detections")

        return results

    def classify_from_base64(self, b64_str: str, top_n: int = 10) -> list[dict]:
        """Decode base64 float32 PCM and classify."""
        raw = base64.b64decode(b64_str)
        pcm = np.frombuffer(raw, dtype=np.float32)
        return self.classify(pcm, top_n)
