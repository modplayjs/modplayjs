/*
 * Copyright 2025 The Android Open Source Project
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * Icon path data copied from androidx.compose.material:material-icons-core and
 * material-icons-extended 1.7.8, whose Compose artifacts are frozen and no
 * longer recommended (Material Symbols replaced them). Only the icons this app
 * actually draws are kept, so the app carries no icon library dependency.
 */

package com.bitti06.modplayjs.ui.icons

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathFillType
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.vector.DefaultFillType
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.PathBuilder
import androidx.compose.ui.graphics.vector.path
import androidx.compose.ui.unit.dp

// All Material icons are 24dp with a 24x24 viewport.
private const val IconDimension = 24f

private inline fun materialIcon(
    name: String,
    autoMirror: Boolean = false,
    block: ImageVector.Builder.() -> ImageVector.Builder,
): ImageVector =
    ImageVector
        .Builder(
            name = name,
            defaultWidth = IconDimension.dp,
            defaultHeight = IconDimension.dp,
            viewportWidth = IconDimension,
            viewportHeight = IconDimension,
            autoMirror = autoMirror,
        ).block()
        .build()

private inline fun ImageVector.Builder.materialPath(
    fillAlpha: Float = 1f,
    strokeAlpha: Float = 1f,
    pathFillType: PathFillType = DefaultFillType,
    pathBuilder: PathBuilder.() -> Unit,
): ImageVector.Builder =
    path(
        fill = SolidColor(Color.Black),
        fillAlpha = fillAlpha,
        stroke = null,
        strokeAlpha = strokeAlpha,
        strokeLineWidth = 1f,
        strokeLineCap = StrokeCap.Butt,
        strokeLineJoin = StrokeJoin.Bevel,
        strokeLineMiter = 1f,
        pathFillType = pathFillType,
        pathBuilder = pathBuilder,
    )

/** The Material filled icons this app draws. */
object AppIcons {

    val Add: ImageVector
        get() {
            if (_add != null) {
                return _add!!
            }
            _add = materialIcon(name = "Filled.Add") {
                materialPath {
                    moveTo(19.0f, 13.0f)
                    horizontalLineToRelative(-6.0f)
                    verticalLineToRelative(6.0f)
                    horizontalLineToRelative(-2.0f)
                    verticalLineToRelative(-6.0f)
                    horizontalLineTo(5.0f)
                    verticalLineToRelative(-2.0f)
                    horizontalLineToRelative(6.0f)
                    verticalLineTo(5.0f)
                    horizontalLineToRelative(2.0f)
                    verticalLineToRelative(6.0f)
                    horizontalLineToRelative(6.0f)
                    verticalLineToRelative(2.0f)
                    close()
                }
            }
            return _add!!
        }

    private var _add: ImageVector? = null

    val ArrowBack: ImageVector
        get() {
            if (_arrowBack != null) {
                return _arrowBack!!
            }
            _arrowBack = materialIcon(name = "AutoMirrored.Filled.ArrowBack", autoMirror = true) {
                materialPath {
                    moveTo(20.0f, 11.0f)
                    horizontalLineTo(7.83f)
                    lineToRelative(5.59f, -5.59f)
                    lineTo(12.0f, 4.0f)
                    lineToRelative(-8.0f, 8.0f)
                    lineToRelative(8.0f, 8.0f)
                    lineToRelative(1.41f, -1.41f)
                    lineTo(7.83f, 13.0f)
                    horizontalLineTo(20.0f)
                    verticalLineToRelative(-2.0f)
                    close()
                }
            }
            return _arrowBack!!
        }

    private var _arrowBack: ImageVector? = null

    val ChevronRight: ImageVector
        get() {
            if (_chevronRight != null) {
                return _chevronRight!!
            }
            _chevronRight = materialIcon(name = "Filled.ChevronRight") {
                materialPath {
                    moveTo(10.0f, 6.0f)
                    lineTo(8.59f, 7.41f)
                    lineTo(13.17f, 12.0f)
                    lineToRelative(-4.58f, 4.59f)
                    lineTo(10.0f, 18.0f)
                    lineToRelative(6.0f, -6.0f)
                    close()
                }
            }
            return _chevronRight!!
        }

