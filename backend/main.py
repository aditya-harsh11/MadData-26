"""
arcflow Backend — FastAPI server with WebSocket pipeline.

Visual LLM architecture:
  On-demand VLM analysis via Nexa SDK, triggered by frontend interval timer.
  Single model (OmniNeural-4B) handles both vision and text-only requests.

Communicates with the Electron/Next.js frontend via WebSocket.
"""

import asyncio
import json
import logging
import os
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from reasoning import ReasoningBrain
from watchdog import Watchdog
from audiodetector import AudioDetector

# ─── Qualcomm AI Hub Configuration ───
QAI_HUB_TOKEN = os.environ.get("QAI_HUB_API_TOKEN", "fi3l2clm1oimw3f1aj3fl6zthbqtihxftki0z894")
try:
    import qai_hub
    qai_hub.set_session_token(QAI_HUB_TOKEN)
except (ImportError, Exception):
    pass

# ─── Nexa NPU License ───
NEXA_LICENSE = os.environ.get(
    "NEXA_TOKEN",
    "key/eyJhY2NvdW50Ijp7ImlkIjoiNDI1Y2JiNWQtNjk1NC00NDYxLWJiOWMtYzhlZjBiY2JlYzA2In0sInByb2R1Y3QiOnsiaWQiOiIxNDY0ZTk1MS04MGM5LTRjN2ItOWZmYS05MmYyZmQzNmE5YTMifSwicG9saWN5Ijp7ImlkIjoiYzI1YjE3OTUtNTY0OC00NGY1LTgxMmUtNGQ3ZWM3ZjFjYWI0IiwiZHVyYXRpb24iOjI1OTIwMDB9LCJ1c2VyIjp7ImlkIjoiZDI2MGIwZjAtMjRkNy00NWQ0LThkMzUtZmJhODQ5NGI4YTdjIiwiZW1haWwiOiJuaXNoYWRzY3JhdGNoQGdtYWlsLmNvbSJ9LCJsaWNlbnNlIjp7ImlkIjoiN2JkNjlkNmUtOTk1NC00OGY2LTgxNWEtOTIyZTZhNTE0ZmY1IiwiY3JlYXRlZCI6IjIwMjYtMDItMjFUMjM6Mzk6MjguNDgyWiIsImV4cGlyeSI6IjIwMjYtMDMtMjNUMjM6Mzk6MjguNDgyWiJ9fQ==.igYAIuiLvyKcDKR2CHo3lsmc1pungm4BbfMO5dxXwq3z3GlDT55YnTeo7GkqAydwUYQtwN_fS9XcjcvyMvNHBA==",
)
os.environ["NEXA_TOKEN"] = NEXA_LICENSE

# ─── Logging ───
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("arcflow")

# ─── AI Engine ───
brain = ReasoningBrain()

# ─── YOLO Object Detection ───
_watchdog: Watchdog | None = None

def _get_watchdog() -> Watchdog | None:
    global _watchdog
    if _watchdog is None:
        model_dir = Path(__file__).parent / "models"
        model_path = model_dir / "yolov8n.onnx"
        if model_path.exists():
            try:
                _watchdog = Watchdog(str(model_path), confidence=0.45, use_cpu=True)
                logger.info(f"Watchdog loaded from {model_path}")
            except Exception as e:
                logger.warning(f"Could not load Watchdog: {e}")
        else:
            logger.warning(f"YOLO model not found at {model_path}")
    return _watchdog

# ─── YamNet Audio Detection ───
_audio_detector: AudioDetector | None = None

