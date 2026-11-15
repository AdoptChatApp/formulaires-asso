// ============================================================
// MARQUE BLANCHE — remplace les repères {{asso.xxx}} par les valeurs
// de association-config.js, dans le texte, les attributs et le titre
// des pages ; expose assoTexte() pour les textes générés en JavaScript
// (PDF, mails). Chargé dans le <head> de chaque page.
// ============================================================
(function () {
    var A = window.ASSOCIATION || {};
    function valeur(cle) {
        if (cle === 'villeMaj') return String(A.ville || '').toUpperCase();
        if (cle === 'nomMaj')   return String(A.nom || '').toUpperCase();
        return A[cle] == null ? '' : String(A[cle]);
    }
    var RE = /\{\{asso\.([a-zA-Z]+)\}\}/g;
    function assoTexte(s) {
        if (typeof s !== 'string' || s.indexOf('{{asso.') === -1) return s;
        return s.replace(RE, function (_, cle) { return valeur(cle); });
    }
    window.assoTexte = assoTexte;

    var ATTRS = ['alt', 'title', 'href', 'placeholder', 'content', 'value', 'max'];
    function traiterNoeud(n) {
        if (n.nodeType === 3) {
            if (n.nodeValue.indexOf('{{asso.') !== -1) n.nodeValue = assoTexte(n.nodeValue);
        } else if (n.nodeType === 1) {
            var tag = n.tagName;
            if (tag === 'SCRIPT' || tag === 'STYLE') return;
            for (var i = 0; i < ATTRS.length; i++) {
                var v = n.getAttribute(ATTRS[i]);
                if (v && v.indexOf('{{asso.') !== -1) n.setAttribute(ATTRS[i], assoTexte(v));
            }
            for (var c = n.firstChild; c; c = c.nextSibling) traiterNoeud(c);
        }
    }
    function tout() {
        if (document.title) document.title = assoTexte(document.title);
        if (document.body) traiterNoeud(document.body);
    }
    function demarrer() {
        tout();
        var attente = null;
        new MutationObserver(function (muts) {
            // Les contenus ajoutés dynamiquement (cartes, PDF d'aperçu...) sont traités aussi.
            muts.forEach(function (m) {
                m.addedNodes.forEach(function (n) { traiterNoeud(n); });
            });
        }).observe(document.body, { childList: true, subtree: true });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrer);
    else demarrer();
})();

// Les messages affichés par alert()/confirm() peuvent contenir des repères.
(function () {
    var a = window.alert, c = window.confirm;
    window.alert = function (m) { return a.call(window, window.assoTexte(String(m))); };
    window.confirm = function (m) { return c.call(window, window.assoTexte(String(m))); };
})();
