import {
  buildUserSearchQueries,
  evaluateBooleanExpression,
  isFinlandLocation,
  parseBooleanExpression,
  summarizeTechnologies
} from "./search.js";

const GITHUB_API_URL = "https://api.github.com";
const MAX_REPOSITORIES_TO_SCAN = 80;
const MAX_LANGUAGE_REQUESTS_PER_PROFILE = 8;
const DEFAULT_PROFILE_LIMIT = 20;
const MAX_PROFILE_LIMIT = 50;

export async function searchProfiles({ query, limit = DEFAULT_PROFILE_LIMIT, githubToken, onProgress } = {}) {
  const profileLimit = clampProfileLimit(limit);
  const parsedExpression = parseBooleanExpression(query);
  const candidateLogins = await findCandidateLogins(parsedExpression, profileLimit * 10, githubToken);

  onProgress?.({
    phase: "candidates",
    candidateCount: candidateLogins.length,
    profileLimit
  });

  const profiles = [];
  for (const login of candidateLogins) {
    if (profiles.length >= profileLimit) {
      break;
    }

    const profile = await loadProfileCandidate(login, parsedExpression, githubToken);
    if (profile) {
      profiles.push(profile);
      onProgress?.({
        phase: "profile",
        profileCount: profiles.length,
        profileLimit,
        login
      });
    }
  }

  return {
    query,
    candidateCount: candidateLogins.length,
    profileLimit,
    profiles
  };
}

async function findCandidateLogins(expressionAst, wantedCount, token) {
  const logins = new Set();
  const userSearchQueries = buildUserSearchQueries(expressionAst);

  for (const query of userSearchQueries) {
    let page = 1;
    while (logins.size < wantedCount && page <= 2) {
      const params = new URLSearchParams({
        q: query,
        sort: "followers",
        order: "desc",
        per_page: "100",
        page: String(page)
      });
      const data = await githubRequest(`/search/users?${params}`, token);

      for (const user of data.items ?? []) {
        if (user.type === "User" && user.login) {
          logins.add(user.login);
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

    if (logins.size >= wantedCount) {
      break;
    }
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

function clampProfileLimit(value) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    return DEFAULT_PROFILE_LIMIT;
  }
  return Math.min(Math.max(parsed, 1), MAX_PROFILE_LIMIT);
}
