import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { formatEvent, MAX_MESSAGE_LENGTH, SAMPLE_EVENT } from "../dist/format.js";

describe("formatEvent", () => {
  test("deployment success, in English and French", () => {
    const en = formatEvent(SAMPLE_EVENT, "en");
    assert.match(en, /^✅ \*\*Deployment succeeded\*\* · my-app/);
    assert.match(en, /Project: demo \/ production/);
    assert.match(en, /Open app: https:\/\/my-app\.example\.com\//);
    assert.match(en, /Open in Coolify: https:\/\/coolify\.example\.com\//);
    assert.doesNotMatch(en, /\]\(/, "no Markdown links: Root only accepts root:// ones");

    const fr = formatEvent(SAMPLE_EVENT, "fr");
    assert.match(fr, /Déploiement réussi/);
    assert.match(fr, /Projet : demo \/ production/);
  });

  test("links can be disabled (fallback when Root rejects a message)", () => {
    const text = formatEvent(SAMPLE_EVENT, "en", { links: false });
    assert.doesNotMatch(text, /https?:\/\//);
    assert.match(text, /Deployment succeeded/);
  });

  test("deployment failure shows no app link", () => {
    const text = formatEvent({ ...SAMPLE_EVENT, success: false, event: "deployment_failed" }, "en");
    assert.match(text, /^❌ \*\*Deployment failed\*\*/);
    assert.doesNotMatch(text, /Open app/);
  });

  test("backup failure renders the end of the error output in a code block", () => {
    const text = formatEvent(
      {
        success: false,
        event: "backup_failed",
        database_name: "postgres-main",
        database_type: "postgresql",
        frequency: "0 3 * * *",
        error_output: "x".repeat(2000) + "\nFATAL: disk full ```",
        url: "https://coolify.example.com/db",
      },
      "en",
    );
    assert.match(text, /postgres-main/);
    assert.match(text, /```\n…/);
    assert.match(text, /FATAL: disk full '''/, "keeps the end of the log and neutralises fences");
  });

  test("high disk usage", () => {
    const text = formatEvent(
      { success: false, event: "high_disk_usage", server_name: "prod-1", disk_usage: 93, threshold: 80 },
      "fr",
    );
    assert.match(text, /💽 \*\*Espace disque critique\*\* · prod-1/);
    assert.match(text, /93% \(seuil 80%\)/);
  });

  test("traefik outdated lists servers", () => {
    const text = formatEvent(
      { success: false, event: "traefik_version_outdated", servers: [{ name: "a" }, { name: "b" }] },
      "en",
    );
    assert.match(text, /Affected servers: a, b/);
  });

  test("unknown events fall back to the Coolify message", () => {
    const text = formatEvent({ success: true, event: "brand_new_event", message: "Something happened" }, "en");
    assert.match(text, /Coolify event `brand_new_event`/);
    assert.match(text, /Something happened/);
  });

  test("ignores unsafe links and multi-line injection in inline fields", () => {
    const text = formatEvent(
      { success: true, event: "deployment_success", application_name: "app\n**fake**", url: "javascript:alert(1)" },
      "en",
    );
    assert.equal(text.split("\n")[0], "✅ **Deployment succeeded** · app **fake**");
    assert.doesNotMatch(text, /javascript:/);
  });

  test("never exceeds the message limit", () => {
    const text = formatEvent({ success: false, event: "general", message: "y".repeat(10_000) }, "en");
    assert.ok(text.length <= MAX_MESSAGE_LENGTH);
  });
});
