import { arcSweep } from './math.js';
import type { Contour } from './types.js';

// Minimal subset of CanvasRenderingContext2D and Path2D used to trace a contour.
export interface PathSink {
    moveTo(x: number, y: number): void;
    lineTo(x: number, y: number): void;
    arc(x: number, y: number, radius: number, startAngle: number, endAngle: number, anticlockwise?: boolean): void;
    closePath(): void;
}

export function traceContour(sink: PathSink, contour: Contour): void {
    const segments = contour.segments;
    if (segments.length === 0) return;
    sink.moveTo(segments[0].x0, segments[0].y0);
    for (const s of segments) {
        if (s.type === 'line') sink.lineTo(s.x1, s.y1);
        else sink.arc(s.cx, s.cy, s.r, s.start, s.end, s.anticlockwise);
    }
    sink.closePath();
}

const POWERS = [1, 10, 100, 1000, 10000, 100000, 1000000];

// Rounds to `precision` decimals and prints the shortest form. Rounding first also removes
// exponent notation for tiny values and the "-0" case.
export function formatNumber(x: number, precision: number): string {
    const p = POWERS[precision] || Math.pow(10, precision);
    const r = Math.round(x * p) / p;
    return r === 0 ? '0' : String(r);
}

export function toSvgPath(contour: Contour, precision = 3): string {
    const segments = contour.segments;
    if (segments.length === 0) return '';
    const n = (x: number) => formatNumber(x, precision);
    const parts = [`M${n(segments[0].x0)} ${n(segments[0].y0)}`];
    for (const s of segments) {
        if (s.type === 'line') {
            parts.push(`L${n(s.x1)} ${n(s.y1)}`);
            continue;
        }
        const sweep = arcSweep(s.start, s.end, s.anticlockwise);
        const large = Math.abs(sweep) > Math.PI ? 1 : 0;
        // SVG sweep-flag 1 is the positive angle direction, clockwise on a y-down screen.
        const sweepFlag = sweep > 0 ? 1 : 0;
        parts.push(`A${n(s.r)} ${n(s.r)} 0 ${large} ${sweepFlag} ${n(s.x1)} ${n(s.y1)}`);
    }
    parts.push('Z');
    return parts.join(' ');
}