def _get_audio_detector() -> AudioDetector | None:
    global _audio_detector
    if _audio_detector is None:
        model_dir = Path(__file__).parent / "models"
        model_path = model_dir / "yamnet.onnx"
        labels_path = model_dir / "yamnet_class_map.csv"
        if model_path.exists() and labels_path.exists():
            try:
                _audio_detector = AudioDetector(
                    str(model_path), str(labels_path), confidence=0.15, use_cpu=True
                )
                logger.info(f"AudioDetector loaded from {model_path}")
            except Exception as e:
                logger.warning(f"Could not load AudioDetector: {e}")
        else:
            logger.warning(f"YamNet model or labels not found in {model_dir}")
    return _audio_detector

DEFAULT_PROMPT = "Describe what you see. If there is any safety concern, explain it."


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup / shutdown lifecycle."""
    logger.info("=" * 50)
    logger.info("  arcflow Backend Starting")
    logger.info("=" * 50)

    loop = asyncio.get_event_loop()

    async def _load_brain():
        try:
            await loop.run_in_executor(None, brain.load_vlm)
        except Exception as e:
            logger.warning(f"Could not load VLM: {e}")
        brain.load_llm()
        logger.info(f"VLM loaded: {brain.vlm_loaded}, LLM loaded: {brain.llm_loaded}")

    asyncio.create_task(_load_brain())

    if not os.environ.get("ARCFLOW_SMTP_USER"):
        logger.warning("ARCFLOW_SMTP_USER not set — Email node will not work")
    if not os.environ.get("TWILIO_ACCOUNT_SID"):
        logger.warning("TWILIO_ACCOUNT_SID not set — SMS node will not work")

    logger.info("Backend ready — waiting for WebSocket connections")

    yield

    brain.shutdown()
    logger.info("Backend shutting down")


app = FastAPI(title="arcflow Backend", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Health Check ───
@app.get("/health")
async def health():
    return {
        "status": "ok",
        "vlm_loaded": brain.vlm_loaded,
    }


# ─── WebSocket Pipeline ───
class ConnectionManager:
    def __init__(self):
        self.active: dict[str, WebSocket] = {}

    async def connect(self, ws: WebSocket) -> str:
        await ws.accept()
        cid = str(uuid.uuid4())[:8]
        self.active[cid] = ws
        logger.info(f"Client connected: {cid} (total: {len(self.active)})")
        return cid

    def disconnect(self, cid: str):
        self.active.pop(cid, None)
        logger.info(f"Client disconnected: {cid} (total: {len(self.active)})")

    async def send(self, cid: str, msg_type: str, payload: dict):
        ws = self.active.get(cid)
        if ws:
            try:
                await ws.send_json({"type": msg_type, "payload": payload})
            except Exception:
                self.disconnect(cid)


manager = ConnectionManager()

# ─── Per-client state ───
_client_state: dict[str, dict] = {}


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    cid = await manager.connect(ws)

    _client_state[cid] = {
        "latest_frames": {},  # node_id -> latest base64 frame
    }

    try:
        while True:
            raw = await ws.receive_text()
            msg = json.loads(raw)
            msg_type = msg.get("type")
            payload = msg.get("payload", {})

            if msg_type == "frame":
                await handle_frame(cid, payload)
            elif msg_type == "detect":
                await handle_detect(cid, payload)
            elif msg_type == "vlm_analyze":
                await handle_vlm_analyze(cid, payload)
            elif msg_type == "text_gen":
                await handle_text_gen(cid, payload)
            elif msg_type == "describe_workflow":
                await handle_describe_workflow(cid, payload)
            elif msg_type == "audio_analyze":
                await handle_audio_analyze(cid, payload)
            elif msg_type == "audio_llm_analyze":
                await handle_audio_llm_analyze(cid, payload)
            elif msg_type == "generate_workflow":
                await handle_generate_workflow(cid, payload)
            elif msg_type == "send_email":
                await handle_send_email(cid, payload)
            elif msg_type == "send_sms":
                await handle_send_sms(cid, payload)
            else:
                logger.warning(f"Unknown message type: {msg_type}")

    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.error(f"WebSocket error ({cid}): {e}")
    finally:
        _client_state.pop(cid, None)
        brain.clear_client(cid)
        manager.disconnect(cid)


# ─── Frame handler (store latest frame) ───

async def handle_frame(cid: str, payload: dict):
    """Store the latest frame from a camera node."""
    image_b64 = payload.get("image", "")
    node_id = payload.get("node_id", "")

    if not image_b64 or not node_id:
        return

    if cid in _client_state:
        _client_state[cid]["latest_frames"][node_id] = image_b64


# ─── YOLO detect handler ───

async def handle_detect(cid: str, payload: dict):
    """Run YOLO object detection on a frame."""
    import time

    image_b64 = payload.get("image", "")
    node_id = payload.get("node_id", "")
    conf = payload.get("confidence", 0.45)

    if not image_b64:
        await manager.send(cid, "detection_result", {
            "node_id": node_id,
            "detections": [],
            "latency_ms": 0,
        })
        return

    watchdog = _get_watchdog()
    if watchdog is None or not watchdog.loaded:
        await manager.send(cid, "detection_result", {
            "node_id": node_id,
            "detections": [],
            "latency_ms": 0,
            "error": "YOLO model not loaded",
        })
        return

    loop = asyncio.get_event_loop()
    watchdog.confidence = conf

    t0 = time.perf_counter()
    detections = await loop.run_in_executor(
        None, watchdog.detect_from_base64, image_b64
    )
    latency = (time.perf_counter() - t0) * 1000

    await manager.send(cid, "detection_result", {
        "node_id": node_id,
        "detections": detections,
        "latency_ms": round(latency, 1),
    })


# ─── Audio analyze handler ───

async def handle_audio_analyze(cid: str, payload: dict):
    """Run YamNet audio classification on a PCM chunk."""
    import time

    audio_b64 = payload.get("audio", "")
    node_id = payload.get("node_id", "")
    conf = payload.get("confidence", 0.15)

    if not audio_b64:
        await manager.send(cid, "audio_result", {
            "node_id": node_id,
            "detections": [],
            "latency_ms": 0,
        })
        return

    detector = _get_audio_detector()
    if detector is None or not detector.loaded:
        await manager.send(cid, "audio_result", {
            "node_id": node_id,
            "detections": [],
            "latency_ms": 0,
            "error": "YamNet model not loaded",
        })
        return

    loop = asyncio.get_event_loop()
    detector.confidence = conf

    t0 = time.perf_counter()
    detections = await loop.run_in_executor(
        None, detector.classify_from_base64, audio_b64
    )
    latency = (time.perf_counter() - t0) * 1000

    await manager.send(cid, "audio_result", {
        "node_id": node_id,
        "detections": detections,
        "latency_ms": round(latency, 1),
    })


# ─── Audio LLM handler ───

async def handle_audio_llm_analyze(cid: str, payload: dict):
    """Run OmniNeural-4B on audio with a text prompt."""
    audio_b64 = payload.get("audio", "")
    prompt = payload.get("prompt", "Describe what you hear.")
    node_id = payload.get("node_id", "")

    if not audio_b64:
        await manager.send(cid, "audio_llm_result", {
            "node_id": node_id,
            "analysis": "[No audio available]",
            "latency_ms": 0,
        })
        return

    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(
        None, brain.analyze_audio, audio_b64, prompt, cid
    )

    await manager.send(cid, "audio_llm_result", {
        "node_id": node_id,
        "analysis": result.get("analysis", ""),
        "latency_ms": result.get("latency_ms", 0),
    })


# ─── VLM analyze handler ───

async def handle_vlm_analyze(cid: str, payload: dict):
    """Run VLM analysis on a frame with a specific prompt, addressed to a node."""
    image_b64 = payload.get("image", "")
    prompt = payload.get("prompt", DEFAULT_PROMPT)
    node_id = payload.get("node_id", "")

    if not image_b64:
        await manager.send(cid, "vlm_result", {
            "node_id": node_id,
            "analysis": "[No frame available]",
            "latency_ms": 0,
        })
        return

    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(
        None, brain.analyze_frame, image_b64, prompt, cid
    )

    await manager.send(cid, "vlm_result", {
        "node_id": node_id,
        "analysis": result.get("analysis", ""),
        "latency_ms": result.get("latency_ms", 0),
    })


# ─── Text generation handler ───

async def handle_text_gen(cid: str, payload: dict):
    """Text generation via OmniNeural-4B (text-only, no image)."""
    prompt = payload.get("prompt", "")
    node_id = payload.get("node_id", "")

    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(None, brain.generate_text, prompt)

    await manager.send(cid, "text_gen_result", {
        "node_id": node_id,
        **result,
    })


# ─── Email & SMS actions ───

def _send_email_sync(to: str, subject: str, body: str) -> dict:
    """Send email via SMTP (blocking). Returns {success, error?}."""
    import smtplib
    from email.mime.text import MIMEText

    smtp_user = os.environ.get("ARCFLOW_SMTP_USER", "")
    smtp_pass = os.environ.get("ARCFLOW_SMTP_PASS", "")
    smtp_host = os.environ.get("ARCFLOW_SMTP_HOST", "smtp.gmail.com")
    smtp_port = int(os.environ.get("ARCFLOW_SMTP_PORT", "587"))

    if not smtp_user or not smtp_pass:
        return {"success": False, "error": "SMTP credentials not configured (set ARCFLOW_SMTP_USER and ARCFLOW_SMTP_PASS)"}

    msg = MIMEText(body)
    msg["Subject"] = subject
    msg["From"] = smtp_user
    msg["To"] = to

    try:
        with smtplib.SMTP(smtp_host, smtp_port, timeout=15) as server:
            server.starttls()
            server.login(smtp_user, smtp_pass)
            server.sendmail(smtp_user, [to], msg.as_string())
        return {"success": True}
    except Exception as e:
        return {"success": False, "error": str(e)}


async def handle_send_email(cid: str, payload: dict):
    to = payload.get("to", "")
    subject = payload.get("subject", "arcflow Alert")
    body = payload.get("body", "")
    node_id = payload.get("node_id", "")

    if not to:
        await manager.send(cid, "email_result", {"node_id": node_id, "success": False, "error": "No recipient"})
        return

    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(None, _send_email_sync, to, subject, body)
    await manager.send(cid, "email_result", {"node_id": node_id, **result})


def _send_sms_sync(to: str, body: str) -> dict:
    """Send SMS via Twilio (blocking). Returns {success, error?}."""
    account_sid = os.environ.get("TWILIO_ACCOUNT_SID", "")
    auth_token = os.environ.get("TWILIO_AUTH_TOKEN", "")
    from_number = os.environ.get("TWILIO_FROM_NUMBER", "")

    if not account_sid or not auth_token or not from_number:
        return {"success": False, "error": "Twilio credentials not configured (set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER)"}

    try:
        from twilio.rest import Client
        client = Client(account_sid, auth_token)
        client.messages.create(body=body, from_=from_number, to=to)
        return {"success": True}
    except ImportError:
        return {"success": False, "error": "twilio package not installed (pip install twilio)"}
    except Exception as e:
        return {"success": False, "error": str(e)}


async def handle_send_sms(cid: str, payload: dict):
    to = payload.get("to", "")
    body = payload.get("body", "")
    node_id = payload.get("node_id", "")

    if not to:
        await manager.send(cid, "sms_result", {"node_id": node_id, "success": False, "error": "No phone number"})
        return

    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(None, _send_sms_sync, to, body)
    await manager.send(cid, "sms_result", {"node_id": node_id, **result})


# ─── Describe workflow (AI-generated summary) ───

NODE_TYPE_LABELS = {
    "camera": "Camera",
    "detection": "Object Detect",
    "visualLlm": "Visual LLM",
    "logic": "Logic",
    "llm": "LLM",
    "soundAction": "Sound Alert",
    "logAction": "Log",
    "notifyAction": "Notification",
    "screenshotAction": "Screenshot",
    "webhookAction": "Webhook",
    "emailAction": "Email",
    "smsAction": "SMS",
    "mic": "Microphone",
    "audioDetect": "Audio Detect",
    "audioLlm": "Audio LLM",
    "video": "Video Input",
}


def _workflow_to_prompt(nodes: list, edges: list) -> str:
    """Turn nodes/edges into a short structured description for the LLM."""
    lines = ["Pipeline structure:"]
    for n in nodes:
        nid = n.get("id", "?")
        ntype = n.get("type", "?")
        label = NODE_TYPE_LABELS.get(ntype, ntype)
        lines.append(f"  - Node {nid}: {label} ({ntype})")
    lines.append("Connections:")
    for e in edges:
        src = e.get("source", "?")
        tgt = e.get("target", "?")
        lines.append(f"  - {src} → {tgt}")
    return "\n".join(lines)


async def handle_describe_workflow(cid: str, payload: dict):
    """Generate an AI-written description of the current workflow."""
    nodes = payload.get("nodes") or []
    edges = payload.get("edges") or []
    if not nodes and not edges:
        await manager.send(cid, "workflow_description", {
            "description": "The pipeline has no nodes or connections yet.",
            "error": None,
        })
        return

    structure = _workflow_to_prompt(nodes, edges)
    prompt = (
        "You are a technical writer. In 2–4 short paragraphs, describe this pipeline "
        "in plain language: what each node does, how data flows, and what the workflow "
        "achieves overall. Be clear and concise.\n\n"
        + structure
    )

    try:
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None,
            lambda: brain.generate_text(prompt, max_tokens=512),
        )
        description = result.get("text", "").strip()
        if not description:
            description = "Could not generate description."
        await manager.send(cid, "workflow_description", {
            "description": description,
            "error": None,
        })
    except Exception as e:
        logger.exception("describe_workflow failed: %s", e)
        await manager.send(cid, "workflow_description", {
            "description": "",
            "error": str(e),
        })


# ─── Generate workflow from text (AI creates nodes + edges) ───

VALID_NODE_TYPES = {"camera", "video", "detection", "visualLlm", "logic", "llm", "soundAction", "logAction", "notifyAction", "screenshotAction", "webhookAction", "emailAction", "smsAction", "mic", "audioDetect", "audioLlm"}

GENERATE_WORKFLOW_PROMPT = """Output ONLY a single line of compact JSON. No newlines inside the JSON. No indentation. No markdown. No explanation.

