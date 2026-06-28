import * as XLSX from "xlsx";

export const MAX_EXPORT_LIMIT = 2000;

// Sanitize strings to protect against CSV / Spreadsheet formula injection
export function sanitizeCell(val: unknown): string {
  if (val === null || val === undefined) return "";
  
  const cleanStr = String(val).trim();
  // Formula triggers prefix check
  if (
    cleanStr.startsWith("=") ||
    cleanStr.startsWith("+") ||
    cleanStr.startsWith("-") ||
    cleanStr.startsWith("@")
  ) {
    // Prepend a single apostrophe to escape the formula interpretation in Excel
    return `'${cleanStr}`;
  }
  return cleanStr;
}

export function formatDateKolkata(dateVal: Date | string | null): string {
  if (!dateVal) return "N/A";
  const date = new Date(dateVal);
  if (isNaN(date.getTime())) return "N/A";
  
  // Format inside Asia/Kolkata
  return date.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

export function generateExcelResponse(
  headers: string[],
  dataRows: unknown[][],
  sheetName = "Report",
  appliedFilters: Record<string, string> = {}
): Response {
  // Check row capacity limits
  if (dataRows.length > MAX_EXPORT_LIMIT) {
    return new Response(
      JSON.stringify({
        error: `Export exceeds the limit of ${MAX_EXPORT_LIMIT} rows. Please narrow down your search filters or select a shorter date range.`,
      }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  // Prepend metadata rows for applied filters summary
  const metaRows: string[][] = [
    ["REPORT EXPORT SUMMARY"],
    ["Generated At", formatDateKolkata(new Date())],
  ];

  if (Object.keys(appliedFilters).length > 0) {
    metaRows.push(["Applied Filters:"]);
    Object.entries(appliedFilters).forEach(([key, val]) => {
      metaRows.push([`  ${key}`, val]);
    });
  }
  
  metaRows.push([]); // blank divider row

  // Sanitize headers and data rows
  const cleanHeaders = headers.map(sanitizeCell);
  const cleanData = dataRows.map((row) => row.map(sanitizeCell));

  // Assemble sheet array of arrays
  const finalSheetRows = [...metaRows, cleanHeaders, ...cleanData];

  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet(finalSheetRows);
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

  const buffer = XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as Uint8Array;

  return new Response(buffer as any, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${sheetName.toLowerCase().replace(/\s+/g, "_")}_export_${Date.now()}.xlsx"`,
    },
  });
}
