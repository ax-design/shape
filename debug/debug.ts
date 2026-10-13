// Visual check: canvas fill (red) under an SVG outline (blue) for the same resolved shape,
// with sharp vertices (gray dots) and clamps listed under each cell.
import { resolve, toSvgPath, traceContour } from '../src/index.js';
import { shape } from '../src/test-utils.js';
import type { ShapeSpec } from '../src/types.js';

const W = 140;
const H = 80;
const OX = 30;
const OY = 30;

export const PRESETS: [string, ShapeSpec][] = [
    ['rect', shape(W, H)],
    ['round 12', shape(W, H, { radius: 12 })],
    ['pill', shape(W, H, { radius: 999 })],
    ['bevel 14', shape(W, H, { radius: 14, shape: 'bevel' })],
    ['notch 14', shape(W, H, { radius: 14, shape: 'notch' })],
    ['scoop 14', shape(W, H, { radius: 14, shape: 'scoop' })],
    ['mixed', shape(W, H, [{ radius: 16 }, { radius: 16, shape: 'bevel' }, { radius: 16, shape: 'notch' }, { radius: 16, shape: 'scoop' }])],
    ['arch', shape(W, H, [{ radius: 70 }, { radius: 70 }, { radius: 6 }, { radius: 6 }])],
    ['fan', shape(W, H, [{ radius: 80 }, {}, {}, {}])],
    ['slanted', shape(W, H, [{ shiftY: 16, radius: 8 }, { radius: 8 }, { radius: 8 }, { radius: 8 }])],
    ['parallelogram', shape(W, H, [{ shiftX: 24, radius: 6 }, { radius: 6 }, { shiftX: 24, radius: 6 }, { radius: 6 }])],
    ['diamond', shape(W, H, [{ shiftX: W / 2, radius: 6 }, { shiftY: H / 2, radius: 6 }, { shiftX: W / 2, radius: 6 }, { shiftY: H / 2, radius: 6 }])],
    ['bun', shape(W, H, { radius: 20 }, [{}, { kind: 'arc', depth: -8, span: 36 }, {}, { kind: 'arc', depth: -8, span: 36 }])],
    ['ticket', shape(W, H, { radius: 6 }, [{}, { kind: 'arc', depth: -10, span: 20, shoulderRadius: 2 }, {}, { kind: 'arc', depth: -10, span: 20, shoulderRadius: 2 }])],
    ['tab bump', shape(W, H, { radius: 8 }, [{ kind: 'rect', depth: 12, span: 50, tipRadius: 6, shoulderRadius: 4 }])],
    ['triangle notch', shape(W, H, { radius: 8 }, [{ kind: 'triangle', depth: -16, span: 40, tipRadius: 3, shoulderRadius: 3 }])],
    ['arrow', shape(W, H, [{ radius: 10 }, { radius: 10 }, { shiftX: W / 2 - 1, radius: 4 }, { shiftX: W / 2 - 1, radius: 4 }])],
    ['heart', shape(W, H, [{ radius: 30 }, { radius: 30 }, { shiftX: W / 2, shiftY: 0, radius: 4 }, { shiftX: W / 2, radius: 4 }], [
        { kind: 'triangle', depth: -14, span: 30, tipRadius: 4, shoulderRadius: 10 },
    ])],
    ['semicircle bump', shape(W, H, { radius: 8 }, [{}, {}, { kind: 'arc', depth: 20, span: 40, shoulderRadius: 4 }])],
    ['trapezoid', shape(W, H, { radius: 6 }, [{ kind: 'trapezoid', depth: 14, span: 60, ratio: 0.4, tipRadius: 4, shoulderRadius: 4 }])],
    ['clamped radius', shape(W, H, { radius: 200 }, [{ kind: 'rect', depth: -10, span: 40 }])],
    ['clamped neck', shape(W, H, {}, [{ kind: 'rect', depth: -50, span: 30 }, {}, { kind: 'rect', depth: -50, span: 30 }])],
];

const grid = document.getElementById('grid')!;
const dpr = window.devicePixelRatio || 1;
for (const [name, spec] of PRESETS) {
    const resolved = resolve(spec, { borderWidths: [1, 1, 1, 1] });
    const cell = document.createElement('div');
    cell.className = 'cell';
    cell.innerHTML = `<div class="name">${name}</div><div class="stage"><canvas></canvas><svg viewBox="0 0 200 140"></svg></div><div class="clamps"></div>`;
    grid.appendChild(cell);

    const canvas = cell.querySelector('canvas')!;
    canvas.width = 200 * dpr;
    canvas.height = 140 * dpr;
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, OX * dpr, OY * dpr);
    ctx.strokeStyle = '#ccc';
    ctx.setLineDash([2, 2]);
    ctx.strokeRect(0, 0, spec.width, spec.height);
    ctx.setLineDash([]);
    ctx.beginPath();
    traceContour(ctx, resolved.outline);
    ctx.fillStyle = 'rgba(220, 40, 40, 0.35)';
    ctx.fill();
    ctx.fillStyle = '#888';
    for (const v of resolved.vertices) {
        ctx.beginPath();
        ctx.arc(v.x, v.y, 1.5, 0, Math.PI * 2);
        ctx.fill();
    }

    const svg = cell.querySelector('svg')!;
    svg.innerHTML = `<path transform="translate(${OX} ${OY})" d="${toSvgPath(resolved.outline)}" fill="none" stroke="#1450dc" stroke-width="1"/>`;
    cell.querySelector('.clamps')!.textContent = resolved.clamps.map((c) => `${c.kind}[${c.index}] x${c.factor.toFixed(2)}`).join(', ');
}
(window as any).__ready = true;
