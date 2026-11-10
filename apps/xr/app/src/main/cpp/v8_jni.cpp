#include <jni.h>
#include <android/log.h>
#include <mutex>
#include <memory>
#include <string>
#include <vector>
#include <algorithm>
#include <android/asset_manager_jni.h>
#include "module_loader.h"
#include "spatial_bus_mixer.h"
#include "v8.h"
#include "libplatform/libplatform.h"

#define LOG_TAG "modplay-v8"
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, LOG_TAG, __VA_ARGS__)
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO, LOG_TAG, __VA_ARGS__)
#define LOGW(...) __android_log_print(ANDROID_LOG_WARN, LOG_TAG, __VA_ARGS__)

namespace {
std::once_flag g_init;
std::unique_ptr<v8::Platform> g_platform;
std::unique_ptr<v8::ArrayBuffer::Allocator> g_allocator;

struct Engine {
    v8::Isolate* isolate = nullptr;
    v8::Global<v8::Context> context;
    ModuleLoader* loader = nullptr;
};

void init_v8() {
    std::call_once(g_init, [] {
        g_platform = v8::platform::NewDefaultPlatform();
        v8::V8::InitializePlatform(g_platform.get());
        v8::V8::Initialize();
        g_allocator.reset(v8::ArrayBuffer::Allocator::NewDefaultAllocator());
        LOGI("V8 initialized");
    });
}

v8::Local<v8::Value> get_global(Engine* e) {
    return e->context.Get(e->isolate)->Global();
}

v8::Local<v8::Value> get_fn(Engine* e, const char* name) {
    auto ctx = e->context.Get(e->isolate);
    v8::Local<v8::Object> global;
    if (!get_global(e)->ToObject(ctx).ToLocal(&global)) return {};
    v8::Local<v8::String> apiKey = v8::String::NewFromUtf8(e->isolate, "__modplay").ToLocalChecked();
    v8::Local<v8::Value> api;
    if (!global->Get(ctx, apiKey).ToLocal(&api)) return {};
    if (!api->IsObject()) return {};
    v8::Local<v8::String> key = v8::String::NewFromUtf8(e->isolate, name).ToLocalChecked();
    v8::Local<v8::Value> fn;
    if (!api.As<v8::Object>()->Get(ctx, key).ToLocal(&fn)) return {};
    return fn;
}

std::string to_string(Engine* e, v8::Local<v8::Value> v) {
    v8::String::Utf8Value s(e->isolate, v);
    return *s ? std::string(*s, s.length()) : std::string();
}

Engine* engine(jlong h) { return reinterpret_cast<Engine*>(h); }
} // namespace

extern "C" JNIEXPORT jlong JNICALL
Java_com_bitti06_modplayjs_engine_V8Engine_nativeCreate(
        JNIEnv* env, jobject, jstring script, jobject assetManager, jstring overlayRoot) {
    init_v8();
    auto* e = new Engine();
    v8::Isolate::CreateParams params;
    params.array_buffer_allocator = g_allocator.get();
    e->isolate = v8::Isolate::New(params);
    if (!e->isolate) { delete e; return 0; }
    v8::Isolate::Scope isolate_scope(e->isolate);
    v8::HandleScope handle_scope(e->isolate);
    v8::Local<v8::Context> context = v8::Context::New(e->isolate);
    e->context.Reset(e->isolate, context);
    v8::Context::Scope context_scope(context);

    // One loader per isolate: the asset manager resolves @modplayjs/* onto the
    // partitioned asset tree, and the compiled modules are cached here. The
    // overlay directory, when set, is an app-private tree that wins per file -
    // it is where a published engine catalog installs updated modules.
    std::string overlay;
    if (overlayRoot) {
        const char* o = env->GetStringUTFChars(overlayRoot, nullptr);
        overlay.assign(o);
        env->ReleaseStringUTFChars(overlayRoot, o);
    }
    e->loader = new ModuleLoader(e->isolate, AAssetManager_fromJava(env, assetManager),
                                 std::move(overlay));
    if (!e->loader->overlayRoot().empty()) {
        LOGI("engine overlay: %s", e->loader->overlayRoot().c_str());
    }

    bool started = false;
    if (e->loader->ready()) {
        // The modular path: engine-core is an ES module that imports
        // @modplayjs/core and friends from the asset tree.
        started = e->loader->run(context, "modules/engine-core/index.js");
        if (started) LOGI("engine: modular, %zu modules compiled", e->loader->moduleCount());
        else LOGW("engine-core failed, falling back to the bundled script");
    }

    if (!started && script) {
        // The monolith fallback: a single bundled classic script, evaluated as
        // before. Used when the modular assets are missing or engine-core
        // threw, so a broken asset build costs a diagnostic line instead of
        // the whole app.
        v8::TryCatch try_catch(e->isolate);
        const char* src = env->GetStringUTFChars(script, nullptr);
        v8::Local<v8::String> source =
            v8::String::NewFromUtf8(e->isolate, src).ToLocalChecked();
        env->ReleaseStringUTFChars(script, src);
        v8::Local<v8::Script> compiled;
        if (!v8::Script::Compile(context, source).ToLocal(&compiled)) {
            LOGE("engine compile failed: %s", to_string(e, try_catch.Exception()).c_str());
        } else {
            v8::Local<v8::Value> result;
            if (compiled->Run(context).ToLocal(&result)) {
                started = true;
                LOGI("engine: bundled script");
            } else {
                LOGE("engine run failed: %s", to_string(e, try_catch.Exception()).c_str());
            }
        }
    }

    if (!started) {
        delete e->loader;
        e->context.Reset();
        e->isolate->Dispose();
        delete e;
        return 0;
    }
    return reinterpret_cast<jlong>(e);
}

