import { describe, expect, test } from 'bun:test';
import { borderInner } from './border.js';
import { apply, scaleAt, tiltHomography } from './homography.js';
import type { Homography } from './homography.js';
import { arcSweep } from './math.js';
import { resolve } from './resolve.js';
import { shape } from './test-utils.js';
import type { Contour, Point, Quad, ShapeSpec } from './types.js';

const PI = Math.PI;

function polygonArea(points: Point[]) {
    let a = 0;
    for (let i = 0; i < points.length; i++) {
        const p = points[i];
        const q = points[(i + 1) % points.length];
        a += p.x * q.y - q.x * p.y;
    }
    return Math.abs(a / 2);
}

// Dense screen-space polyline of an outline, for distance checks.
function densify(outline: Contour, h?: Homography): Point[] {
    const map = (p: Point) => (h ? apply(h, p) : p);
    const out: Point[] = [];
    for (const s of outline.segments) {
        if (s.type === 'line') {
            for (let j = 0; j < 200; j++) out.push(map({ x: s.x0 + ((s.x1 - s.x0) * j) / 200, y: s.y0 + ((s.y1 - s.y0) * j) / 200 }));
        } else {
            const sweep = arcSweep(s.start, s.end, s.anticlockwise);
            for (let j = 0; j < 200; j++) {
                const a = s.start + (sweep * j) / 200;
                out.push(map({ x: s.cx + s.r * Math.cos(a), y: s.cy + s.r * Math.sin(a) }));
            }
        }
    }
    return out;
}

function distanceToPolyline(p: Point, poly: Point[]) {
    let best = Infinity;
    for (let i = 0; i < poly.length; i++) {
        const a = poly[i];
        const b = poly[(i + 1) % poly.length];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len2 = dx * dx + dy * dy;
        const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
        best = Math.min(best, Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t));
    }
    return best;
}

function segmentsCross(a: Point, b: Point, c: Point, d: Point) {
    const o = (p: Point, q: Point, r: Point) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
    const o1 = o(a, b, c);
    const o2 = o(a, b, d);
    const o3 = o(c, d, a);
    const o4 = o(c, d, b);
    return o1 * o2 < -1e-9 && o3 * o4 < -1e-9;
}

function expectSimple(points: Point[]) {
    const n = points.length;
    for (let i = 0; i < n; i++)
        for (let j = i + 2; j < n; j++) {
            if (i === 0 && j === n - 1) continue;
            expect(segmentsCross(points[i], points[(i + 1) % n], points[j], points[(j + 1) % n])).toBe(false);
        }
}

// Every inner edge midpoint sits at the border thickness from the outline (on screen).
function expectUniformThickness(spec: ShapeSpec, widths: Quad<number>, h?: Homography) {
    const { outline } = resolve(spec, { borderWidths: widths });
    const center = { x: spec.width / 2, y: spec.height / 2 };
    const { inner, thickness } = borderInner(outline, { widths, transform: h, center, tolerance: 0.01 });
    expect(inner.length).toBeGreaterThan(3);
    expectSimple(inner);
    const outer = densify(outline, h);
    const screenInner = h ? inner.map((p) => apply(h, p)) : inner;
    for (let i = 0; i < screenInner.length; i++) {
        const a = screenInner[i];
        const b = screenInner[(i + 1) % screenInner.length];
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        expect(Math.abs(distanceToPolyline(mid, outer) - thickness[0])).toBeLessThan(0.05);
    }
    return { inner, thickness };
}

