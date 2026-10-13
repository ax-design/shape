import { describe, expect, test } from 'bun:test';
import { resolve, signedArea } from './resolve.js';
import { toSvgPath, traceContour } from './emit.js';
import { arcSweep } from './math.js';
import { shape } from './test-utils.js';
import type { Contour, Segment } from './types.js';

const PI = Math.PI;

function segmentArea(R: number, halfChord: number) {
    const theta = 2 * Math.asin(halfChord / R);
    return (R * R * (theta - Math.sin(theta))) / 2;
}

// Structural invariants every resolved contour must satisfy.
function expectWellFormed(contour: Contour) {
    const s = contour.segments;
    expect(s.length).toBeGreaterThan(2);
    for (let i = 0; i < s.length; i++) {
        const a = s[i];
        const b = s[(i + 1) % s.length];
        expect(Math.hypot(a.x1 - b.x0, a.y1 - b.y0)).toBeLessThan(1e-6);
        if (a.type === 'arc') {
            expect(Math.hypot(a.x0 - a.cx, a.y0 - a.cy)).toBeCloseTo(a.r, 6);
            expect(Math.hypot(a.x1 - a.cx, a.y1 - a.cy)).toBeCloseTo(a.r, 6);
            expect(a.cx + a.r * Math.cos(a.start)).toBeCloseTo(a.x0, 6);
            expect(a.cy + a.r * Math.sin(a.end)).toBeCloseTo(a.y1, 6);
        }
    }
}

function tangentAt(s: Segment, end: boolean) {
    if (s.type === 'line') {
        const l = Math.hypot(s.x1 - s.x0, s.y1 - s.y0);
        return { x: (s.x1 - s.x0) / l, y: (s.y1 - s.y0) / l };
    }
    const a = end ? s.end : s.start;
    const dir = s.anticlockwise ? -1 : 1;
    return { x: -Math.sin(a) * dir, y: Math.cos(a) * dir };
}

// Joins between a fillet arc and its neighbors are tangent continuous.
function expectSmoothAroundArcs(contour: Contour) {
    const s = contour.segments;
    for (let i = 0; i < s.length; i++) {
        const a = s[i];
        const b = s[(i + 1) % s.length];
        if (a.type !== 'arc' && b.type !== 'arc') continue;
        const t0 = tangentAt(a, true);
        const t1 = tangentAt(b, false);
        expect(t0.x * t1.x + t0.y * t1.y).toBeGreaterThan(1 - 1e-6);
    }
}

describe('corners', () => {
    test('plain rectangle', () => {
        const r = resolve(shape(100, 40));
        expect(r.outline.segments.map((s) => s.type)).toEqual(['line', 'line', 'line', 'line']);
        expect(signedArea(r.outline)).toBeCloseTo(4000, 6);
        expect(r.bounds).toEqual({ left: 0, top: 0, right: 100, bottom: 40 });
    });

    test('round', () => {
        const r = resolve(shape(100, 40, { radius: 10 }));
        expectWellFormed(r.outline);
        expectSmoothAroundArcs(r.outline);
        expect(r.outline.segments.filter((s) => s.type === 'arc').length).toBe(4);
        expect(signedArea(r.outline)).toBeCloseTo(4000 - (4 - PI) * 100, 6);
    });

    test('radius budget matches border-radius scaling on symmetric shapes', () => {
        const r = resolve(shape(100, 40, { radius: 30 }));
        expectWellFormed(r.outline);
        expect(r.clamps.map((c) => [c.kind, c.index, c.factor])).toEqual(
            [0, 1, 2, 3].map((i) => ['corner-radius', i, 40 / 60])
        );
        expect(signedArea(r.outline)).toBeCloseTo(4000 - (4 - PI) * 400, 6);
    });

    test('bevel', () => {
        const r = resolve(shape(100, 40, { radius: 10, shape: 'bevel' }));
        expectWellFormed(r.outline);
        expect(signedArea(r.outline)).toBeCloseTo(4000 - 4 * 50, 6);
    });

    test('notch', () => {
        const r = resolve(shape(100, 40, { radius: 10, shape: 'notch' }));
        expectWellFormed(r.outline);
        expect(signedArea(r.outline)).toBeCloseTo(4000 - 4 * 100, 6);
    });

    test('scoop is a concave quarter circle around the corner', () => {
        const r = resolve(shape(100, 40, { radius: 10, shape: 'scoop' }));
        expectWellFormed(r.outline);
        // A scoop meets both edges at a right angle, like CSS corner-shape: scoop.
        expect(signedArea(r.outline)).toBeCloseTo(4000 - PI * 100, 6);
        const arcs = r.outline.segments.filter((s) => s.type === 'arc');
        expect(arcs.length).toBe(4);
        expect(arcs.every((a) => a.type === 'arc' && a.anticlockwise)).toBe(true);
    });

    test('mixed corners', () => {
        const r = resolve(
            shape(100, 40, [
                { radius: 10, shape: 'round' },
                { radius: 10, shape: 'bevel' },
                { radius: 10, shape: 'notch' },
                { radius: 10, shape: 'scoop' },
            ])
        );
        expectWellFormed(r.outline);
        expect(signedArea(r.outline)).toBeCloseTo(4000 - (4 - PI) * 25 - 50 - 100 - PI * 25, 6);
    });
});

