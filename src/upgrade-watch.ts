export type HashType = 'data' | 'data1' | 'data2' | 'type'

export type CkbScript = {
  code_hash: string
  hash_type: HashType
  args: string
}

export type ScriptCheck = {
  script: CkbScript
  typeHashReference: boolean
  title: string
  summary: string
}

export const sampleTypeScript = JSON.stringify({
  code_hash: '0xd00c84f0ec8fd441c38bc3f87a371f547190f2fcff88e642bc5bf54b9e318323',
  hash_type: 'type',
  args: '0x',
}, null, 2)

export const sampleImmutableScript = JSON.stringify({
  code_hash: `0x${'2'.repeat(64)}`,
  hash_type: 'data1',
  args: '0x',
}, null, 2)

export function checkCkbScript(input: string): ScriptCheck {
  let value: unknown
  try {
    value = JSON.parse(input)
  } catch {
    throw new Error('Paste a valid JSON CKB Script object.')
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('The JSON must be a CKB Script object.')
  }

  const candidate = value as Record<string, unknown>
  const codeHash = candidate.code_hash
  const hashType = candidate.hash_type
  const args = candidate.args

  if (typeof codeHash !== 'string' || !/^0x[\da-fA-F]{64}$/.test(codeHash)) {
    throw new Error('code_hash must be 32 bytes written as 0x followed by 64 hex characters.')
  }
  if (hashType !== 'data' && hashType !== 'data1' && hashType !== 'data2' && hashType !== 'type') {
    throw new Error('hash_type must be data, data1, data2, or type.')
  }
  if (typeof args !== 'string' || args.length > 8_194 || !/^0x(?:[\da-fA-F]{2})*$/.test(args)) {
    throw new Error('args must be even-length hex data of no more than 4 KB.')
  }

  const script = { code_hash: codeHash.toLowerCase(), hash_type: hashType, args: args.toLowerCase() }
  return hashType === 'type'
    ? {
        script,
        typeHashReference: true,
        title: 'Type-hash reference needs a lock check',
        summary: 'This script uses a type-hash reference. A code cell lock authorizes spending; its Type Script also constrains replacement outputs. Analyze the live cell to inspect evidence.',
      }
    : {
        script,
        typeHashReference: false,
        title: 'Code reference is fixed',
        summary: `This ${hashType} reference points to a binary hash, so this script does not follow a replacement code cell.`,
      }
}

const WATCH_KEY = 'ckb-upgrade-watch:saved-scripts:v1'

type SavedScript = { script: CkbScript; network: 'mainnet' | 'testnet' }

function readSavedScripts(): SavedScript[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(WATCH_KEY) ?? '[]')
    if (!Array.isArray(value)) return []
    return value.flatMap((item): SavedScript[] => {
      if (!item || typeof item !== 'object') return []
      const record = item as Record<string, unknown>
      const script = record.script && typeof record.script === 'object'
        ? record.script as Record<string, unknown>
        : record
      try {
        const checked = checkCkbScript(JSON.stringify({ code_hash: script.code_hash, hash_type: script.hash_type, args: script.args ?? '0x' }))
        return [{ script: checked.script, network: record.network === 'testnet' ? 'testnet' : 'mainnet' }]
      } catch { return [] }
    })
  } catch {
    return []
  }
}

