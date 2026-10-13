import { EPSILON, add, arcDirection, angleOf, arcSweep, cross, distance, dot, normalize, scale, sub } from './math.js';
import type { Clamp, Contour, Point, Quad, ResolvedShape, Segment, ShapeSpec, Vertex } from './types.js';

// Edge features with a narrower base (in px) are drawn as a flat edge.
const MIN_FEATURE_SPAN = 0.5;

export interface ResolveOptions {
    // Border width per side, used to keep inward features from crossing (rule B4).
    borderWidths?: Quad<number>;
    // Extra thickness kept between opposite inward features. Defaults to 2 * max border width.
    minNeck?: number;
}

// Segment from this node to the next one is a circular arc when `arc` is set.
interface Node {
    p: Point;
    radius: number;
    side: number;
    arc?: { center: Point; r: number; through: Point };
}

const INWARD_X = [1, -1, -1, 1];
const INWARD_Y = [1, 1, -1, -1];

export function resolve(spec: ShapeSpec, options: ResolveOptions = {}): ResolvedShape {
    const { width: w, height: h } = spec;
    const clamps: Clamp[] = [];
    const borders = options.borderWidths || [0, 0, 0, 0];
    const minNeck = options.minNeck !== undefined ? options.minNeck : 2 * Math.max(borders[0], borders[1], borders[2], borders[3]);

    // B1: shifts along one edge may not exceed the edge.
    const shiftX = spec.corners.map((c) => c.shiftX);
    const shiftY = spec.corners.map((c) => c.shiftY);
    const fitShifts = (values: number[], a: number, b: number, limit: number, index: number) => {
        const sum = Math.max(0, values[a]) + Math.max(0, values[b]);
        if (sum > limit) {
            const factor = limit / sum;
            if (values[a] > 0) values[a] *= factor;
            if (values[b] > 0) values[b] *= factor;
            clamps.push({ kind: 'corner-shift', index, factor });
        }
    };
    fitShifts(shiftX, 0, 1, w, 0);
    fitShifts(shiftX, 3, 2, w, 2);
    fitShifts(shiftY, 1, 2, h, 1);
    fitShifts(shiftY, 0, 3, h, 3);

    const base: Point[] = [
        { x: 0, y: 0 },
        { x: w, y: 0 },
        { x: w, y: h },
        { x: 0, y: h },
    ];
    const P = base.map((p, i) => ({ x: p.x + INWARD_X[i] * shiftX[i], y: p.y + INWARD_Y[i] * shiftY[i] }));

    const edgeLength = [0, 1, 2, 3].map((i) => distance(P[i], P[(i + 1) % 4]));
    const edgeDir = [0, 1, 2, 3].map((i) => normalize(sub(P[(i + 1) % 4], P[i])));
    // Outward normal for a clockwise contour on a y-down screen.
    const edgeNormal = edgeDir.map((e) => ({ x: e.y, y: -e.x }));

    // Corners moved onto the same point merge into one vertex. `rep[i]` is the corner that
    // carries corner i; `kept` lists the distinct corners in contour order.
    const rep = [0, 1, 2, 3];
    const kept: number[] = [];
    for (let i = 0; i < 4; i++) {
        const last = kept[kept.length - 1];
        if (last !== undefined && distance(P[i], P[last]) < EPSILON) rep[i] = last;
        else kept.push(i);
    }
    if (kept.length > 1 && distance(P[kept[kept.length - 1]], P[kept[0]]) < EPSILON) {
        const dropped = kept.pop()!;
        for (let i = 0; i < 4; i++) if (rep[i] === dropped) rep[i] = kept[0];
    }
    if (kept.length < 3) {
        return { outline: { segments: [] }, vertices: [], bounds: { left: 0, top: 0, right: 0, bottom: 0 }, clamps };
    }
    const keptIndex = (c: number) => kept.indexOf(c);
    const prevKept = (c: number) => kept[(keptIndex(c) + kept.length - 1) % kept.length];
    const nextKept = (c: number) => kept[(keptIndex(c) + 1) % kept.length];
    const collapsed = (side: number) => rep[side] === rep[(side + 1) % 4];

    // B2: corner tangent lengths. Each corner is limited by its two adjacent edges. For
    // symmetric shapes this equals the uniform CSS border-radius scaling; it differs only when
    // shifts make one edge much shorter, which must not flatten corners elsewhere.
    const radii = [0, 0, 0, 0];
    for (let i = 0; i < 4; i++) radii[rep[i]] = Math.max(radii[rep[i]], Math.max(0, spec.corners[i].radius));
    const tangents = [0, 0, 0, 0];
    const cornerAngle = [0, 0, 0, 0];
    for (const c of kept) {
        const u = normalize(sub(P[prevKept(c)], P[c]));
        const v = normalize(sub(P[nextKept(c)], P[c]));
        cornerAngle[c] = Math.acos(Math.max(-1, Math.min(1, dot(u, v))));
        tangents[c] = cornerAngle[c] < EPSILON ? 0 : radii[c] / Math.tan(cornerAngle[c] / 2);
    }
    const cornerFactor = [1, 1, 1, 1];
    for (const c of kept) {
        const d = nextKept(c);
        const sum = tangents[c] + tangents[d];
        const len = distance(P[c], P[d]);
        if (sum > len + EPSILON) {
            const f = len / sum;
            cornerFactor[c] = Math.min(cornerFactor[c], f);
            cornerFactor[d] = Math.min(cornerFactor[d], f);
        }
    }
    for (const c of kept) {
        if (cornerFactor[c] >= 1) continue;
        radii[c] *= cornerFactor[c];
        tangents[c] *= cornerFactor[c];
        clamps.push({ kind: 'corner-radius', index: c, factor: cornerFactor[c] });
    }
    const tangentAtSide = (corner: number) => tangents[rep[corner]];

    // B3: feature span and position inside the straight part of each edge.
    const features = spec.edges.map((edge, i) => {
        const active = edge.kind !== 'flat' && edge.depth !== 0 && edge.span > 0 && !collapsed(i);
        if (!active) return null;
        const start = tangentAtSide(i);
        const end = edgeLength[i] - tangentAtSide((i + 1) % 4);
        const available = Math.max(0, end - start);
        let span = edge.span;
        if (span > available) {
            clamps.push({ kind: 'edge-span', index: i, factor: available / span });
            span = available;
        }
        // Narrower than half a pixel: nothing to see, but the tip would still move the bounds
        // (a needle as deep as the feature). Mid-animation spans pass through here.
        if (span < MIN_FEATURE_SPAN) return null;
        const half = span / 2;
        const center = Math.min(Math.max(edge.at * edgeLength[i], start + half), end - half);
        let depth = edge.depth;
        if (edge.kind === 'arc' && Math.abs(depth) > half) {
            // A circular segment deeper than a semicircle is not supported.
            clamps.push({ kind: 'edge-depth', index: i, factor: half / Math.abs(depth) });
            depth = Math.sign(depth) * half;
        }
        return { span, center, depth };
    });

    // B4: inward features on opposite edges keep a neck between them.
    const fitDepths = (a: number, b: number, extent: number) => {
        const fa = features[a];
        const fb = features[b];
        const inA = fa && fa.depth < 0 ? -fa.depth : 0;
        const inB = fb && fb.depth < 0 ? -fb.depth : 0;
        const limit = Math.max(0, extent - borders[a] - borders[b] - minNeck);
        if (inA + inB > limit) {
            const factor = limit / (inA + inB);
            if (fa && fa.depth < 0) fa.depth *= factor;
            if (fb && fb.depth < 0) fb.depth *= factor;
            clamps.push({ kind: 'edge-depth', index: a, factor });
        }
    };
    fitDepths(0, 2, h);
    fitDepths(1, 3, w);

    const nodes: Node[] = [];
    const vertices: Vertex[] = [];
    const push = (p: Point, radius: number, side: number, arc?: Node['arc']) => {
        const last = nodes[nodes.length - 1];
        if (last && !last.arc && distance(last.p, p) < EPSILON) {
            // Coincident points collapse into one vertex.
            last.radius = Math.max(last.radius, radius);
            last.side = side;
            last.arc = arc;
            return;
        }
        nodes.push({ p, radius, side, arc });
    };

    for (let i = 0; i < 4; i++) {
        const prevSide = (i + 3) % 4;
        const corner = spec.corners[i];
        const t = tangents[i];
        if (rep[i] !== i) {
            // Merged into an earlier corner, which already emitted the vertex.
        } else if (t < EPSILON) {
            push(P[i], 0, i);
        } else {
            const A = add(P[i], scale(normalize(sub(P[prevKept(i)], P[i])), t));
            const B = add(P[i], scale(normalize(sub(P[nextKept(i)], P[i])), t));
            const notchPoint = sub(add(A, B), P[i]);
            switch (corner.shape) {
                case 'round':
                    push(A, 0, prevSide);
                    push(P[i], radii[i], i);
                    push(B, 0, i);
                    break;
                case 'bevel':
                    push(A, 0, prevSide);
                    push(B, 0, i);
                    break;
                case 'notch':
                    push(A, 0, prevSide);
                    push(notchPoint, 0, i);
                    push(B, 0, i);
                    break;
                case 'scoop':
                    push(A, 0, prevSide);
                    push(notchPoint, radii[i], i);
                    push(B, 0, i);
                    break;
            }
        }

        const f = features[i];
        if (!f) continue;
        const edge = spec.edges[i];
        const e = edgeDir[i];
        const n = edgeNormal[i];
        const along = (s: number, out: number) => add(add(P[i], scale(e, s)), scale(n, out));
        const half = f.span / 2;
        if (edge.kind === 'arc') {
            const s0 = along(f.center - half, 0);
            const s1 = along(f.center + half, 0);
            const d = f.depth;
            const r = (half * half + d * d) / (2 * Math.abs(d));
            const apex = along(f.center, d);
            const center = add(apex, scale(n, d > 0 ? -r : r));
            push(s0, Math.max(0, edge.shoulderRadius), i, { center, r, through: apex });
            push(s1, Math.max(0, edge.shoulderRadius), i);
        } else {
            const ratio = edge.kind === 'rect' ? 1 : edge.kind === 'triangle' ? 0 : Math.max(0, Math.min(1, edge.ratio));
            const top = f.span * ratio;
            push(along(f.center - half, 0), Math.max(0, edge.shoulderRadius), i);
            push(along(f.center - top / 2, f.depth), Math.max(0, edge.tipRadius), i);
            push(along(f.center + top / 2, f.depth), Math.max(0, edge.tipRadius), i);
            push(along(f.center + half, 0), Math.max(0, edge.shoulderRadius), i);
        }
    }

    // Close the loop: the last node may coincide with the first.
    if (nodes.length > 1 && !nodes[nodes.length - 1].arc && distance(nodes[nodes.length - 1].p, nodes[0].p) < EPSILON) {
        const last = nodes.pop()!;
        nodes[0].radius = Math.max(nodes[0].radius, last.radius);
    }

    for (const node of nodes) vertices.push({ x: node.p.x, y: node.p.y, radius: node.radius, side: node.side });

    const outline = roundNodes(nodes, clamps);
    return { outline, vertices, bounds: boundsOf(outline), clamps };
}

