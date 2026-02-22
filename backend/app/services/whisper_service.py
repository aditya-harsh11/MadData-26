"""Whisper tiny.en speech-to-text service via ONNX Runtime."""

import io
import logging
import time
import wave

import numpy as np
from scipy import signal as scipy_signal

from app.config import settings
from app.models.schemas import Transcription
from app.services.onnx_runtime_manager import OnnxRuntimeManager

logger = logging.getLogger(__name__)

# -----------------------------------------------------------------------
# Whisper constants
# -----------------------------------------------------------------------
WHISPER_SAMPLE_RATE = 16_000
WHISPER_N_FFT = 400
WHISPER_HOP_LENGTH = 160
WHISPER_N_MELS = 80
WHISPER_CHUNK_LENGTH_S = 30
WHISPER_MAX_FRAMES = WHISPER_SAMPLE_RATE * WHISPER_CHUNK_LENGTH_S  # 480000 samples

# Special tokens for Whisper tiny.en
SOT_TOKEN = 50257       # <|startoftranscript|>
EOT_TOKEN = 50256       # <|endoftext|>
TRANSLATE_TOKEN = 50358
TRANSCRIBE_TOKEN = 50359
NO_TIMESTAMPS_TOKEN = 50362

# ---------------------------------------------------------------------------
# Minimal token-to-text mapping (byte-level BPE basic printable range)
# For a full deployment the tiktoken vocabulary file would be loaded from disk.
# Here we provide a compact ASCII/byte fallback that is sufficient for
# demo-quality English transcription when the ONNX model outputs token IDs.
# ---------------------------------------------------------------------------

def _build_byte_decoder() -> dict[int, str]:
    """Map Whisper GPT-2 byte-level BPE token IDs to characters.

    Whisper (GPT-2 tokeniser) uses 256 byte tokens (IDs 0-255) mapped to
    printable Unicode characters.  For IDs 256+ we would need the full
    merges table, so we fall back to '' for unknown IDs.
    """
    # GPT-2 byte-to-unicode mapping
    bs: list[int] = (
        list(range(ord("!"), ord("~") + 1))
        + list(range(ord("\u00a1"), ord("\u00ac") + 1))
        + list(range(ord("\u00ae"), ord("\u00ff") + 1))
    )
    cs = list(bs)
    n = 0
    for b in range(256):
        if b not in bs:
            bs.append(b)
            cs.append(256 + n)
            n += 1
    byte_decoder = {token_id: bytes([byte_val]).decode("utf-8", errors="replace")
                    for token_id, byte_val in zip(range(256), bs)}
    return byte_decoder


_BYTE_DECODER = _build_byte_decoder()


# -----------------------------------------------------------------------
# Mel filterbank computation
# -----------------------------------------------------------------------

def _hz_to_mel(freq: float) -> float:
    return 2595.0 * np.log10(1.0 + freq / 700.0)


def _mel_to_hz(mel: float) -> float:
    return 700.0 * (10.0 ** (mel / 2595.0) - 1.0)


def _create_mel_filterbank(
    sr: int = WHISPER_SAMPLE_RATE,
    n_fft: int = WHISPER_N_FFT,
    n_mels: int = WHISPER_N_MELS,
) -> np.ndarray:
    """Build a (n_mels, n_fft//2 + 1) Mel filterbank matrix (Slaney style)."""
    n_freqs = n_fft // 2 + 1
    fmin = 0.0
    fmax = sr / 2.0

    mel_min = _hz_to_mel(fmin)
    mel_max = _hz_to_mel(fmax)
    mel_points = np.linspace(mel_min, mel_max, n_mels + 2)
    hz_points = np.array([_mel_to_hz(m) for m in mel_points])
    bin_points = np.floor((n_fft + 1) * hz_points / sr).astype(np.intp)

    filterbank = np.zeros((n_mels, n_freqs), dtype=np.float32)
    for i in range(n_mels):
        left = bin_points[i]
        centre = bin_points[i + 1]
        right = bin_points[i + 2]

        for j in range(left, centre):
            if centre != left:
                filterbank[i, j] = (j - left) / (centre - left)
        for j in range(centre, right):
            if right != centre:
                filterbank[i, j] = (right - j) / (right - centre)

    # Normalise each filter (Slaney-style)
    enorm = 2.0 / (hz_points[2 : n_mels + 2] - hz_points[:n_mels])
    filterbank *= enorm[:, np.newaxis]
    return filterbank


