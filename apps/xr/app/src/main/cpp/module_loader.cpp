// SPDX-License-Identifier: BSD-3-Clause
#include "module_loader.h"

#include <android/log.h>

#include <fstream>
#include <sstream>
#include <vector>

#define LOGI(...) __android_log_print(ANDROID_LOG_INFO, "modplay-v8", __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, "modplay-v8", __VA_ARGS__)

thread_local ModuleLoader* g_module_loader = nullptr;

namespace {

/**
 * Asset path for a bare specifier.
 *
 * `@modplayjs/fmt-xm` -> `modules/modplayjs-fmt-xm/index.js`.
 *
 * The '@' is dropped on purpose: the directory names in the APK are flattened
 * by the build script, so the path never travels through Gradle's asset merge
 * and aapt2 carrying a character with special meaning in resource references.
 */
std::string assetPathFor(const std::string& specifier) {
    constexpr const char* kPrefix = "@modplayjs/";
    if (specifier.rfind(kPrefix, 0) == 0) {
        return "modules/modplayjs-" + specifier.substr(11) + "/index.js";
    }
    return specifier;
}

/** Resolve "./x" or "../x" against the importing module's asset path. */
std::string resolveRelative(const std::string& fromPath, const std::string& relative) {
    std::string base = fromPath;
    const auto slash = base.find_last_of('/');
    base = (slash == std::string::npos) ? std::string() : base.substr(0, slash);

    std::string rest = relative;
    while (true) {
        if (rest.rfind("./", 0) == 0) {
            rest = rest.substr(2);
        } else if (rest.rfind("../", 0) == 0) {
            rest = rest.substr(3);
            const auto cut = base.find_last_of('/');
            base = (cut == std::string::npos) ? std::string() : base.substr(0, cut);
        } else {
            break;
        }
    }
    if (base.empty()) return rest;
    return base + "/" + rest;
}

bool isRelative(const std::string& specifier) {
    return specifier.rfind("./", 0) == 0 || specifier.rfind("../", 0) == 0;
}

} // namespace

bool ModuleLoader::readModule(const std::string& path, std::string* out) {
    auto cached = sources_.find(path);
    if (cached != sources_.end()) {
        *out = cached->second;
        return true;
    }
    if (readOverlay(path, out) || readAsset(path, out)) {
        sources_[path] = *out;
        return true;
    }
    LOGE("module not found in overlay or assets: %s", path.c_str());
    return false;
}

bool ModuleLoader::readOverlay(const std::string& path, std::string* out) {
    if (overlayRoot_.empty()) return false;
    const std::string full = overlayRoot_ + "/" + path;
    std::ifstream file(full, std::ios::binary);
    if (!file) return false;
    std::ostringstream buffer;
    buffer << file.rdbuf();
    *out = buffer.str();
    if (out->empty()) {
        LOGE("overlay module empty: %s", full.c_str());
        return false;
    }
    return true;
}

bool ModuleLoader::readAsset(const std::string& path, std::string* out) {
    if (!assets_) return false;

    AAsset* asset = AAssetManager_open(assets_, path.c_str(), AASSET_MODE_BUFFER);
    if (!asset) {
        LOGE("module asset missing: %s", path.c_str());
        return false;
    }
    const off64_t length = AAsset_getLength64(asset);
    out->resize(size_t(length));
    const int read = AAsset_read(asset, out->data(), size_t(length));
    AAsset_close(asset);
    if (read != int(length)) {
        LOGE("module asset short read: %s (%d of %lld)", path.c_str(), read,
             static_cast<long long>(length));
        return false;
    }
    return true;
}