    private var _chevronRight: ImageVector? = null

    val Close: ImageVector
        get() {
            if (_close != null) {
                return _close!!
            }
            _close = materialIcon(name = "Filled.Close") {
                materialPath {
                    moveTo(19.0f, 6.41f)
                    lineTo(17.59f, 5.0f)
                    lineTo(12.0f, 10.59f)
                    lineTo(6.41f, 5.0f)
                    lineTo(5.0f, 6.41f)
                    lineTo(10.59f, 12.0f)
                    lineTo(5.0f, 17.59f)
                    lineTo(6.41f, 19.0f)
                    lineTo(12.0f, 13.41f)
                    lineTo(17.59f, 19.0f)
                    lineTo(19.0f, 17.59f)
                    lineTo(13.41f, 12.0f)
                    close()
                }
            }
            return _close!!
        }

    private var _close: ImageVector? = null

    val CreateNewFolder: ImageVector
        get() {
            if (_createNewFolder != null) {
                return _createNewFolder!!
            }
            _createNewFolder = materialIcon(name = "Filled.CreateNewFolder") {
                materialPath {
                    moveTo(20.0f, 6.0f)
                    horizontalLineToRelative(-8.0f)
                    lineToRelative(-2.0f, -2.0f)
                    lineTo(4.0f, 4.0f)
                    curveToRelative(-1.11f, 0.0f, -1.99f, 0.89f, -1.99f, 2.0f)
                    lineTo(2.0f, 18.0f)
                    curveToRelative(0.0f, 1.11f, 0.89f, 2.0f, 2.0f, 2.0f)
                    horizontalLineToRelative(16.0f)
                    curveToRelative(1.11f, 0.0f, 2.0f, -0.89f, 2.0f, -2.0f)
                    lineTo(22.0f, 8.0f)
                    curveToRelative(0.0f, -1.11f, -0.89f, -2.0f, -2.0f, -2.0f)
                    close()
                    moveTo(19.0f, 14.0f)
                    horizontalLineToRelative(-3.0f)
                    verticalLineToRelative(3.0f)
                    horizontalLineToRelative(-2.0f)
                    verticalLineToRelative(-3.0f)
                    horizontalLineToRelative(-3.0f)
                    verticalLineToRelative(-2.0f)
                    horizontalLineToRelative(3.0f)
                    lineTo(14.0f, 9.0f)
                    horizontalLineToRelative(2.0f)
                    verticalLineToRelative(3.0f)
                    horizontalLineToRelative(3.0f)
                    verticalLineToRelative(2.0f)
                    close()
                }
            }
            return _createNewFolder!!
        }

    private var _createNewFolder: ImageVector? = null

    val Delete: ImageVector
        get() {
            if (_delete != null) {
                return _delete!!
            }
            _delete = materialIcon(name = "Filled.Delete") {
                materialPath {
                    moveTo(6.0f, 19.0f)
                    curveToRelative(0.0f, 1.1f, 0.9f, 2.0f, 2.0f, 2.0f)
                    horizontalLineToRelative(8.0f)
                    curveToRelative(1.1f, 0.0f, 2.0f, -0.9f, 2.0f, -2.0f)
                    verticalLineTo(7.0f)
                    horizontalLineTo(6.0f)
                    verticalLineToRelative(12.0f)
                    close()
                    moveTo(19.0f, 4.0f)
                    horizontalLineToRelative(-3.5f)
                    lineToRelative(-1.0f, -1.0f)
                    horizontalLineToRelative(-5.0f)
                    lineToRelative(-1.0f, 1.0f)
                    horizontalLineTo(5.0f)
                    verticalLineToRelative(2.0f)
                    horizontalLineToRelative(14.0f)
                    verticalLineTo(4.0f)
                    close()
                }
            }
            return _delete!!
        }

    private var _delete: ImageVector? = null

