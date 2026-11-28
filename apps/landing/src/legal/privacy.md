---
title: Privacy Policy
updated: November 27, 2026
---

This policy explains what the Killswitch website, the Killswitch web app and the Killswitch relay collect, why, and where it goes. “Killswitch”, “we” and “us” mean the team that runs this site and the hosted relay. The short version: no accounts, no cookies, no analytics and no trackers. What we do keep is what the service needs to work, and much of it is public on the blockchain anyway.

## The website

This covers the home page, the docs, the pre-sale page and these legal pages.

- **No cookies, no analytics, no trackers.** The site loads no third-party scripts, and its fonts and images come from the site itself.
- **The server that sends the pages** receives what every web request carries: your IP address, your browser and device type, the page you asked for and the time. Our host may keep this in its logs for a short time, for security and to keep the site running.
- **Storage in your browser.** The site keeps two small notes for the current visit only: whether the opening animation has played, and that you are on your way into the web app. To show the wallet you are connected with, it reads the web app's own note of which wallet you chose and asks that wallet, without a prompt, which account this site may see. All of this stays in your browser.
- **The pre-sale page.** “Add to Calendar” makes the calendar file in your browser. The Google Calendar link opens Google, where Google's privacy policy applies. “Connect wallet” asks your wallet for its public address and keeps the choice in your browser under the web app's own note, so the site and the app share one connection; the address is not sent to us. Commitments are made on the launch platform, under its own terms and privacy policy. When the list of commitments is on, it is read from the sale's public record; commitments are public blockchain transactions.
- **The docs search** runs in your browser. Nothing you type is sent anywhere.

## The web app

- **Your wallet address.** Connecting a wallet shares its public address with the app, and the app sends it to the relay to find your protected wallets. Your wallet's private key and recovery phrase never leave your wallet. We never ask for them.
- **Signatures.** The app asks your wallet to sign transactions (such as creating a protected wallet or granting an agent) and messages (approving or denying a held payment). Signed transactions go to the blockchain.
- **Agent session keys** are made in your browser and shown to you once, so you can give them to your agent. The app does not send them to the relay.
- **Reading the blockchain.** The app and the relay read blockchain data through a public RPC provider; the test network uses `sepolia.base.org`. That provider sees your IP address and the addresses being looked up, under its own privacy policy.
- **Storage in your browser.** The app keeps your settings on your device: which kind of wallet you use, which protected wallet you had open, light or dark, whether notifications are on, and which alerts you have seen. It also keeps a copy of its own files so it opens quickly. Clear your site data to remove them.
- **Notifications.** If you turn them on, your browser shows them; they are made on your device and go through no push service.

## The relay

The relay is the service that checks and submits your agents' operations. To do that and to show you your history, it stores:

- **Operations:** the protected wallet, the agent, the calls, the agent's stated reason, the signatures, the guardian's score, verdict and reasons, any AI review, the transaction hash and the times.
- **Alerts** for each protected wallet, the **names you give your agents**, which addresses each wallet has paid before (to spot a first payment), and which owner each protected wallet belongs to.
- **Test gas.** On the test network the relay sends a new owner a little test ETH, at most once a day per wallet address and per IP address. To enforce that, it keeps the address and the IP address in memory for 24 hours. They are not written to its database.

Much of this is also public: protected wallets, grants, agent operations and transfers are transactions on a public blockchain, which anyone can read and nobody can delete.

## AI review

When AI review is on, the relay sends a grey-zone operation to Anthropic's API, where Claude reviews it. It sends the agent's template (the allowed functions, caps and co-sign lines), the decoded operation and its simulated effect, the risk signals, up to six of the agent's operations from the last hour, and the agent's stated reason. It does not send your wallet's key or the agent's key. [Anthropic's privacy policy](https://www.anthropic.com/legal/privacy) covers what happens there.

## Who else sees data

Besides the providers named above, your wallet software, the blockchain network and its block explorers, and the host of this site each handle data under their own terms. When the pre-sale opens, it runs on a launch platform under that platform's own privacy policy and terms. We don't sell data and don't share it for advertising.

## How long we keep it

Operation history and alerts are kept so you can see your history, for as long as the service runs. Test-gas records are kept in memory for 24 hours. Logs at our host are kept for a short time. Data on the blockchain is permanent; nobody can delete it.

## Your choices

You can use the website without connecting anything. You can disconnect your wallet from the web app at any time, and remove this site's access in your wallet's settings. You can ask us what we hold about a wallet address, or ask us to delete relay records that are not on the blockchain. Some laws give you further rights, such as access, correction and deletion; ask us and we will help.

## Children

Killswitch is not meant for anyone under 18.

## Changes

We will update this page when what we collect changes, and change the date at the top.

## Contact

Questions about privacy: open an issue at [github.com/savor3/killswitch](https://github.com/savor3/killswitch/issues). Don't post private details there; ask for a private channel instead.
