# Product

## Name

CKB Upgrade Watch

## Users

CKB holders deciding whether to rely on a token or script, and users who want to keep track of scripts they care about.

## Purpose

Explain whether a pasted CKB Script references a specific binary hash or resolves code through a type-hash cell. Help holders understand what still needs checking before they rely on an asset.

## MVP boundary

- Scan a CKB address for live cells, CKB capacity, and scripts using mainnet or testnet indexer data.
- Analyze Script JSON and distinguish fixed data references from Type Script references.
- Resolve a matching live Type ID code cell, show its lock, and trace a bounded history through committed transactions.
- Save Scripts and network in browser local storage for manual re-analysis.
- Mark unknown locks, ambiguous matches, capped scans, and incomplete history instead of guessing.
- Do not connect a wallet, sign transactions, calculate arbitrary token balances, identify real-world owners, run background monitoring, or send alerts.

## Lookup limits

- Address scan: 500 cells.
- Type ID search: 2,000 live cells.
- History trace: 25 versions and 100 transaction lookups.
- The selected RPC and indexer are public provider endpoints unless deployment environment variables override them.

## Design principles

- Keep the existing landing-page composition and CKB mark while adapting all copy and diagrams to Upgrade Watch.
- Put the working Script checker first and make limitations visible next to its result.
- Use CKB documentation and transaction evidence as the source of truth, not unexplained risk scores.
- Keep the particle wordmark as branding, not a live network visualization.

## Accessibility

Support keyboard navigation, visible focus, readable contrast, responsive layouts, reduced-motion preferences, and useful content without animation.
