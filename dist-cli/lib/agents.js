import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { getCdxHome, getGlobalAgentsPath } from "./paths.js";
function resolveProjectRoot(cwd) {
    const result = spawnSync("git", ["rev-parse", "--show-toplevel"], {
        cwd,
        encoding: "utf8",
    });
    if (result.status === 0) {
        return result.stdout.trim();
    }
    return cwd;
}
async function ensureGitExclude(projectRoot) {
    const excludePath = path.join(projectRoot, ".git", "info", "exclude");
    if (!fs.existsSync(excludePath)) {
        return;
    }
    const current = await fsp.readFile(excludePath, "utf8");
    if (current.includes("/AGENTS.md")) {
        return;
    }
    const next = current.endsWith("\n") || current.length === 0 ? `${current}/AGENTS.md\n` : `${current}\n/AGENTS.md\n`;
    await fsp.writeFile(excludePath, next, "utf8");
}
export async function getAgentsStatus(cwd) {
    const projectRoot = resolveProjectRoot(cwd);
    const globalPath = getGlobalAgentsPath();
    const projectAgentsPath = path.join(projectRoot, "AGENTS.md");
    const globalExists = fs.existsSync(globalPath);
    if (!fs.existsSync(projectAgentsPath)) {
        return {
            projectRoot,
            globalPath,
            globalExists,
            projectAgentsPath,
            projectState: "missing",
            linkedTarget: null,
        };
    }
    const stat = await fsp.lstat(projectAgentsPath);
    if (!stat.isSymbolicLink()) {
        return {
            projectRoot,
            globalPath,
            globalExists,
            projectAgentsPath,
            projectState: "local-file",
            linkedTarget: null,
        };
    }
    const target = await fsp.readlink(projectAgentsPath);
    const resolvedTarget = path.resolve(projectRoot, target);
    return {
        projectRoot,
        globalPath,
        globalExists,
        projectAgentsPath,
        projectState: resolvedTarget === globalPath ? "global-link" : "other-link",
        linkedTarget: resolvedTarget,
    };
}
export async function ensureGlobalAgentsLink(cwd) {
    const status = await getAgentsStatus(cwd);
    if (!status.globalExists || status.projectState !== "missing") {
        return status;
    }
    await fsp.mkdir(path.dirname(status.projectAgentsPath), { recursive: true });
    await fsp.symlink(status.globalPath, status.projectAgentsPath);
    await ensureGitExclude(status.projectRoot);
    return getAgentsStatus(cwd);
}
export async function ensureGlobalAgentsFile() {
    const filePath = getGlobalAgentsPath();
    await fsp.mkdir(getCdxHome(), { recursive: true });
    if (!fs.existsSync(filePath)) {
        const starter = [
            "# Global AGENTS",
            "",
            "Shared instructions for Codex when a repository does not define its own `AGENTS.md`.",
            "",
            "- Preserve repository conventions.",
            "- Avoid destructive git commands unless explicitly requested.",
            "- Keep explanations concise and implementation-focused.",
            "",
        ].join("\n");
        await fsp.writeFile(filePath, starter, "utf8");
    }
    return filePath;
}