describe('corner shift', () => {
    test('italic parallelogram', () => {
        const r = resolve(shape(100, 40, [{ shiftX: 20 }, {}, { shiftX: 20 }, {}]));
        expectWellFormed(r.outline);
        expect(signedArea(r.outline)).toBeCloseTo(4000 - 2 * ((20 * 40) / 2), 6);
    });

    test('shifts beyond the edge are scaled down', () => {
        const r = resolve(shape(100, 40, [{ shiftX: 80 }, { shiftX: 80 }, {}, {}]));
        expect(r.clamps[0]).toEqual({ kind: 'corner-shift', index: 0, factor: 100 / 160 });
        // Top edge collapses to a point: a triangle.
        expect(signedArea(r.outline)).toBeCloseTo(2000, 6);
    });

    test('rounded corners on a parallelogram stay tangent', () => {
        const r = resolve(shape(100, 40, [{ shiftX: 20, radius: 6 }, { radius: 6 }, { shiftX: 20, radius: 6 }, { radius: 6 }]));
        expectWellFormed(r.outline);
        expectSmoothAroundArcs(r.outline);
    });
});

describe('collapsed edges', () => {
    test('a collapsed edge merges its corners and does not flatten the others', () => {
        // Bottom corners meet at the bottom center: a V with round top corners.
        const r = resolve(shape(140, 80, [{ radius: 30 }, { radius: 30 }, { shiftX: 70, radius: 4 }, { shiftX: 70, radius: 4 }]));
        expectWellFormed(r.outline);
        expectSmoothAroundArcs(r.outline);
        const arcs = r.outline.segments.filter((s) => s.type === 'arc');
        expect(arcs.length).toBe(3);
        expect(arcs.some((a) => a.type === 'arc' && Math.abs(a.r - 30) < 1e-9)).toBe(true);
    });

    test('fewer than three distinct corners resolves to an empty outline', () => {
        const r = resolve(shape(100, 40, [{ shiftX: 50 }, { shiftX: 50 }, { shiftX: 50 }, { shiftX: 50 }]));
        expect(r.outline.segments.length).toBe(0);
    });
});

