package expo.modules.auracast

import android.content.Context
import android.net.Uri
import java.io.File
import java.io.FileInputStream
import java.io.InputStream
import java.io.OutputStream
import java.net.HttpURLConnection
import java.net.InetSocketAddress
import java.net.ServerSocket
import java.net.Socket
import java.net.SocketException
import java.net.URL
import java.security.SecureRandom
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors

/**
 * The phone's tiny DLNA media server. The receiver pulls the song from here,
 * byte for byte, with HTTP Range support for seeking. Nothing is transcoded.
 *
 * Only files the app explicitly registered are reachable, each behind an
 * unguessable 128-bit token, on the Wi-Fi address only (not cellular).
 * Catalog streams (https) are relayed as-is for receivers that can't do TLS.
 */
object MediaServer {
  private data class Entry(val uri: String, val mime: String, val proxy: Boolean)

  private var server: ServerSocket? = null
  private var host: String = ""
  private val entries = ConcurrentHashMap<String, Entry>()
  private val pool = Executors.newCachedThreadPool()
  private val random = SecureRandom()
  private lateinit var appContext: Context

  @Synchronized
  fun start(context: Context): Pair<String, Int> {
    appContext = context.applicationContext
    val running = server
    val wifi = Net.wifi() ?: throw IllegalStateException("Not connected to Wi-Fi")
    val ip = wifi.second.hostAddress ?: throw IllegalStateException("No Wi-Fi address")
    if (running != null && !running.isClosed && ip == host) return host to running.localPort
    stop()
    val ss = ServerSocket()
    ss.reuseAddress = true
    ss.bind(InetSocketAddress(wifi.second, 0))
    server = ss
    host = ip
    pool.execute {
      while (!ss.isClosed) {
        try {
          val s = ss.accept()
          pool.execute { handle(s) }
        } catch (e: Exception) {
          if (ss.isClosed) break
        }
      }
    }
    return host to ss.localPort
  }

  @Synchronized
  fun stop() {
    try {
      server?.close()
    } catch (e: Exception) {
    }
    server = null
    entries.clear()
  }

  fun register(uri: String, mime: String, ext: String, proxy: Boolean): String {
    val ss = server ?: throw IllegalStateException("Server not started")
    val bytes = ByteArray(16).also { random.nextBytes(it) }
    val token = bytes.joinToString("") { "%02x".format(it) }
    entries[token] = Entry(uri, mime, proxy)
    val safeExt = ext.filter { it.isLetterOrDigit() }.take(5).ifEmpty { "bin" }
    return "http://$host:${ss.localPort}/m/$token.$safeExt"
  }

  fun clear() = entries.clear()

  private fun handle(s: Socket) {
    s.use { sock ->
      try {
        sock.soTimeout = 15000
        val input = sock.getInputStream()
        val head = readHead(input) ?: return
        val lines = head.split("\r\n")
        val parts = lines.first().split(" ")
        if (parts.size < 2) return
        val method = parts[0].uppercase()
        val headers = HashMap<String, String>()
        for (l in lines.drop(1)) {
          val i = l.indexOf(':')
          if (i > 0) headers[l.substring(0, i).trim().lowercase()] = l.substring(i + 1).trim()
        }
        val out = sock.getOutputStream()
        val token = parts[1].substringAfter("/m/", "").substringBefore('.').substringBefore('?')
        val entry = entries[token]
        if (entry == null || (method != "GET" && method != "HEAD")) {
          writeStatus(out, if (entry == null) 404 else 405, "text/plain", 0, emptyMap())
          return
        }
        if (entry.proxy) relay(entry, method, headers, out) else serveFile(entry, method, headers, out)
      } catch (e: SocketException) {
        // receiver closed the connection (seek / stop) — normal
      } catch (e: Exception) {
      }
    }
  }

  private fun readHead(input: InputStream): String? {
    val buf = StringBuilder()
    var last4 = 0
    while (buf.length < 16384) {
      val c = input.read()
      if (c < 0) return null
      buf.append(c.toChar())
      last4 = (last4 shl 8) or c
      if (last4 == 0x0d0a0d0a) return buf.substring(0, buf.length - 4)
    }
    return null
  }

  private fun dlnaHeaders(mime: String): Map<String, String> = mapOf(
    "Accept-Ranges" to "bytes",
    "transferMode.dlna.org" to "Streaming",
    "contentFeatures.dlna.org" to "DLNA.ORG_OP=01;DLNA.ORG_CI=0;DLNA.ORG_FLAGS=01700000000000000000000000000000",
    "Cache-Control" to "no-cache",
  )

  private fun writeStatus(out: OutputStream, code: Int, mime: String, length: Long, extra: Map<String, String>) {
    val reason = when (code) {
      200 -> "OK"
      206 -> "Partial Content"
      404 -> "Not Found"
      405 -> "Method Not Allowed"
      416 -> "Range Not Satisfiable"
      else -> "Error"
    }
    val sb = StringBuilder("HTTP/1.1 $code $reason\r\n")
    sb.append("Content-Type: $mime\r\n")
    if (length >= 0) sb.append("Content-Length: $length\r\n")
    sb.append("Server: Android UPnP/1.0 DLNADOC/1.50 Aura/1.0\r\n")
    sb.append("Connection: close\r\n")
    for ((k, v) in extra) sb.append("$k: $v\r\n")
    sb.append("\r\n")
    out.write(sb.toString().toByteArray(Charsets.ISO_8859_1))
  }

