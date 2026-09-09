/* docx is half a megabyte of OOXML machinery and most sessions never open the
   Word menu item, so it is imported at the moment of the click rather than
   shipped with the page. CSV needs nothing but string handling. */
type Docx = typeof import("docx");

export type Column<T> = {
  key: string;
  header: string;
  value: (row: T) => string | number | null | undefined;
  width?: number;
};

const cell = (value: string | number | null | undefined) =>
  value === null || value === undefined ? "" : String(value);

/* A leading =, +, - or @ makes Excel treat the cell as a formula. Report titles
   routinely start with a dash, so every exported cell is neutralised rather than
   trusting the data to be inert. */
function csvField(value: string) {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv<T>(columns: Column<T>[], rows: T[]) {
  const lines = [columns.map((c) => csvField(c.header)).join(",")];
  for (const row of rows) lines.push(columns.map((c) => csvField(cell(c.value(row)))).join(","));
  return lines.join("\r\n");
}

function save(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoked on the next frame so the download has already been handed off.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function stampedName(base: string, extension: string) {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
  return `adigram-${base}-${stamp}.${extension}`;
}

export function downloadCsv<T>(base: string, columns: Column<T>[], rows: T[]) {
  // The BOM is what makes Excel on Windows read the file as UTF-8.
  const blob = new Blob([`\uFEFF${toCsv(columns, rows)}`], {
    type: "text/csv;charset=utf-8;",
  });
  save(blob, stampedName(base, "csv"));
}

export type DocSection<T> = {
  heading: string;
  summary?: string;
  columns: Column<T>[];
  rows: T[];
};

function tableFor<T>(docx: Docx, section: DocSection<T>) {
  const { Paragraph, Table, TableCell, TableRow, TextRun, WidthType } = docx;
  const header = new TableRow({
    tableHeader: true,
    children: section.columns.map(
      (column) =>
        new TableCell({
          shading: { fill: "EEF2FB" },
          children: [
            new Paragraph({
              children: [new TextRun({ text: column.header, bold: true, size: 18 })],
            }),
          ],
        }),
    ),
  });

  const body = section.rows.map(
    (row) =>
      new TableRow({
        children: section.columns.map(
          (column) =>
            new TableCell({
              children: [
                new Paragraph({
                  children: [new TextRun({ text: cell(column.value(row)), size: 18 })],
                }),
              ],
            }),
        ),
      }),
  );

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    columnWidths: section.columns.map((c) => c.width ?? Math.round(9000 / section.columns.length)),
    rows: [header, ...body],
  });
}

/** Builds a real OOXML document rather than an HTML file with a .docx name, so
 *  the tables stay editable when the report is pasted into a status pack. */
export async function downloadDocx(
  base: string,
  title: string,
  subtitle: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sections: DocSection<any>[],
) {
  const docx = await import("docx");
  const { AlignmentType, Document, HeadingLevel, Packer, Paragraph, Table, TextRun } = docx;

  const children: (InstanceType<typeof Paragraph> | InstanceType<typeof Table>)[] = [
    new Paragraph({ text: title, heading: HeadingLevel.HEADING_1 }),
    new Paragraph({
      alignment: AlignmentType.LEFT,
      children: [new TextRun({ text: subtitle, italics: true, color: "5A6478", size: 20 })],
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: `Generated ${new Date().toLocaleString("en-IN")} · ADIGRAMS 2.0 readiness dashboard`,
          color: "8A90A0",
          size: 18,
        }),
      ],
    }),
  ];

  for (const section of sections) {
    children.push(new Paragraph({ text: "", spacing: { after: 120 } }));
    children.push(new Paragraph({ text: section.heading, heading: HeadingLevel.HEADING_2 }));
    if (section.summary)
      children.push(
        new Paragraph({ children: [new TextRun({ text: section.summary, size: 20 })] }),
      );
    children.push(new Paragraph({ text: "", spacing: { after: 80 } }));
    children.push(
      section.rows.length
        ? tableFor(docx, section)
        : new Paragraph({
            children: [
              new TextRun({ text: "No rows match the current filters.", italics: true, size: 20 }),
            ],
          }),
    );
  }

  const document = new Document({
    creator: "ADIGRAMS readiness dashboard",
    title,
    description: subtitle,
    sections: [{ properties: {}, children }],
  });

  save(
    new Blob([await Packer.toBlob(document)], {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }),
    stampedName(base, "docx"),
  );
}
