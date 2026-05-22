# Réponses — TP S7/S8 : Environnements & Déploiement Cloud

## EX.1 — Questions de cours

### Partie A — Définitions et distinctions

**Q1 — Différence staging vs production**

Le **staging** est un environnement miroir de la production utilisé pour valider une version finale avant qu'elle ne soit exposée aux vrais utilisateurs. Il doit être **iso-configuré** à la prod (même version Node, même variables d'env, même image Docker) pour révéler les bugs qui n'apparaissent qu'en conditions "réelles". La **production** est l'environnement exposé aux utilisateurs finaux, avec leurs vraies données et leur trafic réel.

*Exemple concret* : en staging, on utilise une base de données de test avec des comptes fictifs et une clé Stripe en mode "test" (paiements simulés). En production, on utilise la base de données live avec les vrais utilisateurs et la clé Stripe en mode "live" (paiements réels qui débitent les cartes). Le **code est identique** ; seules les variables d'environnement diffèrent.

**Q2 — Protection rule sur un GitHub Environment**

Une **protection rule** est une règle bloquante attachée à un environnement GitHub qui conditionne le démarrage d'un job qui cible cet environnement. Les protections principales sont : *required reviewers* (approbation manuelle d'une personne), *wait timer* (délai d'attente), *deployment branches* (limiter aux branches autorisées), et *required environment secrets*.

*Problème résolu* : éviter qu'un push erroné ou un script CI mal écrit ne déploie automatiquement en production sans qu'un humain valide. Cela introduit un **point de contrôle humain** (gate) entre le pipeline et le déploiement réel — par exemple un déploiement vendredi 18h qui doit attendre lundi matin la validation du lead dev.

**Q3 — Cycle complet d'un déploiement avec approbation manuelle**

1. Le développeur `git push` vers `main`.
2. GitHub Actions déclenche le workflow.
3. Les jobs `lint`, `test`, `build`, `docker` s'exécutent.
4. Si tout passe au vert, le job `deploy-staging` démarre automatiquement et déploie sur l'env staging.
5. Un health-check valide que staging répond.
6. Le job `deploy-production`, qui cible l'environnement `production` avec une *required reviewers* protection, **se met en pause** avec le statut `Waiting`.
7. GitHub envoie une notification (email/Slack) aux reviewers configurés.
8. Un reviewer ouvre l'onglet Actions, voit le déploiement en attente, lit les changements, puis clique **Approve and deploy** (ou **Reject**).
9. Si approuvé, le job `deploy-production` démarre, déploie en prod, lance le health-check, et le pipeline termine au vert.
10. Si refusé, le job reste à l'état `Rejected` ; le pipeline est marqué rouge.

### Partie B — Vrai / Faux justifiés

1. **FAUX** — Le staging doit au contraire être configuré **identiquement** à la production (même image Docker, même versions de dépendances, mêmes variables d'env aux secrets près) pour révéler les bugs liés à l'environnement. Une divergence volontaire = bugs en prod non détectés en staging.

2. **VRAI** — En Blue/Green, les deux versions (Blue actuelle, Green nouvelle) tournent en parallèle sur des infrastructures séparées. Le rollback consiste à **rebasculer le load balancer** vers Blue : c'est instantané (quelques secondes) car Blue est déjà running.

3. **FAUX** — Un Canary Release fait l'inverse : il déploie la nouvelle version à un **petit pourcentage du trafic** (1%, 5%, 10%) pour observer le comportement et détecter des régressions sur un échantillon, avant d'augmenter progressivement.

4. **VRAI** — Quand un job cible un environnement (`environment: production`), les secrets définis au niveau de cet environnement **écrasent** les secrets de même nom définis au niveau du repo. Cela permet d'avoir un `DATABASE_URL` différent par environnement.

5. **FAUX** — Le mot-clé `environment:` fait **bien plus** : il rattache le job à un environnement GitHub avec ses protection rules (approbation manuelle, wait timer, branches autorisées), ses secrets dédiés, et affiche le déploiement dans l'onglet *Deployments* du repo.

---

## EX.4 — Réflexion & Trade-offs

**Q16 — Réponse au senior qui veut supprimer staging**

Les tests unitaires valident la logique métier **isolée**, mais ne détectent pas :
- les régressions liées à l'environnement réel (versions de libs en prod, OS du conteneur, latence réseau, comportement du load balancer) ;
- les bugs d'intégration (services tiers, base de données, file d'attente) ;
- les régressions visuelles ou UX qu'aucun test ne couvre exhaustivement ;
- les problèmes de configuration (variables d'env, secrets, permissions) qui n'existent qu'en environnement déployé.

Sur un produit critique, supprimer staging revient à utiliser **les utilisateurs comme testeurs** : un bug détecté en prod coûte 100× plus cher qu'un bug détecté en staging (revenue lost, support, hot-fix). Le compromis : on peut accepter de sauter staging sur un projet interne low-stakes, ou sur des changements purement documentaires (Path filters comme dans le TP4 !). Pour un produit utilisateur, c'est non.

**Q17 — Stratégie pour une feature paiement critique**

Je choisis le **Canary Release**. Justification :
- Le risque financier est immédiat : un bug sur le paiement = transactions perdues, débits dupliqués, ou pire, brèche de sécurité PCI-DSS.
- Avec **Blue/Green**, on bascule 100% du trafic d'un coup → si le bug n'est pas détecté par les tests staging, **tous** les paiements sont impactés simultanément.
- Avec **Rolling Update**, on a une période intermédiaire où certains serveurs tournent la nouvelle version et d'autres l'ancienne → risque d'incohérences (un paiement débite, un autre non).
- Avec **Canary**, je déploie sur 1% du trafic pendant 30 min, j'observe les métriques (taux d'erreur, latence, taux de succès des paiements) ; si OK je passe à 10%, puis 50%, puis 100%. Au moindre signal négatif (alerte sur le taux d'erreur), je rollback en route vers les 99% restés sur l'ancienne version → impact financier limité à 1% du trafic pendant 30 min.

**Q18 — Procédure d'urgence pour rollback après approval erroné**

1. **T+0** : Constat du 500 — je vérifie d'abord que ce n'est pas un faux positif (monitoring/dashboard).
2. **T+30s** : Communication immédiate — message dans le canal Slack `#incidents` : "Incident en cours, app down, j'investigue."
3. **T+1min** : Rollback **immédiat sans diagnostic approfondi**. Le diagnostic se fait après. Sur Render : redéployer le commit précédent via l'UI ou via `git revert HEAD && git push`. Sur Docker/Kubernetes : `docker tag` ou `kubectl rollout undo`.
4. **T+2min** : Vérifier que le rollback a remis l'app en état (health-check, requête manuelle).
5. **T+5min** : Communication aux utilisateurs si l'impact est externe (status page).
6. **Post-incident** : analyse à froid — pourquoi le bug n'a pas été détecté en staging ? Le junior a-t-il eu un signal d'alerte avant d'approuver ? Mettre en place une protection rule plus stricte (ex: 2 reviewers, wait timer 5 min, ou désactiver l'approbation directe pour ce junior tant qu'il n'a pas fini son onboarding).
7. **Sans blâme** : le junior a juste cliqué sur un bouton. Le vrai problème est systémique (process de review, absence de wait timer, etc.).

**Q19 — Stratégie d'organisation des secrets pour 3 envs × 2 services**

Je crée **3 GitHub Environments** (`dev`, `staging`, `production`), chacun avec ses propres secrets :

| Env | Secrets |
|---|---|
| `dev` | `API_KEY`, `DATABASE_URL` (pointent vers des instances dev) |
| `staging` | `API_KEY`, `DATABASE_URL` (instances staging) |
| `production` | `API_KEY`, `DATABASE_URL` (instances prod, plus restrictives) |

Les **mêmes noms de secrets** dans chaque environnement → le code applicatif lit `process.env.DATABASE_URL` sans savoir dans quel env il tourne. C'est le `environment:` du job qui injecte la bonne valeur.

Bonus : pour les secrets partagés à tous les envs (ex : `SENTRY_DSN`, `SLACK_WEBHOOK_URL` d'alerting interne), je les mets au niveau **repo** (pas environnement). GitHub écrase au niveau env si nécessaire (priorité env > repo).

Pour les **protection rules** :
- `dev` : aucune restriction (auto-deploy).
- `staging` : auto-deploy, mais branches limitées à `main` et `release/**`.
- `production` : required reviewers (2 personnes), wait timer 5 min, branch `main` uniquement.

---

## EX.5 — Recherche autonome

### Sujet A — GitHub Deployments API

**Q20** — La **GitHub Deployments API** est une API REST qui permet de créer, lister et mettre à jour des objets `Deployment` rattachés à un repo. Chaque déploiement a un `environment` (staging, production, etc.), un `ref` (commit SHA ou branche), un `state` (in_progress, success, failure, error) et un `description`. Les objets Deployment apparaissent dans l'onglet **Environments** du repo (sidebar de la home page) et dans la timeline des Pull Requests, traçant l'historique complet : "ce commit a été déployé en prod tel jour à telle heure". Cas d'usage CI/CD : un workflow personnalisé qui ne passe **pas** par `environment:` dans Actions peut quand même créer des deployments via l'API REST (`POST /repos/{owner}/{repo}/deployments`) pour bénéficier du tracking visuel. Utile pour les pipelines qui déploient depuis d'autres CI (Jenkins, CircleCI) tout en gardant la visibilité GitHub.

### Sujet B — Variables vs Secrets

**Q21** — Différence technique :
- **Variables** (`vars.NAME`) sont stockées **en clair** et **lisibles** depuis l'interface GitHub après création. Elles s'affichent dans les logs sans masquage.
- **Secrets** (`secrets.NAME`) sont chiffrés au repos et **inaccessibles** après création (impossible de les relire, seulement les remplacer). GitHub masque automatiquement leur valeur dans les logs (remplacée par `***`).

Quand utiliser variables :
- Configuration non-sensible : nom de région cloud, URL d'API publique, version d'un outil, feature flag.
- Exemples : `vars.AWS_REGION = "eu-west-3"`, `vars.NODE_VERSION = "20"`.

Quand utiliser secrets :
- Tout ce qui ne doit jamais apparaître en logs : API tokens, mots de passe, clés privées, webhooks.
- Exemples : `secrets.GITHUB_TOKEN`, `secrets.RENDER_DEPLOY_HOOK`, `secrets.DATABASE_PASSWORD`, `secrets.STRIPE_SECRET_KEY`.

### Sujet C — Render Preview Environments

**Q22** — Un **Preview Environment** sur Render est une instance temporaire automatiquement créée pour chaque Pull Request GitHub ouverte sur le repo connecté. À l'ouverture d'une PR, Render builde et déploie automatiquement une copie complète du service à une URL unique (`my-app-pr-42.onrender.com`). À la fermeture/merge de la PR, l'environnement est détruit. C'est utile pour la **revue de code** : le reviewer peut tester visuellement les changements UI/UX sans cloner et lancer localement. Cela ne **remplace pas** le staging : un preview est lié à une PR (durée de vie courte, instable, base de données souvent partagée ou éphémère), alors que staging est l'environnement final avant production où l'équipe valide une version intégrée prête à être déployée. Les preview servent à valider **une PR isolée** ; staging valide **un release candidate complet**.

---

## EX.2 — GitHub Environments

### 2.1 — Mise en place

**Q4 — Paramètres choisis pour l'environnement `staging`**

- **Aucune protection rule activée** (ni *required reviewers*, ni *wait timer*) → le déploiement en staging doit être **automatique** dès qu'un push sur `main` passe les tests, pour permettre une boucle de feedback rapide entre les commits et la validation en condition réelle.
- **Deployment branches** restreintes à `main` → seul ce qui est validé via PR/CI peut atteindre staging, pas une branche feature locale.
- Pas de secret d'environnement spécifique à ce stade — sera ajouté à l'étape 3 (`RENDER_STAGING_HOOK`).

**Q5 — Reviewer désigné pour `production`**

Reviewer = **moi-même (`HbtVictor`)** parce que c'est un projet perso et qu'il n'y a pas d'équipe.

Dans un contexte réel d'équipe, le reviewer ne serait jamais le développeur qui a ouvert la PR (règle des *4-eyes*) : ce serait le **lead dev**, ou un binôme (PR review), ou idéalement deux reviewers obligatoires sur la production. L'idée fondamentale : aucun développeur ne déploie son propre code en prod sans qu'un autre humain valide les changements en aval des tests automatisés. Ça force aussi un partage de connaissance (le reviewer apprend ce qui change) et limite le risque d'erreur ou de malveillance.

**Q6 — Scénario d'utilisation du wait timer**

Un wait timer de 10 minutes serait utile **le vendredi soir** ou en **fin de journée** : il introduit un délai obligatoire entre la validation du reviewer et le déploiement effectif, laissant le temps à un autre membre de l'équipe de dire "non, attendons lundi" si une dérive est détectée. Autre scénario : déploiement coordonné avec une opération marketing — l'équipe valide tout à 9h55, le wait timer empêche le déploiement avant 10h05 (timing voulu). C'est aussi un *safety net* contre les approvals impulsifs.

### 2.2 — Intégration dans le pipeline

**Q7 — Structure du job `deploy-staging`**

```yaml
deploy-staging:
  name: 🚀 Deploy Staging
  runs-on: ubuntu-latest
  needs: [ docker ]                       # attend que l'image Docker soit buildée + pushée sur GHCR
  if: github.event_name == 'push' && github.ref == 'refs/heads/main'
  environment:
    name: staging
    url: ${{ env.RENDER_APP_URL }}         # affiche l'URL cliquable sur la page du job

  steps:
    - run: curl -X POST "${{ secrets.RENDER_DEPLOY_HOOK }}"    # déclenche le redéploiement Render
    - run: ...poll /health pendant 5 min, échec si pas 200...
    - run: ...vérifie status:ok ET endpoint /calc...
```

- `needs: [ docker ]` — staging ne démarre que si lint, test ET docker sont verts (`docker` lui-même a `needs: [lint, test]`).
- `environment: name: staging` — rattache le job à l'environnement GitHub `staging`, ce qui (1) injecte le secret `RENDER_DEPLOY_HOOK` du bon environnement (2) affiche le déploiement dans l'onglet *Environments* du repo.
- `run:` — appel POST sur le Deploy Hook Render (curl). Render relit le repo, rebuild le Dockerfile, redémarre le conteneur. Le script poll ensuite `/health` jusqu'à recevoir un 200 ou timeout (5 min max).

**Q8 — Comportement observé sur Actions**

À chaque push sur `main` :
1. `lint`, `test (18)`, `test (20)` démarrent en parallèle.
2. Quand tout est vert, `docker` démarre (build + scan Trivy + push GHCR).
3. Quand docker est vert, `deploy-staging` démarre automatiquement (environnement staging = aucune protection rule).
4. Quand staging est vert, `deploy-production` apparaît dans la UI Actions avec le statut **`Waiting`**. GitHub envoie un email/notification au reviewer configuré (moi).
5. Sur la page du run, un bouton **`Review deployments`** s'affiche en haut. Clic dessus → modal listant l'environnement `production` → checkbox + bouton **`Approve and deploy`** ou **`Reject`**.
6. Si j'approuve : `deploy-production` démarre, déclenche le Deploy Hook, attend `/health`, valide, finit vert.
7. Le job `notify` affiche le tableau récapitulatif final dans le Step Summary.

L'approbation est demandée **précisément** au moment où `deploy-staging` finit avec succès et où `deploy-production` essaie de démarrer (juste après ses `needs:` satisfaits).

**Q9 — Comportement si refus du reviewer**

J'ai testé en cliquant **Reject** :
- Le job `deploy-production` reste à l'état `Rejected` (croix rouge spécifique, différente de `Failed`).
- Le pipeline entier est marqué en échec dans la liste des runs.
- Le job n'est **pas perdu** : sur la page du run, il y a un bouton **`Re-run jobs`** → on peut choisir de re-runner uniquement les jobs qui ont échoué, ce qui redéclenche l'approbation production. Le reviewer peut alors `Approve` la deuxième fois.
- Variante : `git push` un nouveau commit relance tout le pipeline depuis le début (un nouveau déploiement à valider).

Conclusion : le refus est **bloquant mais réversible**, ce qui correspond bien au cas d'usage "stop, on ne déploie pas tel quel, mais on n'a pas perdu le travail CI".

---

## EX.3 — Déploiement sur Render

### 3.1 — Configuration Render

**Q10 — Les 4 informations configurées dans Render**

| Information | Valeur | Pourquoi Render en a besoin |
|---|---|---|
| **Repository** | `HbtVictor/ci-cd-1` | Pour cloner le code source à chaque déploiement. Render observe ce repo (ou se contente du Deploy Hook si auto-deploy est désactivé). |
| **Branch** | `main` | Indique quelle branche déployer. Sans ça, Render ne sait pas si tu veux la prod (`main`) ou une preview (`develop`, `feature/*`). |
| **Language / Runtime** | `Docker` | Indique à Render comment builder. En `Docker`, il utilise notre `Dockerfile` ; en `Node`, il aurait essayé de deviner les commandes `npm install && npm start`, ce qui aurait ignoré nos optimisations multi-stage et les tests dans le builder stage. |
| **Health Check Path** | `/health` | Route que Render appelle pour valider que le conteneur démarre correctement. Si `/health` ne répond pas 200 dans le délai, Render considère le déploiement échoué et garde la version précédente en route. |

(Note : l'instance type `Free` et la region `Frankfurt` sont aussi configurées, mais ce sont des choix de pricing/performance plus que des informations nécessaires au build.)

**Q11 — URL publique et endpoint `/health`**

- **URL publique** : `https://ci-cd-1-sjcw.onrender.com`
- **Validation `/health`** : `curl https://ci-cd-1-sjcw.onrender.com/health` → `{"status":"ok","version":"1.0.0"}` (HTTP 200).
- **Ce qui a été configuré pour que `/health` fonctionne** :
  1. Le code Express dans `src/server.js` expose la route : `app.get('/health', (req, res) => res.json({ status: 'ok', version: '1.0.0' }))`.
  2. Le Dockerfile expose `EXPOSE 3000` et lance `node src/server.js` en `CMD`.
  3. L'app écoute sur `process.env.PORT || 3000` — important parce que Render impose son propre port via la variable `PORT` (généralement 10000). Sans cette ligne, l'app écouterait sur 3000 alors que Render attend sur le port qu'il a injecté.
  4. Render est configuré avec **Health Check Path** = `/health` dans Settings.

**Q12 — Deux solutions pour éviter le cold start gratuit**

1. **Cron de "warm-up"** : configurer un cron externe (ex: `cron-job.org`, ou un GitHub Actions cron `schedule:`) qui ping `/health` toutes les 10 minutes. Le service ne tombe jamais en veille car il a une requête entrante régulière. Limite : ça reste du bricolage, et certains hébergeurs détectent et bannissent ce pattern.
2. **Passer sur un plan payant** (Render Starter ~7$/mois, ou Fly.io free tier "always-on"). Le coût est négligeable en prod et c'est la seule vraie solution pour un produit utilisateur — un cold start de 30s en plein parcours de paiement = utilisateur perdu.

Autres options : utiliser un **CDN avec edge function** (Cloudflare Workers) qui ne sleep jamais, ou héberger soi-même sur un VPS (Hetzner ~4€/mois) avec uptime garanti.

### 3.2 — Connecter GitHub Actions à Render

**Q13 — Approche choisie : Deploy Hook**

J'ai choisi le **Deploy Hook**, pas l'autoDeploy de Render. Raisons :
1. Avec autoDeploy, Render redéploierait à **chaque push**, même sur des commits qui n'ont pas passé les tests CI → on perd la garantie "rouge = pas déployé".
2. Le Deploy Hook permet de mettre le déploiement **après** les jobs `lint`, `test`, `docker` dans le pipeline (`needs:`) — donc on a la chaîne complète tests → build → déploiement.
3. Le Deploy Hook permet de séparer **staging** et **production** avec une approbation manuelle entre les deux (`environment:` GitHub avec required reviewers). Impossible à faire proprement avec autoDeploy.

Étapes de configuration suivies :
1. Render Service → Settings → section **Deploy Hook** → copier l'URL secrète (forme `https://api.render.com/deploy/srv-XXX?key=YYY`).
2. GitHub → Settings → Environments → `staging` → Environment secrets → ajouter `RENDER_DEPLOY_HOOK` avec l'URL.
3. Idem pour l'environnement `production` (option B : même URL dans les 2 envs car un seul service Render).
4. Désactiver `Auto-Deploy` dans Render (sinon double déploiement à chaque push).
5. Dans `ci.yml`, ajouter le job `deploy-staging` qui exécute `curl -X POST "${{ secrets.RENDER_DEPLOY_HOOK }}"`.

**Q14 — Health-check post-déploiement**

Implémentation en 3 steps dans le job `deploy-staging` (et idem dans `deploy-production`) :

```yaml
- name: Attendre la fin du déploiement Render
  run: |
    for i in $(seq 1 30); do
      sleep 10
      CODE=$(curl -s -o /dev/null -w "%{http_code}" "${{ env.RENDER_APP_URL }}/health" || echo "000")
      echo "Try $i/30 — /health → $CODE"
      if [ "$CODE" = "200" ]; then break; fi
    done

- name: Health check staging
  run: |
    RESP=$(curl -fsS "${{ env.RENDER_APP_URL }}/health")
    echo "$RESP" | grep -q '"status":"ok"' || exit 1

- name: Test endpoint /calc
  run: |
    RESP=$(curl -fsS "${{ env.RENDER_APP_URL }}/calc/add/5/3")
    echo "$RESP" | grep -q '"result":8' || exit 1
```

**Logique** :
1. **Polling** : on attend jusqu'à 5 min (30 tentatives × 10s) que `/health` réponde 200, car Render met du temps à redémarrer le conteneur après un Deploy Hook.
2. **Validation contenu** : on vérifie que le JSON contient bien `"status":"ok"` (pas juste un 200 d'une vieille page d'erreur).
3. **Test fonctionnel** : on appelle `/calc/add/5/3` pour s'assurer que pas seulement Express tourne, mais aussi que la logique métier est en place.
4. **Échec → pipeline rouge** : `curl -fsS` (--fail) ou `grep -q ... || exit 1` font échouer le job si quoi que ce soit cloche.

Conséquence : si le déploiement Render est OK mais que l'app a un bug qui fait crasher `/health`, le pipeline passe au rouge et le job suivant (`deploy-production`) ne démarre pas grâce à `needs: [deploy-staging]`.

**Q15 — Comparaison autoDeploy vs Deploy Hook**

| Critère | autoDeploy (Render watch) | Deploy Hook (GitHub Actions appelle) |
|---|---|---|
| Simplicité | ★★★★★ — case à cocher | ★★★ — secret + workflow + curl |
| Contrôle CI | ❌ Render déploie même si CI rouge | ✅ Pipeline contrôle (tests d'abord) |
| Latence | Quelques secondes après le push | Plus long (CI + déploiement) |
| Visibilité | Logs dans Render uniquement | Logs unifiés dans GitHub Actions |
| Conditions | Pas de logique conditionnelle | `if:`, `needs:`, `environment:` possibles |
| Rollback | Manuel via Render UI | Possible via revert + re-push |
| Secrets/multi-env | Limité | Excellent (environnements GitHub) |

**Conclusion** : autoDeploy convient à un projet perso (un seul env, pas de tests critiques). Deploy Hook est obligatoire dès qu'on veut un pipeline pro : tests bloquants, approbation manuelle pour prod, healthcheck post-deploy, multi-env. Pour ce TP, on choisit **Deploy Hook**.

---

## Notes — Setup réalisé

- [x] EX.2.1 — Environnement `staging` créé (aucune protection rule, branche `main`)
- [x] EX.2.1 — Environnement `production` créé (required reviewer = `HbtVictor`)
- [x] EX.3.1 — Compte Render créé via login GitHub
- [x] EX.3.1 — Web Service `ci-cd-1` créé (Docker, branche `main`, Frankfurt, plan Free, `/health` health check path, auto-deploy OFF)
- [x] EX.3.2 — Deploy Hook récupéré dans Render Settings
- [x] EX.3.2 — Secret `RENDER_DEPLOY_HOOK` créé dans l'environnement `staging`
- [x] EX.3.2 — Secret `RENDER_DEPLOY_HOOK` créé dans l'environnement `production` (option B : même valeur, un seul service Render)
- [x] EX.2.2 / EX.3.2 — `ci.yml` modifié : ajout des jobs `deploy-staging`, `deploy-production`, `notify` avec health-checks

## Architecture finale du pipeline (Challenge inclus)

```
push main
  │
  ├──▶ 🔍 lint
  ├──▶ 🧪 test (Node 18)
  ├──▶ 🧪 test (Node 20)
  │       │
  │       ▼ (lint + test verts)
  │     🐳 docker (build + Trivy + push GHCR)
  │       │
  │       ▼
  │     🚀 deploy-staging  ◀── environment: staging (auto)
  │         │  curl deploy hook → poll /health → vérif /calc
  │         ▼
  │     🏁 deploy-production  ◀── environment: production (required reviewer)
  │         │  ⏸️ APPROUVÉ par HbtVictor
  │         │  curl deploy hook → poll /health
  │         ▼
  │     📣 notify (Step Summary récapitulatif)
```

**Caractéristiques** :
- Tests bloquants : si lint OU test échoue, le docker ne build pas, le déploiement n'a pas lieu.
- Image Docker poussée sur GHCR **avant** le déploiement → on déploie une image traçable, pas juste un commit.
- Staging déployé automatiquement après build.
- Production bloquée jusqu'à approbation manuelle (`environment: production` + protection rule).
- Health-checks bloquants après chaque déploiement : si `/health` ne répond pas 200 ou ne contient pas `status:ok`, le job échoue et le pipeline passe rouge.
- Job `notify` consolide le statut de tout le pipeline dans le **Step Summary** (visible dans la UI Actions).
