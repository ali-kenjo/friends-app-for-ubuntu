// ---------- Dynamic 2D Grid A* Navigation & Obstacle Avoidance (core/robot/pathfinding.mjs) ----------
// Recalculates walkable NavMesh grid cells around active furniture & prop colliders
// in real time and finds smooth obstacle-free paths with line-of-sight string pulling.

export class NavMeshGrid {
  constructor({ minX = -2.4, maxX = 2.4, minZ = -2.3, maxZ = 1.8, resolution = 0.22, robotRadius = 0.24 } = {}) {
    this.minX = minX;
    this.maxX = maxX;
    this.minZ = minZ;
    this.maxZ = maxZ;
    this.resolution = resolution;
    this.robotRadius = robotRadius;
    this.cols = Math.max(4, Math.floor((maxX - minX) / resolution) + 1);
    this.rows = Math.max(4, Math.floor((maxZ - minZ) / resolution) + 1);
    this.blocked = new Uint8Array(this.cols * this.rows);
    this.cells = [];
  }

  colFor(x) {
    return Math.max(0, Math.min(this.cols - 1, Math.round((x - this.minX) / this.resolution)));
  }

  rowFor(z) {
    return Math.max(0, Math.min(this.rows - 1, Math.round((z - this.minZ) / this.resolution)));
  }

  worldX(col) {
    return this.minX + col * this.resolution;
  }

  worldZ(row) {
    return this.minZ + row * this.resolution;
  }

  idx(col, row) {
    return row * this.cols + col;
  }

  /**
   * Rebuild collision occupancy from current visible floor assets.
   * @param {Array<any>} assets
   */
  rebuild(assets = []) {
    this.blocked.fill(0);
    const colliders = (assets || [])
      .filter((a) => a && a.visible !== false && !a.attachedTo && (a.y || 0) < 0.25)
      .map((a) => ({
        x: Number(a.x || 0),
        z: Number(a.z || 0),
        r: Math.max(0.12, (Number(a.colliderRadius) || 0.22) * (Number(a.scale) || 1)) + this.robotRadius,
      }));

    this.cells = [];
    for (let r = 0; r < this.rows; r++) {
      const z = this.worldZ(r);
      for (let c = 0; c < this.cols; c++) {
        const x = this.worldX(c);
        let isBlocked = false;
        for (const col of colliders) {
          const dx = x - col.x;
          const dz = z - col.z;
          if (dx * dx + dz * dz <= col.r * col.r) {
            isBlocked = true;
            break;
          }
        }
        this.blocked[this.idx(c, r)] = isBlocked ? 1 : 0;
        this.cells.push({ col: c, row: r, x, z, blocked: isBlocked });
      }
    }
    return this;
  }

  isWalkableCell(c, r) {
    if (c < 0 || c >= this.cols || r < 0 || r >= this.rows) return false;
    return this.blocked[this.idx(c, r)] === 0;
  }

  findNearestWalkable(startCol, startRow) {
    if (this.isWalkableCell(startCol, startRow)) return [startCol, startRow];
    let best = [startCol, startRow];
    let bestDist = Infinity;
    for (let radius = 1; radius <= 8; radius++) {
      for (let dr = -radius; dr <= radius; dr++) {
        for (let dc = -radius; dc <= radius; dc++) {
          const nc = startCol + dc;
          const nr = startRow + dr;
          if (!this.isWalkableCell(nc, nr)) continue;
          const d = dc * dc + dr * dr;
          if (d < bestDist) {
            bestDist = d;
            best = [nc, nr];
          }
        }
      }
      if (bestDist < Infinity) return best;
    }
    return best;
  }

