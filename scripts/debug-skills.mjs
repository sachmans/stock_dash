import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const raw = readFileSync(join(__dir, '../server/lib/skills.yaml'), 'utf-8');

function parseSkillsYaml(raw) {
  const skills = [];
  const lines = raw.split('\n');
  let currentSkill = null;
  let currentField = null;
  let multilineBuffer = [];
  let inArrayField = false;
  let arrayFieldName = '';
  let arrayBuffer = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const indent = line.search(/\S/);
    const trim = line.trim();

    if (trim.startsWith('#') || trim === '') {
      if (currentField && multilineBuffer.length > 0) multilineBuffer.push('');
      continue;
    }

    // New skill entry
    if (/^-\s+name:\s*"(.+)"/.test(trim)) {
      if (currentSkill && currentField) {
        currentSkill[currentField] = multilineBuffer.join('\n');
        multilineBuffer = [];
        currentField = null;
      }
      if (currentSkill?.name) skills.push(currentSkill);
      const match = trim.match(/name:\s*"(.+)"/);
      currentSkill = { name: match[1], frameworks: [], applies_to: [], agent_types: [] };
      currentField = null;
      multilineBuffer = [];
      inArrayField = false;
      continue;
    }

    if (!currentSkill) continue;

    // Multiline block continuation
    if (currentField) {
      if (indent >= 6) {
        multilineBuffer.push(line.replace(/^\s{6}/, ''));
        continue;
      } else {
        currentSkill[currentField] = multilineBuffer.join('\n');
        multilineBuffer = [];
        currentField = null;
      }
    }

    // Array continuation
    if (inArrayField) {
      if (indent >= 6 && trim.startsWith('-')) {
        const val = trim.replace(/^-\s*/, '').replace(/^"|"$/g, '');
        arrayBuffer.push(val);
        continue;
      } else {
        currentSkill[arrayFieldName] = arrayBuffer;
        arrayBuffer = [];
        inArrayField = false;
      }
    }

    // Skip deeply nested lines (input_schema/output_schema internals)
    if (indent > 5) continue;

    // Multiline block start
    const blockMatch = trim.match(/^(\w+):\s*\|$/);
    if (blockMatch) { currentField = blockMatch[1]; multilineBuffer = []; continue; }

    // Quoted key-value
    const kvQuoted = trim.match(/^(\w+):\s*"(.+)"/);
    if (kvQuoted) { currentSkill[kvQuoted[1]] = kvQuoted[2]; continue; }

    // Inline array
    const inlineArray = trim.match(/^(\w+):\s*\[(.+)\]/);
    if (inlineArray) {
      const items = inlineArray[2].split(',').map(s => s.trim().replace(/^"|"$/g, ''));
      currentSkill[inlineArray[1]] = items;
      continue;
    }

    // Unquoted key-value
    const kvUnquoted = trim.match(/^(\w+):\s*(.+)/);
    if (kvUnquoted) {
      currentSkill[kvUnquoted[1]] = kvUnquoted[2].replace(/^"|"$/g, '');
      continue;
    }

    // Array start
    const arrayStart = trim.match(/^(\w+):$/);
    if (arrayStart && lines[i + 1]?.trim().startsWith('-')) {
      inArrayField = true;
      arrayFieldName = arrayStart[1];
      arrayBuffer = [];
      continue;
    }
  }

  if (currentSkill && currentField) currentSkill[currentField] = multilineBuffer.join('\n');
  if (currentSkill?.name) skills.push(currentSkill);
  return { skills };
}

const result = parseSkillsYaml(raw);
console.log(`Total skills parsed: ${result.skills.length}`);
for (const s of result.skills) {
  console.log(`\n=== ${s.name} ===`);
  console.log(`  system_prompt: ${typeof s.system_prompt} (${s.system_prompt ? 'YES' : 'MISSING'})`);
  console.log(`  prompt_template: ${typeof s.prompt_template} (${s.prompt_template ? 'YES' : 'MISSING'})`);
  console.log(`  model_tier: ${s.model_tier || 'MISSING'}`);
  if (typeof s.system_prompt === 'string') {
    console.log(`  system_prompt preview: "${s.system_prompt.substring(0, 60)}..."`);
  }
}
