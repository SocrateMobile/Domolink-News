# DomoLink-News pour Home Assistant 📰

[![hacs_badge](https://img.shields.io/badge/HACS-Custom-41BDF5.svg)](https://github.com/hacs/integration)
[![Hassfest](https://img.shields.io/badge/Hassfest-Passing-10b981.svg)](https://github.com/SocrateMobile/Domolink-News)
[![Release](https://img.shields.io/badge/Version-v1.0.0-38bdf8.svg)](https://github.com/SocrateMobile/Domolink-News/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**DomoLink-News** est une intégration Home Assistant moderne, rapide et élégante pour diffuser un flux d'actualités synthétique directement dans votre domotique via [NewsAPI.org](https://newsapi.org/).

Elle intègre un **panneau dédié dans la barre latérale gauche** de Home Assistant, une gestion fine de vos centres d'intérêt avec **poids de préférence unique (1 à 5 étoiles)**, et un algorithme de rafraîchissement adaptatif respectant scrupuleusement les quotas gratuits de l'API.

---

## ✨ Fonctionnalités Clés

* **🖼️ Panneau Latéral Dédié (Sidebar)** : Accessible en 1 clic dans le menu de gauche (`/domolink-news`), conçu en Web Component natif ultra-fluide avec mode sombre automatique.
* **⭐ Centres d'intérêt pondérés (1 à 5 étoiles)** : Configurez vos thématiques favorites (`Tech & IA`, `Économie`, `Général`, `Sciences`, `Santé`, `Sports`, `Culture`) et ajustez leur importance.
* **📑 Navigation par onglets & Recherche instantanée** : Consultez tous les flux réunis ou filtrez par thématique, avec barre de recherche en temps réel dans les titres et résumés.
* **⏱️ Polling Adaptatif Anti-Dépassement de Quota** :
  * **En journée (07h00 - 23h00)** : actualisation toutes les 30 minutes.
  * **La nuit (23h00 - 07h00)** : actualisation ralentie toutes les 120 minutes (2h).
  * **Total** : ~36 requêtes/jour (bien sous le plafond de 100 requêtes/jour du plan gratuit NewsAPI).
* **🔄 Actualisation Manuelle** : Bouton d'actualisation instantané dans le panneau et service Home Assistant `domolink_news.refresh`.
* **📊 Capteurs d'entités HA natifs** :
  * `sensor.domolink_news_fil_d_actualites` : titre du dernier article prioritaire en état principal, liste des 10 meilleurs articles en attributs.
  * Un capteur dédié par centre d'intérêt actif (ex: `sensor.domolink_news_tech_intelligence_artificielle`, `sensor.domolink_news_sciences_espace`, etc.).

---

## 🚀 Installation via HACS

1. Ouvrez **HACS** dans votre Home Assistant.
2. Cliquez sur les 3 points en haut à droite > **Dépôts personnalisés**.
3. Ajoutez l'URL de ce dépôt :
   ```text
   https://github.com/SocrateMobile/Domolink-News
   ```
   *Type : Intégration*.
4. Cliquez sur **Télécharger**, puis redémarrez Home Assistant.

---

## ⚙️ Configuration

1. Rendez-vous dans **Paramètres** > **Appareils et services** > **Ajouter une intégration**.
2. Recherchez **DomoLink-News**.
3. Renseignez :
   * Votre **Clé API NewsAPI** (obtenue gratuitement en 30 secondes sur [newsapi.org](https://newsapi.org/register)).
   * Votre **Pays** (ex: France `FR`) et votre **Langue** (`Français`).
   * Vos **Centres d'intérêt actifs** (sélection multiple).
   * Vos éventuels mots-clés de veille (optionnel).
4. À l'étape suivante, ajustez le curseur de **poids de préférence (1 à 5)** pour chaque centre d'intérêt.
5. Validez : le panneau **DomoLink News** apparaît instantanément dans la colonne de gauche de votre Home Assistant !

---

## 🎛️ Services Disponibles

* `domolink_news.refresh` : Force une synchronisation immédiate de l'ensemble des centres d'intérêt auprès de NewsAPI.

---

## 🔒 Confidentialité & Écosystème

* Vos clés et requêtes transitent directement et exclusivement entre votre serveur Home Assistant et l'API NewsAPI en HTTPS.
* Compatible 100% avec les automatisations Home Assistant (ex: diffusion du flash info matinal via synthèse vocale TTS).
