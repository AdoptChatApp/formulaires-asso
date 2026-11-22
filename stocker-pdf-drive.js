// ============================================================
// STOCKAGE DES PDF (Supabase Storage ; nom de fichier historique) — dépose le PDF déjà généré côté
// navigateur (genererPdfFormulaire(), voir generer-pdf.js) dans le
// Drive partagé de l'équipe, via le même Apps Script que celui déjà
// utilisé pour les photos (APPS_SCRIPT_URL, voir config.js), avec une
// nouvelle action 'pdf' à ajouter côté Apps Script (voir
// apps-script-drive.gs fourni à part — ce fichier ne modifie
// pas l'Apps Script lui-même, seulement ce qui l'appelle).
//
// Contrairement à l'appel utilisé pour les photos (mode:'no-cors',
// réponse illisible exprès car on n'a besoin de rien en retour), cet
// appel-ci N'UTILISE PAS mode:'no-cors' : il a besoin de lire l'URL
// Drive renvoyée pour l'enregistrer dans soumission_fichiers. Ce n'est
// possible que parce que l'Apps Script est déployé en accès "Anyone"
// (déjà le cas, sinon l'appel photo existant ne fonctionnerait pas
// non plus).
//
// N'interrompt jamais l'enregistrement du formulaire en cas d'échec :
// l'erreur est relancée pour que l'appelant l'affiche s'il le
// souhaite, exactement comme envoyerMailFormulaire() (voir
// envoyer-mail.js, dont ce fichier réutilise arrayBufferToBase64).
// ============================================================

/**
 * @param {string} onglet             nom du module, pour le classement dans
 *                                     Drive (ex: 'Adoption', 'Réservation')
 * @param {string} prenom             prénom de la personne concernée
 * @param {string} nom                nom de la personne concernée
 * @param {string} animal             nom de l'animal concerné (si applicable)
 * @param {string} dateDossier        date ISO (AAAA-MM-JJ), pour le classement
 * @param {string} filename           nom de fichier sans extension
 * @param {Uint8Array} pdfBytes       le PDF généré par genererPdfFormulaire()
 * @param {string} tableSource        nom de la table (ex: 'adoptions')
 * @param {string} enregistrementId   id de la ligne correspondante
 * @param {string} typeFichier        libellé affiché (ex: 'Contrat de cession')
 * @returns {Promise<string>} l'URL Drive du fichier déposé
 */
async function enregistrerPdfDrive({ onglet, prenom, nom, animal, dateDossier, filename, pdfBytes, tableSource, enregistrementId, typeFichier }) {
    // Dépôt dans le stockage Supabase (dossier privé « documents », visible dans la page Archives).
    // Le nom de la fonction est conservé pour ne pas modifier les formulaires qui l'appellent.
    var url = await stockageDeposerSoumission({
        onglet:      onglet || 'Divers',
        prenom:      (prenom || '').trim(),
        nom:         (nom || 'Inconnu').trim(),
        animal:      (animal || '').trim(),
        dateDossier: dateDossier || new Date().toISOString().split('T')[0],
        nomFichier:  filename + '.pdf',
        donnees:     pdfBytes,
        mimeType:    'application/pdf'
    });

    const { error } = await supabaseClient.from('soumission_fichiers').insert({
        table_source: tableSource,
        enregistrement_id: enregistrementId,
        type_fichier: typeFichier,
        url: url
    });
    if (error) throw new Error('Fichier déposé mais lien non enregistré en base : ' + error.message);

    return url;
}
