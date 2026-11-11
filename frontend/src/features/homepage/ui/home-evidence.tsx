"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { ArrowUpRight, X } from "lucide-react";

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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const detailId = hoveredId ?? selectedId;
  const detailNode = detailId
    ? (EVIDENCE_NODE_BY_ID.get(detailId) ?? null)
    : null;
  const detailEdges = useMemo(
    () => (detailId ? evidenceEdgesFor(detailId) : []),
    [detailId],
  );
  const detailAssignments = detailEdges.filter(
    (edge) => edge.kind === "assignment",
  );
  const detailCitations = detailEdges.filter(
    (edge) => edge.kind === "citation",
  );
  const pinned = Boolean(selectedId && detailId === selectedId);

  const nodeState = (node: EvidenceNode) => {
    const related =
      detailId === node.id ||
      EVIDENCE_EDGES.some(
        (edge) =>
          (edge.from === detailId && edge.to === node.id) ||
          (edge.to === detailId && edge.from === node.id),
      );

    return {
      selected: selectedId === node.id,
      preview: hoveredId === node.id && hoveredId !== selectedId,
      related,
      dim: Boolean(detailId) && !related,
    };
  };

  const selectNode = (nodeId: string) => {
    setSelectedId((current) => (current === nodeId ? null : nodeId));
  };

  useEffect(() => {
    if (!selectedId && !hoveredId) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setSelectedId(null);
      setHoveredId(null);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [selectedId, hoveredId]);
  return (
    <section
      id="evidence"
      className="home-evidence"
      aria-labelledby="home-evidence-title"
    >
      <div className="home-evidence__inner">
        <div className="home-evidence__intro">
          <p className="home-graph__eyebrow">
            {HOME_COPY.evidence.exampleLabel}
          </p>
          <h2 id="home-evidence-title" className="type-page-title">
            {HOME_COPY.evidence.heading}
          </h2>
          <p className="home-evidence__copy type-lead">
            {HOME_COPY.evidence.body}
          </p>
          <p className="home-graph__hint">{HOME_COPY.evidence.hint}</p>
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
          <p className="home-graph__illustrative">
            {HOME_COPY.evidence.illustrative}
          </p>
          <div
            className="home-graph__map"
            role="group"
            aria-label="Illustrative evidence star map"
            onClick={(event) => {
              if (event.target === event.currentTarget) {
                setSelectedId(null);
                setHoveredId(null);
              }
            }}
          >
            <svg
              className="home-graph__sky"
              viewBox="0 0 1000 600"
              preserveAspectRatio="none"
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
              preserveAspectRatio="none"
              aria-hidden="true"
              focusable="false"
            >
              {EVIDENCE_EDGES.map((edge) => {
            const active = edge.from === detailId || edge.to === detailId;
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
          </div>

          {detailNode ? (
            <aside
              className="home-graph__overlay"
              data-side={detailNode.x > 560 ? "left" : "right"}
              data-pinned={pinned}
              aria-live="polite"
              aria-atomic="true"
            >
              <div className="home-graph__overlay-head">
                <div className="home-graph__overlay-identity">
                  <p className="home-graph__overlay-label">
                    {HOME_COPY.evidence.detailLabel}
                  </p>
                  <h3 className="type-item-title">{detailNode.name}</h3>
                  <p className="home-graph__overlay-kind">
                    {detailNode.kindLabel}
                  </p>
                </div>
                {pinned ? (
                  <button
                    type="button"
                    className="home-graph__overlay-close"
                    aria-label="Close details"
                    onClick={() => {
                      setSelectedId(null);
                      setHoveredId(null);
                    }}
                  >
                    <X className="size-4" aria-hidden="true" />
                  </button>
                ) : null}
              </div>
              <p className="home-graph__overlay-copy">
                {detailNode.description}
              </p>
              <div className="home-graph__overlay-connections">
                <h4>{HOME_COPY.evidence.connectionsLabel}</h4>
                {detailAssignments.length ? (
                  <div className="home-graph__overlay-group">
                    <p>{edgeKindLabel("assignment")}</p>
                    <ul>
                      {detailAssignments.map((edge) => {
                        const other =
                          edge.from === detailNode.id
                            ? edge.to
                            : edge.from;
                        return (
                          <li key={edge.id}>{evidenceNodeName(other)}</li>
                        );
                      })}
                    </ul>
                  </div>
                ) : null}
                {detailCitations.length ? (
                  <div className="home-graph__overlay-group">
                    <p>{edgeKindLabel("citation")}</p>
                    <ul>
                      {detailCitations.map((edge) => {
                        const other =
                          edge.from === detailNode.id
                            ? edge.to
                            : edge.from;
                        return (
                          <li key={edge.id}>{evidenceNodeName(other)}</li>
                        );
                      })}
                    </ul>
                  </div>
                ) : null}
                {!detailAssignments.length && !detailCitations.length ? (
                  <p className="home-graph__overlay-empty">
                    No direct connections in this illustrative view.
                  </p>
                ) : null}
              </div>
              <details className="home-graph__reading">
                <summary>{HOME_COPY.evidence.readingLabel}</summary>
                <ConnectionList />
              </details>
            </aside>
          ) : null}
        </div>

        <Link href="/demo" className="home-evidence__demo-link">
          <span>{HOME_COPY.evidence.demoLink}</span>
          <ArrowUpRight className="size-4" aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}