    val Equalizer: ImageVector
        get() {
            if (_equalizer != null) {
                return _equalizer!!
            }
            _equalizer = materialIcon(name = "Filled.Equalizer") {
                materialPath {
                    moveTo(10.0f, 20.0f)
                    horizontalLineToRelative(4.0f)
                    lineTo(14.0f, 4.0f)
                    horizontalLineToRelative(-4.0f)
                    verticalLineToRelative(16.0f)
                    close()
                    moveTo(4.0f, 20.0f)
                    horizontalLineToRelative(4.0f)
                    verticalLineToRelative(-8.0f)
                    lineTo(4.0f, 12.0f)
                    verticalLineToRelative(8.0f)
                    close()
                    moveTo(16.0f, 9.0f)
                    verticalLineToRelative(11.0f)
                    horizontalLineToRelative(4.0f)
                    lineTo(20.0f, 9.0f)
                    horizontalLineToRelative(-4.0f)
                    close()
                }
            }
            return _equalizer!!
        }

    private var _equalizer: ImageVector? = null

    val Favorite: ImageVector
        get() {
            if (_favorite != null) {
                return _favorite!!
            }
            _favorite = materialIcon(name = "Filled.Favorite") {
                materialPath {
                    moveTo(12.0f, 21.35f)
                    lineToRelative(-1.45f, -1.32f)
                    curveTo(5.4f, 15.36f, 2.0f, 12.28f, 2.0f, 8.5f)
                    curveTo(2.0f, 5.42f, 4.42f, 3.0f, 7.5f, 3.0f)
                    curveToRelative(1.74f, 0.0f, 3.41f, 0.81f, 4.5f, 2.09f)
                    curveTo(13.09f, 3.81f, 14.76f, 3.0f, 16.5f, 3.0f)
                    curveTo(19.58f, 3.0f, 22.0f, 5.42f, 22.0f, 8.5f)
                    curveToRelative(0.0f, 3.78f, -3.4f, 6.86f, -8.55f, 11.54f)
                    lineTo(12.0f, 21.35f)
                    close()
                }
            }
            return _favorite!!
        }

    private var _favorite: ImageVector? = null

    val FavoriteBorder: ImageVector
        get() {
            if (_favoriteBorder != null) {
                return _favoriteBorder!!
            }
            _favoriteBorder = materialIcon(name = "Filled.FavoriteBorder") {
                materialPath {
                    moveTo(16.5f, 3.0f)
                    curveToRelative(-1.74f, 0.0f, -3.41f, 0.81f, -4.5f, 2.09f)
                    curveTo(10.91f, 3.81f, 9.24f, 3.0f, 7.5f, 3.0f)
                    curveTo(4.42f, 3.0f, 2.0f, 5.42f, 2.0f, 8.5f)
                    curveToRelative(0.0f, 3.78f, 3.4f, 6.86f, 8.55f, 11.54f)
                    lineTo(12.0f, 21.35f)
                    lineToRelative(1.45f, -1.32f)
                    curveTo(18.6f, 15.36f, 22.0f, 12.28f, 22.0f, 8.5f)
                    curveTo(22.0f, 5.42f, 19.58f, 3.0f, 16.5f, 3.0f)
                    close()
                    moveTo(12.1f, 18.55f)
                    lineToRelative(-0.1f, 0.1f)
                    lineToRelative(-0.1f, -0.1f)
                    curveTo(7.14f, 14.24f, 4.0f, 11.39f, 4.0f, 8.5f)
                    curveTo(4.0f, 6.5f, 5.5f, 5.0f, 7.5f, 5.0f)
                    curveToRelative(1.54f, 0.0f, 3.04f, 0.99f, 3.57f, 2.36f)
                    horizontalLineToRelative(1.87f)
                    curveTo(13.46f, 5.99f, 14.96f, 5.0f, 16.5f, 5.0f)
                    curveToRelative(2.0f, 0.0f, 3.5f, 1.5f, 3.5f, 3.5f)
                    curveToRelative(0.0f, 2.89f, -3.14f, 5.74f, -7.9f, 10.05f)
                    close()
                }
            }
            return _favoriteBorder!!
        }

    private var _favoriteBorder: ImageVector? = null

