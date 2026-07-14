import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createVscodeApi, loadL10nMessages } from "../src";

async function createExtensionFixture(files: Record<string, Record<string, string>>) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "airdb-l10n-test-"));
  const l10nDir = path.join(root, "l10n");
  await fs.mkdir(l10nDir, { recursive: true });
  for (const [fileName, content] of Object.entries(files)) {
    await fs.writeFile(path.join(l10nDir, fileName), JSON.stringify(content), "utf8");
  }
  return root;
}

describe("l10n API", () => {
  it("loads localized extension bundle messages and formats positional arguments", async () => {
    const extensionPath = await createExtensionFixture({
      "bundle.l10n.json": {
        "Run SQL": "Run SQL",
        "Importing sql file {0}": "Importing sql file {0}"
      },
      "bundle.l10n.zh-cn.json": {
        "Run SQL": "执行SQL",
        "Importing sql file {0}": "正在导入sql文件{0}"
      }
    });

    try {
      const api = createVscodeApi({
        extensionId: "fixture.one",
        extensionPath,
        language: "zh-CN",
        bridge: {
          request: async () => undefined as never,
          notify: () => undefined
        }
      });

      expect(api.l10n.t("Run SQL")).toBe("执行SQL");
      expect(api.l10n.t("Importing sql file {0}", "backup.sql")).toBe("正在导入sql文件backup.sql");
    } finally {
      await fs.rm(extensionPath, { recursive: true, force: true });
    }
  });

  it("falls back to base language bundles before default text", async () => {
    const extensionPath = await createExtensionFixture({
      "bundle.l10n.json": { Saved: "Saved" },
      "bundle.l10n.fr.json": { Saved: "Enregistre" }
    });

    try {
      expect(loadL10nMessages(extensionPath, "fr-FR").Saved).toBe("Enregistre");
    } finally {
      await fs.rm(extensionPath, { recursive: true, force: true });
    }
  });
});
