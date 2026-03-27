import * as p from "@clack/prompts";
export const CLI_MODES = ["safe", "balanced", "yolo"];
export async function prompt(question) {
    const answer = await p.text({
        message: question,
    });
    if (p.isCancel(answer)) {
        p.cancel('Operation cancelled.');
        process.exit(0);
    }
    return answer;
}
export async function selectOne(question, options, config = {}) {
    const mappedOptions = options.map(opt => ({
        value: opt.value, // Clack types are picky, use any internally
        label: opt.label,
        hint: opt.detail || opt.hint
    }));
    const answer = await p.select({
        message: config.prompt ? `${config.prompt} (${question})` : question,
        options: mappedOptions,
        initialValue: config.defaultValue,
    });
    if (p.isCancel(answer)) {
        p.cancel('Operation cancelled.');
        process.exit(0);
    }
    return answer;
}
export async function confirm(question, options = {}) {
    const answer = await p.confirm({
        message: question,
        initialValue: options.defaultValue ?? true,
    });
    if (p.isCancel(answer)) {
        p.cancel('Operation cancelled.');
        process.exit(0);
    }
    return answer;
}
const MODE_OPTIONS = [
    {
        value: "safe",
        label: "safe",
        detail: "read-only + untrusted approvals",
    },
    {
        value: "balanced",
        label: "balanced",
        detail: "full-auto",
    },
    {
        value: "yolo",
        label: "yolo",
        detail: "bypass approvals and sandbox",
    },
];
export async function selectMode(options = {}) {
    return selectOne(options.question ?? "Select a mode", MODE_OPTIONS, {
        defaultValue: options.defaultValue,
        prompt: options.prompt,
    });
}
