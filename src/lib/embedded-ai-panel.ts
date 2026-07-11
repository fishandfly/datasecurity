export const EMBEDDED_ASSISTANT_EMBED_CSS = `
  html, body {
    overflow: hidden !important;
    background: transparent !important;
  }

  body {
    min-width: 0 !important;
  }

  #root {
    overflow: hidden !important;
  }

  .ant-layout-header {
    display: none !important;
  }

  .ant-layout > .ant-layout-content {
    margin-top: 0 !important;
  }
`

type EmbeddedControlDescriptor = {
  className?: string
  text?: string
  top?: number
  panelBottom?: number
  iconLabels?: string[]
}

const EMBEDDED_MESSAGE_ACTION_LABELS = new Set(['copy', 'reload', 'edit'])

export function shouldHideEmbeddedFooterDropdown(descriptor: EmbeddedControlDescriptor) {
  const className = descriptor.className ?? ''
  const text = (descriptor.text ?? '').trim()
  const top = descriptor.top ?? 0
  const panelBottom = descriptor.panelBottom ?? 0

  return top >= panelBottom - 120 && className.includes('ant-dropdown-trigger') && text.length > 0
}

export function shouldHideEmbeddedMessageAction(descriptor: EmbeddedControlDescriptor) {
  const top = descriptor.top ?? 0
  const panelBottom = descriptor.panelBottom ?? 0
  const iconLabels = descriptor.iconLabels ?? []

  return top < panelBottom - 140 && iconLabels.some((label) => EMBEDDED_MESSAGE_ACTION_LABELS.has(label))
}

export function shouldCollapseEmbeddedThoughtSection(descriptor: EmbeddedControlDescriptor) {
  const className = descriptor.className ?? ''
  const text = descriptor.text ?? ''

  return className.includes('ant-collapse') && text.includes('已完成思考')
}
