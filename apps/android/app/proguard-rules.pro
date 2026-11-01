# R8 rules for the release build. The debug build is not minified, so anything
# that is only reached reflectively breaks here first.

# The engine bridge: the JNI side looks these up by name and calls the native
# methods, which R8 must neither rename nor remove.
-keep class com.bitti06.modplayjs.engine.V8Engine { *; }
-keepclasseswithmembernames class * { native <methods>; }

# Navigation 3 saves its back stack as class names and resolves each key's
# serializer reflectively (Navigation3's NavKeySerializer calls
# Class.forName(name).kotlin.serializer()), which R8 cannot see. Keeping the
# keys, their companions and the generated serializers intact is what makes a
# back stack survive process death in a release build.
-keep class com.bitti06.modplayjs.ui.**Key { *; }
-keep class com.bitti06.modplayjs.ui.**Key$Companion { *; }
-keep class com.bitti06.modplayjs.ui.**Key$$serializer { *; }