/**
 * Install one format bridge (assets/modules/install/<format>.js).
 *
 * Runs on the audio thread, like every other V8 call. The bridge imports its
 * package, attaches any services the engine needs and registers the plugins;
 * the module cache makes a second install of the same format a no-op.
 */
extern "C" JNIEXPORT jboolean JNICALL
Java_com_bitti06_modplayjs_engine_V8Engine_nativeInstallFormat(
        JNIEnv* env, jobject, jlong h, jstring format) {
    Engine* e = engine(h);
    if (!e || !e->loader) return JNI_FALSE;
    const char* c = env->GetStringUTFChars(format, nullptr);
    const std::string name(c);
    env->ReleaseStringUTFChars(format, c);
    v8::Isolate::Scope isolate_scope(e->isolate);
    v8::HandleScope handle_scope(e->isolate);
    auto ctx = e->context.Get(e->isolate);
    return e->loader->run(ctx, "modules/install/" + name + ".js") ? JNI_TRUE : JNI_FALSE;
}

extern "C" JNIEXPORT void JNICALL
Java_com_bitti06_modplayjs_engine_V8Engine_nativeLoad(JNIEnv* env, jobject, jlong h, jbyteArray bytes, jstring name) {
    Engine* e = engine(h);
    if (!e) return;
    v8::Isolate::Scope isolate_scope(e->isolate);
    v8::HandleScope handle_scope(e->isolate);
    auto ctx = e->context.Get(e->isolate);
    v8::Context::Scope context_scope(ctx);
    v8::TryCatch try_catch(e->isolate);
    const jsize len = env->GetArrayLength(bytes);
    // Read the module straight into V8's backing store: the old path made a
    // full std::vector copy first, which doubled peak memory for big modules.
    v8::Local<v8::ArrayBuffer> ab = v8::ArrayBuffer::New(e->isolate, static_cast<size_t>(len));
    env->GetByteArrayRegion(bytes, 0, len, reinterpret_cast<jbyte*>(ab->GetBackingStore()->Data()));
    v8::Local<v8::Uint8Array> u8 = v8::Uint8Array::New(ab, 0, static_cast<size_t>(len));
    const char* n = env->GetStringUTFChars(name, nullptr);
    v8::Local<v8::String> nameStr = v8::String::NewFromUtf8(e->isolate, n).ToLocalChecked();
    env->ReleaseStringUTFChars(name, n);
    v8::Local<v8::Value> fnv = get_fn(e, "load");
    if (!fnv.IsEmpty() && fnv->IsFunction()) {
        v8::Local<v8::Function> fn = fnv.As<v8::Function>();
        v8::Local<v8::Value> args[2] = { u8, nameStr };
        v8::Local<v8::Value> result;
        if (!fn->Call(ctx, fn, 2, args).ToLocal(&result)) {
            // load() throws for unsupported/corrupt modules. Never
            // ToLocalChecked() here: that aborts the whole process.
            std::string message = try_catch.HasCaught()
                ? to_string(e, try_catch.Exception())
                : "module load failed";
            LOGE("load: %s", message.c_str());
            jclass ex = env->FindClass("java/lang/IllegalStateException");
            if (ex) env->ThrowNew(ex, message.c_str());
        }
    } else {
        jclass ex = env->FindClass("java/lang/IllegalStateException");
        if (ex) env->ThrowNew(ex, "engine load() missing");
    }
}

