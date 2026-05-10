import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { BooleanExpressionError } from "./src/search.js";
import { searchProfiles } from "./src/githubSearchService.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const PUBLIC_ROOT = resolve(__dirname);
const PORT = Number.parseInt(process.env.PORT ?? "5173", 10);
const HOST = process.env.HOST ?? "0.0.0.0";
const GITHUB_TOKEN = process.env.GITHUB_TOKEN ?? "";
const APP_PASSWORD = process.env.APP_PASSWORD ?? "";
const MAX_BODY_BYTES = 16_384;
const PUBLIC_PATHS = new Set(["/", "/index.html", "/styles.css", "/src/app.js"]);

const MIME_TYPES = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"]
]);

const server = createServer(async (request, response) => {
  try {
    if (request.url === "/healthz") {
      sendJson(response, 200, { ok: true });
      return;
    }

    if (!isAuthorized(request)) {
      response.writeHead(401, {
        "Content-Type": "text/plain; charset=utf-8",
        "WWW-Authenticate": 'Basic realm="GitHub Sourcing Agent"'
      });
      response.end("Authentication required");
      return;
    }

    if (request.method === "POST" && request.url === "/api/search") {
      await handleSearch(request, response);
      return;
    }

    if (request.method === "GET" || request.method === "HEAD") {
      await serveStaticFile(request, response);
      return;
    }

    sendJson(response, 405, { error: "Method not allowed" });
  } catch (error) {
    const statusCode = error instanceof BooleanExpressionError ? 400 : 500;
    sendJson(response, statusCode, {
      error: error instanceof Error ? error.message : "Tuntematon palvelinvirhe."
    });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`GitHub Sourcing Agent listening at http://${HOST}:${PORT}`);
  if (!GITHUB_TOKEN) {
    console.log("GITHUB_TOKEN is not set; GitHub API rate limits will be low.");
  }
  if (!APP_PASSWORD) {
    console.log("APP_PASSWORD is not set; protect the service with your network/firewall if exposed.");
  }
});

async function handleSearch(request, response) {
  const body = await readJsonBody(request);
  const result = await searchProfiles({
    query: body.query,
    limit: body.limit,
    githubToken: GITHUB_TOKEN
  });

  sendJson(response, 200, result);
}

async function readJsonBody(request) {
  const chunks = [];
  let totalBytes = 0;

  for await (const chunk of request) {
    totalBytes += chunk.length;
    if (totalBytes > MAX_BODY_BYTES) {
      throw new Error("Request body is too large.");
    }
    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new Error("Request body must be valid JSON.");
  }
}

async function serveStaticFile(request, response) {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
  if (!PUBLIC_PATHS.has(url.pathname) && !PUBLIC_PATHS.has(pathname)) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  const filePath = resolve(PUBLIC_ROOT, `.${normalize(pathname)}`);

  if (!filePath.startsWith(PUBLIC_ROOT)) {
    response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Forbidden");
    return;
  }

  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) {
      throw new Error("Not a file");
    }

    response.writeHead(200, {
      "Content-Length": fileStat.size,
      "Content-Type": MIME_TYPES.get(extname(filePath)) ?? "application/octet-stream"
    });

    if (request.method === "HEAD") {
      response.end();
      return;
    }

    createReadStream(filePath).pipe(response);
  } catch {
    const fallbackPath = join(PUBLIC_ROOT, "index.html");
    const html = await readFile(fallbackPath);
    response.writeHead(404, {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Length": html.length
    });
    response.end(html);
  }
}

function isAuthorized(request) {
  if (!APP_PASSWORD) {
    return true;
  }

  const authorization = request.headers.authorization;
  if (!authorization?.startsWith("Basic ")) {
    return false;
  }

  const decoded = Buffer.from(authorization.slice("Basic ".length), "base64").toString("utf8");
  const [, password] = decoded.split(":");
  return password === APP_PASSWORD;
}

function sendJson(response, statusCode, body) {
  const payload = JSON.stringify(body);
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload)
  });
  response.end(payload);
}
