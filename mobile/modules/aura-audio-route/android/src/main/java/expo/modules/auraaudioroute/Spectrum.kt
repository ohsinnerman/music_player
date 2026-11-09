package expo.modules.auraaudioroute

import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.log10
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.sin

/**
 * "Is this lossless file really lossless?" — pure Kotlin, unit-tested on a JVM.
 *
 * Lossy encoders (MP3, AAC, Vorbis) throw away everything above a cut-off
 * (~16 kHz at 128 kbps, ~19–20 kHz at 192–320 kbps) with a steep "brick wall".
 * A FLAC made from an MP3 keeps that hole. Likewise a "Hi-Res" 96 kHz file
 * made from a CD has nothing above 22.05 kHz, and a "24-bit" file padded from
 * 16-bit has its lowest 8 bits always zero.
 *
 * We average the power spectrum of a few seconds from several points in the
 * song, find the highest frequency that still carries music, and judge how
 * sharp the edge is.
 */
class SpectrumAnalyzer(private val sampleRate: Int, private val n: Int = 8192) {
  private val window = FloatArray(n) { (0.5 - 0.5 * cos(2 * PI * it / (n - 1))).toFloat() }
  private val power = DoubleArray(n / 2 + 1)
  private val re = DoubleArray(n)
  private val im = DoubleArray(n)
  private val pending = FloatArray(n)
  private var fill = 0
  private var frames = 0

  // 24-bit padding check (only meaningful when samples arrive as float or ≥24-bit ints).
  private var nonZero = 0L
  private var low8Zero = 0L

  /** Interleaved samples in [-1, 1]. `fine` = samples have ≥ 24-bit precision (float decode). */
  fun add(buf: FloatArray, frameCount: Int, channels: Int, fine: Boolean) {
    for (f in 0 until frameCount) {
      var s = 0f
      for (c in 0 until channels) {
        val v = buf[f * channels + c]
        s += v
        if (fine && v != 0f) {
          nonZero++
          val x = v * 8388608.0
          val r = Math.round(x)
          if (abs(x - r) < 1e-3 && r % 256 == 0L) low8Zero++
        }
      }
      pending[fill++] = s / channels
      if (fill == n) {
        transform()
        // 50% overlap.
        System.arraycopy(pending, n / 2, pending, 0, n / 2)
        fill = n / 2
      }
    }
  }

  /** Forget a partial window (call between separate excerpts). */
  fun breakSegment() {
    fill = 0
  }

  private fun transform() {
    for (i in 0 until n) {
      re[i] = (pending[i] * window[i]).toDouble()
      im[i] = 0.0
    }
    fft(re, im)
    for (k in 0..n / 2) power[k] += re[k] * re[k] + im[k] * im[k]
    frames++
  }

  data class Result(
    val sampleRate: Int,
    /** Highest frequency with musical content (Hz). */
    val cutoffHz: Int,
    /** dB drop across the cut-off; > ~25 dB within ~1 kHz is a lossy encoder's brick wall. */
    val edgeDb: Double,
    val sharp: Boolean,
    /** 24-bit file whose lowest 8 bits are always zero (padded 16-bit). */
    val padded16: Boolean?,
    /** Band levels (dB, 0 = loudest band) every [bandHz] Hz up to Nyquist, for a little graph. */
    val bands: DoubleArray,
    val bandHz: Int,
    /** 'genuine' | 'lossy' | 'suspect' | 'upsampled' | 'unsure' | 'silent' */
    val verdict: String,
    /** Typical lossy source for this cut-off, e.g. "~128 kbps MP3". */
    val likelySource: String?,
  )

