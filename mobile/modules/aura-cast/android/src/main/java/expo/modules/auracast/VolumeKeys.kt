package expo.modules.auracast

import android.annotation.TargetApi
import android.app.Activity
import android.view.KeyEvent
import android.view.KeyboardShortcutGroup
import android.view.Menu
import android.view.Window

/**
 * While Aura is casting to a Google Cast device, the phone's volume buttons
 * change the device's volume (not the phone's), also when the cast is paused.
 * Done by wrapping the activity window's key dispatch, so it needs no change
 * to MainActivity. In the background the Cast framework's media session
 * handles the buttons.
 */
object VolumeKeys {
  fun install(activity: Activity?) {
    val w = activity?.window ?: return
    val cb = w.callback ?: return
    if (cb is Hook) return
    w.callback = Hook(cb)
  }

  private class Hook(private val inner: Window.Callback) : Window.Callback by inner {
    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
      val code = event.keyCode
      val volumeKey = code == KeyEvent.KEYCODE_VOLUME_UP || code == KeyEvent.KEYCODE_VOLUME_DOWN || code == KeyEvent.KEYCODE_VOLUME_MUTE
      if (volumeKey && GoogleCast.handlesVolumeKeys()) {
        if (event.action == KeyEvent.ACTION_DOWN) {
          when (code) {
            KeyEvent.KEYCODE_VOLUME_UP -> GoogleCast.volumeKey(true)
            KeyEvent.KEYCODE_VOLUME_DOWN -> GoogleCast.volumeKey(false)
            else -> if (event.repeatCount == 0) GoogleCast.muteKey()
          }
        }
        return true // the phone's own volume panel stays out of it
      }
      return inner.dispatchKeyEvent(event)
    }

    // Java default methods aren't covered by Kotlin delegation.
    @TargetApi(24)
    override fun onProvideKeyboardShortcuts(data: MutableList<KeyboardShortcutGroup>?, menu: Menu?, deviceId: Int) =
      inner.onProvideKeyboardShortcuts(data, menu, deviceId)

    @TargetApi(26)
    override fun onPointerCaptureChanged(hasCapture: Boolean) = inner.onPointerCaptureChanged(hasCapture)
  }
}
