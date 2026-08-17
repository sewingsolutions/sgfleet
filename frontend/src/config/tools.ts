export interface Tool {
  id: string;
  name: string;
  description: string;
  configType: "code" | "checklist";
  language?: string;
}

export const tools: Tool[] = [
  {
    id: "opencode",
    name: "opencode",
    description: "Generate an .opencode.json configuration snippet for SGFleet access.",
    configType: "code",
    language: "json",
  },
  {
    id: "continue",
    name: "Continue.dev",
    description: "Configure Continue.dev to use SGFleet as an OpenAI-compatible provider.",
    configType: "code",
    language: "json",
  },
  {
    id: "cline",
    name: "Cline / Roo Code",
    description: "VS Code settings JSON for Cline or Roo Code extension.",
    configType: "code",
    language: "json",
  },
  {
    id: "interpreter",
    name: "Open Interpreter",
    description: "YAML profile for Open Interpreter with SGFleet as the model provider.",
    configType: "code",
    language: "yaml",
  },
  {
    id: "cursor",
    name: "Cursor",
    description: "Step-by-step checklist to configure Cursor IDE with SGFleet.",
    configType: "checklist",
  },
  {
    id: "claude_code",
    name: "Claude Code",
    description: "Shell environment variables and command for Claude Code.",
    configType: "code",
    language: "shell",
  },
];

export function getToolById(id: string): Tool | undefined {
  return tools.find((t) => t.id === id);
}

export function getDownloadFilename(toolId: string): string {
  const filenames: Record<string, string> = {
    opencode: "opencode.json",
    continue: "continue.json",
    cline: "vscode-cline.json",
    interpreter: "sgfleet.yaml",
    cursor: "(checklist - no download)",
    claude_code: "claude-code.sh",
  };
  return filenames[toolId] || `${toolId}.txt`;
}
