// Security, in one section right after How it works: the five ways an agent with a wallet loses money
// (whitepaper, chapter 2) with what stops each one, after the reference's careers list. Above the rows, the
// many paths of the agents' operations run into one contract and leave it as one calm line. A row lights up
// under the pointer: a red gradient comes in from the left, its tag and its outcome decode from binary, and
// the outcome opens out.
import { useState, type CSSProperties } from "react";
import { Converge } from "./Converge";
import { Decode } from "./Decode";
import { Eyebrow } from "./Eyebrow";
import { WordReveal } from "./WordReveal";

const THREATS = [
  {
    tab: "Prompt injection",
    says: "A web page tells your agent to send the full balance, and it signs.",
    stop: "The transfer isn’t on the agent’s allowlist, so the contract refuses it, and the guardian pauses the agent.",
    word: "Rejected",
  },
  {
    tab: "Leaked key",
    says: "The agent’s key leaks, and the thief skips our relay to call the chain directly.",
    stop: "Every limit still holds on-chain. The indexer sees the bypass and pauses the agent before its next move.",
    word: "Capped",
  },
  {
    tab: "Runaway loop",
    says: "A bug retries the same trade a hundred times, each one valid on its own.",
    stop: "The daily cap counts what really left the wallet. Past it, the whole operation reverts.",
    word: "Reverted",
  },
  {
    tab: "Open approvals",
    says: "An app gets an unlimited allowance and pulls the balance months later.",
    stop: "An agent may only approve its own allowed contracts, and no approval may stay open after an operation.",
    word: "Blocked",
  },
  {
    tab: "Server breach",
    says: "A provider’s server is breached, and every user’s limits go with it.",
    stop: "Your limits live in your contract. Our relay, guardian and database can all fall without moving a cap.",
    word: "Still holds",
  },
];

export function Security() {
  return (
    <section className="tl" id="security" aria-labelledby="tl-h">
      <span className="px" aria-hidden="true" />
      <div className="tl-in">
        <div data-rv="fade">
          <Converge />
        </div>
        <div className="tl-head">
          <Eyebrow className="tl-tag">Security</Eyebrow>
          <WordReveal as="h2" id="tl-h" className="tl-h2" text={"How agents lose money,\nand where it *stops.*"} />
          <p className="tl-lead" data-rv="up" style={{ "--rv-i": 2 } as CSSProperties}>
            Five ways an agent with a wallet gets drained. Each one runs into the same wall: limits that live in your own
            contract.
          </p>
        </div>
        <ul className="tl-list">
          {THREATS.map((t, i) => (
            <Row key={t.tab} t={t} i={i} />
          ))}
        </ul>
      </div>
    </section>
  );
}

function Row({ t, i }: { t: (typeof THREATS)[number]; i: number }) {
  const [on, setOn] = useState(false);
  return (
    <li
      className={`tl-row ${on ? "is-on" : ""}`}
      data-rv="up"
      style={{ "--rv-i": i } as CSSProperties}
      tabIndex={0}
      onMouseEnter={() => setOn(true)}
      onMouseLeave={() => setOn(false)}
      onFocus={() => setOn(true)}
      onBlur={() => setOn(false)}
    >
      <span className="tl-kind">
        <Decode text={t.tab} run={on} />
      </span>
      <div className="tl-text">
        <b>{t.says}</b>
        <span>{t.stop}</span>
      </div>
      <span className="tl-out">
        <span className="tl-word">
          <span className="tl-word-c">
            <span className="tl-word-t">
              <Decode text={t.word} run={on} />
            </span>
          </span>
        </span>
        <i aria-hidden="true" />
      </span>
    </li>
  );
}