    val FilterList: ImageVector
        get() {
            if (_filterList != null) {
                return _filterList!!
            }
            _filterList = materialIcon(name = "Filled.FilterList") {
                materialPath {
                    moveTo(10.0f, 18.0f)
                    horizontalLineToRelative(4.0f)
                    verticalLineToRelative(-2.0f)
                    horizontalLineToRelative(-4.0f)
                    verticalLineToRelative(2.0f)
                    close()
                    moveTo(3.0f, 6.0f)
                    verticalLineToRelative(2.0f)
                    horizontalLineToRelative(18.0f)
                    lineTo(21.0f, 6.0f)
                    lineTo(3.0f, 6.0f)
                    close()
                    moveTo(6.0f, 13.0f)
                    horizontalLineToRelative(12.0f)
                    verticalLineToRelative(-2.0f)
                    lineTo(6.0f, 11.0f)
                    verticalLineToRelative(2.0f)
                    close()
                }
            }
            return _filterList!!
        }

    private var _filterList: ImageVector? = null

    val Folder: ImageVector
        get() {
            if (_folder != null) {
                return _folder!!
            }
            _folder = materialIcon(name = "Filled.Folder") {
                materialPath {
                    moveTo(10.0f, 4.0f)
                    horizontalLineTo(4.0f)
                    curveToRelative(-1.1f, 0.0f, -1.99f, 0.9f, -1.99f, 2.0f)
                    lineTo(2.0f, 18.0f)
                    curveToRelative(0.0f, 1.1f, 0.9f, 2.0f, 2.0f, 2.0f)
                    horizontalLineToRelative(16.0f)
                    curveToRelative(1.1f, 0.0f, 2.0f, -0.9f, 2.0f, -2.0f)
                    verticalLineTo(8.0f)
                    curveToRelative(0.0f, -1.1f, -0.9f, -2.0f, -2.0f, -2.0f)
                    horizontalLineToRelative(-8.0f)
                    lineToRelative(-2.0f, -2.0f)
                    close()
                }
            }
            return _folder!!
        }

    private var _folder: ImageVector? = null

    val Home: ImageVector
        get() {
            if (_home != null) {
                return _home!!
            }
            _home = materialIcon(name = "Filled.Home") {
                materialPath {
                    moveTo(10.0f, 20.0f)
                    verticalLineToRelative(-6.0f)
                    horizontalLineToRelative(4.0f)
                    verticalLineToRelative(6.0f)
                    horizontalLineToRelative(5.0f)
                    verticalLineToRelative(-8.0f)
                    horizontalLineToRelative(3.0f)
                    lineTo(12.0f, 3.0f)
                    lineTo(2.0f, 12.0f)
                    horizontalLineToRelative(3.0f)
                    verticalLineToRelative(8.0f)
                    close()
                }
            }
            return _home!!
        }

    private var _home: ImageVector? = null

    val Info: ImageVector
        get() {
            if (_info != null) {
                return _info!!
            }
            _info = materialIcon(name = "Filled.Info") {
                materialPath {
                    moveTo(12.0f, 2.0f)
                    curveTo(6.48f, 2.0f, 2.0f, 6.48f, 2.0f, 12.0f)
                    reflectiveCurveToRelative(4.48f, 10.0f, 10.0f, 10.0f)
                    reflectiveCurveToRelative(10.0f, -4.48f, 10.0f, -10.0f)
                    reflectiveCurveTo(17.52f, 2.0f, 12.0f, 2.0f)
                    close()
                    moveTo(13.0f, 17.0f)
                    horizontalLineToRelative(-2.0f)
                    verticalLineToRelative(-6.0f)
                    horizontalLineToRelative(2.0f)
                    verticalLineToRelative(6.0f)
                    close()
                    moveTo(13.0f, 9.0f)
                    horizontalLineToRelative(-2.0f)
                    lineTo(11.0f, 7.0f)
                    horizontalLineToRelative(2.0f)
                    verticalLineToRelative(2.0f)
                    close()
                }
            }
            return _info!!
        }

    private var _info: ImageVector? = null

