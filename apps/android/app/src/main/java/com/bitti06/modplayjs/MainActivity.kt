package com.bitti06.modplayjs

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import com.bitti06.modplayjs.ui.App
import com.bitti06.modplayjs.ui.AppViewModel
import com.bitti06.modplayjs.ui.ModplayTheme

class MainActivity : ComponentActivity() {
    private val vm: AppViewModel by viewModels { AppViewModel.factory(applicationContext) }

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        setContent { ModplayTheme { App(vm) } }
    }
}
