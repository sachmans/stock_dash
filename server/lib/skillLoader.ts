/**
 * Skill Loader — loads skill definitions from skills.yaml and provides
 * them to the AI provider for prompt resolution.
 *
 * Two execution modes:
 * 1. REMOTE: Call Core AI Backend /v1/skills/run-by-name (requires JWT auth)
 * 2. LOCAL:  Use the YAML definitions directly with /v1/chat (no auth needed)
 *
 * The loader tries REMOTE first, falls back to LOCAL automatically.
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

// ESM/esbuild compatibility: __dirname may not be defined
const _currentDir = typeof __dirname !== 'undefined'
  ? __dirname
  : dirname(typeof import.meta?.url === 'string' ? fileURLToPath(import.meta.url) : process.cwd());

// ── Types ────────────────────────────────────────────────────────────
export interface SkillDefinition {
  name: string;
  description: string;
  category: string;
  language: string;
  frameworks: string[];
  applies_to: string[];
  agent_types: string[];
  model_tier: "fast" | "balanced" | "capable";
  system_prompt: string;
  prompt_template: string;
  input_schema: Record<string, unknown>;
  output_schema: Record<string, unknown>;
}

interface SkillsYaml {
  skills: SkillDefinition[];
}

// ── Singleton cache ──────────────────────────────────────────────────
let _skills: Map<string, SkillDefinition> | null = null;

/**
 * Load and cache all skill definitions from skills.yaml.
 */
export function loadSkills(): Map<string, SkillDefinition> {
  if (_skills) return _skills;

  try {
    const yamlPath = join(_currentDir, "skills.yaml");
    const raw = readFileSync(yamlPath, "utf-8");

    // Simple YAML parser for our flat structure
    // We parse the YAML manually to avoid adding a yaml dependency
    const parsed = parseSkillsYaml(raw);
    _skills = new Map<string, SkillDefinition>();

    for (const skill of parsed.skills) {
      _skills.set(skill.name, skill);
    }

    console.log(`[SkillLoader] Loaded ${_skills.size} skill definitions`);
    return _skills;
  } catch (err) {
    console.error("[SkillLoader] Failed to load skills.yaml:", err);
    _skills = new Map();
    return _skills;
  }
}

/**
 * Get a specific skill definition by name.
 */
export function getSkill(name: string): SkillDefinition | undefined {
  return loadSkills().get(name);
}

/**
 * Get all skill definitions.
 */
export function getAllSkills(): SkillDefinition[] {
  return Array.from(loadSkills().values());
}

/**
 * Render a skill's prompt template with the given variables.
 * Supports simple Jinja2-style {{ variable }} and {% if %} blocks.
 */
export function renderPrompt(
  skill: SkillDefinition,
  variables: Record<string, string | number | undefined>
): { systemPrompt: string; userPrompt: string } {
  const systemPrompt = (skill.system_prompt || "").trim();
  let userPrompt = skill.prompt_template || "";

  // Replace {{ variable }} placeholders
  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, "g");
    userPrompt = userPrompt.replace(regex, String(value ?? ""));
  }

  // Handle {% if variable %} ... {% endif %} blocks
  userPrompt = userPrompt.replace(
    /\{%\s*if\s+(\w+)\s*%\}([\s\S]*?)\{%\s*endif\s*%\}/g,
    (_match, varName, content) => {
      const val = variables[varName];
      if (val !== undefined && val !== null && val !== "") {
        // Replace variables inside the if block too
        let result = content;
        for (const [k, v] of Object.entries(variables)) {
          const r = new RegExp(`\\{\\{\\s*${k}\\s*\\}\\}`, "g");
          result = result.replace(r, String(v ?? ""));
        }
        return result;
      }
      return "";
    }
  );

  // Handle {% for item in array %} ... {% endfor %} blocks (basic support)
  // This is simplified — for complex templates, use the remote skill execution
  userPrompt = userPrompt.replace(
    /\{%\s*for\s+\w+\s+in\s+\w+\s*%\}[\s\S]*?\{%\s*endfor\s*%\}/g,
    (match) => {
      // For loop blocks are handled by the caller passing pre-formatted text
      return match;
    }
  );

  // Clean up any remaining template syntax
  userPrompt = userPrompt.replace(/\{%[\s\S]*?%\}/g, "").trim();

  return { systemPrompt, userPrompt };
}

// ── Simple YAML Parser ───────────────────────────────────────────────
// Parses our specific skills.yaml format without external dependencies.
//
// Structure expected:
//   skills:
//     - name: "skill.name"
//       description: "..."
//       system_prompt: |
//         multiline content
//       prompt_template: |
//         multiline content
//       frameworks: ["a", "b"]
//
// All skill-level fields are indented at 4 spaces.
// Multiline block content is indented at 6+ spaces.

