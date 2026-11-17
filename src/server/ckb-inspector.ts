import { ccc } from '@ckb-ccc/ccc'

export type Network = 'mainnet' | 'testnet'
export type Script = { code_hash: string; hash_type: 'data' | 'data1' | 'data2' | 'type'; args: string }

const TYPE_ID_CODE_HASH = '0x00000000000000000000000000000000000000000000000000545950455f4944'
const PAGE_LIMIT = 100
const ADDRESS_CELL_LIMIT = 500
const TYPE_ID_CELL_LIMIT = 2_000
const HISTORY_LIMIT = 25
const HISTORY_RPC_LIMIT = 100
const NETWORKS = {
  mainnet: {
    rpc: process.env.CKB_MAINNET_RPC_URL || 'https://mainnet.ckb.dev/',
    indexer: process.env.CKB_MAINNET_INDEXER_URL || 'https://mainnet.ckb.dev/',
    client: () => ccc.ClientPublicMainnet.open(),
  },
  testnet: {
    rpc: process.env.CKB_TESTNET_RPC_URL || 'https://testnet.ckb.dev/',
    indexer: process.env.CKB_TESTNET_INDEXER_URL || 'https://testnet.ckb.dev/',
    client: () => ccc.ClientPublicTestnet.open(),
  },
} satisfies Record<Network, { rpc: string; indexer: string; client: () => ccc.Owner<ccc.Client> }>

type Json = Record<string, any>
type RpcFetch = typeof fetch

export class InspectError extends Error {
  readonly status: number
  constructor(message: string, status = 400) { super(message); this.status = status }
}

export function parseScript(value: unknown): Script {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new InspectError('Script must be a JSON object.')
  const script = value as Record<string, unknown>
  if (typeof script.code_hash !== 'string' || !/^0x[\da-fA-F]{64}$/.test(script.code_hash)) throw new InspectError('code_hash must contain exactly 32 bytes.')
  if (!['data', 'data1', 'data2', 'type'].includes(String(script.hash_type))) throw new InspectError('hash_type must be data, data1, data2, or type.')
  if (typeof script.args !== 'string' || script.args.length > 8_194 || !/^0x(?:[\da-fA-F]{2})*$/.test(script.args)) throw new InspectError('args must be even-length hex data, up to 4 KB.')
  return { code_hash: script.code_hash.toLowerCase(), hash_type: script.hash_type as Script['hash_type'], args: script.args.toLowerCase() }
}

function getNetwork(network: unknown): Network {
  if (network !== 'mainnet' && network !== 'testnet') throw new InspectError('Choose mainnet or testnet.')
  return network
}

async function rpc<T>(url: string, method: string, params: unknown[], fetcher: RpcFetch): Promise<T> {
  let response: Response
  try {
    response = await fetcher(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 1, jsonrpc: '2.0', method, params }),
      signal: AbortSignal.timeout(12_000),
    })
  } catch {
    throw new InspectError('The CKB data provider did not respond. Try again shortly.', 503)
  }
  if (!response.ok) throw new InspectError(`The CKB data provider returned HTTP ${response.status}.`, 502)
  let payload: Json
  try { payload = await response.json() as Json } catch { throw new InspectError('The CKB data provider returned invalid JSON.', 502) }
  if (payload.error) throw new InspectError('The CKB data provider could not complete this lookup.', 502)
  return payload.result as T
}

async function cellsForScript(
  endpoint: string,
  script: Json,
  scriptType: 'lock' | 'type',
  mode: 'exact' | 'prefix',
  maximum: number,
  fetcher: RpcFetch,
) {
  const cells: Json[] = []
  let cursor: string | undefined
  do {
    const limit = Math.min(PAGE_LIMIT, maximum - cells.length)
    const page = await rpc<{ objects: Json[]; last_cursor: string }>(endpoint, 'get_cells', [
      { script, script_type: scriptType, script_search_mode: mode, with_data: false },
      'asc', `0x${limit.toString(16)}`, ...(cursor ? [cursor] : []),
    ], fetcher)
    if (!Array.isArray(page?.objects)) throw new InspectError('The CKB indexer returned an unexpected cell page.', 502)
    cells.push(...page.objects)
    cursor = page.last_cursor && page.objects?.length === limit ? page.last_cursor : undefined
  } while (cursor && cells.length < maximum)
  return { cells, truncated: Boolean(cursor) }
}

function toScript(value: Json): Script | null {
  if (!value) return null
  try { return parseScript(value) } catch { return null }
}

function scriptKey(script: Script) { return `${script.code_hash}:${script.hash_type}:${script.args}` }

