"""
SnapFlow Backend — FastAPI server with WebSocket pipeline.

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
logger = logging.getLogger("snapflow")

# ─── AI Engine ───
brain = ReasoningBrain()

DEFAULT_PROMPT = "Describe what you see. If there is any safety concern, explain it."


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup / shutdown lifecycle."""
    logger.info("=" * 50)
    logger.info("  SnapFlow Backend Starting")
    logger.info("=" * 50)

    loop = asyncio.get_event_loop()

    async def _load_brain():
        try:
            await loop.run_in_executor(None, brain.load_vlm)
        except Exception as e:
            logger.warning(f"Could not load VLM: {e}")
        logger.info(f"VLM loaded: {brain.vlm_loaded}")

    asyncio.create_task(_load_brain())

    logger.info("Backend ready — waiting for WebSocket connections")

    yield

    brain.shutdown()
    logger.info("Backend shutting down")


app = FastAPI(title="SnapFlow Backend", lifespan=lifespan)

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
            elif msg_type == "vlm_analyze":
                await handle_vlm_analyze(cid, payload)
            elif msg_type == "text_gen":
                await handle_text_gen(cid, payload)
            elif msg_type == "describe_workflow":
                await handle_describe_workflow(cid, payload)
            elif msg_type == "generate_workflow":
                await handle_generate_workflow(cid, payload)
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


# ─── Describe workflow (AI-generated summary) ───

NODE_TYPE_LABELS = {
    "camera": "Camera",
    "visualLlm": "Visual LLM",
    "logic": "Logic",
    "llm": "LLM",
    "action": "Action",
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

VALID_NODE_TYPES = {"camera", "visualLlm", "logic", "llm", "action"}

GENERATE_WORKFLOW_PROMPT = """You are a pipeline designer for SnapFlow, a visual AI camera pipeline editor.
The user will describe a workflow. Output ONLY valid JSON, no other text.

Output format:
{
  "nodes": [
    {"id": "unique-id", "type": "TYPE", "data": { ... }},
    ...
  ],
  "edges": [
    {"source": "source-id", "target": "target-id", "sourceHandle": "handle-name", "targetHandle": "handle-name"},
    ...
  ]
}

Allowed node types, their data fields, and handle names:

1. camera — Live camera feed. Data: {} (no fields needed).
   Output handle: "frames"

2. visualLlm — Vision AI that analyzes camera frames with a custom prompt. Data: {"prompt": "what to look for", "interval": 10}
   Input handle: "camera" (connect from camera's "frames")
   Output handle: "response"

3. logic — Conditional routing based on text content. Data: {"conditions": [{"id": "1", "operator": "contains", "value": "keyword"}], "mode": "any"}
   Operators: contains, not_contains, equals, starts_with
   Input handle: "input" (connect from visualLlm's "response" or llm's "output")
   Output handles: "match" (condition true), "no_match" (condition false)

4. llm — Text processing (same model, no image). Data: {"systemPrompt": "instruction for the LLM"}
   Input handle: "input" (connect from any text output)
   Output handle: "output"

5. action — Terminal action node. Data: {"actionType": "sound"} (options: sound, log, notification, webhook)
   Input handle: "trigger" (connect from logic's "match" or any text output)

IMPORTANT: Always populate the data fields with sensible values based on the user's description. For example, if the user says "detect cats", set the visualLlm prompt to "Look for cats in the scene. Report if any cats are visible." and the logic condition to {"operator": "contains", "value": "cat"}.

Use short, unique node ids (e.g. camera-1, vlm-1, logic-1, action-1). Output only the JSON object."""


def _parse_workflow_json(raw: str):
    """Extract and validate nodes/edges from LLM output. Returns (nodes, edges)."""
    text = raw.strip()
    if "```" in text:
        start = text.find("```")
        if "json" in text[: start + 10].lower():
            start = text.find("\n", start) + 1
        end = text.find("```", start)
        if end != -1:
            text = text[start:end]
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        return [], []

    nodes = data.get("nodes") or []
    edges = data.get("edges") or []
    out_nodes = []
    for n in nodes:
        nid = n.get("id") or n.get("nodeId")
        ntype = (n.get("type") or n.get("nodeType") or "").strip()
        ndata = n.get("data") or {}
        if not nid or not ntype:
            continue
        if ntype not in VALID_NODE_TYPES:
            continue
        out_nodes.append({"id": str(nid), "type": ntype, "data": ndata})
    out_edges = []
    for e in edges:
        src = e.get("source") or e.get("from")
        tgt = e.get("target") or e.get("to")
        edge_data: dict = {"source": str(src), "target": str(tgt)}
        if e.get("sourceHandle"):
            edge_data["sourceHandle"] = str(e["sourceHandle"])
        if e.get("targetHandle"):
            edge_data["targetHandle"] = str(e["targetHandle"])
        if src and tgt:
            out_edges.append(edge_data)
    return out_nodes, out_edges


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

    prompt = GENERATE_WORKFLOW_PROMPT + "\n\nUser description:\n" + description

    try:
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None,
            lambda: brain.generate_text(prompt, max_tokens=800),
        )
        raw = (result.get("text") or "").strip()
        nodes, edges = _parse_workflow_json(raw)
        await manager.send(cid, "workflow_generated", {
            "nodes": nodes,
            "edges": edges,
            "error": None,
        })
    except Exception as e:
        logger.exception("generate_workflow failed: %s", e)
        await manager.send(cid, "workflow_generated", {
            "nodes": [],
            "edges": [],
            "error": str(e),
        })


# ─── Entry Point ───
if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("SNAPFLOW_PORT", "8000"))
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=port,
        reload=False,
        log_level="info",
    )
