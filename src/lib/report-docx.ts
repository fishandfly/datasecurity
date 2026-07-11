import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  HeadingLevel,
  Header,
  ImageRun,
  LineRuleType,
  Packer,
  PageOrientation,
  PageBreak,
  PageNumber,
  Paragraph,
  SectionType,
  Table,
  TableCell,
  TableOfContents,
  TableRow,
  TextRun,
  WidthType,
  type ISectionOptions,
  type FileChild,
} from 'docx'

export type ReportDocxBlock =
  | { type: 'heading'; level: 1 | 2 | 3 | 4; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'bullet'; text: string }
  | { type: 'numbered'; text: string }
  | { type: 'table'; header: string[]; rows: string[][] }
  | { type: 'image'; data: Uint8Array }

const IMAGE_PATTERN = /^!\[[^\]]*]\((.+)\)$/
const TABLE_SEPARATOR_PATTERN = /^\|?(?:\s*:?-+:?\s*\|)+\s*$/

export const REPORT_DOCX_META = {
  unitName: '数据运营组',
  systemName: '吉林省生态数据资源目录服务系统',
} as const

export const REPORT_DOCX_STYLES = {
  coverTitle: { font: '黑体', size: 44, color: '000000' },
  coverMeta: { font: '仿宋', size: 32, color: '000000' },
  tocTitle: { font: '黑体', size: 36, color: '000000' },
  heading1: { font: '黑体', size: 36, color: '000000' },
  heading2: { font: '黑体', size: 32, color: '000000' },
  heading3: { font: '仿宋', size: 32, color: '000000' },
  body: {
    font: '仿宋',
    size: 32,
    color: '000000',
    firstLineIndent: 420,
    line: 360,
    before: 80,
    after: 160,
  },
} as const

export type ReportDocxPlan = {
  coverTitle: string
  tocTitle: string
  hasOverviewSection: boolean
  coverPeriod: string
  generatedAt: string
  bodyBlocks: ReportDocxBlock[]
}

export type ReportDocxSectionPlan = {
  orientation: 'portrait' | 'landscape'
  hasWideTable: boolean
  startsWithHeading1: boolean
  useHeaderFooter: boolean
  blocks: ReportDocxBlock[]
}

export function stripInlineMarkdown(text: string) {
  return text
    .replace(/!\[[^\]]*]\(([^)]+)\)/g, '')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

export function parseDataUrlToBytes(dataUrl: string) {
  if (!dataUrl.startsWith('data:image/')) return null
  const commaIndex = dataUrl.indexOf(',')
  if (commaIndex < 0) return null
  const payload = dataUrl.slice(commaIndex + 1)

  try {
    const binary = atob(payload)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i)
    }
    return bytes
  } catch {
    return null
  }
}

function parseTableRow(line: string) {
  const normalized = line.trim().replace(/^\|/, '').replace(/\|$/, '')
  return normalized.split('|').map((cell) => stripInlineMarkdown(cell.trim()))
}

