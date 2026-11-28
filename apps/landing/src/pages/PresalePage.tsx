import { useFeed } from "../lib/feed";
import { Commitments } from "../presale/Commitments";
import { Proceeds } from "../presale/Proceeds";
import { SaleHero } from "../presale/SaleHero";
import { Shell } from "../site/Shell";

export function PresalePage() {
  // one reader of the sale's record, for the bar and the card at the top and the list of commitments
  const feed = useFeed();
  return (
    <Shell path="/presale" className="pg pg-presale">
      <SaleHero feed={feed} />
      <Commitments state={feed} />
      <Proceeds />
    </Shell>
  );
}