    val LibraryMusic: ImageVector
        get() {
            if (_libraryMusic != null) {
                return _libraryMusic!!
            }
            _libraryMusic = materialIcon(name = "Filled.LibraryMusic") {
                materialPath {
                    moveTo(20.0f, 2.0f)
                    lineTo(8.0f, 2.0f)
                    curveToRelative(-1.1f, 0.0f, -2.0f, 0.9f, -2.0f, 2.0f)
                    verticalLineToRelative(12.0f)
                    curveToRelative(0.0f, 1.1f, 0.9f, 2.0f, 2.0f, 2.0f)
                    horizontalLineToRelative(12.0f)
                    curveToRelative(1.1f, 0.0f, 2.0f, -0.9f, 2.0f, -2.0f)
                    lineTo(22.0f, 4.0f)
                    curveToRelative(0.0f, -1.1f, -0.9f, -2.0f, -2.0f, -2.0f)
                    close()
                    moveTo(18.0f, 7.0f)
                    horizontalLineToRelative(-3.0f)
                    verticalLineToRelative(5.5f)
                    curveToRelative(0.0f, 1.38f, -1.12f, 2.5f, -2.5f, 2.5f)
                    reflectiveCurveTo(10.0f, 13.88f, 10.0f, 12.5f)
                    reflectiveCurveToRelative(1.12f, -2.5f, 2.5f, -2.5f)
                    curveToRelative(0.57f, 0.0f, 1.08f, 0.19f, 1.5f, 0.51f)
                    lineTo(14.0f, 5.0f)
                    horizontalLineToRelative(4.0f)
                    verticalLineToRelative(2.0f)
                    close()
                    moveTo(4.0f, 6.0f)
                    lineTo(2.0f, 6.0f)
                    verticalLineToRelative(14.0f)
                    curveToRelative(0.0f, 1.1f, 0.9f, 2.0f, 2.0f, 2.0f)
                    horizontalLineToRelative(14.0f)
                    verticalLineToRelative(-2.0f)
                    lineTo(4.0f, 20.0f)
                    lineTo(4.0f, 6.0f)
                    close()
                }
            }
            return _libraryMusic!!
        }

    private var _libraryMusic: ImageVector? = null

    val MoreVert: ImageVector
        get() {
            if (_moreVert != null) {
                return _moreVert!!
            }
            _moreVert = materialIcon(name = "Filled.MoreVert") {
                materialPath {
                    moveTo(12.0f, 8.0f)
                    curveToRelative(1.1f, 0.0f, 2.0f, -0.9f, 2.0f, -2.0f)
                    reflectiveCurveToRelative(-0.9f, -2.0f, -2.0f, -2.0f)
                    reflectiveCurveToRelative(-2.0f, 0.9f, -2.0f, 2.0f)
                    reflectiveCurveToRelative(0.9f, 2.0f, 2.0f, 2.0f)
                    close()
                    moveTo(12.0f, 10.0f)
                    curveToRelative(-1.1f, 0.0f, -2.0f, 0.9f, -2.0f, 2.0f)
                    reflectiveCurveToRelative(0.9f, 2.0f, 2.0f, 2.0f)
                    reflectiveCurveToRelative(2.0f, -0.9f, 2.0f, -2.0f)
                    reflectiveCurveToRelative(-0.9f, -2.0f, -2.0f, -2.0f)
                    close()
                    moveTo(12.0f, 16.0f)
                    curveToRelative(-1.1f, 0.0f, -2.0f, 0.9f, -2.0f, 2.0f)
                    reflectiveCurveToRelative(0.9f, 2.0f, 2.0f, 2.0f)
                    reflectiveCurveToRelative(2.0f, -0.9f, 2.0f, -2.0f)
                    reflectiveCurveToRelative(-0.9f, -2.0f, -2.0f, -2.0f)
                    close()
                }
            }
            return _moreVert!!
        }

    private var _moreVert: ImageVector? = null

    val MusicNote: ImageVector
        get() {
            if (_musicNote != null) {
                return _musicNote!!
            }
            _musicNote = materialIcon(name = "Filled.MusicNote") {
                materialPath {
                    moveTo(12.0f, 3.0f)
                    verticalLineToRelative(10.55f)
                    curveToRelative(-0.59f, -0.34f, -1.27f, -0.55f, -2.0f, -0.55f)
                    curveToRelative(-2.21f, 0.0f, -4.0f, 1.79f, -4.0f, 4.0f)
                    reflectiveCurveToRelative(1.79f, 4.0f, 4.0f, 4.0f)
                    reflectiveCurveToRelative(4.0f, -1.79f, 4.0f, -4.0f)
                    verticalLineTo(7.0f)
                    horizontalLineToRelative(4.0f)
                    verticalLineTo(3.0f)
                    horizontalLineToRelative(-6.0f)
                    close()
                }
            }
            return _musicNote!!
        }

