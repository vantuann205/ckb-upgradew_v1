# CKB Upgrade Watch

![GitHub stars](https://img.shields.io/github/stars/vantuann205/escrow-templates?style=for-the-badge&logo=github)
![GitHub forks](https://img.shields.io/github/forks/vantuann205/escrow-templates?style=for-the-badge&logo=github)
![GitHub issues](https://img.shields.io/github/issues/vantuann205/escrow-templates?style=for-the-badge)
![Astro](https://img.shields.io/badge/Astro-7.x-BC52EE?style=for-the-badge&logo=astro&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-22.23.4%2B-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)

**A read-only inspection prototype for understanding how CKB scripts reference code, who controls the referenced code cell, and what on-chain replacement history can be verified.**

> **Live demo:** [Open the current Railway site](https://ckbdao-shelter.up.railway.app). This URL currently serves the previous DAO Shelter prototype; an Upgrade Watch deployment is not live yet.

## What it does

- Scan a CKB address for live cells, capacity, and lock/type scripts.
- Accept a Script JSON object and resolve a type-hash code reference to its current code cell.
- Inspect the code cell's lock script as evidence about its upgrade authority.
- Trace a bounded replacement history and link transactions to the CKB Explorer.
- Save a local watchlist in the browser.
- Mark incomplete, capped, or ambiguous results instead of presenting them as proof.

The app queries the selected public CKB RPC and indexer through server API routes. It does not connect to a wallet, sign or submit transactions, calculate token balances, identify real-world owners, monitor in the background, or send alerts. A lock script is on-chain evidence; this prototype does not prove who controls the corresponding keys or whether an organization has disclosed its governance process.

## Run locally

Requirements: Node.js 22.23.4 or newer. Run the commands below from the `ckb-upgradew_v1` directory.

```sh
npm ci
npm run dev
```

Run the checks and create a production build:

```sh
npm test
npm run build
```

## Configuration

The app uses public `ckb.dev` RPC and indexer endpoints by default. Set these optional server environment variables to use other providers:

```text
CKB_MAINNET_RPC_URL
CKB_MAINNET_INDEXER_URL
CKB_TESTNET_RPC_URL
CKB_TESTNET_INDEXER_URL
```

Provider rate limits and availability can affect results. Address scans return at most 500 cells, Type ID searches inspect at most 2,000 live Type ID cells, and history follows at most 25 versions or 100 transaction lookups. A capped result does not prove that no other match exists.

## Project status

This is an MVP prototype. Chain analysis is bounded and read-only. Treat results as an aid for investigation, not as a security audit or a guarantee about an asset or script.

The landing page retains the prior Lapse-derived composition and CKB mark. See [LICENSE-LAPSE.txt](./LICENSE-LAPSE.txt) and [LICENSES-THIRD-PARTY.txt](./LICENSES-THIRD-PARTY.txt) for the retained template and third-party asset licenses.

## References

- [CKB: Data hash vs. type hash](https://docs.nervos.org/docs/tech-explanation/data-type-diff)
- [CKB: Recommended script upgrade workflow](https://docs.nervos.org/docs/script/script-upgrade-workflow)
- [CKB Contract Flow](https://github.com/gpBlockchain/ckb-contract-flow-html)

## Contributing

Issues and focused pull requests are welcome. Please include reproducible steps for bug reports and avoid submitting secrets, private keys, or wallet recovery phrases.
