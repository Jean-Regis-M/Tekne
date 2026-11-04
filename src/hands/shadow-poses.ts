/**
 * Reference hand poses for each shadow shape, in the emulator's (IWER)
 * finger-angle format (degrees). Used by unit tests and to drive the
 * Immersive Web Emulator, so the recognizer is tested against the same
 * skeletons a reviewer can reproduce.
 */
export const SHADOW_POSE_ANGLES = {
  // Index + middle up as ears, thumb pins ring and pinky (a peace sign).
  rabbit: {
    thumb: { cmc: [-16.2, -53.8, -93.4], shift: 0.9, mcp: 60.8, ip: 52, mcpRoll: -10, ipRoll: -25 },
    index: { mcp: 2, pip: 3, dip: 3, yaw: -9 },
    middle: { mcp: 2, pip: 3, dip: 3, yaw: 8 },
    ring: { mcp: 72, pip: 95, dip: 50, yaw: 4 },
    pinky: { mcp: 75, pip: 90, dip: 50, yaw: 2 },
  },
  // Flat blade hand, thumb below as a lower jaw (mouth slightly open).
  crocodile: {
    thumb: { cmc: [-30, -20, -60], mcp: 10, ip: 6 },
    index: { mcp: 3, pip: 3, dip: 3, yaw: 2 },
    middle: { mcp: 3, pip: 3, dip: 4, yaw: 0 },
    ring: { mcp: 3, pip: 4, dip: 5, yaw: -2 },
    pinky: { mcp: 6, pip: 6, dip: 6, yaw: -4 },
  },
  // All fingertips gathered onto the thumb tip: a beak.
  swan: {
    thumb: { cmc: [-7.3, -50.9, -118.2], shift: 1, mcp: 14.8, ip: 27.2 },
    index: { mcp: 48, pip: 46, dip: 27, yaw: 0.5, roll: -9 },
    middle: { mcp: 44, pip: 52, dip: 32, yaw: 1 },
    ring: { mcp: 46, pip: 56, dip: 34, yaw: 3 },
    pinky: { mcp: 50, pip: 60, dip: 36, yaw: 3 },
  },
} as const;
