package expo.modules.auraaudioroute

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioDeviceInfo
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioMixerAttributes
import android.os.Build
import androidx.annotation.OptIn
import androidx.annotation.RequiresApi
import androidx.media3.common.C
import androidx.media3.common.Format
import androidx.media3.common.Metadata
import androidx.media3.common.MimeTypes
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.DefaultRenderersFactory
import androidx.media3.exoplayer.RenderersFactory
import androidx.media3.exoplayer.audio.AudioOutput
import androidx.media3.exoplayer.audio.AudioOutputProvider
import androidx.media3.exoplayer.audio.AudioSink
import androidx.media3.exoplayer.audio.AudioTrackAudioOutputProvider
import androidx.media3.exoplayer.audio.DefaultAudioSink
import androidx.media3.exoplayer.audio.ForwardingAudioOutput
import androidx.media3.exoplayer.audio.ForwardingAudioOutputProvider
import androidx.media3.exoplayer.audio.ForwardingAudioSink
import androidx.media3.extractor.metadata.id3.InternalFrame
import androidx.media3.extractor.metadata.id3.TextInformationFrame
import java.nio.ByteBuffer
import java.nio.ByteOrder

/**
 * Aura's audio output for expo-audio's ExoPlayer (hooked in by
 * `scripts/patch-expo-audio.js`, which loads [renderersFactory] by reflection):
 *
 *   decoder (float, all channels) ─► [AuraAudioSink: convert → downmix → ReplayGain → EQ]
 *     ─► DefaultAudioSink (float output) ─► [AuraOutputProvider: bit-perfect USB] ─► AudioTrack
 *
 * Stock Media3 would decode to 16-bit, and its float path skips audio
 * processors entirely; doing the processing here in float keeps 24-bit files
 * at full resolution *and* allows EQ.
 */
@OptIn(markerClass = [UnstableApi::class])
object AuraDsp {
  @Volatile
  var config = SoundConfig()
    private set

  /** What's happening right now, for the Audio quality sheet. */
  @Volatile
  var state: Map<String, Any?> = mapOf("active" to false)
    internal set

  @Volatile
  internal var bitPerfect: Map<String, Any?> = mapOf("state" to "off")

  @Volatile
  internal var appContext: Context? = null

  fun update(cfg: SoundConfig) {
    val wasBitPerfect = config.bitPerfect
    config = cfg
    if (wasBitPerfect && !cfg.bitPerfect) appContext?.let { BitPerfect.clear(it) }
  }

  /** Called by the patched expo-audio for every player it builds. */
  /** True once the patched expo-audio has built a player with our output stage. */
  @Volatile
  var hooked = false
    private set

  @JvmStatic
  fun renderersFactory(context: Context): RenderersFactory {
    hooked = true
    appContext = context.applicationContext
    return AuraRenderersFactory(context.applicationContext)
  }

  /** Effective settings: bit-perfect playback means "don't touch the samples". */
  internal fun effective(): SoundConfig {
    val c = config
    return if (c.bitPerfect && (BitPerfect.engaged || BitPerfect.expected)) c.copy(replayGain = 0, eqEnabled = false) else c
  }
}

@OptIn(markerClass = [UnstableApi::class])
private class AuraRenderersFactory(context: Context) : DefaultRenderersFactory(context) {
  init {
    setEnableDecoderFallback(true)
  }

  override fun buildAudioSink(context: Context, enableFloatOutput: Boolean, enableAudioOutputPlaybackParams: Boolean): AudioSink {
    val output = AuraOutputProvider(context, AudioTrackAudioOutputProvider.Builder(context).build())
    val sink = DefaultAudioSink.Builder(context)
      .setEnableFloatOutput(true)
      .setEnableAudioOutputPlaybackParameters(enableAudioOutputPlaybackParams)
      .setAudioOutputProvider(output)
      .build()
    return AuraAudioSink(sink, context)
  }
}

/** Converts every PCM stream to float, then downmix / ReplayGain / EQ, before the stock sink. */
@OptIn(markerClass = [UnstableApi::class])
private class AuraAudioSink(private val sink: AudioSink, private val context: Context) : ForwardingAudioSink(sink) {
  private var active = false
  private var inEnc = 0
  private var inCh = 0
  private var map: IntArray? = null
  private var outCh = 0
  private var rate = 0
  private var downmix: Array<FloatArray>? = null
  private var rg = ReplayGain.NONE
  private val proc = Processor()

  private var samples = FloatArray(0)
  private var mapped = FloatArray(0)
  private var mixed = FloatArray(0)
  private var out: ByteBuffer = ByteBuffer.allocateDirect(0)
  private var pending: ByteBuffer? = null
  private var pendingSource: ByteBuffer? = null

