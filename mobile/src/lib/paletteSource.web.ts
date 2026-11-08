/** Web: sample via a tiny <canvas> (requires CORS-enabled images, which Audius/Deezer CDNs are). */
export function readPixels(url: string, n: number): Promise<Uint8Array | null> {
  return new Promise((resolve) => {
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = n;
        canvas.height = n;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(null);
        ctx.drawImage(img, 0, 0, n, n);
        resolve(new Uint8Array(ctx.getImageData(0, 0, n, n).data.buffer));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}
