# ZyncSwap — Web3 Developer Assessment

Welcome to the ZyncSwap Web3 Developer Assessment.

ZyncSwap is a DEX-style dApp built around the **ZYNC** ERC-20 token. The repo includes a Next.js frontend with wallet connection (viem), server-side API routes, a WebSocket market feed, a Hardhat-deployed token, and helpers for on-chain reads / Uniswap V2-style swap quotes.

This assessment is for **Web3 / dApp engineers** — people who wire wallets, contracts, RPCs, and UI together. Solidity is in scope, but the emphasis is **end-to-end on-chain product work**, not deep protocol design.

Focus on quality over completeness. Submit what you have when time is up.

**Task 1 mint page:** `http://localhost:3000/buy`

---

## Time Consideration

This assessment is scoped for **4–6 hours**. If you hit your limit, submit what you have and use your README to describe what you would finish next.

---

## Getting Started

You need **Node.js 18+**, **npm**, and a browser wallet (e.g. MetaMask) that can connect to a local chain.

```bash
# 1. Fork this repo and clone your fork
git clone https://github.com/YOUR_USERNAME/Blockchain-development-assignment.git
cd Blockchain-development-assignment
npm install

# 2. Set up environment variables
cp .env.example .env

# 3. Start a local Hardhat blockchain (keep this terminal open)
npm run chain

# 4. Deploy the ZyncToken contract (new terminal)
npm run deploy
# Copy the printed address into .env as ZYNC_TOKEN_ADDRESS

# 5. Start the app
npm run dev
# → http://localhost:3000
```

**Wallet setup:** Add Hardhat Local (`http://127.0.0.1:8545`, chain ID `31337`) in MetaMask and import a Hardhat account private key from the `npm run chain` output so you have test ETH.

## Quick Start

1. Run `npm install`.
2. Open Terminal 1 and run `npm run chain`.
3. Open Terminal 2 and run `npm run deploy`.
4. Copy the deployed addresses from the deploy output into `.env` if needed.
5. Run `npm run test:contracts`.
6. Run `npm run dev`.
7. Open `http://localhost:3000/buy` for Task 1 and `http://localhost:3000/swap` for Task 4.

## How To Get Swap Addresses

If you are using this repo locally, do **not** invent `SWAP_ROUTER_ADDRESS` and `WETH_ADDRESS`.
Get them from the `npm run deploy` terminal output:

- `ZyncToken:` -> use as `ZYNC_TOKEN_ADDRESS`
- `MockSwapRouter:` -> use as `SWAP_ROUTER_ADDRESS`
- `MockWETH9:` -> use as `WETH_ADDRESS`

For the current local deployment, the addresses are also written in `.env`.

If you redeploy later, copy the new addresses from the terminal output into `.env` again.

## Implementation Notes

- The `Buy` page now hosts the ZYNC token console: mint, burn, and transfer all wait for receipts and refresh token balance / total supply after confirmation.
- If MetaMask is on the wrong network, the app will try `wallet_switchEthereumChain` first and fall back to `wallet_addEthereumChain` for Hardhat Local (`31337`).
- The `/swap` page now executes the API quote directly on-chain. It will approve ZYNC for the router when allowance is too low, then send the router transaction and wait for the receipt.
- Swap execution requires `SWAP_ROUTER_ADDRESS` and `WETH_ADDRESS`. If either is missing, the page shows an explicit setup message instead of guessing.
- The market/order API routes are marked dynamic so the production build does not prerender runtime-only engine singletons.
- Verified locally with `npm run test:contracts` and `npm run client:build` after installing dependencies.

### Suggested local setup

1. Start the chain with `npm run chain`.
2. Deploy the token with `npm run deploy` and copy the printed address into `.env` as `ZYNC_TOKEN_ADDRESS`.
3. Add the Hardhat network to MetaMask if it is not already present.
4. If you want the swap page to execute, also set `SWAP_ROUTER_ADDRESS` and `WETH_ADDRESS`.

---

## Project Structure

