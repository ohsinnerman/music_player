import { describe, expect, it } from 'vitest';
import { AVT, UpnpError, describeFault, didl, formatTime, mimeFor, parseDescription, parseSoapResponse, parseTime, protocolInfo, resolveUrl, soapEnvelope, soapHeaders } from './upnp';

// Shaped like a Yamaha MusicCast receiver's description (renderer is the root device).
const YAMAHA = `<?xml version="1.0" encoding="utf-8"?>
<root xmlns="urn:schemas-upnp-org:device-1-0" xmlns:yamaha="urn:schemas-yamaha-com:device-1-0">
  <specVersion><major>1</major><minor>0</minor></specVersion>
  <device>
    <dlna:X_DLNADOC xmlns:dlna="urn:schemas-dlna-org:device-1-0">DMR-1.50</dlna:X_DLNADOC>
    <deviceType>urn:schemas-upnp-org:device:MediaRenderer:1</deviceType>
    <friendlyName>Living Room &amp; Den</friendlyName>
    <manufacturer>Yamaha Corporation</manufacturer>
    <modelName>RX-V485</modelName>
    <modelNumber>V485</modelNumber>
    <UDN>uuid:9ab0c000-f668-11de-9976-00a0debd3eda</UDN>
    <iconList>
      <icon><mimetype>image/jpeg</mimetype><width>48</width><height>48</height><depth>24</depth><url>/Icons/48x48.jpg</url></icon>
      <icon><mimetype>image/png</mimetype><width>120</width><height>120</height><depth>24</depth><url>/Icons/120x120.png</url></icon>
    </iconList>
    <serviceList>
      <service><serviceType>urn:schemas-upnp-org:service:AVTransport:1</serviceType><serviceId>urn:upnp-org:serviceId:AVTransport</serviceId>
        <SCPDURL>/AVTransport/desc.xml</SCPDURL><controlURL>/AVTransport/ctrl</controlURL><eventSubURL>/AVTransport/event</eventSubURL></service>
      <service><serviceType>urn:schemas-upnp-org:service:RenderingControl:1</serviceType><serviceId>urn:upnp-org:serviceId:RenderingControl</serviceId>
        <SCPDURL>/RenderingControl/desc.xml</SCPDURL><controlURL>/RenderingControl/ctrl</controlURL><eventSubURL>/RenderingControl/event</eventSubURL></service>
      <service><serviceType>urn:schemas-upnp-org:service:ConnectionManager:1</serviceType><serviceId>urn:upnp-org:serviceId:ConnectionManager</serviceId>
        <SCPDURL>/ConnectionManager/desc.xml</SCPDURL><controlURL>/ConnectionManager/ctrl</controlURL><eventSubURL>/ConnectionManager/event</eventSubURL></service>
    </serviceList>
    <yamaha:X_device>
      <yamaha:X_URLBase>http://192.168.1.23:80/</yamaha:X_URLBase>
      <yamaha:X_serviceList><yamaha:X_service><yamaha:X_specType>urn:schemas-yamaha-com:service:X_YamahaRemoteControl:1</yamaha:X_specType>
        <yamaha:X_controlURL>/YamahaRemoteControl/ctrl</yamaha:X_controlURL><yamaha:X_unitDescURL>/YamahaRemoteControl/desc.xml</yamaha:X_unitDescURL></yamaha:X_service></yamaha:X_serviceList>
      <yamaha:X_yxcControlURL>/YamahaExtendedControl/v1/</yamaha:X_yxcControlURL>
    </yamaha:X_device>
  </device>
</root>`;

// A TV-style root device that embeds the renderer (relative URLs without a leading slash).
const NESTED = `<root><URLBase>http://192.168.1.50:9197/dmr/</URLBase><device>
  <deviceType>urn:schemas-upnp-org:device:Basic:1</deviceType><friendlyName>Root box</friendlyName><UDN>uuid:root</UDN>
  <serviceList><service><serviceType>urn:example:service:Other:1</serviceType><controlURL>other</controlURL></service></serviceList>
  <deviceList><device>
    <deviceType>urn:schemas-upnp-org:device:MediaRenderer:1</deviceType><friendlyName>[TV] Samsung</friendlyName><manufacturer>Samsung</manufacturer>
    <modelName>QN90</modelName><UDN>uuid:renderer</UDN>
    <serviceList>
      <service><serviceType>urn:schemas-upnp-org:service:RenderingControl:1</serviceType><controlURL>upnp/control/RenderingControl1</controlURL></service>
      <service><serviceType>urn:schemas-upnp-org:service:AVTransport:1</serviceType><controlURL>upnp/control/AVTransport1</controlURL></service>
    </serviceList></device></deviceList></device></root>`;

