// ─────────────────────────────────────────────────────────
//  Likhavat · docx-generator.js
//  Parses fixed Gemini output format and builds a
//  Kathak-themed .docx with Cambria font, A4 page size
// ─────────────────────────────────────────────────────────

const {
  Document, Packer, Paragraph, TextRun, AlignmentType,
  HeadingLevel, BorderStyle, NumberFormat,
  Header, Footer, TabStopType, TabStopPosition,
  UnderlineType, ShadingType, WidthType,
  Table, TableRow, TableCell, VerticalAlign
} = require('docx');

// ── Colour palette ───────────────────────────────────────
const C = {
  crimson:   '7B1515',  // deep crimson
  gold:      'B8922A',  // antique gold
  indigo:    '1E1B4B',  // deep indigo
  ivory:     'FAF4E8',  // warm ivory
  goldPale:  'F5E9C0',  // pale gold for shading
  text:      '2A1A0A',  // warm dark brown
  textMid:   '5A3A1A',  // mid brown
  white:     'FFFFFF',
};

const FONT   = 'Cambria';
const FONT_S = 'Cambria'; // same for Gujarati — Cambria handles it well

// ── Border helpers ───────────────────────────────────────
function goldBorder(size = 6)  { return { style: BorderStyle.SINGLE, size, color: C.gold }; }
function noBorder()            { return { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }; }

// ── Ornamental divider paragraph ─────────────────────────
function ornamentPara(text = '✦  ✦  ✦') {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 160, after: 160 },
    children: [new TextRun({ text, font: FONT, size: 18, color: C.gold })]
  });
}

// ── Empty spacer ─────────────────────────────────────────
function spacer(before = 80, after = 80) {
  return new Paragraph({ spacing: { before, after }, children: [] });
}

// ────────────────────────────────────────────────────────
//  PARSER
//  Gemini output format:
//    ## વિભાગ N: Title
//    **મૂળ વિષય:** body
//    **સમજૂતી:**
//    explanation paragraphs
//    ---
//    ## સારાંશ
//    summary paragraphs
// ────────────────────────────────────────────────────────
function parseGeminiOutput(raw) {
  const lines  = raw.split('\n');
  const blocks = [];
  let current  = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Section heading: ## વિભાગ N: Title  OR  ## સારાંશ
    if (line.startsWith('## ')) {
      if (current) blocks.push(current);
      const title = line.replace(/^##\s*/, '').trim();
      const isSummary = title.startsWith('સારાંશ') || title.toLowerCase().includes('summary');
      current = { type: isSummary ? 'summary' : 'section', title, mukhyaVishay: '', samjuti: [], body: [] };
      continue;
    }

    // Divider
    if (line.trim() === '---') {
      if (current) { blocks.push(current); current = null; }
      continue;
    }

    if (!current) continue;

    // **મૂળ વિષય:** inline value
    const mvMatch = line.match(/^\*\*મૂળ વિષય:\*\*\s*(.*)/);
    if (mvMatch) { current.mukhyaVishay = mvMatch[1].trim(); continue; }

    // **સમજૂતી:** label (content follows on next lines)
    if (line.match(/^\*\*સમજૂતી:\*\*/)) {
      const inline = line.replace(/^\*\*સમજૂતી:\*\*\s*/, '').trim();
      if (inline) current.samjuti.push(inline);
      continue;
    }

    // Bold label pattern: **something:** value
    const boldMatch = line.match(/^\*\*(.+?):\*\*\s*(.*)/);
    if (boldMatch) {
      const val = boldMatch[2].trim();
      if (val) {
        if (current.type === 'section') current.samjuti.push(val);
        else current.body.push(val);
      }
      continue;
    }

    // Regular content line
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (current.type === 'summary') {
      current.body.push(trimmed);
    } else {
      current.samjuti.push(trimmed);
    }
  }

  if (current) blocks.push(current);
  return blocks;
}