```
├── client/
│   ├── app/                  # Next.js App Router
│   │   ├── (dex)/            # Page routes: /, /swap, /markets, /trade/[id], …
│   │   └── api/              # API routes (no separate Express server)
│   │       ├── v1/config/
│   │       ├── v1/markets/
│   │       ├── v1/orders/
│   │       ├── v1/swap/quote/
│   │       └── v1/wallets/[address]/zync-balance/
│   ├── lib/                  # Server-side helpers
│   │   ├── marketEngine.js   # Simulated markets + Binance WebSocket feed
│   │   ├── matchingEngine.js # In-memory order book + matching
│   │   ├── swapQuote.js      # Uniswap V2-style swap quote + calldata
│   │   ├── zyncBalance.js    # On-chain ZYNC balance via eth_call
│   │   ├── ethCall.js        # Low-level JSON-RPC eth_call helper
│   │   └── config.js         # Environment variable helpers
│   ├── server.js             # Custom Next.js server (adds /ws/markets WebSocket)
│   └── src/
│       ├── wallet/           # WalletContext, connect modal, EIP-6963
│       ├── abi/              # Contract ABIs used by the frontend
│       └── components/       # MintPanel, SwapPanel, etc.
├── contracts/
│   ├── contracts/
│   │   └── ZyncToken.sol     # ERC-20 ZYNC token (mintWithEth, etc.)
│   ├── scripts/deploy.cjs
│   ├── test/
│   └── hardhat.config.cjs
├── .env.example
└── package.json
```

---

## Tasks

### Task 1 — Wallet + Mint Flow (On-Chain UX)

The Buy/Mint UI (`MintPanel`) already talks to `ZyncToken.mintWithEth`. Harden the **wallet → chain → mint → balance** path so it feels like a real dApp:

- Detect wrong network and guide the user to switch to the configured `chain_id` (Hardhat `31337` locally) — e.g. via `wallet_switchEthereumChain` / `wallet_addEthereumChain`
- After a successful mint, wait for the transaction receipt and **refresh** on-chain reads (balance, `totalSupply`)
- Surface clear UX for: wallet not connected, user rejected the tx, RPC/revert errors, and tx pending vs confirmed
- Do not break existing connect / disconnect behaviour in `WalletContext`

---

### Task 2 — Contract + dApp: Burn ZYNC

Extend the token **and** expose it in the UI:

**Contract (`ZyncToken.sol`):**
- `burn(uint256 amount)` — holder burns their own tokens
- `burnFrom(address account, uint256 amount)` — burn using allowance
- Emit `Burned(address indexed from, uint256 amount)`
- Add Hardhat tests covering success, insufficient balance, and allowance cases

**Frontend:**
- Extend `client/src/abi/zync.ts` with the new functions/events
- Add a burn control on the mint/buy surface (or a small adjacent panel): amount input → `walletClient.writeContract` → confirm → refresh balance
- Disable actions when disconnected, on the wrong chain, or when balance is insufficient

---

### Task 3 — Transfer ZYNC (Signing + Validation)

Add an on-chain **Transfer** flow (not paper trading):

- Recipient address + amount inputs
- Validate address format and that the sender has enough ZYNC
- Call ERC-20 `transfer` via the connected wallet
- Show pending / success / failure states and the transaction hash
- After confirmation, refresh the sender balance (and optionally show a short recent-activity line using the hash)

Reuse existing Tailwind styling and wallet primitives — do not invent a second wallet stack.

---

### Task 4 — Swap Quote → On-Chain Execute

The API already exposes Uniswap V2-style quotes:

```
GET /api/v1/swap/quote?tokenIn=…&tokenOut=…&amountIn=…
```

Wire a real execute path on `/swap` (or the existing swap UI):

- Fetch a quote from the API using configured router / token addresses
- Display expected output (and any slippage / min-out fields you choose to support)
- If the path requires an ERC-20 spend, prompt **`approve`** on the token for the router when allowance is too low
- Send the swap transaction using the quote’s `to` / `data` / `value` (or equivalent) via the wallet
- Handle: missing `SWAP_ROUTER_ADDRESS` / `WETH_ADDRESS`, wrong chain, reject, and revert messages

If you cannot run a full Uniswap deployment locally in time, document the expected env setup and implement the client path against the existing quote shape so it is ready when the router is configured.

---

## API Reference