v8::MaybeLocal<v8::Module> ModuleLoader::loadPath(const std::string& path) {
    auto cached = modules_.find(path);
    if (cached != modules_.end()) return cached->second.Get(isolate_);

    std::string source;
    if (!readModule(path, &source)) return {};

    // Escapable, because the returned module handle has to outlive this call.
    v8::EscapableHandleScope scope(isolate_);

    v8::Local<v8::String> name =
        v8::String::NewFromUtf8(isolate_, path.c_str()).ToLocalChecked();
    v8::Local<v8::String> body =
        v8::String::NewFromUtf8(isolate_, source.data(), v8::NewStringType::kNormal,
                                int(source.size()))
            .ToLocalChecked();
    // is_module = true: the origin has to carry the flag, otherwise V8
    // compiles the source as a classic script and every `import` is a syntax
    // error at the first line of the file.
    v8::ScriptOrigin origin(name, 0, 0, false, -1, v8::Local<v8::Value>(), false, false,
                            true);
    v8::ScriptCompiler::Source compiled(body, origin);

    v8::Local<v8::Module> module;
    v8::TryCatch tryCatch(isolate_);
    if (!v8::ScriptCompiler::CompileModule(isolate_, &compiled).ToLocal(&module)) {
        LOGE("module compile failed: %s", path.c_str());
        if (tryCatch.HasCaught()) {
            v8::String::Utf8Value message(isolate_, tryCatch.Exception());
            LOGE("  %s", *message ? *message : "(no message)");
        }
        return {};
    }

    modules_.emplace(path, v8::Global<v8::Module>(isolate_, module));
    LOGI("module compiled: %s (%zu bytes)", path.c_str(), source.size());
    return scope.Escape(module);
}

v8::MaybeLocal<v8::Module> ModuleLoader::resolve(v8::Local<v8::Context> context,
                                                 v8::Local<v8::String> specifier,
                                                 v8::Local<v8::Module> referrer) {
    v8::String::Utf8Value raw(isolate_, specifier);
    if (!*raw) return {};
    std::string request(*raw);

    if (isRelative(request)) {
        v8::String::Utf8Value from(isolate_, referrer->GetResourceName());
        if (!*from) return {};
        return loadPath(resolveRelative(*from, request));
    }
    return loadPath(assetPathFor(request));
}

bool ModuleLoader::run(v8::Local<v8::Context> context, const std::string& assetPath) {
    if (!assets_) {
        LOGE("module loader has no asset manager");
        return false;
    }

    v8::HandleScope handleScope(isolate_);
    v8::Context::Scope contextScope(context);

    // The resolve callback has no user data, so the instance is published on
    // the thread for the duration of the instantiation.
    g_module_loader = this;

    v8::Local<v8::Module> module;
    if (!loadPath(assetPath).ToLocal(&module)) {
        g_module_loader = nullptr;
        return false;
    }

    // Already evaluated: installing the same format twice must not re-run the
    // module body. Checked before instantiation, because InstantiateModule on
    // an evaluated module is not a no-op.
    if (module->GetStatus() == v8::Module::kEvaluated) {
        g_module_loader = nullptr;
        return true;
    }

    v8::TryCatch tryCatch(isolate_);
    const bool instantiated =
        module->InstantiateModule(context, [](v8::Local<v8::Context> ctx,
                                              v8::Local<v8::String> request,
                                              v8::Local<v8::FixedArray>,
                                              v8::Local<v8::Module> from) {
            return g_module_loader ? g_module_loader->resolve(ctx, request, from)
                                   : v8::MaybeLocal<v8::Module>();
        }).FromMaybe(false);
    if (!instantiated) {
        LOGE("module instantiate failed: %s", assetPath.c_str());
        if (tryCatch.HasCaught()) {
            v8::String::Utf8Value message(isolate_, tryCatch.Exception());
            LOGE("  %s", *message ? *message : "(no message)");
        }
        g_module_loader = nullptr;
        return false;
    }

    if (module->Evaluate(context).IsEmpty()) {
        LOGE("module evaluate failed: %s", assetPath.c_str());
        if (tryCatch.HasCaught()) {
            v8::String::Utf8Value message(isolate_, tryCatch.Exception());
            LOGE("  %s", *message ? *message : "(no message)");
        }
        g_module_loader = nullptr;
        return false;
    }

    // Our modules have no top-level await. If one ever gets it, the evaluation
    // promise would still be pending here and the caller would see a half
    // initialised graph without an error - so say it out loud instead.
    if (module->IsGraphAsync()) {
        LOGE("module graph uses top-level await, unsupported: %s", assetPath.c_str());
        g_module_loader = nullptr;
        return false;
    }

    g_module_loader = nullptr;
    return true;
}
