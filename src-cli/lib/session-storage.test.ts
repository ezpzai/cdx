import assert from "node:assert/strict";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { ensureSessionStorageLayout, ensureSessionStorageLayouts } from "./session-storage.js";

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "cdx-session-storage-test-"));
  try {
    return await fn(dir);
  } finally {
    await fsp.rm(dir, { recursive: true, force: true });
  }
}

test("global 모드는 프로필 sessions를 전역 sessions 심볼릭 링크로 맞춘다", async () => {
  await withTempDir(async (dir) => {
    const globalSessionsPath = path.join(dir, ".cdx", "sessions");
    const profileHomePath = path.join(dir, ".cdx", "profiles", "cdx1");
    await fsp.mkdir(profileHomePath, { recursive: true });

    await ensureSessionStorageLayout({
      profileId: "cdx1",
      profileHomePath,
      globalSessionsPath,
      mode: "global",
    });

    const stats = await fsp.lstat(path.join(profileHomePath, "sessions"));
    assert.equal(stats.isSymbolicLink(), true);
    assert.equal(await fsp.readlink(path.join(profileHomePath, "sessions")), globalSessionsPath);
  });
});

test("global 모드는 기존 프로필 sessions를 전역으로 병합하고 링크로 전환한다", async () => {
  await withTempDir(async (dir) => {
    const globalSessionsPath = path.join(dir, ".cdx", "sessions");
    const profileHomePath = path.join(dir, ".cdx", "profiles", "cdx1");
    const localFilePath = path.join(profileHomePath, "sessions", "2026", "03", "chat.jsonl");
    await fsp.mkdir(path.dirname(localFilePath), { recursive: true });
    await fsp.writeFile(localFilePath, "local-session", "utf8");

    await ensureSessionStorageLayout({
      profileId: "cdx1",
      profileHomePath,
      globalSessionsPath,
      mode: "global",
    });

    const mergedFilePath = path.join(globalSessionsPath, "2026", "03", "chat.jsonl");
    assert.equal(await fsp.readFile(mergedFilePath, "utf8"), "local-session");
    assert.equal((await fsp.lstat(path.join(profileHomePath, "sessions"))).isSymbolicLink(), true);
  });
});

test("global 모드는 충돌한 프로필 sessions 파일을 suffix를 붙여 보존한다", async () => {
  await withTempDir(async (dir) => {
    const globalSessionsPath = path.join(dir, ".cdx", "sessions");
    const profileHomePath = path.join(dir, ".cdx", "profiles", "cdx1");
    const localFilePath = path.join(profileHomePath, "sessions", "2026", "03", "chat.jsonl");
    const globalFilePath = path.join(globalSessionsPath, "2026", "03", "chat.jsonl");
    await fsp.mkdir(path.dirname(localFilePath), { recursive: true });
    await fsp.mkdir(path.dirname(globalFilePath), { recursive: true });
    await fsp.writeFile(localFilePath, "local-session", "utf8");
    await fsp.writeFile(globalFilePath, "global-session", "utf8");

    await ensureSessionStorageLayout({
      profileId: "cdx1",
      profileHomePath,
      globalSessionsPath,
      mode: "global",
    });

    assert.equal(await fsp.readFile(globalFilePath, "utf8"), "global-session");
    assert.equal(
      await fsp.readFile(path.join(globalSessionsPath, "2026", "03", "chat.profile-cdx1-migrated.jsonl"), "utf8"),
      "local-session",
    );
  });
});

test("profile 모드는 전역 링크를 제거하고 로컬 sessions 디렉터리를 만든다", async () => {
  await withTempDir(async (dir) => {
    const globalSessionsPath = path.join(dir, ".cdx", "sessions");
    const profileHomePath = path.join(dir, ".cdx", "profiles", "cdx1");
    await fsp.mkdir(globalSessionsPath, { recursive: true });
    await fsp.mkdir(profileHomePath, { recursive: true });
    await fsp.symlink(globalSessionsPath, path.join(profileHomePath, "sessions"));

    await ensureSessionStorageLayout({
      profileId: "cdx1",
      profileHomePath,
      globalSessionsPath,
      mode: "profile",
    });

    const stats = await fsp.lstat(path.join(profileHomePath, "sessions"));
    assert.equal(stats.isDirectory(), true);
    assert.equal(fs.existsSync(path.join(profileHomePath, "sessions")), true);
  });
});

test("global 전환 시 여러 홈의 sessions를 즉시 전역으로 병합한다", async () => {
  await withTempDir(async (dir) => {
    const globalSessionsPath = path.join(dir, ".cdx", "sessions");
    const codex3HomePath = path.join(dir, ".codex3");
    const codex6HomePath = path.join(dir, ".codex6");
    const codex3File = path.join(codex3HomePath, "sessions", "2026", "03", "26", "chat-a.jsonl");
    const codex6File = path.join(codex6HomePath, "sessions", "2026", "03", "27", "chat-b.jsonl");
    await fsp.mkdir(path.dirname(codex3File), { recursive: true });
    await fsp.mkdir(path.dirname(codex6File), { recursive: true });
    await fsp.writeFile(codex3File, "codex3-session", "utf8");
    await fsp.writeFile(codex6File, "codex6-session", "utf8");

    await ensureSessionStorageLayouts(
      [
        { profileId: "codex3", profileHomePath: codex3HomePath, globalSessionsPath, mode: "global" },
        { profileId: "codex6", profileHomePath: codex6HomePath, globalSessionsPath, mode: "global" },
      ],
    );

    assert.equal(await fsp.readFile(path.join(globalSessionsPath, "2026", "03", "26", "chat-a.jsonl"), "utf8"), "codex3-session");
    assert.equal(await fsp.readFile(path.join(globalSessionsPath, "2026", "03", "27", "chat-b.jsonl"), "utf8"), "codex6-session");
    assert.equal((await fsp.lstat(path.join(codex3HomePath, "sessions"))).isSymbolicLink(), true);
    assert.equal((await fsp.lstat(path.join(codex6HomePath, "sessions"))).isSymbolicLink(), true);
  });
});

test("global 전환 시 같은 profile id의 modern/legacy 홈도 모두 병합한다", async () => {
  await withTempDir(async (dir) => {
    const globalSessionsPath = path.join(dir, ".cdx", "sessions");
    const modernHomePath = path.join(dir, ".cdx", "profiles", "codex3");
    const legacyHomePath = path.join(dir, ".codex3");
    const modernFile = path.join(modernHomePath, "sessions", "2026", "03", "24", "modern.jsonl");
    const legacyFile = path.join(legacyHomePath, "sessions", "2026", "03", "26", "legacy.jsonl");
    await fsp.mkdir(path.dirname(modernFile), { recursive: true });
    await fsp.mkdir(path.dirname(legacyFile), { recursive: true });
    await fsp.writeFile(modernFile, "modern-session", "utf8");
    await fsp.writeFile(legacyFile, "legacy-session", "utf8");

    await ensureSessionStorageLayouts([
      { profileId: "codex3", profileHomePath: modernHomePath, globalSessionsPath, mode: "global" },
      { profileId: "codex3", profileHomePath: legacyHomePath, globalSessionsPath, mode: "global" },
    ]);

    assert.equal(await fsp.readFile(path.join(globalSessionsPath, "2026", "03", "24", "modern.jsonl"), "utf8"), "modern-session");
    assert.equal(await fsp.readFile(path.join(globalSessionsPath, "2026", "03", "26", "legacy.jsonl"), "utf8"), "legacy-session");
  });
});
