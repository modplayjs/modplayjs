# Store assets

What Play Console asks for under **Store listing → Default store listing →
Phone assets / Common text assets**, and where each file comes from.

## The upload folder

`store/upload/` is **git-ignored** and holds exactly the files to drag into the
console. Everything in it is either copied from a committed source or captured
from a device, so losing the folder costs one command, not the assets.

```powershell
# from apps/android
.\scripts\store-assets.ps1                 # icon + feature + screenshots
.\scripts\store-assets.ps1 -SkipCapture    # icon + feature, validate only
```

The script refuses to finish if a file breaks a Play rule (size, ratio, format),
so a rejection on the upload page becomes a message here instead.

## Slots

| slot | file | Play's rule |
| --- | --- | --- |
| App icon | `icon-512.png` | 512 × 512, ≤ 1 MB, PNG/JPEG, 32-bit |
| Feature graphic | `feature-1024x500.png` | 1024 × 500, ≤ 15 MB |
| Phone screenshots | `01-…` to `06-….png` | 2–8 files, PNG/JPEG, ≤ 8 MB each, 16:9 or 9:16, sides 320–3840 px |
| Short description | `listing.md` | ≤ 80 characters |
| Full description | `listing.md` | ≤ 4000 characters |

Four screenshots at 1080 px or more per side are needed for promotion
eligibility, which is why the script pads to 1080 × 1920.

## Screenshots

Captured from a connected phone, one screen per step, with the phone showing
the app at that state. The script asks for each screen in turn:

| file | screen |
| --- | --- |
| `01-home` | Home tab, recent list filled |
| `02-library` | Library tab, a search or format filter set |
| `03-player` | Playing tab, tracker module loaded |
| `04-pattern` | Player header → pattern view |
| `05-folders` | Player, swipe left → folder drawer at the playing file |
| `06-audio` | Player, swipe right → audio panel |

A modern phone is taller than 16:9, so each capture is scaled to fit and centred
on the app's own background (`#0C0A18`) in a 1080 × 1920 canvas. Nothing is
cropped — the full UI stays visible with narrow bars at the sides. That is
within Play's rules and keeps the interface honest, which a screenshot padded
with marketing copy or a fake device frame would not.

Do not add text overlays, device frames or store badges: Play's metadata policy
treats them as misleading if they imply features the app does not have.

On Linux or macOS, the same two steps without PowerShell:

```sh
adb exec-out screencap -p > /tmp/shot.png
magick /tmp/shot.png -background '#0C0A18' -gravity center -extent 1080x1920 \
  store/upload/03-player.png
```

## Icon and feature graphic

Both are rendered from the SVGs next to them, so a design change is re-render
rather than redraw:

```sh
cd apps/android
rsvg-convert -w 512  -h 512 store/icon.svg    -o store/icon-512.png
rsvg-convert -w 1024 -h 500 store/feature.svg -o store/feature-1024x500.png
```

The committed PNGs are what the script copies; keep them current instead of
editing the upload folder by hand.

## Other listing fields

`listing.md` holds the short and full description in English and German, the
category and tags, and the App Content answers (ads, data safety, content
rating, target audience, foreground service, notifications). Privacy policy URL:
<https://modplayjs.github.io/modplayjs/privacy.html>, which is generated from
`apps/android/PRIVACY.md` — see `RELEASE.md`.
