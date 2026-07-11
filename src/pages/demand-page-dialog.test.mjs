import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = readFileSync(resolve(process.cwd(), 'src/pages/demand-page-internal.tsx'), 'utf8')
const dialogSource = source.match(/\{isCreateDialogOpen[\s\S]*?关闭新增场景需求对话框[\s\S]*?document\.body,\s*\)\s*: null\s*: null\}/)?.[0] ?? ''

test('供需对接申请弹层标题和提交按钮文案已更新', () => {
  assert.match(source, /新增场景需求[\s\S]*?供需对接申请表/)
  assert.match(source, /<Send className="mr-2 h-4 w-4" \/>\s*提交供需对接申请/)
  assert.doesNotMatch(source, /主子表批量登记/)
  assert.doesNotMatch(source, /批量登记场景需求/)
})

test('供需对接申请弹层使用列布局并让内容区独立滚动，避免底部提交按钮不可见', () => {
  assert.match(source, /relative flex max-h-\[96vh\] w-full max-w-\[1580px\] flex-col overflow-hidden/)
  assert.match(source, /<div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">/)
  assert.match(source, /<div className="flex items-center justify-between gap-3 border-t border-\[var\(--surface-outline\)\] bg-\[var\(--surface-raised\)\] px-6 py-4">/)
})

test('供需对接申请弹层去掉旧主表区，并将场景录入下沉到每一行', () => {
  assert.notEqual(dialogSource, '', '未找到供需对接申请弹层代码片段')
  assert.doesNotMatch(dialogSource, /主表信息/)
  assert.doesNotMatch(dialogSource, /快捷带入/)
  assert.doesNotMatch(dialogSource, /主表只维护共享场景名称，子表按表格连续录入多行需求/)
  assert.match(source, /sceneName: string/)
  assert.match(source, /<span className=\{DIALOG_FORM_LABEL_CLASS\}>申请场景<\/span>/)
  assert.match(source, /placeholder="例如：外部数据共享需求"/)
  assert.doesNotMatch(dialogSource, /placeholder="例如：外部数据共享需求、监测业务协同申请"/)
  assert.match(source, /第 \$\{index \+ 1\} 行请填写申请场景/)
})

test('供需对接申请弹层使用卡片式多行录入，并提供一体化目录资源联想搜索', () => {
  assert.match(source, /const DIALOG_FORM_CARD_CLASS =/)
  assert.match(source, /space-y-4 px-4 py-4/)
  assert.match(source, /showLinkedResourcePanel = !isBatchClaimCartRow && isLinkedResourceOpen && row\.linkedResourceKeyword\.trim\(\)\.length > 0/)
  assert.match(source, /输入名称、编码或部门进行联想搜索/)
  assert.match(source, /resourceCandidates\.map\(\(item\) => \(/)
  assert.doesNotMatch(dialogSource, /<table className="min-w-\[1280px\] border-separate border-spacing-0 text-left">/)
  assert.doesNotMatch(dialogSource, /<select\s+value=\{row\.linkedResourceId\}/)
})

test('新增一行时会复制上一行的场景名，并按场景分组提交', () => {
  assert.match(source, /const resolveCreateDialogSceneName = \(nextSceneName\?: string\) =>/)
  assert.match(source, /buildEmptyFormRow\(undefined, current\[current\.length - 1\]\?\.sceneName \?\? resolveCreateDialogSceneName\(\)\)/)
  assert.match(source, /const groupedRows = new Map<string, FormRowState\[\]>\(\)/)
  assert.match(source, /for \(const \[normalizedSceneName, sceneRows\] of groupedRows\)/)
  assert.doesNotMatch(source, /sceneSummaries\[0\]\?\.sceneName \|\| '供需对接申请'/)
})

test('申领夹批量带入时折叠为单个申请卡片，并在卡片内展示资源清单', () => {
  assert.match(source, /import \{ mergeClaimCartDemandPrefillRows \} from '\.\.\/lib\/demand-claim-cart-prefill'/)
  assert.match(source, /if \(prefillRows\.length > 1\) \{/)
  assert.match(source, /buildEmptyFormRow\(mergeClaimCartDemandPrefillRows\(prefillRows\), prefillRows\[0\]\?\.useCase \?\? ''\)/)
  assert.match(source, /const isBatchClaimCartRow = row\.claimCartItemIds\.length > 1 \|\| row\.linkedResourceNames\.length > 1/)
  assert.match(source, /const rowTitle = isBatchClaimCartRow \? '本次供需申请' : `第 \$\{rowIndex \+ 1\} 条需求`/)
  assert.match(source, /<span className=\{DIALOG_FORM_LABEL_CLASS\}>本次申领资源<\/span>/)
  assert.match(source, /本次申请会统一写入 <span className="font-semibold text-\[var\(--text-main\)\]">1 条供需申请<\/span>/)
  assert.match(source, /已从数据申领夹带入/)
})

test('场景需求弹窗通过 createPortal 挂到 body，避免被布局 translate 带偏', () => {
  assert.match(source, /import \{ createPortal \} from 'react-dom'/)
  assert.match(source, /createPortal\(\s*<div className="fixed inset-0 z-50 flex items-center justify-center[\s\S]*?关闭新增场景需求对话框/s)
  assert.match(source, /document\.body/)
})
