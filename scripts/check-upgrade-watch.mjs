import assert from 'node:assert/strict'
import { ccc } from '@ckb-ccc/ccc'
import {
  analyzeScript,
  InspectError,
  parseScript,
  scanAddress,
} from '../src/server/ckb-inspector.ts'
import { checkCkbScript as checkBrowserScript, sampleImmutableScript, sampleTypeScript } from '../src/upgrade-watch.ts'

const type = checkBrowserScript(sampleTypeScript)
assert.equal(type.typeHashReference, true)
assert.equal(type.script.hash_type, 'type')
assert.match(type.summary, /lock authorizes spending.*Type Script also constrains replacement outputs/)

const immutable = checkBrowserScript(sampleImmutableScript)
assert.equal(immutable.typeHashReference, false)
assert.equal(immutable.script.hash_type, 'data1')
assert.match(immutable.summary, /does not follow a replacement code cell/)

for (const hashType of ['data', 'data2']) {
  const check = checkBrowserScript(JSON.stringify({
    code_hash: `0x${'3'.repeat(64)}`,
    hash_type: hashType,
    args: '0x',
  }))
  assert.equal(check.typeHashReference, false)
  assert.equal(check.script.hash_type, hashType)
}

for (const invalid of [
  'not json',
  '[]',
  JSON.stringify({ code_hash: '0x1234', hash_type: 'type', args: '0x' }),
  JSON.stringify({ code_hash: `0x${'a'.repeat(64)}`, hash_type: 'data3', args: '0x' }),
  JSON.stringify({ code_hash: `0x${'a'.repeat(64)}`, hash_type: 'type', args: '0x1' }),
]) {
  assert.throws(() => checkBrowserScript(invalid))
}

assert.throws(() => parseScript({ code_hash: '0x1234', hash_type: 'type', args: '0x' }), InspectError)

const secpLock = {
  code_hash: '0x9bd7e06f3ecf4be0f2fcd2188b23f1b9fcc88e5d4b65a8637b17723bbda3cce8',
  hash_type: 'type',
  args: `0x${'a'.repeat(40)}`,
}
const typeCode = {
  code_hash: `0x${'b'.repeat(64)}`,
  hash_type: 'data1',
  args: '0x',
}
const typeHash = ccc.Script.from({ codeHash: typeCode.code_hash, hashType: typeCode.hash_type, args: typeCode.args }).hash().toLowerCase()
const txHash = `0x${'c'.repeat(64)}`
const codeCell = {
  out_point: { tx_hash: txHash, index: '0x0' },
  block_number: '0x100',
  output: { capacity: '0x2540be400', lock: secpLock, type: typeCode },
}
const tx = {
  hash: txHash,
  inputs: [],
  outputs: [codeCell.output],
  outputs_data: ['0x1234'],
}
const calls = []
const fakeFetch = async (_url, init) => {
  const request = JSON.parse(init.body)
  calls.push(request.method)
  let result
  if (request.method === 'get_cells') result = { objects: [codeCell], last_cursor: '' }
  else if (request.method === 'get_indexer_tip') result = { block_number: '0x100', block_hash: txHash }
  else if (request.method === 'get_transaction') result = { transaction: tx, tx_status: { status: 'committed', block_number: '0x100' } }
  else throw new Error(`Unexpected RPC method ${request.method}`)
  return Response.json({ id: request.id, jsonrpc: '2.0', result })
}

const fixedReport = await analyzeScript({ script: JSON.parse(sampleImmutableScript), network: 'mainnet' }, async () => {
  throw new Error('Fixed hash analysis should not make an RPC request.')
})
assert.equal(fixedReport.reference, 'fixed')
assert.equal(fixedReport.history.complete, true)

const report = await analyzeScript({
  script: { code_hash: typeHash, hash_type: 'type', args: '0x' },
  network: 'mainnet',
}, fakeFetch)
assert.equal(report.reference, 'type')
assert.equal(report.code_cell.out_point.tx_hash, txHash)
assert.equal(report.code_cell.lock_assessment.startsWith('Recognized CKB single-signature lock'), true)
assert.equal(report.history.complete, true)
assert.equal(report.history.versions.length, 1)
assert.equal(report.search.complete, true)
assert.deepEqual(calls, ['get_cells', 'get_indexer_tip', 'get_transaction'])