export function parseMarkdownToDocxBlocks(markdown: string): ReportDocxBlock[] {
  const lines = markdown.split(/\r?\n/)
  const blocks: ReportDocxBlock[] = []

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim()
    if (!line) continue

    const imageMatch = line.match(IMAGE_PATTERN)
    if (imageMatch) {
      const bytes = parseDataUrlToBytes(imageMatch[1] ?? '')
      if (bytes) {
        blocks.push({ type: 'image', data: bytes })
      }
      continue
    }

    if (line.startsWith('#### ')) {
      blocks.push({ type: 'heading', level: 4, text: stripInlineMarkdown(line.slice(5)) })
      continue
    }

    if (line.startsWith('### ')) {
      blocks.push({ type: 'heading', level: 3, text: stripInlineMarkdown(line.slice(4)) })
      continue
    }

    if (line.startsWith('## ')) {
      blocks.push({ type: 'heading', level: 2, text: stripInlineMarkdown(line.slice(3)) })
      continue
    }

    if (line.startsWith('# ')) {
      blocks.push({ type: 'heading', level: 1, text: stripInlineMarkdown(line.slice(2)) })
      continue
    }

    if (line.startsWith('- ')) {
      blocks.push({ type: 'bullet', text: stripInlineMarkdown(line.slice(2)) })
      continue
    }

    if (/^\d+\.\s+/.test(line)) {
      blocks.push({ type: 'numbered', text: stripInlineMarkdown(line.replace(/^\d+\.\s+/, '')) })
      continue
    }

    if (line.startsWith('|')) {
      const tableLines = [line]
      let nextIndex = index + 1
      while (nextIndex < lines.length && lines[nextIndex].trim().startsWith('|')) {
        tableLines.push(lines[nextIndex].trim())
        nextIndex += 1
      }

      const header = parseTableRow(tableLines[0])
      const hasSeparator = tableLines.length > 1 && TABLE_SEPARATOR_PATTERN.test(tableLines[1])
      const rowLines = tableLines.slice(hasSeparator ? 2 : 1)
      const rows = rowLines
        .map(parseTableRow)
        .filter((row) => row.some((cell) => cell.length > 0))

      blocks.push({ type: 'table', header, rows })
      index = nextIndex - 1
      continue
    }

    blocks.push({ type: 'paragraph', text: stripInlineMarkdown(line) })
  }

  return blocks
}

function createFontAttributes(fontName: string) {
  return {
    ascii: fontName,
    hAnsi: fontName,
    eastAsia: fontName,
    cs: fontName,
  } as const
}

function createBodyRun(text: string) {
  return new TextRun({
    text,
    font: createFontAttributes(REPORT_DOCX_STYLES.body.font),
    size: REPORT_DOCX_STYLES.body.size,
    color: REPORT_DOCX_STYLES.body.color,
  })
}

function createHeadingRun(text: string, level: 1 | 2 | 3) {
  const style =
    level === 1 ? REPORT_DOCX_STYLES.heading1 : level === 2 ? REPORT_DOCX_STYLES.heading2 : REPORT_DOCX_STYLES.heading3
  return new TextRun({
    text,
    bold: true,
    font: createFontAttributes(style.font),
    size: style.size,
    color: style.color,
  })
}

function isWideTable(block: ReportDocxBlock) {
  return block.type === 'table' && Math.max(block.header.length, ...block.rows.map((row) => row.length), 0) > 6
}

function popTrailingHeadings(blocks: ReportDocxBlock[]) {
  const trailing: ReportDocxBlock[] = []
  while (blocks.length > 0) {
    const last = blocks[blocks.length - 1]
    if (last.type !== 'heading' || last.level < 2) break
    trailing.unshift(blocks.pop() as ReportDocxBlock)
  }
  return trailing
}

function createCell(text: string, columnCount: number, options?: { header?: boolean }) {
  const safeColumnCount = Math.max(1, columnCount)
  return new TableCell({
    width: { size: 100 / safeColumnCount, type: WidthType.PERCENTAGE },
    shading: options?.header ? { fill: 'EAF2FB' } : undefined,
    borders: {
      top: { style: BorderStyle.SINGLE, color: 'D5E0EA', size: 1 },
      bottom: { style: BorderStyle.SINGLE, color: 'D5E0EA', size: 1 },
      left: { style: BorderStyle.SINGLE, color: 'D5E0EA', size: 1 },
      right: { style: BorderStyle.SINGLE, color: 'D5E0EA', size: 1 },
    },
    margins: { top: 100, bottom: 100, left: 120, right: 120 },
    children: [
      new Paragraph({
        spacing: { after: 0, before: 0, line: REPORT_DOCX_STYLES.body.line, lineRule: LineRuleType.AUTO },
        children: [
          new TextRun({
            text,
            bold: options?.header ?? false,
            font: createFontAttributes(REPORT_DOCX_STYLES.body.font),
            size: REPORT_DOCX_STYLES.body.size,
            color: REPORT_DOCX_STYLES.body.color,
          }),
        ],
      }),
    ],
  })
}