describe('device descriptions', () => {
  it('reads a Yamaha receiver', () => {
    const r = parseDescription(YAMAHA, 'http://192.168.1.23:49154/MediaRenderer/desc.xml')!;
    expect(r).toMatchObject({
      udn: 'uuid:9ab0c000-f668-11de-9976-00a0debd3eda',
      name: 'Living Room & Den',
      manufacturer: 'Yamaha Corporation',
      model: 'RX-V485',
      avTransport: 'http://192.168.1.23:49154/AVTransport/ctrl',
      renderingControl: 'http://192.168.1.23:49154/RenderingControl/ctrl',
      iconUrl: 'http://192.168.1.23:49154/Icons/120x120.png',
      avServiceType: AVT,
      yxc: 'http://192.168.1.23:80/YamahaExtendedControl/v1/',
    });
    expect(parseDescription(NESTED, 'http://192.168.1.50:9197/dmr')!.yxc).toBeUndefined();
  });

  it('finds an embedded renderer and resolves relative URLs against URLBase', () => {
    const r = parseDescription(NESTED, 'http://192.168.1.50:9197/dmr')!;
    expect(r.name).toBe('[TV] Samsung');
    expect(r.udn).toBe('uuid:renderer');
    expect(r.avTransport).toBe('http://192.168.1.50:9197/dmr/upnp/control/AVTransport1');
    expect(r.renderingControl).toBe('http://192.168.1.50:9197/dmr/upnp/control/RenderingControl1');
  });

  it('ignores devices without AVTransport', () => {
    expect(parseDescription('<root><device><friendlyName>NAS</friendlyName></device></root>', 'http://10.0.0.2/')).toBeNull();
    expect(resolveUrl('/a', 'http://h:1/x/y.xml')).toBe('http://h:1/a');
    expect(resolveUrl('b', 'http://h:1/x/y.xml')).toBe('http://h:1/x/b');
  });
});

describe('SOAP', () => {
  it('builds envelopes and headers', () => {
    const env = soapEnvelope(AVT, 'Seek', { InstanceID: 0, Unit: 'REL_TIME', Target: '0:01:05' });
    expect(env).toContain('<u:Seek xmlns:u="urn:schemas-upnp-org:service:AVTransport:1"><InstanceID>0</InstanceID><Unit>REL_TIME</Unit><Target>0:01:05</Target></u:Seek>');
    expect(soapHeaders(AVT, 'Play').SOAPACTION).toBe('"urn:schemas-upnp-org:service:AVTransport:1#Play"');
    // Metadata is XML inside XML: it must be escaped once more.
    expect(soapEnvelope(AVT, 'SetAVTransportURI', { CurrentURIMetaData: '<DIDL-Lite/>' })).toContain('&lt;DIDL-Lite/&gt;');
  });

  it('parses responses and faults', () => {
    const ok = `<s:Envelope><s:Body><u:GetPositionInfoResponse xmlns:u="${AVT}"><Track>1</Track><TrackDuration>0:03:56</TrackDuration><TrackMetaData>&lt;DIDL-Lite/&gt;</TrackMetaData><RelTime>0:01:02.500</RelTime><AbsTime>NOT_IMPLEMENTED</AbsTime></u:GetPositionInfoResponse></s:Body></s:Envelope>`;
    const r = parseSoapResponse(200, ok, 'GetPositionInfo');
    expect(r.RelTime).toBe('0:01:02.500');
    expect(r.TrackMetaData).toBe('<DIDL-Lite/>');
    expect(parseTime(r.RelTime)).toBeCloseTo(62.5);
    expect(parseTime(r.AbsTime)).toBe(0);

    const fault = `<s:Envelope><s:Body><s:Fault><faultcode>s:Client</faultcode><faultstring>UPnPError</faultstring><detail><UPnPError xmlns="urn:schemas-upnp-org:control-1-0"><errorCode>714</errorCode><errorDescription>Illegal MIME-type</errorDescription></UPnPError></detail></s:Fault></s:Body></s:Envelope>`;
    expect(() => parseSoapResponse(500, fault, 'SetAVTransportURI')).toThrow(UpnpError);
    try {
      parseSoapResponse(500, fault, 'SetAVTransportURI');
    } catch (e) {
      expect((e as UpnpError).code).toBe(714);
      expect(describeFault(e, 'RX-V485')).toBe('RX-V485 can’t play this file type');
    }
  });
});

describe('metadata & formats', () => {
  it('formats DLNA times', () => {
    expect(formatTime(65)).toBe('0:01:05');
    expect(formatTime(3725.25, true)).toBe('1:02:05.250');
  });

  it('builds DIDL-Lite with a full-quality res element', () => {
    const x = didl({ id: 'local:1', title: 'Crazy In Love', artist: 'Beyoncé & JAY-Z', album: 'Dangerously', url: 'http://192.168.1.9:40123/m/abc.flac', mime: 'audio/flac', durationSec: 236, sizeBytes: 31_000_000, sampleRate: 192000, channels: 2, bitsPerSample: 24, artUrl: 'http://192.168.1.9:40123/m/def.jpg' });
    expect(x).toContain('<dc:title>Crazy In Love</dc:title>');
    expect(x).toContain('<upnp:artist>Beyoncé &amp; JAY-Z</upnp:artist>');
    expect(x).toContain('protocolInfo="http-get:*:audio/flac:DLNA.ORG_OP=01;');
    expect(x).toContain('duration="0:03:56.000"');
    expect(x).toContain('sampleFrequency="192000"');
    expect(x).toContain('bitsPerSample="24"');
    expect(x).toContain('<upnp:class>object.item.audioItem.musicTrack</upnp:class>');
  });

  it('maps containers to MIME types', () => {
    expect(mimeFor('flac')).toEqual({ mime: 'audio/flac', ext: 'flac' });
    expect(mimeFor('m4a').mime).toBe('audio/mp4');
    expect(protocolInfo('audio/mpeg')).toContain('DLNA.ORG_PN=MP3');
  });
});
