"""Generate the built-in "Lumi" sticker pack (backend/chatapp/static/stickers/lumi/*.svg).

Flat SVGs with no text and no filters. Each sticker animates with CSS inside the
SVG (browsers play it when the file is shown with <img>); the animations play a
few times and end on the rest pose, and stop under prefers-reduced-motion.
Renderers without CSS animation (expo-image on iOS/Android) draw the rest pose,
so every static attribute lives on the elements, never in the <style>.

Usage: python scripts/generate_stickers.py [output_dir]
After adding a sticker, also list it in backend/chatapp/sticker_packs.json.
"""
import os
import sys

DEFAULT_OUT = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "..", "backend", "chatapp", "static", "stickers", "lumi"
)

NAVY = "#17324a"
NAVY_DARK = "#0d1c2b"
TEAL = "#1b7f79"
PINK = "#ecb1d0"
PEACH = "#f5cfb1"
CREAM = "#fffdfa"
GOLD = "#f2b93b"
RED = "#e05a47"
TEAR = "#8fd3e8"

BODY = (
    f'<path d="M128 56c50 0 84 34 84 84 0 48-34 76-84 76s-84-28-84-76c0-50 34-84 84-84z" fill="{NAVY}"/>'
    f'<path d="M150 62c8-24 32-32 50-24-4 20-26 34-50 24z" fill="{PINK}"/>'
    f'<path d="M150 62c14-6 28-14 40-20" stroke="{NAVY}" stroke-width="3" fill="none" stroke-linecap="round"/>'
    f'<ellipse cx="102" cy="216" rx="20" ry="9" fill="{TEAL}"/>'
    f'<ellipse cx="154" cy="216" rx="20" ry="9" fill="{TEAL}"/>'
)
CHEEKS = (
    f'<ellipse cx="82" cy="156" rx="11" ry="6" fill="{PINK}" opacity=".85"/>'
    f'<ellipse cx="174" cy="156" rx="11" ry="6" fill="{PINK}" opacity=".85"/>'
)


def g(cls, *parts):
    return f'<g class="{cls}">' + "".join(parts) + "</g>"


def eyes(dx=0, dy=0):
    return g(
        "eyes",
        f'<ellipse cx="104" cy="128" rx="14" ry="17" fill="{CREAM}"/>'
        f'<ellipse cx="152" cy="128" rx="14" ry="17" fill="{CREAM}"/>'
        f'<circle cx="{106 + dx}" cy="{131 + dy}" r="8" fill="{NAVY_DARK}"/>'
        f'<circle cx="{154 + dx}" cy="{131 + dy}" r="8" fill="{NAVY_DARK}"/>'
        f'<circle cx="{109 + dx}" cy="{127 + dy}" r="2.6" fill="{CREAM}"/>'
        f'<circle cx="{157 + dx}" cy="{127 + dy}" r="2.6" fill="{CREAM}"/>',
    )


def happy_eyes():
    return (
        f'<path d="M92 132q12-16 24 0" stroke="{CREAM}" stroke-width="6" fill="none" stroke-linecap="round"/>'
        f'<path d="M140 132q12-16 24 0" stroke="{CREAM}" stroke-width="6" fill="none" stroke-linecap="round"/>'
    )


def closed_eyes():
    return (
        f'<path d="M92 130q12 10 24 0" stroke="{CREAM}" stroke-width="6" fill="none" stroke-linecap="round"/>'
        f'<path d="M140 130q12 10 24 0" stroke="{CREAM}" stroke-width="6" fill="none" stroke-linecap="round"/>'
    )


def smile(open_=False):
    if open_:
        return (
            f'<path d="M108 156q20 30 40 0z" fill="{NAVY_DARK}"/>'
            f'<path d="M116 166q12 10 24 0q-12-6-24 0z" fill="{RED}"/>'
        )
    return f'<path d="M112 158q16 14 32 0" stroke="{CREAM}" stroke-width="5" fill="none" stroke-linecap="round"/>'


