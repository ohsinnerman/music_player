package expo.modules.auracast

import android.content.Context
import android.net.wifi.WifiManager
import java.io.ByteArrayOutputStream
import java.io.InputStream
import java.net.DatagramPacket
import java.net.Inet4Address
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.MulticastSocket
import java.net.NetworkInterface
import java.net.Socket
import java.net.SocketTimeoutException
import java.net.URI

/** Wi-Fi interface + IPv4 address this phone has on the local network. */
object Net {
  /** Host-side tests only (no Wi-Fi in a JVM sandbox). */
  internal var testInterface: Pair<NetworkInterface, Inet4Address>? = null

  fun wifi(): Pair<NetworkInterface, Inet4Address>? {
    testInterface?.let { return it }
    val candidates = mutableListOf<Pair<NetworkInterface, Inet4Address>>()
    try {
      for (ni in NetworkInterface.getNetworkInterfaces()) {
        if (!ni.isUp || ni.isLoopback || ni.isVirtual) continue
        for (a in ni.inetAddresses) {
          if (a is Inet4Address && (a.isSiteLocalAddress || a.isLinkLocalAddress)) candidates.add(ni to a)
        }
      }
    } catch (e: Exception) {
      return null
    }
    // Prefer real Wi-Fi ("wlan0"), then hotspot / other LAN interfaces; never cellular (rmnet, ccmni).
    return candidates.minByOrNull { (ni, _) ->
      val n = ni.name.lowercase()
      when {
        n.startsWith("wlan") -> 0
        n.startsWith("swlan") || n.startsWith("ap") -> 1
        n.startsWith("eth") -> 2
        n.startsWith("rmnet") || n.startsWith("ccmni") || n.startsWith("tun") -> 9
        else -> 5
      }
    }?.takeIf { !it.first.name.lowercase().let { n -> n.startsWith("rmnet") || n.startsWith("ccmni") } }
  }

  /** Only talk plain HTTP to devices on the local network (never the internet). */
  fun isLan(host: String): Boolean {
    return try {
      val a = InetAddress.getByName(host)
      a.isSiteLocalAddress || a.isLinkLocalAddress || a.isLoopbackAddress
    } catch (e: Exception) {
      false
    }
  }
}

/** SSDP discovery (UPnP 1.1 §1.3). */
object Ssdp {
  private const val GROUP = "239.255.255.250"

  fun discover(context: Context, timeoutMs: Int, st: String): List<Map<String, String>> {
    val wifi = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
    val lock = wifi.createMulticastLock("aura-ssdp").apply { setReferenceCounted(false) }
    val found = LinkedHashMap<String, Map<String, String>>()
    lock.acquire()
    try {
      val (iface, addr) = Net.wifi() ?: throw IllegalStateException("Not connected to Wi-Fi")
      MulticastSocket(null).use { sock ->
        sock.reuseAddress = true
        sock.bind(InetSocketAddress(addr, 0))
        try {
          sock.networkInterface = iface
        } catch (e: Exception) {
          // some ROMs refuse; the bound address already picks the interface
        }
        sock.timeToLive = 4
        sock.soTimeout = 350
        val msg = (
          "M-SEARCH * HTTP/1.1\r\n" +
            "HOST: $GROUP:1900\r\n" +
            "MAN: \"ssdp:discover\"\r\n" +
            "MX: 2\r\n" +
            "ST: $st\r\n" +
            "USER-AGENT: Android UPnP/1.1 Aura/1.0\r\n\r\n"
          ).toByteArray(Charsets.US_ASCII)
        val group = InetAddress.getByName(GROUP)
        val deadline = System.currentTimeMillis() + timeoutMs
        var sent = 0
        var nextSend = 0L
        val buf = ByteArray(8192)
        while (System.currentTimeMillis() < deadline) {
          val now = System.currentTimeMillis()
          // UDP is lossy: send three times, spaced out.
          if (sent < 3 && now >= nextSend) {
            sock.send(DatagramPacket(msg, msg.size, group, 1900))
            sent++
            nextSend = now + 600
          }
          try {
            val pkt = DatagramPacket(buf, buf.size)
            sock.receive(pkt)
            val text = String(pkt.data, 0, pkt.length, Charsets.UTF_8)
            val headers = parseHeaders(text)
            val location = headers["location"] ?: continue
            val key = headers["usn"]?.substringBefore("::") ?: location
            found[key] = headers + ("address" to (pkt.address.hostAddress ?: ""))
          } catch (e: SocketTimeoutException) {
            // keep listening until the deadline
          }
        }
      }
    } finally {
      lock.release()
    }
    return found.values.toList()
  }

