import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveConfig } from "../config/environment.js";
import { createContext } from "../server/context.js";
import { ScssService } from "./scss-service.js";

const temporaryRoots: string[] = [];

function makeProject(): { root: string; service: ScssService; config: ReturnType<typeof resolveConfig> } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "jekyll-mcp-scss-"));
  temporaryRoots.push(root);
  fs.mkdirSync(path.join(root, "assets/scss/components"), { recursive: true });
  const config = resolveConfig({ root });
  return {
    root,
    config,
    service: new ScssService(createContext(config)),
  };
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("SCSS update and delete", () => {
  it("updates an existing stylesheet and previews exact diffs", () => {
    const { root, service } = makeProject();
    const file = path.join(root, "assets/scss/components/_card.scss");
    fs.writeFileSync(file, ".card { color: red; }\n");

    const preview = service.update({
      path: "assets/scss/components/_card.scss",
      content: ".card { color: blue; }\n",
      dry_run: true,
    });
    expect(preview.operations).toEqual([
      { type: "update", path: "assets/scss/components/_card.scss" },
    ]);
    expect(preview.diff).toContain("-.card { color: red; }");
    expect(fs.readFileSync(file, "utf8")).toContain("red");

    const result = service.update({
      path: "assets/scss/components/_card.scss",
      content: ".card { color: blue; }\n",
    });
    expect(result.success).toBe(true);
    expect(fs.readFileSync(file, "utf8")).toContain("blue");
  });

  it("previews deletion and direct import cleanup without writing", () => {
    const { root, service } = makeProject();
    fs.writeFileSync(
      path.join(root, "assets/scss", "_framework.scss"),
      '@use "components/card";\n@use "tokens";\n',
    );
    fs.writeFileSync(path.join(root, "assets/scss/components", "_card.scss"), ".card {}\n");

    const result = service.delete({
      path: "assets/scss/components/_card.scss",
      dry_run: true,
    });

    expect(result.operations).toEqual(
      expect.arrayContaining([
        { type: "delete", path: "assets/scss/components/_card.scss" },
        { type: "update", path: "assets/scss/_framework.scss" },
      ]),
    );
    expect(
      result.diffs?.find((entry) => entry.path === "assets/scss/_framework.scss")?.diff,
    ).toContain('-@use "components/card";');
    expect(fs.existsSync(path.join(root, "assets/scss/components", "_card.scss"))).toBe(true);
  });

  it("requires full-write and confirmation to delete a stylesheet", () => {
    const { root, service, config } = makeProject();
    const file = path.join(root, "assets/scss/components/_card.scss");
    fs.writeFileSync(file, ".card {}\n");
    config.writeMode = "full-write";

    const result = service.delete({
      path: "assets/scss/components/_card.scss",
      confirm: true,
    });

    expect(result.success).toBe(true);
    expect(fs.existsSync(file)).toBe(false);
  });

  it("rejects stylesheet paths outside the configured SCSS root", () => {
    const { service } = makeProject();

    const result = service.update({
      path: "README.md",
      content: "replacement",
    });

    expect(result.success).toBe(false);
    expect(result.error?.message).toContain("under assets/scss");
  });
});
