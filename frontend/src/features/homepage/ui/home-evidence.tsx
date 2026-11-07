"use client";

import Link from "next/link";
import { useMemo, useState, type CSSProperties } from "react";
import { ArrowUpRight } from "lucide-react";

import { HOME_COPY } from "../presentation/copy";
import {
  EVIDENCE_EDGES,
  EVIDENCE_NODE_BY_ID,
  EVIDENCE_NODES,
  edgeKindLabel,
  evidenceEdgesFor,
  evidenceNodeName,
  type EvidenceEdge,
  type EvidenceNode,
} from "../presentation/evidence-graph";
import { createHomeStars } from "../presentation/starfield";

const MAP_STARS = createHomeStars(0x5ab4b, 170).map((star) => ({
  ...star,
  x: star.x * 0.625,
  y: star.y * 0.6,
}));

function nodeStyle(node: EvidenceNode): CSSProperties {
  return {
    left: `${(node.x / 1000) * 100}%`,
    top: `${(node.y / 600) * 100}%`,
    "--home-node-color": node.color ?? "var(--home-star)",
  } as CSSProperties;
}

function edgePath(edge: EvidenceEdge): string {
  const from = EVIDENCE_NODE_BY_ID.get(edge.from);
  const to = EVIDENCE_NODE_BY_ID.get(edge.to);
  if (!from || !to) return "";

  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  const normalX = -dy / length;
  const normalY = dx / length;
  const curve = edge.curve ?? 0;
  const controlX = (from.x + to.x) / 2 + normalX * curve;
  const controlY = (from.y + to.y) / 2 + normalY * curve;

  return `M ${from.x} ${from.y} Q ${controlX} ${controlY} ${to.x} ${to.y}`;
}

function NodeMark({ node }: { node: EvidenceNode }) {
  return (
    <span
      className="home-graph__star"
      data-kind={node.kind}
      aria-hidden="true"
    />
  );
}

function NodeLabel({ node }: { node: EvidenceNode }) {
  return (
    <span className="home-graph__node-copy">
      <span className="home-graph__node-name">{node.name}</span>
      <span className="home-graph__node-kind">{node.kindLabel}</span>
    </span>
  );
}

function ConnectionList() {
  return (
    <ul className="home-graph__edge-list">
      {EVIDENCE_EDGES.map((edge) => (
        <li key={edge.id}>
          <span className="home-graph__edge-pair">
            {evidenceNodeName(edge.from)} → {evidenceNodeName(edge.to)}
          </span>
          <span className="home-graph__edge-kind">
            {edgeKindLabel(edge.kind)}
          </span>
          <span className="home-graph__edge-note">{edge.note}</span>
        </li>
      ))}
    </ul>
  );
}

