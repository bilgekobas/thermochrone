/**
 * Alpha shape (concave hull) for isochrone polygons
 *
 * Replaces convex hull — correctly handles:
 *   - Rivers, parks, motorways cutting through walkable areas
 *   - Peninsulas and non-convex street network topology
 *   - Disconnected reachable zones
 *
 * Method: Delaunay triangulation → remove triangles with circumradius > 1/alpha
 * Implementation: Bowyer-Watson Delaunay + alpha filtering
 *
 * alpha parameter:
 *   higher alpha → tighter fit (more concave, may fragment)
 *   lower  alpha → looser fit (approaches convex hull)
 *   auto-alpha:  chosen as 1.5× mean nearest-neighbour distance
 */

/** Main entry — returns array of [lon, lat] rings (first = outer, rest = holes) */
export function alphaShape(points, alpha = null) {
  if (points.length < 4) return convexHullFallback(points);

  const autoAlpha = alpha ?? computeAutoAlpha(points);

  const triangles = delaunay(points);
  const edgeCount = new Map();

  // Keep only triangles whose circumradius < 1/alpha
  const kept = triangles.filter(tri => {
    const r = circumradius(points[tri[0]], points[tri[1]], points[tri[2]]);
    return r < 1 / autoAlpha;
  });

  if (kept.length === 0) return convexHullFallback(points);

  // Boundary edges appear exactly once across all kept triangles
  for (const tri of kept) {
    for (let i = 0; i < 3; i++) {
      const a = tri[i], b = tri[(i + 1) % 3];
      const key = a < b ? `${a},${b}` : `${b},${a}`;
      edgeCount.set(key, (edgeCount.get(key) ?? 0) + 1);
    }
  }

  const boundaryEdges = [];
  for (const [key, count] of edgeCount) {
    if (count === 1) {
      const [a, b] = key.split(",").map(Number);
      boundaryEdges.push([a, b]);
    }
  }

  if (boundaryEdges.length === 0) return convexHullFallback(points);

  // Chain edges into rings
  const rings = chainEdges(boundaryEdges, points);
  if (!rings.length) return convexHullFallback(points);

  // Return largest ring (outer boundary)
  rings.sort((a, b) => b.length - a.length);
  return rings[0];
}

// ── Bowyer-Watson Delaunay triangulation ──────────────────────────────────────
function delaunay(pts) {
  // Bounding super-triangle
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of pts) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  const dx = maxX - minX, dy = maxY - minY;
  const delta = Math.max(dx, dy) * 10;
  const mid = [(minX + maxX) / 2, (minY + maxY) / 2];

  const superTri = [
    pts.length,
    pts.length + 1,
    pts.length + 2,
  ];
  const allPts = [
    ...pts,
    [mid[0] - delta,     mid[1] - delta],
    [mid[0],             mid[1] + delta],
    [mid[0] + delta,     mid[1] - delta],
  ];

  let triangles = [superTri];

  for (let i = 0; i < pts.length; i++) {
    const bad = [];
    for (const tri of triangles) {
      if (inCircumcircle(allPts, tri, allPts[i])) bad.push(tri);
    }

    // Boundary of the polygonal hole
    const polygon = [];
    for (const tri of bad) {
      for (let e = 0; e < 3; e++) {
        const edge = [tri[e], tri[(e + 1) % 3]];
        const shared = bad.some(
          t => t !== tri &&
          t.some(v => v === edge[0]) &&
          t.some(v => v === edge[1])
        );
        if (!shared) polygon.push(edge);
      }
    }

    triangles = triangles.filter(t => !bad.includes(t));
    for (const edge of polygon) {
      triangles.push([edge[0], edge[1], i]);
    }
  }

  // Remove super-triangle vertices
  const superIdx = new Set([pts.length, pts.length + 1, pts.length + 2]);
  return triangles.filter(t => !t.some(v => superIdx.has(v)));
}

function inCircumcircle(pts, tri, p) {
  const [ax, ay] = pts[tri[0]];
  const [bx, by] = pts[tri[1]];
  const [cx, cy] = pts[tri[2]];
  const [dx, dy] = p;

  const ax_ = ax - dx, ay_ = ay - dy;
  const bx_ = bx - dx, by_ = by - dy;
  const cx_ = cx - dx, cy_ = cy - dy;

  const det =
    ax_ * (by_ * (cx_ ** 2 + cy_ ** 2) - cy_ * (bx_ ** 2 + by_ ** 2)) -
    ay_ * (bx_ * (cx_ ** 2 + cy_ ** 2) - cx_ * (bx_ ** 2 + by_ ** 2)) +
    (ax_ ** 2 + ay_ ** 2) * (bx_ * cy_ - cx_ * by_);

  return det > 0;
}

function circumradius([ax, ay], [bx, by], [cx, cy]) {
  const a = Math.hypot(bx - cx, by - cy);
  const b = Math.hypot(ax - cx, ay - cy);
  const c = Math.hypot(ax - bx, ay - by);
  const s = (a + b + c) / 2;
  const area = Math.sqrt(Math.max(0, s * (s-a) * (s-b) * (s-c)));
  if (area < 1e-12) return Infinity;
  return (a * b * c) / (4 * area);
}

function computeAutoAlpha(points) {
  // Mean nearest-neighbour distance × 1.5
  const sample = points.length > 200
    ? points.filter((_, i) => i % Math.floor(points.length / 200) === 0)
    : points;
  let totalMin = 0;
  for (const p of sample) {
    let minD = Infinity;
    for (const q of sample) {
      if (p === q) continue;
      const d = Math.hypot(p[0]-q[0], p[1]-q[1]);
      if (d < minD) minD = d;
    }
    totalMin += minD;
  }
  const meanNN = totalMin / sample.length;
  return 1 / (meanNN * 1.5);
}

function chainEdges(edges, points) {
  const adj = new Map();
  for (const [a, b] of edges) {
    if (!adj.has(a)) adj.set(a, []);
    if (!adj.has(b)) adj.set(b, []);
    adj.get(a).push(b);
    adj.get(b).push(a);
  }

  const visited = new Set();
  const rings = [];

  for (const startNode of adj.keys()) {
    if (visited.has(startNode)) continue;
    const ring = [];
    let cur = startNode;
    let prev = -1;

    while (true) {
      visited.add(cur);
      ring.push(points[cur]);
      const neighbours = (adj.get(cur) ?? []).filter(n => n !== prev);
      if (!neighbours.length) break;
      const next = neighbours.find(n => !visited.has(n)) ?? neighbours[0];
      if (next === startNode) { ring.push(points[startNode]); break; }
      if (visited.has(next)) break;
      prev = cur;
      cur = next;
    }

    if (ring.length >= 3) rings.push(ring);
  }

  return rings;
}

// Fallback for degenerate cases
function convexHullFallback(points) {
  if (points.length < 2) return points;
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) =>
    (a[0]-o[0])*(b[1]-o[1]) - (a[1]-o[1])*(b[0]-o[0]);
  const lower = [], upper = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower.at(-2), lower.at(-1), p) <= 0) lower.pop();
    lower.push(p);
  }
  for (let i = sorted.length-1; i >= 0; i--) {
    const p = sorted[i];
    while (upper.length >= 2 && cross(upper.at(-2), upper.at(-1), p) <= 0) upper.pop();
    upper.push(p);
  }
  upper.pop(); lower.pop();
  return lower.concat(upper);
}