extern "C" JNIEXPORT jstring JNICALL
Java_com_bitti06_modplayjs_engine_V8Engine_nativeCommand(JNIEnv* env, jobject, jlong h, jstring json) {
    Engine* e = engine(h);
    if (!e) return env->NewStringUTF("{\"error\":\"v8-null\"}");
    v8::Isolate::Scope isolate_scope(e->isolate);
    v8::HandleScope handle_scope(e->isolate);
    auto ctx = e->context.Get(e->isolate);
    v8::Context::Scope context_scope(ctx);
    v8::TryCatch try_catch(e->isolate);
    const char* c = env->GetStringUTFChars(json, nullptr);
    v8::Local<v8::Value> fnv = get_fn(e, "command");
    std::string out;
    if (!fnv.IsEmpty() && fnv->IsFunction()) {
        v8::Local<v8::Value> args[1] = { v8::String::NewFromUtf8(e->isolate, c).ToLocalChecked() };
        v8::Local<v8::Value> res;
        if (fnv.As<v8::Function>()->Call(ctx, fnv, 1, args).ToLocal(&res)) out = to_string(e, res);
    }
    std::string sent(c);
    env->ReleaseStringUTFChars(json, c);
    if (try_catch.HasCaught()) {
        LOGE("command %s: %s", sent.c_str(), to_string(e, try_catch.Exception()).c_str());
        out = "{\"error\":\"command\"}";
    }
    return env->NewStringUTF(out.c_str());
}

extern "C" JNIEXPORT jfloatArray JNICALL
Java_com_bitti06_modplayjs_engine_V8Engine_nativeRender(JNIEnv* env, jobject, jlong h, jint frames) {
    Engine* e = engine(h);
    if (!e) return env->NewFloatArray(0);
    v8::Isolate::Scope isolate_scope(e->isolate);
    v8::HandleScope handle_scope(e->isolate);
    auto ctx = e->context.Get(e->isolate);
    v8::Context::Scope context_scope(ctx);
    v8::TryCatch try_catch(e->isolate);
    v8::Local<v8::Value> fnv = get_fn(e, "render");
    if (fnv.IsEmpty() || !fnv->IsFunction()) return env->NewFloatArray(0);
    v8::Local<v8::Value> args[1] = { v8::Integer::New(e->isolate, frames) };
    v8::Local<v8::Value> res;
    if (!fnv.As<v8::Function>()->Call(ctx, fnv, 1, args).ToLocal(&res)) {
        if (try_catch.HasCaught()) LOGE("render: %s", to_string(e, try_catch.Exception()).c_str());
        return env->NewFloatArray(0);
    }
    if (!res->IsFloat32Array()) {
        LOGE("render returned non-Float32Array");
        return env->NewFloatArray(0);
    }
    v8::Local<v8::Float32Array> arr = res.As<v8::Float32Array>();
    size_t len = arr->Length();
    auto store = arr->Buffer()->GetBackingStore();
    const auto* base = static_cast<const float*>(store->Data()) + (arr->ByteOffset() / sizeof(float));
    // Copy once, straight from the V8 backing store into the Java array. The
    // std::vector copy added ~8 KB of churn per 20 ms audio block.
    jfloatArray out = env->NewFloatArray(static_cast<jsize>(len));
    if (out) env->SetFloatArrayRegion(out, 0, static_cast<jsize>(len), base);
    return out;
}

