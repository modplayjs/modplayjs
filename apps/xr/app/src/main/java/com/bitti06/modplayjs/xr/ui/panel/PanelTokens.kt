package com.bitti06.modplayjs.xr.ui.panel

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * The panel design, in one place.
 *
 * Panels are read at 1.7 to 2.5 m through a headset, so the surfaces are
 * opaque and lifted off the night sky instead of tinted into it, and no text is
 * smaller than 11 sp (about 22 mm on a 500 dp/m panel). Every panel and every
 * control takes its values from here; a panel that invents a size is a bug.
 */
object PanelTokens {

    // Surfaces: flat, opaque, clearly above the skybox.
    val Surface = Color(0xFF1B1733)
    val SurfaceRaised = Color(0xFF272148)
    val SurfaceSunken = Color(0xFF141027)
    val Outline = Color(0xFF4C4478)

    // Text.
    val Text = Color(0xFFF3EFFF)
    val TextDim = Color(0xFFBDB5D9)
    val TextFaint = Color(0xFF8F87AC)

    // Accents, same family as the phone app.
    val Accent = Color(0xFFB49BFF)
    val AccentAlt = Color(0xFF5FE3C0)
    val AccentWarm = Color(0xFFFF9BC2)
    val OnAccent = Color(0xFF1B0F3A)
    val Highlight = Color(0xFF3B2C6E)
    val Error = Color(0xFFFF7A86)

    // Type scale. Nothing below Meta.
    val Title = 20.sp
    val Heading = 14.sp
    val Body = 13.sp
    val ChipText = 12.sp
    val Meta = 11.sp
    val Mono = 11.sp
    val Stat = 18.sp

    // Spacing.
    val GapXs = 3.dp
    val GapSm = 6.dp
    val Gap = 10.dp
    val GapLg = 14.dp

    val Radius = 8.dp
    val RadiusSmall = 5.dp
}
