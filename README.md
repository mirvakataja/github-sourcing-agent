# GitHub Sourcing Agent

Selainkayttoinen tyokalu GitHub-profiilien etsimiseen Suomesta teknologia-avainsanojen perusteella.

## Ominaisuudet

- Boolean-haku teknologioille: `AND`, `OR`, `NOT`, sulkeet ja lainausmerkit.
- Etsii ehdokkaita GitHubin repository search -rajapinnalla.
- Suodattaa tulokset GitHub-profiilin sijainnin perusteella Suomeen.
- Lukee kayttajan omat repositoriot ja koostaa usein kaytetyt teknologiat kielista ja topic-tageista.
- Nayttaa profiilin nimen, kayttajatunnuksen, profiililinkin, sijainnin ja teknologiat UI:ssa.

## Kaytto

```bash
npm start
```

Avaa selaimessa <http://localhost:5173>.

Voit kayttaa hakua ilman tokenia, mutta GitHubin anonyymit API-rajat tulevat nopeasti vastaan.
Syota kenttaan GitHub Personal Access Token, jos haluat suuremman rate limitin. Tokenia ei tallenneta
palvelimelle tai selaimen pysyvaan muistiin; se lahetetaan vain GitHub API -kutsujen Authorization-headerissa.

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
