// Depth-only person detection -> OSC.
// Replaces the original orbbec_syphon (Vision+RGB) with a pipeline that
// works in total darkness by threshold+blob on the depth stream.
//
// Wire protocol matches the original binary so osc-bridge.mjs is unchanged:
//   /person/count    (float)   number of blobs passing size filter
//   /person/distance (float)   mean depth (mm) of the closest blob
//   /person/x        (float)   normalized [0..1], left-to-right
//   /person/y        (float)   normalized [0..1], top-to-bottom
// Target: 127.0.0.1:7000  (osc-bridge.mjs)

#import <Foundation/Foundation.h>
#include <libobsensor/ObSensor.hpp>

#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <unistd.h>
#include <signal.h>

#include <cstdio>
#include <cstring>
#include <cstdint>
#include <cmath>
#include <vector>

// -------- Config (camera/network: fixed) --------
static constexpr int   DEPTH_W     = 640;
static constexpr int   DEPTH_H     = 400;
static constexpr int   DEPTH_FPS   = 30;
static constexpr const char *OSC_ADDR = "127.0.0.1";
static constexpr int   OSC_PORT    = 7000;

// -------- Config (env-overridable detection params) --------
// Override at venue without recompile, e.g.:
//   FG_DELTA_MM=350 MIN_BLOB_PX=5000 ./start.sh
//
// MIN_MM / MAX_MM are FLOOR DISTANCE bounds (mm) — i.e. the horizontal distance
// from the camera mount on the ground to the person. With CAMERA_TILT_DEG=0
// (camera horizontal) this collapses to raw depth Z, matching pre-tilt semantics.
static float MIN_MM             = 500.0f;
static float MAX_MM             = 3000.0f;
static int   MIN_BLOB_PX        = 1500;
static int   CAL_FRAMES         = 90;
static float FG_DELTA_MM        = 200.0f;
// Tracking: closest blob must persist N frames before reporting; survives M missing frames.
static int   PERSON_ENTER_FRAMES = 5;
static int   PERSON_EXIT_FRAMES  = 10;
static float PERSON_TRACK_DIST   = 0.15f;  // normalized distance for "same blob"

// Camera geometry — let the binary convert depth Z (perpendicular to tilted
// camera plane) into D (true horizontal floor distance) so that downstream
// (Max scale, frontend mapping) keeps using "0.5m..3m" semantics regardless
// of how the camera is mounted.
static float CAMERA_TILT_DEG    = 32.0f;   // 0 = horizontal, 90 = straight down
static float CAMERA_HEIGHT_M    = 1.83f;   // mount height above floor (meters)
static constexpr float BODY_CENTER_M = 0.9f;   // assumed body-centroid height

// Derived once at startup from tilt/height. Z (raw depth, mm) and D (floor distance, mm) relate as:
//   Z = D * cos(tilt) + (H - h) * sin(tilt)
//   D = (Z - g_offsetMm) / g_cosTilt        (using h = body center)
static float g_cosTilt          = 1.0f;
static float g_sinTilt          = 0.0f;
static float g_offsetMm         = 0.0f;    // (H - body_center) * sin(tilt) * 1000
static float g_zMinInternal     = 0.0f;    // per-pixel Z lower (allows head pixels at near range)
static float g_zMaxInternal     = 0.0f;    // per-pixel Z upper (allows feet pixels at far range)

static inline float zToFloorDistMm(float z_mm) {
    return (z_mm - g_offsetMm) / g_cosTilt;
}

// -------- Lifecycle --------
static volatile sig_atomic_t g_running = 1;
static void handle_signal(int) { g_running = 0; }

// -------- Zone mask (env-configurable) --------
// Pixels whose normalized (x, y) fall inside [IGNORE_X0..IGNORE_X1] x [IGNORE_Y0..IGNORE_Y1]
// are skipped during detection. Disabled when X1 <= X0 (the default).
static float g_ignoreX0 = 0, g_ignoreY0 = 0, g_ignoreX1 = 0, g_ignoreY1 = 0;
static bool  g_ignoreActive = false;

static float envFloat(const char *name, float fallback) {
    const char *v = getenv(name);
    if (!v || !*v) return fallback;
    return strtof(v, nullptr);
}

