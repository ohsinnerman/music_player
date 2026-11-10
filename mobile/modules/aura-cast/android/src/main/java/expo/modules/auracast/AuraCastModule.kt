package expo.modules.auracast

import android.content.Context
import android.content.Intent
import android.os.Build
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.concurrent.Executors

/**
 * DLNA / UPnP AV for Aura: find media renderers (AV receivers, network
 * speakers) on Wi-Fi, talk SOAP to them, and serve them the original file.
 * The UPnP logic (descriptions, SOAP, DIDL) lives in TypeScript; this module is
 * only the network plumbing Android's JS runtime can't do.
 */
class AuraCastModule : Module() {
  private val io = Executors.newCachedThreadPool()
  private val context: Context
    get() = appContext.reactContext ?: throw IllegalStateException("No context")

  override fun definition() = ModuleDefinition {
    Name("AuraCast")

    Events("onCastDevices", "onCastSession", "onCastStatus")

    OnCreate {
      GoogleCast.emit = { name, body -> sendEvent(name, body) }
    }

    OnDestroy {
      GoogleCast.emit = null
      GoogleCast.stopDiscovery()
    }

    /* ───── Google Cast ───── */

    AsyncFunction("gcInit") { promise: Promise ->
      GoogleCast.init(context) { err -> if (err == null) promise.resolve(true) else promise.reject("ERR_GCAST", err, null) }
    }

    Function("gcStartDiscovery") {
      GoogleCast.startDiscovery()
      Unit
    }

    Function("gcStopDiscovery") {
      GoogleCast.stopDiscovery()
      Unit
    }

    Function("gcDevices") { GoogleCast.devices() }

    AsyncFunction("gcConnect") { id: String, promise: Promise ->
      GoogleCast.connect(id) { err -> if (err == null) promise.resolve(true) else promise.reject("ERR_GCAST", err, null) }
    }

    Function("gcDisconnect") {
      GoogleCast.disconnect()
      Unit
    }

    AsyncFunction("gcLoad") { o: Map<String, Any?>, promise: Promise ->
      GoogleCast.load(o) { err -> if (err == null) promise.resolve(true) else promise.reject("ERR_GCAST_LOAD", err, null) }
    }

    /** Aura's TV screen App ID ("" = Google's Default Media Receiver). Resolves with the ID in use. */
    AsyncFunction("gcSetReceiver") { id: String, promise: Promise ->
      GoogleCast.setReceiverAppId(context, id) { promise.resolve(it) }
    }

    Function("gcReceiver") { GoogleCast.receiverAppId(context) }

    Function("gcSend") { json: String ->
      GoogleCast.send(json)
      Unit
    }

    Function("gcPlay") {
      GoogleCast.play()
      Unit
    }

    Function("gcPause") {
      GoogleCast.pause()
      Unit
    }

    Function("gcSeek") { sec: Double ->
      GoogleCast.seek(sec)
      Unit
    }

    Function("gcStop") {
      GoogleCast.stop()
      Unit
    }

    Function("gcSetVolume") { v: Double ->
      GoogleCast.setVolume(v)
      Unit
    }

    AsyncFunction("discover") { timeoutMs: Int, st: String, promise: Promise ->
      io.execute {
        try {
          promise.resolve(Ssdp.discover(context, timeoutMs.coerceIn(500, 10000), st))
        } catch (e: Exception) {
          promise.reject("ERR_DISCOVER", e.message ?: "Discovery failed", e)
        }
      }
    }

    AsyncFunction("request") { method: String, url: String, headers: Map<String, String>, body: String?, timeoutMs: Int, promise: Promise ->
      io.execute {
        try {
          val r = LanHttp.request(method, url, headers, body, timeoutMs.coerceIn(500, 20000))
          promise.resolve(mapOf("status" to r.status, "headers" to r.headers, "body" to r.body))
        } catch (e: Exception) {
          promise.reject("ERR_REQUEST", e.message ?: "Request failed", e)
        }
      }
    }

    AsyncFunction("startServer") { promise: Promise ->
      io.execute {
        try {
          val (host, port) = MediaServer.start(context)
          promise.resolve(mapOf("host" to host, "port" to port))
        } catch (e: Exception) {
          promise.reject("ERR_SERVER", e.message ?: "Couldn't start the media server", e)
        }
      }
    }

    Function("serve") { uri: String, mime: String, ext: String, proxy: Boolean ->
      MediaServer.register(uri, mime, ext, proxy)
    }

    Function("clearServed") { MediaServer.clear() }

    Function("stopServer") { MediaServer.stop() }

    Function("wifiAddress") { Net.wifi()?.second?.hostAddress }

    Function("startService") { title: String, text: String ->
      val i = Intent(context, CastService::class.java).putExtra("title", title).putExtra("text", text)
      if (Build.VERSION.SDK_INT >= 26) context.startForegroundService(i) else context.startService(i)
      Unit
    }

    Function("stopService") {
      context.stopService(Intent(context, CastService::class.java))
      Unit
    }
  }
}