  private fun canProcess(f: Format) =
    MimeTypes.AUDIO_RAW == f.sampleMimeType && Pcm.supported(f.pcmEncoding) && f.channelCount in 1..8

  private fun channelsOut(ch: Int) = if (AuraDsp.config.downmix && ch > 2 && Downmix.matrix(ch) != null) 2 else ch

  private fun processed(f: Format, ch: Int = f.channelCount) =
    f.buildUpon().setPcmEncoding(C.ENCODING_PCM_FLOAT).setChannelCount(channelsOut(ch)).build()

  override fun supportsFormat(format: Format) = getFormatSupport(format) != AudioSink.SINK_FORMAT_UNSUPPORTED

  override fun getFormatSupport(format: Format): Int {
    if (!canProcess(format)) return super.getFormatSupport(format)
    // Saying "directly" for float makes the decoder output float (full 24-bit) instead of 16-bit.
    return if (super.getFormatSupport(processed(format)) != AudioSink.SINK_FORMAT_UNSUPPORTED) {
      AudioSink.SINK_FORMAT_SUPPORTED_DIRECTLY
    } else {
      super.getFormatSupport(format)
    }
  }

  override fun configure(inputFormat: Format, specifiedBufferSize: Int, outputChannels: IntArray?) {
    pending = null
    pendingSource = null
    if (!canProcess(inputFormat)) {
      active = false
      AuraDsp.state = mapOf("active" to false, "reason" to (inputFormat.sampleMimeType ?: "unknown"))
      super.configure(inputFormat, specifiedBufferSize, outputChannels)
      return
    }
    active = true
    inEnc = inputFormat.pcmEncoding
    inCh = inputFormat.channelCount
    map = outputChannels?.takeIf { m -> m.isNotEmpty() && m.all { it in 0 until inCh } && !(m.size == inCh && m.indices.all { m[it] == it }) }
    val ch = map?.size ?: inCh
    outCh = channelsOut(ch)
    downmix = if (outCh != ch) Downmix.matrix(ch) else null
    rate = inputFormat.sampleRate
    rg = ReplayGain.from(tags(inputFormat.metadata))
    if (AuraDsp.config.bitPerfect && Build.VERSION.SDK_INT >= 34) BitPerfect.probe(context)
    proc.prepare(AuraDsp.effective(), rate, outCh)
    super.configure(processed(inputFormat, ch), specifiedBufferSize, null)
    publish()
  }

  private fun publish() {
    val cfg = AuraDsp.effective()
    val (db, source) = replayGainDb(cfg, rg)
    AuraDsp.state = mapOf(
      "active" to true,
      "inputEncoding" to Pcm.name(inEnc),
      "inputBits" to Pcm.bits(inEnc),
      "inputChannels" to (map?.size ?: inCh),
      "outputChannels" to outCh,
      "sampleRate" to rate,
      "downmixed" to (downmix != null),
      "replayGain" to mapOf(
        "mode" to cfg.replayGain,
        "source" to source,
        "gainDb" to db,
        "trackGain" to rg.trackGain,
        "albumGain" to rg.albumGain,
      ),
      "eqFilters" to proc.activeFilters,
      "bitPerfect" to AuraDsp.bitPerfect,
    )
  }

  private var lastKey: Any? = null

  override fun handleBuffer(buffer: ByteBuffer, presentationTimeUs: Long, encodedAccessUnitCount: Int): Boolean {
    if (!active) return super.handleBuffer(buffer, presentationTimeUs, encodedAccessUnitCount)
    if (pending == null || pendingSource !== buffer) {
      pending = convert(buffer)
      pendingSource = buffer
    }
    val done = super.handleBuffer(pending!!, presentationTimeUs, encodedAccessUnitCount)
    if (done) {
      pending = null
      pendingSource = null
    }
    return done
  }

  private fun convert(buffer: ByteBuffer): ByteBuffer {
    val cfg = AuraDsp.effective()
    val key = Triple(cfg, rg, AuraDsp.bitPerfect)
    if (key != lastKey) {
      lastKey = key
      proc.prepare(cfg, rate, outCh)
      publish()
    }
    val total = buffer.remaining() / Pcm.bytesPerSample(inEnc)
    if (samples.size < total) samples = FloatArray(total)
    Pcm.read(buffer, inEnc, samples)
    val frames = total / inCh
    var data = samples
    var ch = inCh
    map?.let { m ->
      val n = frames * m.size
      if (mapped.size < n) mapped = FloatArray(n)
      for (f in 0 until frames) for (c in m.indices) mapped[f * m.size + c] = samples[f * inCh + m[c]]
      data = mapped
      ch = m.size
    }
    downmix?.let { m ->
      val n = frames * 2
      if (mixed.size < n) mixed = FloatArray(n)
      Downmix.apply(m, data, ch, frames, mixed)
      data = mixed
      ch = 2
    }
    val (db, _) = replayGainDb(cfg, rg)
    val gain = dbToGain(db + if (cfg.eqEnabled) cfg.eqPreampDb else 0.0)
    proc.process(data, frames, gain)

    val bytes = frames * ch * 4
    if (out.capacity() < bytes) out = ByteBuffer.allocateDirect(bytes * 2).order(ByteOrder.nativeOrder())
    out.clear()
    out.asFloatBuffer().put(data, 0, frames * ch)
    out.limit(bytes)
    return out
  }