function parseSkillsYaml(raw: string): SkillsYaml {
  const skills: SkillDefinition[] = [];
  const lines = raw.split("\n");

  let currentSkill: Partial<SkillDefinition> | null = null;
  let currentField: string | null = null;
  let multilineBuffer: string[] = [];
  let inArrayField = false;
  let arrayFieldName = "";
  let arrayBuffer: string[] = [];

  // Helper: get the indent-stripped content of a line
  const stripped = (line: string) => line.trim();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const indent = line.search(/\S/);
    const trim = stripped(line);

    // Skip comments and empty lines
    if (trim.startsWith("#") || trim === "") {
      if (currentField && multilineBuffer.length > 0) {
        multilineBuffer.push("");
      }
      continue;
    }

    // New skill entry: "  - name: ..."
    if (/^-\s+name:\s*"(.+)"/.test(trim)) {
      // Save previous multiline field
      if (currentSkill && currentField) {
        (currentSkill as any)[currentField] = multilineBuffer.join("\n");
        multilineBuffer = [];
        currentField = null;
      }
      // Save previous skill
      if (currentSkill?.name) {
        skills.push(currentSkill as SkillDefinition);
      }

      const match = trim.match(/name:\s*"(.+)"/);
      currentSkill = {
        name: match![1],
        frameworks: [],
        applies_to: [],
        agent_types: [],
      };
      currentField = null;
      multilineBuffer = [];
      inArrayField = false;
      continue;
    }

    if (!currentSkill) continue;

    // Handle multiline block continuation (system_prompt, prompt_template with |)
    if (currentField) {
      // Multiline content is at indent >= 6 (deeper than the field at indent 4)
      if (indent >= 6) {
        // Strip the 6-space prefix from content lines
        multilineBuffer.push(line.replace(/^\s{6}/, ""));
        continue;
      } else {
        // End of multiline block — save it
        (currentSkill as any)[currentField] = multilineBuffer.join("\n");
        multilineBuffer = [];
        currentField = null;
        // Fall through to process this line as a new field
      }
    }

    // Handle array field continuation
    if (inArrayField) {
      if (indent >= 6 && trim.startsWith("-")) {
        const val = trim.replace(/^-\s*/, "").replace(/^"|"$/g, "");
        arrayBuffer.push(val);
        continue;
      } else {
        (currentSkill as any)[arrayFieldName] = arrayBuffer;
        arrayBuffer = [];
        inArrayField = false;
        // Fall through to process this line
      }
    }

    // Only parse skill-level fields at indent 4.
    // Deeper indentation (indent >= 6) belongs to nested structures
    // like input_schema/output_schema properties — skip those.
    if (indent > 5) {
      continue;
    }

    // ── Field-level parsing (all use `trim` which is fully stripped) ──

    // Multiline block start: field_name: |
    const blockMatch = trim.match(/^(\w+):\s*\|$/);
    if (blockMatch) {
      currentField = blockMatch[1];
      multilineBuffer = [];
      continue;
    }

    // Quoted key-value: field_name: "value"
    const kvQuoted = trim.match(/^(\w+):\s*"(.+)"/);
    if (kvQuoted) {
      (currentSkill as any)[kvQuoted[1]] = kvQuoted[2];
      continue;
    }

    // Inline array: field_name: ["a", "b", "c"]
    const inlineArray = trim.match(/^(\w+):\s*\[(.+)\]/);
    if (inlineArray) {
      const items = inlineArray[2]
        .split(",")
        .map((s) => s.trim().replace(/^"|"$/g, ""));
      (currentSkill as any)[inlineArray[1]] = items;
      continue;
    }

    // Unquoted key-value: field_name: value
    const kvUnquoted = trim.match(/^(\w+):\s*(.+)/);
    if (kvUnquoted) {
      (currentSkill as any)[kvUnquoted[1]] = kvUnquoted[2].replace(/^"|"$/g, "");
      continue;
    }

    // Array start (field_name: followed by - items on next line)
    const arrayStart = trim.match(/^(\w+):$/);
    if (arrayStart && lines[i + 1]?.trim().startsWith("-")) {
      inArrayField = true;
      arrayFieldName = arrayStart[1];
      arrayBuffer = [];
      continue;
    }
  }

  // Save last multiline field and skill
  if (currentSkill && currentField) {
    (currentSkill as any)[currentField] = multilineBuffer.join("\n");
  }
  if (currentSkill?.name) {
    skills.push(currentSkill as SkillDefinition);
  }

  return { skills };
}