RULES:
- SEE/watch/look/detect objects → camera + visualLlm
- HEAR/listen/sound/speech/music → mic + audioLlm
- camera "frames" → visualLlm "camera" or detection "camera" ONLY
- mic "audio" → audioLlm "audio" or audioDetect "audio" ONLY
- NEVER connect camera→audioLlm or mic→visualLlm
- action node types: sound/alarm→"soundAction", notify/tell me→"notifyAction", log/record→"logAction", webhook→"webhookAction", screenshot/capture→"screenshotAction", email→"emailAction", sms/text→"smsAction"
- KEYWORD in AI prompt MUST match logic condition value

Node data: camera:{}, mic:{}, visualLlm:{"prompt":"...Say KEYWORD if...","interval":5}, audioLlm:{"prompt":"...Say KEYWORD if...","listenDuration":3}, detection:{"confidence":45,"interval":2}, audioDetect:{"confidence":15,"interval":2}, logic:{"conditions":[{"id":"1","operator":"contains","value":"KEYWORD"}],"mode":"any"}, soundAction:{}, logAction:{}, notifyAction:{}, webhookAction:{"webhookUrl":""}, screenshotAction:{}, emailAction:{"emailTo":"","emailSubject":"arcflow Alert"}, smsAction:{"smsTo":""}