function toCellGroup(cells: Json[], select: (cell: Json) => Json | null) {
  const grouped = new Map<string, { script: Script; cell_count: number; capacity_shannons: string }>()
  for (const cell of cells) {
    const script = toScript(select(cell))
    if (!script) continue
    const key = scriptKey(script)
    const row = grouped.get(key) ?? { script, cell_count: 0, capacity_shannons: '0' }
    row.cell_count++
    row.capacity_shannons = (BigInt(row.capacity_shannons) + BigInt(cell.output.capacity)).toString()
    grouped.set(key, row)
  }
  return [...grouped.values()].sort((a, b) => b.cell_count - a.cell_count)
}

export async function scanAddress(input: { address: unknown; network: unknown }, fetcher: RpcFetch = fetch) {
  const network = getNetwork(input.network)
  if (typeof input.address !== 'string' || input.address.length > 200) throw new InspectError('Enter a valid CKB address.')
  const config = NETWORKS[network]
  const owner = config.client()
  let lock: Script
  try {
    const address = await ccc.Address.fromString(input.address.trim(), owner.value)
    lock = parseScript({ code_hash: address.script.codeHash, hash_type: address.script.hashType, args: address.script.args })
  } catch (error) {
    if (error instanceof InspectError) throw error
    throw new InspectError('This address is invalid or belongs to the other network.')
  } finally {
    await owner.dispose()
  }

  const searchKey = { script: lock, script_type: 'lock', script_search_mode: 'exact' }
  const [found, capacity] = await Promise.all([
    cellsForScript(config.indexer, lock, 'lock', 'exact', ADDRESS_CELL_LIMIT, fetcher),
    rpc<{ capacity: string; block_hash: string; block_number: string } | null>(config.indexer, 'get_cells_capacity', [searchKey], fetcher),
  ])
  const scripts = toCellGroup(found.cells, (cell) => cell.output.type)
  const locks = toCellGroup(found.cells, (cell) => cell.output.lock)
  return {
    kind: 'address' as const,
    network,
    address: input.address.trim(),
    lock,
    block: capacity ? { number: capacity.block_number, hash: capacity.block_hash } : null,
    total_capacity_shannons: capacity?.capacity ? BigInt(capacity.capacity).toString() : '0',
    returned_cell_count: found.cells.length,
    truncated: found.truncated,
    scripts,
    locks,
  }
}

async function readTransaction(network: Network, hash: string, fetcher: RpcFetch) {
  const result = await rpc<Json>(NETWORKS[network].rpc, 'get_transaction', [hash], fetcher)
  if (!result?.transaction || result.tx_status?.status !== 'committed') return null
  return result
}

function scriptHash(script: Script) {
  return ccc.Script.from({ codeHash: script.code_hash, hashType: script.hash_type, args: script.args }).hash().toLowerCase()
}

async function traceHistory(network: Network, first: Json, typeScript: Script, fetcher: RpcFetch) {
  const history: Json[] = []
  const targetHash = scriptHash(typeScript)
  let current = first
  const seen = new Set<string>()
  const transactions = new Map<string, Promise<Json | null>>()
  let transactionReads = 0
  let complete = false
  const readCachedTransaction = (hash: string) => {
    const cached = transactions.get(hash)
    if (cached) return cached
    if (transactionReads >= HISTORY_RPC_LIMIT) return null
    transactionReads++
    const result = readTransaction(network, hash, fetcher)
    transactions.set(hash, result)
    return result
  }

  for (let step = 0; step < HISTORY_LIMIT; step++) {
    const outPoint = current.out_point
    const key = `${outPoint.tx_hash}:${outPoint.index}`
    if (seen.has(key)) break
    seen.add(key)
    const resultPromise = readCachedTransaction(outPoint.tx_hash)
    if (!resultPromise) return { history: history.reverse(), complete: false, reason: 'History search stopped at the 100-request limit.' }
    const result = await resultPromise
    if (!result) break
    const tx = result.transaction
    const index = Number(BigInt(outPoint.index))
    const output = tx.outputs[index]
    const data = tx.outputs_data[index]
    if (!output || !data || !output.type || scriptHash(parseScript(output.type)) !== targetHash) break
    history.push({
      out_point: outPoint,
      transaction_hash: tx.hash,
      block_number: result.tx_status.block_number,
      data_hash: ccc.hashCkb(ccc.bytesFrom(data)).toLowerCase(),
      lock: parseScript(output.lock),
    })

    let previous: Json | null = null
    const inputs = tx.inputs as Json[]
    for (let offset = 0; offset < inputs.length; offset += 25) {
      const batch = inputs.slice(offset, offset + 25)
      const requests = batch.map((input) => readCachedTransaction(input.previous_output.tx_hash))
      if (requests.some((request) => request === null)) return { history: history.reverse(), complete: false, reason: 'History search stopped at the 100-request limit.' }
      const previousTransactions = await Promise.all(requests as Promise<Json | null>[])
      for (const [index, previousTx] of previousTransactions.entries()) {
        const candidate = batch[index].previous_output
        const previousOutput = previousTx?.transaction.outputs[Number(BigInt(candidate.index))]
        const previousType = toScript(previousOutput?.type)
        if (previousType && scriptHash(previousType) === targetHash) {
          if (previous) return { history: history.reverse(), complete: false, reason: 'More than one predecessor matched this Type Script.' }
          previous = { out_point: candidate }
        }
      }
    }
    if (!previous) { complete = true; break }
    current = previous
  }

  if (history.length === HISTORY_LIMIT) return { history: history.reverse(), complete: false, reason: 'History search stopped at the 25-version limit.' }
  const ordered = history.reverse()
  return { history: ordered, complete, reason: complete ? null : 'The full replacement history could not be verified.' }
}