static int envInt(const char *name, int fallback) {
    const char *v = getenv(name);
    if (!v || !*v) return fallback;
    return (int)strtol(v, nullptr, 10);
}

// -------- OSC (single-float messages, same format as original binary) --------
static inline int pad4(int len) { return (len + 3) & ~3; }

static void osc_send_float(int sock, const sockaddr_in *addr,
                           const char *address, float val) {
    uint8_t buf[128] = {0};
    int pos = 0;

    int alen = (int)strlen(address) + 1;
    memcpy(buf + pos, address, alen);
    pos = pad4(alen);

    const char typetag[] = ",f";
    int tlen = (int)sizeof(typetag);               // includes trailing \0
    memcpy(buf + pos, typetag, tlen);
    pos = pos + pad4(tlen);

    uint32_t v;
    memcpy(&v, &val, 4);
    v = htonl(v);
    memcpy(buf + pos, &v, 4);
    pos += 4;

    sendto(sock, buf, pos, 0, (const sockaddr *)addr, sizeof(*addr));
}

// -------- Blob detection: 4-connected flood-fill on depth-threshold mask --------
struct Blob {
    int    pixelCount = 0;
    double sumX       = 0;
    double sumY       = 0;
    double sumMm      = 0;
};

static void detectBlobs(const uint16_t *depth, float scale,
                        const uint16_t *background,
                        int w, int h,
                        std::vector<Blob> &out) {
    // Reused across frames to avoid reallocation.
    static std::vector<uint8_t> visited;
    static std::vector<int32_t> stack;
    visited.assign(w * h, 0);
    stack.reserve(w * h);

    auto inRange = [&](int idx) -> bool {
        if (visited[idx]) return false;
        if (g_ignoreActive) {
            float nx = (float)(idx % w) / (float)w;
            float ny = (float)(idx / w) / (float)h;
            if (nx >= g_ignoreX0 && nx <= g_ignoreX1 &&
                ny >= g_ignoreY0 && ny <= g_ignoreY1) return false;
        }
        uint16_t raw = depth[idx];
        if (raw == 0) return false;
        float mm = raw * scale;
        // Generous Z bounds — covers head-to-feet of a person standing within
        // the user's floor-distance range; the actual D-bounds check happens
        // at the blob-centroid level, after detection.
        if (mm < g_zMinInternal || mm > g_zMaxInternal) return false;
        uint16_t bgRaw = background[idx];
        if (bgRaw == 0) return false;                   // no valid background at this pixel
        float bgMm = bgRaw * scale;
        return (bgMm - mm) >= FG_DELTA_MM;              // must stand clearly in front
    };

    for (int y = 0; y < h; ++y) {
        for (int x = 0; x < w; ++x) {
            int idx = y * w + x;
            if (!inRange(idx)) continue;

            Blob b;
            stack.clear();
            stack.push_back(idx);
            visited[idx] = 1;

            while (!stack.empty()) {
                int p = stack.back();
                stack.pop_back();
                int px = p % w;
                int py = p / w;
                float mm = depth[p] * scale;
                b.pixelCount++;
                b.sumX  += px;
                b.sumY  += py;
                b.sumMm += mm;

                // 4-neighbors
                if (px + 1 < w) { int n = p + 1; if (inRange(n)) { visited[n] = 1; stack.push_back(n); } }
                if (px     > 0) { int n = p - 1; if (inRange(n)) { visited[n] = 1; stack.push_back(n); } }
                if (py + 1 < h) { int n = p + w; if (inRange(n)) { visited[n] = 1; stack.push_back(n); } }
                if (py     > 0) { int n = p - w; if (inRange(n)) { visited[n] = 1; stack.push_back(n); } }
            }

            if (b.pixelCount >= MIN_BLOB_PX) out.push_back(b);
        }
    }
}

