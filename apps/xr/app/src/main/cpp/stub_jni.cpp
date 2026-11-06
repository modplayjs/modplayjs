// SPDX-License-Identifier: BSD-3-Clause
// Linked when the V8 prebuilt is missing (MODPLAY_V8=OFF). The Kotlin side
// treats a zero handle as "engine unavailable" and never calls the other
// entry points, but they still have to exist so the library links and a
// missing prebuilt produces a running app with a clear message instead of a
// CMake configure error.
#include <jni.h>
#include <string>

extern "C" JNIEXPORT jlong JNICALL
Java_com_bitti06_modplayjs_engine_V8Engine_nativeCreate(JNIEnv*, jobject, jstring, jobject, jstring) { return 0; }
extern "C" JNIEXPORT void JNICALL
Java_com_bitti06_modplayjs_engine_V8Engine_nativeLoad(JNIEnv*, jobject, jlong, jbyteArray, jstring) {}
extern "C" JNIEXPORT jstring JNICALL
Java_com_bitti06_modplayjs_engine_V8Engine_nativeCommand(JNIEnv* env, jobject, jlong, jstring) {
    return env->NewStringUTF("{\"error\":\"v8-stub\"}");
}
extern "C" JNIEXPORT jfloatArray JNICALL
Java_com_bitti06_modplayjs_engine_V8Engine_nativeRender(JNIEnv* env, jobject, jlong, jint) {
    return env->NewFloatArray(0);
}
extern "C" JNIEXPORT jfloatArray JNICALL
Java_com_bitti06_modplayjs_engine_V8Engine_nativeRenderSpatial(JNIEnv* env, jobject, jlong, jint) {
    return env->NewFloatArray(0);
}
extern "C" JNIEXPORT jstring JNICALL
Java_com_bitti06_modplayjs_engine_V8Engine_nativeSnapshot(JNIEnv* env, jobject, jlong) {
    return env->NewStringUTF("{\"error\":\"v8-stub\"}");
}
extern "C" JNIEXPORT void JNICALL
Java_com_bitti06_modplayjs_engine_V8Engine_nativeDestroy(JNIEnv*, jobject, jlong) {}
extern "C" JNIEXPORT jboolean JNICALL
Java_com_bitti06_modplayjs_engine_V8Engine_nativeInstallFormat(JNIEnv*, jobject, jlong, jstring) {
    return JNI_FALSE;
}
