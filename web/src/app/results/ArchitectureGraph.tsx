"use client";

import { useCallback, useMemo, useState } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Panel,
  useNodesState,
  useEdgesState,
  MarkerType,
  BaseEdge,
  getBezierPath,
  Handle,
  Position,
} from "@xyflow/react";
import dagre from "@dagrejs/dagre";
import type { ExecutionFlowStep, CriticalFile } from "@/lib/types";

import "@xyflow/react/dist/style.css";

// ── Constants ────────────────────────────────────────────────────────────────

const LAYER_NODE_W = 700;
const LAYER_NODE_H = 40;
const FILE_NODE_W  = 190;
const FILE_NODE_H  = 68;

const LAYER_COLORS = [
  "var(--accent-rose)",
  "var(--accent-cyan)",
  "var(--accent-green)",
  "var(--accent-violet)",
  "var(--accent-amber)",
  "var(--accent-teal)",
];

const CATEGORY_COLORS: Record<string, string> = {
  auth:       "var(--accent-red, #FF5F57)",
  database:   "var(--accent-cyan)",
  api:        "var(--accent-green)",
  config:     "#8899AA",
  core:       "var(--accent-violet)",
  routing:    "var(--accent-teal)",
  middleware: "var(--accent-amber)",
};

function catColor(cat: string): string {
  return CATEGORY_COLORS[cat.toLowerCase()] ?? "#8899AA";
}

function shortName(path: string): string {
  return path.split("/").pop() ?? path;
}

const GRAPH_BG       = "#0b0d14";
const NODE_BG        = "#151824";

// ── Dagre layout ─────────────────────────────────────────────────────────────

function getArchLayoutedElements(
  orderedLayers: string[],
  filesByLayer: Map<string, ExecutionFlowStep[]>,
  sortedSteps: ExecutionFlowStep[]
): Map<string, { x: number; y: number }> {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "TB", ranksep: 65, nodesep: 28, marginx: 40, marginy: 40 });

  // Layer header nodes
  orderedLayers.forEach((layer) => {
    g.setNode(`layer-${layer}`, { width: LAYER_NODE_W, height: LAYER_NODE_H });
  });

  // File nodes (deduped by file path)
  const addedFiles = new Set<string>();
  orderedLayers.forEach((layer) => {
    (filesByLayer.get(layer) ?? []).forEach(({ file }) => {
      if (!addedFiles.has(file)) {
        g.setNode(`file-${file}`, { width: FILE_NODE_W, height: FILE_NODE_H });
        addedFiles.add(file);
      }
    });
  });

  // Invisible anchor edges: layer[i] → layer[i+1] (vertical order)
  for (let i = 0; i < orderedLayers.length - 1; i++) {
    g.setEdge(`layer-${orderedLayers[i]}`, `layer-${orderedLayers[i + 1]}`);
  }

  // Invisible anchor edges: layer → each of its files (files below header)
  orderedLayers.forEach((layer) => {
    (filesByLayer.get(layer) ?? []).forEach(({ file }) => {
      g.setEdge(`layer-${layer}`, `file-${file}`);
    });
  });

  // Visible flow edges also added to Dagre (so layout accounts for them)
  for (let i = 0; i < sortedSteps.length - 1; i++) {
    const from = `file-${sortedSteps[i].file}`;
    const to   = `file-${sortedSteps[i + 1].file}`;
    if (from !== to) g.setEdge(from, to);
  }

  dagre.layout(g);

  const positions = new Map<string, { x: number; y: number }>();
  g.nodes().forEach((id) => {
    const n = g.node(id);
    const w = id.startsWith("layer-") ? LAYER_NODE_W : FILE_NODE_W;
    const h = id.startsWith("layer-") ? LAYER_NODE_H : FILE_NODE_H;
    positions.set(id, { x: n.x - w / 2, y: n.y - h / 2 });
  });

  return positions;
}

// ── Layer header node ────────────────────────────────────────────────────────

type LayerNodeData = {
  label: string;
  color: string;
  dimmed: boolean;
};

