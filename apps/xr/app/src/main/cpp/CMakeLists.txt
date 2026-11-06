cmake_minimum_required(VERSION 3.22.1)
project(modplay_v8 CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

find_package(oboe REQUIRED CONFIG)

if(MODPLAY_V8)
    add_library(modplay_v8 SHARED v8_jni.cpp)
    target_compile_definitions(modplay_v8 PRIVATE MODPLAY_V8=1 V8_COMPRESS_POINTERS=1)
    target_include_directories(modplay_v8 PRIVATE ${V8_INCLUDE})
    target_link_libraries(modplay_v8 PRIVATE ${V8_LIB} oboe::oboe android log z)
else()
    add_library(modplay_v8 SHARED stub_jni.cpp)
    target_link_libraries(modplay_v8 PRIVATE oboe::oboe android log)
endif()

target_link_options(modplay_v8 PRIVATE "-Wl,-z,max-page-size=16384")
