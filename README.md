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

A shape is a rectangle with decorations: rounded, beveled, scooped or notched corners, corners moved into the shape, and one feature on each side (an arc, a rectangle, a triangle, a trapezoid or a cusp, going in or out).
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

A `cusp` is two arcs that leave the side smoothly at both ends of the span and meet in a point: inward it pinches the side (the Material bun and clover), outward it makes a pointed arch. `tipRadius` rounds the point.

A corner's `shoulderRadius` rounds the two points where a bevel, scoop or notch meets the sides. Scoops of 50% with a shoulder radius make a soft star:

```javascript
const soft = { radius: 80, shape: 'scoop', shiftX: 0, shiftY: 0, shoulderRadius: 8 };
resolve({ width: 160, height: 160, corners: [soft, soft, soft, soft], edges: [flat, flat, flat, flat] });
```

Values that do not fit are scaled down, the same way CSS does with `border-radius`. A corner and a side feature next to it share the straight part of the side and shrink together. `shape.clamps` tells you what was scaled and by how much. A side feature narrower than half a pixel is left out, so animating a span down to zero ends on a flat side.

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

## Changes in 0.2

* The `cusp` side feature.
* `shoulderRadius` for corners.
* A corner next to a side feature with a shoulder no longer overlaps it. The outline used to run back along the side there, and the inner edge of the border shot out as a spike (the 4-sided cookie and the 4-leaf clover of the Material shapes).
* A shoulder between a side and an arc that is followed by another arc is rounded too; it used to stay sharp.
