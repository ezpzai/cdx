import fsp from "node:fs/promises";
import path from "node:path";
const RELEASE_NOTES_DIRNAME = "release-notes";
const UNRELEASED_FILE = "unreleased.md";
const UNRELEASED_TEMPLATE = `# Next release notes

## Added

- Describe user-visible changes here.
`;
export function getReleaseNotesPath(version, cwd = process.cwd()) {
    return path.join(cwd, RELEASE_NOTES_DIRNAME, `v${normalizeVersion(version)}.md`);
}
export function getUnreleasedReleaseNotesPath(cwd = process.cwd()) {
    return path.join(cwd, RELEASE_NOTES_DIRNAME, UNRELEASED_FILE);
}
export async function materializeVersionReleaseNotes(version, cwd = process.cwd()) {
    const releaseNotesDir = path.join(cwd, RELEASE_NOTES_DIRNAME);
    const unreleasedPath = getUnreleasedReleaseNotesPath(cwd);
    const versionPath = getReleaseNotesPath(version, cwd);
    await fsp.mkdir(releaseNotesDir, { recursive: true });
    try {
        await fsp.access(versionPath);
        return versionPath;
    }
    catch {
        const unreleasedNotes = await fsp.readFile(unreleasedPath, "utf8");
        if (!unreleasedNotes.trim()) {
            throw new Error(`Release notes file is empty: ${unreleasedPath}`);
        }
        await fsp.writeFile(versionPath, unreleasedNotes, "utf8");
        await fsp.writeFile(unreleasedPath, UNRELEASED_TEMPLATE, "utf8");
        return versionPath;
    }
}
export async function readReleaseNotes(version, cwd = process.cwd()) {
    return await fsp.readFile(getReleaseNotesPath(version, cwd), "utf8");
}
function normalizeVersion(version) {
    return version.startsWith("v") ? version.slice(1) : version;
}
