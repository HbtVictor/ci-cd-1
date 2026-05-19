# mon-premier-cicd

[![CI Pipeline](https://github.com/HbtVictor/ci-cd-1/actions/workflows/ci.yml/badge.svg)](https://github.com/HbtVictor/ci-cd-1/actions/workflows/ci.yml)

## Description
Pipeline CI/CD avec GitHub Actions, Node.js, Jest et ESLint. Construit au fil des séances TP1 → TP2 → TP4.

## Lancer les tests
```bash
npm ci && npm run test:ci
```

## Architecture du pipeline (TP4)

```
PUSH / PR
  ├──▶ 🔍 lint         (composite action setup-node-cached)
  ├──▶ 🧪 test (18)    (reusable workflow test-reusable.yml)   ─┐
  ├──▶ 🧪 test (20)    (reusable workflow test-reusable.yml)   ─┤
                                                                 ▼
                                              📊 report (download tous les artefacts)
```

- `lint`, `test (18)`, `test (20)` démarrent **en parallèle**.
- `report` attend les 3 (`needs: [lint, test]`, `if: always()`) et consolide la couverture dans le **Step Summary** Markdown.

## Configuration avancée du workflow

- **`concurrency`** — `cancel-in-progress: true` annule automatiquement les runs obsolètes quand on push plusieurs fois rapidement sur la même branche.
- **`paths:` filters (Challenge 1)** — Le pipeline ne se déclenche que si `src/**`, `package*.json`, `.github/workflows/**`, `.github/actions/**` ou `.eslintrc.json` changent. Un commit qui ne touche que `README.md` ne déclenche aucun run.
- **Cache npm** — `setup-node@v4 cache: 'npm'` met `node_modules` en cache (clé : hash de `package-lock.json`), gain de 15-40s par job.
- **Matrix Node 18/20 + `fail-fast: false`** — Les deux versions tournent en parallèle et chaque échec produit tout de même son rapport.
- **Seuil de couverture** — `jest.coverageThreshold.global = 80%` (et vérification supplémentaire côté reusable workflow via `coverage-threshold`).

## Réutilisation (Challenges 3 & ULTIME)

### Composite action — `.github/actions/setup-node-cached`
Encapsule `setup-node@v4 (cache: npm)` + `npm ci` en une seule étape.
Usage :
```yaml
- uses: actions/checkout@v4
- uses: ./.github/actions/setup-node-cached
  with:
    node-version: '18'
```

### Reusable workflow — `.github/workflows/test-reusable.yml`
Encapsule tout le job `test` (matrix Node, couverture, seuil, upload artefact). Paramétrable via `inputs.node-versions` et `inputs.coverage-threshold`. Appelé depuis `ci.yml` :
```yaml
test:
  uses: ./.github/workflows/test-reusable.yml
  with:
    node-versions: '[18, 20]'
    coverage-threshold: 80
```

## Tests
- 9 tests unitaires Jest dans `src/__tests__/calculator.test.js`
- Couverture cible : 80% (actuelle : 100%)
- Edge cases couverts : `add(0,x)`, `multiply(x,0)`, `subtract` négatif, `divide` décimale, division par zéro