export function buildReportDocxPlan(markdown: string): ReportDocxPlan {
  const blocks = parseMarkdownToDocxBlocks(markdown)
  const titleIndex = blocks.findIndex((block) => block.type === 'heading' && block.level === 1)
  const coverTitle = titleIndex >= 0 && blocks[titleIndex].type === 'heading' ? blocks[titleIndex].text : '数据运行分析报告'
  const postTitleBlocks = titleIndex >= 0 ? blocks.slice(titleIndex + 1) : blocks
  const firstHeading2Index = postTitleBlocks.findIndex((block) => block.type === 'heading' && block.level === 2)
  const coverInfoBlocks = firstHeading2Index >= 0 ? postTitleBlocks.slice(0, firstHeading2Index) : postTitleBlocks
  const bodyBlocks = firstHeading2Index >= 0 ? postTitleBlocks.slice(firstHeading2Index) : postTitleBlocks
  const hasOverviewSection = bodyBlocks.some((block) => block.type === 'heading' && /报告总体说明/.test(block.text))
  const metaTable = coverInfoBlocks.find((block) => block.type === 'table')
  const coverPeriod = metaTable?.type === 'table' ? metaTable.rows.find((row) => row[0] === '统计周期')?.[1] ?? '' : ''
  const generatedAt = metaTable?.type === 'table' ? metaTable.rows.find((row) => row[0] === '生成时间')?.[1] ?? '' : ''

  return {
    coverTitle,
    tocTitle: '目录',
    hasOverviewSection,
    coverPeriod,
    generatedAt,
    bodyBlocks,
  }
}

export function buildReportDocxSectionPlan(markdown: string): ReportDocxSectionPlan[] {
  const { bodyBlocks } = buildReportDocxPlan(markdown)
  const sections: ReportDocxSectionPlan[] = []
  let currentBlocks: ReportDocxBlock[] = []

  const flushPortrait = () => {
    if (currentBlocks.length === 0) return
    sections.push({
      orientation: 'portrait',
      hasWideTable: false,
      startsWithHeading1: currentBlocks[0]?.type === 'heading' && currentBlocks[0].level === 2,
      useHeaderFooter: true,
      blocks: currentBlocks,
    })
    currentBlocks = []
  }

  for (const block of bodyBlocks) {
    if (block.type === 'heading' && block.level === 2) {
      flushPortrait()
      currentBlocks = [block]
      continue
    }

    if (isWideTable(block)) {
      const headingBlocks = popTrailingHeadings(currentBlocks)
      flushPortrait()
      sections.push({
        orientation: 'landscape',
        hasWideTable: true,
        startsWithHeading1: headingBlocks[0]?.type === 'heading' && headingBlocks[0].level === 2,
        useHeaderFooter: true,
        blocks: [...headingBlocks, block],
      })
      continue
    }

    currentBlocks.push(block)
  }

  flushPortrait()
  return sections
}

function createPageBreakParagraph() {
  return new Paragraph({
    children: [new PageBreak()],
  })
}