describe('edge features', () => {
    test('rect notch', () => {
        const r = resolve(shape(100, 40, {}, [{ kind: 'rect', depth: -10, span: 30 }]));
        expectWellFormed(r.outline);
        expect(signedArea(r.outline)).toBeCloseTo(4000 - 300, 6);
    });

    test('triangle bump extends the bounds', () => {
        const r = resolve(shape(100, 40, {}, [{ kind: 'triangle', depth: 10, span: 30 }]));
        expectWellFormed(r.outline);
        expect(signedArea(r.outline)).toBeCloseTo(4000 + 150, 6);
        expect(r.bounds.top).toBeCloseTo(-10, 9);
    });

    test('a feature narrower than half a pixel is a flat edge', () => {
        for (const kind of ['triangle', 'rect', 'trapezoid', 'arc'] as const) {
            const thin = resolve(shape(100, 40, {}, [{ kind, depth: 30, span: 0.0001 }]));
            expect(thin.bounds.top).toBe(0);
            expect(thin.outline.segments.length).toBe(4);
        }
        const visible = resolve(shape(100, 40, {}, [{ kind: 'triangle', depth: 30, span: 0.5 }]));
        expect(visible.bounds.top).toBeCloseTo(-30, 9);
    });

    test('trapezoid', () => {
        const r = resolve(shape(100, 40, {}, [{ kind: 'trapezoid', depth: 10, span: 40, ratio: 0.5 }]));
        expect(signedArea(r.outline)).toBeCloseTo(4000 + ((40 + 20) / 2) * 10, 6);
    });

    test('arc notch on both sides (Bun)', () => {
        const r = resolve(
            shape(100, 40, { radius: 8 }, [{}, { kind: 'arc', depth: -6, span: 20 }, {}, { kind: 'arc', depth: -6, span: 20 }])
        );
        expectWellFormed(r.outline);
        const R = (100 + 36) / 12;
        expect(signedArea(r.outline)).toBeCloseTo(4000 - (4 - PI) * 64 - 2 * segmentArea(R, 10), 6);
    });

    test('arc deeper than a semicircle is clamped', () => {
        const r = resolve(shape(100, 40, {}, [{ kind: 'arc', depth: 20, span: 20 }]));
        expect(r.clamps.some((c) => c.kind === 'edge-depth')).toBe(true);
        expect(r.bounds.top).toBeCloseTo(-10, 9);
        expect(signedArea(r.outline)).toBeCloseTo(4000 + (PI * 100) / 2, 6);
    });

    test('span is clamped to the straight part of the edge', () => {
        const r = resolve(shape(100, 40, { radius: 10 }, [{ kind: 'rect', depth: -5, span: 200 }]));
        expect(r.clamps.find((c) => c.kind === 'edge-span')?.factor).toBeCloseTo(80 / 200, 9);
    });

    test('opposite inward features keep a neck', () => {
        const r = resolve(shape(100, 40, {}, [{ kind: 'rect', depth: -30, span: 20 }, {}, { kind: 'rect', depth: -30, span: 20 }]), {
            borderWidths: [2, 2, 2, 2],
        });
        // 40 - 2 - 2 - minNeck(4) = 32 shared by two 30px notches.
        expect(r.clamps.find((c) => c.kind === 'edge-depth')?.factor).toBeCloseTo(32 / 60, 9);
        expect(signedArea(r.outline)).toBeCloseTo(4000 - 2 * 20 * 16, 6);
    });

    test('rounded triangle tip and shoulders', () => {
        const r = resolve(shape(100, 40, {}, [{ kind: 'triangle', depth: 12, span: 30, tipRadius: 4, shoulderRadius: 3 }]));
        expectWellFormed(r.outline);
        expectSmoothAroundArcs(r.outline);
        expect(r.outline.segments.filter((s) => s.type === 'arc').length).toBe(3);
    });

    test('shoulder fillet between base line and arc', () => {
        for (const depth of [6, -6, 10, -10]) {
            const r = resolve(shape(100, 40, {}, [{ kind: 'arc', depth, span: 20, shoulderRadius: 3 }]));
            expectWellFormed(r.outline);
            expectSmoothAroundArcs(r.outline);
            expect(r.outline.segments.filter((s) => s.type === 'arc').length).toBe(3);
        }
    });

    test('a corner and a feature shoulder share the straight part of the edge', () => {
        // The 4-sided cookie and the 4-leaf clover: the corner tangent and the shoulder used to
        // overlap, and the contour ran back along the edge between them.
        const cases: [number, number, number, number][] = [
            [74.8, -15.4, 96.8, 13.2],
            [66, -35.2, 88, 22],
        ];
        for (const [radius, depth, span, shoulderRadius] of cases) {
            const feature = { kind: 'arc' as const, depth, span, shoulderRadius };
            const r = resolve(shape(220, 220, { radius }, [feature, feature, feature, feature]));
            expectWellFormed(r.outline);
            expectSmoothAroundArcs(r.outline);
            expect(r.clamps.some((c) => c.kind === 'vertex-radius' && c.factor < 1)).toBe(true);
        }
    });

    test('cusp: two arcs tangent to the side at the span ends, rounded tip', () => {
        for (const depth of [-14, -8, 8, 14]) {
            for (const span of [40, 1000]) {
                const feature = { kind: 'cusp' as const, depth, span, tipRadius: 3 };
                const r = resolve(shape(100, 104, { radius: 26 }, [{}, feature, {}, feature]));
                expectWellFormed(r.outline);
                // Tangent continuous everywhere: at the span ends, at the corners and at the tip.
                expectSmoothAroundArcs(r.outline);
                const side = r.outline.segments.filter((seg) => seg.side === 1 || (seg.type === 'arc' && seg.sideEnd === 1));
                const xs = side.flatMap((seg) => [seg.x0, seg.x1]);
                if (depth < 0) expect(Math.min(...xs)).toBeLessThan(100 + depth + 3.5);
                // Rounding a sharp tip takes off more than the radius.
                else expect(r.bounds.right).toBeGreaterThan(100 + depth / 2);
            }
        }
    });

    test('cusp tip radius shrinks to fit its arcs', () => {
        // A shallow cusp is nearly flat at the tip and takes large radii; this one does not fit.
        const feature = { kind: 'cusp' as const, depth: -6, span: 1000, tipRadius: 5000 };
        const r = resolve(shape(220, 220, { radius: 66 }, [feature, feature, feature, feature]));
        expectWellFormed(r.outline);
        expectSmoothAroundArcs(r.outline);
        expect(r.clamps.some((c) => c.kind === 'vertex-radius' && c.factor > 0 && c.factor < 1)).toBe(true);
    });

    test('cusp at its deepest still rounds the tip', () => {
        // At depth = half the span both arcs are quarter circles and the tip is the midpoint of
        // their centers; the fillet side used to be taken from there and the rounding dropped.
        for (const depth of [39.6, 45, -39.6, -45]) {
            const feature = { kind: 'cusp' as const, depth, span: 79.2, tipRadius: 5 };
            const r = resolve(shape(240, 150, { radius: 24 }, [feature, {}, {}, {}]));
            expectWellFormed(r.outline);
            expectSmoothAroundArcs(r.outline);
            expect(r.clamps.some((c) => c.kind === 'vertex-radius')).toBe(false);
        }
    });

    test('cusp of depth 0 is a flat side', () => {
        const r = resolve(shape(100, 40, {}, [{ kind: 'cusp', depth: 0, span: 30 }]));
        expect(r.outline.segments.length).toBe(4);
    });

    test('depth 0 adds no vertices', () => {
        const r = resolve(shape(100, 40, {}, [{ kind: 'rect', depth: 0, span: 30 }]));
        expect(r.outline.segments.length).toBe(4);
    });
});

