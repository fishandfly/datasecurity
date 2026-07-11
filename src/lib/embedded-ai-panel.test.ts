import test from 'node:test'
import assert from 'node:assert/strict'
import {
  EMBEDDED_ASSISTANT_EMBED_CSS,
  shouldCollapseEmbeddedThoughtSection,
  shouldHideEmbeddedFooterDropdown,
  shouldHideEmbeddedMessageAction,
} from './embedded-ai-panel.js'

test('shouldHideEmbeddedFooterDropdown hides the visible model selector in the footer band', () => {
  assert.equal(
    shouldHideEmbeddedFooterDropdown({
      className: 'ant-dropdown-trigger',
      text: 'Deepseek V4 Flash',
      top: 597,
      panelBottom: 672,
    }),
    true,
  )
})

test('shouldHideEmbeddedFooterDropdown keeps non-dropdown footer controls', () => {
  assert.equal(
    shouldHideEmbeddedFooterDropdown({
      className: 'ant-upload-wrapper css-17h1pxo',
      text: '',
      top: 597,
      panelBottom: 672,
    }),
    false,
  )
})

test('shouldHideEmbeddedMessageAction hides reload and copy actions above the footer', () => {
  assert.equal(
    shouldHideEmbeddedMessageAction({
      top: 302,
      panelBottom: 672,
      iconLabels: ['reload', 'copy'],
    }),
    true,
  )
})

test('shouldHideEmbeddedMessageAction keeps the footer send button', () => {
  assert.equal(
    shouldHideEmbeddedMessageAction({
      top: 597,
      panelBottom: 672,
      iconLabels: ['arrow-up'],
    }),
    false,
  )
})

test('shouldCollapseEmbeddedThoughtSection collapses the embedded reasoning block', () => {
  assert.equal(
    shouldCollapseEmbeddedThoughtSection({
      className: 'ant-collapse ant-collapse-borderless ant-collapse-small',
      text: '已完成思考 The user is asking if the embedded version of me is working correctly.',
    }),
    true,
  )
})

test('EMBEDDED_ASSISTANT_EMBED_CSS removes the native top header gap', () => {
  assert.match(EMBEDDED_ASSISTANT_EMBED_CSS, /\.ant-layout-header\s*\{\s*display:\s*none\s*!important;/)
  assert.match(EMBEDDED_ASSISTANT_EMBED_CSS, /\.ant-layout\s*>\s*\.ant-layout-content\s*\{\s*margin-top:\s*0\s*!important;/)
})