def heart(cx, cy, s, fill=RED):
    return (
        f'<path transform="translate({cx} {cy}) scale({s / 10})" '
        f'd="M0 8C-6 3-10 0-10-4a5 5 0 0 1 10-2 5 5 0 0 1 10 2c0 4-4 7-10 12z" fill="{fill}"/>'
    )


def sparkle(cx, cy, r, fill=GOLD):
    return (
        f'<path d="M{cx} {cy - r}Q{cx + r * .18} {cy - r * .18} {cx + r} {cy}'
        f'Q{cx + r * .18} {cy + r * .18} {cx} {cy + r}Q{cx - r * .18} {cy + r * .18} {cx - r} {cy}'
        f'Q{cx - r * .18} {cy - r * .18} {cx} {cy - r}z" fill="{fill}"/>'
    )


def arm(x, y, angle, length=34):
    return (
        f'<g transform="translate({x} {y}) rotate({angle})">'
        f'<rect x="-4" y="-11" width="{length + 8}" height="22" rx="11" fill="{NAVY}"/>'
        f'<circle cx="{length}" cy="0" r="12" fill="{TEAL}"/></g>'
    )


# Shared CSS. `fill-box` pivots on the element's own box; `view-box` pivots use
# viewBox coordinates (for arms that rotate about a shoulder).
BASE_CSS = (
    ".eyes,.pulse,.tw,.tw2,.spin,.bob,.rise,.rise2,.rise3,.drip,.flash,.hop,.shake,.breathe,.bounce,.fall,.fall2,.tilt"
    "{transform-box:fill-box;transform-origin:50% 50%}"
    ".hop,.shake,.breathe,.bounce,.tilt{transform-origin:50% 100%}"
    ".eyes{animation:blink 2.6s ease-in-out 3}"
    "@keyframes blink{0%,86%,100%{transform:scaleY(1)}91%{transform:scaleY(.12)}}"
    ".tw{animation:twinkle 1.3s ease-in-out 4}.tw2{animation:twinkle 1.3s ease-in-out .45s 4}"
    "@keyframes twinkle{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(.45);opacity:.5}}"
    "@media (prefers-reduced-motion:reduce){*{animation:none!important}}"
)


def svg(label, css, *parts):
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" '
        f'width="256" height="256" role="img" aria-label="{label}">'
        f"<title>{label}</title><style>{BASE_CSS}{css}</style>" + "".join(parts) + "</svg>\n"
    )


RISE = (
    "@keyframes rise{0%{transform:translateY(0);opacity:1}70%{transform:translateY(-18px);opacity:0}"
    "71%{transform:translateY(0);opacity:0}100%{transform:translateY(0);opacity:1}}"
)

