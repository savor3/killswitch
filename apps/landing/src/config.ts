// Where the page's links go. The app runs on Base Sepolia (testnet) for now.
export const APP_URL = "https://killswitch.168-144-156-16.sslip.io/";
export const GITHUB_URL = "https://github.com/savor3/killswitch";
// The repo holds whitepaper v1.0; v1.1 (with the $KILL chapter) is not in the repo yet.
export const WHITEPAPER_URL = "https://github.com/savor3/killswitch/blob/main/docs/Killswitch_Whitepaper.pdf";
// the docs folder: the whitepaper and the technical architecture
export const DOCS_URL = "https://github.com/savor3/killswitch/tree/main/docs";

// The $KILL pre-sale bar in the token section. The target is 10% of the 1B supply at 0.0025 USD (whitepaper
// v1.1). `committed` is in USD: set it by hand, or wire it to the sale contract, once the sale opens; until
// then the bar stands empty and counts down the days.
export const PRESALE = {
  target: 250_000,
  committed: 0,
  opens: "2026-12-03",
};
