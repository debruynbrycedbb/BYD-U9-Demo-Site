# BYD Yangwang U9 Xtreme — 3D scroll demo

A one-page site that orbits a live 3D model of the BYD Yangwang U9 Xtreme as you scroll, stopping at each spec: the 496.22 km/h top speed record, 1200V powertrain, 30C Blade Battery, four 30,000 rpm motors, active aero wing, semi-slick tyres and DiSus-X suspension. The car sits on a dark, wet stage under one overhead spotlight.

**Live:** https://debruynbrycedbb.github.io/BYD-U9-Demo-Site/

Independent design demo. Not affiliated with BYD or Yangwang.

## How it's built

- Plain HTML, CSS and JavaScript, no build step. Hosted on GitHub Pages.
- [three.js](https://threejs.org) 0.170.0, loaded from jsDelivr through the import map in `index.html`.
- Fonts: Michroma (headings, numbers) and Inter (labels, body), self-hosted in `assets/fonts` (SIL Open Font License).

| File | What it does |
|---|---|
| `index.html` | Page content: header menu, one `<section>` per stop, footer with credits |
| `css/style.css` | Layout, type, text panel positions, phone layout |
| `js/main.js` | Scene setup, lighting, car loading, scroll → camera, text fades |
| `js/shots.js` | **The camera path.** One camera position per section, from the storyboard |
| `js/wetfloor.js` | Wet concrete floor: mirror reflection broken up by wet/dry patches and ripples |
| `assets/byd_u9.glb` | The red U9 model (meshopt-compressed, 2 MB) |
| `assets/img/` | Loading image (the Blender render), phone version, social share image |

### Changing the camera path

Each entry in `js/shots.js` sets where the camera sits for one section:

- `theta`: angle around the car (0 = front, 90 = car's left side, 180 = rear, 270 = right side)
- `elev`: height angle in degrees, `dist`: distance in metres, `target`: the point it looks at
- `sx` / `sy`: slide the car across the screen to make room for the text
- `m`: overrides for phones (portrait screens)

The camera holds each shot while the text is on screen, then moves to the next one during the second half of each section's scroll.

### Text

All copy is in `index.html`. Big numbers use `<p class="stat">`; the matching `<h2>` is what screen readers and search engines read.

## Publishing

Settings → Pages → Build and deployment → Source: **Deploy from a branch**, Branch: `main`, folder `/ (root)`.

## Credits

- 3D model: [“2024 BYD Yangwang U9”](https://sketchfab.com/3d-models/2024-byd-yangwang-u9-9f9d82e405ca4382a1c9ff442f5862c2) by [Ddiaz Design](https://sketchfab.com/ddiaz-design), licensed under [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/). Recoloured red and staged by Bryce de Bruyn. The model is non-commercial: this site must stay a non-commercial demo, and the modified model is shared under the same license.
- Fonts: Michroma (The Michroma Project Authors) and Inter (The Inter Project Authors), SIL Open Font License 1.1 (see `assets/fonts`).