function ArchLayerNode({ data }: { data: LayerNodeData }) {
  const { label, color, dimmed } = data;
  return (
    <div
      style={{
        width: LAYER_NODE_W,
        height: LAYER_NODE_H,
        background: `linear-gradient(135deg, color-mix(in srgb, ${color} 12%, #0b0d14) 0%, color-mix(in srgb, ${color} 5%, #0b0d14) 100%)`,
        border: `1px solid color-mix(in srgb, ${color} 28%, transparent)`,
        borderLeft: `3px solid ${color}`,
        borderRadius: 8,
        display: "flex",
        alignItems: "center",
        padding: "0 16px",
        gap: 12,
        pointerEvents: "none",
        opacity: dimmed ? 0.25 : 1,
        transition: "opacity 0.2s",
      }}
    >
      <span
        style={{
          fontFamily: "var(--font-geist-mono, monospace)",
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color,
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </span>
      <div
        style={{
          flex: 1,
          height: 1,
          background: `color-mix(in srgb, ${color} 18%, transparent)`,
        }}
      />
    </div>
  );
}

// ── File node ────────────────────────────────────────────────────────────────

type FileNodeData = {
  label: string;
  fullPath: string;
  layerColor: string;
  isCritical: boolean;
  category: string | null;
  categoryColor: string;
  highlighted: boolean;
  dimmed: boolean;
};

function ArchFileNode({ data }: { data: FileNodeData }) {
  const { label, fullPath, layerColor, isCritical, category, categoryColor, highlighted, dimmed } = data;

  const topBorderColor = isCritical ? categoryColor : layerColor;
  const sideBorderColor = highlighted
    ? (isCritical ? categoryColor : layerColor)
    : "rgba(255,255,255,0.10)";

  return (
    <>
      <Handle type="target" position={Position.Top}    style={{ opacity: 0 }} />
      <div
        style={{
          width: FILE_NODE_W,
          height: FILE_NODE_H,
          background: NODE_BG,
          border: `1px solid ${sideBorderColor}`,
          borderTop: `3px solid ${topBorderColor}`,
          borderRadius: 8,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "0 10px",
          gap: 3,
          opacity: dimmed ? 0.15 : 1,
          transition: "opacity 0.2s, border-color 0.2s, box-shadow 0.2s",
          boxShadow: highlighted
            ? `0 0 14px color-mix(in srgb, ${isCritical ? categoryColor : layerColor} 40%, transparent)`
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
            color: `color-mix(in srgb, ${layerColor} 55%, rgba(255,255,255,0.3))`,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {fullPath}
        </div>
        {isCritical && category && (
          <div
            style={{
              marginTop: 2,
              display: "inline-block",
              alignSelf: "flex-start",
              fontFamily: "var(--font-geist-mono, monospace)",
              fontSize: 8,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: categoryColor,
              background: `color-mix(in srgb, ${categoryColor} 12%, transparent)`,
              border: `1px solid color-mix(in srgb, ${categoryColor} 25%, transparent)`,
              borderRadius: 3,
              padding: "1px 5px",
            }}
          >
            {category}
          </div>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </>
  );
}

// ── Custom edge ──────────────────────────────────────────────────────────────

type ArchEdgeData = {
  highlighted: boolean;
  dimmed: boolean;
};

function ArchEdge({
  id,
  sourceX, sourceY, targetX, targetY,
  sourcePosition, targetPosition,
  data, markerEnd,
}: {
  id: string;
  sourceX: number; sourceY: number;
  targetX: number; targetY: number;
  sourcePosition: Position;
  targetPosition: Position;
  data?: ArchEdgeData;
  markerEnd?: string;
}) {
  const [edgePath] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  const highlighted = data?.highlighted ?? false;
  const dimmed = data?.dimmed ?? false;

  return (
    <BaseEdge
      id={id}
      path={edgePath}
      markerEnd={markerEnd}
      style={{
        stroke: highlighted
          ? "var(--accent-rose, #FF6B9D)"
          : "color-mix(in srgb, var(--accent-rose, #FF6B9D) 40%, transparent)",
        strokeWidth: highlighted ? 2 : 1.5,
        opacity: dimmed ? 0.06 : 1,
        transition: "stroke 0.2s, opacity 0.2s, stroke-width 0.2s",
      }}
    />
  );
}

// ── Stable type maps (module-level) ──────────────────────────────────────────

const nodeTypes = { "arch-layer": ArchLayerNode, "arch-file": ArchFileNode };
const edgeTypes = { "arch": ArchEdge };

// ── Main component ────────────────────────────────────────────────────────────

export default function ArchitectureGraph({
  executionFlow,
  criticalFiles,
}: {
  executionFlow: ExecutionFlowStep[];
  criticalFiles: CriticalFile[];
}) {
  const [, setHoveredNodeId] = useState<string | null>(null);

  // ── Derive data ────────────────────────────────────────────────────────────

  const { orderedLayers, filesByLayer, criticalMap, layerColorMap, sortedSteps } = useMemo(() => {
    const layers: string[] = [];
    const seen = new Set<string>();
    const sorted = [...executionFlow].sort((a, b) => a.step - b.step);

    sorted.forEach(({ layer }) => {
      if (!seen.has(layer)) { layers.push(layer); seen.add(layer); }
    });

    const byLayer = new Map<string, ExecutionFlowStep[]>();
    layers.forEach((l) => byLayer.set(l, []));
    sorted.forEach((s) => byLayer.get(s.layer)!.push(s));

    const cMap = new Map(criticalFiles.map((cf) => [cf.file, cf]));

    const colorMap = new Map<string, string>();
    layers.forEach((l, i) => colorMap.set(l, LAYER_COLORS[i % LAYER_COLORS.length]));

    return {
      orderedLayers: layers,
      filesByLayer: byLayer,
      criticalMap: cMap,
      layerColorMap: colorMap,
      sortedSteps: sorted,
    };
  }, [executionFlow, criticalFiles]);

  // ── Compute layout positions ────────────────────────────────────────────────

  const positions = useMemo(
    () => getArchLayoutedElements(orderedLayers, filesByLayer, sortedSteps),
    [orderedLayers, filesByLayer, sortedSteps]
  );

  // ── Build initial nodes ─────────────────────────────────────────────────────

  const initialNodes = useMemo(() => {
    const nodes = [];

    // Layer header nodes
    for (const layer of orderedLayers) {
      const pos = positions.get(`layer-${layer}`);
      if (!pos) continue;
      nodes.push({
        id: `layer-${layer}`,
        type: "arch-layer" as const,
        position: pos,
        data: {
          label: layer,
          color: layerColorMap.get(layer)!,
          dimmed: false,
        } as LayerNodeData,
        selectable: false,
      });
    }

    // File nodes (deduped)
    const addedFiles = new Set<string>();
    for (const layer of orderedLayers) {
      const layerColor = layerColorMap.get(layer)!;
      for (const { file } of filesByLayer.get(layer) ?? []) {
        if (addedFiles.has(file)) continue;
        addedFiles.add(file);

        const pos = positions.get(`file-${file}`);
        if (!pos) continue;

        const cf = criticalMap.get(file);
        nodes.push({
          id: `file-${file}`,
          type: "arch-file" as const,
          position: pos,
          data: {
            label: shortName(file),
            fullPath: file,
            layerColor,
            isCritical: !!cf,
            category: cf?.category ?? null,
            categoryColor: cf ? catColor(cf.category) : layerColor,
            highlighted: false,
            dimmed: false,
          } as FileNodeData,
        });
      }
    }

    return nodes;
  }, [orderedLayers, filesByLayer, positions, layerColorMap, criticalMap]);

  // ── Build visible edges ──────────────────────────────────────────────────────

  const initialEdges = useMemo(() => {
    const edges = [];
    const seenPairs = new Set<string>();

    for (let i = 0; i < sortedSteps.length - 1; i++) {
      const from = `file-${sortedSteps[i].file}`;
      const to   = `file-${sortedSteps[i + 1].file}`;
      if (from === to) continue;
      const key = `${from}||${to}`;
      if (seenPairs.has(key)) continue;
      seenPairs.add(key);

      edges.push({
        id: `arch-e-${i}`,
        source: from,
        target: to,
        type: "arch",
        animated: true,
        markerEnd: { type: MarkerType.ArrowClosed, color: "var(--accent-rose, #FF6B9D)" },
        data: { highlighted: false, dimmed: false } as ArchEdgeData,
      });
    }

    return edges;
  }, [sortedSteps]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // ── Connected sets for hover ─────────────────────────────────────────────────

  const connectedSets = useMemo(() => {
    const map = new Map<string, Set<string>>();
    initialEdges.forEach(({ source, target }) => {
      if (!map.has(source)) map.set(source, new Set());
      if (!map.has(target)) map.set(target, new Set());
      map.get(source)!.add(target);
      map.get(target)!.add(source);
    });
    return map;
  }, [initialEdges]);

  // ── Hover handler ────────────────────────────────────────────────────────────

  const applyHover = useCallback(
    (id: string | null) => {
      setHoveredNodeId(id);

      setNodes((ns) =>
        ns.map((n): (typeof ns)[number] => {
          if (n.type === "arch-layer") {
            return { ...n, data: { ...(n.data as LayerNodeData), dimmed: !!id } };
          }
          const isHovered   = n.id === id;
          const isConnected = id ? (connectedSets.get(id)?.has(n.id) ?? false) : false;
          const highlighted = isHovered || isConnected;
          const dimmed      = !!id && !highlighted;
          return { ...n, data: { ...(n.data as FileNodeData), highlighted, dimmed } };
        })
      );

      setEdges((es) =>
        es.map((e) => {
          const highlighted = !!id && (e.source === id || e.target === id);
          const dimmed      = !!id && !highlighted;
          return { ...e, data: { ...e.data, highlighted, dimmed } };
        })
      );
    },
    [connectedSets, setNodes, setEdges]
  );

  // ── Empty state ──────────────────────────────────────────────────────────────

  if (executionFlow.length === 0) {
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
        No execution flow data available
      </div>
    );
  }

  return (
    <div
      className="arch-graph-wrap"
      style={{
        height: 580,
        borderRadius: 14,
        overflow: "hidden",
        border: "1px solid rgba(255,107,157,0.15)",
        background: GRAPH_BG,
      }}
    >
      <style>{`
        .arch-graph-wrap .react-flow__controls {
          background: #1c1f2e;
          border: 1px solid rgba(255,107,157,0.22);
          border-radius: 8px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.5);
          overflow: hidden;
        }
        .arch-graph-wrap .react-flow__controls-button {
          background: transparent;
          border-bottom: 1px solid rgba(255,255,255,0.07);
          width: 26px;
          height: 26px;
          padding: 5px;
          color: rgba(255,255,255,0.65);
        }
        .arch-graph-wrap .react-flow__controls-button:last-child {
          border-bottom: none;
        }
        .arch-graph-wrap .react-flow__controls-button svg {
          fill: rgba(255,255,255,0.65);
          max-width: 14px;
          max-height: 14px;
        }
        .arch-graph-wrap .react-flow__controls-button:hover {
          background: rgba(255,107,157,0.12);
        }
        .arch-graph-wrap .react-flow__controls-button:hover svg {
          fill: var(--accent-rose, #FF6B9D);
        }
        .arch-graph-wrap .react-flow__edge-path {
          stroke-dasharray: 5;
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
        fitViewOptions={{ padding: 0.25 }}
        minZoom={0.08}
        nodesDraggable={false}
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
          nodeColor={() => "rgba(255,107,157,0.5)"}
          maskColor="rgba(0,0,0,0.6)"
          style={{ background: "#0f1119" }}
        />
        <Panel position="top-right">
          <div
            style={{
              background: "rgba(11,13,20,0.88)",
              backdropFilter: "blur(8px)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 8,
              padding: "10px 14px",
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            <div
              style={{
                fontFamily: "var(--font-geist-mono, monospace)",
                fontSize: 9,
                letterSpacing: "0.1em",
                color: "rgba(255,255,255,0.35)",
                textTransform: "uppercase",
                marginBottom: 2,
              }}
            >
              Layers
            </div>
            {orderedLayers.map((layer) => {
              const lc = layerColorMap.get(layer)!;
              return (
                <div key={layer} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 3,
                      background: lc,
                      flexShrink: 0,
                    }}
                  />
                  <span
                    style={{
                      fontFamily: "var(--font-geist-mono, monospace)",
                      fontSize: 10,
                      color: "rgba(255,255,255,0.6)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {layer}
                  </span>
                </div>
              );
            })}
          </div>
        </Panel>
      </ReactFlow>
    </div>
  );
}