  fun result(): Result {
    val nyq = sampleRate / 2
    val bandHz = 250
    val nb = nyq / bandHz
    val binHz = sampleRate.toDouble() / n
    val bands = DoubleArray(nb)
    for (b in 0 until nb) {
      val k0 = max(1, (b * bandHz / binHz).toInt())
      val k1 = min(n / 2, ((b + 1) * bandHz / binHz).toInt())
      var sum = 0.0
      var cnt = 0
      for (k in k0 until max(k0 + 1, k1)) {
        sum += power[k]
        cnt++
      }
      bands[b] = 10 * log10(sum / max(1, cnt) / max(1, frames) + 1e-30)
    }
    val top = bands.maxOrNull() ?: -300.0
    for (b in bands.indices) bands[b] -= top
    val padded = if (nonZero > 10_000) low8Zero > nonZero * 0.999 else null
    if (frames == 0 || top < -250) return Result(sampleRate, 0, 0.0, false, padded, bands, bandHz, "silent", null)

    // Music level: median of 1–8 kHz bands. Floor: the quietest band above 2 kHz —
    // a lossy hole sits 60–100 dB below the music; real recordings never go that low.
    val mid = bands.slice((1000 / bandHz) until min(nb, 8000 / bandHz)).sorted()
    val ref = if (mid.isNotEmpty()) mid[mid.size / 2] else 0.0
    val floor = bands.drop(2000 / bandHz).minOrNull() ?: ref
    val threshold = if (floor > ref - 60) floor - 1 else max(ref - 55, floor + 12)
    // Highest band clearly above the floor, ignoring isolated spikes (needs 2 of 3 neighbours).
    var cut = 0
    for (b in nb - 1 downTo 2) {
      val above = (b - 2..b).count { bands[it] > threshold }
      if (above >= 2) {
        cut = b
        break
      }
    }
    val cutoffHz = (cut + 1) * bandHz
    val below = bands.slice(max(0, cut - 4)..cut).average()
    val after = bands.slice(min(nb - 1, cut + 1)..min(nb - 1, cut + 5)).average()
    val edge = if (cut >= nb - 2) 0.0 else below - after
    val sharp = edge > 25

    val nearTop = cutoffHz >= nyq - 1200
    // LAME's low-pass per bitrate (AAC encoders are similar).
    val source = when {
      cutoffHz < 12000 -> "~64 kbps or lower"
      cutoffHz < 16600 -> "~96–112 kbps"
      cutoffHz < 17300 -> "~128 kbps"
      cutoffHz < 18200 -> "~160 kbps"
      cutoffHz < 19000 -> "~192 kbps"
      cutoffHz < 19600 -> "~224 kbps"
      cutoffHz < 20200 -> "~256 kbps"
      cutoffHz < 21000 -> "~320 kbps"
      else -> null
    }
    val verdict = when {
      sampleRate > 48000 && cutoffHz <= 24500 && cutoffHz < 20800 && sharp -> "lossy"
      sampleRate > 48000 && cutoffHz <= 24500 -> "upsampled"
      sampleRate > 48000 -> "genuine"
      nearTop || cutoffHz >= 21000 -> "genuine"
      sharp && cutoffHz < 19600 -> "lossy"
      sharp -> "suspect"
      else -> "unsure"
    }
    return Result(sampleRate, cutoffHz, (edge * 10).roundToInt() / 10.0, sharp, padded, bands, bandHz, verdict, if (verdict == "lossy" || verdict == "suspect") source else null)
  }

  companion object {
    /** In-place iterative radix-2 FFT. */
    fun fft(re: DoubleArray, im: DoubleArray) {
      val n = re.size
      var j = 0
      for (i in 1 until n) {
        var bit = n shr 1
        while (j and bit != 0) {
          j = j xor bit
          bit = bit shr 1
        }
        j = j xor bit
        if (i < j) {
          var t = re[i]; re[i] = re[j]; re[j] = t
          t = im[i]; im[i] = im[j]; im[j] = t
        }
      }
      var len = 2
      while (len <= n) {
        val ang = -2 * PI / len
        val wr = cos(ang)
        val wi = sin(ang)
        var i = 0
        while (i < n) {
          var cr = 1.0
          var ci = 0.0
          for (k in 0 until len / 2) {
            val a = i + k
            val b = a + len / 2
            val xr = re[b] * cr - im[b] * ci
            val xi = re[b] * ci + im[b] * cr
            re[b] = re[a] - xr
            im[b] = im[a] - xi
            re[a] += xr
            im[a] += xi
            val nr = cr * wr - ci * wi
            ci = cr * wi + ci * wr
            cr = nr
          }
          i += len
        }
        len = len shl 1
      }
    }
  }
}
