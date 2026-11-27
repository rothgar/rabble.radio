#!/usr/bin/env bash
# Render the Bluesky banner (3000x1000, shown at 1500x500) in both appearances.
set -euo pipefail
D=$(dirname "$(readlink -f "$0")"); OUTDIR=$(dirname "$D")
for variant in light dark; do
  if [ $variant = light ]; then
    BG='#F1FAEE'; INK='#073B4C'; MUTED='#3D6472'; DOT='#E63946'; ARC='#E63946'; LIVE_BG='#E63946'; LIVE_FG='#FFFFFF'; CARD='#F9C74F'; CARD_INK='#073B4C'; SHADOW='#073B4C'
  else
    BG='#062B38'; INK='#F1FAEE'; MUTED='#B9D1D8'; DOT='#F9C74F'; ARC='#F9C74F'; LIVE_BG='#F0515D'; LIVE_FG='#FFFFFF'; CARD='#F9C74F'; CARD_INK='#073B4C'; SHADOW='#F1FAEE'
  fi
  cat > "$D/banner-$variant.html" <<HTML
<!doctype html><html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@500;600&display=swap" rel="stylesheet">
<style>
@font-face{font-family:Fraunces;src:url(../../../public/fonts/fraunces-black.ttf);font-weight:900}
html,body{margin:0;width:3000px;height:1000px;overflow:hidden}
body{background:$BG;color:$INK;font-family:Inter,system-ui,sans-serif;position:relative}
/* faint radio-wave arcs bleeding off the right edge, the mark's motif at page scale */
.waves{position:absolute;right:-480px;top:-540px;width:1900px;height:1900px}
/* text starts where it sat beside the mark, clear of the avatar Bluesky lays over the lower-left corner */
.wrap{position:absolute;left:850px;top:0;height:1000px;display:flex;align-items:center}
.text{display:flex;flex-direction:column;gap:34px}
.word{font-family:Fraunces;font-weight:900;font-size:300px;line-height:.86;letter-spacing:-.015em;font-variation-settings:"SOFT" 100,"WONK" 0;margin:0}
.tag{font-size:76px;font-weight:500;color:$MUTED;margin:0;letter-spacing:-.005em}
.row{display:flex;align-items:center;gap:28px;margin-top:10px}
.live{display:inline-flex;align-items:center;gap:22px;background:$LIVE_BG;color:$LIVE_FG;font-weight:600;font-size:46px;letter-spacing:.08em;padding:18px 40px;border-radius:16px}
.live i{width:26px;height:26px;border-radius:50%;background:#fff;display:inline-block}
.chip{display:inline-flex;align-items:center;background:$CARD;color:$CARD_INK;font-weight:600;font-size:46px;padding:18px 40px;border-radius:16px;box-shadow:10px 10px 0 $SHADOW}
</style></head><body>
<svg class="waves" viewBox="0 0 1024 1024" fill="none" stroke="$ARC" stroke-linecap="round" opacity=".13">
  <path d="M 477.07 283.94 A 167.20 167.20 0 0 1 617.53 513.13" stroke-width="58.5"/>
  <path d="M 472.09 175.77 A 274.90 274.90 0 0 1 684.90 612.08" stroke-width="58.5"/>
  <path d="M 466 68 A 382 382 0 0 1 752 711" stroke-width="58.5"/>
</svg>
<div class="wrap">
  <div class="text">
    <h1 class="word">rabble radio</h1>
    <p class="tag">Live audio spaces for Bluesky</p>
    <div class="row"><span class="live"><i></i>LIVE</span><span class="chip">rabble.radio</span></div>
  </div>
</div>
</body></html>
HTML
  google-chrome --headless=new --no-sandbox --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
    --window-size=3000,1000 --virtual-time-budget=4000 --screenshot="$OUTDIR/bluesky-banner-$variant.png" "file://$D/banner-$variant.html" 2>/dev/null
  echo "wrote $OUTDIR/bluesky-banner-$variant.png"
done
magick identify "$OUTDIR"/bluesky-banner-*.png
