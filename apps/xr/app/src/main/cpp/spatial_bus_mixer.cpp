// SPDX-License-Identifier: BSD-3-Clause
#include "spatial_bus_mixer.h"

#if defined(__ARM_NEON)
#include <arm_neon.h>
#endif

namespace {

constexpr float kCrossoverHz = 90.f;
constexpr float kMaxDistanceMetres = 40.f;
constexpr float kGainSmooth = 0.08f;   // per 2.7 ms sub-block, tau ~ 33 ms

// A tiny DC offset keeps the feedback paths out of the denormal range without
// writing the FPCR flush-to-zero bit, which would also affect V8 in the same
// thread.
constexpr float kDenormalGuard = 1e-20f;

} // namespace

// ---------------------------------------------------------------- biquads

// RBJ cookbook with Butterworth Q, used for the 90 Hz bass split.
void SpatialBusMixer::lowPassCoef(Biquad& q, float sampleRate, float hz) {
    const float w0 = 2.f * kPi * hz / sampleRate;
    const float cw = std::cos(w0);
    const float alpha = std::sin(w0) / (2.f * 0.70710678f);
    const float a0 = 1.f + alpha;
    q.b0 = (1.f - cw) * 0.5f / a0;
    q.b1 = (1.f - cw) / a0;
    q.b2 = q.b0;
    q.a1 = -2.f * cw / a0;
    q.a2 = (1.f - alpha) / a0;
}

void SpatialBusMixer::highPassCoef(Biquad& q, float sampleRate, float hz) {
    const float w0 = 2.f * kPi * hz / sampleRate;
    const float cw = std::cos(w0);
    const float alpha = std::sin(w0) / (2.f * 0.70710678f);
    const float a0 = 1.f + alpha;
    q.b0 = (1.f + cw) * 0.5f / a0;
    q.b1 = -(1.f + cw) / a0;
    q.b2 = q.b0;
    q.a1 = -2.f * cw / a0;
    q.a2 = (1.f - alpha) / a0;
}

// ---------------------------------------------------------------- helper

void SpatialBusMixer::mixOne(const float* src, float* dst, int n, float gain) {
    int i = 0;
#if defined(__ARM_NEON)
    const float32x4_t g = vdupq_n_f32(gain);
    for (; i + 8 <= n; i += 8) {
        const float32x4_t s0 = vld1q_f32(src + i);
        const float32x4_t s1 = vld1q_f32(src + i + 4);
        vst1q_f32(dst + i, vfmaq_f32(vld1q_f32(dst + i), s0, g));
        vst1q_f32(dst + i + 4, vfmaq_f32(vld1q_f32(dst + i + 4), s1, g));
    }
#endif
    for (; i < n; ++i) dst[i] += src[i] * gain;
}

namespace {
inline float softClip(float x) {
    const float ax = std::fabs(x);
    if (ax <= 1.f / 3.f) return 2.f * x;
    if (ax >= 2.f / 3.f) return x > 0.f ? 1.f : -1.f;
    const float t = 2.f - 3.f * ax;
    const float y = (3.f - t * t) * (1.f / 3.f);
    return x > 0.f ? y : -y;
}
} // namespace

void SpatialBusMixer::toPcm16(const float* src, int16_t* dst, int n, float headroom) {
    if (!dst) return;
    for (int i = 0; i < n; ++i) {
        const float v = softClip(src[i] * headroom);
        const long q = std::lrintf(v * 32767.f);
        dst[i] = int16_t(q < -32768 ? -32768 : (q > 32767 ? 32767 : q));
    }
}

// ---------------------------------------------------------------- reverb

