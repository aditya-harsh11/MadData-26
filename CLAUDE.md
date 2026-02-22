# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

arcflow is a privacy-first smart camera orchestration platform with a visual node-based pipeline editor. It runs AI inference on-device using Qualcomm NPU acceleration (Windows ARM64). The frontend is a ReactFlow-based visual editor; the backend serves a single VLM model (OmniNeural-4B) over WebSocket for both vision and text-only requests.

DO NOT PIVOT IDEAS WITHOUT ASKING ME FIRST YOU ARE NOT ALLOWED TO JUST DO WHATEVER YOU WANT

## Development Commands

```bash
npm run dev              # Next.js dev server only (port 3000)
npm run backend          # Python FastAPI backend only (port 8000)
npm run electron-dev     # Next.js + Electron together
npm run full-dev         # All three: Next.js + Python backend + Electron
npm run build            # Static Next.js build (for Electron production)
```

Backend Python dependencies: `pip install -r backend/requirements.txt`

## Architecture

### Frontend (Next.js 14 + TypeScript + Tailwind CSS)

- **Single-page app** at `app/page.tsx` wrapping a `<Canvas />` component in a ReactFlow provider
- **Canvas** (`components/Canvas.tsx`): Main visual pipeline editor using ReactFlow. Manages nodes, edges, drag-and-drop creation, default workflow, and AI workflow generation
- **5 Node types** (`components/nodes/`), each using shared `NodeShell` wrapper:
  - **CameraNode**: Live camera feed capture, stores frames in Zustand frame store
  - **VisualLlmNode**: Takes camera input + user prompt, runs VLM analysis on interval timer
  - **LogicNode**: Frontend-only conditional routing (contains/equals/regex on text)
  - **LlmNode**: Text-in/text-out using same VLM model without image
  - **ActionNode**: Terminal node — sound (Web Audio API), log, notification, webhook
- **Sidebar** (`components/Sidebar.tsx`): Node catalog grouped by category with drag-to-create
- **Path alias**: `@/*` maps to project root (configured in tsconfig.json)
- **Static export**: `next.config.js` uses `output: 'export'` for Electron compatibility

### Data Flow (Frontend-Driven)

Node-to-node data flows through two Zustand stores, NOT through backend loops:
- **Frame store** (`lib/frameStore.ts`): Camera nodes store latest base64 frame by node ID
- **Output store** (`lib/nodeOutputStore.ts`): Each node stores its latest text output by node ID. Logic node uses compound keys (`nodeId:match`, `nodeId:no_match`) for branching
- Downstream nodes discover their upstream via `useEdges()` + Zustand selectors
- The Visual LLM node reads frames from the frame store, sends `vlm_analyze` to backend on its own interval timer

### Backend (FastAPI + Python)

- **Entry point**: `backend/main.py` — FastAPI server with WebSocket at `/ws` and health check at `/health`
- **Single model**: `backend/reasoning.py` — Nexa SDK serving OmniNeural-4B via OpenAI-compatible API at `localhost:18181`. Used for both vision (`analyze_frame`) and text-only (`generate_text`) requests
- **On-demand architecture**: No server-side reasoning loop. The frontend drives all analysis timing
- **WebSocket message types**: `frame` (store frame), `vlm_analyze` (run VLM), `text_gen` (run text LLM), `generate_workflow` (AI creates pipeline), `describe_workflow` (AI describes pipeline)
- **Workflow generator**: Backend LLM generates nodes with populated `data` fields (prompts, conditions, action types) based on natural language descriptions

### Communication

- **WebSocket** (`lib/websocket.ts`): `PipelineSocket` singleton with auto-reconnect (3s retry)
- **Frame capture** (`lib/frameCapture.ts`): Client-side camera via `getUserMedia()`, JPEG base64 at configurable FPS
- All inference on-device — frames never leave the machine

### Electron (`electron/main.js`)

- Spawns Python backend as child process on startup, kills on quit
- Dev mode loads `localhost:3000`; production loads static build from `out/index.html`
- Detects ARM64 Python at standard Windows paths

## Styling

Dark theme in `tailwind.config.ts` with surface colors (#0a0a0f, #13131a, #1e1e2e) and accent palette (cyan, amber, purple, emerald, blue). Monospace font: JetBrains Mono.