extern "C" JNIEXPORT jint JNICALL
Java_com_bitti06_modplayjs_engine_V8Engine_nativeRenderSpatialInto(
        JNIEnv* env, jobject, jlong h, jint frames, jfloatArray dest) {
    Engine* e = engine(h);
    if (!e || !dest) return -1;
    v8::Isolate::Scope isolate_scope(e->isolate);
    v8::HandleScope handle_scope(e->isolate);
    auto ctx = e->context.Get(e->isolate);
    v8::Context::Scope context_scope(ctx);
    v8::TryCatch try_catch(e->isolate);
    v8::Local<v8::Value> fnv = get_fn(e, "renderSpatial");
    if (fnv.IsEmpty() || !fnv->IsFunction()) return 0;
    v8::Local<v8::Value> args[1] = { v8::Integer::New(e->isolate, frames) };
    v8::Local<v8::Value> res;
    if (!fnv.As<v8::Function>()->Call(ctx, fnv, 1, args).ToLocal(&res)) {
        if (try_catch.HasCaught()) LOGE("render: %s", to_string(e, try_catch.Exception()).c_str());
        return 0;
    }
    if (!res->IsFloat32Array()) {
        LOGE("render returned non-Float32Array");
        return 0;
    }
    v8::Local<v8::Float32Array> arr = res.As<v8::Float32Array>();
    const jsize len = static_cast<jsize>(arr->Length());
    const jsize capacity = env->GetArrayLength(dest);
    if (len > capacity) {
        LOGE("spatial block %d floats exceeds the %d-float destination", int(len), int(capacity));
        return -1;
    }
    auto store = arr->Buffer()->GetBackingStore();
    const auto* base = static_cast<const float*>(store->Data()) + (arr->ByteOffset() / sizeof(float));
    env->SetFloatArrayRegion(dest, 0, len, base);
    return len;
}

extern "C" JNIEXPORT jstring JNICALL
Java_com_bitti06_modplayjs_engine_V8Engine_nativeSnapshot(JNIEnv* env, jobject, jlong h) {
    Engine* e = engine(h);
    if (!e) return env->NewStringUTF("{\"error\":\"v8-null\"}");
    v8::Isolate::Scope isolate_scope(e->isolate);
    v8::HandleScope handle_scope(e->isolate);
    auto ctx = e->context.Get(e->isolate);
    v8::Context::Scope context_scope(ctx);
    v8::TryCatch try_catch(e->isolate);
    v8::Local<v8::Value> fnv = get_fn(e, "snapshot");
    std::string out;
    if (!fnv.IsEmpty() && fnv->IsFunction()) {
        v8::Local<v8::Value> res;
        if (fnv.As<v8::Function>()->Call(ctx, fnv, 0, nullptr).ToLocal(&res)) out = to_string(e, res);
    }
    if (out.empty()) out = "{\"error\":\"snapshot\"}";
    return env->NewStringUTF(out.c_str());
}

extern "C" JNIEXPORT void JNICALL
Java_com_bitti06_modplayjs_engine_V8Engine_nativeDestroy(JNIEnv*, jobject, jlong h) {
    Engine* e = engine(h);
    if (!e) return;
    {
        v8::Isolate::Scope isolate_scope(e->isolate);
        e->context.Reset();
    }
    delete e->loader;
    e->loader = nullptr;
    e->isolate->Dispose();
    delete e;
}


// --------------------------------------------------------------- bus mixer
//
// The mixdown itself lives in spatial_bus_mixer.cpp. This section only owns
// the JNI boundary: the direct buffers Kotlin writes to its AudioTracks, the
// source parameters, and the float-to-PCM conversion.

static std::mutex g_busMutex;
static SpatialBusMixer* g_busMixer = nullptr;
static int16_t* g_busPcm[SpatialBusMixer::kMaxBuses] = {};
static int16_t* g_reverbPcm = nullptr;
static float* g_busFloat = nullptr;
static float* g_reverbFloat = nullptr;
static int g_busCount = 0;
static int g_busFrames = 0;

extern "C" JNIEXPORT jboolean JNICALL
Java_com_bitti06_modplayjs_engine_V8Engine_nativeStartSpatialBuses(
        JNIEnv* env, jobject, jobjectArray buffers, jobject reverbBuffer,
        jint sampleRate, jint frames, jint buses) {
    std::lock_guard<std::mutex> lock(g_busMutex);
    delete g_busMixer;
    delete[] g_busFloat;
    delete[] g_reverbFloat;
    g_busMixer = nullptr;
    g_busFloat = nullptr;
    g_reverbFloat = nullptr;
    g_reverbPcm = nullptr;
    for (auto& p : g_busPcm) p = nullptr;

    if (!buffers || frames <= 0 || buses <= 0) return JNI_FALSE;
    // Never index past the array Kotlin actually passed. One local reference
    // is alive at a time here and is deleted immediately - the table has a
    // hard limit (512 on ART), so this loop must not accumulate them.
    const jsize available = env->GetArrayLength(buffers);
    g_busCount = std::min({buses, SpatialBusMixer::kMaxBuses, int(available)});
    if (g_busCount <= 0) return JNI_FALSE;
    g_busFrames = frames;

    g_busMixer = new SpatialBusMixer();
    g_busMixer->configure(sampleRate, frames, g_busCount);
    g_busFloat = new float[size_t(g_busCount) * size_t(frames)];
    g_reverbFloat = new float[size_t(frames) * 4];

    for (int i = 0; i < g_busCount; ++i) {
        jobject buf = env->GetObjectArrayElement(buffers, i);
        g_busPcm[i] = buf ? static_cast<int16_t*>(env->GetDirectBufferAddress(buf)) : nullptr;
        if (buf) env->DeleteLocalRef(buf);
    }
    g_reverbPcm = reverbBuffer
        ? static_cast<int16_t*>(env->GetDirectBufferAddress(reverbBuffer))
        : nullptr;

    LOGI("spatial buses: %d of %d, %d frames, reverb %s", g_busCount, int(buses),
         int(frames), g_reverbPcm ? "on" : "off");
    return g_busPcm[0] ? JNI_TRUE : JNI_FALSE;
}