Pattern: input→AI→logic→action (4 nodes, 3 edges). You can connect multiple action nodes from one logic output.

Example "watch for dogs and play sound":
{"nodes":[{"id":"camera-1","type":"camera","data":{}},{"id":"vlm-1","type":"visualLlm","data":{"prompt":"Look carefully. Say 'dog detected' if you see a dog.","interval":5}},{"id":"logic-1","type":"logic","data":{"conditions":[{"id":"1","operator":"contains","value":"dog detected"}],"mode":"any"}},{"id":"sound-1","type":"soundAction","data":{}}],"edges":[{"source":"camera-1","target":"vlm-1","sourceHandle":"frames","targetHandle":"camera"},{"source":"vlm-1","target":"logic-1","sourceHandle":"response","targetHandle":"input"},{"source":"logic-1","target":"sound-1","sourceHandle":"match","targetHandle":"trigger"}]}

Example "notify when music playing":
{"nodes":[{"id":"mic-1","type":"mic","data":{}},{"id":"audio-llm-1","type":"audioLlm","data":{"prompt":"Listen carefully. Say 'music detected' if you hear music.","listenDuration":3}},{"id":"logic-1","type":"logic","data":{"conditions":[{"id":"1","operator":"contains","value":"music detected"}],"mode":"any"}},{"id":"notify-1","type":"notifyAction","data":{}}],"edges":[{"source":"mic-1","target":"audio-llm-1","sourceHandle":"audio","targetHandle":"audio"},{"source":"audio-llm-1","target":"logic-1","sourceHandle":"response","targetHandle":"input"},{"source":"logic-1","target":"notify-1","sourceHandle":"match","targetHandle":"trigger"}]}

