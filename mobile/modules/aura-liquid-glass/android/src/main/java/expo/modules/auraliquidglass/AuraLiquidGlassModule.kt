package expo.modules.auraliquidglass

import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class AuraLiquidGlassModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("AuraLiquidGlass")

    /** Blur pipeline (RenderNode + RenderEffect) is available. */
    Constant("supported") { Build.VERSION.SDK_INT >= 31 }
    /** AGSL lens (refraction, dispersion, specular) is available. */
    Constant("refraction") { Build.VERSION.SDK_INT >= 33 }

    View(LiquidGlassView::class) {
      Prop("cornerRadius") { view: LiquidGlassView, v: Float -> view.cornerRadiusDp = v }
      Prop("blur") { view: LiquidGlassView, v: Float -> view.blurDp = v }
      Prop("refraction") { view: LiquidGlassView, v: Float -> view.refraction = v }
      Prop("dispersion") { view: LiquidGlassView, v: Float -> view.dispersion = v }
      Prop("specular") { view: LiquidGlassView, v: Float -> view.specular = v }
    }
  }
}