extern "C" JNIEXPORT void JNICALL
Java_com_bitti06_modplayjs_engine_V8Engine_nativeSetSpatialBuses(
        JNIEnv* env, jobject, jfloatArray dirs) {
    if (!g_busMixer || !dirs) return;
    auto* p = static_cast<jfloat*>(env->GetPrimitiveArrayCritical(dirs, nullptr));
    if (!p) return;
    const jsize n = env->GetArrayLength(dirs) / 3;
    g_busMixer->setBuses(p, n);
    env->ReleasePrimitiveArrayCritical(dirs, p, JNI_ABORT);
}

extern "C" JNIEXPORT void JNICALL
Java_com_bitti06_modplayjs_engine_V8Engine_nativeSetSpatialSources(
        JNIEnv* env, jobject, jfloatArray params, jint count) {
    if (!g_busMixer || !params) return;
    auto* p = static_cast<jfloat*>(env->GetPrimitiveArrayCritical(params, nullptr));
    if (!p) return;
    g_busMixer->setSources(p, count);
    env->ReleasePrimitiveArrayCritical(params, p, JNI_ABORT);
}

extern "C" JNIEXPORT void JNICALL
Java_com_bitti06_modplayjs_engine_V8Engine_nativeSetSpatialRoom(
        JNIEnv*, jobject, jfloat width, jfloat depth, jfloat height, jfloat absorption) {
    if (g_busMixer) g_busMixer->setRoom(width, depth, height, absorption);
}

extern "C" JNIEXPORT void JNICALL
Java_com_bitti06_modplayjs_engine_V8Engine_nativeSetSpatialWet(JNIEnv*, jobject, jint percent) {
    if (g_busMixer) g_busMixer->setWet(percent);
}

extern "C" JNIEXPORT jint JNICALL
Java_com_bitti06_modplayjs_engine_V8Engine_nativeMixSpatial(
        JNIEnv* env, jobject, jfloatArray stems, jint sources, jint frames) {
    if (!g_busMixer || !g_busFloat || frames <= 0 || frames > g_busFrames) return -1;

    auto* s = static_cast<jfloat*>(env->GetPrimitiveArrayCritical(stems, nullptr));
    if (!s) return -1;
    g_busMixer->mix(s, sources, frames, g_busFloat);
    env->ReleasePrimitiveArrayCritical(stems, s, JNI_ABORT);

    for (int b = 0; b < g_busCount; ++b) {
        SpatialBusMixer::toPcm16(g_busFloat + size_t(b) * size_t(frames), g_busPcm[b], frames,
                                 0.5f);
    }
    if (g_reverbPcm) {
        g_busMixer->renderReverb(g_busFloat, frames, g_reverbFloat);
        SpatialBusMixer::toPcm16(g_reverbFloat, g_reverbPcm, frames * 4, 0.8f);
    }
    return 0;
}

extern "C" JNIEXPORT void JNICALL
Java_com_bitti06_modplayjs_engine_V8Engine_nativeStopSpatialBuses(JNIEnv*, jobject) {
    std::lock_guard<std::mutex> lock(g_busMutex);
    delete g_busMixer;
    delete[] g_busFloat;
    delete[] g_reverbFloat;
    g_busMixer = nullptr;
    g_busFloat = nullptr;
    g_reverbFloat = nullptr;
    g_reverbPcm = nullptr;
    for (auto& p : g_busPcm) p = nullptr;
    g_busCount = 0;
    g_busFrames = 0;
}
