// ============================================================
// STOCKAGE DES FICHIERS — Supabase Storage (dossier « documents »)
// Remplace l'ancien envoi vers Google Drive (Apps Script).
//
// Les fichiers sont rangés comme l'était le Drive :
//   <Type>/<AAAA-MM-JJ_Nom_Prenom_Animal>/<identifiant aléatoire>/<fichier>
// Le dossier est PRIVÉ (voir 074_stockage_fichiers.sql) : l'« adresse »
// enregistrée en base n'est qu'un identifiant et ne s'ouvre jamais
// directement. Ce fichier convertit automatiquement tout lien ou image
// pointant vers le dossier en téléchargement / affichage authentifié
// (compte du site obligatoire) : voir la fin du fichier.
// Chaque fonction renvoie l'identifiant (adresse) du fichier déposé.
// Nécessite supabase-config.js (supabaseClient) et une session ouverte.
// ============================================================

var STOCKAGE_BUCKET = 'documents';

var STOCKAGE_MIME_PAR_EXTENSION = {
    pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
    webp: 'image/webp', gif: 'image/gif', heic: 'image/heic', heif: 'image/heif'
};

// Nom sûr pour une clé de stockage : sans accents ni caractères spéciaux.
function stockageNettoyer(t) {
    var s = String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '');
    if (!s || /^\.+$/.test(s)) s = '_';
    return s;
}

