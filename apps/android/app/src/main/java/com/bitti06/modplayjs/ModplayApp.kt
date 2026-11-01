package com.bitti06.modplayjs

import android.app.Application

class ModplayApp : Application() {
    override fun onCreate() {
        super.onCreate()
        AppGraph.init(this)
    }
}
