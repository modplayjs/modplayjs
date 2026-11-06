// SPDX-License-Identifier: BSD-3-Clause
//
// Fixed spatial bus mixer.
//
// The engine hands over one mono stem per module channel. Those stems are
// panned onto a fixed ring of `buses` directions, every bus is spatialized by
// Horizon OS through its own audio session, and the whole graph never changes
// when a track does. Around that core sit four stages the Spatial SDK does not
// offer (its AudioSessionId has only a session id and a type; the native side
// only sets an object position):
//
//   - distance gain and air absorption from the listener pose,
//   - occlusion gain and low-pass, fed by panel raycasts from Kotlin,
//   - a bass split at 90 Hz so low frequencies are not tied to a point,
//   - a room reverb encoded to first-order ambisonics and played back through
//     one extra AMBISONIC_ORDER_1 session.
//
// Everything here runs on the render thread. No allocation after configure().

#pragma once

#include <algorithm>
#include <cmath>
#include <cstddef>
#include <cstdint>
#include <cstring>
#include <vector>

class SpatialBusMixer {
public:
    static constexpr int kMaxBuses = 32;
    static constexpr int kMaxSources = 128;
    static constexpr int kSubBlock = 128;
    static constexpr int kMaxTaps = 8;
    static constexpr float kPi = 3.14159265358979f;
    static constexpr float kHalfPi = 1.57079632679490f;

    // ---------------------------------------------------------------- setup

    void configure(int sampleRate, int frames, int buses);

    /** Room size in metres and average absorption (0..1). Rebuilds the reverb. */
    void setRoom(float width, float depth, float height, float absorption);

    /** 0 disables the reverb, 100 is full wet. */
    void setWet(int percent);

    /**
     * Per-source parameters, called whenever they may have changed (10 Hz).
     * Layout per source: azimuthDeg, distanceM, gain, spreadDeg, occlusion01.
     * Also recomputes every filter coefficient; the sample loop stays untouched.
     */
    void setSources(const float* params, int count);

    /**
     * Mix `sources` stems of `frames` into `busOut` ([buses][frames]).
     * `busOut` is cleared here; the caller limits and converts afterwards.
     */
    void mix(const float* stems, int sources, int frames, float* busOut);

    /** Room reverb from the finished buses, interleaved W,Y,Z,X (AmbiX). */
    void renderReverb(const float* busOut, int frames, float* interleaved);

    /** Soft-knee limit and 16-bit conversion, used at the JNI boundary. */
    static void toPcm16(const float* src, int16_t* dst, int n, float headroom);

    int busCount() const { return buses_; }
    int framesPerBlock() const { return frames_; }

private:
    // ------------------------------------------------------------- building

    struct Biquad {
        float b0 = 1.f, b1 = 0.f, b2 = 0.f, a1 = 0.f, a2 = 0.f;
        float z1 = 0.f, z2 = 0.f;

        void reset() { z1 = z2 = 0.f; }

        inline float process(float x) {
            const float y = b0 * x + z1;
            z1 = b1 * x - a1 * y + z2;
            z2 = b2 * x - a2 * y;
            return y;
        }
    };

    struct Tap {
        int bus = 0;
        float gain = 0.f;
    };

    struct SourceRuntime {
        Tap cur[kMaxTaps];
        int curN = 0;
        Tap tgt[kMaxTaps];
        int tgtN = 0;

        Biquad lowPass;   // bass split, 2nd order Butterworth at 90 Hz
        Biquad highPass;
        float airState = 0.f;      // one-pole for air absorption + occlusion
        float airCoef = 0.f;

        float tgtHigh = 0.f;       // occlusion/distance gain, high path
        float tgtLow = 0.f;        // same for the omni low path
        float highGain = 0.f;
        float lowGain = 0.f;
    };

    struct Comb {
        std::vector<float> buf;
        int idx = 0;
        float damp = 0.f;
        float g = 0.8f;
        float store = 0.f;

        inline float process(float x) {
            const float y = buf[size_t(idx)];
            store = y * (1.f - damp) + store * damp;
            buf[size_t(idx)] = x + store * g;
            if (++idx >= int(buf.size())) idx = 0;
            return y;
        }
    };

    struct Allpass {
        std::vector<float> buf;
        int idx = 0;

        inline float process(float x) {
            const float y = buf[size_t(idx)];
            buf[size_t(idx)] = x + y * 0.5f;
            if (++idx >= int(buf.size())) idx = 0;
            return y - x;
        }
    };

    struct ReverbChannel {
        Comb combs[4];
        Allpass allpasses[2];

        float process(float x);
        void configure(int sampleRate, float rt60, int offset);
    };

    // ------------------------------------------------------------- helpers

    static float clampf(float v, float lo, float hi) { return v < lo ? lo : (v > hi ? hi : v); }

    static void lowPassCoef(Biquad& q, float sampleRate, float hz);
    static void highPassCoef(Biquad& q, float sampleRate, float hz);
    static void mixOne(const float* src, float* dst, int n, float gain);

    void rebuildPans(int source, float azimuthDeg, float spreadDeg);
    void rebuildReverb();

    // --------------------------------------------------------------- state

    int sampleRate_ = 48000;
    int frames_ = 960;
    int buses_ = 32;

    SourceRuntime src_[kMaxSources];
    int sourceCount_ = 0;

    std::vector<float> lowSum_;         // [kSubBlock]
    std::vector<float> scratchLow_;
    std::vector<float> scratchHigh_;

    // Reverb.
    std::vector<float> preDelay_[4];
    int preDelayIdx_ = 0;
    int preDelaySamples_ = 0;
    ReverbChannel reverb_[4];
    std::vector<float> reverbIn_[4];
    float busSin_[kMaxBuses] = {};
    float busCos_[kMaxBuses] = {};
    float wet_ = 0.25f;
    float send_ = 0.35f;
    float roomWidth_ = 4.f, roomDepth_ = 5.f, roomHeight_ = 2.6f, absorption_ = 0.25f;
};
