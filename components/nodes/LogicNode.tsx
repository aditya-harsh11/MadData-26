"use client";

import React, { useEffect, useState, useMemo, useRef } from "react";
import { Handle, Position, type NodeProps, useEdges } from "reactflow";
import { GitBranch, Plus, X, CheckCircle, XCircle } from "lucide-react";
import NodeShell from "./NodeShell";
import { useNodeOutputStore } from "@/lib/nodeOutputStore";
import type { LogicCondition } from "@/lib/types";

const OPERATORS: { value: LogicCondition["operator"]; label: string }[] = [
  { value: "contains", label: "contains" },
  { value: "not_contains", label: "doesn't contain" },
  { value: "equals", label: "equals" },
  { value: "starts_with", label: "starts with" },
  { value: "regex", label: "regex" },
];

function evaluateCondition(cond: LogicCondition, text: string): boolean {
  const input = text.toLowerCase();
  const value = cond.value.toLowerCase();
  switch (cond.operator) {
    case "contains":
      return input.includes(value);
    case "not_contains":
      return !input.includes(value);
    case "equals":
      return input.trim() === value.trim();
    case "starts_with":
      return input.startsWith(value);
    case "regex":
      try {
        return new RegExp(cond.value, "i").test(text);
      } catch {
        return false;
      }
    default:
      return false;
  }
}

