export function createUnifiedDiff(path: string, before: string, after: string): string {
  if (before === after) return "";

  const beforeLines = before === "" ? [] : before.replace(/\r\n/g, "\n").split("\n");
  const afterLines = after === "" ? [] : after.replace(/\r\n/g, "\n").split("\n");
  const lines = [`--- ${path}`, `+++ ${path}`, `@@ -1,${beforeLines.length} +1,${afterLines.length} @@`];

  for (const line of beforeLines) lines.push(`-${line}`);
  for (const line of afterLines) lines.push(`+${line}`);

  return lines.join("\n");
}
