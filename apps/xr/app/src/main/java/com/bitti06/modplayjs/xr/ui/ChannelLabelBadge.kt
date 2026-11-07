package com.bitti06.modplayjs.xr.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

fun channelColorArgb(index: Int): Int {
    val hue = (index * 137.5f) % 360f
    return android.graphics.Color.HSVToColor(floatArrayOf(hue, 0.75f, 0.95f))
}

@Composable
fun ChannelLabelBadge(channelIndex: Int) {
    val colorArgb = channelColorArgb(channelIndex)
    val themeColor = Color(colorArgb)
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                color = Color(0xEE111827),
                shape = RoundedCornerShape(12.dp)
            )
            .border(
                width = 2.dp,
                color = themeColor,
                shape = RoundedCornerShape(12.dp)
            ),
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = "CH ${channelIndex + 1}",
            color = Color.White,
            fontSize = 14.sp,
            fontWeight = FontWeight.Bold,
            fontFamily = FontFamily.Monospace,
            maxLines = 1,
        )
    }
}