function createCoverChildren(plan: ReportDocxPlan, options?: { includeTrailingBreak?: boolean }): FileChild[] {
  const children: FileChild[] = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 2600, after: 320 },
      children: [
        new TextRun({
          text: plan.coverTitle,
          bold: true,
          font: createFontAttributes(REPORT_DOCX_STYLES.coverTitle.font),
          size: REPORT_DOCX_STYLES.coverTitle.size,
          color: REPORT_DOCX_STYLES.coverTitle.color,
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 160, after: 120 },
      children: [
        new TextRun({
          text: REPORT_DOCX_META.systemName,
          font: createFontAttributes(REPORT_DOCX_STYLES.coverMeta.font),
          size: REPORT_DOCX_STYLES.coverMeta.size,
          color: REPORT_DOCX_STYLES.coverMeta.color,
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 120, after: 0 },
      children: [
        new TextRun({
          text: `编制单位：${REPORT_DOCX_META.unitName}`,
          font: createFontAttributes(REPORT_DOCX_STYLES.coverMeta.font),
          size: REPORT_DOCX_STYLES.coverMeta.size,
          color: REPORT_DOCX_STYLES.coverMeta.color,
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 120, after: 0 },
      children: [
        new TextRun({
          text: `统计周期：${plan.coverPeriod || '-'}`,
          font: createFontAttributes(REPORT_DOCX_STYLES.coverMeta.font),
          size: REPORT_DOCX_STYLES.coverMeta.size,
          color: REPORT_DOCX_STYLES.coverMeta.color,
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 120, after: 0 },
      children: [
        new TextRun({
          text: `报告日期：${plan.generatedAt || '-'}`,
          font: createFontAttributes(REPORT_DOCX_STYLES.coverMeta.font),
          size: REPORT_DOCX_STYLES.coverMeta.size,
          color: REPORT_DOCX_STYLES.coverMeta.color,
        }),
      ],
    }),
  ]
  if (options?.includeTrailingBreak) {
    children.push(createPageBreakParagraph())
  }
  return children
}

function createHeader(title: string, period: string) {
  return new Header({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 0 },
        children: [
          new TextRun({
            text: period ? `${title}  ·  统计周期 ${period}` : title,
            font: createFontAttributes(REPORT_DOCX_STYLES.coverMeta.font),
            size: 24,
            color: REPORT_DOCX_STYLES.coverMeta.color,
          }),
        ],
      }),
    ],
  })
}

function createFooter() {
  return new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 0 },
        children: [
          new TextRun({
            text: `${REPORT_DOCX_META.unitName}  第 `,
            font: createFontAttributes(REPORT_DOCX_STYLES.coverMeta.font),
            size: 24,
            color: REPORT_DOCX_STYLES.coverMeta.color,
          }),
          new TextRun({
            children: [PageNumber.CURRENT],
            font: createFontAttributes(REPORT_DOCX_STYLES.coverMeta.font),
            size: 24,
            color: REPORT_DOCX_STYLES.coverMeta.color,
          }),
          new TextRun({
            text: ' 页 / 共 ',
            font: createFontAttributes(REPORT_DOCX_STYLES.coverMeta.font),
            size: 24,
            color: REPORT_DOCX_STYLES.coverMeta.color,
          }),
          new TextRun({
            children: [PageNumber.TOTAL_PAGES],
            font: createFontAttributes(REPORT_DOCX_STYLES.coverMeta.font),
            size: 24,
            color: REPORT_DOCX_STYLES.coverMeta.color,
          }),
          new TextRun({
            text: ' 页',
            font: createFontAttributes(REPORT_DOCX_STYLES.coverMeta.font),
            size: 24,
            color: REPORT_DOCX_STYLES.coverMeta.color,
          }),
        ],
      }),
    ],
  })
}

function createTocChildren(plan: ReportDocxPlan, options?: { includeTrailingBreak?: boolean }): FileChild[] {
  const children: FileChild[] = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 200, after: 240 },
      children: [
        new TextRun({
          text: plan.tocTitle,
          bold: true,
          font: createFontAttributes(REPORT_DOCX_STYLES.tocTitle.font),
          size: REPORT_DOCX_STYLES.tocTitle.size,
          color: REPORT_DOCX_STYLES.tocTitle.color,
        }),
      ],
    }),
    new TableOfContents(plan.tocTitle, {
      hyperlink: true,
      headingStyleRange: '1-3',
      beginDirty: true,
    }),
  ]
  if (options?.includeTrailingBreak) {
    children.push(createPageBreakParagraph())
  }
  return children
}

