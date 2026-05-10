# GitHub Sourcing Agent

Node-pohjainen verkkopalvelu GitHub-profiilien etsimiseen Suomesta teknologia-avainsanojen perusteella.

## Ominaisuudet

- Boolean-haku teknologioille: `AND`, `OR`, `NOT`, sulkeet ja lainausmerkit.
- Etsii ehdokkaita GitHubin user search -rajapinnalla Suomi-sijainnit edella.
- Suodattaa tulokset GitHub-profiilin sijainnin perusteella Suomeen.
- Lukee kayttajan omat repositoriot ja koostaa usein kaytetyt teknologiat kielista ja topic-tageista.
- Nayttaa profiilin nimen, kayttajatunnuksen, profiililinkin, sijainnin ja teknologiat UI:ssa.
- Tekee GitHub API -kutsut palvelimella, jolloin `GITHUB_TOKEN` ei paady selaimeen.

## Kaytto

```bash
export GITHUB_TOKEN=github_pat_xxx
npm start
```

Avaa selaimessa <http://localhost:5173>.

Palvelin kuuntelee oletuksena kaikissa verkkoliitynnoissa (`HOST=0.0.0.0`) portissa `5173`,
joten samaa palvelua voi kayttaa toiselta koneelta osoitteella:

```text
http://PALVELIMEN_IP_TAI_DOMAIN:5173
```

Voit vaihtaa portin tai hostin:

```bash
PORT=8080 HOST=0.0.0.0 npm start
```

Jos ajat sovellusta Cursor Cloudissa tai muussa etaymparistossa, oman koneesi `localhost`
ei osoita suoraan pilvikoneeseen. Kaynnista ensin `npm start` pilviymparistossa ja avaa
sen jalkeen Cursorin tarjoama port preview / forwarded port portille `5173`.

Voit kayttaa hakua ilman tokenia, mutta GitHubin anonyymit API-rajat tulevat nopeasti vastaan.
Aseta GitHub Personal Access Token palvelimen `GITHUB_TOKEN`-ymparistomuuttujaan, jos haluat
suuremman rate limitin.

Jos palvelu on avoinna internetiin tai jaetulle verkolle, aseta myos yksinkertainen salasanasuojaus:

```bash
APP_PASSWORD=pitka-salasana GITHUB_TOKEN=github_pat_xxx npm start
```

Kun `APP_PASSWORD` on asetettu, selain pyytää kirjautumista. Kayttajatunnus voi olla mita tahansa;
salasanan taytyy olla `APP_PASSWORD`.

## Docker

```bash
docker build -t github-sourcing-agent .
docker run --rm -p 5173:5173 \
  -e GITHUB_TOKEN=github_pat_xxx \
  -e APP_PASSWORD=pitka-salasana \
  github-sourcing-agent
```

## Esimerkkihakuja

- `react AND typescript`
- `(python OR go) AND kubernetes`
- `"machine learning" AND python NOT wordpress`

## Testit

```bash
npm test
```

## Huomioita haun kattavuudesta

GitHub ei tarjoa valmista API:a, joka listaisi kaikki tietyssa maassa olevat kayttajat teknologioittain.
Tama tyokalu tekee haun ensin repositorioista teknologia-avainsanoilla, kerää omistajat ehdokkaiksi ja
tarkistaa sen jalkeen profiilin sijainnin seka todelliset teknologiat. Tulos on kaytannollinen sourcing-lista,
ei taydellinen indeksi kaikista suomalaisista GitHub-kayttajista.