// ────────────────────────────────────────────────────────
//  DOCUMENT BUILDER
// ────────────────────────────────────────────────────────
async function buildKathakDoc(geminiText, chapterTitle = 'અધ્યાય') {
  const blocks = parseGeminiOutput(geminiText);

  // ── Header ───────────────────────────────────────────
  const header = new Header({
    children: [
      new Paragraph({
        border: { bottom: goldBorder(8) },
        spacing: { after: 80 },
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({ text: '॥ ', font: FONT, size: 20, color: C.gold }),
          new TextRun({ text: 'Likhavat · લિખાવટ', font: FONT, size: 20, bold: true, color: C.crimson }),
          new TextRun({ text: ' ॥', font: FONT, size: 20, color: C.gold }),
        ]
      })
    ]
  });

  // ── Footer ───────────────────────────────────────────
  const footer = new Footer({
    children: [
      new Paragraph({
        border: { top: goldBorder(6) },
        spacing: { before: 80 },
        tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
        children: [
          new TextRun({ text: 'નૃત્ય · નાટ્ય · નૃત', font: FONT, size: 16, color: C.gold, italics: true }),
          new TextRun({ text: '\t', font: FONT }),
          new TextRun({ text: 'પૃષ્ઠ ', font: FONT, size: 16, color: C.textMid }),
          new TextRun({ text: '1', font: FONT, size: 16, color: C.textMid }),
        ]
      })
    ]
  });

  // ── Title page block ──────────────────────────────────
  const titleBlock = [
    spacer(240, 0),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 60 },
      border: { bottom: goldBorder(12) },
      children: [
        new TextRun({ text: '✦', font: FONT, size: 28, color: C.gold }),
        new TextRun({ text: '  Likhavat  ', font: FONT, size: 28, bold: true, color: C.crimson }),
        new TextRun({ text: '✦', font: FONT, size: 28, color: C.gold }),
      ]
    }),
    spacer(60, 0),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 40 },
      children: [
        new TextRun({ text: chapterTitle, font: FONT, size: 40, bold: true, color: C.indigo })
      ]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 40 },
      children: [
        new TextRun({ text: 'ગૂઢ જ્ઞાનનો ઉઘાડ', font: FONT, size: 22, italics: true, color: C.gold })
      ]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 0 },
      border: { top: goldBorder(8) },
      children: [
        new TextRun({ text: '॥ श्री गणेशाय नमः ॥', font: FONT, size: 20, color: C.crimson, italics: true })
      ]
    }),
    spacer(200, 0),
    ornamentPara('✦  ✦  ✦'),
    spacer(100, 0),
  ];

  // ── Section blocks ────────────────────────────────────
  const sectionBlocks = [];

  for (const block of blocks) {
    if (block.type === 'section') {

      // Section heading box
      sectionBlocks.push(
        new Paragraph({
          spacing: { before: 320, after: 0 },
          border: {
            top:    goldBorder(8),
            left:   goldBorder(20),
            bottom: noBorder(),
            right:  noBorder(),
          },
          shading: { fill: C.ivory, type: ShadingType.CLEAR },
          children: [
            new TextRun({ text: block.title, font: FONT, size: 28, bold: true, color: C.crimson }),
          ]
        })
      );

      // મૂળ વિષય label + value
      if (block.mukhyaVishay) {
        sectionBlocks.push(
          new Paragraph({
            spacing: { before: 120, after: 80 },
            indent: { left: 400 },
            children: [
              new TextRun({ text: 'મૂળ વિષય:  ', font: FONT, size: 20, bold: true, color: C.indigo }),
              new TextRun({ text: block.mukhyaVishay, font: FONT, size: 20, color: C.textMid, italics: true }),
            ]
          })
        );
      }

      // સમજૂતી label
      sectionBlocks.push(
        new Paragraph({
          spacing: { before: 80, after: 60 },
          indent: { left: 400 },
          border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: C.gold } },
          children: [
            new TextRun({ text: 'સમજૂતી', font: FONT, size: 20, bold: true, color: C.indigo,
              underline: { type: UnderlineType.NONE } }),
          ]
        })
      );

      // સમજૂતી body paragraphs
      for (const para of block.samjuti) {
        if (!para.trim()) continue;
        sectionBlocks.push(
          new Paragraph({
            spacing: { before: 80, after: 80, line: 360 },
            indent: { left: 400, firstLine: 360 },
            alignment: AlignmentType.JUSTIFIED,
            children: [
              new TextRun({ text: para, font: FONT, size: 22, color: C.text })
            ]
          })
        );
      }

      sectionBlocks.push(ornamentPara('· · ·'));

    } else if (block.type === 'summary') {

      // Summary section — special styled box
      sectionBlocks.push(spacer(160, 0));
      sectionBlocks.push(ornamentPara('✦  ✦  ✦'));

      // Summary heading
      sectionBlocks.push(
        new Paragraph({
          spacing: { before: 160, after: 120 },
          alignment: AlignmentType.CENTER,
          border: {
            top:    goldBorder(10),
            bottom: goldBorder(10),
          },
          shading: { fill: C.goldPale, type: ShadingType.CLEAR },
          children: [
            new TextRun({ text: '  ' + block.title + '  ', font: FONT, size: 30, bold: true, color: C.crimson }),
          ]
        })
      );

      // Summary body
      for (const para of block.body) {
        if (!para.trim()) continue;
        sectionBlocks.push(
          new Paragraph({
            spacing: { before: 100, after: 100, line: 380 },
            indent: { left: 360, right: 360, firstLine: 360 },
            alignment: AlignmentType.JUSTIFIED,
            children: [
              new TextRun({ text: para, font: FONT, size: 22, color: C.text })
            ]
          })
        );
      }

      // Closing ornament
      sectionBlocks.push(spacer(160, 0));
      sectionBlocks.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 80, after: 80 },
          border: { top: goldBorder(6) },
          children: [
            new TextRun({ text: 'तत त्वं असि  ·  Thou art That', font: FONT, size: 18, italics: true, color: C.gold })
          ]
        })
      );
    }
  }

  // ── Assemble document ─────────────────────────────────
  const doc = new Document({
    styles: {
      default: {
        document: { run: { font: FONT, size: 22, color: C.text } }
      }
    },
    sections: [{
      properties: {
        page: {
          size: { width: 11906, height: 16838 }, // A4
          margin: { top: 1200, right: 1200, bottom: 1200, left: 1440 }
        }
      },
      headers: { default: header },
      footers: { default: footer },
      children: [...titleBlock, ...sectionBlocks]
    }]
  });

  return Packer.toBuffer(doc);
}

module.exports = { buildKathakDoc };
