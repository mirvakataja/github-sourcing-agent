const BOOLEAN_OPERATORS = new Set(["AND", "OR", "NOT"]);

const TECHNOLOGY_ALIASES = new Map([
  ["next", "nextjs"],
  ["next.js", "nextjs"],
  ["js", "javascript"],
  ["node", "nodejs"],
  ["node.js", "nodejs"],
  ["ts", "typescript"],
  ["py", "python"],
  ["golang", "go"],
  ["c sharp", "c#"],
  ["csharp", "c#"],
  ["dotnet", ".net"],
  ["reactjs", "react"],
  ["vuejs", "vue"],
  ["postgres", "postgresql"]
]);

const GITHUB_LANGUAGE_QUALIFIERS = new Map([
  ["angular", "typescript"],
  ["c", "c"],
  ["c#", "c#"],
  ["c++", "c++"],
  ["css", "css"],
  ["django", "python"],
  ["go", "go"],
  ["html", "html"],
  ["java", "java"],
  ["javascript", "javascript"],
  ["kotlin", "kotlin"],
  ["nextjs", "typescript"],
  ["nodejs", "javascript"],
  ["php", "php"],
  ["python", "python"],
  ["r", "r"],
  ["rails", "ruby"],
  ["react", "typescript"],
  ["ruby", "ruby"],
  ["rust", "rust"],
  ["scala", "scala"],
  ["shell", "shell"],
  ["swift", "swift"],
  ["typescript", "typescript"],
  ["vue", "typescript"]
]);

const TECHNOLOGY_KEYWORDS = new Map([
  ["angular", ["angular"]],
  ["aws", ["aws", "amazon web services"]],
  ["azure", ["azure"]],
  ["django", ["django"]],
  ["docker", ["docker"]],
  ["graphql", ["graphql"]],
  ["kubernetes", ["kubernetes", "k8s"]],
  ["nextjs", ["nextjs", "next.js", "next js"]],
  ["nodejs", ["nodejs", "node.js", "node js"]],
  ["postgresql", ["postgresql", "postgres"]],
  ["rails", ["rails", "ruby on rails"]],
  ["react", ["react", "reactjs", "react.js", "react native"]],
  ["svelte", ["svelte", "sveltekit"]],
  ["terraform", ["terraform"]],
  ["vue", ["vue", "vuejs", "vue.js"]]
]);

const FINLAND_LOCATION_TERMS = [
  "finland",
  "suomi",
  "helsinki",
  "espoo",
  "tampere",
  "turku",
  "oulu",
  "vantaa",
  "jyvaskyla",
  "lahti",
  "kuopio",
  "pori",
  "joensuu",
  "lappeenranta",
  "vaasa",
  "rovaniemi",
  "hameenlinna",
  "seinajoki",
  "kotka",
  "salo"
];

const FINLAND_LOCATION_SEARCH_TERMS = [
  "Finland",
  "Suomi",
  "Helsinki",
  "Espoo",
  "Tampere",
  "Turku",
  "Oulu",
  "Vantaa",
  "Jyvaskyla",
  "Jyväskylä",
  "Lahti",
  "Kuopio",
  "Pori",
  "Joensuu",
  "Lappeenranta",
  "Vaasa",
  "Rovaniemi",
  "Hameenlinna",
  "Hämeenlinna",
  "Seinajoki",
  "Seinäjoki",
  "Kotka",
  "Salo"
];

export class BooleanExpressionError extends Error {
  constructor(message) {
    super(message);
    this.name = "BooleanExpressionError";
  }
}

export function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeTechnology(value) {
  const normalized = normalizeText(value);
  return TECHNOLOGY_ALIASES.get(normalized) ?? normalized;
}

