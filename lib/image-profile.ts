export const JPEG_QUALITY = 0.86;

export const BASELINE_IMAGE_LIMITS = {
  item: 1800,
  date: 1800,
} as const;

export const EFFICIENT_IMAGE_LIMITS = {
  item: 1024,
  date: 1408,
} as const;

export type ImageRole = keyof typeof EFFICIENT_IMAGE_LIMITS;

export function fittedImageDimensions(
  width: number,
  height: number,
  maxEdge: number,
): { width: number; height: number } {
  if (width <= 0 || height <= 0 || maxEdge <= 0) {
    throw new Error("Image dimensions must be positive.");
  }
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}