void SpatialBusMixer::ReverbChannel::configure(int sampleRate, float rt60, int offset) {
    // Freeverb's prime delay lengths, rescaled to the running sample rate.
    static const int kComb[4] = {1116, 1188, 1277, 1356};
    static const int kAllpass[2] = {556, 441};
    const float scale = float(sampleRate) / 44100.f;

    for (int i = 0; i < 4; ++i) {
        const int len = int(float(kComb[i]) * scale) + offset;
        combs[i].buf.assign(size_t(std::max(len, 8)), 0.f);
        combs[i].idx = 0;
        combs[i].store = 0.f;
        // Sabine: g = 10^(-3 * delaySeconds / rt60).
        const float delaySec = float(len) / float(sampleRate);
        combs[i].g = std::pow(10.f, -3.f * delaySec / std::max(rt60, 0.05f));
        combs[i].damp = 0.30f;   // the high band decays faster than the low one
    }
    for (int i = 0; i < 2; ++i) {
        const int len = int(float(kAllpass[i]) * scale) + offset;
        allpasses[i].buf.assign(size_t(std::max(len, 8)), 0.f);
        allpasses[i].idx = 0;
    }
}

float SpatialBusMixer::ReverbChannel::process(float x) {
    float sum = 0.f;
    for (auto& c : combs) sum += c.process(x + kDenormalGuard);
    sum *= 0.25f;
    for (auto& a : allpasses) sum = a.process(sum);
    return sum;
}

// ---------------------------------------------------------------- setup

void SpatialBusMixer::configure(int sampleRate, int frames, int buses) {
    sampleRate_ = std::max(sampleRate, 8000);
    frames_ = std::max(frames, 64);
    buses_ = std::clamp(buses, 1, kMaxBuses);

    lowSum_.assign(kSubBlock, 0.f);
    scratchLow_.assign(kSubBlock, 0.f);
    scratchHigh_.assign(kSubBlock, 0.f);

    for (int s = 0; s < kMaxSources; ++s) {
        SourceRuntime& rt = src_[s];
        rt.curN = rt.tgtN = 0;
        rt.airState = 0.f;
        rt.airCoef = 0.f;
        rt.lowPass.reset();
        rt.highPass.reset();
        lowPassCoef(rt.lowPass, float(sampleRate_), kCrossoverHz);
        highPassCoef(rt.highPass, float(sampleRate_), kCrossoverHz);
        rt.tgtHigh = rt.tgtLow = rt.highGain = rt.lowGain = 0.f;
    }
    sourceCount_ = 0;

    for (int b = 0; b < buses_; ++b) {
        const float az = -180.f + 360.f * float(b) / float(buses_);
        const float rad = az * kPi / 180.f;
        busCos_[b] = std::cos(rad);        // AmbiX X: front
        busSin_[b] = -std::sin(rad);       // AmbiX Y: left is positive
    }

    rebuildReverb();
}

void SpatialBusMixer::setRoom(float width, float depth, float height, float absorption) {
    roomWidth_ = std::max(width, 0.5f);
    roomDepth_ = std::max(depth, 0.5f);
    roomHeight_ = std::max(height, 0.5f);
    absorption_ = clampf(absorption, 0.05f, 0.9f);
    rebuildReverb();
}

void SpatialBusMixer::setWet(int percent) {
    wet_ = clampf(float(percent) / 100.f, 0.f, 1.f);
}

void SpatialBusMixer::rebuildReverb() {
    const float v = roomWidth_ * roomDepth_ * roomHeight_;
    const float s = 2.f * (roomWidth_ * roomDepth_ + roomWidth_ * roomHeight_ +
                           roomDepth_ * roomHeight_);
    const float rt60 = clampf(0.161f * v / (s * absorption_), 0.15f, 2.5f);

    // One mean free path of pre-delay keeps the direct sound and the tail apart.
    const float mfp = 4.f * v / std::max(s, 0.1f);
    preDelaySamples_ = std::clamp(int(mfp / 343.f * float(sampleRate_)), 0, sampleRate_ / 10);

    for (int c = 0; c < 4; ++c) {
        preDelay_[c].assign(size_t(std::max(preDelaySamples_ + 1, 1)), 0.f);
        // Different offsets decorrelate the four ambisonic channels.
        reverb_[c].configure(sampleRate_, rt60, c * 37);
        reverbIn_[c].assign(size_t(frames_), 0.f);
    }
    preDelayIdx_ = 0;
}

// ---------------------------------------------------------------- sources

