import { materializeVersionReleaseNotes } from "../dist-cli/lib/release-notes.js";

const [, , command, version] = process.argv;

if (command !== "materialize" || !version) {
  console.error("Usage: node scripts/release-notes.mjs materialize <version>");
  process.exit(1);
}

const filePath = await materializeVersionReleaseNotes(version, process.cwd());
console.log(filePath);
