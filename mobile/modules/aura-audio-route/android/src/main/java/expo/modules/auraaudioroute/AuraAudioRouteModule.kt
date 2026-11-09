package expo.modules.auraaudioroute

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioDeviceCallback
import android.media.AudioDeviceInfo
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioMixerAttributes
import android.net.Uri
import android.os.Build
import android.provider.OpenableColumns
import android.os.Handler
import android.os.Looper
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Tells the app where audio is actually going and at what format, so the
 * "Audio quality" sheet can show the real signal path (like Poweramp):
 * mixer sample rate, the active output device and what it supports, and
 * whether the device offers a bit-perfect path (Android 14+ USB).
 * Read-only; needs no permissions.
 */
class AuraAudioRouteModule : Module() {
  private val audioManager: AudioManager?
    get() = appContext.reactContext?.getSystemService(Context.AUDIO_SERVICE) as? AudioManager

  private var callback: AudioDeviceCallback? = null

  override fun definition() = ModuleDefinition {
    Name("AuraAudioRoute")

    Events("onRouteChange")

    Function("getOutputInfo") {
      outputInfo()
    }

    /** Real file names for picked files (content:// URIs don't contain them). Runs off the JS thread. */
    AsyncFunction("displayNames") { uris: List<String> ->
      val resolver = appContext.reactContext?.contentResolver
      uris.map { u ->
        try {
          if (u.startsWith("content://") && resolver != null) {
            resolver.query(Uri.parse(u), arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c ->
              if (c.moveToFirst() && !c.isNull(0)) c.getString(0) else null
            }
          } else {
            Uri.parse(u).lastPathSegment
          }
        } catch (e: Exception) {
          null
        }
      }
    }

    OnStartObserving {
      val am = audioManager ?: return@OnStartObserving
      if (callback != null) return@OnStartObserving
      val cb = object : AudioDeviceCallback() {
        override fun onAudioDevicesAdded(addedDevices: Array<out AudioDeviceInfo>?) {
          sendEvent("onRouteChange", outputInfo())
        }

        override fun onAudioDevicesRemoved(removedDevices: Array<out AudioDeviceInfo>?) {
          sendEvent("onRouteChange", outputInfo())
        }
      }
      am.registerAudioDeviceCallback(cb, Handler(Looper.getMainLooper()))
      callback = cb
    }

    OnStopObserving {
      callback?.let { audioManager?.unregisterAudioDeviceCallback(it) }
      callback = null
    }
  }

  private fun outputInfo(): Map<String, Any?> {
    val am = audioManager ?: return mapOf("available" to false)
    val outputs = am.getDevices(AudioManager.GET_DEVICES_OUTPUTS).filter { it.isSink }
    val active = activeDevice(am, outputs)

    var bitPerfect = false
    if (Build.VERSION.SDK_INT >= 34 && active != null) {
      bitPerfect = try {
        am.getSupportedMixerAttributes(active).any { it.mixerBehavior == AudioMixerAttributes.MIXER_BEHAVIOR_BIT_PERFECT }
      } catch (e: Exception) {
        false
      }
    }

    return mapOf(
      "available" to true,
      "sdk" to Build.VERSION.SDK_INT,
      "mixerSampleRate" to am.getProperty(AudioManager.PROPERTY_OUTPUT_SAMPLE_RATE)?.toIntOrNull(),
      "framesPerBuffer" to am.getProperty(AudioManager.PROPERTY_OUTPUT_FRAMES_PER_BUFFER)?.toIntOrNull(),
      "device" to active?.let { describe(it) },
      "devices" to outputs.map { describe(it) },
      "bitPerfectCapable" to bitPerfect,
    )
  }

