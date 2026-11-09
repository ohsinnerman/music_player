package expo.modules.auraaudioroute

import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * The signal processing behind Aura's sound settings. Pure Kotlin (no Android
 * or Media3 types) so it is unit-tested on a desktop JVM.
 *
 * Everything runs in 32-bit float with 64-bit filter state: a 24-bit sample
 * survives the trip unchanged when nothing is applied (float has a 24-bit
 * mantissa), and EQ / gain add no audible noise.
 */

/** Sample formats we read (Media3 C.ENCODING_* values, duplicated to keep this file Media3-free). */
object Pcm {
  const val PCM_8 = 3
  const val PCM_16 = 2
  const val PCM_24 = 0x15 // C.ENCODING_PCM_24BIT
  const val PCM_32 = 0x16 // C.ENCODING_PCM_32BIT
  const val FLOAT = 4
  const val PCM_16_BE = 0x10000000
  const val PCM_24_BE = 0x50000000
  const val PCM_32_BE = 0x60000000

  fun bytesPerSample(enc: Int): Int = when (enc) {
    PCM_8 -> 1
    PCM_16, PCM_16_BE -> 2
    PCM_24, PCM_24_BE -> 3
    PCM_32, PCM_32_BE, FLOAT -> 4
    else -> 0
  }

  fun supported(enc: Int) = bytesPerSample(enc) > 0

  fun bits(enc: Int): Int = when (enc) {
    PCM_8 -> 8
    PCM_16, PCM_16_BE -> 16
    PCM_24, PCM_24_BE -> 24
    PCM_32, PCM_32_BE -> 32
    FLOAT -> 32
    else -> 0
  }

  fun name(enc: Int): String = when (enc) {
    PCM_8 -> "pcm8"
    PCM_16, PCM_16_BE -> "pcm16"
    PCM_24, PCM_24_BE -> "pcm24"
    PCM_32, PCM_32_BE -> "pcm32"
    FLOAT -> "float"
    else -> "enc$enc"
  }

  /** Read every sample left in [src] into [dst] as float in [-1, 1). Returns the sample count. */
  fun read(src: ByteBuffer, enc: Int, dst: FloatArray): Int {
    val b = src.duplicate().order(if (enc == PCM_16_BE || enc == PCM_24_BE || enc == PCM_32_BE) ByteOrder.BIG_ENDIAN else ByteOrder.LITTLE_ENDIAN)
    val n = b.remaining() / bytesPerSample(enc)
    when (enc) {
      FLOAT -> b.asFloatBuffer().get(dst, 0, n)
      PCM_16, PCM_16_BE -> {
        val s = b.asShortBuffer()
        for (i in 0 until n) dst[i] = s.get(i) / 32768f
      }
      PCM_32, PCM_32_BE -> {
        val s = b.asIntBuffer()
        for (i in 0 until n) dst[i] = (s.get(i) / 2147483648.0).toFloat()
      }
      PCM_24 -> {
        var p = b.position()
        for (i in 0 until n) {
          val v = (b.get(p).toInt() and 0xff) or ((b.get(p + 1).toInt() and 0xff) shl 8) or (b.get(p + 2).toInt() shl 16)
          dst[i] = v / 8388608f
          p += 3
        }
      }
      PCM_24_BE -> {
        var p = b.position()
        for (i in 0 until n) {
          val v = (b.get(p).toInt() shl 16) or ((b.get(p + 1).toInt() and 0xff) shl 8) or (b.get(p + 2).toInt() and 0xff)
          dst[i] = v / 8388608f
          p += 3
        }
      }
      PCM_8 -> {
        var p = b.position()
        for (i in 0 until n) {
          dst[i] = ((b.get(p).toInt() and 0xff) - 128) / 128f
          p++
        }
      }
    }
    src.position(src.position() + n * bytesPerSample(enc))
    return n
  }
}

/**
 * Surround → stereo (ITU-R BS.775 coefficients: centre and surrounds at −3 dB,
 * LFE dropped), normalised so a full-scale mix can't clip. Channel orders are
 * Android's (what Media3 decoders output).
 */
object Downmix {
  private const val C = 0.70710677f

