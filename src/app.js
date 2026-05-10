import {
  BooleanExpressionError,
  buildRepositorySearchQuery,
  evaluateBooleanExpression,
  isFinlandLocation,
  parseBooleanExpression,
  summarizeTechnologies
} from "./search.js";

const GITHUB_API_URL = "https://api.github.com";
const MAX_REPOSITORIES_TO_SCAN = 80;
const MAX_LANGUAGE_REQUESTS_PER_PROFILE = 8;
const DEFAULT_PROFILE_LIMIT = 20;

const form = document.querySelector("#search-form");
const queryInput = document.querySelector("#query");
const tokenInput = document.querySelector("#token");
const limitInput = document.querySelector("#limit");
const statusElement = document.querySelector("#status");
const resultsElement = document.querySelector("#results");
const submitButton = document.querySelector("#submit-button");

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  await runSearch();
});

async function runSearch() {
  const expression = queryInput.value.trim();
  const token = tokenInput.value.trim();
  const profileLimit = clampProfileLimit(limitInput.value);

  resultsElement.replaceChildren();
  setStatus("Valmistellaan hakua...", "loading");
  submitButton.disabled = true;

  try {
    const parsedExpression = parseBooleanExpression(expression);
    const repositoryQuery = buildRepositorySearchQuery(parsedExpression);
    const candidateLogins = await findCandidateLogins(repositoryQuery, profileLimit * 4, token);

    setStatus(`Loytyi ${candidateLogins.length} ehdokasta. Tarkistetaan profiilien sijainti ja teknologiat...`, "loading");

    const profiles = [];
    for (const login of candidateLogins) {
      if (profiles.length >= profileLimit) {
        break;
      }

      const profile = await loadProfileCandidate(login, parsedExpression, token);
      if (profile) {
        profiles.push(profile);
        renderProfiles(profiles);
        setStatus(`Loytyi ${profiles.length}/${profileLimit} sopivaa profiilia...`, "loading");
      }
    }

    if (profiles.length === 0) {
      setStatus("Ei osumia. Kokeile laajempaa teknologiahakua tai GitHub-tokenia rate limitin nostamiseksi.", "empty");
    } else {
      setStatus(`Valmis. Naytetaan ${profiles.length} profiilia.`, "success");
    }
  } catch (error) {
    const message = error instanceof BooleanExpressionError
      ? error.message
      : formatGitHubError(error);
    setStatus(message, "error");
  } finally {
    submitButton.disabled = false;
  }
}

async function findCandidateLogins(repositoryQuery, wantedCount, token) {
  const logins = new Set();
  let page = 1;

  while (logins.size < wantedCount && page <= 5) {
    const params = new URLSearchParams({
      q: repositoryQuery,
      sort: "updated",
      order: "desc",
      per_page: "100",
      page: String(page)
    });
    const data = await githubRequest(`/search/repositories?${params}`, token);

    for (const repository of data.items ?? []) {
      const owner = repository.owner;
      if (owner?.type === "User" && owner.login) {
        logins.add(owner.login);
      }
      if (logins.size >= wantedCount) {
        break;
      }
    }

    if (!data.items || data.items.length === 0) {
      break;
    }
    page += 1;
  }

  return [...logins];
}

async function loadProfileCandidate(login, expressionAst, token) {
  const user = await githubRequest(`/users/${encodeURIComponent(login)}`, token);
  if (!isFinlandLocation(user.location)) {
    return null;
  }

  const repositories = await githubRequest(
    `/users/${encodeURIComponent(login)}/repos?${new URLSearchParams({
      per_page: String(MAX_REPOSITORIES_TO_SCAN),
      sort: "pushed",
      type: "owner"
    })}`,
    token
  );
  const originalRepositories = repositories.filter((repository) => !repository.fork);
  const languageMaps = await fetchRepositoryLanguages(originalRepositories, token);
  const technologies = summarizeTechnologies(originalRepositories, languageMaps);
  const technologyNames = technologies.map((technology) => technology.name);

  if (!evaluateBooleanExpression(expressionAst, technologyNames)) {
    return null;
  }

  return {
    login: user.login,
    name: user.name,
    htmlUrl: user.html_url,
    avatarUrl: user.avatar_url,
    location: user.location,
    bio: user.bio,
    publicRepos: user.public_repos,
    followers: user.followers,
    technologies: technologies.slice(0, 12)
  };
}

async function fetchRepositoryLanguages(repositories, token) {
  const languageMaps = new Map();
  const repositoriesToScan = repositories
    .filter((repository) => repository.languages_url)
    .slice(0, MAX_LANGUAGE_REQUESTS_PER_PROFILE);

  for (const repository of repositoriesToScan) {
    const languages = await githubRequest(repository.languages_url, token, { absoluteUrl: true });
    languageMaps.set(repository.name, languages);
  }

  return languageMaps;
}

async function githubRequest(path, token, options = {}) {
  const response = await fetch(options.absoluteUrl ? path : `${GITHUB_API_URL}${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    }
  });

  if (!response.ok) {
    let details = "";
    try {
      const body = await response.json();
      details = body.message ? ` GitHub: ${body.message}` : "";
    } catch {
      details = "";
    }
    throw new Error(`GitHub API palautti virheen ${response.status}.${details}`);
  }

  return response.json();
}

function renderProfiles(profiles) {
  resultsElement.replaceChildren(...profiles.map(renderProfileCard));
}

function renderProfileCard(profile) {
  const card = document.createElement("article");
  card.className = "profile-card";

  const avatar = document.createElement("img");
  avatar.className = "avatar";
  avatar.src = profile.avatarUrl;
  avatar.alt = "";
  avatar.loading = "lazy";

  const content = document.createElement("div");
  content.className = "profile-content";

  const title = document.createElement("h2");
  const link = document.createElement("a");
  link.href = profile.htmlUrl;
  link.target = "_blank";
  link.rel = "noreferrer";
  link.textContent = profile.name ? `${profile.name} (@${profile.login})` : `@${profile.login}`;
  title.append(link);

  const meta = document.createElement("p");
  meta.className = "meta";
  meta.textContent = [
    profile.location,
    `${profile.publicRepos} repos`,
    `${profile.followers} followers`
  ].filter(Boolean).join(" · ");

  const bio = document.createElement("p");
  bio.className = "bio";
  bio.textContent = profile.bio || "Ei julkista bioa.";

  const technologyList = document.createElement("ul");
  technologyList.className = "technologies";
  for (const technology of profile.technologies) {
    const item = document.createElement("li");
    item.textContent = technology.name;
    technologyList.append(item);
  }

  content.append(title, meta, bio, technologyList);
  card.append(avatar, content);
  return card;
}

function setStatus(message, variant) {
  statusElement.textContent = message;
  statusElement.dataset.variant = variant;
}

function formatGitHubError(error) {
  return error instanceof Error ? error.message : "Tuntematon virhe haussa.";
}

function clampProfileLimit(value) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    return DEFAULT_PROFILE_LIMIT;
  }
  return Math.min(Math.max(parsed, 1), 50);
}