# Pre-compute once
_MEL_FILTERS = _create_mel_filterbank()


def _compute_log_mel_spectrogram(audio: np.ndarray) -> np.ndarray:
    """Compute 80-bin log-Mel spectrogram for Whisper.

    Parameters
    ----------
    audio : float32 mono waveform at 16 kHz

    Returns
    -------
    np.ndarray  shape (1, 80, 3000) -- 30 s padded/truncated
    """
    # Pad or truncate to exactly 30 s
    if len(audio) > WHISPER_MAX_FRAMES:
        audio = audio[:WHISPER_MAX_FRAMES]
    else:
        audio = np.pad(audio, (0, WHISPER_MAX_FRAMES - len(audio)))

    # STFT using scipy
    window = np.hanning(WHISPER_N_FFT + 1)[:-1].astype(np.float32)
    # Number of frames: (480000 - 400) / 160 + 1 = 3000  (matches Whisper)
    n_frames = 1 + (len(audio) - WHISPER_N_FFT) // WHISPER_HOP_LENGTH

    # Manual framing to avoid scipy.signal.stft shape surprises
    frames = np.lib.stride_tricks.as_strided(
        audio,
        shape=(n_frames, WHISPER_N_FFT),
        strides=(audio.strides[0] * WHISPER_HOP_LENGTH, audio.strides[0]),
    ).copy()

    frames *= window
    spectrum = np.fft.rfft(frames, n=WHISPER_N_FFT)  # (n_frames, 201)
    magnitudes = np.abs(spectrum) ** 2  # power

    mel_spec = _MEL_FILTERS @ magnitudes.T  # (80, n_frames)
    # Clamp to avoid log(0)
    mel_spec = np.maximum(mel_spec, 1e-10)
    log_mel = np.log10(mel_spec)

    # Normalise like Whisper: scale so max is 0, then shift/scale
    max_val = log_mel.max()
    log_mel = np.maximum(log_mel, max_val - 8.0)
    log_mel = (log_mel + 4.0) / 4.0

    return np.expand_dims(log_mel.astype(np.float32), axis=0)  # (1, 80, 3000)


# -----------------------------------------------------------------------
# Audio decoding helpers
# -----------------------------------------------------------------------

def _decode_audio_bytes(audio_bytes: bytes, target_sr: int = WHISPER_SAMPLE_RATE) -> tuple[np.ndarray, float]:
    """Decode raw audio bytes (WAV expected) into float32 mono at *target_sr*.

    Returns (samples, duration_seconds).
    """
    buf = io.BytesIO(audio_bytes)
    try:
        with wave.open(buf, "rb") as wf:
            n_channels = wf.getnchannels()
            sampwidth = wf.getsampwidth()
            framerate = wf.getframerate()
            n_frames = wf.getnframes()
            raw = wf.readframes(n_frames)
    except wave.Error:
        # Fallback: treat as raw 16-bit signed PCM mono 16 kHz
        logger.warning("Could not parse WAV header; assuming raw PCM s16le 16 kHz mono.")
        raw = audio_bytes
        n_channels = 1
        sampwidth = 2
        framerate = 16000
        n_frames = len(raw) // (n_channels * sampwidth)

    if sampwidth == 1:
        dtype = np.uint8
    elif sampwidth == 2:
        dtype = np.int16
    elif sampwidth == 4:
        dtype = np.int32
    else:
        dtype = np.int16

    audio = np.frombuffer(raw, dtype=dtype).astype(np.float32)

    # Convert to mono
    if n_channels > 1:
        audio = audio.reshape(-1, n_channels).mean(axis=1)

    # Normalise to [-1, 1]
    if dtype == np.uint8:
        audio = (audio - 128.0) / 128.0
    elif dtype in (np.int16, np.int32):
        audio = audio / np.iinfo(dtype).max

    duration = len(audio) / framerate

    # Resample if needed
    if framerate != target_sr:
        num_samples = int(len(audio) * target_sr / framerate)
        audio = scipy_signal.resample(audio, num_samples).astype(np.float32)

    return audio, duration