  /** [L-from-each-input, R-from-each-input] for an input channel count, or null if it's already ≤ 2. */
  fun matrix(channels: Int): Array<FloatArray>? {
    val l: FloatArray
    val r: FloatArray
    when (channels) {
      3 -> { // FL FR FC
        l = floatArrayOf(1f, 0f, C); r = floatArrayOf(0f, 1f, C)
      }
      4 -> { // FL FR BL BR
        l = floatArrayOf(1f, 0f, C, 0f); r = floatArrayOf(0f, 1f, 0f, C)
      }
      5 -> { // FL FR FC BL BR
        l = floatArrayOf(1f, 0f, C, C, 0f); r = floatArrayOf(0f, 1f, C, 0f, C)
      }
      6 -> { // FL FR FC LFE BL BR
        l = floatArrayOf(1f, 0f, C, 0f, C, 0f); r = floatArrayOf(0f, 1f, C, 0f, 0f, C)
      }
      7 -> { // FL FR FC LFE BL BR BC
        l = floatArrayOf(1f, 0f, C, 0f, C, 0f, 0.5f); r = floatArrayOf(0f, 1f, C, 0f, 0f, C, 0.5f)
      }
      8 -> { // FL FR FC LFE BL BR SL SR
        l = floatArrayOf(1f, 0f, C, 0f, C, 0f, C, 0f); r = floatArrayOf(0f, 1f, C, 0f, 0f, C, 0f, C)
      }
      else -> return null
    }
    val norm = 1f / max(l.sum(), r.sum())
    for (i in l.indices) {
      l[i] *= norm
      r[i] *= norm
    }
    return arrayOf(l, r)
  }

  /** Mix [frames] frames of [inCh]-channel audio in [src] to stereo in [dst]. */
  fun apply(m: Array<FloatArray>, src: FloatArray, inCh: Int, frames: Int, dst: FloatArray) {
    val l = m[0]
    val r = m[1]
    for (f in 0 until frames) {
      var a = 0f
      var b = 0f
      val o = f * inCh
      for (c in 0 until inCh) {
        val s = src[o + c]
        a += l[c] * s
        b += r[c] * s
      }
      dst[f * 2] = a
      dst[f * 2 + 1] = b
    }
  }
}

/** One EQ band. Types match AutoEq's: PK (peaking), LSC (low shelf), HSC (high shelf). */
data class EqFilter(val type: Int, val fc: Double, val gainDb: Double, val q: Double) {
  companion object {
    const val PEAK = 0
    const val LOW_SHELF = 1
    const val HIGH_SHELF = 2
  }
}

/** Biquad coefficients (RBJ Audio EQ Cookbook), normalised so a0 = 1. */
class Biquad(val b0: Double, val b1: Double, val b2: Double, val a1: Double, val a2: Double) {
  companion object {
    fun design(f: EqFilter, sampleRate: Int): Biquad? {
      if (abs(f.gainDb) < 0.01 || f.fc <= 0 || f.fc >= sampleRate / 2.0 || f.q <= 0) return null
      val a = 10.0.pow(f.gainDb / 40)
      val w = 2 * PI * f.fc / sampleRate
      val cw = cos(w)
      val alpha = sin(w) / (2 * f.q)
      val (b0, b1, b2, a0, a1, a2) = when (f.type) {
        EqFilter.LOW_SHELF -> {
          val s = 2 * sqrt(a) * alpha
          Six(
            a * ((a + 1) - (a - 1) * cw + s),
            2 * a * ((a - 1) - (a + 1) * cw),
            a * ((a + 1) - (a - 1) * cw - s),
            (a + 1) + (a - 1) * cw + s,
            -2 * ((a - 1) + (a + 1) * cw),
            (a + 1) + (a - 1) * cw - s,
          )
        }
        EqFilter.HIGH_SHELF -> {
          val s = 2 * sqrt(a) * alpha
          Six(
            a * ((a + 1) + (a - 1) * cw + s),
            -2 * a * ((a - 1) + (a + 1) * cw),
            a * ((a + 1) + (a - 1) * cw - s),
            (a + 1) - (a - 1) * cw + s,
            2 * ((a - 1) - (a + 1) * cw),
            (a + 1) - (a - 1) * cw - s,
          )
        }
        else -> Six(1 + alpha * a, -2 * cw, 1 - alpha * a, 1 + alpha / a, -2 * cw, 1 - alpha / a)
      }
      return Biquad(b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0)
    }
  }

  private data class Six(val a: Double, val b: Double, val c: Double, val d: Double, val e: Double, val f: Double)
}