interface Fillet {
    // End of the incoming segment and start of the outgoing segment.
    inPoint: Point;
    outPoint: Point;
    arc?: { center: Point; r: number; through: Point };
}

function roundNodes(nodes: Node[], clamps: Clamp[]): Contour {
    const count = nodes.length;
    const prev = (k: number) => nodes[(k + count - 1) % count];
    const next = (k: number) => nodes[(k + 1) % count];

    // Desired tangent length per node, then B5 scaling per straight segment. A line-line fillet
    // takes its length on both segments, a shoulder (line-arc fillet) only on its straight
    // segment. Both ends of a segment shrink together, so a corner next to a feature shoulder
    // never overlaps it.
    const angle = new Array<number>(count).fill(0);
    const tangent = new Array<number>(count).fill(0);
    const shoulders: (Shoulder | null)[] = new Array(count).fill(null);
    for (let k = 0; k < count; k++) {
        const node = nodes[k];
        if (node.radius <= 0) continue;
        if (node.arc || prev(k).arc) {
            const shoulder = shoulderAt(nodes, k);
            if (shoulder) {
                shoulders[k] = shoulder;
                tangent[k] = shoulder.tangent(node.radius);
            }
            continue;
        }
        const u = normalize(sub(prev(k).p, node.p));
        const v = normalize(sub(next(k).p, node.p));
        const theta = Math.acos(Math.max(-1, Math.min(1, dot(u, v))));
        if (theta < 1e-6 || Math.PI - theta < 1e-6) continue;
        angle[k] = theta;
        tangent[k] = node.radius / Math.tan(theta / 2);
    }
    const factor = new Array<number>(count).fill(1);
    for (let k = 0; k < count; k++) {
        if (nodes[k].arc) continue;
        const k1 = (k + 1) % count;
        // A shoulder whose straight segment is the other one takes nothing here.
        const start = shoulders[k] && shoulders[k]!.arcOut ? 0 : tangent[k];
        const end = shoulders[k1] && !shoulders[k1]!.arcOut ? 0 : tangent[k1];
        const sum = start + end;
        const len = distance(nodes[k].p, nodes[k1].p);
        if (sum > len * (1 + 1e-9) && sum > 0) {
            const f = len / sum;
            factor[k] = Math.min(factor[k], f);
            factor[k1] = Math.min(factor[k1], f);
        }
    }

    const fillets: Fillet[] = nodes.map((node, k) => {
        const plain = { inPoint: node.p, outPoint: node.p };
        if (node.radius <= 0) return plain;
        if (node.arc || prev(k).arc) {
            const shoulder = shoulders[k];
            return (shoulder && lineArcFillet(shoulder, node.radius, tangent[k] * factor[k], k, clamps)) || plain;
        }
        if (tangent[k] === 0) return plain;
        if (factor[k] < 1) clamps.push({ kind: 'vertex-radius', index: k, factor: factor[k] });
        const r = node.radius * factor[k];
        const t = tangent[k] * factor[k];
        const u = normalize(sub(prev(k).p, node.p));
        const v = normalize(sub(next(k).p, node.p));
        const bisector = normalize(add(u, v));
        const center = add(node.p, scale(bisector, r / Math.sin(angle[k] / 2)));
        return {
            inPoint: add(node.p, scale(u, t)),
            outPoint: add(node.p, scale(v, t)),
            arc: { center, r, through: add(center, scale(normalize(sub(node.p, center)), r)) },
        };
    });

    const segments: Segment[] = [];
    const pushArc = (center: Point, r: number, p0: Point, p1: Point, through: Point, side: number, sideEnd: number) => {
        if (distance(p0, p1) < EPSILON) return;
        segments.push({
            type: 'arc',
            cx: center.x,
            cy: center.y,
            r,
            start: angleOf(center, p0),
            end: angleOf(center, p1),
            anticlockwise: arcDirection(center, p0, p1, through),
            x0: p0.x,
            y0: p0.y,
            x1: p1.x,
            y1: p1.y,
            side,
            sideEnd,
        });
    };
    for (let k = 0; k < count; k++) {
        const node = nodes[k];
        const fillet = fillets[k];
        if (fillet.arc) pushArc(fillet.arc.center, fillet.arc.r, fillet.inPoint, fillet.outPoint, fillet.arc.through, nodes[(k + count - 1) % count].side, node.side);
        const from = fillet.outPoint;
        const to = fillets[(k + 1) % count].inPoint;
        if (node.arc) {
            pushArc(node.arc.center, node.arc.r, from, to, node.arc.through, node.side, node.side);
        } else if (distance(from, to) > EPSILON) {
            segments.push({ type: 'line', x0: from.x, y0: from.y, x1: to.x, y1: to.y, side: node.side });
        }
    }
    return { segments };
}

