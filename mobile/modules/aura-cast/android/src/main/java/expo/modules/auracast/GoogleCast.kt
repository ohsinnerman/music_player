package expo.modules.auracast

import android.content.Context
import android.net.Uri
import android.os.Handler
import android.os.Looper
import androidx.mediarouter.media.MediaRouteSelector
import androidx.mediarouter.media.MediaRouter
import com.google.android.gms.cast.CastDevice
import com.google.android.gms.cast.CastMediaControlIntent
import com.google.android.gms.cast.MediaInfo
import com.google.android.gms.cast.MediaLoadRequestData
import com.google.android.gms.cast.MediaMetadata
import com.google.android.gms.cast.MediaSeekOptions
import com.google.android.gms.cast.MediaStatus
import com.google.android.gms.cast.framework.CastContext
import com.google.android.gms.cast.framework.CastOptions
import com.google.android.gms.cast.framework.CastSession
import com.google.android.gms.cast.framework.OptionsProvider
import com.google.android.gms.cast.framework.SessionManagerListener
import com.google.android.gms.cast.framework.SessionProvider
import com.google.android.gms.cast.framework.media.CastMediaOptions
import com.google.android.gms.cast.framework.media.RemoteMediaClient
import com.google.android.gms.common.ConnectionResult
import com.google.android.gms.common.GoogleApiAvailability
import com.google.android.gms.common.images.WebImage
import java.util.concurrent.Executors

/** Cast options: Google's Default Media Receiver (plays FLAC, WAV, MP3, AAC, Opus…), no Cast notification (Aura has its own). */
class AuraCastOptionsProvider : OptionsProvider {
  override fun getCastOptions(context: Context): CastOptions {
    val media = CastMediaOptions.Builder().setNotificationOptions(null).build()
    return CastOptions.Builder()
      .setReceiverApplicationId(CastMediaControlIntent.DEFAULT_MEDIA_RECEIVER_APPLICATION_ID)
      .setCastMediaOptions(media)
      .setStopReceiverApplicationWhenEndingSession(true)
      .build()
  }

  override fun getAdditionalSessionProviders(context: Context): List<SessionProvider>? = null
}

/**
 * Google Cast (Chromecast, Google TV, Nest speakers, Cast-enabled TVs and
 * receivers, speaker groups). Discovery goes through MediaRouter; selecting a
 * route makes the Cast framework start a session, after which songs are loaded
 * into the Default Media Receiver by URL (the phone's media server for local
 * files). All framework calls happen on the main thread.
 */
object GoogleCast {
  private val main = Handler(Looper.getMainLooper())
  private var cast: CastContext? = null
  private var router: MediaRouter? = null
  private var discovering = false
  var emit: ((String, Map<String, Any?>) -> Unit)? = null

  private val selector: MediaRouteSelector by lazy {
    MediaRouteSelector.Builder()
      .addControlCategory(CastMediaControlIntent.categoryForCast(CastMediaControlIntent.DEFAULT_MEDIA_RECEIVER_APPLICATION_ID))
      .build()
  }

  fun init(context: Context, done: (String?) -> Unit) {
    main.post {
      if (cast != null) return@post done(null)
      val app = context.applicationContext
      val gms = GoogleApiAvailability.getInstance().isGooglePlayServicesAvailable(app)
      if (gms != ConnectionResult.SUCCESS) return@post done("Google Play services aren't available on this phone")
      try {
        CastContext.getSharedInstance(app, Executors.newSingleThreadExecutor())
          .addOnSuccessListener { c ->
            cast = c
            router = MediaRouter.getInstance(app)
            c.sessionManager.addSessionManagerListener(sessions, CastSession::class.java)
            done(null)
          }
          .addOnFailureListener { e -> done(e.message ?: "Google Cast isn't available") }
      } catch (e: Exception) {
        done(e.message ?: "Google Cast isn't available")
      }
    }
  }

  /* ───────────── Discovery ───────────── */