int main() {
    @autoreleasepool {
        signal(SIGINT,  handle_signal);
        signal(SIGTERM, handle_signal);

        g_ignoreX0 = envFloat("IGNORE_X0", 0);
        g_ignoreY0 = envFloat("IGNORE_Y0", 0);
        g_ignoreX1 = envFloat("IGNORE_X1", 0);
        g_ignoreY1 = envFloat("IGNORE_Y1", 0);
        g_ignoreActive = (g_ignoreX1 > g_ignoreX0 && g_ignoreY1 > g_ignoreY0);

        MIN_MM              = envFloat("MIN_MM",             MIN_MM);
        MAX_MM              = envFloat("MAX_MM",             MAX_MM);
        MIN_BLOB_PX         = envInt  ("MIN_BLOB_PX",        MIN_BLOB_PX);
        CAL_FRAMES          = envInt  ("CAL_FRAMES",         CAL_FRAMES);
        FG_DELTA_MM         = envFloat("FG_DELTA_MM",        FG_DELTA_MM);
        PERSON_ENTER_FRAMES = envInt  ("PERSON_ENTER_FRAMES", PERSON_ENTER_FRAMES);
        PERSON_EXIT_FRAMES  = envInt  ("PERSON_EXIT_FRAMES",  PERSON_EXIT_FRAMES);
        PERSON_TRACK_DIST   = envFloat("PERSON_TRACK_DIST",   PERSON_TRACK_DIST);
        CAMERA_TILT_DEG     = envFloat("CAMERA_TILT_DEG",     CAMERA_TILT_DEG);
        CAMERA_HEIGHT_M     = envFloat("CAMERA_HEIGHT_M",     CAMERA_HEIGHT_M);

        // Derive geometry once. With tilt=0 (horizontal camera) this is identity:
        // cos=1, sin=0 → offset=0 → D == Z, internal Z bounds == [MIN_MM, MAX_MM].
        const float tiltRad = CAMERA_TILT_DEG * (float)M_PI / 180.0f;
        g_cosTilt   = cosf(tiltRad);
        g_sinTilt   = sinf(tiltRad);
        g_offsetMm  = (CAMERA_HEIGHT_M - BODY_CENTER_M) * g_sinTilt * 1000.0f;
        // Per-pixel Z lower bound is an absolute floor so super-close blobs
        // (person right under the camera) still get detected — used to drive
        // /person/tooClose. Blob *centroid* is still gated by [MIN_MM, MAX_MM]
        // for the valid distance reading. Upper bound covers feet at MAX_MM.
        g_zMinInternal = 100.0f;
        g_zMaxInternal = MAX_MM * g_cosTilt + CAMERA_HEIGHT_M * g_sinTilt * 1000.0f;

        int sock = socket(AF_INET, SOCK_DGRAM, 0);
        if (sock < 0) { perror("socket"); return 1; }
        sockaddr_in addr{};
        addr.sin_family = AF_INET;
        addr.sin_port   = htons(OSC_PORT);
        inet_pton(AF_INET, OSC_ADDR, &addr.sin_addr);

        try {
            ob::Pipeline pipe;
            auto config = std::make_shared<ob::Config>();
            config->enableVideoStream(OB_STREAM_DEPTH, DEPTH_W, DEPTH_H, DEPTH_FPS, OB_FORMAT_Y16);
            pipe.start(config);

            printf("=== Orbbec Depth -> OSC (depth-only person detection) ===\n");
            printf("Depth: %dx%d @ %dfps | floor-distance %.0f-%.0f mm | min blob %d px\n",
                   DEPTH_W, DEPTH_H, DEPTH_FPS, MIN_MM, MAX_MM, MIN_BLOB_PX);
            printf("Camera geometry: tilt=%.1f° height=%.2fm  (Z=%.0f..%.0fmm internally)\n",
                   CAMERA_TILT_DEG, CAMERA_HEIGHT_M, g_zMinInternal, g_zMaxInternal);
            printf("Background subtraction: %d-frame capture, foreground delta %.0f mm\n",
                   CAL_FRAMES, FG_DELTA_MM);
            printf("Tracking: enter=%d frames, exit=%d frames, track-dist=%.2f\n",
                   PERSON_ENTER_FRAMES, PERSON_EXIT_FRAMES, PERSON_TRACK_DIST);
            printf("(override any of: MIN_MM MAX_MM MIN_BLOB_PX CAL_FRAMES FG_DELTA_MM\n");
            printf("                  PERSON_ENTER_FRAMES PERSON_EXIT_FRAMES PERSON_TRACK_DIST\n");
            printf("                  CAMERA_TILT_DEG CAMERA_HEIGHT_M)\n");
            if (g_ignoreActive) {
                printf("Ignore zone: x=[%.2f,%.2f] y=[%.2f,%.2f]\n",
                       g_ignoreX0, g_ignoreX1, g_ignoreY0, g_ignoreY1);
            } else {
                printf("Ignore zone: disabled (set IGNORE_X0/X1/Y0/Y1 to enable)\n");
            }
            printf("OSC:   /person/{count,distance,x,y} -> %s:%d\n", OSC_ADDR, OSC_PORT);
            printf("\n>>> STEP OUT OF FRAME — capturing background for %.1fs <<<\n",
                   (float)CAL_FRAMES / DEPTH_FPS);

            // \r for live terminal, \n when piped to a file/tee so logs are readable.
            const char *lineSep = isatty(fileno(stdout)) ? "\r" : "\n";

            std::vector<Blob> blobs;
            blobs.reserve(32);
            std::vector<uint16_t> background;     // per-pixel max depth observed during calibration
            uint32_t frameCount = 0;
            bool calibrated = false;

            // Tracking the closest blob across frames: only report once a candidate persists
            // PERSON_ENTER_FRAMES frames in roughly the same spot. During brief misses we hold
            // the last known pose for up to PERSON_EXIT_FRAMES frames before declaring "gone".
            struct {
                bool  hasCandidate  = false;
                float candX         = 0;
                float candY         = 0;
                float candDist      = 0;
                int   candFrames    = 0;
                int   missingFrames = 0;
                bool  confirmed     = false;
            } track;

            while (g_running) {
                @autoreleasepool {
                    auto frameSet = pipe.waitForFrameset(100);
                    if (!frameSet) continue;

                    auto raw = frameSet->getFrame(OB_FRAME_DEPTH);
                    if (!raw) continue;
                    auto depthFrame = raw->as<ob::DepthFrame>();
                    if (!depthFrame || depthFrame->getFormat() != OB_FORMAT_Y16) continue;

                    int w       = (int)depthFrame->getWidth();
                    int h       = (int)depthFrame->getHeight();
                    float scale = depthFrame->getValueScale();
                    const uint16_t *data =
                        reinterpret_cast<const uint16_t *>(depthFrame->getData());

                    int numPixels = w * h;
                    if ((int)background.size() != numPixels) background.assign(numPixels, 0);

                    if (!calibrated) {
                        // Accumulate per-pixel MAX: robust to transient obstructions during calibration.
                        for (int i = 0; i < numPixels; ++i) {
                            if (data[i] > background[i]) background[i] = data[i];
                        }
                        ++frameCount;
                        if (frameCount % 10 == 0) {
                            printf("%sCalibrating... %u/%d frames", lineSep, frameCount, CAL_FRAMES);
                            fflush(stdout);
                        }
                        // Suppress detection output during calibration.
                        osc_send_float(sock, &addr, "/person/count",    0);
                        osc_send_float(sock, &addr, "/person/distance", 0);
                        osc_send_float(sock, &addr, "/person/x",        0);
                        osc_send_float(sock, &addr, "/person/y",        0);
                        if ((int)frameCount >= CAL_FRAMES) {
                            calibrated = true;
                            frameCount = 0;
                            int validCount = 0;
                            for (int i = 0; i < numPixels; ++i) if (background[i] != 0) ++validCount;
                            printf("\nCalibration done (%d/%d pixels have valid background). Detection active.\n",
                                   validCount, numPixels);
                        }
                        continue;
                    }

                    blobs.clear();
                    detectBlobs(data, scale, background.data(), w, h, blobs);
                    int count = (int)blobs.size();

                    float outDistance = 0.0f;
                    float outX        = 0.0f;
                    float outY        = 0.0f;
                    bool  tooClose    = false;

                    if (count > 0) {
                        int bestIdx     = 0;
                        float bestMean  = 1e9f;
                        for (int i = 0; i < count; ++i) {
                            float mean = (float)(blobs[i].sumMm / blobs[i].pixelCount);
                            if (mean < bestMean) { bestMean = mean; bestIdx = i; }
                        }
                        const Blob &b = blobs[bestIdx];
                        float meanZ = (float)(b.sumMm / b.pixelCount);
                        // Convert raw depth Z into true horizontal floor distance D.
                        // Tilt=0 → D == Z, so existing semantics unchanged.
                        float floorDist = zToFloorDistMm(meanZ);
                        // Reject blobs outside the user's floor-distance interaction zone.
                        // Below MIN_MM = "too close" — flag separately so frontend can
                        // hold max-particle state. Above MAX_MM = ignore.
                        if (floorDist < MIN_MM) {
                            tooClose = true;
                            count    = 0;
                        } else if (floorDist > MAX_MM) {
                            count = 0;
                        } else {
                            outDistance = floorDist;
                            outX        = (float)(b.sumX  / b.pixelCount) / (float)w;
                            outY        = (float)(b.sumY  / b.pixelCount) / (float)h;
                        }
                    }

                    // -- Tracking: closest-blob continuity filter --
                    if (count > 0) {
                        bool sameBlob = false;
                        if (track.hasCandidate) {
                            float dx = outX - track.candX;
                            float dy = outY - track.candY;
                            float thresholdSq = PERSON_TRACK_DIST * PERSON_TRACK_DIST;
                            sameBlob = (dx*dx + dy*dy) <= thresholdSq;
                        }
                        track.hasCandidate  = true;
                        track.candFrames    = sameBlob ? (track.candFrames + 1) : 1;
                        track.candX         = outX;
                        track.candY         = outY;
                        track.candDist      = outDistance;
                        track.missingFrames = 0;
                        if (track.candFrames >= PERSON_ENTER_FRAMES) track.confirmed = true;
                    } else {
                        track.missingFrames++;
                        if (track.missingFrames >= PERSON_EXIT_FRAMES) {
                            track.hasCandidate = false;
                            track.candFrames   = 0;
                            track.confirmed    = false;
                        }
                    }

                    // Only report when confirmed; hold last pose during exit grace to avoid flicker.
                    // /person/y is sent as 0 sentinel — frontend locks dy=0 because the
                    // camera is tilted and y is redundant with distance. Kept on the wire
                    // because osc-bridge.mjs uses /person/y arrival to commit a frame.
                    // /person/tooClose is sent before /person/y so it's part of the same
                    // commit batch.
                    if (track.confirmed) {
                        int reportedCount = count > 0 ? count : 1;
                        osc_send_float(sock, &addr, "/person/count",    (float)reportedCount);
                        osc_send_float(sock, &addr, "/person/distance", track.candDist);
                        osc_send_float(sock, &addr, "/person/x",        track.candX);
                        osc_send_float(sock, &addr, "/person/tooClose", tooClose ? 1.0f : 0.0f);
                        osc_send_float(sock, &addr, "/person/y",        0);
                    } else {
                        osc_send_float(sock, &addr, "/person/count",    0);
                        osc_send_float(sock, &addr, "/person/distance", 0);
                        osc_send_float(sock, &addr, "/person/x",        0);
                        osc_send_float(sock, &addr, "/person/tooClose", tooClose ? 1.0f : 0.0f);
                        osc_send_float(sock, &addr, "/person/y",        0);
                    }

                    ++frameCount;
                    if (frameCount % 30 == 0) {
                        if (track.confirmed) {
                            printf("%sFrames: %u | Person tracked | floor %.0f mm (%.2f m) at x=%.2f      ",
                                   lineSep, frameCount, track.candDist, track.candDist / 1000.0f,
                                   track.candX);
                        } else if (track.candFrames > 0) {
                            printf("%sFrames: %u | Candidate (%d/%d frames)                                  ",
                                   lineSep, frameCount, track.candFrames, PERSON_ENTER_FRAMES);
                        } else {
                            printf("%sFrames: %u | No person                                                 ",
                                   lineSep, frameCount);
                        }
                        fflush(stdout);
                    }
                }
            }

            printf("\nStopping...\n");
            pipe.stop();
        } catch (const ob::Error &e) {
            fprintf(stderr, "\nob::Error: %s\n", e.what());
            close(sock);
            return 1;
        }

        close(sock);
        printf("Done.\n");
    }
    return 0;
}
