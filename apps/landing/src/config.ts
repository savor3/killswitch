// Where the page's links go. The web app runs on Base Sepolia (testnet) for now, at /app/ on the site's own
// address (the dev server's web app is on port 5175). Sharing the address lets the site see a connected wallet.
export const APP_URL = import.meta.env.DEV ? "http://localhost:5175/" : "/app/";
export const GITHUB_URL = "https://github.com/savor3/killswitch";
// whitepaper v1.1 (with the $KILL chapter), served by the site itself from public/
export const WHITEPAPER_URL = "/killswitch-whitepaper.pdf";
export const DOCS_URL = "/docs";
export const PRESALE_URL = "/presale";

// The $KILL pre-sale, as whitepaper v1.1 chapter 15 sets it out (table 15.4). `committed` is in USD: set it by
// hand, or wire it to the sale, once the sale opens; the bars never show more than what is really committed.
export const PRESALE = {
  target: 250_000, // the hard cap: 100,000,000 $KILL at $0.0025
  committed: 0,
  tokens: 100_000_000,
  price: 0.0025,
  supply: 1_000_000_000,
  opens: "2026-12-03T15:00:00Z",
  tge: "2026-12-09",
  // The sale runs on an established launch platform. When the team names it, put its name and the sale's
  // address here: the page's join button and the "where" line use them, and stay closed until then.
  platform: "",
  joinUrl: "",
  // The sale terms (limits per buyer, platform, eligibility), published before the sale opens.
  termsUrl: "",
  // What the sale takes, as its terms will say (the whitepaper names no currency): the pre-sale card offers these.
  currencies: ["USDC", "USDT"],
  // The record of commitments, as JSON (the shape is in lib/feed.ts): the pre-sale page lists them and fills
  // its bar from it. Empty until the platform is known.
  feedUrl: "",
  // where a commitment's transaction can be looked at
  explorerTx: "https://basescan.org/tx/",
  // The token contract on Base, published at TGE.
  tokenAddress: "",
};
