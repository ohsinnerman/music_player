package expo.modules.auraliquidglass

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Canvas
import android.graphics.Outline
import android.graphics.RenderEffect
import android.graphics.RenderNode
import android.graphics.RuntimeShader
import android.graphics.Shader
import android.os.Build
import android.view.View
import android.view.ViewGroup
import android.view.ViewTreeObserver
import androidx.annotation.RequiresApi
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.views.ExpoView
import java.lang.reflect.Field

/**
 * Apple-style Liquid Glass for Android, fully on the GPU.
 *
 * The page content is already recorded into a RenderNode by expo-blur's
 * BlurTarget (a display list, not pixels). Every frame that content or this
 * view's position changes, we re-record one tiny display list that draws that
 * node shifted under us, and let RenderThread apply:
 *
 *   RenderEffect.blur  →  AGSL lens shader (API 33+)
 *
 * The lens bends the backdrop along a circular profile near the rounded edge
 * (refraction), splits R/G/B slightly (dispersion) and adds a directional
 * specular rim, like iOS 26. No bitmaps, no software draw, no per-frame
 * allocation unless the size changes. API 31–32 get the blur only; older
 * versions never mount this view (the JS side draws a frosted fill).
 */
// Every API 29+/31+ call is behind a runtime SDK check, and JS only mounts this view on API 31+.
@SuppressLint("NewApi")
class LiquidGlassView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  private val density = resources.displayMetrics.density

  // Props (dp / 0..1), set from JS.
  var cornerRadiusDp = 28f
    set(v) { field = v; changed() }
  var blurDp = 2f
    set(v) { field = v; changed() }
  var refraction = 1f
    set(v) { field = v; changed() }
  var dispersion = 0.35f
    set(v) { field = v; changed() }
  var specular = 1f
    set(v) { field = v; changed() }

  private val supported = Build.VERSION.SDK_INT >= 31
  private val contentNode: RenderNode? = if (supported) RenderNode("AuraLiquidGlass.content") else null
  private val clipNode: RenderNode? = if (supported) RenderNode("AuraLiquidGlass.clip").apply { setClipToOutline(true) } else null
  private var target: View? = null
  private var targetNode: RenderNode? = null
  private val here = IntArray(2)
  private val there = IntArray(2)
  private var dx = Int.MIN_VALUE
  private var dy = Int.MIN_VALUE
  private var effectKey = ""
  private var shader: Any? = null // RuntimeShader on API 33+

  private val preDraw = ViewTreeObserver.OnPreDrawListener {
    // Redraw only when the page under us changed or we moved — never every frame for nothing.
    val t = target
    if (t != null && (t.isDirty || updateOffset())) invalidate()
    true
  }

  init {
    setWillNotDraw(false)
  }

  private fun changed() {
    effectKey = ""
    invalidate()
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    findTarget()
    viewTreeObserver.addOnPreDrawListener(preDraw)
  }

  override fun onDetachedFromWindow() {
    viewTreeObserver.removeOnPreDrawListener(preDraw)
    target = null
    targetNode = null
    contentNode?.discardDisplayList()
    clipNode?.discardDisplayList()
    super.onDetachedFromWindow()
  }

  /** Locate expo-blur's BlurTarget (wraps the page) and the RenderNode it records into. */
  private fun findTarget() {
    if (targetNode != null) return
    val found = search(rootView) ?: return
    val node = renderNodeOf(found) ?: return
    target = found
    targetNode = node
  }

  private fun search(v: View): View? {
    if (isBlurTarget(v.javaClass)) return v
    if (v is ViewGroup) {
      for (i in 0 until v.childCount) {
        val c = v.getChildAt(i)
        if (c === this) continue
        search(c)?.let { return it }
      }
    }
    return null
  }

  /** Returns true if our offset relative to the target changed. */
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

  override fun onDraw(canvas: Canvas) {
    super.onDraw(canvas)
    val contentNode = contentNode ?: return
    val clipNode = clipNode ?: return
    if (!canvas.isHardwareAccelerated) return
    if (targetNode == null) findTarget()
    val tn = targetNode ?: return
    if (!tn.hasDisplayList()) return
    val w = width
    val h = height
    if (w <= 0 || h <= 0) return
    if (dx == Int.MIN_VALUE) updateOffset()

    // Room around us so blur and lens can sample what's just outside the edge.
    val pad = ((blurDp * 2f + 16f) * density).toInt()
    val r = Math.min(cornerRadiusDp * density, Math.min(w, h) / 2f)

    contentNode.setPosition(0, 0, w + pad * 2, h + pad * 2)
    val rc = contentNode.beginRecording()
    rc.translate((pad - dx).toFloat(), (pad - dy).toFloat())
    rc.drawRenderNode(tn)
    contentNode.endRecording()
    applyEffect(contentNode, w, h, pad, r)

    // Effect first (inner node), then clip to the rounded shape with an anti-aliased outline.
    clipNode.setPosition(0, 0, w, h)
    clipNode.setOutline(Outline().apply { setRoundRect(0, 0, w, h, r) })
    val cc = clipNode.beginRecording()
    cc.translate(-pad.toFloat(), -pad.toFloat())
    cc.drawRenderNode(contentNode)
    clipNode.endRecording()
    canvas.drawRenderNode(clipNode)
  }

  @RequiresApi(31)
  private fun applyEffect(contentNode: RenderNode, w: Int, h: Int, pad: Int, r: Float) {
    val key = "$w:$h:$pad:$r:$blurDp:$refraction:$dispersion:$specular"
    if (key == effectKey) return
    effectKey = key
    val blurPx = blurDp * density
    val blur = if (blurPx >= 0.5f) RenderEffect.createBlurEffect(blurPx, blurPx, Shader.TileMode.CLAMP) else null
    var effect: RenderEffect? = blur
    if (Build.VERSION.SDK_INT >= 33 && refraction > 0.01f) {
      val lens = lensEffect(w, h, pad, r)
      effect = if (blur != null) RenderEffect.createChainEffect(lens, blur) else lens
    }
    contentNode.setRenderEffect(effect)
  }

  @RequiresApi(33)
  private fun lensEffect(w: Int, h: Int, pad: Int, r: Float): RenderEffect {
    val s = (shader as? RuntimeShader) ?: RuntimeShader(LENS_AGSL).also { shader = it }
    val minSide = Math.min(w, h).toFloat()
    s.setFloatUniform("size", w.toFloat(), h.toFloat())
    s.setFloatUniform("origin", pad.toFloat(), pad.toFloat())
    s.setFloatUniform("radius", r)
    // The bending band hugs the edge; small controls get a proportionally smaller band.
    s.setFloatUniform("band", Math.min(22f * density, minSide * 0.42f))
    s.setFloatUniform("amount", refraction * Math.min(14f * density, minSide * 0.3f))
    s.setFloatUniform("dispersion", dispersion)
    s.setFloatUniform("specular", specular)
    return RenderEffect.createRuntimeShaderEffect(s, "content")
  }

  companion object {
    private var targetClass: Class<*>? = null
    private var nodeField: Field? = null

    fun isBlurTarget(c: Class<*>): Boolean {
      targetClass?.let { return it.isAssignableFrom(c) }
      var k: Class<*>? = c
      while (k != null) {
        if (k.name == "eightbitlab.com.blurview.BlurTarget") {
          targetClass = k
          return true
        }
        k = k.superclass
      }
      return false
    }

    fun renderNodeOf(v: View): RenderNode? {
      if (Build.VERSION.SDK_INT < 31) return null
      return try {
        val f = nodeField ?: run {
          var k: Class<*>? = v.javaClass
          var found: Field? = null
          while (k != null && found == null) {
            found = k.declaredFields.firstOrNull { it.type == RenderNode::class.java }
            k = k.superclass
          }
          found?.also { it.isAccessible = true; nodeField = it }
        }
        f?.get(v) as? RenderNode
      } catch (e: Exception) {
        null
      }
    }

    /**
     * Liquid glass lens. `content` is the (already blurred) backdrop, in a node
     * padded by `origin` on every side. Inside the rounded rect, samples are
     * pushed outward along the edge normal with a circular profile, so the
     * rim bends the world behind it; R/G/B bend by slightly different amounts
     * (dispersion); a light from the top-left adds the specular rim.
     */
    private const val LENS_AGSL = """
uniform shader content;
uniform float2 size;
uniform float2 origin;
uniform float radius;
uniform float band;
uniform float amount;
uniform float dispersion;
uniform float specular;

float sdBox(float2 p) {
  float2 hs = size * 0.5;
  float r = min(radius, min(hs.x, hs.y));
  float2 q = abs(p) - hs + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

half4 main(float2 coord) {
  float2 p = coord - origin - size * 0.5;
  float d = sdBox(p);
  if (d > 0.5) { return content.eval(coord); }

  float e = 0.8;
  float2 g = float2(sdBox(p + float2(e, 0.0)) - sdBox(p - float2(e, 0.0)),
                    sdBox(p + float2(0.0, e)) - sdBox(p - float2(0.0, e)));
  float2 n = g / max(length(g), 1e-4);

  // 0 at the rim → 1 once past the band; circular lens profile.
  float t = clamp(-d / max(band, 1.0), 0.0, 1.0);
  float u = 1.0 - t;
  float k = 1.0 - sqrt(max(0.0, 1.0 - u * u));
  float2 off = n * amount * k;

  half4 c;
  if (dispersion > 0.001) {
    float2 dd = off * dispersion * 0.35;
    c.r = content.eval(coord + off + dd).r;
    c.g = content.eval(coord + off).g;
    c.b = content.eval(coord + off - dd).b;
    c.a = 1.0;
  } else {
    c = content.eval(coord + off);
  }

  // Specular: key light from the top-left, a softer bounce from the bottom-right, both hugging the rim.
  float rim = pow(u, 5.0);
  float key = pow(max(dot(n, normalize(float2(-0.55, -0.83))), 0.0), 2.0);
  float fill = pow(max(dot(n, normalize(float2(0.55, 0.83))), 0.0), 2.0) * 0.45;
  float lift = specular * rim * (key + fill) * 0.5;
  // A whisper of brightening inside the bend, as light gathers in thick glass.
  float inner = specular * k * 0.06;
  c.rgb = min(c.rgb + half3(lift + inner), half3(1.0));
  return c;
}
"""
  }
}
