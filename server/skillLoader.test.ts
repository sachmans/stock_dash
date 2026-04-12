import { describe, expect, it, vi, beforeEach } from "vitest";
import { loadSkills, getSkill, getAllSkills, renderPrompt } from "./lib/skillLoader";

describe("SkillLoader", () => {
  it("loads all 8 skill definitions from skills.yaml", () => {
    const skills = loadSkills();
    expect(skills.size).toBe(8);
  });

  it("can retrieve each expected skill by name", () => {
    const expectedSkills = [
      "stockdash.financial_analysis",
      "stockdash.agent_technical",
      "stockdash.agent_fundamental",
      "stockdash.agent_sentiment",
      "stockdash.agent_risk",
      "stockdash.agent_moderator",
      "stockdash.sentiment_scorer",
      "stockdash.kora_chat",
    ];

    for (const name of expectedSkills) {
      const skill = getSkill(name);
      expect(skill, `Skill '${name}' should exist`).toBeDefined();
      expect(skill!.name).toBe(name);
    }
  });

  it("each skill has required fields populated", () => {
    const skills = getAllSkills();

    for (const skill of skills) {
      expect(skill.name, "name should be defined").toBeTruthy();
      expect(skill.description, `${skill.name}: description should be defined`).toBeTruthy();
      expect(skill.system_prompt, `${skill.name}: system_prompt should be defined`).toBeTruthy();
      expect(skill.prompt_template, `${skill.name}: prompt_template should be defined`).toBeTruthy();
      expect(skill.model_tier, `${skill.name}: model_tier should be defined`).toBeTruthy();
      expect(["fast", "balanced", "capable"]).toContain(skill.model_tier);
    }
  });

  it("returns undefined for non-existent skill", () => {
    const skill = getSkill("nonexistent.skill");
    expect(skill).toBeUndefined();
  });
});

describe("renderPrompt", () => {
  it("replaces {{ variable }} placeholders", () => {
    const skill = getSkill("stockdash.financial_analysis")!;
    const { systemPrompt, userPrompt } = renderPrompt(skill, {
      symbol: "AAPL",
      name: "Apple Inc.",
      price: 175.50,
      currency: "USD",
      type: "stock",
    });

    expect(systemPrompt).toContain("senior financial analyst");
    expect(userPrompt).toContain("AAPL");
    expect(userPrompt).toContain("Apple Inc.");
    expect(userPrompt).toContain("175.5");
    expect(userPrompt).toContain("USD");
  });

  it("handles {% if %} blocks — includes block when variable is present", () => {
    const skill = getSkill("stockdash.kora_chat")!;
    const { userPrompt } = renderPrompt(skill, {
      message: "What is the outlook for BRNT?",
      knowledge_context: "BRNT is a crude oil ETC",
    });

    expect(userPrompt).toContain("Knowledge Graph Context");
    expect(userPrompt).toContain("BRNT is a crude oil ETC");
    expect(userPrompt).toContain("What is the outlook for BRNT?");
  });

  it("handles {% if %} blocks — removes block when variable is absent", () => {
    const skill = getSkill("stockdash.kora_chat")!;
    const { userPrompt } = renderPrompt(skill, {
      message: "Hello",
    });

    expect(userPrompt).not.toContain("Knowledge Graph Context");
    expect(userPrompt).not.toContain("Memory Vault Context");
    expect(userPrompt).toContain("Hello");
  });

  it("system_prompt for sentiment_scorer mentions sentiment", () => {
    const skill = getSkill("stockdash.sentiment_scorer")!;
    const { systemPrompt } = renderPrompt(skill, {
      symbol: "BRNT.L",
      name: "Brent Crude",
    });

    expect(systemPrompt.toLowerCase()).toContain("sentiment");
  });

  it("agent skills have distinct system prompts", () => {
    const technical = getSkill("stockdash.agent_technical")!;
    const fundamental = getSkill("stockdash.agent_fundamental")!;
    const sentiment = getSkill("stockdash.agent_sentiment")!;
    const risk = getSkill("stockdash.agent_risk")!;

    const prompts = [
      technical.system_prompt,
      fundamental.system_prompt,
      sentiment.system_prompt,
      risk.system_prompt,
    ];

    // All should be unique
    const unique = new Set(prompts);
    expect(unique.size).toBe(4);
  });
});
