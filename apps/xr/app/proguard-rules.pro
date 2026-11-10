# R8 runs on release builds (app/build.gradle.kts): the dex drops from ~26 MB to
# ~4 MB. These are the members it cannot see are used.
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

# Meta Spatial SDK references the Parcelize annotation at compile time only;
# the class is not on the app's classpath.
-dontwarn kotlinx.parcelize.**
