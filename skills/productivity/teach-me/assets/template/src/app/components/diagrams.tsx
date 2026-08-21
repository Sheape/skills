import { useEffect, useId, useMemo, useRef, useState } from "react";
import mermaid from "mermaid";
import {
  addEdge,
  applyEdgeChanges,
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
} from "@xyflow/react";
import { LinkIcon, RotateCcwIcon } from "lucide-react";

import { ActivityFrame, useGradedActivity } from "@/app/components/activity-runtime";
import { useLessonRuntime } from "@/app/components/activity-runtime";
import { useLessonStoredState } from "@/app/progress";
import { useTheme } from "@/app/theme";
import { Button } from "@/components/ui/button";

interface StoredDiagram {
  positions: Record<string, { x: number; y: number }>;
  edges: Edge[];
}

function edgeKey(edge: Pick<Edge, "source" | "target">) {
  return `${edge.source}->${edge.target}`;
}

function nodeLabel(node: Node) {
  return typeof node.data?.label === "string" ? node.data.label : node.id;
}

export interface DiagramCanvasProps {
  id: string;
  label: string;
  nodes: readonly Node[];
  edges: readonly Edge[];
  editable?: boolean;
  minimap?: boolean;
  onEdgesChange?: (edges: readonly Edge[]) => void;
}

export function DiagramCanvas({
  id,
  label,
  nodes: authoredNodes,
  edges: authoredEdges,
  editable = false,
  minimap = false,
  onEdgesChange,
}: DiagramCanvasProps) {
  const runtime = useLessonRuntime();
  const initial = useRef<StoredDiagram>({ positions: {}, edges: [...authoredEdges] }).current;
  const initialNodes = useRef([...authoredNodes]).current;
  const [stored, setStored] = useLessonStoredState(runtime.href, `diagram:${id}`, initial);
  const seededNodes = useMemo(
    () =>
      authoredNodes.map((node) => ({
        ...node,
        position: stored.positions[node.id] ?? node.position,
      })),
    [authoredNodes, stored.positions],
  );
  const [nodes, setNodes, onNodesChange] = useNodesState(seededNodes);
  const [edges, setEdges] = useEdgesState(stored.edges);
  const authoredSignature = authoredEdges.map(edgeKey).sort().join("|");
  const previousAuthoredSignature = useRef(authoredSignature);

  useEffect(() => setNodes(seededNodes), [seededNodes, setNodes]);
  useEffect(() => {
    if (previousAuthoredSignature.current === authoredSignature) return;
    previousAuthoredSignature.current = authoredSignature;
    const next = [...authoredEdges];
    setEdges(next);
    setStored((current) => ({ ...current, edges: next }));
  }, [authoredEdges, authoredSignature, setEdges, setStored]);
  useEffect(() => onEdgesChange?.(edges), [edges, onEdgesChange]);

  const saveEdges = (next: Edge[]) => {
    setEdges(next);
    setStored((current) => ({ ...current, edges: next }));
  };
  const connect = (connection: Connection) => saveEdges(addEdge(connection, edges));

  return (
    <div className="diagram-shell">
      <div className="diagram-canvas" role="img" aria-label={label}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          fitView
          nodesDraggable={editable}
          nodesConnectable={editable}
          elementsSelectable={editable}
          panOnDrag
          zoomOnScroll
          onNodesChange={onNodesChange}
          onEdgesChange={(changes) => {
            setEdges((current) => {
              const next = applyEdgeChanges(changes, current);
              setStored((storedState) => ({ ...storedState, edges: next }));
              return next;
            });
          }}
          onConnect={connect}
          onNodeDragStop={(_, node) =>
            setStored((current) => ({
              ...current,
              positions: { ...current.positions, [node.id]: node.position },
            }))
          }
        >
          <Background />
          <Controls showInteractive={editable} />
          {minimap && <MiniMap pannable zoomable />}
        </ReactFlow>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => {
          setNodes([...initialNodes]);
          saveEdges([...initial.edges]);
          setStored(initial);
        }}
      >
        <RotateCcwIcon data-icon="inline-start" aria-hidden="true" />
        Reset diagram
      </Button>
    </div>
  );
}

export function DiagramActivity({
  id,
  title,
  prompt,
  nodes,
  initialEdges = [],
  expectedEdges,
  hint,
  explanation,
  required = true,
}: {
  id: string;
  title: string;
  prompt: string;
  nodes: readonly Node[];
  initialEdges?: readonly Edge[];
  expectedEdges: readonly Pick<Edge, "source" | "target">[];
  hint: string;
  explanation: string;
  required?: boolean;
}) {
  const [edges, setEdges] = useState<readonly Edge[]>(initialEdges);
  const [source, setSource] = useState("");
  const [target, setTarget] = useState("");
  const state = useGradedActivity(id, required);
  const expected = useMemo(() => expectedEdges.map(edgeKey).sort(), [expectedEdges]);
  const connect = () => {
    if (!source || !target || source === target) return;
    const next = [
      ...edges.filter((edge) => edge.target !== target),
      { id: `${source}-${target}`, source, target },
    ];
    setEdges(next);
    setSource("");
    setTarget("");
  };

  return (
    <ActivityFrame
      title={title}
      prompt={prompt}
      hint={hint}
      explanation={explanation}
      state={state}
      checkDisabled={!edges.length}
      onCheck={() => {
        const actual = edges.map(edgeKey).sort();
        const correct =
          actual.length === expected.length &&
          actual.every((value, index) => value === expected[index]);
        state.submit({
          correct,
          feedback: correct
            ? "The graph now preserves every required direction."
            : "At least one connection has the wrong source or destination.",
        });
      }}
    >
      <DiagramCanvas
        id={id}
        label={prompt}
        nodes={nodes}
        edges={edges}
        editable
        onEdgesChange={setEdges}
      />
      <div className="diagram-connect" aria-label="Keyboard connection controls">
        <label>
          From
          <select value={source} onChange={(event) => setSource(event.target.value)}>
            <option value="">Choose node</option>
            {nodes.map((node) => (
              <option key={node.id} value={node.id}>
                {nodeLabel(node)}
              </option>
            ))}
          </select>
        </label>
        <label>
          To
          <select value={target} onChange={(event) => setTarget(event.target.value)}>
            <option value="">Choose node</option>
            {nodes.map((node) => (
              <option key={node.id} value={node.id}>
                {nodeLabel(node)}
              </option>
            ))}
          </select>
        </label>
        <Button
          type="button"
          variant="secondary"
          disabled={!source || !target || source === target}
          onClick={connect}
        >
          <LinkIcon data-icon="inline-start" aria-hidden="true" />
          Connect
        </Button>
      </div>
    </ActivityFrame>
  );
}

export function MermaidDiagram({ chart, label }: { chart: string; label: string }) {
  const { theme } = useTheme();
  const reactId = useId().replaceAll(":", "");
  const [svg, setSvg] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      theme: theme === "dark" ? "dark" : "neutral",
    });
    void mermaid
      .render(`mermaid-${reactId}`, chart)
      .then((result) => {
        if (!live) return;
        setSvg(result.svg);
        setError(null);
      })
      .catch((reason: unknown) => {
        if (!live) return;
        setError(
          reason instanceof Error ? reason.message : "Mermaid could not render this diagram.",
        );
      });
    return () => {
      live = false;
    };
  }, [chart, reactId, theme]);

  if (error)
    return (
      <p className="diagram-error" role="alert">
        {error}
      </p>
    );
  return (
    <div
      className="mermaid-diagram"
      role="img"
      aria-label={label}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
