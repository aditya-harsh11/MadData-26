# arcflow

Privacy-first visual AI pipeline editor. Build smart camera and audio workflows by connecting nodes in a drag-and-drop canvas. All AI inference runs on-device — frames and audio never leave your machine.

Built for **Windows ARM64** with Qualcomm NPU acceleration via Nexa SDK (OmniNeural-4B) and ONNX Runtime QNN.

Won MadData 2026
Dev Post : https://devpost.com/software/arcflow-3g7r2v

---

## Quick Start

### Prerequisites

- **Node.js** >= 18
- **Python 3.13 ARM64** (for Qualcomm NPU support) or any Python 3.10+
- A webcam and/or microphone (optional, can use file inputs instead)

### Install

```bash
# Frontend dependencies
npm install

# Backend dependencies
pip install -r backend/requirements.txt
```

### Run

```bash
# Frontend only (port 3000)
npm run dev

# Backend only (port 8000)
npm run backend

# Full stack: Next.js + Python backend + Electron
npm run full-dev
```

| Command              | What it starts                          |
|----------------------|-----------------------------------------|
| `npm run dev`        | Next.js dev server (port 3000)          |
| `npm run backend`    | FastAPI backend (port 8000)             |
| `npm run electron-dev` | Next.js + Electron (no backend)       |
| `npm run full-dev`   | Next.js + backend + Electron            |
| `npm run build`      | Static export for Electron production   |

Open **http://localhost:3000** in the browser, or use the Electron window when running `full-dev`.

---

## Architecture

```
┌──────────────────────────────────────────────────┐
│                    Electron Shell                 │
│  ┌────────────┐  ┌─────────────────────────────┐ │
│  │  Sidebar    │  │         ReactFlow Canvas    │ │
│  │  (drag to   │  │                             │ │
│  │   create    │  │   [Camera] ──► [Visual LLM] │ │
│  │   nodes)    │  │                  │          │ │
│  │             │  │              [Logic] ──►... │ │
│  └────────────┘  └─────────────────────────────┘ │
│                         │  WebSocket              │
│                         ▼                         │
│              ┌─────────────────────┐              │
│              │  FastAPI Backend    │              │
│              │  OmniNeural-4B VLM  │              │
│              │  YOLOv8 (ONNX/QNN)  │              │
│              │  YamNet (ONNX/QNN)  │              │
│              └─────────────────────┘              │
└──────────────────────────────────────────────────┘
```

### Frontend — Next.js 14 + TypeScript + Tailwind CSS

- **Single-page app** at `app/page.tsx` wrapping a `<Canvas />` component in a ReactFlow provider
- **Canvas** (`components/Canvas.tsx`): visual pipeline editor with drag-and-drop node creation, edge wiring, autosave, and AI workflow generation
- **Node components** in `components/nodes/`, each wrapped in a shared `NodeShell` for consistent styling
- **Zustand stores** drive node-to-node data flow entirely on the frontend:
  - `lib/frameStore.ts` — maps `nodeId → base64 JPEG frame`
  - `lib/audioStore.ts` — maps `nodeId → base64 PCM audio chunk`
  - `lib/nodeOutputStore.ts` — maps `nodeId → text output` (supports compound keys like `nodeId:match` for logic branching)
- **Static export** (`next.config.js` → `output: 'export'`) for Electron compatibility

### Backend — FastAPI + Python

- **Entry point**: `backend/main.py` — FastAPI with WebSocket at `/ws` and health check at `/health`
- **AI Models**:
  - **OmniNeural-4B** via Nexa SDK — vision-language model for both image analysis and text generation
  - **YOLOv8n** via ONNX Runtime — object detection with optional QNN (Qualcomm NPU) acceleration
  - **YamNet** via ONNX Runtime — audio event classification (521 sound categories)