IDs: camera-1, mic-1, vlm-1, detect-1, logic-1, sound-1, log-1, notify-1, screenshot-1, webhook-1, email-1, sms-1, audio-llm-1, audio-detect-1, llm-1
Now generate the JSON for the user's request. Do NOT output empty arrays. You MUST include real nodes and edges."""


# Valid connections: (source_type, sourceHandle) → set of (target_type, targetHandle)
_ACTION_TRIGGERS = {
    ("soundAction", "trigger"), ("logAction", "trigger"), ("notifyAction", "trigger"),
    ("screenshotAction", "trigger"), ("webhookAction", "trigger"),
    ("emailAction", "trigger"), ("smsAction", "trigger"),
}

_VALID_CONNECTIONS: dict[tuple[str, str], set[tuple[str, str]]] = {
    ("camera", "frames"):       {("visualLlm", "camera"), ("detection", "camera"), ("screenshotAction", "camera")},
    ("video", "frames"):        {("visualLlm", "camera"), ("detection", "camera"), ("screenshotAction", "camera")},
    ("mic", "audio"):           {("audioLlm", "audio"), ("audioDetect", "audio")},
    ("visualLlm", "response"):  {("logic", "input"), ("llm", "input")} | _ACTION_TRIGGERS,
    ("audioLlm", "response"):   {("logic", "input"), ("llm", "input")} | _ACTION_TRIGGERS,
    ("detection", "match"):     {("llm", "input"), ("visualLlm", "trigger")} | _ACTION_TRIGGERS,
    ("detection", "no_match"):  {("llm", "input"), ("visualLlm", "trigger")} | _ACTION_TRIGGERS,
    ("audioDetect", "match"):   {("llm", "input")} | _ACTION_TRIGGERS,
    ("audioDetect", "no_match"):{("llm", "input")} | _ACTION_TRIGGERS,
    ("logic", "match"):         {("llm", "input")} | _ACTION_TRIGGERS,
    ("logic", "no_match"):      {("llm", "input")} | _ACTION_TRIGGERS,
    ("llm", "output"):          {("logic", "input")} | _ACTION_TRIGGERS,
}


