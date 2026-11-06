// SPDX-License-Identifier: BSD-3-Clause
//
// ES module loader for the modular asset tree.
//
// The engine ships as one ES module per monorepo package under
// assets/modules, and this loader is what makes the `import` statements work
// at runtime. It reads the source from the Android asset manager, compiles it
// with V8 and keeps the compiled module so a second import costs a map lookup.
//
// Two constraints shape the design:
//
//   - V8's ResolveModuleCallback is a plain function pointer with no user data
//     (v8-script.h: `using ResolveModuleCallback = MaybeLocal<Module> (*)(...)`),
//     so the loader instance is reached through a thread_local. That is correct
//     here and only here: an isolate belongs to exactly one thread, and the
//     engine's isolate lives on "modplay-xr-audio".
//   - Nothing here may block for long on the audio thread. The asset reads
//     happen on first import of a package, which is why the caller installs
//     formats before playback starts.

#pragma once

#include <android/asset_manager.h>

#include <string>
#include <unordered_map>

#include "v8.h"

class ModuleLoader {
public:
    /**
     * [overlayRoot] is an app-private directory that is searched before the
     * APK assets. Engine updates land there, so a published catalog can replace
     * a single format - or the whole engine - without shipping a new APK.
     * Empty disables the overlay and only the bundled assets are used.
     */
    ModuleLoader(v8::Isolate* isolate, AAssetManager* assets, std::string overlayRoot = {})
        : isolate_(isolate), assets_(assets), overlayRoot_(std::move(overlayRoot)) {}

    /** True once at least one source can be read. */
    bool ready() const { return assets_ != nullptr || !overlayRoot_.empty(); }

    const std::string& overlayRoot() const { return overlayRoot_; }

    /**
     * Compile, instantiate and evaluate the module graph rooted at an asset
     * path, e.g. "modules/engine-core/index.js".
     *
     * Idempotent: a module that is already compiled is reused, and an already
     * evaluated one is not evaluated twice.
     */
    bool run(v8::Local<v8::Context> context, const std::string& assetPath);

    /** Number of compiled modules, for the diagnostics log. */
    size_t moduleCount() const { return modules_.size(); }

private:
    /** Resolve one import request. Called by V8 during instantiation. */
    v8::MaybeLocal<v8::Module> resolve(v8::Local<v8::Context> context,
                                      v8::Local<v8::String> specifier,
                                      v8::Local<v8::Module> referrer);

    /** Compile (or return the cached) module for an asset path. */
    v8::MaybeLocal<v8::Module> loadPath(const std::string& path);

    /**
     * Read a module into memory: overlay first, then APK assets.
     *
     * The overlay wins per file, not per tree, so a catalog that updates only
     * `fmt-mo3` leaves every other package on the version inside the APK.
     */
    bool readModule(const std::string& path, std::string* out);

    bool readOverlay(const std::string& path, std::string* out);
    bool readAsset(const std::string& path, std::string* out);

    v8::Isolate* isolate_;
    AAssetManager* assets_;
    std::string overlayRoot_;

    /**
     * Compiled modules by asset path. Holds a Global, so the module stays alive
     * for the isolate's lifetime; the map is the module cache.
     */
    std::unordered_map<std::string, v8::Global<v8::Module>> modules_;

    /** Source text by asset path, so a recompile never touches the disk again. */
    std::unordered_map<std::string, std::string> sources_;
};

/** The loader for the current thread; set for the duration of run(). */
extern thread_local ModuleLoader* g_module_loader;
