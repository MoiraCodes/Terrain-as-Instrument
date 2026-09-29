#!/bin/bash
# One-click launcher for splat gallery + OSC bridge + orbbec
# Usage: ./start.sh

cd "$(dirname "$0")"
SPLAT_DIR="$(pwd)"

_cleaned_up=0
cleanup() {
    [ "$_cleaned_up" = "1" ] && return
    _cleaned_up=1
    echo ""
    echo "Shutting down..."
    # Kill direct children (covers BRIDGE_PID and SERVE_PID).
    pkill -P $$ 2>/dev/null
    # `npx serve` is a wrapper that spawns the actual `serve` as a grandchild —
    # pkill -P only catches direct children, so target serve by command line.
    pkill -f "node .*\.bin/serve .* -l 3000" 2>/dev/null
    pkill -f "osc-bridge.mjs" 2>/dev/null
    exit 0
}
trap cleanup INT TERM EXIT

MAX_PORT=${1:-8000}

# 1. OSC bridge
node osc-bridge.mjs "$MAX_PORT" &
BRIDGE_PID=$!

# 2. Web server
cd editor-src && npx serve .. -C -L -l 3000 &
SERVE_PID=$!
cd ..

# 3. Wait a moment then open browser
sleep 2
open http://localhost:3000

# 4. Orbbec (needs sudo, runs in foreground)
# Pick detection backend via MODE env var:
#   MODE=depth   (default) — depth-only, works in dark, our source
#   MODE=vision           — Apple Vision (RGB), needs light, vendor binary (no source)
MODE=${MODE:-depth}
case "$MODE" in
    depth)
        BIN="$SPLAT_DIR/tools/orbbec/bin/orbbec_syphon_depth"
        # MIN_MM/MAX_MM are FLOOR DISTANCE (binary converts depth→floor-dist
        # using CAMERA_TILT_DEG / CAMERA_HEIGHT_M). 500-3000 = 0.5m to 3m.
        # Tuned for camera at 1.83m, 32° tilt; override at venue if angle/height differ.
        : ${MIN_MM:=20}
        : ${MAX_MM:=3000}
        # Tracking gating — tuned for smooth pan during fast motion:
        # - smaller MIN_BLOB_PX: blob less likely to fail size check when body
        #   edge briefly shrinks during quick movement
        # - longer EXIT grace: 1s window absorbs all "blob momentarily lost"
        #   blips, so OSC keeps reporting last position instead of dropping
        # - shorter ENTER frames: when track does reset, re-confirm in 67ms
        #   (was 167ms) so visual catches up almost instantly
        : ${MIN_BLOB_PX:=500}
        : ${PERSON_EXIT_FRAMES:=30}
        : ${PERSON_ENTER_FRAMES:=2}
        ;;
    vision)
        BIN="$SPLAT_DIR/tools/orbbec/bin/orbbec_syphon_vision"
        ;;
    *)
        echo "Unknown MODE: $MODE (must be 'depth' or 'vision')"; exit 1
        ;;
esac
echo ""
echo "Starting $MODE backend (needs password)..."
# Pass env vars inline so sudo's env_reset doesn't strip them.
sudo \
    MIN_MM="${MIN_MM:-}"  MAX_MM="${MAX_MM:-}"  MIN_BLOB_PX="${MIN_BLOB_PX:-}" \
    FG_DELTA_MM="${FG_DELTA_MM:-}"  CAL_FRAMES="${CAL_FRAMES:-}" \
    PERSON_ENTER_FRAMES="${PERSON_ENTER_FRAMES:-}"  PERSON_EXIT_FRAMES="${PERSON_EXIT_FRAMES:-}"  PERSON_TRACK_DIST="${PERSON_TRACK_DIST:-}" \
    CAMERA_TILT_DEG="${CAMERA_TILT_DEG:-}"  CAMERA_HEIGHT_M="${CAMERA_HEIGHT_M:-}" \
    IGNORE_X0="${IGNORE_X0:-}"  IGNORE_X1="${IGNORE_X1:-}"  IGNORE_Y0="${IGNORE_Y0:-}"  IGNORE_Y1="${IGNORE_Y1:-}" \
    "$BIN"