export function tokenizeBooleanExpression(expression) {
  const source = String(expression ?? "").trim();
  const tokens = [];
  let index = 0;

  while (index < source.length) {
    const char = source[index];

    if (/\s/.test(char)) {
      index += 1;
      continue;
    }

    if (char === "(" || char === ")") {
      tokens.push({ type: char, value: char });
      index += 1;
      continue;
    }

    if (char === "\"") {
      let end = index + 1;
      let value = "";
      while (end < source.length && source[end] !== "\"") {
        value += source[end];
        end += 1;
      }

      if (end >= source.length) {
        throw new BooleanExpressionError("Puuttuva lopettava lainausmerkki boolean-haussa.");
      }

      const normalizedValue = normalizeTechnology(value);
      if (normalizedValue) {
        tokens.push({ type: "TERM", value: normalizedValue, raw: value });
      }
      index = end + 1;
      continue;
    }

    let end = index;
    while (end < source.length && !/\s|\(|\)|"/.test(source[end])) {
      end += 1;
    }

    const value = source.slice(index, end);
    const upper = value.toUpperCase();
    if (BOOLEAN_OPERATORS.has(upper)) {
      tokens.push({ type: upper, value: upper });
    } else {
      const normalizedValue = normalizeTechnology(value);
      if (normalizedValue) {
        tokens.push({ type: "TERM", value: normalizedValue, raw: value });
      }
    }
    index = end;
  }

  return insertImplicitAnd(tokens);
}

function insertImplicitAnd(tokens) {
  const result = [];
  for (const token of tokens) {
    const previous = result[result.length - 1];
    if (previous && needsImplicitAnd(previous, token)) {
      result.push({ type: "AND", value: "AND", implicit: true });
    }
    result.push(token);
  }
  return result;
}

function needsImplicitAnd(previous, current) {
  const previousEndsExpression = previous.type === "TERM" || previous.type === ")";
  const currentStartsExpression = current.type === "TERM" || current.type === "NOT" || current.type === "(";
  return previousEndsExpression && currentStartsExpression;
}

export function parseBooleanExpression(expression) {
  const tokens = tokenizeBooleanExpression(expression);
  if (tokens.length === 0) {
    throw new BooleanExpressionError("Anna ainakin yksi teknologia hakuehdoksi.");
  }

  let position = 0;

  function peek() {
    return tokens[position];
  }

  function consume(type) {
    const token = peek();
    if (!token || token.type !== type) {
      throw new BooleanExpressionError(`Odotettiin tokenia ${type}.`);
    }
    position += 1;
    return token;
  }

  function parseOr() {
    let node = parseAnd();
    while (peek()?.type === "OR") {
      consume("OR");
      node = { type: "OR", left: node, right: parseAnd() };
    }
    return node;
  }

  function parseAnd() {
    let node = parseNot();
    while (peek()?.type === "AND") {
      consume("AND");
      node = { type: "AND", left: node, right: parseNot() };
    }
    return node;
  }

  function parseNot() {
    if (peek()?.type === "NOT") {
      consume("NOT");
      return { type: "NOT", node: parseNot() };
    }
    return parsePrimary();
  }

  function parsePrimary() {
    const token = peek();
    if (!token) {
      throw new BooleanExpressionError("Boolean-haku loppui kesken.");
    }

    if (token.type === "TERM") {
      consume("TERM");
      return { type: "TERM", value: token.value };
    }

    if (token.type === "(") {
      consume("(");
      const expressionNode = parseOr();
      consume(")");
      return expressionNode;
    }

    throw new BooleanExpressionError(`Odottamaton token: ${token.value}.`);
  }

  const ast = parseOr();
  if (position < tokens.length) {
    throw new BooleanExpressionError(`Odottamaton token: ${tokens[position].value}.`);
  }

  return ast;
}

export function evaluateBooleanExpression(expression, technologies) {
  const ast = typeof expression === "string" ? parseBooleanExpression(expression) : expression;
  const normalizedTechnologies = new Set([...technologies].map(normalizeTechnology).filter(Boolean));

  function evaluate(node) {
    switch (node.type) {
      case "TERM":
        return normalizedTechnologies.has(node.value);
      case "AND":
        return evaluate(node.left) && evaluate(node.right);
      case "OR":
        return evaluate(node.left) || evaluate(node.right);
      case "NOT":
        return !evaluate(node.node);
      default:
        throw new BooleanExpressionError(`Tuntematon boolean-solmu: ${node.type}.`);
    }
  }

  return evaluate(ast);
}