  override fun flush() {
    pending = null
    pendingSource = null
    proc.reset()
    super.flush()
  }

  override fun reset() {
    pending = null
    pendingSource = null
    proc.reset()
    super.reset()
  }

  companion object {
    @Suppress("DEPRECATION")
    fun tags(md: Metadata?): Map<String, String> {
      val out = HashMap<String, String>()
      if (md == null) return out
      for (i in 0 until md.length()) {
        when (val e = md.get(i)) {
          is androidx.media3.extractor.metadata.flac.VorbisComment -> out[e.key] = e.value
          is TextInformationFrame -> if (e.id == "TXXX" && e.description != null) e.values.firstOrNull()?.let { out[e.description!!] = it }
          is InternalFrame -> out[e.description] = e.text
        }
      }
      return out
    }
  }
}

/**
 * Bit-perfect USB (Android 14+): asks Android to open the USB DAC at the song's
 * own rate and format with its mixer bypassed (`setPreferredMixerAttributes`).
 * DefaultAudioSink only writes 16-bit or float; when the DAC's bit-perfect mode
 * takes 32-bit integers instead, the track is opened as 32-bit and samples are
 * converted (exactly — same 4 bytes per sample, so timing is untouched).
 */
@OptIn(markerClass = [UnstableApi::class])
private class AuraOutputProvider(private val context: Context, base: AudioOutputProvider) : ForwardingAudioOutputProvider(base) {
  override fun getAudioOutput(config: AudioOutputProvider.OutputConfig): AudioOutput {
    val plan = if (Build.VERSION.SDK_INT >= 34) BitPerfect.prepare(context, config) else null
    if (plan == BitPerfect.Plan.INT32) {
      return FloatToInt32Output(super.getAudioOutput(config.buildUpon().setEncoding(C.ENCODING_PCM_32BIT).build()))
    }
    return super.getAudioOutput(config)
  }
}

@OptIn(markerClass = [UnstableApi::class])
private class FloatToInt32Output(out: AudioOutput) : ForwardingAudioOutput(out) {
  private var src: ByteBuffer? = null
  private var expectPos = -1
  private var conv: ByteBuffer = ByteBuffer.allocateDirect(0)

  override fun write(buffer: ByteBuffer, encodedAccessUnitCount: Int, presentationTimeUs: Long): Boolean {
    if (src !== buffer || buffer.position() != expectPos) {
      val n = buffer.remaining() / 4
      if (conv.capacity() < n * 4) conv = ByteBuffer.allocateDirect(n * 8).order(ByteOrder.nativeOrder())
      conv.clear()
      val f = buffer.duplicate().order(ByteOrder.nativeOrder()).asFloatBuffer()
      val o = conv.asIntBuffer()
      for (i in 0 until n) {
        val v = f.get(i).toDouble() * 2147483648.0
        o.put(i, if (v >= 2147483647.0) Int.MAX_VALUE else if (v <= -2147483648.0) Int.MIN_VALUE else Math.round(v).toInt())
      }
      conv.limit(n * 4)
      src = buffer
    }
    val before = conv.position()
    val done = super.write(conv, encodedAccessUnitCount, presentationTimeUs)
    buffer.position(buffer.position() + (conv.position() - before))
    expectPos = buffer.position()
    if (done) src = null
    return done
  }

  override fun flush() {
    src = null
    super.flush()
  }
}

@OptIn(markerClass = [UnstableApi::class])
internal object BitPerfect {
  enum class Plan { FLOAT, INT32, NATIVE_RATE }

  @Volatile
  var engaged = false
    private set

  /** A USB DAC offering bit-perfect playback is the current output (checked before the track opens). */
  @Volatile
  var expected = false
    private set

  @RequiresApi(34)
  fun probe(context: Context) {
    expected = try {
      val am = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
      val d = am.getAudioDevicesForAttributes(media).firstOrNull { usb(it.type) }
        ?.let { r -> am.getDevices(AudioManager.GET_DEVICES_OUTPUTS).firstOrNull { it.type == r.type } }
      d != null && am.getSupportedMixerAttributes(d).any { it.mixerBehavior == AudioMixerAttributes.MIXER_BEHAVIOR_BIT_PERFECT }
    } catch (e: Exception) {
      false
    }
  }