- **On-demand**: no server-side loops. The frontend drives all analysis timing via WebSocket messages
- **WebSocket message types**:

  | Message          | Direction | Description                              |
  |------------------|-----------|------------------------------------------|
  | `frame`          | client→server | Store latest camera frame              |
  | `vlm_analyze`    | client→server | Run VLM on stored frame + prompt       |
  | `text_gen`       | client→server | Text-only LLM generation               |
  | `detect`         | client→server | YOLO object detection on frame         |
  | `audio_analyze`  | client→server | YamNet audio classification            |
  | `audio_llm_analyze` | client→server | VLM analysis of audio                |
  | `generate_workflow` | client→server | AI generates a full node pipeline    |
  | `describe_workflow` | client→server | AI describes existing pipeline       |
  | `send_email`     | client→server | Send email via SMTP                    |
  | `send_sms`       | client→server | Send SMS via Twilio                    |

### Communication

- **WebSocket** (`lib/websocket.ts`): `PipelineSocket` singleton with auto-reconnect (3s retry)
- **Frame capture** (`lib/frameCapture.ts`): browser `getUserMedia()` → canvas → JPEG base64 at configurable FPS
- **Audio capture** (`lib/audioCapture.ts`): browser `getUserMedia()` → AudioWorklet → 16kHz mono Float32 PCM → base64 chunks (1 chunk/second)

### Electron (`electron/main.js`)

- Spawns Python backend as a child process on startup, kills on quit
- Dev mode loads `localhost:3000`; production loads static build from `out/index.html`
- Detects ARM64 Python at standard Windows install paths
- Context isolation enabled, `nodeIntegration` disabled

---

## Node Catalog

### Input Nodes

| Node | Description |
|------|-------------|
| **Camera** | Live webcam feed. Configurable FPS (1-15), device selection. Stores JPEG frames in frame store. |
| **Video Input** | Play a video file as a camera substitute. Loops, configurable FPS. Same frame output format as Camera. |
| **Microphone** | Live audio capture via browser mic. Outputs 16kHz mono PCM chunks at 1/sec. |
| **Audio Input** | Play an audio file (MP3/WAV/OGG) as a mic substitute. Decodes and resamples to 16kHz mono. Loop toggle. |

### AI Nodes

| Node | Description |
|------|-------------|
| **Visual LLM** | Connects to a camera source. Sends frames + user prompt to OmniNeural-4B on a configurable interval timer. Optional trigger input to gate when analysis fires. |
| **Object Detect** | YOLO v8 object detection on camera frames. Configurable confidence threshold, label filtering. Outputs `match`/`no_match` handles for downstream logic. |
| **LLM** | Text-in / text-out. Takes upstream text output + optional system prompt, runs through OmniNeural-4B. |
| **Audio Detect** | YamNet sound classification on mic/audio input. Configurable confidence, label filtering, listen duration. Outputs `match`/`no_match`. |
| **Audio LLM** | Records N seconds of audio, sends to OmniNeural-4B with a user prompt for audio understanding. |

### Logic Nodes

| Node | Description |
|------|-------------|
| **Logic** | Conditional routing. Supports `contains`, `not_contains`, `equals`, `starts_with`, `regex` operators. AND/OR mode. Outputs on `match` or `no_match` handles. |

### Output Nodes

| Node | Description |
|------|-------------|
| **Sound Alert** | Plays a sound (beep, siren, chime, or custom audio file) when triggered. |
| **Log** | Timestamped event log with CSV export. |
| **Notification** | Desktop browser notification when triggered. |
| **Screenshot** | Captures and saves camera frames as JPEG when triggered. |
| **Webhook** | Sends HTTP POST with JSON payload to a configured URL. |
| **Email** | Sends email alerts via SMTP. Requires `ARCFLOW_SMTP_USER` / `ARCFLOW_SMTP_PASS` env vars. |
| **SMS** | Sends SMS via Twilio. Requires `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_FROM_NUMBER` env vars. |

---

## Project Structure

