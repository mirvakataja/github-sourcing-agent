const DEFAULT_PROFILE_LIMIT = 20;

const form = document.querySelector("#search-form");
const queryInput = document.querySelector("#query");
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
  const profileLimit = clampProfileLimit(limitInput.value);

  resultsElement.replaceChildren();
  setStatus("Haetaan profiileja palvelimelta...", "loading");
  submitButton.disabled = true;

  try {
    const result = await searchProfiles(expression, profileLimit);
    renderProfiles(result.profiles);

    if (result.profiles.length === 0) {
      setStatus(
        `Ei osumia ${result.candidateCount} suomalaisesta ehdokkaasta. Kokeile laajempaa hakua tai suurempaa maksimiprofiilien maaraa.`,
        "empty"
      );
    } else {
      setStatus(`Valmis. Naytetaan ${result.profiles.length} profiilia ${result.candidateCount} ehdokkaasta.`, "success");
    }
  } catch (error) {
    setStatus(formatError(error), "error");
  } finally {
    submitButton.disabled = false;
  }
}

async function searchProfiles(query, limit) {
  const response = await fetch("/api/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ query, limit })
  });

  if (!response.ok) {
    let message = `Palvelin palautti virheen ${response.status}.`;
    try {
      const body = await response.json();
      message = body.error ?? message;
    } catch {
      // Keep the generic HTTP status message if the response is not JSON.
    }
    throw new Error(message);
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

function formatError(error) {
  return error instanceof Error ? error.message : "Tuntematon virhe haussa.";
}

function clampProfileLimit(value) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    return DEFAULT_PROFILE_LIMIT;
  }
  return Math.min(Math.max(parsed, 1), 50);
}