  private fun parseHeaders(text: String): Map<String, String> {
    val out = HashMap<String, String>()
    for (line in text.split("\r\n", "\n").drop(1)) {
      val i = line.indexOf(':')
      if (i > 0) out[line.substring(0, i).trim().lowercase()] = line.substring(i + 1).trim()
    }
    return out
  }
}

/**
 * Minimal HTTP/1.1 client over a raw socket, for UPnP description + SOAP on the
 * LAN. (Android's cleartext policy rightly blocks http:// in the app's normal
 * stack; this one refuses anything that isn't a local-network address.)
 */
object LanHttp {
  data class Response(val status: Int, val headers: Map<String, String>, val body: String)

  fun request(method: String, url: String, headers: Map<String, String>, body: String?, timeoutMs: Int): Response {
    val u = URI(url)
    val host = u.host ?: throw IllegalArgumentException("Bad URL")
    if (u.scheme != "http") throw IllegalArgumentException("Only http:// on the local network")
    if (!Net.isLan(host)) throw SecurityException("Not a local-network address")
    val port = if (u.port > 0) u.port else 80
    val path = (u.rawPath?.takeIf { it.isNotEmpty() } ?: "/") + (u.rawQuery?.let { "?$it" } ?: "")
    Socket().use { s ->
      s.connect(InetSocketAddress(host, port), timeoutMs)
      s.soTimeout = timeoutMs
      val payload = body?.toByteArray(Charsets.UTF_8)
      val head = StringBuilder()
      head.append("$method $path HTTP/1.1\r\n")
      head.append("Host: $host:$port\r\n")
      head.append("Connection: close\r\n")
      head.append("User-Agent: Android UPnP/1.1 Aura/1.0\r\n")
      for ((k, v) in headers) head.append("$k: $v\r\n")
      if (payload != null) head.append("Content-Length: ${payload.size}\r\n")
      head.append("\r\n")
      val out = s.getOutputStream()
      out.write(head.toString().toByteArray(Charsets.UTF_8))
      if (payload != null) out.write(payload)
      out.flush()
      return parse(readAll(s.getInputStream(), 4 * 1024 * 1024))
    }
  }

  private fun readAll(input: InputStream, cap: Int): ByteArray {
    val bos = ByteArrayOutputStream()
    val buf = ByteArray(16384)
    while (bos.size() < cap) {
      val n = try {
        input.read(buf)
      } catch (e: SocketTimeoutException) {
        if (bos.size() > 0) -1 else throw e
      }
      if (n < 0) break
      bos.write(buf, 0, n)
    }
    return bos.toByteArray()
  }

  private fun parse(raw: ByteArray): Response {
    val sep = indexOf(raw, "\r\n\r\n".toByteArray())
    if (sep < 0) throw IllegalStateException("Malformed HTTP response")
    val head = String(raw, 0, sep, Charsets.ISO_8859_1).split("\r\n")
    val status = head.firstOrNull()?.split(" ")?.getOrNull(1)?.toIntOrNull() ?: 0
    val headers = HashMap<String, String>()
    for (line in head.drop(1)) {
      val i = line.indexOf(':')
      if (i > 0) headers[line.substring(0, i).trim().lowercase()] = line.substring(i + 1).trim()
    }
    var body = raw.copyOfRange(sep + 4, raw.size)
    if (headers["transfer-encoding"]?.contains("chunked", ignoreCase = true) == true) body = dechunk(body)
    val len = headers["content-length"]?.toIntOrNull()
    if (len != null && len < body.size) body = body.copyOf(len)
    return Response(status, headers, String(body, Charsets.UTF_8))
  }

  private fun dechunk(b: ByteArray): ByteArray {
    val out = ByteArrayOutputStream()
    var p = 0
    while (p < b.size) {
      val eol = indexOf(b, "\r\n".toByteArray(), p)
      if (eol < 0) break
      val size = String(b, p, eol - p, Charsets.US_ASCII).substringBefore(';').trim().toIntOrNull(16) ?: break
      if (size == 0) break
      val start = eol + 2
      if (start + size > b.size) {
        out.write(b, start, b.size - start)
        break
      }
      out.write(b, start, size)
      p = start + size + 2
    }
    return out.toByteArray()
  }

  private fun indexOf(b: ByteArray, pat: ByteArray, from: Int = 0): Int {
    outer@ for (i in from..b.size - pat.size) {
      for (k in pat.indices) if (b[i + k] != pat[k]) continue@outer
      return i
    }
    return -1
  }
}