export default function LogicNode({ id, selected, data }: NodeProps) {
  const [conditions, setConditions] = useState<LogicCondition[]>(
    data?.conditions || [{ id: "1", operator: "contains" as const, value: "" }]
  );
  const [mode, setMode] = useState<"any" | "all">(data?.mode || "any");
  const [retrigger, setRetrigger] = useState(data?.retrigger ?? false);
  const [lastResult, setLastResult] = useState<boolean | null>(null);
  const [evalCount, setEvalCount] = useState(0);
  const lastInputRef = useRef<string | null>(null);

  const edges = useEdges();

  // Find connected source node and its handle
  const { sourceNodeId, sourceHandle } = useMemo(() => {
    const incomingEdge = edges.find(
      (e) => e.target === id && e.targetHandle === "input"
    );
    return {
      sourceNodeId: incomingEdge?.source ?? null,
      sourceHandle: incomingEdge?.sourceHandle ?? null,
    };
  }, [edges, id]);

  // Resolve the output key (handles Logic→Logic chaining with compound keys)
  const outputKey = useMemo(() => {
    if (!sourceNodeId) return null;
    if (sourceHandle && sourceHandle !== "response" && sourceHandle !== "output") {
      return `${sourceNodeId}:${sourceHandle}`;
    }
    return sourceNodeId;
  }, [sourceNodeId, sourceHandle]);

  const sourceOutput = useNodeOutputStore(
    (state) => (outputKey ? state.outputs[outputKey] : undefined)
  );
  // Version changes every time setOutput is called, even with the same text
  const sourceVersion = useNodeOutputStore(
    (state) => (outputKey ? (state.versions[outputKey] ?? 0) : 0)
  );

  // Evaluate conditions when input changes (or version bumps for retrigger)
  useEffect(() => {
    if (!sourceOutput || conditions.length === 0) return;
    if (conditions.every((c) => !c.value.trim())) return;

    // Skip if same input and retrigger is off
    if (!retrigger && sourceOutput === lastInputRef.current) return;
    lastInputRef.current = sourceOutput;

    const activeConditions = conditions.filter((c) => c.value.trim());
    if (activeConditions.length === 0) return;

    const results = activeConditions.map((c) => evaluateCondition(c, sourceOutput));
    const passed =
      mode === "any" ? results.some(Boolean) : results.every(Boolean);

    setLastResult(passed);
    setEvalCount((c) => c + 1);

    const store = useNodeOutputStore.getState();
    if (passed) {
      store.setOutput(`${id}:match`, sourceOutput);
    } else {
      store.setOutput(`${id}:no_match`, sourceOutput);
    }
  }, [sourceVersion, conditions, mode, id, retrigger]);

  const addCondition = () => {
    setConditions((prev) => [
      ...prev,
      { id: String(Date.now()), operator: "contains" as const, value: "" },
    ]);
  };

  const removeCondition = (condId: string) => {
    setConditions((prev) => prev.filter((c) => c.id !== condId));
  };

  const updateCondition = (
    condId: string,
    field: "operator" | "value",
    val: string
  ) => {
    setConditions((prev) =>
      prev.map((c) =>
        c.id === condId
          ? { ...c, [field]: val }
          : c
      )
    );
  };

  return (
    <NodeShell
      accent="#f59e0b"
      title="Logic"
      icon={<GitBranch size={16} />}
      status={lastResult !== null ? "running" : "idle"}
      selected={selected}
      width={380}
    >
      {/* Input Handle */}
      <Handle
        type="target"
        position={Position.Left}
        id="input"
        style={{
          background: "#a855f7",
          border: "2px solid #13131a",
        }}
      />

      {/* Mode Toggle */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs text-slate-500">Match</span>
        {(["any", "all"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className="px-2.5 py-1 rounded text-xs font-medium transition-colors nodrag"
            style={{
              background: mode === m ? "#f59e0b20" : "#0a0a0f",
              color: mode === m ? "#f59e0b" : "#64748b",
              border: `1px solid ${mode === m ? "#f59e0b30" : "#1e1e2e"}`,
            }}
          >
            {m.toUpperCase()}
          </button>
        ))}
        <span className="text-xs text-slate-500 ml-1">conditions</span>
      </div>

      {/* Retrigger Toggle */}
      <label className="flex items-center gap-2 mb-3 cursor-pointer nodrag select-none">
        <button
          onClick={() => setRetrigger((v: boolean) => !v)}
          className="w-8 h-[18px] rounded-full relative transition-colors nodrag"
          style={{
            background: retrigger ? "#f59e0b40" : "#1e1e2e",
            border: `1px solid ${retrigger ? "#f59e0b50" : "#2a2a3a"}`,
          }}
        >
          <div
            className="absolute top-[2px] w-3 h-3 rounded-full transition-all"
            style={{
              background: retrigger ? "#f59e0b" : "#64748b",
              left: retrigger ? 14 : 2,
            }}
          />
        </button>
        <span className="text-[11px] text-slate-400">
          Fire every evaluation
        </span>
      </label>

      {/* Conditions */}
      <div className="space-y-2 mb-3">
        {conditions.map((cond) => (
          <div key={cond.id} className="flex items-center gap-1.5">
            <select
              value={cond.operator}
              onChange={(e) =>
                updateCondition(cond.id, "operator", e.target.value)
              }
              className="bg-[#0a0a0f] border border-[#1e1e2e] rounded px-2 py-1.5 text-xs text-slate-300 outline-none focus:border-amber-500/40 nodrag"
              style={{ minWidth: 110 }}
            >
              {OPERATORS.map((op) => (
                <option key={op.value} value={op.value}>
                  {op.label}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={cond.value}
              onChange={(e) =>
                updateCondition(cond.id, "value", e.target.value)
              }
              className="flex-1 bg-[#0a0a0f] border border-[#1e1e2e] rounded px-2 py-1.5 text-xs text-slate-300 outline-none focus:border-amber-500/40 nodrag"
              placeholder="value..."
            />
            {conditions.length > 1 && (
              <button
                onClick={() => removeCondition(cond.id)}
                className="p-1 rounded text-slate-600 hover:text-red-400 transition-colors nodrag"
              >
                <X size={12} />
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Add Condition */}
      <button
        onClick={addCondition}
        className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-amber-400 transition-colors mb-3 nodrag"
      >
        <Plus size={12} />
        Add Condition
      </button>

      {/* Result Indicator */}
      {lastResult !== null && (
        <div
          className="flex items-center gap-2 rounded-md px-3 py-2"
          style={{
            background: lastResult ? "#10b98115" : "#ef444415",
            border: `1px solid ${lastResult ? "#10b98125" : "#ef444425"}`,
          }}
        >
          {lastResult ? (
            <CheckCircle size={14} className="text-emerald-400" />
          ) : (
            <XCircle size={14} className="text-red-400" />
          )}
          <span
            className="text-xs font-medium"
            style={{ color: lastResult ? "#10b981" : "#ef4444" }}
          >
            {lastResult ? "MATCH" : "NO MATCH"}
          </span>
          <span className="text-[10px] text-slate-500 ml-auto font-mono">
            {evalCount} evals
          </span>
        </div>
      )}

      {/* Output Handles */}
      <Handle
        type="source"
        position={Position.Right}
        id="match"
        style={{
          background: "#10b981",
          border: "2px solid #13131a",
          top: "40%",
        }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="no_match"
        style={{
          background: "#ef4444",
          border: "2px solid #13131a",
          top: "65%",
        }}
      />

      {/* Handle labels */}
      <div
        className="absolute text-[9px] font-mono text-emerald-500/60"
        style={{ right: 14, top: "37%" }}
      >
        match
      </div>
      <div
        className="absolute text-[9px] font-mono text-red-500/60"
        style={{ right: 14, top: "62%" }}
      >
        no match
      </div>
    </NodeShell>
  );
}
