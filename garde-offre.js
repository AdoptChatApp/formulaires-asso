// ============================================================
// GARDE D'OFFRE — bloque l'accès aux pages hors offre et affiche
// un popup « Ce formulaire est inclus dans l'offre … ».
//   * source de vérité : la base (rpc obtenir_licence, voir 071_licence.sql) ;
//     les écritures sont refusées côté base même si ce fichier est contourné ;
//   * un clic sur un lien vers une page hors offre n'ouvre pas la page :
//     il ouvre le popup ; ouvrir directement l'URL affiche le même popup.
// Aucune configuration ici : le catalogue page → module est ci-dessous.
// ============================================================
(function () {
    var LIBELLES_OFFRES = { essentiel: 'Essentiel', standard: 'Standard', complete: 'Complète' };

    // Page (nom de fichier) -> module. Une page absente de cette liste est toujours accessible.
    var PAGES = {
        // --- Essentiel
        'arrivee_animal.html': 'animaux', 'statuts_animaux.html': 'animaux', 'liste_animaux.html': 'animaux',
        'recherche_chat.html': 'animaux', 'recherche_personne.html': 'animaux',
        'adoption.html': 'adoption', 'completer_dossier_adoption.html': 'adoption',
        'reservation.html': 'reservation', 'certificat_engagement.html': 'certificat',
        'adhesion.html': 'adhesion', 'don.html': 'don',
        'contact.html': 'contact', 'demandes_publiques.html': 'contact',
        'preadoption.html': 'preadoption',
        // --- Standard
        'recu_fiscal_particulier.html': 'recu_fiscal', 'recu_fiscal_entreprise.html': 'recu_fiscal',
        'famille_accueil.html': 'accueil', 'fiche_famille_accueil.html': 'accueil',
        'depot_chat.html': 'depot_abandon', 'abandon.html': 'depot_abandon',
        'attestation_cbs_absent.html': 'attestations', 'decharge_vaccin.html': 'attestations',
        'pret_materiel.html': 'materiel', 'retour_materiel.html': 'materiel', 'suivi_pret_materiel.html': 'materiel',
        'suivi_icad.html': 'icad', 'rapports_animaux.html': 'rapports', 'formulaires_preremplis.html': 'adoption',
        'visite_preadoption.html': 'visite', 'restitution.html': 'restitution', 'sortie_animal.html': 'sortie',
        // --- Complète
        'index_compta.html': 'compta', 'banque.html': 'compta', 'caisse.html': 'compta',
        'caisse_physique.html': 'compta', 'cheques.html': 'compta', 'remise_cheques.html': 'compta',
        'factures.html': 'compta', 'ecritures_diverses.html': 'compta', 'import_rapprochement.html': 'compta',
        'analyse.html': 'compta', 'journal.html': 'compta', 'notes.html': 'compta',
        'suivi_medical.html': 'suivi_medical', 'note_frais.html': 'notes_frais',
        'parrainage.html': 'parrainage', 'boutique.html': 'parrainage'
    };

    var CLE_CACHE = 'licence_v1';
    var licence = null;

    function fichierDe(url) {
        try { return new URL(url, location.href).pathname.split('/').pop() || 'index.html'; }
        catch (e) { return ''; }
    }
    function lireCache() {
        try {
            var c = JSON.parse(sessionStorage.getItem(CLE_CACHE) || 'null');
            if (c && Date.now() - c.t < 5 * 60 * 1000) return c.v;
        } catch (e) {}
        return null;
    }
    function ecrireCache(v) { try { sessionStorage.setItem(CLE_CACHE, JSON.stringify({ t: Date.now(), v: v })); } catch (e) {} }

    // Ancienne clé anon (JWT « eyJ… ») : envoyée aussi en Authorization.
    // Nouvelle clé « sb_publishable_… » : uniquement dans l'en-tête apikey (ce n'est pas un JWT).
    function entetesCle(cle) {
        var h = { 'Content-Type': 'application/json', apikey: cle };
        if (/^eyJ/.test(cle || '')) h.Authorization = 'Bearer ' + cle;
        return h;
    }

    function charger() {
        var c = lireCache();
        if (c) return Promise.resolve(c);
        var A = window.ASSOCIATION || {};
        if (!A.supabaseUrl || /VOTRE-PROJET/.test(A.supabaseUrl)) return Promise.resolve(null);
        return fetch(A.supabaseUrl + '/rest/v1/rpc/obtenir_licence', {
            method: 'POST',
            headers: entetesCle(A.supabaseAnonKey),
            body: '{}'
        }).then(function (r) { return r.ok ? r.json() : null; })
          .then(function (v) { if (v) ecrireCache(v); return v; })
          .catch(function () { return null; });
    }

    function infoModule(module) {
        if (!licence) return null;
        for (var i = 0; i < licence.modules.length; i++) if (licence.modules[i].module === module) return licence.modules[i];
        return null;
    }
    // true si la page est hors offre
    function verrouillee(fichier) {
        var module = PAGES[fichier];
        if (!module) return null;
        var m = infoModule(module);
        return (m && !m.actif) ? m : null;
    }
    window.moduleActif = function (module) { var m = infoModule(module); return !m || !!m.actif; };

    function popup(m, surPageBloquee) {
        var offre = LIBELLES_OFFRES[m.offre_min] || m.offre_min;
        var fond = document.createElement('div');
        fond.setAttribute('role', 'dialog');
        fond.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:' +
            (surPageBloquee ? '#faf7f2' : 'rgba(40,30,20,.55)') + ';display:flex;align-items:center;justify-content:center;padding:20px;font-family:system-ui,sans-serif;';
        var boite = document.createElement('div');
        boite.style.cssText = 'background:#fff;max-width:440px;width:100%;border-radius:14px;padding:28px 26px;text-align:center;box-shadow:0 10px 40px rgba(0,0,0,.25);';
        boite.innerHTML =
            '<div style="font-size:42px;line-height:1">🔒</div>' +
            '<h2 style="margin:12px 0 8px;font-size:20px;color:#3d2b1f;"></h2>' +
            '<p style="margin:0 0 6px;color:#3d2b1f;line-height:1.5;">Ce formulaire est inclus dans l\'offre <strong class="o"></strong>.</p>' +
            '<p style="margin:0 0 20px;color:#8a7968;font-size:14px;line-height:1.5;">Contactez votre fournisseur pour faire évoluer votre offre et débloquer ce module.</p>' +
            '<button type="button" style="background:#c96b2a;color:#fff;border:0;border-radius:8px;padding:10px 22px;font-size:15px;cursor:pointer;"></button>';
        boite.querySelector('h2').textContent = m.libelle;
        boite.querySelector('.o').textContent = offre;
        var bouton = boite.querySelector('button');
        bouton.textContent = surPageBloquee ? 'Retour au portail' : 'Fermer';
        bouton.onclick = function () {
            if (surPageBloquee) location.href = 'index.html'; else fond.remove();
        };
        fond.appendChild(boite);
        if (!surPageBloquee) fond.addEventListener('click', function (e) { if (e.target === fond) fond.remove(); });
        document.body.appendChild(fond);
    }

    function marquerLiens() {
        document.querySelectorAll('a[href]').forEach(function (a) {
            if (a.dataset.verrou) return;
            var m = verrouillee(fichierDe(a.getAttribute('href')));
            if (!m) return;
            a.dataset.verrou = '1';
            a.style.opacity = '0.6';
            var titre = a.querySelector('.card-title') || a;
            if (titre.textContent.indexOf('🔒') === -1) titre.appendChild(document.createTextNode(' 🔒'));
        });
    }

    // Clic : un lien vers une page hors offre ouvre le popup au lieu de la page.
    document.addEventListener('click', function (e) {
        var a = e.target.closest && e.target.closest('a[href]');
        if (!a || !licence) return;
        var m = verrouillee(fichierDe(a.getAttribute('href')));
        if (!m) return;
        e.preventDefault(); e.stopPropagation();
        popup(m, false);
    }, true);

    window.licencePrete = charger().then(function (v) {
        licence = v;
        if (!licence) return;
        var m = verrouillee(fichierDe(location.href));
        function appliquer() {
            if (m) popup(m, true); else marquerLiens();
        }
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', appliquer); else appliquer();
        if (!m) new MutationObserver(marquerLiens).observe(document.documentElement, { childList: true, subtree: true });
    });
})();
