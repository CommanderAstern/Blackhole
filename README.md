# Singularity Lab

A standalone black hole simulation built with plain HTML, CSS, and WebGL2.

## Features

- 3D orbitable camera around the black hole
- sliders for mass, spin, disk density, lensing, turbulence, glow, exposure, zoom, and time flow
- a gravity playground with throw power, orbit assist, rock/probe/comet launch types, and a ring spawner
- drag-to-throw objects that slingshot, orbit, escape, or get swallowed by the event horizon
- toggles for raytracing, bloom halo, chromatic fringe, starfield, and auto orbit
- quick presets for chaos and cinematic mode

## Run

Open `index.html` in a modern desktop browser with WebGL2 enabled.

If your browser is strict about local file access, serve the folder with any static file server and open the local URL instead.

## Cloudflare Pages

This app is set up for Cloudflare Pages Direct Upload.

- Build the deployable bundle with `npm run build`
- Preview it locally with `npm run preview`
- Deploy it with `npm run deploy`

The deploy output is written to `dist/` and includes only the files needed to serve the app:

- `index.html`
- `styles.css`
- `main.js`
- `gravity.js`

### Custom domain

The Pages project custom domain is `blackhole.asimj.com`.

If Cloudflare does not create the DNS record automatically, add this proxied DNS record in the `asimj.com` zone:

- Type: `CNAME`
- Name: `blackhole`
- Target: `blackhole-asimj.pages.dev`

After the CNAME exists, Cloudflare Pages will finish verifying the custom domain and issue the certificate.

### Environment variables

No runtime environment variables are required for this app.
