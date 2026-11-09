package expo.modules.auraaudioroute

import android.content.Context
import android.media.AudioFormat
import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import android.net.Uri
import android.os.Build
import java.nio.ByteOrder

/**
 * Decodes a few excerpts of a file with the platform decoder and feeds them to
 * [SpectrumAnalyzer]. Runs on a background thread; ~1–3 s for a typical song.
 */
object SpectrumScan {
  private const val EXCERPT_SEC = 6.0
  private val POINTS = doubleArrayOf(0.15, 0.4, 0.65, 0.85)

  fun analyze(context: Context, uri: String): Map<String, Any?> {
    val ex = MediaExtractor()
    var codec: MediaCodec? = null
    try {
      ex.setDataSource(context, Uri.parse(uri), null)
      val track = (0 until ex.trackCount).firstOrNull { ex.getTrackFormat(it).getString(MediaFormat.KEY_MIME)?.startsWith("audio/") == true }
        ?: throw IllegalArgumentException("No audio in this file")
      val format = ex.getTrackFormat(track)
      val mime = format.getString(MediaFormat.KEY_MIME)!!
      val durationUs = if (format.containsKey(MediaFormat.KEY_DURATION)) format.getLong(MediaFormat.KEY_DURATION) else 0L
      ex.selectTrack(track)
      if (Build.VERSION.SDK_INT >= 24) format.setInteger(MediaFormat.KEY_PCM_ENCODING, AudioFormat.ENCODING_PCM_FLOAT)
      val c = MediaCodec.createDecoderByType(mime)
      codec = c
      c.configure(format, null, null, 0)
      c.start()

      var rate = format.getInteger(MediaFormat.KEY_SAMPLE_RATE)
      var channels = format.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
      var enc = AudioFormat.ENCODING_PCM_16BIT
      var analyzer: SpectrumAnalyzer? = null
      var buf = FloatArray(0)
      val info = MediaCodec.BufferInfo()
      val starts = if (durationUs > EXCERPT_SEC * 4e6) POINTS.map { (durationUs * it).toLong() } else listOf(0L)

      for (start in starts) {
        ex.seekTo(start, MediaExtractor.SEEK_TO_CLOSEST_SYNC)
        c.flush()
        analyzer?.breakSegment()
        var collected = 0L
        var inputDone = false
        var guard = 0
        while (guard++ < 20000) {
          if (!inputDone) {
            val i = c.dequeueInputBuffer(5000)
            if (i >= 0) {
              val inBuf = c.getInputBuffer(i)!!
              val n = ex.readSampleData(inBuf, 0)
              if (n < 0) {
                c.queueInputBuffer(i, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
                inputDone = true
              } else {
                c.queueInputBuffer(i, 0, n, ex.sampleTime, 0)
                ex.advance()
              }
            }
          }
          val o = c.dequeueOutputBuffer(info, 5000)
          if (o == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
            val of = c.outputFormat
            rate = of.getInteger(MediaFormat.KEY_SAMPLE_RATE)
            channels = of.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
            enc = if (Build.VERSION.SDK_INT >= 24 && of.containsKey(MediaFormat.KEY_PCM_ENCODING)) of.getInteger(MediaFormat.KEY_PCM_ENCODING) else AudioFormat.ENCODING_PCM_16BIT
            continue
          }
          if (o < 0) {
            if (inputDone && o == MediaCodec.INFO_TRY_AGAIN_LATER) break
            continue
          }
          val out = c.getOutputBuffer(o)!!.order(ByteOrder.nativeOrder())
          out.position(info.offset)
          out.limit(info.offset + info.size)
          val a = analyzer ?: SpectrumAnalyzer(rate).also { analyzer = it }
          val float = enc == AudioFormat.ENCODING_PCM_FLOAT
          val samples = if (float) info.size / 4 else info.size / 2
          if (buf.size < samples) buf = FloatArray(samples)
          if (float) out.asFloatBuffer().get(buf, 0, samples) else {
            val sb = out.asShortBuffer()
            for (k in 0 until samples) buf[k] = sb.get(k) / 32768f
          }
          val frames = samples / channels
          a.add(buf, frames, channels, float)
          collected += frames
          c.releaseOutputBuffer(o, false)
          if ((info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0) break
          if (collected >= EXCERPT_SEC * rate) break
        }
      }

      val r = (analyzer ?: throw IllegalStateException("Couldn't decode this file")).result()
      return mapOf(
        "verdict" to r.verdict,
        "cutoffHz" to r.cutoffHz,
        "sampleRate" to r.sampleRate,
        "edgeDb" to r.edgeDb,
        "sharp" to r.sharp,
        "padded16" to r.padded16,
        "likelySource" to r.likelySource,
        "bandHz" to r.bandHz * 4,
        // Every 4th band (1 kHz) is plenty for the little graph.
        "bands" to r.bands.filterIndexed { i, _ -> i % 4 == 0 }.map { Math.round(it * 10) / 10.0 },
      )
    } finally {
      try {
        codec?.stop()
      } catch (e: Exception) {
        // not started
      }
      codec?.release()
      ex.release()
    }
  }
}