  private val routes = object : MediaRouter.Callback() {
    override fun onRouteAdded(r: MediaRouter, route: MediaRouter.RouteInfo) = publish()
    override fun onRouteRemoved(r: MediaRouter, route: MediaRouter.RouteInfo) = publish()
    override fun onRouteChanged(r: MediaRouter, route: MediaRouter.RouteInfo) = publish()
  }

  fun startDiscovery() = main.post {
    val r = router ?: return@post
    if (!discovering) r.addCallback(selector, routes, MediaRouter.CALLBACK_FLAG_PERFORM_ACTIVE_SCAN)
    discovering = true
    publish()
  }

  fun stopDiscovery() = main.post {
    if (discovering) router?.removeCallback(routes)
    discovering = false
  }

  private fun castRoutes(): List<MediaRouter.RouteInfo> =
    router?.routes?.filter { !it.isDefault && it.isEnabled && it.matchesSelector(selector) } ?: emptyList()

  private fun describe(route: MediaRouter.RouteInfo): Map<String, Any?> {
    val dev = CastDevice.getFromBundle(route.extras)
    val group = dev?.hasCapability(CastDevice.CAPABILITY_MULTIZONE_GROUP) == true
    val video = dev?.hasCapability(CastDevice.CAPABILITY_VIDEO_OUT) == true
    return mapOf(
      "id" to route.id,
      "name" to route.name,
      "description" to route.description,
      "model" to dev?.modelName,
      "kind" to if (group) "group" else if (video) "tv" else "speaker",
      "connecting" to route.isConnecting,
      "selected" to route.isSelected,
    )
  }

  fun devices(): List<Map<String, Any?>> = castRoutes().map { describe(it) }

  private fun publish() {
    emit?.invoke("onCastDevices", mapOf("devices" to devices()))
  }

  /* ───────────── Session ───────────── */

  private var client: RemoteMediaClient? = null

  private val status = object : RemoteMediaClient.Callback() {
    override fun onStatusUpdated() = report()
    override fun onMetadataUpdated() = report()
  }

  private val progress = RemoteMediaClient.ProgressListener { _, _ -> report() }

  private fun attach(session: CastSession) {
    detach()
    val c = session.remoteMediaClient ?: return
    c.registerCallback(status)
    c.addProgressListener(progress, 1000)
    client = c
  }

  private fun detach() {
    client?.unregisterCallback(status)
    client?.removeProgressListener(progress)
    client = null
  }

  private fun session(): CastSession? = cast?.sessionManager?.currentCastSession

  private val sessions = object : SessionManagerListener<CastSession> {
    override fun onSessionStarting(s: CastSession) = emitSession("connecting", s)
    override fun onSessionStarted(s: CastSession, id: String) {
      attach(s)
      emitSession("connected", s)
    }
    override fun onSessionStartFailed(s: CastSession, error: Int) = emitSession("failed", s, "Couldn't connect (error $error)")
    override fun onSessionEnding(s: CastSession) {}
    override fun onSessionEnded(s: CastSession, error: Int) {
      detach()
      emitSession("ended", s, if (error != 0) "Disconnected (error $error)" else null)
    }
    override fun onSessionResuming(s: CastSession, id: String) {}
    override fun onSessionResumed(s: CastSession, wasSuspended: Boolean) {
      attach(s)
      emitSession("connected", s)
    }
    override fun onSessionResumeFailed(s: CastSession, error: Int) = emitSession("failed", s, "Couldn't reconnect (error $error)")
    override fun onSessionSuspended(s: CastSession, reason: Int) = emitSession("suspended", s)
  }

  private fun emitSession(state: String, s: CastSession, error: String? = null) {
    emit?.invoke("onCastSession", mapOf("state" to state, "name" to s.castDevice?.friendlyName, "error" to error))
  }