All routes are served by the Next.js app at `http://localhost:3000`.

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/v1/config` | App and chain config (`chain_id`, token address, …) |
| `GET` | `/api/v1/markets` | All markets overview |
| `GET` | `/api/v1/markets/:id` | Market detail — book, trades, candles |
| `WS` | `/ws/markets` | Live market ticks (snapshot + tick) |
| `POST` | `/api/v1/orders` | Place an order (off-chain / paper matching) |
| `GET` | `/api/v1/orders` | List orders |
| `DELETE` | `/api/v1/orders/:id` | Cancel an order |
| `GET` | `/api/v1/wallets/:address/zync-balance` | ZYNC token balance (`eth_call`) |
| `GET` | `/api/v1/swap/quote` | Swap quote and calldata |

Off-chain markets/orders are part of the product shell; **your graded work is the on-chain wallet + contract integration** above.

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run chain` | Start local Hardhat node (keep running) |
| `npm run deploy` | Deploy ZyncToken to localhost |
| `npm run compile` | Compile Solidity contracts |
| `npm run test:contracts` | Run contract tests |
| `npm run dev` | Start Next.js / custom server on port 3000 |
| `npm run client:build` | Production build |
| `npm run start` | Start production server |

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CHAIN_ID` | `31337` | Hardhat local chain ID |
| `RPC_URL` | `http://127.0.0.1:8545` | JSON-RPC endpoint |
| `ZYNC_TOKEN_ADDRESS` | Hardhat default | Deployed token address |
| `PORT` | `3000` | App server port |
| `SWAP_ROUTER_ADDRESS` | — | Uniswap V2 Router address (optional; Task 4) |
| `WETH_ADDRESS` | — | WETH address for swap routing (optional; Task 4) |

---

## Evaluation Criteria

| Area | Weight |
|------|--------|
| Task 1 — Wallet + Mint UX | 25% |
| Task 2 — Burn (contract + UI) | 25% |
| Task 3 — Transfer flow | 25% |
| Task 4 — Swap quote → execute | 25% |

You are also evaluated on:

- Correct use of viem / wallet APIs (reads, writes, receipts, chain switching)
- ABI accuracy and safe handling of amounts (decimals, `parseUnits` / `formatUnits`)
- Error handling for reverts, rejects, and wrong-network cases
- Consistency with existing `WalletContext`, components, and Tailwind UI
- Contract tests where you change Solidity
- Clear commit history and an updated README with run notes / tradeoffs

---

## How To Run

Run the project in this order:

```bash
npm install
```

Terminal 1:

```bash
npm run chain
```

Terminal 2:

```bash
npm run deploy
```

Terminal 3:

```bash
npm run test:contracts
```

Terminal 4:

```bash
npm run dev
```

Open these pages in the browser:

- `http://localhost:3000/buy` for Task 1 mint / burn / transfer
- `http://localhost:3000/swap` for Task 4 swap execution

### MetaMask Setup

1. Add the Hardhat network in MetaMask:
   - RPC URL: `http://127.0.0.1:8545`
   - Chain ID: `31337`
   - Currency symbol: `ETH`
2. Import one of the private keys printed by `npm run chain` so the account has test ETH.
3. Connect MetaMask on the app.
4. If you are on the wrong network, the app will prompt a switch to Hardhat Local automatically.

### How To Mint

1. Go to `http://localhost:3000/buy`
2. Connect MetaMask.
3. Enter an ETH amount in the Mint panel.
4. Click `Mint with ETH`.
5. Confirm the transaction in MetaMask.
6. Wait for the receipt.
7. The page refreshes your ZYNC balance and total supply after confirmation.

### Tradeoffs / Task 4 Router Setup

Swap execution depends on:

- `SWAP_ROUTER_ADDRESS`
- `WETH_ADDRESS`

For local testing I used the mock router and WETH addresses printed by `npm run deploy`. If those variables are missing, the swap page still loads and shows that swap execution is not configured yet instead of crashing.

If I had more time, I would:

- Add stronger parsing for revert reasons and RPC errors in swap execution.
- Add a dedicated recent-activity panel for mint, burn, transfer, and swap hashes.
- Add more end-to-end tests for MetaMask rejection and wrong-network switching.
- Replace the mock router setup with a full local Uniswap deployment if the environment requires it.
- Add a helper that writes deployed addresses into `.env` automatically.

### Proof / Evidence

I captured local proof of the completed flows in the `artifacts/` folder:

- Task 2 and Task 3 screenshot: [artifacts/2and3.png](./artifacts/2and3.png)
- Task 1 demo video: [artifacts/1.mp4](./artifacts/1.mp4)
- Task 4 demo video: [artifacts/4.mp4](./artifacts/4.mp4)

The screenshot shows the mint, burn, and transfer UI after successful confirmations. The videos show the working flow in the browser.

---

## Submission

- Do **not** open a PR to this repo — share your **fork URL**
- In your fork, update this `README.md` to explain:
  - How to run your solution (including MetaMask / Hardhat network setup)
  - What you would improve or finish given more time
  - Any tradeoffs or decisions worth noting (especially around Task 4 router setup)
- Make sure `npm install` → `npm run chain` (separate terminal) → `npm run deploy` → `npm run test:contracts` → `npm run dev` works end-to-end
