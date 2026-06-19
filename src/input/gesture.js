/**
 * gesture.js — a tiny shared flag the camera uses to tell tap handlers
 * "this pointer interaction was a pan/pinch, not a tap — ignore it."
 *
 * The camera (CameraController) sets it true the moment a drag or pinch is
 * recognised and resets it false at the start of each fresh touch. Reef tap
 * handlers (placing coral, opening the upgrade menu, collecting a clam,
 * removing a fish) check isTapSuppressed() and bail when it's set, so panning
 * the board never accidentally triggers an action.
 *
 * On desktop the camera never runs, so this stays false and taps behave exactly
 * as before.
 */

let _suppressed = false;

export function isTapSuppressed() { return _suppressed; }
export function setTapSuppressed(v) { _suppressed = !!v; }