void SpatialBusMixer::rebuildPans(int source, float azimuthDeg, float spreadDeg) {
    SourceRuntime& rt = src_[source];
    const float spacing = 360.f / float(buses_);

    // Bus position of the azimuth, wrapped into [0, buses).
    float pos = (azimuthDeg + 180.f) / 360.f * float(buses_);
    pos -= std::floor(pos / float(buses_)) * float(buses_);

    if (spreadDeg < spacing * 0.5f) {
        // Point source: VBAP between the two surrounding buses, constant power.
        const int i0 = int(pos) % buses_;
        const int i1 = (i0 + 1) % buses_;
        const float f = pos - std::floor(pos);
        rt.tgtN = 2;
        rt.tgt[0].bus = i0;
        rt.tgt[0].gain = std::cos(f * kHalfPi);
        rt.tgt[1].bus = i1;
        rt.tgt[1].gain = std::sin(f * kHalfPi);
        return;
    }

    // Wide source: raised-cosine window over every bus inside +-spread/2.
    const float half = spreadDeg * 0.5f;
    float gains[kMaxBuses] = {};
    float power = 0.f;
    int n = 0;
    for (int b = 0; b < buses_; ++b) {
        float d = (float(b) - pos) * spacing;
        // Wrap to the shorter way around the ring.
        if (d > 180.f) d -= 360.f;
        if (d < -180.f) d += 360.f;
        if (std::fabs(d) > half) continue;
        const float g = 0.5f * (1.f + std::cos(kPi * d / half));
        gains[b] = g;
        power += g * g;
        ++n;
    }
    if (n == 0 || power <= 0.f) {
        rt.tgtN = 0;
        return;
    }
    const float norm = 1.f / std::sqrt(power);
    n = 0;
    for (int b = 0; b < buses_ && n < kMaxTaps; ++b) {
        if (gains[b] <= 0.f) continue;
        rt.tgt[n].bus = b;
        rt.tgt[n].gain = gains[b] * norm;
        ++n;
    }
    rt.tgtN = n;
}

void SpatialBusMixer::setSources(const float* params, int count) {
    sourceCount_ = std::clamp(count, 0, kMaxSources);
    for (int s = 0; s < sourceCount_; ++s) {
        const float* p = params + size_t(s) * 5;
        const float az = p[0];
        const float dist = clampf(p[1], 0.f, kMaxDistanceMetres);
        const float gain = std::max(p[2], 0.f);
        const float spread = std::max(p[3], 0.f);
        const float occ = clampf(p[4], 0.f, 1.f);

        // Inverse distance with a 1 m reference and a floor for far sources.
        const float distanceGain = clampf(1.f / std::max(dist, 1.f), 0.05f, 1.f);
        const float g = gain * distanceGain;

        SourceRuntime& rt = src_[s];
        // The high path takes the full occlusion; the bass is only gently
        // attenuated, because low frequencies diffract around a panel instead
        // of stopping at it.
        rt.tgtHigh = g * (1.f - 0.75f * occ);
        rt.tgtLow = g * (1.f - 0.35f * occ);

        // Air absorption and occlusion set the corner of the one-pole.
        const float fcAir = 1500.f + 18500.f * std::exp(-dist / 12.f);
        const float fcOcc = 8000.f * (1.f - occ) + 600.f * occ;
        const float fc = clampf(std::min(fcAir, fcOcc), 300.f, 20000.f);
        rt.airCoef = clampf(1.f - std::exp(-2.f * kPi * fc / float(sampleRate_)), 0.f, 1.f);

        rebuildPans(s, az, spread);
    }
}

// ------------------------------------------------------------------- mix