    private var _musicNote: ImageVector? = null

    val Pause: ImageVector
        get() {
            if (_pause != null) {
                return _pause!!
            }
            _pause = materialIcon(name = "Filled.Pause") {
                materialPath {
                    moveTo(6.0f, 19.0f)
                    horizontalLineToRelative(4.0f)
                    lineTo(10.0f, 5.0f)
                    lineTo(6.0f, 5.0f)
                    verticalLineToRelative(14.0f)
                    close()
                    moveTo(14.0f, 5.0f)
                    verticalLineToRelative(14.0f)
                    horizontalLineToRelative(4.0f)
                    lineTo(18.0f, 5.0f)
                    horizontalLineToRelative(-4.0f)
                    close()
                }
            }
            return _pause!!
        }

    private var _pause: ImageVector? = null

    val PlayArrow: ImageVector
        get() {
            if (_playArrow != null) {
                return _playArrow!!
            }
            _playArrow = materialIcon(name = "Filled.PlayArrow") {
                materialPath {
                    moveTo(8.0f, 5.0f)
                    verticalLineToRelative(14.0f)
                    lineToRelative(11.0f, -7.0f)
                    close()
                }
            }
            return _playArrow!!
        }

    private var _playArrow: ImageVector? = null

    val PlaylistPlay: ImageVector
        get() {
            if (_playlistPlay != null) {
                return _playlistPlay!!
            }
            _playlistPlay = materialIcon(name = "AutoMirrored.Filled.PlaylistPlay", autoMirror = true) {
                materialPath {
                    moveTo(3.0f, 10.0f)
                    horizontalLineToRelative(11.0f)
                    verticalLineToRelative(2.0f)
                    horizontalLineToRelative(-11.0f)
                    close()
                }
                materialPath {
                    moveTo(3.0f, 6.0f)
                    horizontalLineToRelative(11.0f)
                    verticalLineToRelative(2.0f)
                    horizontalLineToRelative(-11.0f)
                    close()
                }
                materialPath {
                    moveTo(3.0f, 14.0f)
                    horizontalLineToRelative(7.0f)
                    verticalLineToRelative(2.0f)
                    horizontalLineToRelative(-7.0f)
                    close()
                }
                materialPath {
                    moveTo(16.0f, 13.0f)
                    lineToRelative(0.0f, 8.0f)
                    lineToRelative(6.0f, -4.0f)
                    close()
                }
            }
            return _playlistPlay!!
        }

    private var _playlistPlay: ImageVector? = null

    val Refresh: ImageVector
        get() {
            if (_refresh != null) {
                return _refresh!!
            }
            _refresh = materialIcon(name = "Filled.Refresh") {
                materialPath {
                    moveTo(17.65f, 6.35f)
                    curveTo(16.2f, 4.9f, 14.21f, 4.0f, 12.0f, 4.0f)
                    curveToRelative(-4.42f, 0.0f, -7.99f, 3.58f, -7.99f, 8.0f)
                    reflectiveCurveToRelative(3.57f, 8.0f, 7.99f, 8.0f)
                    curveToRelative(3.73f, 0.0f, 6.84f, -2.55f, 7.73f, -6.0f)
                    horizontalLineToRelative(-2.08f)
                    curveToRelative(-0.82f, 2.33f, -3.04f, 4.0f, -5.65f, 4.0f)
                    curveToRelative(-3.31f, 0.0f, -6.0f, -2.69f, -6.0f, -6.0f)
                    reflectiveCurveToRelative(2.69f, -6.0f, 6.0f, -6.0f)
                    curveToRelative(1.66f, 0.0f, 3.14f, 0.69f, 4.22f, 1.78f)
                    lineTo(13.0f, 11.0f)
                    horizontalLineToRelative(7.0f)
                    verticalLineTo(4.0f)
                    lineToRelative(-2.35f, 2.35f)
                    close()
                }
            }
            return _refresh!!
        }

    private var _refresh: ImageVector? = null

