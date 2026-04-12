#!/usr/bin/env node
/**
 * register-skills.mjs
 * ====================
 * One-time setup script to register all stock_dash skills on Core AI Backend.
 * 
 * Usage:
 *   CORE_AI_BACKEND_URL=https://ai.s9n.dxb-gw.basanti.ai \
 *   CORE_AI_BACKEND_JWT=<your-jwt> \
 *   node scripts/register-skills.mjs
 * 
 * If no JWT is provided, the script will attempt to register a service account
 * and use the returned token.
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const BASE_URL = process.env.CORE_AI_BACKEND_URL || 'https://ai.s9n.dxb-gw.basanti.ai';
let JWT = process.env.CORE_AI_BACKEND_JWT || '';

/* ─── Load skill definitions ─── */

function loadSkills() {
  const yamlPath = resolve(__dirname, '..', 'server', 'lib', 'skills.yaml');
  const raw = readFileSync(yamlPath, 'utf-8');
  
  // Simple YAML parser for our flat skill structure
  const skills = [];
  let current = null;
  let inMultiline = null;
  let multilineIndent = 0;
  
  for (const line of raw.split('\n')) {
    // New skill block
    const skillMatch = line.match(/^(\w[\w.]+):\s*$/);
    if (skillMatch) {
      if (current) skills.push(current);
      current = { name: skillMatch[1], system_prompt: '', user_prompt_template: '', model_tier: 'balanced', output_format: 'json', description: '' };
      inMultiline = null;
      continue;
    }
    
    if (!current) continue;
    
    // Key-value pairs
    const kvMatch = line.match(/^\s{2}(\w+):\s*(.*)$/);
    if (kvMatch && !inMultiline) {
      const [, key, value] = kvMatch;
      if (value === '|') {
        inMultiline = key;
        multilineIndent = 4;
        current[key] = '';
      } else {
        current[key] = value.replace(/^["']|["']$/g, '');
      }
      continue;
    }
    
    // Multiline content
    if (inMultiline && line.match(/^\s{4,}/)) {
      current[inMultiline] += line.slice(multilineIndent) + '\n';
      continue;
    }
    
    // End of multiline
    if (inMultiline && !line.match(/^\s{4,}/) && line.trim()) {
      inMultiline = null;
      // Re-process this line
      const kv2 = line.match(/^\s{2}(\w+):\s*(.*)$/);
      if (kv2) {
        const [, key, value] = kv2;
        if (value === '|') {
          inMultiline = key;
          current[key] = '';
        } else {
          current[key] = value.replace(/^["']|["']$/g, '');
        }
      }
    }
  }
  if (current) skills.push(current);
  
  return skills;
}

/* ─── Auth ─── */

async function getOrCreateJWT() {
  if (JWT) return JWT;
  
  console.log('No JWT provided, attempting to register service account...');
  
  // Try login first
  try {
    const loginResp = await fetch(`${BASE_URL}/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'stockdash-service@s25d.com',
        password: 'stockdash-service-2024'
      }),
      signal: AbortSignal.timeout(15000),
    });
    
    if (loginResp.ok) {
      const data = await loginResp.json();
      JWT = data.access_token || data.token;
      console.log('Logged in with existing service account');
      return JWT;
    }
  } catch (e) {
    // Login failed, try register
  }
  
  // Try register
  try {
    const regResp = await fetch(`${BASE_URL}/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'stockdash-service@s25d.com',
        password: 'stockdash-service-2024',
        name: 'StockDash Service'
      }),
      signal: AbortSignal.timeout(15000),
    });
    
    if (regResp.ok) {
      const data = await regResp.json();
      JWT = data.access_token || data.token;
      console.log('Registered new service account');
      return JWT;
    }
    
    console.error('Registration failed:', regResp.status, await regResp.text());
  } catch (e) {
    console.error('Auth error:', e.message);
  }
  
  throw new Error(
    'Could not authenticate. Please provide CORE_AI_BACKEND_JWT env var.\n' +
    'You can get a JWT by calling POST /v1/auth/login on the Core AI Backend.'
  );
}

/* ─── Register Skills ─── */

async function registerSkill(skill) {
  const resp = await fetch(`${BASE_URL}/v1/skills`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${JWT}`,
    },
    body: JSON.stringify({
      name: skill.name,
      description: skill.description || `StockDash skill: ${skill.name}`,
      system_prompt: skill.system_prompt.trim(),
      user_prompt_template: skill.user_prompt_template.trim(),
      model_tier: skill.model_tier || 'balanced',
      output_format: skill.output_format || 'json',
      tags: ['stockdash', 'trading', 'finance'],
      metadata: {
        source: 'stock_dash',
        version: '1.0.0',
      },
    }),
    signal: AbortSignal.timeout(15000),
  });
  
  if (resp.ok) {
    const data = await resp.json();
    return { success: true, id: data.id || data.skill_id, name: skill.name };
  }
  
  // Check if already exists (409 Conflict)
  if (resp.status === 409) {
    console.log(`  ⚠ Skill '${skill.name}' already exists, updating...`);
    
    // Try PUT to update
    const updateResp = await fetch(`${BASE_URL}/v1/skills/by-name/${skill.name}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${JWT}`,
      },
      body: JSON.stringify({
        system_prompt: skill.system_prompt.trim(),
        user_prompt_template: skill.user_prompt_template.trim(),
        model_tier: skill.model_tier || 'balanced',
        output_format: skill.output_format || 'json',
      }),
      signal: AbortSignal.timeout(15000),
    });
    
    if (updateResp.ok) {
      return { success: true, name: skill.name, updated: true };
    }
    
    return { success: false, name: skill.name, error: `Update failed: ${updateResp.status}` };
  }
  
  const errText = await resp.text().catch(() => '');
  return { success: false, name: skill.name, error: `${resp.status}: ${errText}` };
}

/* ─── Main ─── */

async function main() {
  console.log(`\n🔧 StockDash Skill Registration`);
  console.log(`   Core AI Backend: ${BASE_URL}`);
  console.log('');
  
  const skills = loadSkills();
  console.log(`Found ${skills.length} skills to register:\n`);
  
  for (const s of skills) {
    console.log(`  • ${s.name} (${s.model_tier}) — ${s.description || 'no description'}`);
  }
  console.log('');
  
  // Get JWT
  try {
    await getOrCreateJWT();
  } catch (e) {
    console.error(`\n❌ ${e.message}`);
    console.log('\nSkills were NOT registered remotely.');
    console.log('The app will use local prompt rendering via /v1/chat (no auth needed).');
    console.log('This is fine for development — skills will be loaded from skills.yaml.\n');
    process.exit(0);
  }
  
  // Register each skill
  console.log('Registering skills...\n');
  
  let success = 0;
  let failed = 0;
  
  for (const skill of skills) {
    const result = await registerSkill(skill);
    if (result.success) {
      console.log(`  ✅ ${result.name}${result.updated ? ' (updated)' : ''}`);
      success++;
    } else {
      console.log(`  ❌ ${result.name}: ${result.error}`);
      failed++;
    }
  }
  
  console.log(`\nDone: ${success} registered, ${failed} failed.`);
  
  if (failed > 0) {
    console.log('\nFailed skills will use local prompt rendering as fallback.');
  }
  
  console.log('');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
