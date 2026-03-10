export type ThemeId = "sepia" | "modern-dark" | "teal";

export const themeOptions: Array<{
  id: ThemeId;
  label: string;
  shortLabel: string;
  metaColor: string;
}> = [
  { id: "sepia", label: "Sepia", shortLabel: "SP", metaColor: "#efe5d7" },
  { id: "modern-dark", label: "Modern Dark", shortLabel: "MD", metaColor: "#11161c" },
  { id: "teal", label: "Teal", shortLabel: "TL", metaColor: "#d8f0eb" },
];

export function isThemeId(value: string | null): value is ThemeId {
  return themeOptions.some((option) => option.id === value);
}
