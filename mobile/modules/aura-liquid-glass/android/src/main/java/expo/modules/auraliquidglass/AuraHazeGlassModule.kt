package expo.modules.auraliquidglass

import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/** Liquid Glass rendered by Haze's Glass effect with a Material 3 Glass Style (Android 13+). */
class AuraHazeGlassModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("AuraHazeGlass")

    /** Haze's RuntimeShader glass (refraction, specular, dispersion) needs Android 13. */
    Constant("supported") { Build.VERSION.SDK_INT >= 33 }

    View(HazeGlassView::class) {
      Prop("cornerRadius") { view: HazeGlassView, v: Float -> view.update { it.copy(cornerRadiusDp = v) } }
      Prop("blur") { view: HazeGlassView, v: Float -> view.update { it.copy(blurDp = v) } }
      Prop("refraction") { view: HazeGlassView, v: Float -> view.update { it.copy(refraction = v) } }
      Prop("dispersion") { view: HazeGlassView, v: Float -> view.update { it.copy(dispersion = v) } }
      Prop("specular") { view: HazeGlassView, v: Float -> view.update { it.copy(specular = v) } }
      /** "clear" (liquid end of the slider) or "regular". */
      Prop("glassStyle") { view: HazeGlassView, v: String -> view.update { it.copy(clear = v != "regular") } }
      Prop("dark") { view: HazeGlassView, v: Boolean -> view.update { it.copy(dark = v) } }
      /** Material 3 surface colour as #RRGGBB or #AARRGGBB. */
      Prop("surfaceColor") { view: HazeGlassView, v: String ->
        val c = try { android.graphics.Color.parseColor(v) } catch (e: Exception) { null }
        if (c != null) view.update { it.copy(surface = c) }
      }
    }
  }
}
