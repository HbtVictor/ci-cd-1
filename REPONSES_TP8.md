# Réponses — TP S11/S12 : Sécurité DevSecOps & Monitoring

## EX.1 — Questions de cours

### Partie A — Concepts

**Q1 — npm audit vs Trivy**

Les deux outils détectent des vulnérabilités, mais ils ciblent des **couches différentes** de
l'application :

- **`npm audit`** analyse l'arbre de **dépendances JavaScript** (le contenu de
  `package-lock.json`). Il compare chaque paquet npm installé à la base d'avis de sécurité
  npm (GitHub Advisory Database) et signale les CVE connues. Il ne sait rien du système, ni
  du conteneur, ni du code applicatif — uniquement des libs npm.

- **Trivy** est un scanner de **vulnérabilités d'image conteneur**. Il analyse la couche OS
  (paquets `apk`/`apt` de l'image de base : `node:18-alpine`, `nginx`, etc.), les paquets de
  langages détectés (dont npm/yarn/pnpm), et peut aussi détecter des secrets hardcodés dans
  les fichiers de l'image. Il regarde l'image **finale** produite par le build Docker.

**Ordre dans le pipeline** : `npm audit` **avant** Trivy.

Raisons :
1. `npm audit` est instantané (~3s) — il échoue vite si une dépendance npm a une CVE
   critique connue. Pas la peine de builder une image Docker pour le découvrir.
2. Trivy nécessite que l'image Docker soit déjà buildée. C'est plus lent (~30s-2min selon
   le scan db). On ne veut le lancer que si npm audit + lint + test passent.
3. Si on inversait l'ordre, on gaspillerait du temps CI à scanner une image qu'on aurait
   pu détecter cassée 30s plus tôt avec `npm audit`.

Architecture type : `lint + npm audit` (parallèle) → `test` → `build docker` → `Trivy`.

**Q2 — Principe du moindre privilège pour les secrets dans GitHub Actions**

Le principe du moindre privilège (PoLP) consiste à donner à chaque entité (utilisateur,
service, job, secret) **uniquement** les permissions strictement nécessaires à son fonctionnement.
Pas plus. Appliqué aux secrets GitHub Actions :

1. **Scoper les secrets par environnement plutôt qu'au niveau du repo.** Un secret
   `RENDER_DEPLOY_HOOK` n'a pas besoin d'être visible par tous les jobs ; il ne doit
   être disponible que dans le job `deploy-production` (et avoir une valeur distincte de
   l'environnement `staging`). Concrètement : utiliser **GitHub Environment secrets**
   (Settings → Environments → staging/production → Secrets) au lieu de Repository secrets.
   Un job qui ne déclare pas `environment: production` n'aura jamais accès au secret prod.

2. **Restreindre les `permissions:` GITHUB_TOKEN du workflow.** Par défaut, le
   `GITHUB_TOKEN` a des permissions étendues (lecture/écriture sur contents, packages,
   issues, etc.). Il faut **déclarer explicitement** dans chaque job :
   ```yaml
   permissions:
     contents: read       # juste lire le code, pas modifier
     packages: write      # uniquement pour le job docker qui push GHCR
   ```
   Le job `lint` n'a besoin que de `contents: read`, pas de `packages: write`. Si un
   attaquant compromet une action tierce dans ce job, il ne peut pas pousser d'image
   malveillante sur GHCR.

3. **Bonus : PAT à scopes restreints.** Quand on génère un Personal Access Token (classic),
   ne cocher que les scopes réellement utilisés (`write:packages` pour push GHCR, pas
   `admin:org` "au cas où"). Les fine-grained PAT GitHub vont encore plus loin et permettent
   de restreindre à un repo précis.

**Q3 — Les 4 métriques DORA**

DORA (DevOps Research and Assessment, étude Google Cloud) a identifié 4 métriques qui
distinguent les équipes performantes :

| Métrique                       | Définition                                                              | Niveau Élite                          |
| ------------------------------ | ----------------------------------------------------------------------- | ------------------------------------- |
| **Deployment Frequency (DF)**  | Fréquence des déploiements en production                                | Plusieurs fois par jour (on-demand)   |
| **Lead Time for Changes (LT)** | Temps entre un commit et son arrivée en production                      | Moins de 1 heure                      |
| **Change Failure Rate (CFR)**  | Pourcentage de déploiements qui causent une dégradation ou un rollback  | 0-15 %                                |
| **Mean Time to Restore (MTTR)**| Temps moyen pour rétablir le service après un incident                  | Moins de 1 heure                      |

**Comment notre pipeline CI/CD contribue à chaque métrique** :

- **DF** : le pipeline automatisé permet de déployer à chaque merge sur `main`. Plus on déploie
  fréquemment, plus chaque déploiement est petit (moins risqué). Le job `deploy-staging`
  automatique + `deploy-production` avec approval enlève la friction humaine. Sans pipeline,
  on regrouperait 50 commits dans une release manuelle hebdomadaire = DF faible.

- **LT** : la chaîne `commit → push → lint+test+docker → deploy staging → approval → deploy
  prod` prend ~10 minutes côté technique. Le temps humain (review PR, approval) peut être
  réduit avec des règles claires. Sans CI/CD, le lead time inclut le temps de tester
  manuellement à chaque étape → plusieurs heures à jours.

- **CFR** : les tests automatiques (lint Node 18 + Node 20, jest avec coverage threshold 80%,
  health check post-deploy) attrapent les régressions avant la prod. Trivy bloque les images
  vulnérables. Le résultat : moins de déploiements cassés. Sans CI/CD, le CFR explose parce
  que chaque déploiement transporte des bugs non détectés.

- **MTTR** : le pipeline rend le rollback rapide. `git revert + git push` redéclenche
  automatiquement le pipeline → la version précédente est redéployée en quelques minutes. Les
  images Docker taguées `sha-XXX` et `vX.Y.Z` permettent un rollback déterministe. Sans CI/CD,
  le rollback manuel prend des heures (rebuild, retest, redéploiement, manque souvent un
  artefact).

### Partie B — Vrai / Faux

1. **FAUX.** `npm audit --audit-level=high` fait échouer dès qu'une vulnérabilité **HIGH ou
   CRITICAL** est trouvée. Le paramètre est un **seuil minimum** : tout ce qui est au-dessus
   (ou égal) au niveau spécifié fait échouer. Si on voulait échouer **uniquement** sur
   CRITICAL, il faudrait `--audit-level=critical`. Niveaux disponibles : `info`, `low`,
   `moderate`, `high`, `critical`.

2. **VRAI.** Trivy a un mode `secret` (activé par défaut depuis v0.27) qui scanne les fichiers
   contenus dans l'image à la recherche de patterns connus : AWS access keys, GitHub tokens,
   private keys (PEM), mots de passe en clair dans des fichiers de config, etc. Si on copie
   accidentellement un `.env` avec un token dans le build context Docker, Trivy le signale.
   On peut désactiver via `--scanners vuln` (vuln uniquement) ou l'ignorer via
   `.trivyignore`.

3. **VRAI.** `if: failure()` au niveau d'un step évalue si **au moins un step précédent dans
   le même job** (ou un job qu'on a `needs:`) a échoué. Si tous les précédents passent, le
   step `if: failure()` est skippé. Attention : par défaut, un step échoué arrête le job —
   pour que les steps suivants tournent quand même, il faut `continue-on-error: true` sur le
   step en échec, ou `if: failure()` / `if: always()` sur le step suivant.

4. **VRAI.** Dependabot crée des Pull Requests automatiques quand il détecte une mise à jour
   (sécurité ou versions). Par défaut il **ne merge JAMAIS** ces PR : un reviewer humain (ou
   un workflow GitHub Actions configuré explicitement) doit les approuver et merger. On peut
   activer **auto-merge** sur les patchs sécu si on accepte le risque — mais c'est opt-in,
   pas le défaut.

5. **FAUX.** `git rm sur le fichier concerné` retire le fichier du **prochain commit**, mais
   l'ancien commit qui contient le secret reste dans l'historique git. Quiconque clone le
   repo peut faire `git log -p` et retrouver le secret. La seule solution **technique**
   propre est `git filter-repo` ou la BFG Repo-Cleaner (réécriture complète de l'historique).
   La seule solution **fiable** est de **considérer le secret compromis** : le révoquer
   immédiatement, en générer un nouveau, et le stocker proprement (GitHub Secrets, vault).
   Même après filter-repo, GitHub peut conserver des caches via les forks et les API.

---

## EX.2 — npm audit + Trivy dans le pipeline

### 2.1 — npm audit

**Q4 — Vulnérabilités trouvées en local**

```
$ npm audit
found 0 vulnerabilities

$ npm audit --json | jq '.metadata.vulnerabilities'
{ "info": 0, "low": 0, "moderate": 0, "high": 0, "critical": 0, "total": 0 }
```

**Résultat : 0 vulnérabilité, tous niveaux confondus.**

Le projet n'a que 3 dépendances directes :

| Type            | Paquet   | Rôle              |
| --------------- | -------- | ----------------- |
| dependencies    | express  | Serveur HTTP      |
| devDependencies | jest     | Tests unitaires   |
| devDependencies | eslint   | Linter            |

Toutes sont à jour et sans CVE connue à la date du scan. Le silence de `npm audit` ici est
positif — c'est cohérent avec un projet pédagogique récent qui consomme uniquement des libs
matures et bien maintenues. Sur un projet réel avec 200+ deps transitives, on trouverait
quasi-systématiquement quelques vulnérabilités low ou moderate.

**Q5 — Intégration de `npm audit` dans le pipeline (job lint)**

J'ai ajouté un step `npm audit` au job `lint` du `ci.yml` :

```yaml
- name: npm audit (HIGH/CRITICAL bloquant)
  run: npm audit --audit-level=high --omit=dev
```

**Justification des choix d'options** :

- **`--audit-level=high`** : le pipeline échoue uniquement sur HIGH ou CRITICAL. C'est le bon
  équilibre :
  - Les `low` et `moderate` sont fréquentes (transitives, souvent sans exploitation pratique)
    et bloquer dessus crée beaucoup de bruit → on ignore.
  - Les `high` et `critical` sont sérieuses (vraies CVE exploitables) → blocage automatique
    obligatoire.
  - Si on veut être plus strict, on peut passer à `--audit-level=moderate`. Si on veut être
    plus laxiste, `--audit-level=critical`. Niveau `high` est le compromis le plus courant
    en pratique entreprise.

- **`--omit=dev`** : exclut les `devDependencies` du scan. Les libs comme `jest` ou `eslint`
  ne sont **jamais** présentes dans l'image Docker de production (le multi-stage `npm ci
  --omit=dev` les supprime). Une CVE dans Jest n'a aucun impact runtime. Bloquer dessus
  serait du bruit.

- **Pourquoi dans le job `lint` et pas un job dédié ?** `npm audit` est instantané (~3s) et
  parallélisable avec ESLint. Le mettre dans `lint` évite un job supplémentaire qui ajouterait
  ~30s de queue/setup pour si peu de travail. Sur un projet avec plus de logique
  (audit + sca + sast), on créerait un job `security` dédié.

Test local préalable :

```bash
npm audit --audit-level=high --omit=dev
# → found 0 vulnerabilities (exit code 0)
```

Une fois poussé, le job `lint` du pipeline GitHub Actions exécute exactement la même
commande. S'il en trouve une, le pipeline passe au rouge dès l'étape lint, sans builder
l'image Docker ni déployer.

### 2.2 — Trivy

_À compléter après mise en place du job security._

---

> _Sections EX.3 à EX.5 — à compléter au fil des étapes._
