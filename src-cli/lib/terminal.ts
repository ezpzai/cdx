import * as p from "@clack/prompts";

export const CLI_MODES = ["safe", "balanced", "yolo"] as const;
export type CliMode = (typeof CLI_MODES)[number];

export type SelectOneOption<T> = {
  value: T;
  label: string;
  detail?: string;
  hint?: string;
  aliases?: readonly string[]; // Added back to satisfy types, though Clack handles this differently
};

export type SelectOneOptions<T> = {
  defaultValue?: T;
  prompt?: string;
};

export type ConfirmOptions = {
  defaultValue?: boolean;
};

export type SelectModeOptions = {
  question?: string;
  defaultValue?: CliMode;
  prompt?: string; // Clack uses text based prompt instead
};


export async function prompt(question: string): Promise<string> {
  const answer = await p.text({
    message: question,
  });
  
  if (p.isCancel(answer)) {
    p.cancel('Operation cancelled.');
    process.exit(0);
  }
  
  return answer as string;
}

export async function selectOne<T>(
  question: string,
  options: readonly SelectOneOption<T>[],
  config: SelectOneOptions<T> = {}
): Promise<T> {
  const mappedOptions = options.map(opt => ({
    value: opt.value as any, // Clack types are picky, use any internally
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

  return answer as T;
}

export async function confirm(question: string, options: ConfirmOptions = {}): Promise<boolean> {
  const answer = await p.confirm({
    message: question,
    initialValue: options.defaultValue ?? true,
  });

  if (p.isCancel(answer)) {
    p.cancel('Operation cancelled.');
    process.exit(0);
  }

  return answer as boolean;
}

const MODE_OPTIONS: readonly SelectOneOption<CliMode>[] = [
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

export async function selectMode(options: SelectModeOptions = {}): Promise<CliMode> {
  return selectOne<CliMode>(options.question ?? "Select a mode", MODE_OPTIONS, {
    defaultValue: options.defaultValue,
    prompt: options.prompt,
  });
}
