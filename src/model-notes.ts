const content = {
  data: {
    description: 'These hash types point directly to a script binary hash. A replacement binary has a different hash, so this reference does not follow it automatically.',
    code: 'hash_type: "data1"\ncode_hash: hash of the script binary\n\nsame reference -> same binary hash',
  },
  type: {
    description: 'A type hash locates a cell by its Type Script. Replacing the code cell can make future transactions use a different binary under the same reference.',
    code: 'hash_type: "type"\ncode_hash: Type Script hash of a code cell\n\nreplacement cell -> new binary',
  },
  lock: {
    description: 'The code cell lock authorizes spending that cell. Its Type Script also validates replacement outputs, so both scripts and the transaction matter.',
    code: 'type-hash reference\n  -> matching live code cell\n  -> inspect lock + Type Script\n  -> verify replacement transaction',
  },
  limits: {
    description: 'A reference classification is only the first check. This MVP can inspect current chain evidence, but it cannot identify an owner, explain arbitrary lock logic, or prove a script is safe.',
    code: 'Read-only RPC + indexer lookup\nType ID search capped at 2,000 cells\nHistory capped at 25 versions\nCustom lock controllers stay unknown',
  },
}

export function bindModelNotes() {
  const tabs = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-method-tab]'))
  const panel = document.querySelector<HTMLElement>('#method-panel')
  const description = document.querySelector<HTMLElement>('#method-copy')
  const example = document.querySelector<HTMLElement>('#method-code')
  const copyButton = document.querySelector<HTMLButtonElement>('#method-copy-button')
  const copyStatus = document.querySelector<HTMLElement>('#method-copy-status')

  if (!panel || !description || !example || !copyButton || !copyStatus || tabs.length === 0) return

  const select = (index: number) => {
    const tab = tabs[index]
    const detail = contentFor(tab.dataset.methodTab)
    if (!detail) return
    tabs.forEach((item, itemIndex) => {
      const selected = itemIndex === index
      item.classList.toggle('is-active', selected)
      item.setAttribute('aria-selected', String(selected))
      item.tabIndex = selected ? 0 : -1
    })
    panel.setAttribute('aria-labelledby', tab.id)
    description.textContent = detail.description
    example.textContent = detail.code
    copyStatus.textContent = ''
  }

  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => select(index))
    tab.addEventListener('keydown', (event) => {
      const nextIndex = event.key === 'ArrowRight' ? (index + 1) % tabs.length
        : event.key === 'ArrowLeft' ? (index - 1 + tabs.length) % tabs.length
          : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : -1
      if (nextIndex < 0) return
      event.preventDefault()
      tabs[nextIndex].focus()
      select(nextIndex)
    })
  })

  copyButton.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(example.textContent ?? '')
      copyStatus.textContent = 'Example copied.'
    } catch {
      copyStatus.textContent = 'Clipboard unavailable. Select the example to copy it.'
    }
  })
}

function contentFor(key: string | undefined) {
  return key && key in content ? content[key as keyof typeof content] : null
}
