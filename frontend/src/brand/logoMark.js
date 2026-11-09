// The LangVoyage mark (a white L on a teal chat bubble): one source of truth for the web component (CoachAvatar) and
// for every exported icon (scripts/build-brand-icons.js -> frontend/public, mobile/assets).
// Drawn on a 512 x 512 grid. All shapes sit inside the rounded tile, so no clipping is needed.

export const LOGO_SIZE = 512;
export const LOGO_TILE_RADIUS = 136;

export const LOGO_COLORS = {
  tile: "#0d1c2b",
  navy: "#17324a",
  teal: "#1b7f79",
  blush: "#ecb1d0",
  letter: "#ffffff",
};

export const LOGO_SHAPES = [
  {
    tag: "path",
    attrs: {
      d: "M78 150 C86 86 130 52 196 60 L318 76 C380 84 410 128 402 190 L384 330 C376 392 330 420 268 412 L146 396 C84 388 52 344 60 282 Z",
      fill: LOGO_COLORS.navy,
    },
  },
  // The teal pill is a chat message: a rounded bubble with a tail at the bottom-left.
  {
    tag: "rect",
    attrs: {
      x: 120,
      y: 300,
      width: 300,
      height: 150,
      rx: 75,
      fill: LOGO_COLORS.teal,
      transform: "rotate(-7 270 375)",
    },
  },
  {
    tag: "path",
    attrs: {
      d: "M150 400 L112 470 L218 438 Z",
      fill: LOGO_COLORS.teal,
      stroke: LOGO_COLORS.teal,
      strokeWidth: 20,
      strokeLinejoin: "round",
      transform: "rotate(-7 270 375)",
    },
  },
  { tag: "circle", attrs: { cx: 392, cy: 138, r: 86, fill: LOGO_COLORS.blush } },
  {
    tag: "path",
    attrs: {
      d: "M210 166 V336 H322",
      fill: "none",
      stroke: LOGO_COLORS.letter,
      strokeWidth: 58,
      strokeLinecap: "round",
      strokeLinejoin: "round",
    },
  },
];

const toKebab = (name) => name.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`);

const shapeMarkup = ({ tag, attrs }) =>
  `<${tag} ${Object.entries(attrs)
    .map(([key, value]) => `${toKebab(key)}="${value}"`)
    .join(" ")}/>`;

/**
 * Standalone SVG markup for icon exports.
 * - tileRadius: corner radius of the navy tile (0 = full-bleed square, null = no tile).
 * - background: optional colour painted behind everything (full canvas).
 * - scale: shrinks/grows the shapes around the centre (for safe zones such as maskable icons).
 */
export function logoSvgMarkup({ tileRadius = LOGO_TILE_RADIUS, background = null, scale = 1 } = {}) {
  const offset = (LOGO_SIZE * (1 - scale)) / 2;
  const parts = [];
  if (background) parts.push(`<rect width="${LOGO_SIZE}" height="${LOGO_SIZE}" fill="${background}"/>`);
  if (tileRadius !== null) {
    parts.push(
      `<rect width="${LOGO_SIZE}" height="${LOGO_SIZE}" rx="${tileRadius}" fill="${LOGO_COLORS.tile}"/>`
    );
  }
  parts.push(
    `<g transform="translate(${offset} ${offset}) scale(${scale})">${LOGO_SHAPES.map(shapeMarkup).join("")}</g>`
  );
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${LOGO_SIZE} ${LOGO_SIZE}">${parts.join("")}</svg>`;
}
