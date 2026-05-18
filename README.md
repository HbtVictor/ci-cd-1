# mon-premier-cicd

[![CI Pipeline](https://github.com/HbtVictor/ci-cd-1/actions/workflows/ci.yml/badge.svg)](https://github.com/HbtVictor/ci-cd-1/actions/workflows/ci.yml)

## Description
Premier pipeline CI/CD avec GitHub Actions, Node.js, Jest et ESLint.

## Lancer les tests
```bash
npm ci && npm test
```

## Pipeline CI/CD

Le workflow `.github/workflows/ci.yml` se déclenche sur chaque `push` et `pull_request` vers `main` (et manuellement via `workflow_dispatch`).

### Étapes du pipeline
- `checkout` → `setup-node` → `npm ci` → `lint` → `test` → upload du rapport de couverture comme artefact.

### Bonus implémentés

- **Jobs parallèles (4.1)** — Le pipeline est découpé en deux jobs indépendants :
  - `lint` : exécute ESLint sur Node 18.
  - `test` : exécute Jest avec couverture.
  Les deux jobs s'exécutent **en parallèle** sur GitHub Actions, ce qui réduit le temps total du pipeline.

- **Matrice de versions Node.js (4.2)** — Le job `test` utilise `strategy.matrix.node-version: [18, 20]`, ce qui produit deux runs en parallèle : `Tests unitaires (Node 18)` et `Tests unitaires (Node 20)`. Le code est ainsi validé sur les deux versions LTS.

- **Seuil de couverture minimum (4.3)** — Le `package.json` configure `jest.coverageThreshold.global` à `80%` pour `branches`, `functions`, `lines` et `statements`. Si la couverture descend sous 80%, `npm test` échoue et le pipeline passe au rouge.
