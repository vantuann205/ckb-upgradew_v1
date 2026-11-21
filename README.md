# CKB Upgrade Watch

A read-only CKB inspection prototype. Scan an address for live cell capacity and scripts, or paste a Script JSON object to resolve a current Type ID code cell, inspect its lock, and trace a bounded replacement history.

The app queries the selected public CKB RPC and indexer through server API routes. It does not connect to a wallet, sign transactions, calculate token balances, identify real-world owners, monitor in the background, or send alerts. Unrecognized locks and incomplete chain evidence are labeled as unknown or partial. Saved watchlist entries stay in browser local storage. Do not paste secrets.

Lookup bounds: address scans return at most 500 cells, Type ID searches inspect at most 2,000 live Type ID cells, and history follows at most 25 versions or 100 transaction lookups. A capped or ambiguous result is not treated as proof that no match exists.

The landing page retains the prior Lapse-derived composition and existing CKB mark. See [LICENSE-LAPSE.txt](./LICENSE-LAPSE.txt) and [LICENSES-THIRD-PARTY.txt](./LICENSES-THIRD-PARTY.txt) for the retained template licenses.

## Run locally

Requires Node.js 22.12 or newer.

```sh
npm install
npm run dev
```

Run the parser, API fixture checks, and production build:

```sh
npm test
npm run build
```

## References

- [CKB: Data hash vs. type hash](https://docs.nervos.org/docs/tech-explanation/data-type-diff)
- [CKB: Recommended script upgrade workflow](https://docs.nervos.org/docs/script/script-upgrade-workflow)
- [CKB Contract Flow](https://github.com/gpBlockchain/ckb-contract-flow-html)

## Provider configuration

Optional server environment variables:

```text
CKB_MAINNET_RPC_URL
CKB_MAINNET_INDEXER_URL
CKB_TESTNET_RPC_URL
CKB_TESTNET_INDEXER_URL
```

Defaults use the public `ckb.dev` endpoints. Deployments should set trusted providers with suitable rate limits.
