# Release builds currently run without shrinking (see app/build.gradle.kts), so
# this file mainly documents what must survive if minification is ever enabled.
#
# The V8 bridge is called from C++ through JNI method names, which R8 cannot see.
-keep class com.bitti06.modplayjs.engine.** { *; }
-keepclasseswithmembernames class * {
    native <methods>;
}

# Spatial SDK loads components and features reflectively (component schemas,
# SpatialFeature registration, panel registration by resource id).
-keep class com.meta.spatial.** { *; }
-keep class com.bitti06.modplayjs.xr.** { *; }

# kotlinx.serialization writes the settings JSON through generated serializers.
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.**
-keepclassmembers class kotlinx.serialization.json.** {
    *** Companion;
}
-keepclasseswithmembers class kotlinx.serialization.json.** {
    kotlinx.serialization.KSerializer serializer(...);
}
-keep,includedescriptorclasses class com.bitti06.modplayjs.**$$serializer { *; }
-keepclassmembers class com.bitti06.modplayjs.** {
    *** Companion;
}
