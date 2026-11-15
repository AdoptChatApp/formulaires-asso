// ============================================================
// GOOGLE APPS SCRIPT — STOCKAGE DES PDF, PHOTOS ET FACTURES SUR GOOGLE DRIVE
// ============================================================
// Projet Apps Script autonome, déployé en « Application Web ».
// Reçoit trois actions envoyées par les pages du site :
//   - 'pdf'              : PDF d'un formulaire signé
//   - 'photo'            : photo justificatif (pièce d'identité, domicile, animal…)
//   - 'facture_fichier'  : photo ou PDF d'une facture (Compta)
//   - 'icad_fichier'     : certificat ICAD ou de stérilisation d'un animal
// Répond toujours { status: 'ok', url: '…' } ou { status: 'error', message: '…' }.
//
// Mise en place : voir le mode opératoire (étape Google Drive).
// 1) Remplacer DOSSIER_RACINE_ID par l'identifiant du dossier Drive de l'association
//    (la partie qui suit /folders/ dans l'URL du dossier).
// 2) Déployer > Nouveau déploiement > Application Web :
//    exécuter en tant que « Moi », accès « Tout le monde ».
// 3) Copier l'URL (…/exec) dans association-config.js (appsScriptUrl).
// Après toute modification du code : Déployer > Gérer les déploiements > Modifier > Nouvelle version.
// ============================================================

var DOSSIER_RACINE_ID = 'COLLER_ICI_ID_DU_DOSSIER_DRIVE';

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    if (data.action === 'pdf') return enregistrerPdf(data);
    if (data.action === 'photo') return enregistrerPhoto(data);
    if (data.action === 'facture_fichier') return enregistrerFacture(data);
    if (data.action === 'icad_fichier') return enregistrerIcad(data);
    return reponse({ status: 'error', message: 'Action inconnue : ' + data.action });
  } catch (err) {
    return reponse({ status: 'error', message: String(err) });
  }
}

// Permet de vérifier dans un navigateur que le déploiement fonctionne.
function doGet() { return reponse({ status: 'ok', message: 'Stockage Drive opérationnel' }); }

function reponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function sousDossier(parent, nom) {
  var it = parent.getFoldersByName(nom);
  return it.hasNext() ? it.next() : parent.createFolder(nom);
}

function nettoyer(t) { return String(t || '').trim().replace(/[\/\\]/g, '-').replace(/\s+/g, '_'); }

function majusculeMots(t) {
  return String(t || '').trim().toLowerCase().replace(/(^|[\s\-'])(\p{L})/gu, function (m, sep, l) { return sep + l.toUpperCase(); });
}

// « AAAA-MM-JJ_Nom_Prenom_Animal » : l'ordre ISO garde les dossiers triés par date.
function nomDossierSoumission(data) {
  var date = data.dateDossier || Utilities.formatDate(new Date(), 'Europe/Paris', 'yyyy-MM-dd');
  var parts = [date, nettoyer(majusculeMots(data.nom || 'Inconnu'))];
  if (data.prenom) parts.push(nettoyer(majusculeMots(data.prenom)));
  if (data.animal) parts.push(nettoyer(majusculeMots(data.animal)));
  return parts.join('_');
}

function dossierSoumission(data) {
  var racine = DriveApp.getFolderById(DOSSIER_RACINE_ID);
  var parType = sousDossier(racine, nettoyer(data.onglet) || 'Divers');
  return sousDossier(parType, nomDossierSoumission(data));
}

function enregistrerPdf(data) {
  if (!data.pdfBase64 || !data.filename) return reponse({ status: 'error', message: 'pdfBase64 ou filename manquant' });
  var blob = Utilities.newBlob(Utilities.base64Decode(data.pdfBase64), 'application/pdf', data.filename + '.pdf');
  var fichier = dossierSoumission(data).createFile(blob);
  fichier.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return reponse({ status: 'ok', url: fichier.getUrl() });
}

function enregistrerPhoto(data) {
  if (!data.imageBase64 || !data.filename) return reponse({ status: 'error', message: 'imageBase64 ou filename manquant' });
  var blob = Utilities.newBlob(Utilities.base64Decode(data.imageBase64), data.mimeType || 'image/jpeg', data.filename + '.jpg');
  var fichier = dossierSoumission(data).createFile(blob);
  fichier.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return reponse({ status: 'ok', url: 'https://drive.google.com/thumbnail?id=' + fichier.getId() + '&sz=w1000' });
}

// Le dossier « Factures » est choisi dans Configuration (Compta) et transmis dans data.dossierId.
function enregistrerFacture(data) {
  if (!data.dossierId || !data.fichierBase64 || !data.filename) return reponse({ status: 'error', message: 'dossierId, fichierBase64 ou filename manquant' });
  var racine = DriveApp.getFolderById(data.dossierId);
  var nom = String(data.periode || '').replace(/\s+/g, '').replace(/[\/\\]/g, '-') || Utilities.formatDate(new Date(), 'Europe/Paris', 'yyyy');
  var blob = Utilities.newBlob(Utilities.base64Decode(data.fichierBase64), data.mimeType || 'application/pdf', data.filename);
  var fichier = sousDossier(racine, nom).createFile(blob);
  fichier.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return reponse({ status: 'ok', url: fichier.getUrl() });
}

// Un sous-dossier par animal : « ICAD / Nom_Puce ».
function enregistrerIcad(data) {
  if (!data.fichierBase64 || !data.filename) return reponse({ status: 'error', message: 'fichierBase64 ou filename manquant' });
  var racine = sousDossier(DriveApp.getFolderById(DOSSIER_RACINE_ID), 'ICAD');
  var dossier = sousDossier(racine, nettoyer(majusculeMots(data.animal || 'Animal')) + '_' + nettoyer(data.puce || 'sans-numero'));
  var blob = Utilities.newBlob(Utilities.base64Decode(data.fichierBase64), data.mimeType || 'application/pdf', data.filename);
  var fichier = dossier.createFile(blob);
  fichier.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return reponse({ status: 'ok', url: fichier.getUrl() });
}
