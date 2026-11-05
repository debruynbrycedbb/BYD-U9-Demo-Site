// Camera path from the storyboard. One shot per chapter, in page order.
// The car's nose points +Z, its left side is +X, wheels sit on y = 0.
// theta: angle around the target, 0 = in front of the car, 90 = car's left side, 270 = right side.
// elev: degrees above the target. dist: metres from the target.
// hfov: horizontal field of view (kept constant across screen shapes).
// sx / sy: shift the car across the screen (fraction of width / height) to make room for text.
// m: overrides for portrait screens, where text always sits at the bottom.
//    Phones use a tighter lens so the car fills most of the width.

export const REAR_RIGHT_WHEEL = [-0.95, 0.40, -1.56];   // measured from the model

export const SHOTS = [
  { id: 'hero',       target: [0, 0.80, 0],   theta: 0,   elev: 3.4, dist: 12.5, hfov: 39.6, sx: 0,     sy: 0,     title: 1,
    m: { hfov: 17, dist: 11.5, sy: 0.02 } },
  { id: 'record',     target: [0, 0.70, 0],   theta: 0,   elev: 4.5, dist: 10.0, hfov: 39.6, sx: -0.14, sy: 0.04,  title: 0,
    m: { hfov: 16, sy: 0.14 } },
  { id: 'powertrain', target: [0, 0.60, 0.2], theta: 42,  elev: 9,   dist: 9.5,  hfov: 39.6, sx: -0.16, sy: 0.02,  title: 0,
    m: { hfov: 30, sy: 0.16 } },
  { id: 'battery',    target: [0, 0.60, 0],   theta: 90,  elev: 6,   dist: 12.5, hfov: 39.6, sx: 0,     sy: -0.26, title: 0,
    m: { hfov: 26, sy: 0.16 } },
  { id: 'motors',     target: [0, 0.60, -0.6],theta: 128, elev: 7,   dist: 12.5, hfov: 39.6, sx: 0.25,   sy: 0.02,  title: 0,
    m: { hfov: 24, sx: 0, sy: 0.16 } },
  { id: 'aero',       target: [0, 1.05, -1.9],theta: 180, elev: 26,  dist: 10.0, hfov: 39.6, sx: 0,     sy: 0.11,  title: 0,
    m: { hfov: 19, sy: 0.12 } },
  { id: 'tyres',      target: REAR_RIGHT_WHEEL, theta: 245, elev: 10, dist: 2.7, hfov: 39.6, sx: 0.16,  sy: 0.02,  title: 0,
    m: { hfov: 40, sy: 0.14, dist: 3.2 } },
  { id: 'suspension', target: [0, 0.60, 0.1], theta: 270, elev: 6,   dist: 12.5, hfov: 39.6, sx: 0,     sy: -0.26, title: 0,
    m: { hfov: 26, sy: 0.16 } },
  { id: 'finale',     target: [0, 0.80, 0],   theta: 360, elev: 3.4, dist: 12.5, hfov: 39.6, sx: 0,     sy: 0,     title: 1,
    m: { hfov: 17, dist: 11.5, sy: 0.02 } },
];

const deg = Math.PI / 180;

// Turn a shot into flat numbers for the current screen shape.
export function shotForAspect(shot, aspect) {
  const portrait = aspect < 0.9;
  const s = portrait ? { ...shot, ...shot.m } : shot;
  // keep the horizontal framing; never let the vertical FOV collapse on ultra-wide screens
  let vfov = 2 * Math.atan(Math.tan((s.hfov * deg) / 2) / aspect) / deg;
  vfov = Math.max(vfov, 21);
  return {
    tx: s.target[0], ty: s.target[1], tz: s.target[2],
    theta: s.theta, elev: s.elev, dist: s.dist, fov: vfov,
    sx: portrait ? 0 : s.sx, sy: s.sy,
    titleOpacity: s.title,
  };
}
