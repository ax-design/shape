import { IDENTITY, apply, invert, isIdentity, scaleAt } from './homography.js';
import type { Homography } from './homography.js';
import { formatNumber } from './emit.js';
import { arcSweep } from './math.js';
import type { Contour, Point, Quad, Segment } from './types.js';

export interface BorderOptions {
    // Border width per side in local px.
    widths: Quad<number>;
    // Tilt of the surface. The border keeps the same thickness everywhere on screen
    // (rule D): width * scale at the surface center.
    transform?: Homography;
    // Center used for the thickness scale, in local px.
    center?: Point;
    // Maximum chord error of the arc sampling, in screen px. Pass 0.1 / devicePixelRatio
    // for 0.1 device px.
    tolerance?: number;
}

// The inner edge of a border ring as a closed polyline in local coordinates. Filled together
// with the outline using the even-odd rule it gives the ring.
export interface BorderResult {
    inner: Point[];
    // Thickness on screen.
    thickness: Quad<number>;
}

interface Edge {
    a: Point;
    b: Point;
    width: number;
}

export function borderInner(outline: Contour, options: BorderOptions): BorderResult {
    const h = options.transform || IDENTITY;
    const tolerance = options.tolerance || 0.1;
    const identity = isIdentity(h);
    const centerScale = identity ? 1 : scaleAt(h, options.center || centerOf(outline));
    const thickness = options.widths.map((w) => Math.max(0, w) * centerScale) as Quad<number>;

    const edges = sampleEdges(outline.segments, h, identity, thickness, tolerance);
    if (edges.length < 3) return { inner: [], thickness };

    // Orientation of the screen polygon decides which normal points inward.
    let area = 0;
    for (const e of edges) area += e.a.x * e.b.y - e.b.x * e.a.y;
    const inwardSign = area >= 0 ? 1 : -1;

    const inner = offsetPolygon(edges, inwardSign);
    const inverse = identity ? IDENTITY : invert(h);
    const back = identity ? inner : inner.map((p) => apply(inverse, p));
    return { inner: back, thickness };
}

function centerOf(outline: Contour): Point {
    let left = Infinity;
    let top = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;
    for (const s of outline.segments) {
        left = Math.min(left, s.x0, s.x1);
        right = Math.max(right, s.x0, s.x1);
        top = Math.min(top, s.y0, s.y1);
        bottom = Math.max(bottom, s.y0, s.y1);
    }
    return { x: (left + right) / 2, y: (top + bottom) / 2 };
}

function sampleEdges(segments: Segment[], h: Homography, identity: boolean, thickness: Quad<number>, tolerance: number): Edge[] {
    const map = (p: Point) => (identity ? p : apply(h, p));
    const edges: Edge[] = [];
    const pushEdge = (a: Point, b: Point, width: number) => {
        if (Math.hypot(b.x - a.x, b.y - a.y) < 1e-9) return;
        edges.push({ a, b, width });
    };
    for (const s of segments) {
        if (s.type === 'line') {
            pushEdge(map({ x: s.x0, y: s.y0 }), map({ x: s.x1, y: s.y1 }), thickness[s.side]);
            continue;
        }
        const sweep = arcSweep(s.start, s.end, s.anticlockwise);
        const screenRadius = s.r * (identity ? 1 : scaleAt(h, { x: s.cx, y: s.cy }) * 1.5);
        const step = screenRadius > tolerance ? 2 * Math.acos(1 - tolerance / screenRadius) : Math.PI;
        const n = Math.min(512, Math.max(1, Math.ceil(Math.abs(sweep) / step)));
        let prev = map({ x: s.x0, y: s.y0 });
        for (let j = 1; j <= n; j++) {
            const a = s.start + (sweep * j) / n;
            const next = j === n ? map({ x: s.x1, y: s.y1 }) : map({ x: s.cx + s.r * Math.cos(a), y: s.cy + s.r * Math.sin(a) });
            const t = (j - 0.5) / n;
            pushEdge(prev, next, thickness[s.side] * (1 - t) + thickness[s.sideEnd] * t);
            prev = next;
        }
    }
    return edges;
}

// The outline as seen through a tilt: a closed polyline in screen coordinates, its arcs sampled
// within `tolerance` screen px. For layers that draw the projected shape themselves (Firefox,
// where no 3D transform may sit above acrylic) rather than under a CSS transform.
export function projectContour(outline: Contour, transform: Homography, tolerance = 0.1): Point[] {
    const identity = isIdentity(transform);
    const none: Quad<number> = [0, 0, 0, 0];
    const points: Point[] = [];
    for (const e of sampleEdges(outline.segments, transform, identity, none, tolerance)) points.push(e.a);
    return points;
}

function intersect(p: Point, d: Point, q: Point, e: Point): Point | null {
    const denom = d.x * e.y - d.y * e.x;
    if (Math.abs(denom) < 1e-12) return null;
    const t = ((q.x - p.x) * e.y - (q.y - p.y) * e.x) / denom;
    return { x: p.x + d.x * t, y: p.y + d.y * t };
}

// Offsets every edge inward by its width, joins neighbors at the intersection of their offset
// lines (miter, rule C2) and drops edges that turned around (rule C1).
function offsetPolygon(edges: Edge[], inwardSign: number): Point[] {
    interface Line {
        p: Point;
        d: Point;
        // Direction of the original edge, to detect reversal.
        dir: Point;
    }
    let lines: Line[] = edges.map((e) => {
        const len = Math.hypot(e.b.x - e.a.x, e.b.y - e.a.y);
        const d = { x: (e.b.x - e.a.x) / len, y: (e.b.y - e.a.y) / len };
        const n = { x: -d.y * inwardSign, y: d.x * inwardSign };
        return { p: { x: e.a.x + n.x * e.width, y: e.a.y + n.y * e.width }, d, dir: d };
    });

    const joinPoint = (l0: Line, l1: Line): Point => {
        const hit = intersect(l0.p, l0.d, l1.p, l1.d);
        if (hit) return hit;
        // Parallel neighbors: the start of the next offset line continues the previous one.
        return l1.p;
    };

    // Removing a reversed edge changes its neighbors' joins, so repeat until stable.
    for (let guard = 0; guard < 4 * lines.length && lines.length >= 3; guard++) {
        const count = lines.length;
        const points = lines.map((l, i) => joinPoint(lines[(i + count - 1) % count], l));
        let removed = -1;
        for (let i = 0; i < count; i++) {
            const a = points[i];
            const b = points[(i + 1) % count];
            const along = (b.x - a.x) * lines[i].dir.x + (b.y - a.y) * lines[i].dir.y;
            if (along < -1e-9) {
                removed = i;
                break;
            }
        }
        if (removed < 0) return points;
        lines = lines.filter((_, i) => i !== removed);
    }
    return [];
}

// Even-odd ring: the outline followed by the inner polyline.
export interface RingSink {
    moveTo(x: number, y: number): void;
    lineTo(x: number, y: number): void;
    closePath(): void;
}

export function traceInner(sink: RingSink, inner: Point[]): void {
    if (inner.length < 3) return;
    sink.moveTo(inner[0].x, inner[0].y);
    for (let i = 1; i < inner.length; i++) sink.lineTo(inner[i].x, inner[i].y);
    sink.closePath();
}

export function innerToSvgPath(inner: Point[], precision = 3): string {
    if (inner.length < 3) return '';
    const n = (x: number) => formatNumber(x, precision);
    return `M${inner.map((p) => `${n(p.x)} ${n(p.y)}`).join(' L')} Z`;
}
