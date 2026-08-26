"use client";

/**
 * Reading the exposure map off the page.
 *
 * Two things make this fiddly. The map is a WebGL canvas, so it reads back
 * fully transparent unless MapLibre was told to preserve its drawing buffer —
 * and a transparent PNG of map dimensions still compresses to ~17KB, so file
 * size cannot tell you whether you captured a picture or nothing. Sampling the
 * alpha channel can.
 *
 * The second is that inspecting a different channel remounts the whole briefing
 * workspace, so "the canvas" is a different DOM element from one capture to the
 * next. Callers that switch channels pass the element they already captured and
 * wait for one that isn't it.
 */

export function mapCanvas(): HTMLCanvasElement | null {
  return document.querySelector<HTMLCanvasElement>("canvas.maplibregl-canvas");
}

/** Does this PNG actually show anything, or is it an empty buffer? */
export async function hasVisiblePixels(dataUrl: string): Promise<boolean> {
  const img = await new Promise<HTMLImageElement | null>((resolve) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => resolve(null);
    el.src = dataUrl;
  });
  if (!img?.width || !img.height) return false;
  const scratch = document.createElement("canvas");
  scratch.width = img.width;
  scratch.height = img.height;
  const ctx = scratch.getContext("2d");
  if (!ctx) return false;
  ctx.drawImage(img, 0, 0);
  const { data } = ctx.getImageData(0, 0, img.width, img.height);
  // Every 97th pixel: dense enough to find a map, cheap enough to be free.
  for (let i = 3; i < data.length; i += 4 * 97) {
    if (data[i] > 10) return true;
  }
  return false;
}

/**
 * Wait for a settled map and return it.
 *
 * Polls rather than listening, because the map instance lives inside the
 * component and is never handed out. Two conditions have to hold, and missing
 * either one produces a picture of the wrong thing:
 *
 * `notCanvas` is how a caller says "not the one I already have" after switching
 * channels — without it a fast poll captures the outgoing map before React has
 * torn it down.
 *
 * Stability is the subtler one. A map paints its base world before the
 * choropleth arrives, and that base is fully opaque, so a visible-pixels check
 * happily returns a world map with no data on it. Waiting for two consecutive
 * identical frames means the fill has landed, whatever order the layers came
 * in.
 */
export async function captureMap(options?: {
  notCanvas?: HTMLCanvasElement | null;
  timeoutMs?: number;
}): Promise<{ canvas: HTMLCanvasElement; png: string } | null> {
  const deadline = Date.now() + (options?.timeoutMs ?? 15_000);
  let last: { canvas: HTMLCanvasElement; png: string } | null = null;

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 250));
    const canvas = mapCanvas();
    if (!canvas || canvas === options?.notCanvas) {
      last = null;
      continue;
    }
    let png: string;
    try {
      png = canvas.toDataURL("image/png");
    } catch {
      // A tainted canvas will never become readable; stop trying.
      return null;
    }
    if (last && last.canvas === canvas && last.png === png) {
      return (await hasVisiblePixels(png)) ? { canvas, png } : null;
    }
    last = { canvas, png };
  }
  return null;
}
