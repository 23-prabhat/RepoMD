"use client";

import { useCallback, useMemo, useState } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  MarkerType,
  BaseEdge,
  getBezierPath,
  Handle,
  Position,
} from "@xyflow/react";
import dagre from "@dagrejs/dagre";
import type { DependencyEdge } from "@/lib/types";

import "@xyflow/react/dist/style.css";

// ── Constants ───────────────────────────────────────────────────────────────

const NODE_W = 200;
const NODE_H = 52;

const GROUP_COLORS = [
  "var(--accent-amber)",
  "var(--accent-cyan)",
  "var(--accent-green)",
  "var(--accent-violet)",
  "var(--accent-rose)",
  "var(--accent-teal)",
];

// ── Dagre layout ────────────────────────────────────────────────────────────

function getLayoutedElements(
  nodeIds: string[],
  edges: { id: string; source: string; target: string; label: string }[]
) {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "LR", ranksep: 80, nodesep: 45 });

  nodeIds.forEach((id) => g.setNode(id, { width: NODE_W, height: NODE_H }));
  edges.forEach((e) => g.setEdge(e.source, e.target));

  dagre.layout(g);

  const layoutedNodes = nodeIds.map((id) => {
    const n = g.node(id);
    return { id, position: { x: n.x - NODE_W / 2, y: n.y - NODE_H / 2 } };
  });

  return layoutedNodes;
}

// ── Color by directory group ─────────────────────────────────────────────────

function getGroupColor(path: string, groupMap: Map<string, string>): string {
  const parts = path.split("/");
  const group =
    parts[0] === "src" && parts.length > 1
      ? parts[1]
      : parts[0] || "root";
  if (!groupMap.has(group)) {
    groupMap.set(group, GROUP_COLORS[groupMap.size % GROUP_COLORS.length]);
  }
  return groupMap.get(group)!;
}

function shortName(path: string): string {
  return path.split("/").pop() ?? path;
}

// Fixed dark palette — graph is always a "dark canvas" regardless of page theme
const GRAPH_BG = "#0b0d14";
const NODE_BG = "#151824";
const NODE_BORDER_IDLE = "rgba(255,255,255,0.10)";

// ── Custom Node ──────────────────────────────────────────────────────────────

type DepNodeData = {
  label: string;
  fullPath: string;
  accentColor: string;
  highlighted: boolean;
  dimmed: boolean;
};

function DepNode({ data }: { data: DepNodeData }) {
  const { label, fullPath, accentColor, highlighted, dimmed } = data;

  return (
    <>
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <div
        style={{
          width: NODE_W,
          height: NODE_H,
          background: NODE_BG,
          border: `1px solid ${highlighted ? accentColor : NODE_BORDER_IDLE}`,
          borderLeft: `4px solid ${accentColor}`,
          borderRadius: 8,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "0 10px",
          opacity: dimmed ? 0.18 : 1,
          transition: "opacity 0.2s, border-color 0.2s, box-shadow 0.2s",
          boxShadow: highlighted
            ? `0 0 14px color-mix(in srgb, ${accentColor} 40%, transparent)`
            : "none",
          cursor: "default",
        }}
      >
        <div
          style={{
            fontFamily: "var(--font-geist-mono, monospace)",
            fontSize: 11,
            fontWeight: 700,
            color: "rgba(255,255,255,0.92)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {label}
        </div>
        <div
          style={{
            fontFamily: "var(--font-geist-mono, monospace)",
            fontSize: 9,
            color: `color-mix(in srgb, ${accentColor} 55%, rgba(255,255,255,0.3))`,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            marginTop: 2,
          }}
        >
          {fullPath}
        </div>
      </div>
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
    </>
  );
}

// ── Custom Edge ──────────────────────────────────────────────────────────────

type DepEdgeData = {
  uses: string;
  highlighted: boolean;
  dimmed: boolean;
};

function DepEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  markerEnd,
}: {
  id: string;
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  sourcePosition: Position;
  targetPosition: Position;
  data?: DepEdgeData;
  markerEnd?: string;
}) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const highlighted = data?.highlighted ?? false;
  const dimmed = data?.dimmed ?? false;

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          stroke: highlighted ? "#FFB800" : "rgba(255,184,0,0.45)",
          strokeWidth: highlighted ? 2 : 1,
          opacity: dimmed ? 0.07 : 1,
          transition: "stroke 0.2s, opacity 0.2s, stroke-width 0.2s",
        }}
      />
      {!dimmed && (
        <foreignObject
          x={labelX - 20}
          y={labelY - 8}
          width={40}
          height={16}
          style={{ pointerEvents: "none" }}
        >
          <div
            style={{
              fontFamily: "var(--font-geist-mono, monospace)",
              fontSize: 9,
              color: highlighted ? "rgba(255,184,0,0.9)" : "rgba(255,255,255,0.28)",
              textAlign: "center",
              whiteSpace: "nowrap",
            }}
          >
            {data?.uses ?? "uses"}
          </div>
        </foreignObject>
      )}
    </>
  );
}

// ── nodeTypes / edgeTypes (stable references) ─────────────────────────────

const nodeTypes = { dep: DepNode };
const edgeTypes = { dep: DepEdge };

// ── Main component ───────────────────────────────────────────────────────────

