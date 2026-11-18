# Gestion d'association de protection animale — version marque blanche

## Installation (nouveau client)
1. **Supabase** : créer un projet, puis exécuter dans l'éditeur SQL, dans l'ordre alphabétique, tous les fichiers `NNN_*.sql`
   (de `001` à `074`, puis `090_licence_triggers.sql` en dernier). L'erreur sur 3 vues à la fin de `001` est normale : `029` les recrée.
2. **Offre** : `select definir_licence('essentiel');` (ou `'standard'`, `'complete'`) dans l'éditeur SQL.
3. **Configuration** : ouvrir `association-config.js` et renseigner nom, adresse, RNA/SIREN, représentant, URL et clé anonyme Supabase.
4. **Logo** : remplacer `logo.png` par celui de l'association.
5. **Hébergement** : publier le dossier (GitHub Pages). Renommer le dossier `github/` en `.github/` si le workflow keepalive est utilisé.
6. **Mail / PDF** : déployer les fonctions Edge (`index.ts` pour le PDF, fonction `envoyer-mail-formulaire`) avec la clé Brevo en secret ; authentifier le domaine d'envoi (SPF/DKIM).

## Offres
| Offre | Contenu |
|---|---|
| Essentiel | Animaux, adoption, réservation, certificat, adhésion, don, contact, pré-adoption |
| Standard | + reçus fiscaux, familles d'accueil, dépôt/abandon, attestations, matériel, ICAD, rapports, visite, restitution, décès/sortie |
| Complète | + comptabilité, suivi médical, notes de frais, parrainage/boutique |

Les modules hors offre sont bloqués côté pages (popup) **et** côté base (déclencheurs `trg_licence`).
Le catalogue des modules est dans `071_licence.sql` (table `licence_modules`) et `garde-offre.js` (page → module).


## Installation

Voir le document « Mode opératoire d'installation » : SQL via `installation/SQL_1/2/3`, fonctions `generer-pdf-formulaire` et `envoyer-mail-formulaire` (secrets Brevo/Cloudflare), puis `association-config.js`. Les fichiers (PDF, photos, factures, ICAD) sont stockés dans Supabase Storage (dossier PRIVÉ « documents », lecture réservée aux comptes connectés, page « Archives »; créé par `074_stockage_fichiers.sql`) : plus besoin de Google Drive ni d'Apps Script.