    val Search: ImageVector
        get() {
            if (_search != null) {
                return _search!!
            }
            _search = materialIcon(name = "Filled.Search") {
                materialPath {
                    moveTo(15.5f, 14.0f)
                    horizontalLineToRelative(-0.79f)
                    lineToRelative(-0.28f, -0.27f)
                    curveTo(15.41f, 12.59f, 16.0f, 11.11f, 16.0f, 9.5f)
                    curveTo(16.0f, 5.91f, 13.09f, 3.0f, 9.5f, 3.0f)
                    reflectiveCurveTo(3.0f, 5.91f, 3.0f, 9.5f)
                    reflectiveCurveTo(5.91f, 16.0f, 9.5f, 16.0f)
                    curveToRelative(1.61f, 0.0f, 3.09f, -0.59f, 4.23f, -1.57f)
                    lineToRelative(0.27f, 0.28f)
                    verticalLineToRelative(0.79f)
                    lineToRelative(5.0f, 4.99f)
                    lineTo(20.49f, 19.0f)
                    lineToRelative(-4.99f, -5.0f)
                    close()
                    moveTo(9.5f, 14.0f)
                    curveTo(7.01f, 14.0f, 5.0f, 11.99f, 5.0f, 9.5f)
                    reflectiveCurveTo(7.01f, 5.0f, 9.5f, 5.0f)
                    reflectiveCurveTo(14.0f, 7.01f, 14.0f, 9.5f)
                    reflectiveCurveTo(11.99f, 14.0f, 9.5f, 14.0f)
                    close()
                }
            }
            return _search!!
        }

    private var _search: ImageVector? = null

    val Settings: ImageVector
        get() {
            if (_settings != null) {
                return _settings!!
            }
            _settings = materialIcon(name = "Filled.Settings") {
                materialPath {
                    moveTo(19.14f, 12.94f)
                    curveToRelative(0.04f, -0.3f, 0.06f, -0.61f, 0.06f, -0.94f)
                    curveToRelative(0.0f, -0.32f, -0.02f, -0.64f, -0.07f, -0.94f)
                    lineToRelative(2.03f, -1.58f)
                    curveToRelative(0.18f, -0.14f, 0.23f, -0.41f, 0.12f, -0.61f)
                    lineToRelative(-1.92f, -3.32f)
                    curveToRelative(-0.12f, -0.22f, -0.37f, -0.29f, -0.59f, -0.22f)
                    lineToRelative(-2.39f, 0.96f)
                    curveToRelative(-0.5f, -0.38f, -1.03f, -0.7f, -1.62f, -0.94f)
                    lineTo(14.4f, 2.81f)
                    curveToRelative(-0.04f, -0.24f, -0.24f, -0.41f, -0.48f, -0.41f)
                    horizontalLineToRelative(-3.84f)
                    curveToRelative(-0.24f, 0.0f, -0.43f, 0.17f, -0.47f, 0.41f)
                    lineTo(9.25f, 5.35f)
                    curveTo(8.66f, 5.59f, 8.12f, 5.92f, 7.63f, 6.29f)
                    lineTo(5.24f, 5.33f)
                    curveToRelative(-0.22f, -0.08f, -0.47f, 0.0f, -0.59f, 0.22f)
                    lineTo(2.74f, 8.87f)
                    curveTo(2.62f, 9.08f, 2.66f, 9.34f, 2.86f, 9.48f)
                    lineToRelative(2.03f, 1.58f)
                    curveTo(4.84f, 11.36f, 4.8f, 11.69f, 4.8f, 12.0f)
                    reflectiveCurveToRelative(0.02f, 0.64f, 0.07f, 0.94f)
                    lineToRelative(-2.03f, 1.58f)
                    curveToRelative(-0.18f, 0.14f, -0.23f, 0.41f, -0.12f, 0.61f)
                    lineToRelative(1.92f, 3.32f)
                    curveToRelative(0.12f, 0.22f, 0.37f, 0.29f, 0.59f, 0.22f)
                    lineToRelative(2.39f, -0.96f)
                    curveToRelative(0.5f, 0.38f, 1.03f, 0.7f, 1.62f, 0.94f)
                    lineToRelative(0.36f, 2.54f)
                    curveToRelative(0.05f, 0.24f, 0.24f, 0.41f, 0.48f, 0.41f)
                    horizontalLineToRelative(3.84f)
                    curveToRelative(0.24f, 0.0f, 0.44f, -0.17f, 0.47f, -0.41f)
                    lineToRelative(0.36f, -2.54f)
                    curveToRelative(0.59f, -0.24f, 1.13f, -0.56f, 1.62f, -0.94f)
                    lineToRelative(2.39f, 0.96f)
                    curveToRelative(0.22f, 0.08f, 0.47f, 0.0f, 0.59f, -0.22f)
                    lineToRelative(1.92f, -3.32f)
                    curveToRelative(0.12f, -0.22f, 0.07f, -0.47f, -0.12f, -0.61f)
                    lineTo(19.14f, 12.94f)
                    close()
                    moveTo(12.0f, 15.6f)
                    curveToRelative(-1.98f, 0.0f, -3.6f, -1.62f, -3.6f, -3.6f)
                    reflectiveCurveToRelative(1.62f, -3.6f, 3.6f, -3.6f)
                    reflectiveCurveToRelative(3.6f, 1.62f, 3.6f, 3.6f)
                    reflectiveCurveTo(13.98f, 15.6f, 12.0f, 15.6f)
                    close()
                }
            }
            return _settings!!
        }

