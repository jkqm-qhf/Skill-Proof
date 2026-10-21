import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

export function makePdf(pages) {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  const kids = [];
  for (const page of pages) {
    const pageId = objects.length + 1,
      contentId = pageId + 1;
    kids.push(`${pageId} 0 R`);
    const lines = page.split("\n");
    const escape = (text) => text.replace(/([\\()])/g, "\\$1");
    const stream = `BT /F1 12 Tf 72 720 Td ${lines.map((line, index) => `${index ? "0 -24 Td " : ""}(${escape(line)}) Tj`).join("\n")} ET\n`;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`,
    );
    objects.push(
      `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}endstream`,
    );
  }
  objects[1] = `<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${pages.length} >>`;
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((offset) => `${offset.toString().padStart(10, "0")} 00000 n \n`)
    .join(
      "",
    )}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf);
}

export async function generateFixtures(directory) {
  await mkdir(directory, { recursive: true });
  const definitions = [
    {
      id: "single-page",
      title: "单页文本与换行",
      pages: [
        "SkillProof PDF baseline\nThe quick brown fox jumps over the lazy dog.\nTotal: 42 items.",
      ],
    },
    {
      id: "multi-page",
      title: "分页与阅读顺序",
      pages: ["Page one\nFirst paragraph.", "Page two\nSecond paragraph."],
    },
    {
      id: "blank-page",
      title: "空白页保留",
      pages: ["", "Text after a blank page."],
    },
    {
      id: "punctuation",
      title: "标点与括号",
      pages: [
        "Invoice (sample)\nAmount: USD 1,234.50; tax: 8%.\nReference: A/B-C_2026.",
      ],
    },
    { id: "invalid-file", title: "损坏输入应报错", error: true },
  ];
  const cases = [];
  for (const definition of definitions) {
    const data = definition.error
      ? Buffer.from("SkillProof intentionally invalid PDF fixture.\n")
      : makePdf(definition.pages);
    const file = `${definition.id}.pdf`;
    await writeFile(`${directory}/${file}`, data);
    cases.push({
      id: definition.id,
      title: definition.title,
      file,
      sha256: createHash("sha256").update(data).digest("hex"),
      bytes: data.length,
      expect: definition.error ? { error: true } : { pages: definition.pages },
    });
  }
  const manifest = {
    id: "pdf-text-baseline",
    version: "1.0.0",
    title: "数字 PDF 文本提取基准",
    scope:
      "Synthetic English/ASCII digital PDFs only. No OCR, columns, formulas, or image-based text.",
    license: "CC0-1.0",
    scoring:
      "Page count/order and exact text after whitespace normalization; invalid fixture must return an error.",
    cases,
  };
  await writeFile(
    `${directory}/manifest.json`,
    JSON.stringify(manifest, null, 2) + "\n",
  );
  return manifest;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const directory = fileURLToPath(
    new URL("../public/fixtures/pdf-text-v1", import.meta.url),
  );
  await generateFixtures(directory);
  console.log("Generated 5 versioned PDF fixtures and their SHA-256 manifest.");
}