export default function DependencyGraph({ data }: { data: DependencyEdge[] }) {
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

  // Build connected set for hover highlighting
  const connectedSets = useMemo(() => {
    const map = new Map<string, Set<string>>();
    data.forEach(({ from, to }) => {
      if (!map.has(from)) map.set(from, new Set());
      if (!map.has(to)) map.set(to, new Set());
      map.get(from)!.add(to);
      map.get(to)!.add(from);
    });
    return map;
  }, [data]);

  const connectedToHovered: Set<string> = useMemo(() => {
    if (!hoveredNodeId) return new Set();
    return connectedSets.get(hoveredNodeId) ?? new Set();
  }, [hoveredNodeId, connectedSets]);

  // Derive unique node ids and group colors
  const { nodeIds, groupMap } = useMemo(() => {
    const ids = new Set<string>();
    data.forEach(({ from, to }) => { ids.add(from); ids.add(to); });
    const gm = new Map<string, string>();
    ids.forEach((id) => getGroupColor(id, gm)); // populate
    return { nodeIds: Array.from(ids), groupMap: gm };
  }, [data]);

  // Dagre layout
  const rawEdges = useMemo(
    () =>
      data.map((e, i) => ({
        id: `e-${i}`,
        source: e.from,
        target: e.to,
        label: e.uses,
      })),
    [data]
  );

  const layoutedPositions = useMemo(
    () => getLayoutedElements(nodeIds, rawEdges),
    [nodeIds, rawEdges]
  );

  // Initial nodes/edges (hover data is injected dynamically below)
  const initialNodes = useMemo(
    () =>
      layoutedPositions.map(({ id, position }) => ({
        id,
        type: "dep",
        position,
        data: {
          label: shortName(id),
          fullPath: id,
          accentColor: getGroupColor(id, new Map(groupMap)),
          highlighted: false,
          dimmed: false,
        },
        draggable: true,
      })),
    [layoutedPositions, groupMap]
  );

  const initialEdges = useMemo(
    () =>
      rawEdges.map((e) => ({
        ...e,
        type: "dep",
        markerEnd: { type: MarkerType.ArrowClosed, color: "var(--accent-amber)" },
        data: { uses: e.label, highlighted: false, dimmed: false },
      })),
    [rawEdges]
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Update highlight/dim on hover
  const applyHover = useCallback(
    (id: string | null) => {
      setHoveredNodeId(id);

      setNodes((ns) =>
        ns.map((n) => {
          const isHovered = n.id === id;
          const isConnected = id ? (connectedSets.get(id)?.has(n.id) ?? false) : false;
          const highlighted = isHovered || isConnected;
          const dimmed = !!id && !highlighted;
          return { ...n, data: { ...n.data, highlighted, dimmed } };
        })
      );

      setEdges((es) =>
        es.map((e) => {
          const highlighted = !!id && (e.source === id || e.target === id);
          const dimmed = !!id && !highlighted;
          return { ...e, data: { ...e.data, highlighted, dimmed } };
        })
      );
    },
    [connectedSets, setNodes, setEdges]
  );

  if (data.length === 0) {
    return (
      <div
        style={{
          height: 120,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--text-30)",
          fontFamily: "var(--font-geist-mono, monospace)",
          fontSize: 12,
        }}
      >
        No dependencies detected
      </div>
    );
  }

  return (
    <div
      className="dep-graph-wrap"
      style={{
        height: 500,
        borderRadius: 12,
        overflow: "hidden",
        border: "1px solid rgba(255,184,0,0.15)",
        background: GRAPH_BG,
      }}
    >
      {/* Scoped overrides for React Flow Controls — always dark canvas */}
      <style>{`
        .dep-graph-wrap .react-flow__controls {
          background: #1c1f2e;
          border: 1px solid rgba(255,184,0,0.22);
          border-radius: 8px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.5);
          overflow: hidden;
        }
        .dep-graph-wrap .react-flow__controls-button {
          background: transparent;
          border-bottom: 1px solid rgba(255,255,255,0.07);
          width: 26px;
          height: 26px;
          padding: 5px;
          color: rgba(255,255,255,0.65);
        }
        .dep-graph-wrap .react-flow__controls-button:last-child {
          border-bottom: none;
        }
        .dep-graph-wrap .react-flow__controls-button svg {
          fill: rgba(255,255,255,0.65);
          max-width: 14px;
          max-height: 14px;
        }
        .dep-graph-wrap .react-flow__controls-button:hover {
          background: rgba(255,184,0,0.12);
        }
        .dep-graph-wrap .react-flow__controls-button:hover svg {
          fill: #FFB800;
        }
        .dep-graph-wrap .react-flow__edge-path {
          stroke-dasharray: 6;
          animation: dep-dash 0.6s linear infinite;
        }
        @keyframes dep-dash {
          to { stroke-dashoffset: -12; }
        }
        .dep-graph-wrap .react-flow__minimap {
          background: #0f1119;
          border: 1px solid rgba(255,184,0,0.18);
          border-radius: 8px;
          overflow: hidden;
        }
      `}</style>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodeMouseEnter={(_evt, node) => applyHover(node.id)}
        onNodeMouseLeave={() => applyHover(null)}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.1}
        proOptions={{ hideAttribution: true }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={28}
          size={1}
          color="rgba(255,255,255,0.07)"
        />
        <Controls />
        <MiniMap
          nodeColor={() => "rgba(255,184,0,0.5)"}
          maskColor="rgba(0,0,0,0.6)"
          style={{ background: "#0f1119" }}
        />
      </ReactFlow>
    </div>
  );
}