function buildDocxChildrenFromBlocks(blocks: ReportDocxBlock[]): FileChild[] {
  return blocks.map((block) => {
    switch (block.type) {
      case 'heading': {
        const headingLevel = block.level === 2 ? 1 : block.level === 3 ? 2 : 3
        return new Paragraph({
          heading:
            headingLevel === 1 ? HeadingLevel.HEADING_1 : headingLevel === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3,
          spacing: {
            before: headingLevel === 1 ? 280 : 180,
            after: headingLevel === 1 ? 180 : 120,
            line: REPORT_DOCX_STYLES.body.line,
            lineRule: LineRuleType.AUTO,
          },
          children: [createHeadingRun(block.text, headingLevel)],
        })
      }
      case 'bullet':
        return new Paragraph({
          bullet: { level: 0 },
          spacing: {
            before: REPORT_DOCX_STYLES.body.before,
            after: REPORT_DOCX_STYLES.body.after,
            line: REPORT_DOCX_STYLES.body.line,
            lineRule: LineRuleType.AUTO,
          },
          children: [createBodyRun(block.text)],
        })
      case 'numbered':
        return new Paragraph({
          bullet: { level: 0 },
          spacing: {
            before: REPORT_DOCX_STYLES.body.before,
            after: REPORT_DOCX_STYLES.body.after,
            line: REPORT_DOCX_STYLES.body.line,
            lineRule: LineRuleType.AUTO,
          },
          children: [createBodyRun(block.text)],
        })
      case 'table': {
        const columnCount = Math.max(block.header.length, ...block.rows.map((row) => row.length), 1)
        const normalizedHeader = Array.from({ length: columnCount }, (_, index) => block.header[index] ?? '')
        const normalizedRows = block.rows.map((row) => Array.from({ length: columnCount }, (_, index) => row[index] ?? ''))
        return new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              children: normalizedHeader.map((cell) => createCell(cell, columnCount, { header: true })),
            }),
            ...normalizedRows.map(
              (row) =>
                new TableRow({
                  children: row.map((cell) => createCell(cell, columnCount)),
                }),
            ),
          ],
        })
      }
      case 'image':
        return new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 120, after: 160 },
          children: [
            new ImageRun({
              type: 'png',
              data: block.data,
              transformation: { width: 520, height: 240 },
            }),
          ],
        })
      case 'paragraph':
      default:
        return new Paragraph({
          spacing: {
            before: REPORT_DOCX_STYLES.body.before,
            after: REPORT_DOCX_STYLES.body.after,
            line: REPORT_DOCX_STYLES.body.line,
            lineRule: LineRuleType.AUTO,
          },
          indent: { firstLine: REPORT_DOCX_STYLES.body.firstLineIndent },
          children: [createBodyRun(block.text)],
        })
    }
  })
}

export function buildDocxChildrenFromMarkdown(markdown: string): FileChild[] {
  const plan = buildReportDocxPlan(markdown)

  return [
    ...createCoverChildren(plan, { includeTrailingBreak: true }),
    ...createTocChildren(plan, { includeTrailingBreak: true }),
    ...buildDocxChildrenFromBlocks(plan.bodyBlocks),
  ]
}

function buildDocxSectionsFromMarkdown(markdown: string): ISectionOptions[] {
  const plan = buildReportDocxPlan(markdown)
  const bodySections = buildReportDocxSectionPlan(markdown)

  const buildSection = (
    children: FileChild[],
    orientation: 'portrait' | 'landscape',
    options?: { withHeaderFooter?: boolean },
  ): ISectionOptions => ({
    headers: options?.withHeaderFooter ? { default: createHeader(plan.coverTitle, plan.coverPeriod) } : undefined,
    footers: options?.withHeaderFooter ? { default: createFooter() } : undefined,
    properties: {
      type: SectionType.NEXT_PAGE,
      page: {
        size: {
          orientation: orientation === 'landscape' ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT,
        },
      },
    },
    children,
  })

  return [
    buildSection(createCoverChildren(plan), 'portrait'),
    buildSection(createTocChildren(plan), 'portrait'),
    ...bodySections.map((section) =>
      buildSection(buildDocxChildrenFromBlocks(section.blocks), section.orientation, {
        withHeaderFooter: section.useHeaderFooter,
      }),
    ),
  ]
}

export async function buildDocxBlobFromMarkdown(markdown: string) {
  const doc = new Document({
    features: {
      updateFields: true,
    },
    numbering: {
      config: [
        {
          reference: 'report-numbering',
          levels: [
            {
              level: 0,
              format: 'decimal',
              text: '%1.',
              alignment: 'left',
            },
          ],
        },
      ],
    },
    sections: buildDocxSectionsFromMarkdown(markdown),
  })

  return Packer.toBlob(doc)
}
