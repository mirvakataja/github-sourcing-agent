import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildRepositorySearchQuery,
  buildUserSearchQueries,
  evaluateBooleanExpression,
  extractPositiveTerms,
  isFinlandLocation,
  normalizeTechnology,
  summarizeTechnologies,
  tokenizeBooleanExpression
} from "../src/search.js";

describe("boolean technology search", () => {
  it("treats whitespace between terms as AND", () => {
    const tokens = tokenizeBooleanExpression("react typescript");
    assert.deepEqual(tokens.map((token) => token.type), ["TERM", "AND", "TERM"]);
  });

  it("evaluates AND, OR, NOT and parentheses", () => {
    assert.equal(evaluateBooleanExpression("(react OR vue) AND typescript NOT java", ["React", "TypeScript"]), true);
    assert.equal(evaluateBooleanExpression("(react OR vue) AND typescript NOT java", ["Vue", "Java"]), false);
  });

  it("extracts only positive terms for GitHub repository search", () => {
    assert.deepEqual(extractPositiveTerms("python AND kubernetes NOT wordpress"), ["python", "kubernetes"]);
  });

  it("builds a repository search query from positive terms", () => {
    assert.equal(buildRepositorySearchQuery("react OR \"machine learning\""), 'react OR "machine learning" archived:false');
  });

  it("builds Finland-first user search queries", () => {
    const queries = buildUserSearchQueries("react");

    assert.equal(queries[0], "location:Finland type:user language:typescript");
    assert.ok(queries.includes("location:Finland type:user"));
  });
});

describe("profile filtering helpers", () => {
  it("normalizes common technology aliases", () => {
    assert.equal(normalizeTechnology("Node.js"), "nodejs");
    assert.equal(normalizeTechnology("Golang"), "go");
  });

  it("detects Finnish locations with and without diacritics", () => {
    assert.equal(isFinlandLocation("Jyvaskyla, Finland"), true);
    assert.equal(isFinlandLocation("Jyväskylä"), true);
    assert.equal(isFinlandLocation("Stockholm, Sweden"), false);
  });

  it("summarizes languages and topics by score", () => {
    const repositories = [
      { name: "api", language: "TypeScript", topics: ["node.js", "postgres"] },
      { name: "ui", language: "JavaScript", topics: ["react"] }
    ];
    const languages = new Map([
      ["api", { TypeScript: 500, JavaScript: 100 }],
      ["ui", { JavaScript: 300 }]
    ]);

    assert.deepEqual(
      summarizeTechnologies(repositories, languages).slice(0, 3),
      [
        { name: "typescript", score: 500 },
        { name: "javascript", score: 400 },
        { name: "nodejs", score: 1 }
      ]
    );
  });

  it("detects common frameworks from repository text", () => {
    const repositories = [
      { name: "customer-portal", description: "React Native mobile app", language: "TypeScript", topics: [] }
    ];

    assert.equal(summarizeTechnologies(repositories).some((technology) => technology.name === "react"), true);
  });
});