def _parse_workflow_json(raw: str):
    """Extract and validate nodes/edges from LLM output. Returns (nodes, edges)."""
    import re

    text = raw.strip()

    # Strip markdown code fences (with or without closing fence)
    text = re.sub(r"^```\w*\s*", "", text)
    text = re.sub(r"\s*```\s*$", "", text)

    # Collapse all whitespace (newlines, indentation) to single spaces to help parse pretty-printed JSON
    text = re.sub(r"\s+", " ", text)

    # Extract the first JSON object { ... } even if there's junk around it
    brace_start = text.find("{")
    if brace_start == -1:
        return [], []
    # Find matching closing brace by counting depth (skip braces inside strings)
    depth = 0
    brace_end = -1
    in_string = False
    escape = False
    for i in range(brace_start, len(text)):
        c = text[i]
        if escape:
            escape = False
            continue
        if c == "\\":
            escape = True
            continue
        if c == '"':
            in_string = not in_string
            continue
        if in_string:
            continue
        if c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                brace_end = i
                break
    if brace_end == -1:
        # No matching close brace — truncated output
        truncated = text[brace_start:]
        # Try to close open arrays and braces
        # Count open brackets
        open_brackets = truncated.count("[") - truncated.count("]")
        truncated += "]" * max(0, open_brackets) + "}" * max(0, depth)
        text = truncated
    else:
        text = text[brace_start : brace_end + 1]

    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        logger.warning(f"Workflow JSON parse failed: {text[:300]}")
        return [], []

    nodes = data.get("nodes") or []
    edges = data.get("edges") or []
    out_nodes = []
    node_types: dict[str, str] = {}
    for n in nodes:
        nid = n.get("id") or n.get("nodeId")
        ntype = (n.get("type") or n.get("nodeType") or "").strip()
        ndata = n.get("data") or {}
        if not nid or not ntype:
            continue
        if ntype not in VALID_NODE_TYPES:
            continue
        nid = str(nid)
        out_nodes.append({"id": nid, "type": ntype, "data": ndata})
        node_types[nid] = ntype

    out_edges = []
    for e in edges:
        src = str(e.get("source") or e.get("from") or "")
        tgt = str(e.get("target") or e.get("to") or "")
        if not src or not tgt or src not in node_types or tgt not in node_types:
            continue
        src_handle = str(e.get("sourceHandle") or "")
        tgt_handle = str(e.get("targetHandle") or "")

        # Validate connection is physically possible
        src_type = node_types[src]
        tgt_type = node_types[tgt]
        allowed = _VALID_CONNECTIONS.get((src_type, src_handle))
        if allowed and (tgt_type, tgt_handle) not in allowed:
            logger.warning(f"Rejected invalid edge: {src_type}.{src_handle} → {tgt_type}.{tgt_handle}")
            continue

        edge_data: dict = {"source": src, "target": tgt}
        if src_handle:
            edge_data["sourceHandle"] = src_handle
        if tgt_handle:
            edge_data["targetHandle"] = tgt_handle
        out_edges.append(edge_data)

    # If we got nodes but no edges (truncated output lost the edges), auto-wire them
    if out_nodes and not out_edges:
        logger.warning("No edges parsed — auto-wiring nodes in sequence")
        out_edges = _auto_wire_nodes(out_nodes)

    return out_nodes, out_edges


