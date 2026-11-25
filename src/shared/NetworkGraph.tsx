// 관계 그래프 (Cytoscape.js, cose 레이아웃). 인물 네트워크(5단계)와 신화 원형 아카이브(6단계)가 함께 쓴다.
import { useEffect, useImperativeHandle, useRef, type Ref } from 'react';
import cytoscape, { type Core } from 'cytoscape';

export type GraphNode = {
  id: string;
  label: string;
  /** 지름(px) */
  size: number;
  color: string;
  shape?: 'ellipse' | 'round-rectangle' | 'diamond' | 'triangle' | 'hexagon';
  /** 흐리게 (예: 등장하지 않은 인물) */
  faded?: boolean;
};

export type GraphEdge = { id: string; source: string; target: string; width: number; label?: string; dashed?: boolean };

export type NetworkGraphHandle = {
  /** PNG 데이터 주소 (흰 배경, 2배 해상도) */
  png: () => string | undefined;
  /** 레이아웃 다시 */
  relayout: () => void;
};

export function NetworkGraph({
  nodes,
  edges,
  selectedId,
  onNodeClick,
  height = 460,
  ref,
}: {
  nodes: GraphNode[];
  edges: GraphEdge[];
  selectedId?: string | null;
  onNodeClick?: (id: string | null) => void;
  height?: number;
  ref?: Ref<NetworkGraphHandle>;
}) {
  const box = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const clickRef = useRef(onNodeClick);
  clickRef.current = onNodeClick;

  const layout = () => cyRef.current?.layout({ name: 'cose', animate: false, padding: 30, nodeRepulsion: () => 9000, idealEdgeLength: () => 90, randomize: false }).run();

  useImperativeHandle(ref, () => ({
    png: () => cyRef.current?.png({ full: true, scale: 2, bg: '#ffffff', output: 'base64uri' }),
    relayout: layout,
  }));

  useEffect(() => {
    if (!box.current) return;
    const cy = cytoscape({
      container: box.current,
      minZoom: 0.3,
      maxZoom: 3,
      wheelSensitivity: 0.3,
      style: [
        {
          selector: 'node',
          style: {
            label: 'data(label)',
            width: 'data(size)',
            height: 'data(size)',
            'background-color': 'data(color)',
            shape: 'data(shape)' as never,
            'border-width': 2,
            'border-color': '#ffffff',
            'font-family': "'Pretendard Variable', Pretendard, sans-serif",
            'font-size': 12,
            color: '#1c1917',
            'text-valign': 'bottom',
            'text-margin-y': 4,
            'text-background-color': '#ffffff',
            'text-background-opacity': 0.8,
            'text-background-padding': '1px',
          },
        },
        { selector: 'node[?faded]', style: { opacity: 0.35 } },
        { selector: 'node:selected', style: { 'border-color': '#0f766e', 'border-width': 4 } },
        {
          selector: 'edge',
          style: {
            width: 'data(width)',
            'line-color': '#a8a29e',
            'curve-style': 'bezier',
            label: 'data(label)',
            'font-size': 10,
            color: '#57534e',
            'text-background-color': '#ffffff',
            'text-background-opacity': 0.9,
            'text-background-padding': '1px',
          },
        },
        { selector: 'edge[?dashed]', style: { 'line-style': 'dashed' } },
      ],
    });
    cy.on('tap', 'node', (e) => clickRef.current?.(e.target.id()));
    cy.on('tap', (e) => {
      if (e.target === cy) clickRef.current?.(null);
    });
    cyRef.current = cy;
    return () => {
      cy.destroy();
      cyRef.current = null;
    };
  }, []);

  // 데이터가 바뀌면 다시 그린다 (모양만 바뀌면 자리는 그대로)
  const shapeKey = JSON.stringify([nodes.map((n) => n.id), edges.map((e) => e.id)]);
  const lastShape = useRef('');
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const same = lastShape.current === shapeKey;
    cy.batch(() => {
      if (!same) {
        cy.elements().remove();
        cy.add([
          ...nodes.map((n) => ({ group: 'nodes' as const, data: { ...n, shape: n.shape ?? 'ellipse', label: n.label } })),
          ...edges.map((e) => ({ group: 'edges' as const, data: { ...e, label: e.label ?? '' } })),
        ]);
      } else {
        for (const n of nodes) cy.getElementById(n.id).data({ ...n, shape: n.shape ?? 'ellipse' });
        for (const e of edges) cy.getElementById(e.id).data({ ...e, label: e.label ?? '' });
      }
    });
    if (!same) {
      layout();
      cy.fit(undefined, 30);
      lastShape.current = shapeKey;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges, shapeKey]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.nodes().unselect();
    if (selectedId) cy.getElementById(selectedId).select();
  }, [selectedId, shapeKey]);

  return <div ref={box} style={{ height }} className="w-full rounded-md bg-stone-50" data-testid="network-graph" role="img" aria-label="관계 그래프" />;
}