  /** Returns (start, endInclusive) or null for "whole file"; throws on unsatisfiable. */
  private fun range(header: String?, size: Long): LongArray? {
    if (header == null || !header.startsWith("bytes=") || size <= 0) return null
    val spec = header.removePrefix("bytes=").split(",").first().trim()
    val dash = spec.indexOf('-')
    if (dash < 0) return null
    val a = spec.substring(0, dash).trim()
    val b = spec.substring(dash + 1).trim()
    val start: Long
    val end: Long
    if (a.isEmpty()) {
      val n = b.toLongOrNull() ?: return null
      start = maxOf(0, size - n)
      end = size - 1
    } else {
      start = a.toLongOrNull() ?: return null
      end = b.toLongOrNull()?.coerceAtMost(size - 1) ?: (size - 1)
    }
    if (start >= size || start > end) throw IndexOutOfBoundsException()
    return longArrayOf(start, end)
  }

  private fun serveFile(e: Entry, method: String, headers: Map<String, String>, out: OutputStream) {
    var afd: android.content.res.AssetFileDescriptor? = null
    val stream: FileInputStream
    val size: Long
    val base: Long
    if (e.uri.startsWith("content://")) {
      afd = appContext.contentResolver.openAssetFileDescriptor(Uri.parse(e.uri), "r") ?: throw IllegalStateException("Can't open")
      stream = FileInputStream(afd.fileDescriptor)
      base = afd.startOffset
      size = if (afd.length >= 0) afd.length else afd.parcelFileDescriptor.statSize
    } else {
      val f = File(Uri.parse(e.uri).path ?: e.uri)
      stream = FileInputStream(f)
      base = 0
      size = f.length()
    }
    try {
      val r = try {
        range(headers["range"], size)
      } catch (x: IndexOutOfBoundsException) {
        writeStatus(out, 416, e.mime, 0, mapOf("Content-Range" to "bytes */$size"))
        return
      }
      val start = r?.get(0) ?: 0
      val end = r?.get(1) ?: (size - 1)
      val length = if (size > 0) end - start + 1 else -1
      val extra = HashMap(dlnaHeaders(e.mime))
      if (r != null) extra["Content-Range"] = "bytes $start-$end/$size"
      writeStatus(out, if (r != null) 206 else 200, e.mime, length, extra)
      if (method == "HEAD") return
      val ch = stream.channel
      ch.position(base + start)
      val buf = ByteArray(64 * 1024)
      var left = if (length >= 0) length else Long.MAX_VALUE
      while (left > 0) {
        val n = stream.read(buf, 0, minOf(buf.size.toLong(), left).toInt())
        if (n < 0) break
        out.write(buf, 0, n)
        left -= n
      }
      out.flush()
    } finally {
      try {
        stream.close()
      } catch (x: Exception) {
      }
      try {
        afd?.close()
      } catch (x: Exception) {
      }
    }
  }

  /** Relay an http(s) stream (following redirects across schemes) with Range passthrough. */
  private fun relay(e: Entry, method: String, headers: Map<String, String>, out: OutputStream) {
    var url = URL(e.uri)
    var conn: HttpURLConnection? = null
    for (hop in 0 until 6) {
      val c = url.openConnection() as HttpURLConnection
      c.instanceFollowRedirects = false
      c.connectTimeout = 10000
      c.readTimeout = 20000
      c.requestMethod = if (method == "HEAD") "HEAD" else "GET"
      headers["range"]?.let { c.setRequestProperty("Range", it) }
      c.setRequestProperty("User-Agent", "Aura/1.0")
      val code = c.responseCode
      if (code in 300..399) {
        val loc = c.getHeaderField("Location") ?: break
        url = URL(url, loc)
        c.disconnect()
        continue
      }
      conn = c
      break
    }
    val c = conn ?: run {
      writeStatus(out, 404, "text/plain", 0, emptyMap())
      return
    }
    try {
      val code = c.responseCode
      val mime = c.contentType?.takeIf { it.startsWith("audio/") } ?: e.mime
      val extra = HashMap(dlnaHeaders(mime))
      c.getHeaderField("Content-Range")?.let { extra["Content-Range"] = it }
      writeStatus(out, if (code == 206) 206 else if (code in 200..299) 200 else 404, mime, c.contentLengthLong, extra)
      if (method == "HEAD" || code !in 200..299) return
      c.inputStream.use { input ->
        val buf = ByteArray(64 * 1024)
        while (true) {
          val n = input.read(buf)
          if (n < 0) break
          out.write(buf, 0, n)
        }
      }
      out.flush()
    } finally {
      c.disconnect()
    }
  }
}