export function HomeEvidence() {
  const [selectedId, setSelectedId] = useState("shared-fact-sheet");
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const focusId = hoveredId ?? selectedId;
  const selectedNode =
    EVIDENCE_NODE_BY_ID.get(selectedId) ?? EVIDENCE_NODES[0];
  const selectedEdges = useMemo(
    () => evidenceEdgesFor(selectedId),
    [selectedId],
  );
  const selectedAssignments = selectedEdges.filter(
    (edge) => edge.kind === "assignment",
  );
  const selectedCitations = selectedEdges.filter(
    (edge) => edge.kind === "citation",
  );

  const nodeState = (node: EvidenceNode) => {
    const related =
      focusId === node.id ||
      EVIDENCE_EDGES.some(
        (edge) =>
          (edge.from === focusId && edge.to === node.id) ||
          (edge.to === focusId && edge.from === node.id),
      );

    return {
      selected: selectedId === node.id,
      preview: hoveredId === node.id && hoveredId !== selectedId,
      related,
      dim: Boolean(focusId) && !related,
    };
  };

  const selectNode = (nodeId: string) => {
    setSelectedId(nodeId);
  };

  return (
    <section
      id="evidence"
      className="home-evidence"
      aria-labelledby="home-evidence-title"
    >
      <div className="home-evidence__inner">
        <div className="home-evidence__intro">
          <p className="home-graph__illustrative">
            {HOME_COPY.evidence.illustrative}
          </p>
          <h2 id="home-evidence-title" className="type-page-title">
            {HOME_COPY.evidence.heading}
          </h2>
          <p className="home-evidence__copy type-lead">
            {HOME_COPY.evidence.body}
          </p>
          <div className="home-graph__legend" aria-label="Graph legend">
            <span>
              <span
                className="home-legend__line home-legend__line--assignment"
                aria-hidden="true"
              />
              {HOME_COPY.evidence.legend.assignment}
            </span>
            <span>
              <span
                className="home-legend__line home-legend__line--citation"
                aria-hidden="true"
              />
              {HOME_COPY.evidence.legend.citation}
            </span>
          </div>
        </div>

        <div className="home-graph">
          <div
            className="home-graph__map"
            role="group"
            aria-label="Illustrative evidence star map"
          >
            <svg
              className="home-graph__sky"
              viewBox="0 0 1000 600"
              aria-hidden="true"
              focusable="false"
            >
              <defs>
                <radialGradient id="home-map-nebula" cx="50%" cy="48%" r="60%">
                  <stop offset="0%" stopColor="var(--home-map-core)" />
                  <stop offset="58%" stopColor="var(--home-map-mid)" />
                  <stop offset="100%" stopColor="transparent" />
                </radialGradient>
              </defs>
              <rect width="1000" height="600" fill="url(#home-map-nebula)" />
              {MAP_STARS.map((star, index) => (
                <circle
                  key={`${star.x}-${star.y}-${index}`}
                  cx={star.x}
                  cy={star.y}
                  r={star.radius}
                  className="home-graph__sky-star"
                  opacity={star.opacity}
                />
              ))}
            </svg>

            <svg
              className="home-graph__edges"
              viewBox="0 0 1000 600"
              aria-hidden="true"
              focusable="false"
            >
              {EVIDENCE_EDGES.map((edge) => {
                const active = edge.from === focusId || edge.to === focusId;
                return (
                  <path
                    key={edge.id}
                    className="home-graph__edge"
                    data-kind={edge.kind}
                    data-active={active}
                    data-dim={!active}
                    d={edgePath(edge)}
                  />
                );
              })}
            </svg>

            {EVIDENCE_NODES.map((node) => {
              const state = nodeState(node);
              return (
                <button
                  key={node.id}
                  type="button"
                  className="home-graph__node"
                  style={nodeStyle(node)}
                  aria-pressed={state.selected}
                  data-kind={node.kind}
                  data-selected={state.selected}
                  data-preview={state.preview}
                  data-related={state.related}
                  data-dim={state.dim}
                  onClick={() => selectNode(node.id)}
                  onMouseEnter={() => setHoveredId(node.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  onFocus={() => setHoveredId(node.id)}
                  onBlur={() => setHoveredId(null)}
                >
                  <NodeMark node={node} />
                  <NodeLabel node={node} />
                </button>
              );
            })}
          </div>

          <div className="home-graph__mobile">
            <h3 className="type-item-title">Connections</h3>
            <ul className="home-graph__node-list">
              {EVIDENCE_NODES.map((node) => {
                const state = nodeState(node);
                return (
                  <li key={node.id}>
                    <button
                      type="button"
                      className="home-graph__node-list-button"
                      aria-pressed={state.selected}
                      data-kind={node.kind}
                      data-selected={state.selected}
                      style={nodeStyle(node)}
                      onClick={() => selectNode(node.id)}
                    >
                      <NodeMark node={node} />
                      <NodeLabel node={node} />
                    </button>
                  </li>
                );
              })}
            </ul>

            <details className="home-graph__reading">
              <summary>{HOME_COPY.evidence.readingLabel}</summary>
              <ConnectionList />
            </details>
          </div>

          <div
            className="home-graph__hud"
            aria-live="polite"
            aria-atomic="true"
          >
            <div className="home-graph__hud-identity">
              <p className="home-graph__hud-label">
                {HOME_COPY.evidence.detailLabel}
              </p>
              <h3 className="type-item-title">{selectedNode.name}</h3>
              <p className="home-graph__hud-kind">{selectedNode.kindLabel}</p>
            </div>
            <p className="home-graph__hud-copy">{selectedNode.description}</p>
            <div className="home-graph__hud-connections">
              <h4>{HOME_COPY.evidence.connectionsLabel}</h4>
              {selectedAssignments.length ? (
                <div className="home-graph__hud-group">
                  <p>{edgeKindLabel("assignment")}</p>
                  <ul>
                    {selectedAssignments.map((edge) => {
                      const other =
                        edge.from === selectedId ? edge.to : edge.from;
                      return <li key={edge.id}>{evidenceNodeName(other)}</li>;
                    })}
                  </ul>
                </div>
              ) : null}
              {selectedCitations.length ? (
                <div className="home-graph__hud-group">
                  <p>{edgeKindLabel("citation")}</p>
                  <ul>
                    {selectedCitations.map((edge) => {
                      const other =
                        edge.from === selectedId ? edge.to : edge.from;
                      return <li key={edge.id}>{evidenceNodeName(other)}</li>;
                    })}
                  </ul>
                </div>
              ) : null}
              {!selectedAssignments.length && !selectedCitations.length ? (
                <p className="home-graph__hud-empty">
                  No direct connections in this illustrative view.
                </p>
              ) : null}
            </div>
          </div>
        </div>

        <details className="home-graph__reading home-graph__reading--desktop">
          <summary>{HOME_COPY.evidence.readingLabel}</summary>
          <ConnectionList />
        </details>

        <Link href="/demo" className="home-evidence__demo-link">
          <span>{HOME_COPY.evidence.demoLink}</span>
          <ArrowUpRight className="size-4" aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}