function stockageMajusculeMots(t) {
    return String(t || '').trim().toLowerCase().replace(/(^|[\s\-'])(\p{L})/gu, function (m, sep, l) { return sep + l.toUpperCase(); });
}

function stockageJeton() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID().replace(/-/g, '');
    var a = new Uint8Array(16);
    crypto.getRandomValues(a);
    return Array.prototype.map.call(a, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
}

function stockageBase64VersBlob(base64, mimeType) {
    var bin = atob(base64);
    var octets = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) octets[i] = bin.charCodeAt(i);
    return new Blob([octets], { type: mimeType || 'application/octet-stream' });
}

function stockageMimeDe(nomFichier, mimeDonne) {
    if (mimeDonne && mimeDonne !== 'application/octet-stream') return mimeDonne;
    var ext = ((String(nomFichier || '').match(/\.([A-Za-z0-9]+)$/) || [])[1] || '').toLowerCase();
    return STOCKAGE_MIME_PAR_EXTENSION[ext] || mimeDonne || 'application/octet-stream';
}

/**
 * Dépose un fichier. chemin : tableau de dossiers (ex. ['Adoption', '2026-05-01_Dupont_Marie']).
 * donnees : Blob, File, Uint8Array ou ArrayBuffer.
 * @returns {Promise<string>} adresse publique du fichier
 */
async function stockageDeposer(chemin, nomFichier, donnees, mimeType) {
    var mime = stockageMimeDe(nomFichier, mimeType);
    var blob = (donnees instanceof Blob) ? donnees : new Blob([donnees], { type: mime });
    var cle = chemin.map(stockageNettoyer).concat([stockageJeton(), stockageNettoyer(nomFichier)]).join('/');
    var res = await supabaseClient.storage.from(STOCKAGE_BUCKET).upload(cle, blob, {
        contentType: mime, upsert: false, cacheControl: '3600'
    });
    if (res.error) throw new Error('Dépôt du fichier impossible : ' + (res.error.message || res.error));
    return supabaseClient.storage.from(STOCKAGE_BUCKET).getPublicUrl(cle).data.publicUrl;
}

// « AAAA-MM-JJ_Nom_Prenom_Animal » : l'ordre ISO garde les dossiers triés par date.
function stockageNomDossierSoumission(d) {
    var date = d.dateDossier || new Date().toISOString().split('T')[0];
    var parts = [date, stockageNettoyer(stockageMajusculeMots(d.nom || 'Inconnu'))];
    if (d.prenom) parts.push(stockageNettoyer(stockageMajusculeMots(d.prenom)));
    if (d.animal) parts.push(stockageNettoyer(stockageMajusculeMots(d.animal)));
    return parts.join('_');
}

/** PDF ou photo d'un formulaire : { onglet, prenom, nom, animal, dateDossier, nomFichier, donnees, mimeType } */
async function stockageDeposerSoumission(d) {
    return stockageDeposer(
        [d.onglet || 'Divers', stockageNomDossierSoumission(d)],
        d.nomFichier, d.donnees, d.mimeType
    );
}

/** Facture : rangée dans Factures/<période>. */
async function stockageDeposerFacture(d) {
    var periode = String(d.periode || '').replace(/\s+/g, '') || String(new Date().getFullYear());
    return stockageDeposer(['Factures', periode], d.nomFichier, d.donnees, d.mimeType);
}

/** Certificat ICAD / stérilisation : un dossier par animal, ICAD/<Nom>_<puce>. */
async function stockageDeposerIcad(d) {
    var dossier = stockageNettoyer(stockageMajusculeMots(d.animal || 'Animal')) + '_' + stockageNettoyer(d.puce || 'sans-numero');
    return stockageDeposer(['ICAD', dossier], d.nomFichier, d.donnees, d.mimeType);
}


// ============================================================
// LECTURE PRIVÉE : liens → téléchargement, images → affichage
// avec la session de la personne connectée. Aucun lien partageable.
// ============================================================
var STOCKAGE_RE_URL = /\/storage\/v1\/object\/(?:public|sign|authenticated)\/documents\/([^?#]+)/;
var _stockageImages = {};

/** Chemin dans le dossier à partir d'une adresse enregistrée (ou null si ce n'en est pas une). */
function stockageCheminDepuisUrl(url) {
    var m = STOCKAGE_RE_URL.exec(String(url || ''));
    if (!m) return null;
    try { return decodeURIComponent(m[1]); } catch (e) { return m[1]; }
}

/** Télécharge le fichier (session obligatoire) et l'enregistre sur l'appareil. */
async function stockageTelecharger(chemin, nomAffiche) {
    var res = await supabaseClient.storage.from(STOCKAGE_BUCKET).download(chemin);
    if (res.error || !res.data) throw new Error((res.error && res.error.message) || 'fichier introuvable ou accès refusé');
    var url = URL.createObjectURL(res.data);
    var a = document.createElement('a');
    a.href = url;
    a.download = nomAffiche || chemin.split('/').pop();
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
}

function _stockageMarquerLien(a) {
    if (a.getAttribute('data-stockage')) return;
    var chemin = stockageCheminDepuisUrl(a.getAttribute('href'));
    if (!chemin) return;
    a.setAttribute('data-stockage', chemin);
    a.setAttribute('href', '#');
    a.removeAttribute('target');
    a.setAttribute('title', 'Télécharger le fichier');
    if (!a.querySelector('img') && !/⬇/.test(a.textContent)) a.insertAdjacentText('afterbegin', '⬇ ');
}

var _PIXEL_VIDE = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
function _stockageMarquerImage(img) {
    if (img.getAttribute('data-stockage')) return;
    var chemin = stockageCheminDepuisUrl(img.getAttribute('src'));
    if (!chemin) return;
    img.setAttribute('data-stockage', chemin);
    img.setAttribute('src', _PIXEL_VIDE);
    if (!_stockageImages[chemin]) {
        _stockageImages[chemin] = supabaseClient.storage.from(STOCKAGE_BUCKET).download(chemin)
            .then(function (r) { return (r.error || !r.data) ? null : URL.createObjectURL(r.data); })
            .catch(function () { return null; });
    }
    _stockageImages[chemin].then(function (u) { if (u) img.setAttribute('src', u); });
}

function _stockageBalayer(racine) {
    if (!racine || !racine.querySelectorAll || typeof supabaseClient === 'undefined') return;
    if (racine.matches && racine.matches('a[href]')) _stockageMarquerLien(racine);
    if (racine.matches && racine.matches('img[src]')) _stockageMarquerImage(racine);
    racine.querySelectorAll('a[href*="/storage/v1/object/"]').forEach(_stockageMarquerLien);
    racine.querySelectorAll('img[src*="/storage/v1/object/"]').forEach(_stockageMarquerImage);
}

document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[data-stockage], a[href*="/storage/v1/object/"]');
    if (!a) return;
    var chemin = a.getAttribute('data-stockage') || stockageCheminDepuisUrl(a.getAttribute('href'));
    if (!chemin) return;
    e.preventDefault();
    stockageTelecharger(chemin).catch(function (err) {
        alert('Téléchargement impossible : ' + (err.message || err) + '\n(Êtes-vous connecté ?)');
    });
}, true);

new MutationObserver(function (muts) {
    muts.forEach(function (m) {
        if (m.type === 'attributes') _stockageBalayer(m.target);
        else m.addedNodes.forEach(function (n) { if (n.nodeType === 1) _stockageBalayer(n); });
    });
}).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['href', 'src'] });