export async function analyzeScript(input: { script: unknown; network: unknown }, fetcher: RpcFetch = fetch) {
  const network = getNetwork(input.network)
  const script = parseScript(input.script)
  if (script.hash_type !== 'type') return {
    kind: 'script' as const,
    network,
    script,
    reference: 'fixed' as const,
    summary: 'This hash type points to a specific code data hash. A replacement binary has a different hash.',
    code_cell: null,
    history: { versions: [], complete: true, reason: null },
  }

  const config = NETWORKS[network]
  const typeIdScript = { code_hash: TYPE_ID_CODE_HASH, hash_type: 'type', args: '0x' }
  const indexed = await cellsForScript(config.indexer, typeIdScript, 'type', 'prefix', TYPE_ID_CELL_LIMIT, fetcher)
  const matches = indexed.cells.filter((cell) => {
    const type = toScript(cell.output.type)
    return type && scriptHash(type) === script.code_hash
  })
  const indexerTip = await rpc<{ block_number: string; block_hash: string }>(config.indexer, 'get_indexer_tip', [], fetcher).catch(() => null)
  if (matches.length > 1) return {
    kind: 'script' as const,
    network,
    script,
    reference: 'type' as const,
    summary: 'More than one live Type ID code cell matched this script hash. The report cannot choose which lock or history is authoritative.',
    code_cell: null,
    history: { versions: [], complete: false, reason: 'Multiple matching live code cells were found.' },
    search: { cells_checked: indexed.cells.length, complete: !indexed.truncated, block_number: indexerTip?.block_number ?? null, block_hash: indexerTip?.block_hash ?? null },
  }
  const match = matches[0]
  if (!match) return {
    kind: 'script' as const,
    network,
    script,
    reference: 'type' as const,
    summary: indexed.truncated
      ? 'No matching Type ID code cell was found within the search limit. This is not proof that no matching cell exists.'
      : 'No live Type ID code cell with this hash was found. The reference may use a custom Type Script that this MVP cannot resolve.',
    code_cell: null,
    history: { versions: [], complete: false, reason: 'No matching live Type ID code cell was verified.' },
    search: { cells_checked: indexed.cells.length, complete: !indexed.truncated, block_number: indexerTip?.block_number ?? null, block_hash: indexerTip?.block_hash ?? null },
  }

  const typeScript = parseScript(match.output.type)
  const history = await traceHistory(network, match, typeScript, fetcher)
  const current = history.history.at(-1)
  const differences = history.history.slice(1).map((version, index) => ({
    from: history.history[index].data_hash,
    to: version.data_hash,
    code_changed: history.history[index].data_hash !== version.data_hash,
    transaction_hash: version.transaction_hash,
  }))
  return {
    kind: 'script' as const,
    network,
    script,
    reference: 'type' as const,
    summary: 'A live code cell using the matching Type ID was found. Its lock authorizes spending; its Type Script also constrains replacement outputs.',
    code_cell: {
      out_point: match.out_point,
      block_number: match.block_number,
      capacity_shannons: BigInt(match.output.capacity).toString(),
      lock: parseScript(match.output.lock),
      lock_assessment: match.output.lock.code_hash === '0x9bd7e06f3ecf4be0f2fcd2188b23f1b9fcc88e5d4b65a8637b17723bbda3cce8' && match.output.lock.hash_type === 'type' && /^0x[\da-f]{40}$/i.test(match.output.lock.args)
        ? 'Recognized CKB single-signature lock. The args value is a key fingerprint, not a verified real-world identity.'
        : 'Custom or unclassified lock. This report shows its on-chain script but does not identify its controller.',
    },
    history: { versions: history.history, changes: differences, complete: history.complete, reason: history.reason },
    search: { cells_checked: indexed.cells.length, complete: !indexed.truncated, block_number: indexerTip?.block_number ?? null, block_hash: indexerTip?.block_hash ?? null },
    current_data_hash: current?.data_hash ?? null,
  }
}
