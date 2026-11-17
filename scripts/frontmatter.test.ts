// Frontmatter of dx's skills, commands and agents must parse as YAML. The host skips a skill whose
// frontmatter fails to parse (an unquoted ": " inside a plain scalar did that).
import assert from "node:assert/strict";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "node:test";
import { parse } from "yaml";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

interface Doc {
  label: string;
  file: string;
  folder?: string;
}

async function entries(rel: string): Promise<string[]> {
  try {
    return (await readdir(path.join(root, rel))).sort();
  } catch {
    return [];
  }
}

async function isDirectory(rel: string): Promise<boolean> {
  try {
    return (await stat(path.join(root, rel))).isDirectory();
  } catch {
    return false;
  }
}

async function collectDocs(): Promise<Doc[]> {
  const docs: Doc[] = [];
  for (const name of await entries("skills")) {
    if (!(await isDirectory(path.join("skills", name)))) continue;
    docs.push({ label: `skills/${name}/SKILL.md`, file: path.join("skills", name, "SKILL.md"), folder: name });
  }
  for (const name of await entries("commands")) {
    if (name.endsWith(".md")) docs.push({ label: `commands/${name}`, file: path.join("commands", name) });
  }
  for (const name of await entries("agents")) {
    if (name.endsWith(".md")) docs.push({ label: `agents/${name}`, file: path.join("agents", name) });
  }
  return docs;
}

// The lines between the leading --- line and the next --- line, or undefined when there is no frontmatter.
export function frontmatterOf(text: string): string | undefined {
  const lines = text.split(/\r?\n/);
  if (lines[0] !== "---") return undefined;
  const end = lines.indexOf("---", 1);
  if (end < 0) return undefined;
  return lines.slice(1, end).join("\n");
}

const docs = await collectDocs();

describe("frontmatter", () => {
  test("dx has skills and commands to check", () => {
    assert.ok(docs.some((doc) => doc.label.startsWith("skills/")), "at least one skill");
    assert.ok(docs.some((doc) => doc.label.startsWith("commands/")), "at least one command");
  });

  for (const doc of docs) {
    test(`${doc.label} frontmatter parses as YAML with a description`, async () => {
      const text = await readFile(path.join(root, doc.file), "utf8");
      const fm = frontmatterOf(text);
      assert.notEqual(fm, undefined, `${doc.label} must start with a --- frontmatter block`);
      const data: unknown = parse(fm ?? "");
      assert.ok(data !== null && typeof data === "object" && !Array.isArray(data), "frontmatter must be a mapping");
      const record = data as Record<string, unknown>;
      assert.equal(typeof record.description, "string", "description must be a string");
      assert.notEqual((record.description as string).trim(), "", "description must be non-empty");
      if (doc.folder !== undefined) {
        assert.equal(record.name, doc.folder, "name must equal the folder name");
      }
    });
  }
});
