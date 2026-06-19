import { GRID_X, GRID_Y, GRID_W, GRID_H, SCREEN_W, SCREEN_H } from '../constants.js';
import { setTapSuppressed } from '../input/gesture.js';

const MIN_Z = 1;
const MAX_Z = 2.8;
const TAP_MOVE_THRESH = 10;   // px of finger travel before a drag counts as a pan
const BTN_ZOOM_STEP   = 1.5;  // multiplier per +/- button press

/**
 * CameraController — pinch-zoom and drag-pan over the reef, mobile only.
 *
 * It transforms `world` (the worldContainer) with a clamped scale + translation
 * so the 10×10 board can be magnified and explored without changing the board
 * itself — the save stays identical to desktop. The UI layer is a sibling of
 * `world`, so the HUD, build menu and modals never move or scale.
 *
 * Input is read from native pointer events on the canvas (so it works even
 * where Pixi children stop event propagation). A gesture only engages when it
 * starts inside the grid rectangle, so dragging the build menu never pans the
 * reef. While panning/pinching, setTapSuppressed(true) keeps the gesture from
 * being misread as a tap.
 */
export class CameraController {
  constructor(app, world) {
    this.app   = app;
    this.world = world;

    this.z  = 1;   // scale
    this.tx = 0;   // translation x (stage logical px)
    this.ty = 0;   // translation y

    this._pointers = new Map();   // pointerId → {x, y} in stage logical coords
    this._active   = false;       // gesture currently driving the camera?
    this._moved    = false;       // single-finger drag passed the tap threshold?
    this._prev     = null;        // last single-finger position (for incremental pan)
    this._start    = null;        // single-finger start position (for threshold)
    this._lastDist = 0;           // last pinch distance
    this._lastMid  = null;        // last pinch midpoint

    const c = app.canvas;
    c.style.touchAction = 'none';   // stop the browser from hijacking pinch/scroll

    this._onDown = this._down.bind(this);
    this._onMove = this._move.bind(this);
    this._onUp   = this._up.bind(this);
    c.addEventListener('pointerdown', this._onDown, { passive: false });
    c.addEventListener('pointermove', this._onMove, { passive: false });
    window.addEventListener('pointerup',     this._onUp);
    window.addEventListener('pointercancel', this._onUp);

    this._apply();
  }

  // ── Public API (zoom buttons) ───────────────────────────────────────────────
  zoomIn()  { this._zoomAt(GRID_X + GRID_W / 2, GRID_Y + GRID_H / 2, this.z * BTN_ZOOM_STEP); this._clamp(); this._apply(); }
  zoomOut() { this._zoomAt(GRID_X + GRID_W / 2, GRID_Y + GRID_H / 2, this.z / BTN_ZOOM_STEP); this._clamp(); this._apply(); }
  reset()   { this.z = 1; this.tx = 0; this.ty = 0; this._apply(); }

  // ── Coordinate helpers ──────────────────────────────────────────────────────
  _toStage(e) {
    const r = this.app.canvas.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) * (SCREEN_W / r.width),
      y: (e.clientY - r.top)  * (SCREEN_H / r.height),
    };
  }

  _inGrid(p) {
    return p.x >= GRID_X && p.x <= GRID_X + GRID_W &&
           p.y >= GRID_Y && p.y <= GRID_Y + GRID_H;
  }

  // ── Native pointer handlers ─────────────────────────────────────────────────
  _down(e) {
    const p = this._toStage(e);
    this._pointers.set(e.pointerId, p);

    if (this._pointers.size === 1) {
      // Fresh interaction — assume a tap until proven a drag.
      setTapSuppressed(false);
      this._moved  = false;
      this._start  = p;
      this._prev   = p;
      this._active = this._inGrid(p);
    } else if (this._pointers.size === 2) {
      // Second finger → pinch. Engage if either finger is over the grid.
      const pts = [...this._pointers.values()];
      this._active   = this._active || this._inGrid(pts[0]) || this._inGrid(pts[1]);
      this._lastDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      this._lastMid  = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
      if (this._active) { this._moved = true; setTapSuppressed(true); }
    }
  }

  _move(e) {
    if (!this._pointers.has(e.pointerId)) return;
    const p = this._toStage(e);
    this._pointers.set(e.pointerId, p);
    if (!this._active) return;

    const n = this._pointers.size;
    if (n >= 2) {
      e.preventDefault();
      const pts  = [...this._pointers.values()];
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const mid  = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
      if (this._lastDist > 0) {
        this._zoomAt(mid.x, mid.y, this.z * (dist / this._lastDist));
        this.tx += mid.x - this._lastMid.x;   // pan with the pinch midpoint
        this.ty += mid.y - this._lastMid.y;
        this._clamp();
        this._apply();
      }
      this._lastDist = dist;
      this._lastMid  = mid;
      setTapSuppressed(true);
    } else if (n === 1 && this.z > 1) {
      if (!this._moved && Math.hypot(p.x - this._start.x, p.y - this._start.y) > TAP_MOVE_THRESH) {
        this._moved = true;
        setTapSuppressed(true);
      }
      if (this._moved) {
        e.preventDefault();
        this.tx += p.x - this._prev.x;
        this.ty += p.y - this._prev.y;
        this._clamp();
        this._apply();
      }
    }
    this._prev = p;
  }

  _up(e) {
    this._pointers.delete(e.pointerId);
    if (this._pointers.size < 2) { this._lastDist = 0; this._lastMid = null; }
    if (this._pointers.size === 1) {
      // pinch → single finger: rebaseline so it doesn't jump
      const p = [...this._pointers.values()][0];
      this._prev = p;
      this._start = p;
    }
    if (this._pointers.size === 0) this._active = false;
    // tapSuppressed is intentionally NOT reset here — it resets on the next
    // fresh pointerdown, so tap handlers firing on this pointerup still see it.
  }

  // ── Transform maths ─────────────────────────────────────────────────────────
  _zoomAt(fx, fy, newZ) {
    newZ = Math.max(MIN_Z, Math.min(MAX_Z, newZ));
    // Keep the world point currently under (fx, fy) pinned there as we scale.
    const wx = (fx - this.tx) / this.z;
    const wy = (fy - this.ty) / this.z;
    this.z  = newZ;
    this.tx = fx - wx * this.z;
    this.ty = fy - wy * this.z;
  }

  _clamp() {
    const txMax = GRID_X * (1 - this.z);
    const txMin = (GRID_X + GRID_W) * (1 - this.z);
    const tyMax = GRID_Y * (1 - this.z);
    const tyMin = (GRID_Y + GRID_H) * (1 - this.z);
    this.tx = Math.min(txMax, Math.max(txMin, this.tx));
    this.ty = Math.min(tyMax, Math.max(tyMin, this.ty));
  }

  _apply() {
    this.world.scale.set(this.z);
    this.world.position.set(this.tx, this.ty);
  }

  destroy() {
    const c = this.app.canvas;
    c.removeEventListener('pointerdown', this._onDown);
    c.removeEventListener('pointermove', this._onMove);
    window.removeEventListener('pointerup',     this._onUp);
    window.removeEventListener('pointercancel', this._onUp);
  }
}
