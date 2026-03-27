import assert from "node:assert/strict";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { getReleaseNotesPath, materializeVersionReleaseNotes, readReleaseNotes, } from "./release-notes.js";
async function withTempDir(fn) {
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "cdx-release-notes-test-"));
    try {
        return await fn(dir);
    }
    finally {
        await fsp.rm(dir, { recursive: true, force: true });
    }
}
test("버전별 릴리스 노트 경로를 계산한다", () => {
    const notesPath = getReleaseNotesPath("1.0.8", "/repo");
    assert.equal(notesPath, path.join("/repo", "release-notes", "v1.0.8.md"));
});
test("unreleased 릴리스 노트를 현재 버전 파일로 고정한다", async () => {
    await withTempDir(async (dir) => {
        const releaseNotesDir = path.join(dir, "release-notes");
        await fsp.mkdir(releaseNotesDir, { recursive: true });
        await fsp.writeFile(path.join(releaseNotesDir, "unreleased.md"), "## Added\n- interactive session mode\n", "utf8");
        const materializedPath = await materializeVersionReleaseNotes("1.0.8", dir);
        const saved = await fsp.readFile(materializedPath, "utf8");
        const unreleased = await fsp.readFile(path.join(releaseNotesDir, "unreleased.md"), "utf8");
        assert.equal(materializedPath, path.join(releaseNotesDir, "v1.0.8.md"));
        assert.match(saved, /interactive session mode/);
        assert.match(unreleased, /Next release notes/);
    });
});
test("버전 릴리스 노트를 읽는다", async () => {
    await withTempDir(async (dir) => {
        const versionPath = path.join(dir, "release-notes", "v1.0.8.md");
        await fsp.mkdir(path.dirname(versionPath), { recursive: true });
        await fsp.writeFile(versionPath, "## Fixed\n- release body path\n", "utf8");
        const notes = await readReleaseNotes("1.0.8", dir);
        assert.match(notes, /release body path/);
    });
});