  private var setOn: AudioDeviceInfo? = null
  private val media: AudioAttributes = AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).build()

  private fun usb(t: Int) = t == AudioDeviceInfo.TYPE_USB_DEVICE || t == AudioDeviceInfo.TYPE_USB_HEADSET || t == AudioDeviceInfo.TYPE_USB_ACCESSORY

  @RequiresApi(34)
  fun prepare(context: Context, cfg: AudioOutputProvider.OutputConfig): Plan? {
    val am = context.getSystemService(Context.AUDIO_SERVICE) as? AudioManager ?: return null
    if (!AuraDsp.config.bitPerfect || cfg.encoding != C.ENCODING_PCM_FLOAT) {
      clear(context)
      return null
    }
    val device = try {
      am.getAudioDevicesForAttributes(media).firstOrNull { usb(it.type) }
        ?.let { r -> am.getDevices(AudioManager.GET_DEVICES_OUTPUTS).firstOrNull { it.type == r.type && it.address == r.address } ?: am.getDevices(AudioManager.GET_DEVICES_OUTPUTS).firstOrNull { usb(it.type) } }
    } catch (e: Exception) {
      null
    }
    if (device == null) {
      clear(context)
      report("no-usb", cfg, null)
      return null
    }
    val list = try {
      am.getSupportedMixerAttributes(device)
    } catch (e: Exception) {
      emptyList()
    }
    val chans = Integer.bitCount(cfg.channelMask)
    fun fits(m: AudioMixerAttributes) = m.format.sampleRate == cfg.sampleRate && Integer.bitCount(m.format.channelMask) == chans
    val perfect = list.filter { it.mixerBehavior == AudioMixerAttributes.MIXER_BEHAVIOR_BIT_PERFECT && fits(it) }
    val pick = perfect.firstOrNull { it.format.encoding == AudioFormat.ENCODING_PCM_FLOAT }
      ?: perfect.firstOrNull { it.format.encoding == AudioFormat.ENCODING_PCM_32BIT }
    if (pick != null && set(am, device, pick)) {
      engaged = true
      report("bit-perfect", cfg, device, pick)
      return if (pick.format.encoding == AudioFormat.ENCODING_PCM_32BIT) Plan.INT32 else Plan.FLOAT
    }
    // Not bit-perfect at this rate: at least open the DAC at the song's rate (no resampling).
    val rank = listOf(AudioFormat.ENCODING_PCM_FLOAT, AudioFormat.ENCODING_PCM_32BIT, AudioFormat.ENCODING_PCM_24BIT_PACKED, AudioFormat.ENCODING_PCM_16BIT)
    val native = list.filter { it.mixerBehavior == AudioMixerAttributes.MIXER_BEHAVIOR_DEFAULT && fits(it) }
      .minByOrNull { rank.indexOf(it.format.encoding).let { i -> if (i < 0) 99 else i } }
    engaged = false
    if (native != null && set(am, device, native)) {
      report("native-rate", cfg, device, native)
      return Plan.NATIVE_RATE
    }
    clear(context)
    report("unsupported-rate", cfg, device)
    return null
  }

  @RequiresApi(34)
  private fun set(am: AudioManager, device: AudioDeviceInfo, m: AudioMixerAttributes): Boolean {
    return try {
      val cur = am.getPreferredMixerAttributes(media, device)
      if (cur == m) return true
      am.setPreferredMixerAttributes(media, device, m).also { if (it) setOn = device }
    } catch (e: Exception) {
      false
    }
  }

  fun clear(context: Context) {
    engaged = false
    expected = false
    val d = setOn ?: return
    setOn = null
    if (Build.VERSION.SDK_INT >= 34) {
      try {
        (context.getSystemService(Context.AUDIO_SERVICE) as? AudioManager)?.clearPreferredMixerAttributes(media, d)
      } catch (e: Exception) {
        // device gone
      }
    }
    AuraDsp.bitPerfect = mapOf("state" to "off")
  }

  private fun report(state: String, cfg: AudioOutputProvider.OutputConfig, device: AudioDeviceInfo?, m: AudioMixerAttributes? = null) {
    AuraDsp.bitPerfect = mapOf(
      "state" to state,
      "sampleRate" to cfg.sampleRate,
      "device" to device?.productName?.toString(),
      "encoding" to m?.format?.encoding?.let {
        when (it) {
          AudioFormat.ENCODING_PCM_FLOAT -> "float"
          AudioFormat.ENCODING_PCM_32BIT -> "pcm32"
          AudioFormat.ENCODING_PCM_24BIT_PACKED -> "pcm24"
          AudioFormat.ENCODING_PCM_16BIT -> "pcm16"
          else -> "enc$it"
        }
      },
    )
  }
}