export function bindUpgradeWatch() {
  const form = document.querySelector<HTMLFormElement>('#script-check-form')
  const input = document.querySelector<HTMLTextAreaElement>('#script-json')
  const status = document.querySelector<HTMLElement>('#check-status')
  const title = document.querySelector<HTMLElement>('#result-title')
  const summary = document.querySelector<HTMLElement>('#result-summary')
  const state = document.querySelector<HTMLElement>('#result-state')
  const breakdown = document.querySelector<HTMLElement>('#result-breakdown')
  const evidence = document.querySelector<HTMLElement>('#result-evidence')
  const scripts = document.querySelector<HTMLElement>('#result-scripts')
  const addressInput = document.querySelector<HTMLInputElement>('#wallet-address')
  const networkInput = document.querySelector<HTMLSelectElement>('#network-select')
  const submitButton = document.querySelector<HTMLButtonElement>('#inspect-submit')
  const saveButton = document.querySelector<HTMLButtonElement>('#save-script')
  const savedList = document.querySelector<HTMLUListElement>('#saved-script-list')
  const sampleButtons = document.querySelectorAll<HTMLButtonElement>('[data-script-sample]')
  const modeButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-inspect-mode]')]
  const modeFields = [...document.querySelectorAll<HTMLElement>('[data-inspect-field]')]
  if (!form || !input || !status || !title || !summary || !state || !breakdown || !evidence || !scripts || !addressInput || !networkInput || !submitButton || !saveButton || !savedList) return

  let mode: 'address' | 'script' = 'address'
  let lastScript: CkbScript | null = null
  let busy = false
  let saved = readSavedScripts()

  const element = <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) => {
    const node = document.createElement(tag)
    if (className) node.className = className
    if (text) node.textContent = text
    return node
  }
  const setState = (label: string, kind: 'ready' | 'warning' | 'error' | '') => {
    state.textContent = label
    state.dataset.state = kind
  }
  const showError = (message: string) => {
    title.textContent = 'Could not complete the lookup'
    summary.textContent = message
    status.textContent = 'No conclusion was made. Check the input or try again when the chain provider is available.'
    status.dataset.state = 'error'
    setState('Lookup failed', 'error')
    breakdown.hidden = true
    evidence.hidden = true
    scripts.hidden = true
    lastScript = null
    saveButton.disabled = true
  }
  const formatCapacity = (shannons: string) => {
    const value = BigInt(shannons)
    const whole = (value / 100_000_000n).toLocaleString()
    const fraction = (value % 100_000_000n).toString().padStart(8, '0').replace(/0+$/, '')
    return `${whole}${fraction ? `.${fraction}` : ''} CKB`
  }
  const addDetail = (label: string, value: string, link?: string) => {
    const row = element('div')
    row.append(element('dt', '', label))
    const dd = element('dd')
    if (link) {
      const a = element('a', 'evidence-link', value) as HTMLAnchorElement
      a.href = link
      a.target = '_blank'
      a.rel = 'noreferrer noopener'
      dd.append(a)
    } else dd.append(element('code', '', value))
    row.append(dd)
    breakdown.append(row)
  }
  const addEvidence = (label: string, value: string, href?: string) => {
    const row = element('div', 'evidence-row')
    row.append(element('span', '', label))
    if (href) {
      const a = element('a', 'evidence-link', value) as HTMLAnchorElement
      a.href = href
      a.target = '_blank'
      a.rel = 'noreferrer noopener'
      row.append(a)
    } else row.append(element('code', '', value))
    evidence.append(row)
  }
  const explorer = (network: string, hash: string) => `https://${network === 'testnet' ? 'testnet.' : ''}explorer.nervos.org/transaction/${hash}`
  const runAnalyze = async (script: CkbScript, network = networkInput.value) => {
    if (busy) return
    busy = true
    submitButton.disabled = true
    submitButton.textContent = 'Checking…'
    lastScript = script
    breakdown.replaceChildren()
    evidence.replaceChildren()
    scripts.replaceChildren()
    status.dataset.state = ''
    saveButton.disabled = true
    title.textContent = 'Checking chain data…'
    summary.textContent = 'Looking for a matching live code cell and its replacement history.'
    status.textContent = 'Querying the selected CKB network. Larger histories can take longer.'
    setState('Checking', '')
    try {
      const response = await fetch('/api/analyze', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ network, script }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error ?? 'The lookup failed.')
      title.textContent = result.reference === 'fixed' ? 'Code reference is fixed' : result.code_cell ? 'Live code cell found' : 'Type reference needs review'
      summary.textContent = result.summary
      addDetail('Network', network)
      addDetail('Reference', script.hash_type)
      addDetail('Code hash', script.code_hash)
      addDetail('Script args', script.args || '0x')
      evidence.hidden = false
      if (result.code_cell) {
        addEvidence('Live code cell', `${result.code_cell.out_point.tx_hash} · output ${Number(BigInt(result.code_cell.out_point.index))}`, explorer(network, result.code_cell.out_point.tx_hash))
        addEvidence('Created at block', result.code_cell.block_number)
        addEvidence('Cell lock', `${result.code_cell.lock.code_hash} · ${result.code_cell.lock.hash_type}`)
        addEvidence('Lock assessment', result.code_cell.lock_assessment)
        if (result.search?.block_number) addEvidence('Indexer tip block', result.search.block_number)
        if (result.search?.block_hash) addEvidence('Indexer tip hash', result.search.block_hash)
        if (result.history?.versions?.length) {
          const sectionTitle = element('p', 'result-section-title', `Verified code history (${result.history.versions.length} version${result.history.versions.length === 1 ? '' : 's'})`)
          const list = element('div', 'history-list')
          for (const [index, version] of result.history.versions.entries()) {
            const item = element('div', 'history-item')
            const change = result.history.changes?.[index - 1]
            item.append(element('strong', '', `Version ${index + 1} · block ${version.block_number}${change ? ` · ${change.code_changed ? 'code changed' : 'same data hash'}` : ''}`))
            const tx = element('a', '', version.transaction_hash) as HTMLAnchorElement
            tx.href = explorer(network, version.transaction_hash)
            tx.target = '_blank'
            tx.rel = 'noreferrer noopener'
            item.append(tx)
            item.append(element('code', '', `Code data hash ${version.data_hash}`))
            list.append(item)
          }
          evidence.append(sectionTitle, list)
        }
        if (!result.history?.complete) addEvidence('History', result.history?.reason ?? 'History is incomplete; no claim about earlier versions.')
      } else if (result.search) {
        addEvidence('Type ID cells checked', String(result.search.cells_checked))
        addEvidence('Search coverage', result.search.complete ? 'Complete for current live Type ID cells' : 'Search limit reached; more candidates may exist')
        if (result.search.block_number) addEvidence('Indexer tip block', result.search.block_number)
        if (result.search.block_hash) addEvidence('Indexer tip hash', result.search.block_hash)
      }
      breakdown.hidden = false
      const partial = result.history?.complete === false || result.search?.complete === false
      status.textContent = result.reference === 'fixed'
        ? 'Hash type checked. A fixed data hash does not follow a replacement code cell.'
        : partial
          ? 'Partial evidence. The report does not conclude that this code is upgradeable.'
          : 'Live chain data checked. Review the evidence and limits below.'
      status.dataset.state = partial ? 'review' : 'ready'
      setState(partial ? 'Partial evidence' : result.reference === 'fixed' ? 'Hash checked' : 'Verified data', partial ? 'warning' : 'ready')
      saveButton.disabled = false
    } catch (error) { showError(error instanceof Error ? error.message : 'The lookup failed.') }
    finally {
      busy = false
      submitButton.disabled = false
      submitButton.textContent = mode === 'address' ? 'Scan address' : 'Analyze script'
    }
  }

  const renderSaved = () => {
    savedList.replaceChildren()
    for (const item of saved) {
      const row = document.createElement('li')
      const reference = document.createElement('code')
      reference.textContent = `${item.network} · ${item.script.hash_type} · ${item.script.code_hash.slice(0, 10)}…${item.script.code_hash.slice(-6)}`
      const analyze = document.createElement('button')
      analyze.type = 'button'
      analyze.textContent = 'Analyze'
      analyze.setAttribute('aria-label', `Analyze ${item.script.hash_type} script on ${item.network}`)
      analyze.addEventListener('click', () => {
        input.value = JSON.stringify(item.script, null, 2)
        networkInput.value = item.network
        modeButtons.find((button) => button.dataset.inspectMode === 'script')?.click()
        void runAnalyze(item.script, item.network)
      })
      const remove = document.createElement('button')
      remove.type = 'button'
      remove.textContent = 'Remove'
      remove.setAttribute('aria-label', `Remove ${item.script.code_hash} from saved scripts`)
      remove.addEventListener('click', () => {
        const next = saved.filter((entry) => JSON.stringify(entry) !== JSON.stringify(item))
        try {
          localStorage.setItem(WATCH_KEY, JSON.stringify(next))
        } catch {
          status.textContent = 'Browser storage is unavailable. This script could not be removed from saved storage.'
          status.dataset.state = 'error'
          return
        }
        saved = next
        renderSaved()
      })
      row.append(reference, analyze, remove)
      savedList.append(row)
    }
    const empty = document.querySelector<HTMLElement>('#saved-empty')
    if (empty) empty.hidden = saved.length > 0
  }

  sampleButtons.forEach((button) => button.addEventListener('click', () => {
    input.value = button.dataset.scriptSample === 'immutable' ? sampleImmutableScript : sampleTypeScript
    sampleButtons.forEach((item) => item.setAttribute('aria-pressed', String(item === button)))
    if (mode === 'script') form.requestSubmit()
  }))
  modeButtons.forEach((button) => button.addEventListener('click', () => {
    mode = button.dataset.inspectMode === 'script' ? 'script' : 'address'
    modeButtons.forEach((item) => item.setAttribute('aria-pressed', String(item === button)))
    modeFields.forEach((field) => { field.hidden = field.dataset.inspectField !== mode })
    submitButton.textContent = mode === 'address' ? 'Scan address' : 'Analyze script'
    saveButton.disabled = !lastScript
  }))
  saveButton.addEventListener('click', () => {
    if (!lastScript) return
    const next = { script: lastScript, network: networkInput.value as SavedScript['network'] }
    if (saved.some((item) => JSON.stringify(item) === JSON.stringify(next))) {
      status.textContent = 'This script is already saved in this browser.'
      return
    }
    const updated = [next, ...saved]
    try {
      localStorage.setItem(WATCH_KEY, JSON.stringify(updated))
    } catch {
      status.textContent = 'Browser storage is unavailable. This script could not be saved.'
      status.dataset.state = 'error'
      return
    }
    saved = updated
    renderSaved()
    status.textContent = 'Saved on this device. Use Analyze to refresh its chain data.'
  })

  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    if (busy) return
    busy = true
    submitButton.disabled = true
    submitButton.textContent = 'Checking…'
    breakdown.replaceChildren()
    evidence.replaceChildren()
    scripts.replaceChildren()
    evidence.hidden = true
    scripts.hidden = true
    breakdown.hidden = true
    try {
      if (mode === 'script') {
        const checked = checkCkbScript(input.value)
        busy = false
        await runAnalyze(checked.script)
      } else {
        const response = await fetch('/api/scan', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ network: networkInput.value, address: addressInput.value.trim() }) })
        const result = await response.json()
        if (!response.ok) throw new Error(result.error ?? 'The address scan failed.')
        lastScript = null
        title.textContent = result.returned_cell_count ? 'Wallet cells scanned' : 'No live cells found'
        summary.textContent = 'Scripts were grouped from live cells locked by this address. This report does not calculate token balances.'
        addDetail('Network', result.network)
        addDetail('Lock Script', `${result.lock.code_hash} · ${result.lock.hash_type}`)
        addDetail('Live cells returned', `${result.returned_cell_count}${result.truncated ? ' · scan limit reached' : ''}`)
        addDetail('CKB capacity', formatCapacity(result.total_capacity_shannons))
        addDetail('Indexer block', result.block?.number ?? 'Not returned')
        breakdown.hidden = false
        evidence.hidden = false
        addEvidence('Indexer block hash', result.block?.hash ?? 'Not returned')
        if (result.truncated) addEvidence('Coverage', 'Stopped at 500 cells. The remaining cells were not scanned.')
        const heading = element('p', 'result-section-title', `Type Scripts found (${result.scripts.length})`)
        scripts.append(heading)
        if (!result.scripts.length) scripts.append(element('p', 'field-hint', 'No Type Scripts were found in the returned cells.'))
        for (const item of result.scripts) {
          const row = element('div', 'script-row')
          const info = element('div')
          info.append(element('span', '', `${item.cell_count} cell${item.cell_count === 1 ? '' : 's'} · ${item.script.hash_type}`))
          info.append(element('code', '', item.script.code_hash))
          const analyze = element('button', '', 'Analyze') as HTMLButtonElement
          analyze.type = 'button'
          analyze.addEventListener('click', () => { input.value = JSON.stringify(item.script, null, 2); modeButtons.find((button) => button.dataset.inspectMode === 'script')?.click(); void runAnalyze(item.script, result.network) })
          row.append(info, analyze)
          scripts.append(row)
        }
        scripts.hidden = false
        status.textContent = result.truncated ? 'Partial address scan. Some cells may not be represented.' : 'Cell and script data is from the selected indexer snapshot.'
        status.dataset.state = result.truncated ? 'review' : 'ready'
        setState(result.truncated ? 'Partial scan' : 'Live snapshot', result.truncated ? 'warning' : 'ready')
        saveButton.disabled = true
      }
    } catch (error) { showError(error instanceof Error ? error.message : 'The lookup failed.') }
    finally {
      busy = false
      submitButton.disabled = false
      submitButton.textContent = mode === 'address' ? 'Scan address' : 'Analyze script'
    }
  })

  renderSaved()
  mode = 'script'
  modeButtons.forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.inspectMode === mode)))
  modeFields.forEach((field) => { field.hidden = field.dataset.inspectField !== mode })
  submitButton.textContent = 'Analyze script'
}