  private fun activeDevice(am: AudioManager, outputs: List<AudioDeviceInfo>): AudioDeviceInfo? {
    if (Build.VERSION.SDK_INT >= 33) {
      try {
        val attrs = AudioAttributes.Builder()
          .setUsage(AudioAttributes.USAGE_MEDIA)
          .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
          .build()
        val routed = am.getAudioDevicesForAttributes(attrs).firstOrNull()
        if (routed != null) {
          outputs.firstOrNull { it.type == routed.type && it.address == routed.address }?.let { return it }
          outputs.firstOrNull { it.type == routed.type }?.let { return it }
        }
      } catch (e: Exception) {
        // fall through to the heuristic
      }
    }
    // Older Android: media goes to the most "specific" connected output.
    val priority = listOf(
      AudioDeviceInfo.TYPE_USB_HEADSET, AudioDeviceInfo.TYPE_USB_DEVICE, AudioDeviceInfo.TYPE_USB_ACCESSORY,
      AudioDeviceInfo.TYPE_WIRED_HEADPHONES, AudioDeviceInfo.TYPE_WIRED_HEADSET,
      AudioDeviceInfo.TYPE_BLE_HEADSET, AudioDeviceInfo.TYPE_BLE_SPEAKER, AudioDeviceInfo.TYPE_BLUETOOTH_A2DP,
      AudioDeviceInfo.TYPE_HDMI, AudioDeviceInfo.TYPE_LINE_DIGITAL, AudioDeviceInfo.TYPE_LINE_ANALOG,
      AudioDeviceInfo.TYPE_BUILTIN_SPEAKER,
    )
    for (t in priority) outputs.firstOrNull { it.type == t }?.let { return it }
    return outputs.firstOrNull()
  }

  private fun describe(d: AudioDeviceInfo): Map<String, Any?> = mapOf(
    "id" to d.id,
    "type" to typeName(d.type),
    "name" to d.productName?.toString(),
    "sampleRates" to d.sampleRates.toList(),
    "channelCounts" to d.channelCounts.toList(),
    "encodings" to d.encodings.map { encodingName(it) },
  )

  private fun typeName(t: Int): String = when (t) {
    AudioDeviceInfo.TYPE_BUILTIN_SPEAKER, AudioDeviceInfo.TYPE_BUILTIN_SPEAKER_SAFE -> "speaker"
    AudioDeviceInfo.TYPE_BUILTIN_EARPIECE -> "earpiece"
    AudioDeviceInfo.TYPE_WIRED_HEADPHONES, AudioDeviceInfo.TYPE_WIRED_HEADSET -> "wired"
    AudioDeviceInfo.TYPE_BLUETOOTH_A2DP -> "bluetooth"
    AudioDeviceInfo.TYPE_BLE_HEADSET, AudioDeviceInfo.TYPE_BLE_SPEAKER, AudioDeviceInfo.TYPE_BLE_BROADCAST -> "bluetooth-le"
    AudioDeviceInfo.TYPE_BLUETOOTH_SCO -> "bluetooth-call"
    AudioDeviceInfo.TYPE_USB_DEVICE, AudioDeviceInfo.TYPE_USB_HEADSET, AudioDeviceInfo.TYPE_USB_ACCESSORY -> "usb"
    AudioDeviceInfo.TYPE_HDMI, AudioDeviceInfo.TYPE_HDMI_ARC, AudioDeviceInfo.TYPE_HDMI_EARC -> "hdmi"
    AudioDeviceInfo.TYPE_LINE_ANALOG, AudioDeviceInfo.TYPE_LINE_DIGITAL, AudioDeviceInfo.TYPE_AUX_LINE -> "line"
    AudioDeviceInfo.TYPE_DOCK, AudioDeviceInfo.TYPE_DOCK_ANALOG -> "dock"
    AudioDeviceInfo.TYPE_HEARING_AID -> "hearing-aid"
    AudioDeviceInfo.TYPE_REMOTE_SUBMIX -> "cast"
    else -> "other"
  }

  private fun encodingName(e: Int): String = when (e) {
    AudioFormat.ENCODING_PCM_16BIT -> "pcm16"
    AudioFormat.ENCODING_PCM_24BIT_PACKED -> "pcm24"
    AudioFormat.ENCODING_PCM_32BIT -> "pcm32"
    AudioFormat.ENCODING_PCM_FLOAT -> "float"
    AudioFormat.ENCODING_PCM_8BIT -> "pcm8"
    else -> "enc$e"
  }
}
