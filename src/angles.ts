// Angles in degrees.

// Into [0, 360).
export const norm360 = (deg: number): number => ((deg % 360) + 360) % 360;

// Signed difference a − b, the short way round: [-180, 180).
export const angleDiff = (a: number, b: number): number => norm360(a - b + 180) - 180;

export const toRad = (deg: number): number => (deg * Math.PI) / 180;