/** ReplayGain values read from a file's tags (Vorbis comments, ID3 TXXX, MP4 ----). */
data class ReplayGain(val trackGain: Double?, val trackPeak: Double?, val albumGain: Double?, val albumPeak: Double?) {
  companion object {
    val NONE = ReplayGain(null, null, null, null)

    private fun num(s: String?): Double? = s?.trim()?.let { Regex("^[+-]?\\d+(?:[.,]\\d+)?").find(it)?.value?.replace(',', '.')?.toDoubleOrNull() }

    /** From tag key → value pairs (keys any case). Opus R128 gains are Q7.8 relative to −23 LUFS. */
    fun from(tags: Map<String, String>): ReplayGain {
      val t = tags.mapKeys { it.key.uppercase() }
      var tg = num(t["REPLAYGAIN_TRACK_GAIN"])
      var ag = num(t["REPLAYGAIN_ALBUM_GAIN"])
      if (tg == null) num(t["R128_TRACK_GAIN"])?.let { tg = it / 256.0 + 5.0 }
      if (ag == null) num(t["R128_ALBUM_GAIN"])?.let { ag = it / 256.0 + 5.0 }
      val tp = num(t["REPLAYGAIN_TRACK_PEAK"])?.takeIf { it > 0 }
      val ap = num(t["REPLAYGAIN_ALBUM_PEAK"])?.takeIf { it > 0 }
      fun sane(g: Double?) = g?.takeIf { it > -60 && it < 30 }
      return ReplayGain(sane(tg), tp, sane(ag), ap)
    }
  }
}

/** User settings, pushed from JS. */
data class SoundConfig(
  /** 0 = off, 1 = track, 2 = album (falls back to track). */
  val replayGain: Int = 0,
  val preampDb: Double = 0.0,
  /** Applied when ReplayGain is on but the song has no tags. */
  val noTagDb: Double = 0.0,
  val preventClip: Boolean = true,
  val downmix: Boolean = true,
  val eqEnabled: Boolean = false,
  val eqPreampDb: Double = 0.0,
  val filters: List<EqFilter> = emptyList(),
  val bitPerfect: Boolean = false,
)

/** Gain to apply for a song, in dB, and where it came from. */
fun replayGainDb(cfg: SoundConfig, rg: ReplayGain): Pair<Double, String> {
  if (cfg.replayGain == 0) return 0.0 to "off"
  val album = cfg.replayGain == 2 && rg.albumGain != null
  val gain = if (album) rg.albumGain else rg.trackGain
  if (gain == null) return cfg.noTagDb to "none"
  var db = gain + cfg.preampDb
  val peak = if (album) rg.albumPeak ?: rg.trackPeak else rg.trackPeak
  if (cfg.preventClip && peak != null) db = min(db, -20 * kotlin.math.log10(peak))
  return db to (if (album) "album" else "track")
}

/**
 * Gain + EQ over interleaved float audio. Coefficients are rebuilt when the
 * settings or sample rate change; filter memory survives so changes are
 * click-free.
 */
class Processor {
  private var rate = 0
  private var channels = 0
  private var key: Any? = null
  private var biquads: Array<Biquad> = emptyArray()
  private var z1 = DoubleArray(0)
  private var z2 = DoubleArray(0)

  val activeFilters get() = biquads.size

  fun prepare(cfg: SoundConfig, sampleRate: Int, ch: Int) {
    val k = Triple(if (cfg.eqEnabled) cfg.filters else null, sampleRate, ch)
    if (k == key) return
    key = k
    val old = biquads.size
    biquads = if (cfg.eqEnabled) cfg.filters.mapNotNull { Biquad.design(it, sampleRate) }.toTypedArray() else emptyArray()
    if (sampleRate != rate || ch != channels || biquads.size != old) {
      z1 = DoubleArray(biquads.size * ch)
      z2 = DoubleArray(biquads.size * ch)
    }
    rate = sampleRate
    channels = ch
  }

  fun reset() {
    z1.fill(0.0)
    z2.fill(0.0)
  }

  /** In place over [frames] frames. [gain] is linear. */
  fun process(buf: FloatArray, frames: Int, gain: Float) {
    val ch = channels
    val n = biquads.size
    if (n == 0) {
      if (gain != 1f) for (i in 0 until frames * ch) buf[i] = clamp(buf[i] * gain)
      return
    }
    for (f in 0 until frames) {
      for (c in 0 until ch) {
        val i = f * ch + c
        var x = (buf[i] * gain).toDouble()
        for (k in 0 until n) {
          val q = biquads[k]
          val s = k * ch + c
          val y = q.b0 * x + z1[s]
          z1[s] = q.b1 * x - q.a1 * y + z2[s]
          z2[s] = q.b2 * x - q.a2 * y
          x = y
        }
        buf[i] = clamp(x.toFloat())
      }
    }
  }

  private fun clamp(v: Float) = if (v > 1f) 1f else if (v < -1f) -1f else v
}

fun dbToGain(db: Double): Float = 10.0.pow(db / 20).toFloat()
