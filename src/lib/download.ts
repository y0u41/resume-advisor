export type DownloadFormat = "pdf" | "docx" | "txt" | "md";

export interface ReportData {
  job_title: string;
  job_url?: string;
  score: number | null;
  report: string;
  created_at: string;
}

function metaRows(data: ReportData) {
  const rows: { label: string; value: string }[] = [
    { label: "应聘岗位", value: data.job_title || "—" },
  ];
  if (data.job_url) rows.push({ label: "岗位链接", value: data.job_url });
  rows.push({ label: "评分", value: `${data.score ?? "—"} / 10` });
  rows.push({ label: "评估时间", value: new Date(data.created_at).toLocaleString("zh-CN") });
  return rows;
}

function buildPlainText(data: ReportData): string {
  const lines: string[] = ["简历评估报告", ""];
  for (const r of metaRows(data)) lines.push(`${r.label}：${r.value}`);
  lines.push("", "----------------------------------------", "");
  lines.push(data.report);
  return lines.join("\n");
}

function buildMarkdown(data: ReportData): string {
  const lines: string[] = ["# 简历评估报告", ""];
  for (const r of metaRows(data)) lines.push(`- ${r.label}：${r.value}`);
  lines.push("", "---", "", data.report);
  return lines.join("\n");
}

function baseFilename(data: ReportData): string {
  const date = new Date().toISOString().slice(0, 10);
  return `简历评估报告_${data.job_title || "岗位"}_${date}`;
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function downloadDocx(data: ReportData, name: string) {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel } = await import("docx");

  const children: any[] = [
    new Paragraph({ text: "简历评估报告", heading: HeadingLevel.HEADING_1 }),
  ];
  for (const r of metaRows(data)) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: `${r.label}：`, bold: true }), new TextRun({ text: r.value })],
      })
    );
  }
  children.push(new Paragraph({ text: "" }));

  for (const line of data.report.split("\n")) {
    const trimmed = line.trim();
    const sec = trimmed.match(/^【(.+?)】\s*(.*)$/);
    if (sec) {
      children.push(new Paragraph({ text: `【${sec[1]}】`, heading: HeadingLevel.HEADING_2 }));
      if (sec[2]) children.push(new Paragraph({ text: sec[2] }));
    } else {
      children.push(new Paragraph({ text: line }));
    }
  }

  const doc = new Document({ sections: [{ children }] });
  const blob = await Packer.toBlob(doc);
  saveBlob(blob, `${name}.docx`);
}

async function downloadPdf(data: ReportData, name: string) {
  const html2canvas = (await import("html2canvas")).default;
  const { jsPDF } = await import("jspdf");

  const holder = document.createElement("div");
  holder.style.position = "fixed";
  holder.style.left = "-10000px";
  holder.style.top = "0";
  holder.style.width = "760px";
  holder.style.background = "#ffffff";
  holder.style.color = "#111827";
  holder.style.padding = "32px";
  holder.style.fontFamily = "'Microsoft YaHei', 'PingFang SC', sans-serif";
  holder.style.fontSize = "14px";
  holder.style.lineHeight = "1.75";

  const metaHtml = metaRows(data)
    .map(
      (r) =>
        `<div style="margin-bottom:4px;"><b>${escapeHtml(r.label)}：</b>${escapeHtml(r.value)}</div>`
    )
    .join("");

  holder.innerHTML = `
    <h1 style="font-size:24px;margin:0 0 16px;color:#1e293b;">简历评估报告</h1>
    ${metaHtml}
    <hr style="border:none;border-top:1px solid #e2e8f0;margin:16px 0;" />
    <div style="white-space:pre-wrap;">${escapeHtml(data.report)}</div>
  `;
  document.body.appendChild(holder);

  try {
    const canvas = await html2canvas(holder, {
      scale: 2,
      backgroundColor: "#ffffff",
      useCORS: true,
    });
    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF("p", "mm", "a4");
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const imgWidth = pageWidth;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    let heightLeft = imgHeight;
    let position = 0;

    pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;

    while (heightLeft > 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
    }

    pdf.save(`${name}.pdf`);
  } finally {
    document.body.removeChild(holder);
  }
}

export async function downloadReport(data: ReportData, format: DownloadFormat) {
  const name = baseFilename(data);

  if (format === "txt") {
    saveBlob(new Blob([buildPlainText(data)], { type: "text/plain;charset=utf-8" }), `${name}.txt`);
  } else if (format === "md") {
    saveBlob(
      new Blob([buildMarkdown(data)], { type: "text/markdown;charset=utf-8" }),
      `${name}.md`
    );
  } else if (format === "docx") {
    await downloadDocx(data, name);
  } else if (format === "pdf") {
    await downloadPdf(data, name);
  }
}