// A shoulder: the node where a straight base segment meets a circular feature arc.
interface Shoulder {
    // True when the arc leaves this node (the straight segment comes in).
    arcOut: boolean;
    // Point on the straight segment at distance `os` from the node (negative: away from the arc)
    // and the fillet center, for a fillet radius; null when no fillet of that radius touches
    // both.
    solve(rho: number): { os: number; center: Point } | null;
    // Length the fillet takes on the straight segment, at most the whole segment.
    tangent(rho: number): number;
    node: Point;
    // Unit direction along the straight segment, toward the node.
    dir: Point;
    arc: { center: Point; r: number };
}

function shoulderAt(nodes: Node[], k: number): Shoulder | null {
    const count = nodes.length;
    const node = nodes[k];
    const before = nodes[(k + count - 1) % count];
    const after = nodes[(k + 1) % count];
    const arcOut = !!node.arc;
    const arc = arcOut ? node.arc! : before.arc!;
    // `lineEnd` is the far end of the straight segment that meets the arc at this node.
    const lineEnd = arcOut ? before.p : after.p;
    if (arcOut ? before.arc : after.arc) return null;

    const S = node.p;
    const e = normalize(sub(S, lineEnd));
    const n0 = { x: -e.y, y: e.x };
    // The fillet sits on the side the feature extends to. The arc center cannot decide this:
    // for a semicircle it lies on the base line.
    const n = dot(sub(arc.through, S), n0) < 0 ? scale(n0, -1) : n0;
    const cs = dot(sub(arc.center, S), e);
    const cn = dot(sub(arc.center, S), n);
    const R = arc.r;
    const available = distance(S, lineEnd);

    const solve = (rho: number) => {
        const radicand = (R + rho) * (R + rho) - (rho - cn) * (rho - cn);
        if (radicand < 0) return null;
        const os = cs - Math.sqrt(radicand);
        return { os, center: add(add(S, scale(e, os)), scale(n, rho)) };
    };
    const tangent = (rho: number) => {
        const solved = solve(rho);
        return solved ? Math.min(available, Math.max(0, -solved.os)) : available;
    };
    return { arcOut, solve, tangent, node: S, dir: e, arc };
}

