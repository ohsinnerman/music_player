// Desktop JVM test for Dsp.kt (no Android needed):
//   kotlinc ../android/src/main/java/expo/modules/auraaudioroute/Dsp.kt DspTest.kt -include-runtime -d /tmp/dsp.jar && java -jar /tmp/dsp.jar

import expo.modules.auraaudioroute.*
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.*

fun check(c: Boolean, m: String) { if (!c) { println("FAIL: $m"); kotlin.system.exitProcess(1) } else println("ok: $m") }

/** Magnitude response of a cascade at f (dB). */
fun resp(bqs: List<Biquad>, f: Double, sr: Int): Double {
  val w = 2 * PI * f / sr
  var db = 0.0
  for (q in bqs) {
    val cr = cos(w); val ci = -sin(w); val c2r = cos(2*w); val c2i = -sin(2*w)
    val nr = q.b0 + q.b1*cr + q.b2*c2r; val ni = q.b1*ci + q.b2*c2i
    val dr = 1 + q.a1*cr + q.a2*c2r; val di = q.a1*ci + q.a2*c2i
    db += 10*log10((nr*nr+ni*ni)/(dr*dr+di*di))
  }
  return db
}

fun main() {
  // 24-bit round trip: int24 -> float -> int32 exact
  val vals = intArrayOf(0, 1, -1, 8388607, -8388608, 1234567, -7654321)
  val bb = ByteBuffer.allocate(vals.size * 3)
  for (v in vals) { bb.put((v and 0xff).toByte()); bb.put(((v shr 8) and 0xff).toByte()); bb.put(((v shr 16) and 0xff).toByte()) }
  bb.flip()
  val f = FloatArray(vals.size)
  val n = Pcm.read(bb, Pcm.PCM_24, f)
  check(n == vals.size && !bb.hasRemaining(), "reads all 24-bit samples and consumes the buffer")
  val back = f.map { Math.round(it.toDouble() * 2147483648.0).toLong() }
  check(vals.indices.all { back[it] == vals[it].toLong() shl 8 }, "24-bit -> float -> 32-bit int is exact")
  // 16-bit
  val s = ByteBuffer.allocate(6).order(ByteOrder.LITTLE_ENDIAN); s.putShort(-32768); s.putShort(32767); s.putShort(5); s.flip()
  val f16 = FloatArray(3); Pcm.read(s, Pcm.PCM_16, f16)
  check(f16[0] == -1f && abs(f16[1] - 32767/32768f) < 1e-9 && f16[2] == 5/32768f, "16-bit reads exactly")
  // Big-endian 24
  val be = ByteBuffer.wrap(byteArrayOf(0x80.toByte(), 0, 0, 0x7f, 0xff.toByte(), 0xff.toByte()))
  val fbe = FloatArray(2); Pcm.read(be, Pcm.PCM_24_BE, fbe)
  check(fbe[0] == -1f && fbe[1] == 8388607f/8388608f, "24-bit big-endian")

  // Downmix 5.1: full-scale FL+FC+BL can't clip
  val m = Downmix.matrix(6)!!
  val src = floatArrayOf(1f, 0f, 1f, 1f, 1f, 0f)
  val dst = FloatArray(2); Downmix.apply(m, src, 6, 1, dst)
  check(abs(dst[0] - 1f) < 1e-6 && abs(dst[1] - 0.70710677f * (1/(1+2*0.70710677f))) < 1e-6, "5.1 downmix normalised, LFE dropped (L=${dst[0]}, R=${dst[1]})")
  check(Downmix.matrix(2) == null && Downmix.matrix(1) == null, "no downmix for mono/stereo")

  // Biquads hit their targets
  val sr = 48000
  val pk = Biquad.design(EqFilter(EqFilter.PEAK, 1000.0, 6.0, 1.41), sr)!!
  check(abs(resp(listOf(pk), 1000.0, sr) - 6.0) < 0.01 && abs(resp(listOf(pk), 20.0, sr)) < 0.05, "peaking +6 dB at 1 kHz, flat far away")
  val ls = Biquad.design(EqFilter(EqFilter.LOW_SHELF, 105.0, 6.5, 0.7), sr)!!
  check(abs(resp(listOf(ls), 10.0, sr) - 6.5) < 0.1 && abs(resp(listOf(ls), 10000.0, sr)) < 0.05, "low shelf +6.5 dB below, flat above")
  val hs = Biquad.design(EqFilter(EqFilter.HIGH_SHELF, 10000.0, -3.1, 0.7), 192000)!!
  check(abs(resp(listOf(hs), 60000.0, 192000) + 3.1) < 0.1, "high shelf at 192 kHz")
  check(Biquad.design(EqFilter(EqFilter.PEAK, 30000.0, 3.0, 1.0), 44100) == null, "filters above Nyquist are skipped")

  // Processor: neutral = untouched; sine through +6 dB peak gains ~2x
  val p = Processor()
  val cfg = SoundConfig(eqEnabled = true, filters = listOf(EqFilter(EqFilter.PEAK, 1000.0, 6.0, 1.41)))
  p.prepare(SoundConfig(), sr, 2)
  val buf = floatArrayOf(0.1f, -0.25f, 0.5f, 0.123456f)
  val copy = buf.copyOf(); p.process(buf, 2, 1f)
  check(buf.contentEquals(copy), "no EQ, unity gain: samples untouched (bit-exact)")
  p.prepare(cfg, sr, 1)
  val N = 48000; val sine = FloatArray(N) { (0.2 * sin(2*PI*1000*it/sr)).toFloat() }
  p.process(sine, N, 1f)
  val peak = sine.drop(N/2).maxOf { abs(it) }
  check(abs(20*log10(peak/0.2) - 6.0) < 0.1, "1 kHz sine gains 6 dB through the EQ (${"%.2f".format(20*log10(peak/0.2))} dB)")
  val loud = FloatArray(4) { 0.9f }; p.prepare(SoundConfig(), sr, 1); p.process(loud, 4, 2f)
  check(loud.all { it == 1f }, "output is clamped to full scale")

  // ReplayGain
  val rg = ReplayGain.from(mapOf("replaygain_track_gain" to "-7.25 dB", "REPLAYGAIN_TRACK_PEAK" to "0.988", "REPLAYGAIN_ALBUM_GAIN" to "-6.10 dB"))
  check(rg.trackGain == -7.25 && rg.albumGain == -6.10 && rg.trackPeak == 0.988, "parses RG tags (any case)")
  val opus = ReplayGain.from(mapOf("R128_TRACK_GAIN" to "-2560"))
  check(abs(opus.trackGain!! - -5.0) < 1e-9, "Opus R128 gain → RG reference")
  check(replayGainDb(SoundConfig(replayGain = 1), rg).first == -7.25, "track mode")
  check(replayGainDb(SoundConfig(replayGain = 2), rg).first == -6.10, "album mode")
  val boost = ReplayGain.from(mapOf("REPLAYGAIN_TRACK_GAIN" to "+8 dB", "REPLAYGAIN_TRACK_PEAK" to "0.5"))
  val (db, _) = replayGainDb(SoundConfig(replayGain = 1), boost)
  check(abs(db - 20*log10(2.0)) < 1e-9, "clipping prevention caps a +8 dB boost at the peak (${"%.2f".format(db)} dB)")
  check(replayGainDb(SoundConfig(replayGain = 1, noTagDb = -3.0), ReplayGain.NONE) == (-3.0 to "none"), "no tags → fallback gain")
  println("ALL PASSED")
}
