import readline from "node:readline";
import { stdin, stdout } from "node:process";
export const CLI_MODES = ["safe", "balanced", "yolo"];
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
async function withPromptSession(run) {
    const rl = readline.createInterface({
        input: stdin,
        output: stdout,
    });
    const ask = (question) => new Promise((resolve) => {
        rl.question(question, (answer) => resolve(answer.trim()));
    });
    try {
        return await run(ask);
    }
    finally {
        rl.close();
    }
}
function normalizeAnswer(value) {
    return value.trim().toLowerCase();
}
function matchesOption(option, answer) {
    const normalizedAnswer = normalizeAnswer(answer);
    if (normalizedAnswer === normalizeAnswer(option.label)) {
        return true;
    }
    if (typeof option.value === "string" && normalizedAnswer === normalizeAnswer(option.value)) {
        return true;
    }
    return option.aliases?.some((alias) => normalizedAnswer === normalizeAnswer(alias)) ?? false;
}
function renderOptions(question, options) {
    console.log(question.trimEnd());
    console.log("");
    for (const [index, option] of options.entries()) {
        const detail = option.detail ? ` - ${option.detail}` : "";
        console.log(`  ${index + 1}. ${option.label}${detail}`);
    }
}
export async function prompt(question) {
    return withPromptSession((ask) => ask(question));
}
export async function selectOne(question, options, config = {}) {
    if (options.length === 0) {
        throw new Error("selectOne requires at least one option.");
    }
    const defaultIndex = config.defaultValue === undefined ? -1 : options.findIndex((option) => Object.is(option.value, config.defaultValue));
    if (config.defaultValue !== undefined && defaultIndex === -1) {
        throw new Error("selectOne defaultValue must match one of the provided options.");
    }
    renderOptions(question, options);
    return withPromptSession(async (ask) => {
        const range = options.length === 1 ? "1" : `1-${options.length}`;
        const defaultHint = defaultIndex >= 0 ? ` (default: ${defaultIndex + 1})` : "";
        const promptLabel = config.prompt ?? "Choose an option";
        while (true) {
            const answer = await ask(`${promptLabel} [${range}]${defaultHint}: `);
            if (answer === "" && defaultIndex >= 0) {
                return options[defaultIndex].value;
            }
            const choice = Number(answer);
            if (Number.isInteger(choice) && choice >= 1 && choice <= options.length) {
                return options[choice - 1].value;
            }
            const matched = options.find((option) => matchesOption(option, answer));
            if (matched) {
                return matched.value;
            }
            console.log(`Invalid selection. Enter a number from 1 to ${options.length}.`);
        }
    });
}
export async function confirm(question, options = {}) {
    return withPromptSession(async (ask) => {
        const suffix = options.defaultValue === true ? "[Y/n]" : options.defaultValue === false ? "[y/N]" : "[y/n]";
        while (true) {
            const answer = normalizeAnswer(await ask(`${question} ${suffix} `));
            if (answer === "") {
                if (options.defaultValue !== undefined) {
                    return options.defaultValue;
                }
            }
            else if (answer === "y" || answer === "yes") {
                return true;
            }
            else if (answer === "n" || answer === "no") {
                return false;
            }
            console.log('Please answer "y" or "n".');
        }
    });
}
export async function selectMode(options = {}) {
    return selectOne(options.question ?? "Select a mode:", MODE_OPTIONS, {
        defaultValue: options.defaultValue,
        prompt: options.prompt ?? "Choose a mode",
    });
}