```
├── app/
│   └── page.tsx              # Single-page entry point
├── components/
│   ├── Canvas.tsx            # ReactFlow canvas, node/edge management
│   ├── Sidebar.tsx           # Draggable node catalog
│   └── nodes/
│       ├── NodeShell.tsx     # Shared wrapper (accent, title, status)
│       ├── CameraNode.tsx
│       ├── VideoNode.tsx
│       ├── MicNode.tsx
│       ├── AudioFileNode.tsx
│       ├── VisualLlmNode.tsx
│       ├── DetectionNode.tsx
│       ├── LlmNode.tsx
│       ├── AudioDetectNode.tsx
│       ├── AudioLlmNode.tsx
│       ├── LogicNode.tsx
│       ├── SoundAlertNode.tsx
│       ├── LogNode.tsx
│       ├── NotifyNode.tsx
│       ├── ScreenshotNode.tsx
│       ├── WebhookNode.tsx
│       ├── EmailNode.tsx
│       └── SmsNode.tsx
├── lib/
│   ├── types.ts              # Node catalog, interfaces
│   ├── websocket.ts          # PipelineSocket singleton
│   ├── frameStore.ts         # Zustand: camera frames
│   ├── audioStore.ts         # Zustand: audio chunks
│   ├── nodeOutputStore.ts    # Zustand: text outputs
│   ├── workflowStore.ts      # Zustand: workflow persistence
│   ├── frameCapture.ts       # Camera → JPEG base64
│   ├── audioCapture.ts       # Mic → PCM base64
│   ├── captureRegistry.ts    # Park/reclaim captures across workflow switches
│   ├── useNodeData.ts        # Hook: sync local state → ReactFlow node data
│   └── useUpstreamTrigger.ts # Hook: read upstream node output
├── backend/
│   ├── main.py               # FastAPI + WebSocket server
│   ├── reasoning.py          # Nexa SDK VLM/LLM wrapper
│   ├── watchdog.py           # YOLOv8 ONNX detector
│   ├── audiodetector.py      # YamNet ONNX classifier
│   ├── requirements.txt
│   └── models/               # ONNX model files
├── electron/
│   ├── main.js               # Electron main process
│   └── preload.js            # Context bridge
├── package.json
├── tailwind.config.ts
├── next.config.js
└── tsconfig.json
```

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ARCFLOW_SMTP_USER` | For email node | SMTP username |
| `ARCFLOW_SMTP_PASS` | For email node | SMTP password |
| `TWILIO_ACCOUNT_SID` | For SMS node | Twilio account SID |
| `TWILIO_AUTH_TOKEN` | For SMS node | Twilio auth token |
| `TWILIO_FROM_NUMBER` | For SMS node | Twilio sender phone number |
| `ARCFLOW_PYTHON` | Optional | Path to Python executable (overrides auto-detection) |

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 14, React 18, TypeScript, Tailwind CSS |
| Visual Editor | ReactFlow 11 |
| State Management | Zustand 4 |
| Icons | Lucide React |
| Desktop | Electron 30 |
| Backend | FastAPI, Uvicorn, WebSockets |
| Vision LLM | Nexa SDK + OmniNeural-4B |
| Object Detection | YOLOv8n via ONNX Runtime (QNN) |
| Audio Classification | YamNet via ONNX Runtime (QNN) |
| NPU Acceleration | Qualcomm AI Hub, ONNX Runtime QNN EP |

---

## How Data Flows

1. **Input nodes** (Camera, Video, Mic, Audio File) capture media and write to Zustand stores
2. **AI nodes** read from stores, send data to the backend over WebSocket, receive results, and write text output to `nodeOutputStore`
3. **Logic nodes** evaluate conditions on upstream text and route to `match` / `no_match` output handles
4. **Output nodes** subscribe to upstream triggers and fire actions (sound, log, notification, screenshot, webhook, email, SMS)

All wiring is visual — drag edges between node handles on the canvas. Downstream nodes discover upstream connections via `useEdges()`.

---

## License

Private — hackathon project.