// Fillet between a straight base segment and a circular feature arc at a shoulder, taking at
// most `room` of the straight segment.
function lineArcFillet(shoulder: Shoulder, radius: number, room: number, k: number, clamps: Clamp[]): Fillet | null {
    const { solve, arc } = shoulder;
    let rho = radius;
    let solved = solve(rho);
    if (!solved || -solved.os > room) {
        // Shrink until the tangent point fits.
        let lo = 0;
        let hi = rho;
        for (let i = 0; i < 40; i++) {
            const mid = (lo + hi) / 2;
            const s = solve(mid);
            if (s && -s.os <= room) lo = mid;
            else hi = mid;
        }
        clamps.push({ kind: 'vertex-radius', index: k, factor: rho > 0 ? lo / rho : 0 });
        rho = lo;
        solved = solve(rho);
        if (!solved || rho < EPSILON) return null;
    }
    const { node: S, dir, arcOut } = shoulder;
    const center = solved.center;
    const onLine = add(S, scale(dir, solved.os));
    const onArc = add(arc.center, scale(normalize(sub(center, arc.center)), arc.r));
    const through = add(center, scale(normalize(sub(S, center)), rho));
    const filletArc = { center, r: rho, through };
    return arcOut
        ? { inPoint: onLine, outPoint: onArc, arc: filletArc }
        : { inPoint: onArc, outPoint: onLine, arc: filletArc };
}