const emptyReport = await analyzeScript({ script: { code_hash: typeHash, hash_type: 'type', args: '0x' }, network: 'mainnet' }, async (_url, init) => {
  const request = JSON.parse(init.body)
  return Response.json({ id: request.id, result: request.method === 'get_cells' ? { objects: [], last_cursor: '' } : { block_number: '0x100', block_hash: txHash } })
})
assert.equal(emptyReport.code_cell, null)
assert.equal(emptyReport.history.complete, false)
assert.match(emptyReport.summary, /No live Type ID code cell/)

const ambiguousReport = await analyzeScript({ script: { code_hash: typeHash, hash_type: 'type', args: '0x' }, network: 'mainnet' }, async (_url, init) => {
  const request = JSON.parse(init.body)
  return Response.json({ id: request.id, result: request.method === 'get_cells' ? { objects: [codeCell, codeCell], last_cursor: '' } : { block_number: '0x100', block_hash: txHash } })
})
assert.equal(ambiguousReport.code_cell, null)
assert.match(ambiguousReport.history.reason, /Multiple matching/)

let typeIdPages = 0
const cappedReport = await analyzeScript({ script: { code_hash: typeHash, hash_type: 'type', args: '0x' }, network: 'mainnet' }, async (_url, init) => {
  const request = JSON.parse(init.body)
  if (request.method === 'get_indexer_tip') return Response.json({ id: request.id, result: { block_number: '0x100', block_hash: txHash } })
  typeIdPages++
  return Response.json({ id: request.id, result: { objects: Array.from({ length: 100 }, () => ({ output: { type: { ...typeCode, code_hash: `0x${'d'.repeat(64)}` } } })), last_cursor: `0x${typeIdPages}` } })
})
assert.equal(typeIdPages, 20)
assert.equal(cappedReport.search.cells_checked, 2_000)
assert.equal(cappedReport.search.complete, false)
assert.match(cappedReport.summary, /not proof that no matching cell exists/)

await assert.rejects(
  analyzeScript({ script: { code_hash: typeHash, hash_type: 'type', args: '0x' }, network: 'mainnet' }, async () => Response.json({ error: { code: -1, message: 'unavailable' } })),
  (error) => error instanceof InspectError && error.status === 502,
)
await assert.rejects(
  analyzeScript({ script: { code_hash: typeHash, hash_type: 'type', args: '0x' }, network: 'mainnet' }, async () => { throw new Error('offline') }),
  (error) => error instanceof InspectError && error.status === 503,
)

const addressLock = ccc.Script.from({ codeHash: secpLock.code_hash, hashType: secpLock.hash_type, args: secpLock.args })
const address = new ccc.Address(addressLock, 'ckb').toString()
const scan = await scanAddress({ address, network: 'mainnet' }, async (_url, init) => {
  const request = JSON.parse(init.body)
  if (request.method === 'get_cells') return Response.json({ id: request.id, result: { objects: [{ output: { capacity: '0x174876e800', lock: secpLock, type: typeCode } }], last_cursor: '' } })
  if (request.method === 'get_cells_capacity') return Response.json({ id: request.id, result: { capacity: '0x174876e800', block_number: '0x100', block_hash: txHash } })
  throw new Error(`Unexpected address RPC ${request.method}`)
})
assert.equal(scan.returned_cell_count, 1)
assert.equal(scan.total_capacity_shannons, BigInt('0x174876e800').toString())
assert.equal(scan.scripts[0].cell_count, 1)
assert.equal(scan.block.number, '0x100')
assert.equal(scan.block.hash, txHash)

let addressPages = 0
const truncatedScan = await scanAddress({ address, network: 'mainnet' }, async (_url, init) => {
  const request = JSON.parse(init.body)
  if (request.method === 'get_cells_capacity') return Response.json({ id: request.id, result: { capacity: '0x0', block_number: '0x100', block_hash: txHash } })
  addressPages++
  return Response.json({ id: request.id, result: { objects: Array.from({ length: 100 }, () => ({ output: { capacity: '0x1', lock: secpLock, type: null } })), last_cursor: `0x${addressPages}` } })
})
assert.equal(addressPages, 5)
assert.equal(truncatedScan.returned_cell_count, 500)
assert.equal(truncatedScan.truncated, true)
await assert.rejects(scanAddress({ address: 'invalid', network: 'mainnet' }, fakeFetch), InspectError)

console.log('Upgrade Watch parser, scan, chain analysis, history, ambiguity, and provider-error checks passed.')
