"use client";

import React, { useState } from "react";
import { Handle, Position, type NodeProps } from "reactflow";
import { Filter, Plus, X } from "lucide-react";
import NodeShell from "./NodeShell";

interface FilterRule {
  id: string;
  field: "label" | "confidence";
  operator: "equals" | "contains" | "gt" | "lt";
  value: string;
}

export default function FilterNode({ id, selected }: NodeProps) {
  const [rules, setRules] = useState<FilterRule[]>([
    { id: "1", field: "label", operator: "equals", value: "person" },
  ]);
  const [passCount, setPassCount] = useState(0);
  const [blockCount, setBlockCount] = useState(0);

  const addRule = () => {
    setRules([
      ...rules,
      {
        id: Date.now().toString(),
        field: "label",
        operator: "equals",
        value: "",
      },
    ]);
  };

  const removeRule = (ruleId: string) => {
    setRules(rules.filter((r) => r.id !== ruleId));
  };

  const updateRule = (
    ruleId: string,
    key: keyof FilterRule,
    value: string
  ) => {
    setRules(
      rules.map((r) => (r.id === ruleId ? { ...r, [key]: value } : r))
    );
  };

  return (
    <NodeShell
      accent="#ec4899"
      title="Filter"
      icon={<Filter size={14} />}
      status="idle"
      selected={selected}
    >
      {/* Input Handle */}
      <Handle
        type="target"
        position={Position.Left}
        id="input"
        style={{
          background: "#f59e0b",
          border: "2px solid #13131a",
        }}
      />

      {/* Rules */}
      <div className="space-y-2 mb-3">
        {rules.map((rule) => (
          <div
            key={rule.id}
            className="flex items-center gap-1 p-1.5 rounded-lg"
            style={{ background: "#0a0a0f" }}
          >
            <select
              value={rule.field}
              onChange={(e) =>
                updateRule(rule.id, "field", e.target.value)
              }
              className="bg-transparent text-[10px] text-slate-400 outline-none nodrag"
            >
              <option value="label">label</option>
              <option value="confidence">conf</option>
            </select>
            <select
              value={rule.operator}
              onChange={(e) =>
                updateRule(rule.id, "operator", e.target.value)
              }
              className="bg-transparent text-[10px] text-pink-400 outline-none nodrag"
            >
              <option value="equals">=</option>
              <option value="contains">~</option>
              <option value="gt">&gt;</option>
              <option value="lt">&lt;</option>
            </select>
            <input
              value={rule.value}
              onChange={(e) =>
                updateRule(rule.id, "value", e.target.value)
              }
              className="flex-1 bg-transparent text-[10px] text-slate-300 outline-none min-w-0 nodrag"
              placeholder="value"
            />
            <button
              onClick={() => removeRule(rule.id)}
              className="text-slate-600 hover:text-red-400 transition-colors"
            >
              <X size={10} />
            </button>
          </div>
        ))}
      </div>

      <button
        onClick={addRule}
        className="w-full flex items-center justify-center gap-1 py-1 rounded text-[10px] text-slate-500 hover:text-pink-400 transition-colors"
        style={{ border: "1px dashed #1e1e2e" }}
      >
        <Plus size={10} />
        Add Rule
      </button>

      {/* Stats */}
      <div className="flex justify-between mt-2">
        <span className="text-[9px] font-mono text-emerald-500/70">
          {passCount} passed
        </span>
        <span className="text-[9px] font-mono text-red-500/70">
          {blockCount} blocked
        </span>
      </div>

      {/* Output Handles */}
      <Handle
        type="source"
        position={Position.Right}
        id="passed"
        style={{
          background: "#10b981",
          border: "2px solid #13131a",
          top: "40%",
        }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="blocked"
        style={{
          background: "#ef4444",
          border: "2px solid #13131a",
          top: "60%",
        }}
      />
    </NodeShell>
  );
}