export function extractPositiveTerms(expression) {
  const ast = typeof expression === "string" ? parseBooleanExpression(expression) : expression;
  const terms = new Set();

  function visit(node, negated = false) {
    switch (node.type) {
      case "TERM":
        if (!negated) {
          terms.add(node.value);
        }
        break;
      case "NOT":
        visit(node.node, !negated);
        break;
      case "AND":
      case "OR":
        visit(node.left, negated);
        visit(node.right, negated);
        break;
      default:
        break;
    }
  }

  visit(ast);
  return [...terms];
}

export function buildRepositorySearchQuery(expression) {
  const positiveTerms = extractPositiveTerms(expression);
  if (positiveTerms.length === 0) {
    throw new BooleanExpressionError("Hakuehto tarvitsee ainakin yhden positiivisen teknologian.");
  }

  const searchableTerms = positiveTerms.map(toGitHubSearchTerm).filter(Boolean);
  return `${searchableTerms.join(" OR ")} archived:false`;
}

export function buildUserSearchQueries(expression) {
  const positiveTerms = extractPositiveTerms(expression);
  if (positiveTerms.length === 0) {
    throw new BooleanExpressionError("Hakuehto tarvitsee ainakin yhden positiivisen teknologian.");
  }

  const languageTerms = [...new Set(positiveTerms.map(toGitHubLanguageQualifier).filter(Boolean))];
  const queries = [];

  for (const language of languageTerms) {
    for (const location of FINLAND_LOCATION_SEARCH_TERMS) {
      queries.push(`location:${toGitHubSearchTerm(location)} type:user language:${toGitHubSearchTerm(language)}`);
    }
  }

  for (const location of FINLAND_LOCATION_SEARCH_TERMS) {
    queries.push(`location:${toGitHubSearchTerm(location)} type:user`);
  }

  return [...new Set(queries)];
}

function toGitHubSearchTerm(term) {
  if (/^[a-z0-9+#.]+$/i.test(term)) {
    return term;
  }
  return `"${term.replace(/"/g, "")}"`;
}

function toGitHubLanguageQualifier(term) {
  return GITHUB_LANGUAGE_QUALIFIERS.get(normalizeTechnology(term));
}

export function isFinlandLocation(location) {
  const normalized = normalizeText(location);
  if (!normalized) {
    return false;
  }
  return FINLAND_LOCATION_TERMS.some((term) => normalized.includes(term));
}

export function summarizeTechnologies(repositories, languageMaps = new Map()) {
  const counts = new Map();

  for (const repository of repositories) {
    const languages = languageMaps.get(repository.name) ?? {};
    const languageEntries = Object.entries(languages);

    if (languageEntries.length > 0) {
      for (const [language, bytes] of languageEntries) {
        addTechnologyCount(counts, language, Number(bytes) || 1);
      }
    } else if (repository.language) {
      addTechnologyCount(counts, repository.language, 1);
    }

    for (const topic of repository.topics ?? []) {
      addTechnologyCount(counts, topic, 1);
    }

    for (const detectedTechnology of detectTechnologiesFromRepositoryText(repository)) {
      addTechnologyCount(counts, detectedTechnology, 1);
    }
  }

  return [...counts.entries()]
    .map(([name, score]) => ({ name, score }))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}

function detectTechnologiesFromRepositoryText(repository) {
  const text = normalizeText([
    repository.name,
    repository.description,
    repository.homepage
  ].filter(Boolean).join(" "));
  const detected = [];

  for (const [technology, keywords] of TECHNOLOGY_KEYWORDS) {
    if (keywords.some((keyword) => text.includes(normalizeText(keyword)))) {
      detected.push(technology);
    }
  }

  return detected;
}

function addTechnologyCount(counts, value, increment) {
  const normalized = normalizeTechnology(value);
  if (!normalized) {
    return;
  }
  counts.set(normalized, (counts.get(normalized) ?? 0) + increment);
}