  /** Line-of-sight check between two grid cells for path smoothing. */
  hasLineOfSight(c0, r0, c1, r1) {
    const steps = Math.max(Math.abs(c1 - c0), Math.abs(r1 - r0)) * 2;
    if (steps <= 1) return true;
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const cc = Math.round(c0 + (c1 - c0) * t);
      const rr = Math.round(r0 + (r1 - r0) * t);
      if (!this.isWalkableCell(cc, rr)) return false;
    }
    return true;
  }

  /**
   * Compute an A* path from (sx, sz) to (gx, gz) in world coordinates.
   * Returns Array<{ x: number, z: number }>.
   */
  findPath(sx, sz, gx, gz) {
    const [sc, sr] = this.findNearestWalkable(this.colFor(sx), this.rowFor(sz));
    const [gc, gr] = this.findNearestWalkable(this.colFor(gx), this.rowFor(gz));

    if (sc === gc && sr === gr) return [{ x: Number(gx), z: Number(gz) }];

    const total = this.cols * this.rows;
    const gScore = new Float32Array(total).fill(Infinity);
    const fScore = new Float32Array(total).fill(Infinity);
    const cameFrom = new Int32Array(total).fill(-1);
    const closed = new Uint8Array(total);
    const open = new Set();

    const startIdx = this.idx(sc, sr);
    const goalIdx = this.idx(gc, gr);
    const heuristic = (c, r) => Math.hypot(c - gc, r - gr);

    gScore[startIdx] = 0;
    fScore[startIdx] = heuristic(sc, sr);
    open.add(startIdx);

    const dirs = [
      [1, 0, 1],
      [-1, 0, 1],
      [0, 1, 1],
      [0, -1, 1],
      [1, 1, 1.414],
      [1, -1, 1.414],
      [-1, 1, 1.414],
      [-1, -1, 1.414],
    ];

    let found = false;
    while (open.size > 0) {
      let current = -1;
      let bestF = Infinity;
      for (const n of open) {
        if (fScore[n] < bestF) {
          bestF = fScore[n];
          current = n;
        }
      }
      if (current === goalIdx) {
        found = true;
        break;
      }
      open.delete(current);
      closed[current] = 1;

      const cc = current % this.cols;
      const cr = Math.floor(current / this.cols);

      for (const [dc, dr, cost] of dirs) {
        const nc = cc + dc;
        const nr = cr + dr;
        if (!this.isWalkableCell(nc, nr)) continue;
        // Prevent diagonal corner clipping
        if (dc !== 0 && dr !== 0 && (!this.isWalkableCell(cc + dc, cr) || !this.isWalkableCell(cc, cr + dr))) continue;
        const nextIdx = this.idx(nc, nr);
        if (closed[nextIdx]) continue;
        const tentativeG = gScore[current] + cost;
        if (tentativeG < gScore[nextIdx]) {
          cameFrom[nextIdx] = current;
          gScore[nextIdx] = tentativeG;
          fScore[nextIdx] = tentativeG + heuristic(nc, nr);
          open.add(nextIdx);
        }
      }
    }

    if (!found) {
      return [{ x: this.worldX(gc), z: this.worldZ(gr) }];
    }

    const rawCells = [];
    let cur = goalIdx;
    while (cur !== -1) {
      rawCells.push([cur % this.cols, Math.floor(cur / this.cols)]);
      if (cur === startIdx) break;
      cur = cameFrom[cur];
    }
    rawCells.reverse();

    // String pulling smoothing
    const smoothed = [];
    let anchor = 0;
    while (anchor < rawCells.length - 1) {
      let next = rawCells.length - 1;
      while (next > anchor + 1) {
        if (this.hasLineOfSight(rawCells[anchor][0], rawCells[anchor][1], rawCells[next][0], rawCells[next][1])) {
          break;
        }
        next--;
      }
      const cell = rawCells[next];
      smoothed.push({
        x: Number(this.worldX(cell[0]).toFixed(3)),
        z: Number(this.worldZ(cell[1]).toFixed(3)),
      });
      anchor = next;
    }

    if (!smoothed.length) {
      smoothed.push({ x: Number(gx), z: Number(gz) });
    } else {
      smoothed[smoothed.length - 1] = { x: Number(gx), z: Number(gz) };
    }
    return smoothed;
  }
}

export const navMesh = new NavMeshGrid();
