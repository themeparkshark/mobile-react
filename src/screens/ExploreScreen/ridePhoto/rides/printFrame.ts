import { PaintStyle, Skia, StrokeCap, createPicture, type SkPicture } from '@shopify/react-native-skia';
import type { PrintFrame } from './catalog';

/**
 * The per-ride print frame: a decoration in the print's border around the photo,
 * recorded once per ride. Classic (coaster) keeps the plain white, silver or gold card.
 * - splash (flume): a wavy blue water band along the bottom edge with droplets up the sides
 * - sugar (teacups): pastel sprinkles scattered in the border
 */
export function buildPrintFrame(frame: PrintFrame, w: number, h: number, photo: { x: number; y: number; w: number; h: number }): SkPicture {
  return createPicture(canvas => {
    const fill = Skia.Paint(); fill.setAntiAlias(true);
    const ink = Skia.Paint(); ink.setAntiAlias(true); ink.setStyle(PaintStyle.Stroke); ink.setStrokeCap(StrokeCap.Round);
    if (frame === 'splash') {
      const y = photo.y + photo.h - 10;
      const wave = Skia.Path.Make();
      wave.moveTo(photo.x - 6, y + 14);
      for (let x = photo.x - 6; x <= photo.x + photo.w + 6; x += 18) wave.quadTo(x + 9, y + 2, x + 18, y + 14);
      wave.lineTo(photo.x + photo.w + 6, y + 22); wave.lineTo(photo.x - 6, y + 22); wave.close();
      fill.setColor(Skia.Color('#5fc8f0')); canvas.drawPath(wave, fill);
      ink.setStrokeWidth(2.5); ink.setColor(Skia.Color('#2a83b8')); canvas.drawPath(wave, ink);
      const drops = [[0.02, 0.2], [0.98, 0.35], [0.0, 0.62], [1.0, 0.8], [0.5, -0.02]];
      for (const [fx, fy] of drops) {
        const x = photo.x + photo.w * fx, yy = photo.y + photo.h * fy;
        fill.setColor(Skia.Color('#bfeeff')); canvas.drawCircle(x, yy, 4, fill);
        ink.setStrokeWidth(1.6); canvas.drawCircle(x, yy, 4, ink);
      }
    } else if (frame === 'sugar') {
      const colors = ['#ff8fc4', '#ffd84a', '#8fd9ff', '#b98cff', '#7fe3a8'];
      for (let i = 0; i < 26; i++) {
        const side = i % 4;
        const k = ((i * 0.618) % 1);
        const x = side < 2 ? photo.x + k * photo.w : side === 2 ? photo.x - 6 : photo.x + photo.w + 6;
        const y = side === 0 ? photo.y - 6 : side === 1 ? photo.y + photo.h + 7 : photo.y + k * photo.h;
        ink.setStrokeWidth(3.2); ink.setColor(Skia.Color(colors[i % colors.length]));
        const a = i * 1.3;
        canvas.drawLine(x - Math.cos(a) * 3.5, y - Math.sin(a) * 3.5, x + Math.cos(a) * 3.5, y + Math.sin(a) * 3.5, ink);
      }
    }
  }, { width: w, height: h });
}