STICKERS = {
    "wave": ("Hello", (
        ".wv{transform-box:view-box;transform-origin:196px 132px;animation:wave 1.1s ease-in-out 4}"
        "@keyframes wave{0%,100%{transform:rotate(0)}25%{transform:rotate(-16deg)}75%{transform:rotate(10deg)}}"
        ".lines{animation:fade 1.1s ease-in-out 4}"
        "@keyframes fade{0%,100%{opacity:1}50%{opacity:.25}}"
    ), [
        g("lines", f'<path d="M206 66q14 10 12 28M220 52q22 16 18 46" stroke="{TEAL}" stroke-width="6" fill="none" stroke-linecap="round"/>'),
        BODY, g("wv", arm(196, 132, -60, 40)), arm(60, 160, 150, 22), eyes(), CHEEKS, smile(open_=True),
    ]),
    "thumbs-up": ("Nice", (
        ".bob{animation:thumb 1.2s ease-in-out 3}"
        "@keyframes thumb{0%,60%,100%{transform:translateY(0) rotate(0)}25%{transform:translateY(-8px) rotate(-8deg)}}"
    ), [
        BODY, arm(60, 160, 150, 22),
        g("bob",
          f'<g transform="translate(196 148)"><rect x="-4" y="-11" width="30" height="22" rx="11" fill="{NAVY}"/>'
          f'<rect x="14" y="-18" width="30" height="30" rx="10" fill="{TEAL}"/>'
          f'<rect x="20" y="-44" width="13" height="32" rx="6.5" fill="{TEAL}"/></g>'),
        eyes(), CHEEKS, smile(),
        g("tw", sparkle(224, 72, 12)),
    ]),
    "love": ("Love it", (
        ".pulse{animation:pulse .9s ease-in-out 5}"
        "@keyframes pulse{0%,100%{transform:scale(1)}40%{transform:scale(1.22)}}"
        ".rise{animation:rise 2s ease-out 3}.rise2{animation:rise 2s ease-out .6s 3}.rise3{animation:rise 2s ease-out 1.2s 3}"
        + RISE
    ), [
        BODY, arm(60, 162, 150, 22), arm(196, 162, 30, 22),
        g("pulse", heart(104, 126, 15)), g("pulse", heart(152, 126, 15)), CHEEKS, smile(open_=True),
        g("rise", heart(58, 66, 11, PINK)), g("rise2", heart(212, 44, 14, RED)), g("rise3", heart(40, 108, 7, RED)),
    ]),
    "laugh": ("Haha", (
        ".shake{animation:shake .5s ease-in-out 7}"
        "@keyframes shake{0%,100%{transform:rotate(0)}25%{transform:rotate(-4deg)}75%{transform:rotate(4deg)}}"
        ".drip{animation:drip 1s ease-in 4}"
        "@keyframes drip{0%,100%{transform:translateY(0);opacity:1}60%{transform:translateY(8px);opacity:.3}}"
    ), [
        g("shake",
          BODY, arm(60, 150, 200, 26), arm(196, 150, -20, 26), happy_eyes(), CHEEKS,
          f'<path d="M100 152q28 46 56 0z" fill="{NAVY_DARK}"/>'
          f'<path d="M112 170q16 14 32 0q-16-8-32 0z" fill="{RED}"/>',
          g("drip",
            f'<path d="M84 140q-10 12-4 20q8 2 8-8z" fill="{TEAR}"/>'
            f'<path d="M172 140q10 12 4 20q-8 2-8-8z" fill="{TEAR}"/>')),
    ]),
    "sad": ("Oh no", (
        ".drip{animation:fall 1.6s ease-in 3}"
        "@keyframes fall{0%{transform:translateY(0);opacity:1}70%{transform:translateY(22px);opacity:0}"
        "71%{transform:translateY(0);opacity:0}100%{transform:translateY(0);opacity:1}}"
    ), [
        BODY, arm(62, 168, 130, 20), arm(194, 168, 50, 20),
        f'<path d="M90 114l24 8M166 114l-24 8" stroke="{CREAM}" stroke-width="5" stroke-linecap="round"/>',
        eyes(dy=4), CHEEKS,
        f'<path d="M112 168q16-12 32 0" stroke="{CREAM}" stroke-width="5" fill="none" stroke-linecap="round"/>',
        g("drip", f'<path d="M98 146q-8 14 0 22q8-8 0-22z" fill="{TEAR}"/>'),
    ]),
    "thinking": ("Hmm", (
        ".tilt{animation:tilt 1.4s ease-in-out 3}"
        "@keyframes tilt{0%,100%{transform:rotate(0) translateY(0)}30%{transform:rotate(-10deg) translateY(-4px)}"
        "65%{transform:rotate(8deg) translateY(0)}}"
    ), [
        BODY, arm(60, 160, 150, 22),
        f'<g transform="translate(176 176) rotate(-150)"><rect x="-4" y="-11" width="34" height="22" rx="11" fill="{NAVY}"/>'
        f'<circle cx="30" cy="0" r="12" fill="{TEAL}"/></g>',
        eyes(dx=4, dy=-6), CHEEKS,
        f'<path d="M116 162h26" stroke="{CREAM}" stroke-width="5" stroke-linecap="round"/>',
        g("tilt",
          f'<path d="M196 50q0-18 18-18t18 16q0 12-14 18q-4 2-4 12" stroke="{GOLD}" stroke-width="9" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'
          f'<circle cx="214" cy="98" r="6" fill="{GOLD}"/>'),
    ]),
    "wow": ("Wow", (
        ".hop{animation:hop 1s cubic-bezier(.3,.7,.4,1) 3}"
        "@keyframes hop{0%,55%,100%{transform:translateY(0) scale(1)}20%{transform:translateY(-12px) scale(1.03,.97)}}"
        ".flash{animation:flash 1s ease-in-out 3}"
        "@keyframes flash{0%,100%{opacity:1;transform:scale(1)}20%{opacity:.2;transform:scale(.8)}}"
    ), [
        g("hop",
          BODY, arm(60, 140, 210, 30), arm(196, 140, -30, 30),
          f'<ellipse cx="104" cy="126" rx="16" ry="19" fill="{CREAM}"/><ellipse cx="152" cy="126" rx="16" ry="19" fill="{CREAM}"/>'
          f'<circle cx="104" cy="127" r="6" fill="{NAVY_DARK}"/><circle cx="152" cy="127" r="6" fill="{NAVY_DARK}"/>',
          CHEEKS,
          f'<ellipse cx="128" cy="168" rx="11" ry="14" fill="{NAVY_DARK}"/>'),
        g("flash", f'<path d="M128 18v22M88 30l10 18M168 30l-10 18" stroke="{GOLD}" stroke-width="7" stroke-linecap="round"/>'),
    ]),
    "sleepy": ("Good night", (
        ".breathe{animation:breathe 2.4s ease-in-out 3}"
        "@keyframes breathe{0%,100%{transform:scale(1)}50%{transform:scale(1.035,.975)}}"
        ".rise{animation:rise 2.4s ease-out 3}.rise2{animation:rise 2.4s ease-out .8s 3}"
        + RISE
    ), [
        f'<path d="M58 26a26 26 0 1 0 30 34a22 22 0 1 1-30-34z" fill="{GOLD}"/>',
        g("breathe", BODY, arm(62, 168, 130, 20), arm(194, 168, 50, 20), closed_eyes(), CHEEKS,
          f'<ellipse cx="128" cy="164" rx="7" ry="5" fill="{NAVY_DARK}"/>'),
        g("rise", f'<path d="M180 52h18l-18 20h18" stroke="{TEAL}" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'),
        g("rise2", f'<path d="M206 22h14l-14 15h14" stroke="{TEAL}" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'),
    ]),
    "party": ("Party", (
        ".bounce{animation:bounce .7s ease-in-out 5}"
        "@keyframes bounce{0%,100%{transform:translateY(0) scale(1)}45%{transform:translateY(-10px) scale(1.02,.98)}}"
        ".fall{animation:confetti 1.4s ease-in 3}.fall2{animation:confetti 1.4s ease-in .5s 3}"
        "@keyframes confetti{0%{transform:translateY(0) rotate(0);opacity:1}75%{transform:translateY(16px) rotate(90deg);opacity:0}"
        "76%{transform:translateY(0) rotate(0);opacity:0}100%{transform:translateY(0) rotate(0);opacity:1}}"
    ), [
        g("fall",
          f'<rect x="40" y="40" width="10" height="16" rx="3" fill="{PINK}" transform="rotate(-20 45 48)"/>'
          f'<rect x="212" y="96" width="10" height="16" rx="3" fill="{GOLD}" transform="rotate(25 217 104)"/>'
          f'<circle cx="230" cy="150" r="5" fill="{PINK}"/>'),
        g("fall2",
          f'<rect x="28" y="120" width="10" height="16" rx="3" fill="{TEAL}" transform="rotate(30 33 128)"/>'
          f'<circle cx="214" cy="40" r="6" fill="{TEAL}"/><circle cx="66" cy="18" r="5" fill="{GOLD}"/>'),
        g("bounce",
          BODY,
          f'<path d="M102 66l30-56l26 50z" fill="{GOLD}"/>'
          f'<path d="M110 50l40 6M120 32l22 4" stroke="{RED}" stroke-width="6" stroke-linecap="round"/>'
          f'<circle cx="132" cy="10" r="8" fill="{PINK}"/>',
          arm(60, 140, 210, 30), arm(196, 140, -30, 30), happy_eyes(), CHEEKS, smile(open_=True)),
    ]),
    "star": ("Well done", (
        ".spin{animation:spin 1.6s ease-in-out 3}"
        "@keyframes spin{0%{transform:rotate(0) scale(1)}50%{transform:rotate(36deg) scale(1.15)}100%{transform:rotate(72deg) scale(1)}}"
    ), [
        BODY, arm(64, 170, 140, 16), eyes(dx=2, dy=-2), CHEEKS, smile(),
        f'<g transform="translate(200 130)"><rect x="-4" y="-11" width="22" height="22" rx="11" fill="{NAVY}" transform="rotate(-40)"/></g>',
        # A five-pointed star turned by 72deg looks the same, so three turns end on the rest pose.
        g("spin", f'<path d="M206 64l11 23 25 3-18 17 5 25-23-12-23 12 5-25-18-17 25-3z" fill="{GOLD}" stroke="{NAVY_DARK}" stroke-width="3" stroke-linejoin="round"/>'),
        g("tw", sparkle(40, 62, 13)), g("tw2", sparkle(230, 40, 9, PINK)),
    ]),
    "study": ("Studying", (
        ".bob{animation:read 1.8s ease-in-out 3}"
        "@keyframes read{0%,100%{transform:translateY(0) rotate(0)}50%{transform:translateY(-3px) rotate(-2deg)}}"
    ), [
        BODY, eyes(dy=6), CHEEKS,
        g("bob",
          f'<path d="M78 170l50 10 50-10v38l-50 10-50-10z" fill="{CREAM}" stroke="{NAVY_DARK}" stroke-width="3" stroke-linejoin="round"/>'
          f'<path d="M128 180v38" stroke="{NAVY_DARK}" stroke-width="3"/>'
          f'<path d="M90 184l26 5M90 194l26 5M140 189l26-5M140 199l26-5" stroke="{TEAL}" stroke-width="3" stroke-linecap="round"/>'
          f'<circle cx="80" cy="184" r="11" fill="{TEAL}"/><circle cx="176" cy="184" r="11" fill="{TEAL}"/>'),
        g("tw", sparkle(212, 66, 11)),
    ]),
    "coffee": ("Coffee chat", (
        ".rise{animation:steam 1.6s ease-out 3}.rise2{animation:steam 1.6s ease-out .5s 3}"
        "@keyframes steam{0%{transform:translateY(0);opacity:1}70%{transform:translateY(-10px);opacity:0}"
        "71%{transform:translateY(0);opacity:0}100%{transform:translateY(0);opacity:1}}"
    ), [
        BODY, arm(60, 160, 150, 22), eyes(dx=2), CHEEKS, smile(),
        f'<path d="M168 152h40v34q0 14-14 14h-12q-14 0-14-14z" fill="{PEACH}" stroke="{NAVY_DARK}" stroke-width="3"/>'
        f'<path d="M208 160q14 0 14 12t-14 12" stroke="{NAVY_DARK}" stroke-width="5" fill="none"/>',
        g("rise", f'<path d="M178 140q-6-10 0-18t0-18" stroke="{TEAL}" stroke-width="5" fill="none" stroke-linecap="round"/>'),
        g("rise2", f'<path d="M196 140q-6-10 0-18t0-18" stroke="{TEAL}" stroke-width="5" fill="none" stroke-linecap="round"/>'),
        f'<circle cx="166" cy="176" r="11" fill="{TEAL}"/>',
    ]),
}


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_OUT
    os.makedirs(out, exist_ok=True)
    for sticker_id, (label, css, parts) in STICKERS.items():
        with open(os.path.join(out, f"{sticker_id}.svg"), "w", encoding="utf-8", newline="\n") as handle:
            handle.write(svg(label, css, *parts))
    print(len(STICKERS), "stickers written to", os.path.normpath(out))


if __name__ == "__main__":
    main()
