import { Skia } from '@shopify/react-native-skia';

/** Native: decode with Skia and downsample into an N×N raster surface. */
export async function readPixels(url: string, n: number): Promise<Uint8Array | Float32Array | null> {
  const data = await Skia.Data.fromURI(url);
  const img = Skia.Image.MakeImageFromEncoded(data);
  if (!img) return null;
  const surface = Skia.Surface.Make(n, n);
  if (!surface) return null;
  surface.getCanvas().drawImageRect(img, Skia.XYWHRect(0, 0, img.width(), img.height()), Skia.XYWHRect(0, 0, n, n), Skia.Paint());
  surface.flush();
  return surface.makeImageSnapshot().readPixels();
}
