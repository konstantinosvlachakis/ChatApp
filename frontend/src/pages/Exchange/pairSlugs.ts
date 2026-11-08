// Public language-pair landing pages (/exchange/<slug>). Kept apart from the copy in
// pairs.js so analytics (sanitizePath) and the route lists can use the slugs alone.
export const EXCHANGE_PAIR_SLUGS = ["english-spanish", "greek-spanish", "italian-english"] as const;

export type ExchangePairSlug = (typeof EXCHANGE_PAIR_SLUGS)[number];

export const EXCHANGE_PATH_PREFIX = "/exchange/";

export const isExchangePairSlug = (value: string): value is ExchangePairSlug =>
  (EXCHANGE_PAIR_SLUGS as readonly string[]).includes(value);

export const exchangePairPath = (slug: ExchangePairSlug) => `${EXCHANGE_PATH_PREFIX}${slug}`;
