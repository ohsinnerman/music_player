// See run.sh — fixtures are generated with ffmpeg (real MP3 / AAC encoders).
import expo.modules.auraaudioroute.SpectrumAnalyzer
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder

fun run(path: String, sr: Int, fine: Boolean = true): SpectrumAnalyzer.Result {
  val bytes = File(path).readBytes()
  val fb = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN).asFloatBuffer()
  val all = FloatArray(fb.remaining()); fb.get(all)
  val a = SpectrumAnalyzer(sr)
  val chunk = 4096 * 2
  var p = 0
  while (p < all.size) {
    val n = minOf(chunk, all.size - p)
    a.add(all.copyOfRange(p, p + n), n / 2, 2, fine)
    p += n
  }
  return a.result()
}

fun main(args: Array<String>) {
  val d = args[0]
  var ok = true
  fun expect(name: String, r: SpectrumAnalyzer.Result, verdict: String, padded: Boolean?) {
    val pass = r.verdict == verdict && (padded == null || r.padded16 == padded)
    if (!pass) ok = false
    println("${if (pass) "ok  " else "FAIL"} $name: verdict=${r.verdict} cutoff=${r.cutoffHz} edge=${r.edgeDb} sharp=${r.sharp} padded16=${r.padded16} source=${r.likelySource}")
  }
  expect("pink 44.1 (16-bit source)", run("$d/pink44.f32", 44100), "genuine", true)
  expect("mp3 128k → lossless", run("$d/m128.f32", 44100), "lossy", null)
  expect("mp3 320k → lossless", run("$d/m320.f32", 44100), "suspect", null)
  expect("aac 96k → lossless", run("$d/a96.f32", 44100), "lossy", null)
  expect("44.1 upsampled to 96", run("$d/up96.f32", 96000), "upsampled", null)
  expect("real 96k", run("$d/hi96.f32", 96000), "genuine", false)
  if (!ok) kotlin.system.exitProcess(1)
  println("ALL PASSED")
}