# Default output handles for each node type
_DEFAULT_OUTPUT_HANDLE: dict[str, str] = {
    "camera": "frames", "video": "frames", "mic": "audio", "visualLlm": "response",
    "audioLlm": "response", "detection": "match", "audioDetect": "match",
    "logic": "match", "llm": "output",
}
# Default input handles for each node type
_DEFAULT_INPUT_HANDLE: dict[str, str] = {
    "visualLlm": "camera", "audioLlm": "audio", "detection": "camera",
    "audioDetect": "audio", "logic": "input", "llm": "input",
    "soundAction": "trigger", "logAction": "trigger", "notifyAction": "trigger",
    "screenshotAction": "trigger", "webhookAction": "trigger",
}


def _auto_wire_nodes(nodes: list[dict]) -> list[dict]:
    """Connect nodes in order using valid connections. Fallback for truncated output."""
    edges = []
    for i in range(len(nodes) - 1):
        src = nodes[i]
        tgt = nodes[i + 1]
        src_handle = _DEFAULT_OUTPUT_HANDLE.get(src["type"], "")
        tgt_handle = _DEFAULT_INPUT_HANDLE.get(tgt["type"], "")
        if not src_handle or not tgt_handle:
            continue
        # Validate
        allowed = _VALID_CONNECTIONS.get((src["type"], src_handle))
        if allowed and (tgt["type"], tgt_handle) not in allowed:
            # Try alternate handle for detection/logic
            for alt_handle in ["match", "response", "output", "frames", "audio"]:
                alt_allowed = _VALID_CONNECTIONS.get((src["type"], alt_handle))
                if alt_allowed and (tgt["type"], tgt_handle) in alt_allowed:
                    src_handle = alt_handle
                    break
            else:
                continue
        edges.append({
            "source": src["id"], "target": tgt["id"],
            "sourceHandle": src_handle, "targetHandle": tgt_handle,
        })
    return edges


