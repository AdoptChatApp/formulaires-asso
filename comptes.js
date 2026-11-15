// ============================================================
// COMPTES DE TRÉSORERIE — banques et caisses paramétrables
// (table comptes_tresorerie, voir 013a_comptes_tresorerie.sql).
// Les pages Compta l'utilisent pour remplir leurs listes de comptes
// au lieu d'avoir « Banque / Caisse 1 / Caisse 2 » écrits en dur.
// ============================================================
window.COMPTES = (function () {
    var liste = [];
    var PAR_DEFAUT = [
        { code: 'banque', libelle: 'Banque', type: 'banque', ordre: 1, actif: true },
        { code: 'caisse1', libelle: 'Caisse 1', type: 'caisse', ordre: 2, actif: true },
        { code: 'caisse2', libelle: 'Caisse 2', type: 'caisse', ordre: 3, actif: true }
    ];
    function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); }
    var API = {
        async charger(sb) {
            var r = await (sb || window.supabaseClient).from('comptes_tresorerie').select('code, libelle, type, ordre, actif').order('ordre');
            liste = (r.error || !r.data || !r.data.length) ? PAR_DEFAUT.slice() : r.data;
            return liste;
        },
        tous: function () { return liste.length ? liste : PAR_DEFAUT; },
        actifs: function (type) { return API.tous().filter(function (c) { return c.actif && (!type || c.type === type); }); },
        caisses: function () { return API.actifs('caisse'); },
        banques: function () { return API.actifs('banque'); },
        libelle: function (code) { var c = API.tous().filter(function (x) { return x.code === code; })[0]; return c ? c.libelle : (code || ''); },
        estCaisse: function (code) { var c = API.tous().filter(function (x) { return x.code === code; })[0]; return c ? c.type === 'caisse' : /^caisse/.test(code || ''); },
        options: function (type, avecToutes) {
            return (avecToutes ? '<option value="">' + avecToutes + '</option>' : '') +
                API.actifs(type).map(function (c) { return '<option value="' + esc(c.code) + '">' + esc(c.libelle) + '</option>'; }).join('');
        },
        // Remplit un <select> (type : 'banque', 'caisse' ou omis pour tous les comptes)
        remplirSelect: async function (id, type, avecToutes) {
            if (!liste.length) await API.charger();
            var s = document.getElementById(id); if (!s) return;
            var v = s.value; s.innerHTML = API.options(type, avecToutes);
            if (v) s.value = v;
        }
    };
    return API;
})();
