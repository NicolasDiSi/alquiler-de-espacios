#!/usr/bin/env node
import ts from "typescript";

/**
 * The `strings` gate (spec 0002, AC-7): every visible text in apps/web comes from the message catalog.
 *
 * Flags, in apps/web/src: JSX text, string literals rendered as JSX children, and the visible props `aria-label`,
 * `title`, `placeholder`, `alt` and `label` when they hold a literal with letters. Ignores everything else (className,
 * data-*, routes, ids), test files, and `components/ui/` (shadcn/ui output; its default labels are passed translated
 * where the component is used).
 *
 * Usage: node scripts/check-strings.mjs [files...]   (no files: the whole of apps/web/src)
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
const WEB_SRC = join(REPO_ROOT, "apps/web/src");
const VISIBLE_PROPS = new Set(["aria-label", "title", "placeholder", "alt", "label"]);
const HAS_LETTER = /\p{L}/u;

function isIgnored(file) {
  const path = relative(REPO_ROOT, file).replaceAll("\\", "/");
  return (
    !path.startsWith("apps/web/src/") ||
    !path.endsWith(".tsx") ||
    /\.test\.tsx$/.test(path) ||
    path.startsWith("apps/web/src/components/ui/")
  );
}

function listFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  });
}

/** The literal text of an expression, when it is a plain string; otherwise null. */
function literalText(node) {
  if (!node) return null;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isTemplateExpression(node))
    return [node.head.text, ...node.templateSpans.map((s) => s.literal.text)].join(" ");
  if (ts.isParenthesizedExpression(node)) return literalText(node.expression);
  return null;
}

/** Returns `{ line, column, text }` for every hardcoded visible text in one source file. */
export function findHardcodedStrings(fileName, source) {
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const findings = [];
  const report = (node, text) => {
    const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    findings.push({ line: line + 1, column: character + 1, text: text.trim().replaceAll(/\s+/g, " ") });
  };

  const visit = (node) => {
    if (ts.isJsxText(node) && HAS_LETTER.test(node.text)) {
      report(node, node.text);
    } else if (ts.isJsxExpression(node) && !ts.isJsxAttribute(node.parent)) {
      const text = literalText(node.expression);
      if (text && HAS_LETTER.test(text)) report(node, text);
    } else if (ts.isJsxAttribute(node) && VISIBLE_PROPS.has(node.name.getText(sourceFile))) {
      const value = node.initializer;
      const text = value && ts.isJsxExpression(value) ? literalText(value.expression) : literalText(value);
      if (text && HAS_LETTER.test(text)) report(node, `${node.name.getText(sourceFile)}="${text}"`);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return findings;
}

function main() {
  const requested = process.argv.slice(2).map((file) => join(process.cwd(), file));
  const files = (requested.length > 0 ? requested : listFiles(WEB_SRC)).filter((file) => !isIgnored(file));
  let count = 0;
  for (const file of files) {
    for (const finding of findHardcodedStrings(file, readFileSync(file, "utf8"))) {
      count += 1;
      console.log(`${relative(REPO_ROOT, file)}:${finding.line}:${finding.column}  ${finding.text}`);
    }
  }
  if (count > 0) {
    console.log(`${count} visible text(s) written in code. Move them to apps/web/messages/es.json and use t().`);
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
