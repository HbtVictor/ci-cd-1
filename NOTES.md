# NOTES — Expérimentations TP4

## Expérience 1 — `fail-fast` (test `node version check` qui échoue sur Node 20)

### Run avec `fail-fast: false` (config par défaut du TP)

1. **`test (18)` est-il annulé quand `test (20)` échoue ?**
   Non. Avec `fail-fast: false`, `test (18)` continue son exécution jusqu'à la fin et passe au vert. La matrix laisse chaque variante terminer indépendamment.

2. **Le job `report` démarre-t-il malgré l'échec de `test (20)` ?**
   Oui. Le job `report` est configuré avec `if: always()`, donc il s'exécute toujours, peu importe le résultat des jobs en amont (`needs: [lint, test]`). Cela permet de produire le résumé même en cas d'échec partiel.

3. **Que contient le Step Summary dans le rapport ?**
   - Le tableau Markdown listant la couverture pour chaque variante de Node (les artefacts sont uploadés avec `if: always()`, donc même le run Node 20 qui a échoué fournit son `coverage-summary.json`).
   - Une ligne finale `❌ CI échoué` parce que la dernière étape `Résultat global CI` détecte que `needs.test.result != 'success'` et fait `exit 1`.

4. **Quel est l'exit code final du workflow ?**
   Le workflow finit en **échec** (rouge). La cause : `report` fait `exit 1` à la fin parce que `test` n'est pas `success`, ce qui propage l'échec au niveau du workflow global. Le badge CI passe au rouge.

### Run avec `fail-fast: true`

- Dès que `test (20)` échoue, **`test (18)` est annulé** (status `Cancelled`) même s'il était en train de passer.
- On perd l'artefact de couverture Node 18 (il n'est pas généré).
- Le job `report` démarre quand même (`if: always()`) mais le tableau du Step Summary n'aura que l'entrée Node 20.
- **Pourquoi `fail-fast: false` est préférable en matrix CI** : on veut TOUS les rapports pour diagnostiquer une régression de version. Avec `fail-fast: true`, on perd de l'information.

## Expérience 2 — `concurrency` (3 commits vides successifs)

- Sur 3 pushes en < 30s, GitHub Actions garde **uniquement le dernier run** et annule les 2 précédents (status `Cancelled`).
- C'est le comportement de `concurrency.cancel-in-progress: true` couplé à `group: ${{ github.workflow }}-${{ github.ref }}`.
- Intérêt : ne pas gaspiller de minutes de runner sur des commits déjà obsolètes (par exemple quand on push 5 fois d'affilée pour fixer une typo).

## Expérience 3 — Comparaison des rapports Node 18 vs Node 20

- Les rapports de couverture (Statements, Branches, Functions, Lines) sont **identiques** entre Node 18 et Node 20 pour `src/calculator.js` (100% / 100% / 100% / 100%).
- C'est attendu : le code ne dépend d'aucune API spécifique à une version de Node, donc la couverture est strictement la même.
- Si on observait une divergence, cela signalerait qu'une API Node.js change de comportement entre les deux versions (ou qu'un test dépend de `process.version`, etc.) — un signal utile pour bloquer une mise à jour de version.

## Risques d'un filtre `paths:` trop restrictif (Challenge 1)

- Si on exclut des chemins critiques par erreur (ex: oublier `.eslintrc.json` ou un fichier de config Jest), une modification peut casser le pipeline sans qu'aucun run ne se déclenche pour le signaler — fausse impression de "tout est vert" alors que le code de prod est cassé.
- Bonne pratique : préférer `paths-ignore` pour les chemins clairement non-impactants (docs, README, images), et garder le déclenchement par défaut pour le reste.
