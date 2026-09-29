import { Events } from './events';

class GestureController {
    private events: Events;
    // Default to 0 — "particles=0 / calm splat" is the resting/idle visual
    // (= no-person state). Person detection drives this UP (toward 1 = full
    // particles) as they walk CLOSER to the camera, and back DOWN toward 0
    // as they walk away or leave the area.
    private smoothedProgress = 0;
    // Low-pass filter on horizontal position. Apple Vision's bbox center jitters
    // a few percent frame-to-frame (worse at close range where the bbox is large
    // / cropped); since pan is absolute, raw x → visible camera sway.
    private smoothedX = 0.5;
    private distancePollingId: number = 0;

    // When a person is briefly lost (Vision misses a frame at close range,
    // depth blob shrinks below threshold, etc.) we hold the last known
    // smoothedProgress / smoothedX for a grace period instead of starting to
    // decay. Without this, brief detection drops cause flicker — particles
    // crash to 0 then jump back as soon as the person is re-detected.
    private lastSeenAt = 0;
    private static readonly LOST_HOLD_MS = 3000;

    constructor(events: Events) {
        this.events = events;

        this.events.fire('particle.setEffect', 'noise');
        this.startDistancePolling();
    }

    private startDistancePolling() {
        const poll = async () => {
            try {
                const res = await fetch('/person-distance.json?' + Date.now());
                if (!res.ok) return;
                const data = await res.json();
                const dist = data.distance || 0;
                const personPresent = (data.count ?? 0) >= 1;
                const tooClose = data.tooClose === 1;

                if (tooClose) {
                    // Person standing right under camera — no valid distance
                    // reading, but we know they're there. Force max particles
                    // and don't touch focal point (let it stay where it was).
                    this.smoothedProgress += (1 - this.smoothedProgress) * 0.2;
                    this.events.fire('particle.setProgress', this.smoothedProgress);
                    this.lastSeenAt = Date.now();
                } else if (personPresent && dist > 0 && dist <= 3000) {
                    // Person close → progress 1 (max particles), far → 0 (calm splat).
                    // No lower-distance cutoff: walking closer than 0.5m keeps
                    // particles maxed (Math.min clamps progress to 1) instead of
                    // dropping out and recovering toward calm.
                    const targetProgress = Math.max(0, Math.min(1, (3000 - dist) / (3000 - 500)));
                    this.smoothedProgress += (targetProgress - this.smoothedProgress) * 0.2;
                    this.events.fire('particle.setProgress', this.smoothedProgress);
                    this.lastSeenAt = Date.now();

                    // Pan driven by horizontal position only. With the camera tilted
                    // downward, the y axis is largely redundant with `dist` (closer
                    // people sit lower in frame), so feeding it into pan creates
                    // compound motion. Lock dy=0 so only left/right drives pan.
                    const isPlaceholder = data.x === 0.5 && data.y === 0.5;
                    if (!isPlaceholder && typeof data.x === 'number') {
                        // EMA on x to absorb backend jitter. α=0.25 → ~130ms time
                        // constant; depth backend's blob centroid is steady enough
                        // to handle this — was 0.1 (~330ms) tuned for Vision's
                        // jittery bbox, which felt visibly laggy on quick walks.
                        // Deadband ±0.5%: kill standing-still wobble but stop
                        // freezing the pan as someone crosses center.
                        this.smoothedX += (data.x - this.smoothedX) * 0.25;
                        const offset = this.smoothedX - 0.5;
                        if (Math.abs(offset) >= 0.005) {
                            this.events.fire('camera.gesture.pan', offset * 1.0, 0);
                        }
                    }
                } else {
                    const sinceSeen = Date.now() - this.lastSeenAt;
                    if (sinceSeen < GestureController.LOST_HOLD_MS) {
                        // Brief detection drop — hold last progress and focal
                        // point so the scene doesn't flicker. Decay only kicks
                        // in after LOST_HOLD_MS without seeing anyone.
                        this.events.fire('particle.setProgress', this.smoothedProgress);
                    } else {
                        // No person → settle to the default visual state:
                        // progress=0 (calm splat) AND smoothedX=0.5 (camera centered).
                        // No deadband on the recovery so the focal point actually
                        // reaches center (deadband would freeze it within ±2%).
                        if (Math.abs(this.smoothedProgress) > 0.001) {
                            this.smoothedProgress += (0 - this.smoothedProgress) * 0.1;
                            this.events.fire('particle.setProgress', this.smoothedProgress);
                        }
                        if (Math.abs(0.5 - this.smoothedX) > 0.001) {
                            this.smoothedX += (0.5 - this.smoothedX) * 0.1;
                            this.events.fire('camera.gesture.pan', this.smoothedX - 0.5, 0);
                        }
                    }
                }
            } catch {
                // bridge not running, ignore
            }
        };
        poll();
        this.distancePollingId = window.setInterval(poll, 33);
    }
}

export { GestureController };