async def handle_generate_workflow(cid: str, payload: dict):
    """Turn a text description into nodes and edges, return for frontend to apply."""
    description = (payload.get("description") or payload.get("text") or "").strip()
    if not description:
        await manager.send(cid, "workflow_generated", {
            "nodes": [],
            "edges": [],
            "error": "No description provided.",
        })
        return

    loop = asyncio.get_event_loop()

    # Try up to 2 times — the small model sometimes echoes the template or returns empty arrays
    MAX_ATTEMPTS = 2
    for attempt in range(MAX_ATTEMPTS):
        try:
            if attempt == 0:
                prompt = GENERATE_WORKFLOW_PROMPT + "\n\nUser request: " + description
            else:
                # Retry with a more direct prompt that puts the user request first
                prompt = (
                    f"Create an arcflow pipeline for: {description}\n\n"
                    "Output ONLY compact JSON on one line. No markdown.\n"
                    "Use this exact pattern with REAL data (not empty arrays):\n\n"
                    + GENERATE_WORKFLOW_PROMPT
                )
                logger.info("Workflow generation retry (attempt %d)", attempt + 1)

            result = await loop.run_in_executor(
                None,
                lambda p=prompt: brain.generate_text(p, max_tokens=2048),
            )
            raw = (result.get("text") or "").strip()
            logger.info(f"Workflow LLM raw output (attempt {attempt+1}): {raw[:300]}")
            nodes, edges = _parse_workflow_json(raw)

            if nodes:
                # Success — send it
                await manager.send(cid, "workflow_generated", {
                    "nodes": nodes,
                    "edges": edges,
                    "error": None,
                })
                return

            # Empty result — retry if we have attempts left
            if attempt < MAX_ATTEMPTS - 1:
                logger.warning("Workflow generation returned empty nodes, retrying...")
                continue

            # Final attempt failed
            await manager.send(cid, "workflow_generated", {
                "nodes": [],
                "edges": [],
                "error": f"Could not generate workflow. Model returned: {raw[:200]}",
            })
        except Exception as e:
            logger.exception("generate_workflow failed (attempt %d): %s", attempt + 1, e)
            if attempt < MAX_ATTEMPTS - 1:
                continue
            await manager.send(cid, "workflow_generated", {
                "nodes": [],
                "edges": [],
                "error": str(e),
            })


# ─── Entry Point ───
if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("ARCFLOW_PORT", "8000"))
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=port,
        reload=False,
        log_level="info",
    )