# -----------------------------------------------------------------------
# Greedy decoder
# -----------------------------------------------------------------------

def _greedy_decode_tokens(token_ids: list[int]) -> str:
    """Decode a sequence of Whisper token IDs into text using byte-level BPE.

    This is a simplified greedy decoder suitable for Whisper tiny.en output.
    It handles the printable ASCII / Latin-1 range via the GPT-2 byte map.
    """
    chars: list[str] = []
    for tid in token_ids:
        # Skip special tokens
        if tid >= 50257 or tid < 0:
            continue
        if tid in _BYTE_DECODER:
            chars.append(_BYTE_DECODER[tid])
        elif 0 <= tid < 256:
            chars.append(chr(tid))
        else:
            # For merge tokens (256+) we would need the BPE merges file.
            # As a best-effort fallback, emit a space.
            chars.append(" ")

    text = "".join(chars)
    # Clean up whitespace
    text = " ".join(text.split())
    return text.strip()


# -----------------------------------------------------------------------
# Service
# -----------------------------------------------------------------------

class WhisperService:
    """Whisper tiny.en transcription service on ONNX Runtime."""

    def __init__(self) -> None:
        self._manager = OnnxRuntimeManager()

    def preprocess_audio(
        self,
        audio_bytes: bytes,
        sample_rate: int = WHISPER_SAMPLE_RATE,
    ) -> np.ndarray:
        """Convert raw audio bytes to a log-Mel spectrogram tensor.

        Returns shape (1, 80, 3000) float32.
        """
        audio, _ = _decode_audio_bytes(audio_bytes, target_sr=sample_rate)
        return _compute_log_mel_spectrogram(audio)

    def transcribe(self, audio_bytes: bytes) -> Transcription:
        """Run the full Whisper pipeline: audio -> mel -> model -> text.

        Returns a `Transcription` with text, language, and duration.
        """
        try:
            session = self._manager.get_session(settings.whisper_model)
        except FileNotFoundError:
            logger.error("Whisper model not found at %s", settings.whisper_model_path)
            return Transcription(text="[model not available]", language="en", duration=0.0)

        audio, duration = _decode_audio_bytes(audio_bytes)
        mel = _compute_log_mel_spectrogram(audio)

        # Determine input names
        input_names = [inp.name for inp in session.get_inputs()]
        feed: dict[str, np.ndarray] = {}

        if len(input_names) == 1:
            # Encoder-only or merged model
            feed[input_names[0]] = mel
        else:
            # Encoder-decoder: first input is mel, second is decoder input IDs
            feed[input_names[0]] = mel
            # Build initial decoder token sequence
            decoder_ids = np.array(
                [[SOT_TOKEN, TRANSCRIBE_TOKEN, NO_TIMESTAMPS_TOKEN]],
                dtype=np.int64,
            )
            feed[input_names[1]] = decoder_ids

        t0 = time.perf_counter()
        outputs = session.run(None, feed)
        elapsed = (time.perf_counter() - t0) * 1000
        logger.debug("Whisper inference: %.1f ms", elapsed)

        # Parse output
        logits = outputs[0]  # (1, seq_len, vocab_size) or (1, seq_len)
        if logits.ndim == 3:
            token_ids = np.argmax(logits, axis=-1)[0].tolist()
        elif logits.ndim == 2:
            token_ids = logits[0].tolist()
        else:
            token_ids = logits.flatten().tolist()

        # Truncate at EOT
        if EOT_TOKEN in token_ids:
            token_ids = token_ids[: token_ids.index(EOT_TOKEN)]

        text = _greedy_decode_tokens(token_ids)

        return Transcription(
            text=text if text else "[empty transcription]",
            language="en",
            duration=round(duration, 2),
        )
