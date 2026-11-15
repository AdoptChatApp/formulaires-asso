// ============================================================
// CONFIGURATION DE L'ASSOCIATION — LE SEUL FICHIER À PERSONNALISER
// ============================================================
// Toutes les pages (formulaires, contrats, reçus fiscaux, PDF, mails,
// compta) lisent ce fichier. Les textes « {{asso.xxx}} » présents dans
// les pages sont remplacés automatiquement par les valeurs ci-dessous.
// Le logo est le fichier « logo.png » à la racine : remplacez-le par
// le vôtre (PNG, fond transparent de préférence).
// ============================================================
window.ASSOCIATION = {
    // --- Identité (apparaît sur les contrats, reçus, mails, en-têtes) ---
    nom:             'Votre Association',
    adresse:         'Votre adresse',
    codePostal:      '00000',
    ville:           'Votre ville',
    telephone:       '00 00 00 00 00',
    email:           'contact@votre-association.fr',

    // --- Informations légales ---
    rna:             'W000000000',        // n° RNA (déclaration en préfecture)
    siren:           '000 000 000',       // SIREN ou RNA affiché sur les reçus fiscaux
    prefecture:      'Votre ville',       // préfecture de déclaration
    dateDeclaration: 'JJ mois AAAA',      // date de déclaration en préfecture
    representant:    'Prénom NOM',        // représentant légal qui signe
    qualite:         'président(e)',      // qualité du représentant

    // --- Tarifs et montants affichés sur les contrats (modifiables) ---
    acompteReservation: '50',    // acompte de réservation (€)
    cautionMateriel:    '100',   // caution du prêt de matériel (€)
    tarifAdoption1:     '90',    // participations à la cession à charge (voir adoption.html pour le détail de chaque formule)
    tarifAdoption2:     '120',
    tarifAdoption3:     '150',
    tarifAdoption4:     '180',
    tarifAdoption5:     '220',
    tarifPasseport:     '20',    // options facturables
    tarifRage:          '40',
    tarifTests:         '40',
    tarifRadio:         '65',
    tarifTransport:     '10',

    // --- Services externes (renseignés à l'installation) ---
    supabaseUrl:     'https://ccdbfzyhzkbaywkwypmw.supabase.co',
    supabaseAnonKey: 'sb_publishable_5_zvhEyXyH40J-7TdVaCSg_iaNeAQnj',
    appsScriptUrl:   'https://script.google.com/macros/s/AKfycbz73znieKKZlHC4zK5sUTP3SZ1aZDgu2hPx6gS6_Fml5hr6pUc-QfJYdFk9DHJ_Fh4cmQ/exec', // stockage Google Drive

    // --- Offre commerciale : « essentiel », « standard » ou « complete » ---
    // Valeur de secours uniquement : l'offre active est celle enregistrée
    // dans la base (table « licence », voir 071_licence.sql).
    offreParDefaut:  'complete'
};