function boundsOf(contour: Contour) {
    let left = Infinity;
    let top = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;
    const include = (x: number, y: number) => {
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
    };
    for (const s of contour.segments) {
        include(s.x0, s.y0);
        include(s.x1, s.y1);
        if (s.type !== 'arc') continue;
        for (let q = 0; q < 4; q++) {
            const a = (q * Math.PI) / 2;
            if (angleInArc(a, s.start, s.end, s.anticlockwise)) include(s.cx + s.r * Math.cos(a), s.cy + s.r * Math.sin(a));
        }
    }
    return { left, top, right, bottom };
}

function angleInArc(a: number, start: number, end: number, anticlockwise: boolean): boolean {
    const TAU = Math.PI * 2;
    const norm = (x: number) => ((x % TAU) + TAU) % TAU;
    return anticlockwise ? norm(start - a) <= norm(start - end) : norm(a - start) <= norm(end - start);
}

// Exported for tests: signed area of a contour (positive when clockwise on screen).
export function signedArea(contour: Contour): number {
    let area = 0;
    for (const s of contour.segments) {
        if (s.type === 'line') {
            area += cross({ x: s.x0, y: s.y0 }, { x: s.x1, y: s.y1 }) / 2;
        } else {
            // Chord term plus the circular segment between chord and arc.
            area += cross({ x: s.x0, y: s.y0 }, { x: s.x1, y: s.y1 }) / 2;
            const sweep = arcSweep(s.start, s.end, s.anticlockwise);
            area += (s.r * s.r * (sweep - Math.sin(sweep))) / 2;
        }
    }
    return area;
}

