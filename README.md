<h1 align="center">Shape</h1>

<p align="center">
  The shapes of Axiom Design System, drawn the same way on SVG and Canvas.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@ax-design/shape"><img src="https://img.shields.io/npm/v/@ax-design/shape.svg" alt="npm version"></a>
  <a href="https://github.com/ax-design/shape/actions/workflows/ci.yml"><img src="https://github.com/ax-design/shape/actions/workflows/ci.yml/badge.svg" alt="CI Status"></a>
  <img src="https://img.shields.io/badge/license-MIT-green.svg" alt="MIT Licence" />
</p>

## Installation

```bash
// with npm
npm install @ax-design/shape

// with bun
bun add @ax-design/shape
```

and import it:

```javascript
import { resolve, toSvgPath, traceContour } from '@ax-design/shape';
```

## Usage

A shape is a rectangle with decorations: rounded, beveled, scooped or notched corners, corners moved into the shape, and one feature on each side (an arc, a rectangle, a triangle or a trapezoid, going in or out).
You describe it with numbers and `resolve` turns it into lines and arcs.
Here's an example:

```javascript
import { resolve, toSvgPath, traceContour } from '@ax-design/shape';

const corner = { radius: 12, shape: 'round', shiftX: 0, shiftY: 0 };
const flat = { kind: 'flat', depth: 0, span: 0, at: 0.5, ratio: 0.5, tipRadius: 0, shoulderRadius: 0 };
const notch = { ...flat, kind: 'arc', depth: -8, span: 30 };

const shape = resolve({
  width: 160,
  height: 48,
  corners: [corner, corner, corner, corner],
  edges: [flat, notch, flat, notch],
});

// SVG
path.setAttribute('d', toSvgPath(shape.outline));

// Canvas
ctx.beginPath();
traceContour(ctx, shape.outline);
ctx.fill();
```

Values that do not fit are scaled down, the same way CSS does with `border-radius`. `shape.clamps` tells you what was scaled and by how much.

### Borders

`borderInner` gives you the inner edge of a border ring. Fill the outline together with the inner edge using the even-odd rule:

```javascript
import { borderInner, traceInner } from '@ax-design/shape';

const { inner } = borderInner(shape.outline, { widths: [2, 2, 2, 2] });
ctx.beginPath();
traceContour(ctx, shape.outline);
traceInner(ctx, inner);
ctx.fill('evenodd');
```

### Tilt

When the element is tilted with `perspective()` and `rotateX()` / `rotateY()`, pass the tilt and the border keeps the same thickness on screen everywhere:

```javascript
import { borderInner, tiltHomography } from '@ax-design/shape';

const transform = tiltHomography({ width: 160, height: 48, perspective: 25, rotateX: 3, rotateY: 5, translateZ: 0 });
const { inner } = borderInner(shape.outline, { widths: [2, 2, 2, 2], transform });
```

Shape has no DOM dependency, so you can also use it on the server.