    private var _settings: ImageVector? = null

    val SkipNext: ImageVector
        get() {
            if (_skipNext != null) {
                return _skipNext!!
            }
            _skipNext = materialIcon(name = "Filled.SkipNext") {
                materialPath {
                    moveTo(6.0f, 18.0f)
                    lineToRelative(8.5f, -6.0f)
                    lineTo(6.0f, 6.0f)
                    verticalLineToRelative(12.0f)
                    close()
                    moveTo(16.0f, 6.0f)
                    verticalLineToRelative(12.0f)
                    horizontalLineToRelative(2.0f)
                    verticalLineTo(6.0f)
                    horizontalLineToRelative(-2.0f)
                    close()
                }
            }
            return _skipNext!!
        }

    private var _skipNext: ImageVector? = null

    val SkipPrevious: ImageVector
        get() {
            if (_skipPrevious != null) {
                return _skipPrevious!!
            }
            _skipPrevious = materialIcon(name = "Filled.SkipPrevious") {
                materialPath {
                    moveTo(6.0f, 6.0f)
                    horizontalLineToRelative(2.0f)
                    verticalLineToRelative(12.0f)
                    lineTo(6.0f, 18.0f)
                    close()
                    moveTo(9.5f, 12.0f)
                    lineToRelative(8.5f, 6.0f)
                    lineTo(18.0f, 6.0f)
                    close()
                }
            }
            return _skipPrevious!!
        }

    private var _skipPrevious: ImageVector? = null

    val Stop: ImageVector
        get() {
            if (_stop != null) {
                return _stop!!
            }
            _stop = materialIcon(name = "Filled.Stop") {
                materialPath {
                    moveTo(6.0f, 6.0f)
                    horizontalLineToRelative(12.0f)
                    verticalLineToRelative(12.0f)
                    horizontalLineTo(6.0f)
                    close()
                }
            }
            return _stop!!
        }

    private var _stop: ImageVector? = null

    val Warning: ImageVector
        get() {
            if (_warning != null) {
                return _warning!!
            }
            _warning = materialIcon(name = "Filled.Warning") {
                materialPath {
                    moveTo(1.0f, 21.0f)
                    horizontalLineToRelative(22.0f)
                    lineTo(12.0f, 2.0f)
                    lineTo(1.0f, 21.0f)
                    close()
                    moveTo(13.0f, 18.0f)
                    horizontalLineToRelative(-2.0f)
                    verticalLineToRelative(-2.0f)
                    horizontalLineToRelative(2.0f)
                    verticalLineToRelative(2.0f)
                    close()
                    moveTo(13.0f, 14.0f)
                    horizontalLineToRelative(-2.0f)
                    verticalLineToRelative(-4.0f)
                    horizontalLineToRelative(2.0f)
                    verticalLineToRelative(4.0f)
                    close()
                }
            }
            return _warning!!
        }

    private var _warning: ImageVector? = null
}