void SpatialBusMixer::mix(const float* stems, int sources, int frames, float* busOut) {
    if (!busOut || sources <= 0 || frames <= 0) return;
    sources = std::min(sources, kMaxSources);
    std::memset(busOut, 0, sizeof(float) * size_t(buses_) * size_t(frames));

    for (int off = 0; off < frames; off += kSubBlock) {
        const int n = std::min(kSubBlock, frames - off);
        const float u = float(off + n) / float(frames);
        std::fill(lowSum_.begin(), lowSum_.begin() + n, 0.f);

        for (int s = 0; s < sources; ++s) {
            SourceRuntime& rt = src_[s];
            const float* src = stems + size_t(s) * size_t(frames) + off;
            float* low = scratchLow_.data();
            float* high = scratchHigh_.data();

            rt.highGain += (rt.tgtHigh - rt.highGain) * kGainSmooth;
            rt.lowGain += (rt.tgtLow - rt.lowGain) * kGainSmooth;

            for (int i = 0; i < n; ++i) {
                const float x = src[i];
                const float lo = rt.lowPass.process(x) * rt.lowGain;
                const float hi = rt.highPass.process(x);
                rt.airState += rt.airCoef * (hi - rt.airState);
                low[i] = lo;
                high[i] = rt.airState * rt.highGain;
            }

            for (int i = 0; i < n; ++i) lowSum_[size_t(i)] += low[i];

            bool changed = rt.curN != rt.tgtN;
            if (!changed) {
                for (int t = 0; t < rt.tgtN; ++t) {
                    if (rt.cur[t].bus != rt.tgt[t].bus ||
                        std::fabs(rt.cur[t].gain - rt.tgt[t].gain) > 1e-4f) {
                        changed = true;
                        break;
                    }
                }
            }

            if (changed) {
                // One block of crossfade: the old pair fades out, the new one in.
                for (int t = 0; t < rt.curN; ++t) {
                    mixOne(high, busOut + size_t(rt.cur[t].bus) * frames + off, n,
                           rt.cur[t].gain * (1.f - u));
                }
                for (int t = 0; t < rt.tgtN; ++t) {
                    mixOne(high, busOut + size_t(rt.tgt[t].bus) * frames + off, n,
                           rt.tgt[t].gain * u);
                }
            } else {
                for (int t = 0; t < rt.tgtN; ++t) {
                    mixOne(high, busOut + size_t(rt.tgt[t].bus) * frames + off, n,
                           rt.tgt[t].gain);
                }
            }
        }

        // The low path is direction-free: one sum, added to every bus with
        // 1/N so the coherent sum keeps its level.
        const float lowGain = 1.f / float(buses_);
        for (int b = 0; b < buses_; ++b) {
            mixOne(lowSum_.data(), busOut + size_t(b) * frames + off, n, lowGain);
        }
    }

    for (int s = 0; s < sources; ++s) {
        SourceRuntime& rt = src_[s];
        std::copy(rt.tgt, rt.tgt + rt.tgtN, rt.cur);
        rt.curN = rt.tgtN;
    }
}

void SpatialBusMixer::renderReverb(const float* busOut, int frames, float* out) {
    if (!out || frames <= 0) return;
    if (wet_ <= 0.f || preDelay_[0].empty()) {
        std::memset(out, 0, sizeof(float) * size_t(frames) * 4);
        return;
    }

    const bool predelay = preDelaySamples_ > 0;
    for (int i = 0; i < frames; ++i) {
        float w = 0.f, y = 0.f, x = 0.f;
        for (int b = 0; b < buses_; ++b) {
            const float s = busOut[size_t(b) * size_t(frames) + i] * send_;
            w += s * 0.70710678f;
            y += s * busSin_[b];
            x += s * busCos_[b];
        }
        // A little of the omni content into Z gives the tail some height; a
        // purely horizontal ambisonic field sounds flat above and below.
        const float z = w * 0.25f;

        const float in[4] = {w, y, z, x};
        float delayed[4];
        for (int c = 0; c < 4; ++c) {
            auto& buf = preDelay_[c];
            const size_t idx = size_t(preDelayIdx_);
            buf[idx] = in[c];
            if (!predelay) {
                delayed[c] = in[c];
            } else {
                int r = preDelayIdx_ - preDelaySamples_;
                if (r < 0) r += int(buf.size());
                delayed[c] = buf[size_t(r)];
            }
        }
        if (++preDelayIdx_ >= int(preDelay_[0].size())) preDelayIdx_ = 0;

        out[size_t(i) * 4 + 0] = reverb_[0].process(delayed[0]) * wet_;
        out[size_t(i) * 4 + 1] = reverb_[1].process(delayed[1]) * wet_;
        out[size_t(i) * 4 + 2] = reverb_[2].process(delayed[2]) * wet_;
        out[size_t(i) * 4 + 3] = reverb_[3].process(delayed[3]) * wet_;
    }
}
