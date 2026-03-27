import assert from "node:assert/strict";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createDefaultConfig, loadConfig, setSessionMode } from "./config.js";

test("기본 config는 global session 모드를 사용한다", () => {
  const config = createDefaultConfig();
  assert.equal(config.sessionMode, "global");
});

test("sessionMode가 없는 기존 config는 global로 정규화된다", async () => {
  const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), "cdx-config-test-"));
  const configPath = path.join(tempDir, "config.json");
  await fsp.writeFile(
    configPath,
    `${JSON.stringify({ version: 1, defaultMode: "balanced", profiles: {}, lowQuotaPreferredProfiles: [], recentHandoffs: {} }, null, 2)}\n`,
    "utf8",
  );

  const loaded = await loadConfig(configPath);
  assert.equal(loaded.config.sessionMode, "global");
  assert.equal(loaded.sessionModeConfigured, false);
});

test("sessionMode가 명시된 config는 설정 완료 상태로 로드된다", async () => {
  const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), "cdx-config-test-"));
  const configPath = path.join(tempDir, "config.json");
  await fsp.writeFile(
    configPath,
    `${JSON.stringify(
      { version: 1, defaultMode: "balanced", sessionMode: "profile", profiles: {}, lowQuotaPreferredProfiles: [], recentHandoffs: {} },
      null,
      2,
    )}\n`,
    "utf8",
  );

  const loaded = await loadConfig(configPath);
  assert.equal(loaded.config.sessionMode, "profile");
  assert.equal(loaded.sessionModeConfigured, true);
});

test("setSessionMode는 session 모드를 저장한다", () => {
  const nextConfig = setSessionMode(createDefaultConfig(), "profile");
  assert.equal(nextConfig.sessionMode, "profile");
});