  private fun report() {
    val c = client ?: return
    val st = c.mediaStatus
    val state = when (st?.playerState) {
      MediaStatus.PLAYER_STATE_PLAYING -> "playing"
      MediaStatus.PLAYER_STATE_PAUSED -> "paused"
      MediaStatus.PLAYER_STATE_BUFFERING, MediaStatus.PLAYER_STATE_LOADING -> "buffering"
      MediaStatus.PLAYER_STATE_IDLE -> "idle"
      else -> "unknown"
    }
    val idle = when (st?.idleReason) {
      MediaStatus.IDLE_REASON_FINISHED -> "finished"
      MediaStatus.IDLE_REASON_ERROR -> "error"
      MediaStatus.IDLE_REASON_CANCELED -> "canceled"
      MediaStatus.IDLE_REASON_INTERRUPTED -> "interrupted"
      else -> null
    }
    emit?.invoke(
      "onCastStatus",
      mapOf(
        "state" to state,
        "idleReason" to idle,
        "position" to c.approximateStreamPosition / 1000.0,
        "duration" to c.streamDuration / 1000.0,
        "volume" to (session()?.volume ?: -1.0),
        "contentId" to c.mediaInfo?.contentId,
      ),
    )
  }

  fun connect(id: String, done: (String?) -> Unit) = main.post {
    val r = router ?: return@post done("Google Cast isn't ready")
    val route = castRoutes().firstOrNull { it.id == id } ?: return@post done("That device isn't available any more")
    val current = session()
    if (route.isSelected && current != null && current.isConnected) {
      attach(current)
      emitSession("connected", current)
      return@post done(null)
    }
    r.selectRoute(route)
    done(null)
  }

  fun disconnect() = main.post {
    detach()
    try {
      cast?.sessionManager?.endCurrentSession(true)
    } catch (e: Exception) {
      // already gone
    }
  }

  fun load(o: Map<String, Any?>, done: (String?) -> Unit) = main.post {
    val c = session()?.remoteMediaClient ?: return@post done("Not connected to a Cast device")
    val url = o["url"] as? String ?: return@post done("No URL")
    val md = MediaMetadata(MediaMetadata.MEDIA_TYPE_MUSIC_TRACK).apply {
      (o["title"] as? String)?.let { putString(MediaMetadata.KEY_TITLE, it) }
      (o["artist"] as? String)?.let { putString(MediaMetadata.KEY_ARTIST, it) }
      (o["album"] as? String)?.let { putString(MediaMetadata.KEY_ALBUM_TITLE, it) }
      (o["art"] as? String)?.let { addImage(WebImage(Uri.parse(it))) }
    }
    val duration = (o["duration"] as? Number)?.toDouble() ?: 0.0
    val info = MediaInfo.Builder(url)
      .setStreamType(MediaInfo.STREAM_TYPE_BUFFERED)
      .setContentType(o["mime"] as? String ?: "audio/mpeg")
      .setMetadata(md)
      .apply { if (duration > 0) setStreamDuration((duration * 1000).toLong()) }
      .build()
    val req = MediaLoadRequestData.Builder()
      .setMediaInfo(info)
      .setAutoplay(o["autoplay"] as? Boolean ?: true)
      .setCurrentTime((((o["startAt"] as? Number)?.toDouble() ?: 0.0) * 1000).toLong())
      .build()
    c.load(req).setResultCallback { r ->
      if (r.status.isSuccess) done(null) else done(r.status.statusMessage ?: "The Cast device couldn't play this file (${r.status.statusCode})")
    }
  }

  fun play() = main.post { client?.play() }
  fun pause() = main.post { client?.pause() }
  fun seek(sec: Double) = main.post { client?.seek(MediaSeekOptions.Builder().setPosition((sec * 1000).toLong()).build()) }
  fun stop() = main.post { client?.stop() }

  fun setVolume(v: Double) = main.post {
    try {
      session()?.volume = v.coerceIn(0.0, 1.0)
    } catch (e: Exception) {
      // device refused
    }
  }
}
