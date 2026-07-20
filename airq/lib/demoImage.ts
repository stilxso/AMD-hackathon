/**
 * Generate a hazy "Almaty smog" sky image entirely on the client with canvas —
 * no network needed, so the Demo Load button is bulletproof offline and on
 * stage. Fully synchronous (uses toDataURL, not the async toBlob) so the demo
 * handler runs in a single React tick with no await boundary. Returns both a
 * File (for the multipart API contract) and a data URL (for the preview).
 */
export function makeDemoImage(): { file: File; url: string } {
  const w = 1200;
  const h = 900;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;

  // hazy sky gradient: dusty amber horizon -> murky blue-grey sky
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, "#8794a1");
  sky.addColorStop(0.45, "#b7a98f");
  sky.addColorStop(0.72, "#d8c39a");
  sky.addColorStop(1, "#e6d2a6");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  // dim sun disc behind the smog
  const sun = ctx.createRadialGradient(w * 0.68, h * 0.6, 10, w * 0.68, h * 0.6, 260);
  sun.addColorStop(0, "rgba(255,240,200,0.9)");
  sun.addColorStop(0.4, "rgba(240,210,150,0.5)");
  sun.addColorStop(1, "rgba(240,210,150,0)");
  ctx.fillStyle = sun;
  ctx.fillRect(0, 0, w, h);

  // soft haze bands
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = `rgba(200,190,170,${0.05 + i * 0.02})`;
    const y = h * (0.55 + i * 0.06);
    ctx.fillRect(0, y, w, 40 + i * 12);
  }

  // faint mountain silhouette (Almaty is ringed by the Tien Shan)
  ctx.fillStyle = "rgba(90,96,104,0.45)";
  ctx.beginPath();
  ctx.moveTo(0, h * 0.62);
  const peaks = [0.62, 0.5, 0.58, 0.44, 0.55, 0.48, 0.6, 0.52, 0.64];
  peaks.forEach((p, i) => ctx.lineTo((w / (peaks.length - 1)) * i, h * p));
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  ctx.fill();

  // hazy city block silhouette at the base
  ctx.fillStyle = "rgba(70,74,80,0.55)";
  for (let x = 0; x < w; x += 34) {
    const bh = 40 + Math.random() * 120;
    ctx.fillRect(x, h - bh, 26, bh);
  }
  // smog veil over everything
  ctx.fillStyle = "rgba(210,198,168,0.28)";
  ctx.fillRect(0, 0, w, h);

  const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
  const file = dataUrlToFile(dataUrl, "almaty-haze-demo.jpg");
  return { file, url: dataUrl };
}

function dataUrlToFile(dataUrl: string, filename: string): File {
  const [header, b64] = dataUrl.split(",");
  const mime = /data:(.*?);/.exec(header)?.[1] ?? "image/jpeg";
  const binary = atob(b64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
  return new File([bytes], filename, { type: mime });
}