describe('border without tilt', () => {
    test('rectangle', () => {
        const { outline } = resolve(shape(100, 40));
        const { inner } = borderInner(outline, { widths: [2, 2, 2, 2] });
        expect(polygonArea(inner)).toBeCloseTo(96 * 36, 6);
    });

    test('rounded rectangle keeps inner radius r - w', () => {
        const { outline } = resolve(shape(100, 40, { radius: 10 }));
        const tolerance = 0.001;
        const { inner } = borderInner(outline, { widths: [2, 2, 2, 2], tolerance });
        // Chords cut inside the arc: the area error is bounded by tolerance * total arc length.
        const arcLength = 2 * PI * 10;
        expect(Math.abs(polygonArea(inner) - (96 * 36 - (4 - PI) * 64))).toBeLessThan(tolerance * arcLength);
    });

    test('radius below the width collapses to a sharp inner corner', () => {
        const { outline } = resolve(shape(100, 40, { radius: 1.5 }));
        const { inner } = borderInner(outline, { widths: [2, 2, 2, 2] });
        expect(polygonArea(inner)).toBeCloseTo(96 * 36, 4);
        expectSimple(inner);
    });

    test('side widths, including a missing side', () => {
        const { outline } = resolve(shape(100, 40));
        const { inner } = borderInner(outline, { widths: [2, 0, 3, 1] });
        expect(polygonArea(inner)).toBeCloseTo((100 - 1) * (40 - 5), 6);
    });

    test('bevel keeps the full width on the diagonal (legacy drew 0.707 w)', () => {
        expectUniformThickness(shape(100, 40, { radius: 10, shape: 'bevel' }), [2, 2, 2, 2]);
    });

    const presets: [string, ShapeSpec][] = [
        ['round', shape(100, 40, { radius: 10 })],
        ['scoop', shape(100, 40, { radius: 10, shape: 'scoop' })],
        ['notch', shape(100, 40, { radius: 10, shape: 'notch' })],
        ['parallelogram', shape(100, 40, [{ shiftX: 20, radius: 6 }, { radius: 6 }, { shiftX: 20, radius: 6 }, { radius: 6 }])],
        ['bun', shape(140, 80, { radius: 20 }, [{}, { kind: 'arc', depth: -8, span: 36 }, {}, { kind: 'arc', depth: -8, span: 36 }])],
        ['tab', shape(140, 80, { radius: 8 }, [{ kind: 'rect', depth: 12, span: 50, tipRadius: 6, shoulderRadius: 4 }])],
        ['triangle notch', shape(140, 80, { radius: 8 }, [{ kind: 'triangle', depth: -16, span: 40, tipRadius: 3, shoulderRadius: 3 }])],
        ['cusp bun', shape(100, 104, { radius: 26 }, [{}, { kind: 'cusp', depth: -14, span: 1000, tipRadius: 3 }, {}, { kind: 'cusp', depth: -14, span: 1000, tipRadius: 3 }])],
        ['cusp cookie', shape(100, 100, { radius: 30 }, [0, 1, 2, 3].map(() => ({ kind: 'cusp' as const, depth: -3, span: 1000, tipRadius: 9 })))],
        ['pointed arch', shape(140, 80, { radius: 8 }, [{ kind: 'cusp', depth: 16, span: 60, tipRadius: 4 }])],
        ['heart', shape(140, 80, [{ radius: 30 }, { radius: 30 }, { shiftX: 70, radius: 4 }, { shiftX: 70, radius: 4 }], [{ kind: 'triangle', depth: -14, span: 30, tipRadius: 4, shoulderRadius: 10 }])],
    ];
    for (const [name, spec] of presets) {
        test(`uniform thickness: ${name}`, () => {
            expectUniformThickness(spec, [2, 2, 2, 2]);
        });
    }
});

describe('border with tilt', () => {
    const tilts = [
        { perspective: 400, rotateX: 14, rotateY: -18, translateZ: 0 },
        { perspective: 25, rotateX: 3, rotateY: 5, translateZ: -0.8 },
    ];
    const specs: [string, ShapeSpec][] = [
        ['round', shape(128, 40, { radius: 8 })],
        ['bun', shape(140, 80, { radius: 20 }, [{}, { kind: 'arc', depth: -8, span: 36 }, {}, { kind: 'arc', depth: -8, span: 36 }])],
        ['bevel', shape(128, 40, { radius: 10, shape: 'bevel' })],
    ];
    for (const tilt of tilts)
        for (const [name, spec] of specs) {
            test(`same thickness on screen: ${name}, p=${tilt.perspective}`, () => {
                const h = tiltHomography({ width: spec.width, height: spec.height, ...tilt });
                const { thickness } = expectUniformThickness(spec, [1.5, 1.5, 1.5, 1.5], h);
                const s = scaleAt(h, { x: spec.width / 2, y: spec.height / 2 });
                expect(thickness[0]).toBeCloseTo(1.5 * s, 9);
            });
        }

    test('without compensation the far side would be thinner', () => {
        // Sanity check that the tilt is strong enough for the test above to mean something.
        const spec = shape(128, 40, { radius: 8 });
        const h = tiltHomography({ width: 128, height: 40, perspective: 25, rotateX: 3, rotateY: 5, translateZ: -0.8 });
        const left = scaleAt(h, { x: 0, y: 20 });
        const right = scaleAt(h, { x: 128, y: 20 });
        expect(Math.abs(left - right) / Math.max(left, right)).toBeGreaterThan(0.1);
        expect(spec.width).toBe(128);
    });
});
