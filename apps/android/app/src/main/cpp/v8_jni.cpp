#include <jni.h>
#include <android/log.h>
#include <mutex>
#include <memory>
#include <string>
#include <vector>
#include <cstring>
#include "v8.h"
#include "libplatform/libplatform.h"

#define LOG_TAG "modplay-v8"
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, LOG_TAG, __VA_ARGS__)
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO, LOG_TAG, __VA_ARGS__)

namespace {
std::once_flag g_init;
std::unique_ptr<v8::Platform> g_platform;
std::unique_ptr<v8::ArrayBuffer::Allocator> g_allocator;

struct Engine {
    v8::Isolate* isolate = nullptr;
    v8::Global<v8::Context> context;
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
    v8::Local<v8::String> key = v8::String::NewFromUtf8(e->isolate, name).ToLocalChecked();
    v8::Local<v8::Value> api;
    if (!get_global(e)->ToObject(ctx).ToLocal(&api)) return {};
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
Java_com_bitti06_modplayjs_engine_V8Engine_nativeCreate(JNIEnv* env, jobject, jstring script, jstring) {
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
    const char* src = env->GetStringUTFChars(script, nullptr);
    v8::Local<v8::String> source = v8::String::NewFromUtf8(e->isolate, src).ToLocalChecked();
    env->ReleaseStringUTFChars(script, src);
    v8::TryCatch try_catch(e->isolate);
    v8::Local<v8::Script> compiled;
    if (!v8::Script::Compile(context, source).ToLocal(&compiled)) {
        LOGE("engine compile failed: %s", to_string(e, try_catch.Exception()).c_str());
        e->context.Reset();
        e->isolate->Dispose();
        delete e;
        return 0;
    }
    v8::Local<v8::Value> result;
    if (!compiled->Run(context).ToLocal(&result)) {
        LOGE("engine run failed: %s", to_string(e, try_catch.Exception()).c_str());
        e->context.Reset();
        e->isolate->Dispose();
        delete e;
        return 0;
    }
    return reinterpret_cast<jlong>(e);
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
    std::vector<uint8_t> data(static_cast<size_t>(len));
    env->GetByteArrayRegion(bytes, 0, len, reinterpret_cast<jbyte*>(data.data()));
    v8::Local<v8::ArrayBuffer> ab = v8::ArrayBuffer::New(e->isolate, data.size());
    memcpy(ab->GetBackingStore()->Data(), data.data(), data.size());
    v8::Local<v8::Uint8Array> u8 = v8::Uint8Array::New(ab, 0, data.size());
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
    env->ReleaseStringUTFChars(json, c);
    if (try_catch.HasCaught()) {
        LOGE("command: %s", to_string(e, try_catch.Exception()).c_str());
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
    std::vector<float> buf(base, base + len);
    jfloatArray out = env->NewFloatArray(static_cast<jsize>(len));
    if (out) env->SetFloatArrayRegion(out, 0, static_cast<jsize>(len), buf.data());
    return out;
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
    e->isolate->Dispose();
    delete e;
}
