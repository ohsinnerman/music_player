package expo.modules.auraliquidglass

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.RenderNode
import android.os.Build
import android.view.View
import android.view.ViewGroup
import android.view.ViewTreeObserver
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.platform.ComposeView
import androidx.compose.ui.platform.ViewCompositionStrategy
import androidx.compose.ui.unit.dp
import dev.chrisbanes.haze.HazeInput
import dev.chrisbanes.haze.glass.GlassStyle
import dev.chrisbanes.haze.glass.OpticalSizeValue
import dev.chrisbanes.haze.glass.SurfaceProfile
import dev.chrisbanes.haze.glass.hazeGlass
import dev.chrisbanes.haze.glass.material3.material3
import dev.chrisbanes.haze.hazeSource
import dev.chrisbanes.haze.rememberHazeState
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.views.ExpoView

/** Everything the glass needs from JS. */
@Immutable
data class HazeGlassParams(
  val cornerRadiusDp: Float = 28f,
  val blurDp: Float = 2f,
  /** 0–1, scales Haze's refraction strength. */
  val refraction: Float = 1f,
  /** 0–1, chromatic aberration at the rim. */
  val dispersion: Float = 0.35f,
  /** 0–1, scales the specular highlight. */
  val specular: Float = 1f,
  /** Haze's Clear style (liquid end of the slider) or Regular. */
  val clear: Boolean = true,
  val dark: Boolean = true,
  /** Material 3 surface colour (ARGB). */
  val surface: Int = 0xFF121218.toInt(),
)

/**
 * Liquid Glass drawn by Haze (chrisbanes/haze, `haze-glass` + `haze-glass-material3`).
 *
 * Haze is a Compose library, and the app is React Native, so this view hosts a
 * small ComposeView. The page behind it is recorded by expo-blur's BlurTarget
 * into a RenderNode; a Compose box marked `hazeSource` draws that node shifted
 * under us, and a second box applies `Modifier.hazeGlass(...)` with a Material 3
 * Glass Style on top. Haze then does refraction, depth blur, specular, ambient
 * edge response and chromatic aberration on the GPU (RuntimeShader on Android
 * 13+, its own fallback renderer below that).
 *
 * The ComposeView is [PAD_DP] larger than this view on every side, so the
 * refraction near the rim has real content to bend instead of clamped edges;
 * the parent's rounded clip hides the extra area.
 */
@SuppressLint("NewApi", "ViewConstructor")
class HazeGlassView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  override val shouldUseAndroidLayout = true

  private val density = resources.displayMetrics.density
  private val pad = (PAD_DP * density).toInt()

  private val params = mutableStateOf(HazeGlassParams())
  /** Bumped when the backdrop or our position changes, so the source redraws. */
  private val frame = mutableIntStateOf(0)

  private var target: View? = null
  private var targetNode: RenderNode? = null
  private val here = IntArray(2)
  private val there = IntArray(2)
  private var dx = 0
  private var dy = 0

  private val preDraw = ViewTreeObserver.OnPreDrawListener {
    val t = target
    if (t == null) findTarget()
    if (t != null && (t.isDirty || updateOffset())) frame.intValue++
    true
  }

  private val compose = ComposeView(context).apply {
    setViewCompositionStrategy(ViewCompositionStrategy.DisposeOnDetachedFromWindow)
    setContent { Glass(params.value) }
  }

  init {
    clipChildren = false
    clipToPadding = false
    addView(compose)
  }

  fun update(block: (HazeGlassParams) -> HazeGlassParams) {
    params.value = block(params.value)
  }

  @Composable
  private fun Glass(p: HazeGlassParams) {
    val scheme = if (p.dark) darkColorScheme(surface = Color(p.surface)) else lightColorScheme(surface = Color(p.surface))
    MaterialTheme(colorScheme = scheme) {
      val state = rememberHazeState()
      val base = if (p.clear) GlassStyle.clear else GlassStyle.regular
      // Material 3 colours first, then our shape and slider-driven optics on top.
      val style = base.material3(tint = null).then {
        shape(RoundedCornerShape(p.cornerRadiusDp.dp))
        surfaceProfile(SurfaceProfile.Squircle)
        optics { o ->
          o.copy(
            blurRadius = OpticalSizeValue.Fixed(p.blurDp.dp),
            refractionStrength = o.refractionStrength * p.refraction.coerceIn(0f, 1.2f),
          )
        }
        specularIntensity((0.48f * p.specular).coerceIn(0f, 1f))
        chromaticAberrationStrength((p.dispersion * 0.6f).coerceIn(0f, 1f))
      }
      Box(Modifier.fillMaxSize()) {
        // The page behind us (padded), as a Haze source.
        Box(
          Modifier
            .fillMaxSize()
            .hazeSource(state)
            .drawBehind {
              frame.intValue // redraw when the backdrop or our offset changes
              val node = targetNode ?: return@drawBehind
              val c = drawContext.canvas.nativeCanvas
              if (!c.isHardwareAccelerated || !node.hasDisplayList()) return@drawBehind
              c.save()
              c.translate(-(dx - pad).toFloat(), -(dy - pad).toFloat())
              c.drawRenderNode(node)
              c.restore()
            },
        )
        // The glass itself, exactly our bounds.
        Box(
          Modifier
            .fillMaxSize()
            .padding((PAD_DP).dp)
            .hazeGlass(input = HazeInput.Sources(state), style = style),
        )
      }
    }
  }

  override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
    val w = MeasureSpec.getSize(widthMeasureSpec)
    val h = MeasureSpec.getSize(heightMeasureSpec)
    compose.measure(
      MeasureSpec.makeMeasureSpec(w + pad * 2, MeasureSpec.EXACTLY),
      MeasureSpec.makeMeasureSpec(h + pad * 2, MeasureSpec.EXACTLY),
    )
    setMeasuredDimension(w, h)
  }

  override fun onLayout(changed: Boolean, l: Int, t: Int, r: Int, b: Int) {
    compose.layout(-pad, -pad, r - l + pad, b - t + pad)
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    findTarget()
    updateOffset()
    viewTreeObserver.addOnPreDrawListener(preDraw)
  }

  override fun onDetachedFromWindow() {
    viewTreeObserver.removeOnPreDrawListener(preDraw)
    target = null
    targetNode = null
    super.onDetachedFromWindow()
  }

  private fun findTarget() {
    if (targetNode != null || Build.VERSION.SDK_INT < 29) return
    val found = search(rootView) ?: return
    val node = LiquidGlassView.renderNodeOf(found) ?: return
    target = found
    targetNode = node
    frame.intValue++
  }

  private fun search(v: View): View? {
    if (LiquidGlassView.isBlurTarget(v.javaClass)) return v
    if (v is ViewGroup) {
      for (i in 0 until v.childCount) {
        val c = v.getChildAt(i)
        if (c === this) continue
        search(c)?.let { return it }
      }
    }
    return null
  }

  /** Our top-left relative to the BlurTarget; true if it moved. */
  private fun updateOffset(): Boolean {
    val t = target ?: return false
    getLocationInWindow(here)
    t.getLocationInWindow(there)
    val nx = here[0] - there[0]
    val ny = here[1] - there[1]
    if (nx == dx && ny == dy) return false
    dx = nx
    dy = ny
    return true
  }

  companion object {
    /** Extra backdrop on every side for the rim refraction to sample. */
    const val PAD_DP = 24f
  }
}