// Converts SVG endpoint arcs back to center form, following SVG 1.1 appendix F.6.5.
function svgArcCenter(x1: number, y1: number, r: number, large: number, sweep: number, x2: number, y2: number) {
    const dx = (x1 - x2) / 2;
    const dy = (y1 - y2) / 2;
    const sq = Math.max(0, (r * r - dx * dx - dy * dy) / (dx * dx + dy * dy));
    const sign = large === sweep ? -1 : 1;
    const k = sign * Math.sqrt(sq);
    return { cx: k * dy + (x1 + x2) / 2, cy: -k * dx + (y1 + y2) / 2 };
}

describe('emitters', () => {
    const cases = [
        shape(100, 40, { radius: 10 }),
        shape(100, 40, { radius: 10, shape: 'scoop' }),
        shape(100, 40, { radius: 30 }),
        shape(100, 40, { radius: 8 }, [{}, { kind: 'arc', depth: -6, span: 20, shoulderRadius: 2 }, {}, { kind: 'arc', depth: 15, span: 30 }]),
        shape(120, 60, [{ shiftX: 20, radius: 6 }, { radius: 12, shape: 'notch' }, { shiftX: 20, radius: 6 }, { radius: 12, shape: 'scoop' }], [
            { kind: 'triangle', depth: 10, span: 30, tipRadius: 3, shoulderRadius: 2 },
        ]),
    ];

    test('SVG path and canvas trace describe the same arcs', () => {
        for (const spec of cases) {
            const { outline } = resolve(spec);
            const d = toSvgPath(outline, 9);
            const commands = d.match(/[MLAZ][^MLAZ]*/g)!;
            const arcs = outline.segments.filter((s) => s.type === 'arc');
            const svgArcs = commands.filter((c) => c[0] === 'A');
            expect(svgArcs.length).toBe(arcs.length);
            let cursor = { x: outline.segments[0].x0, y: outline.segments[0].y0 };
            let arcIndex = 0;
            for (const c of commands) {
                const v = c.slice(1).trim().split(/\s+/).map(Number);
                if (c[0] === 'M' || c[0] === 'L') cursor = { x: v[0], y: v[1] };
                if (c[0] !== 'A') continue;
                const seg = arcs[arcIndex++];
                if (seg.type !== 'arc') throw new Error('unreachable');
                const center = svgArcCenter(cursor.x, cursor.y, v[0], v[3], v[4], v[5], v[6]);
                expect(center.cx).toBeCloseTo(seg.cx, 5);
                expect(center.cy).toBeCloseTo(seg.cy, 5);
                expect(v[4] === 1).toBe(arcSweep(seg.start, seg.end, seg.anticlockwise) > 0);
                cursor = { x: v[5], y: v[6] };
            }
        }
    });

    test('canvas trace replays every segment in order', () => {
        const { outline } = resolve(cases[3]);
        const calls: string[] = [];
        traceContour(
            {
                moveTo: (x, y) => calls.push(`M ${x.toFixed(3)} ${y.toFixed(3)}`),
                lineTo: (x, y) => calls.push(`L ${x.toFixed(3)} ${y.toFixed(3)}`),
                arc: (x, y, r) => calls.push(`A ${x.toFixed(3)} ${y.toFixed(3)} ${r.toFixed(3)}`),
                closePath: () => calls.push('Z'),
            },
            outline
        );
        expect(calls.length).toBe(outline.segments.length + 2);
        expect(calls[calls.length - 1]).toBe('Z');
    });
});
