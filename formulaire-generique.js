// ============================================================
// MOTEUR DE FORMULAIRES SIMPLES (nouveaux formulaires)
// Construit une page à partir d'une description (sections, champs,
// appel RPC Supabase, listes de suivi). Gère la connexion de l'équipe
// (profils_suivi) ou l'accès public, la validation et les messages.
//
// FG.page({
//   titre, intro, public:false,            // public:true => sans connexion
//   sections:[{ titre, champs:[ {id,label,type,requis,options,aide,large,defaut,statuts} ] }],
//   rpc:'nom_fonction', params:(valeurs)=>({...}),   // défaut : { p: valeurs }
//   libelleBouton:'Enregistrer', messageSucces:'…',
//   listes:[{ titre, charger:async(sb)=>rows, colonnes:[{t, f:(row)=>texte}], actions:[{libelle, f:async(row,sb)=>…}] }],
//   apres:(sb)=>…                          // après connexion
// });
// Types : text, email, tel, number, date, textarea, select, checkbox,
//         animal (liste des animaux), saisisseur, personne (bloc coordonnées)
// ============================================================
(function () {
    var FG = window.FG = {};
    var sb, conf, valeursAnimaux = {};

    function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    FG.esc = esc;

    FG.PERSONNE = function (titre, requis) {
        return { titre: titre || 'Coordonnées', champs: [
            { id: 'nom', label: 'Nom', type: 'text', requis: requis !== false, maj: true },
            { id: 'prenom', label: 'Prénom', type: 'text' },
            { id: 'adresse', label: 'Adresse', type: 'text', large: true },
            { id: 'code_postal', label: 'Code postal', type: 'text' },
            { id: 'ville', label: 'Ville', type: 'text' },
            { id: 'telephone', label: 'Téléphone', type: 'tel' },
            { id: 'email', label: 'Email', type: 'email' }
        ], personne: true };
    };

    function champHtml(c) {
        var id = 'fg_' + c.id, req = c.requis ? ' <span class="req">*</span>' : '';
        var cls = 'fg-champ' + (c.large || c.type === 'textarea' ? ' large' : '') + (c.type === 'checkbox' ? ' case' : '');
        var corps = '';
        switch (c.type) {
            case 'textarea': corps = '<textarea id="' + id + '"></textarea>'; break;
            case 'select':
                corps = '<select id="' + id + '"><option value="">— Choisir —</option>' +
                    (c.options || []).map(function (o) { o = Array.isArray(o) ? o : [o, o]; return '<option value="' + esc(o[0]) + '">' + esc(o[1]) + '</option>'; }).join('') + '</select>'; break;
            case 'animal': corps = '<input id="' + id + '" list="' + id + '_liste" autocomplete="off" placeholder="Tapez le nom ou le numéro…"><datalist id="' + id + '_liste"></datalist>'; break;
            case 'saisisseur': corps = '<select id="' + id + '"><option value="">— Choisir —</option></select>'; break;
            case 'checkbox': corps = '<input type="checkbox" id="' + id + '">'; break;
            default: corps = '<input id="' + id + '" type="' + (c.type || 'text') + '"' + (c.type === 'number' ? ' step="any"' : '') + (c.type === 'email' ? ' autocomplete="email"' : '') + '>';
        }
        if (c.type === 'checkbox') return '<div class="' + cls + '" data-champ="' + c.id + '">' + corps + '<label for="' + id + '">' + esc(c.label) + req + '</label></div>';
        return '<div class="' + cls + '" data-champ="' + c.id + '"><label for="' + id + '">' + esc(c.label) + req + '</label>' + corps + (c.aide ? '<span class="aide">' + esc(c.aide) + '</span>' : '') + '</div>';
    }

    function tousChamps() { var r = []; conf.sections.forEach(function (s) { s.champs.forEach(function (c) { r.push(c); }); }); return r; }
    function el(c) { return document.getElementById('fg_' + c.id); }

    function lireValeurs() {
        var v = {};
        tousChamps().forEach(function (c) {
            var e = el(c); if (!e) return;
            if (c.type === 'checkbox') v[c.id] = e.checked ? 'true' : 'false';
            else if (c.type === 'animal') v[c.id] = valeursAnimaux[e.value.trim()] || '';
            else v[c.id] = (e.value || '').trim();
        });
        if (conf.public) { var p = document.getElementById('fg_piege'); v.piege = p ? p.value : ''; }
        return v;
    }

    function valider(v) {
        var manques = [];
        document.querySelectorAll('.fg-champ.erreur').forEach(function (d) { d.classList.remove('erreur'); });
        tousChamps().forEach(function (c) {
            var vide = c.type === 'checkbox' ? (c.requis && v[c.id] !== 'true') : (c.requis && !v[c.id]);
            if (c.type === 'animal' && c.requis && !v[c.id] && el(c).value.trim()) { manques.push(c.label + ' : choisissez un animal de la liste'); vide = true; }
            else if (vide) manques.push(c.label);
            if (!vide && c.type === 'email' && v[c.id] && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v[c.id])) { manques.push(c.label + ' invalide'); vide = true; }
            if (vide) { var d = document.querySelector('.fg-champ[data-champ="' + c.id + '"]'); if (d) d.classList.add('erreur'); }
        });
        if (conf.valider) { var extra = conf.valider(v); if (extra && extra.length) manques = manques.concat(extra); }
        return manques;
    }

    function message(html, type) {
        var m = document.getElementById('fg-msg'); m.className = 'fg-msg ' + type; m.innerHTML = html; m.style.display = 'block';
        m.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    function messageErreur(e) {
        var t = (e && e.message) || String(e);
        if (/MODULE_NON_INCLUS/.test(t)) t = 'Ce formulaire n\'est pas inclus dans votre offre.';
        message('❌ ' + esc(t), 'err');
    }

    async function enregistrer() {
        var btn = document.getElementById('fg-envoyer');
        var v = lireValeurs(), manques = valider(v);
        if (manques.length) { message('⚠️ À compléter :<br>• ' + manques.map(esc).join('<br>• '), 'err'); return; }
        btn.disabled = true;
        try {
            var params = conf.params ? conf.params(v) : { p: v };
            var res = await sb.rpc(conf.rpc, params);
            if (res.error) throw res.error;
            message('✅ ' + esc(conf.messageSucces || 'Enregistré.'), 'ok');
            if (conf.reinitialiser !== false) {
                tousChamps().forEach(function (c) { var e = el(c); if (!e) return; if (c.type === 'checkbox') e.checked = false; else if (c.type !== 'saisisseur') e.value = c.defaut || ''; });
            }
            if (conf.apresEnvoi) await conf.apresEnvoi(v, res.data, sb);
            await chargerListes();
        } catch (e) { messageErreur(e); }
        btn.disabled = false;
    }

    async function chargerAnimaux() {
        var champs = tousChamps().filter(function (c) { return c.type === 'animal'; });
        if (!champs.length) return;
        var res = await sb.from('animaux').select('id, nom_usuel, numero_interne, statut_actuel').order('nom_usuel');
        if (res.error) { console.error(res.error); return; }
        champs.forEach(function (c) {
            var dl = document.getElementById('fg_' + c.id + '_liste'); var html = '';
            (res.data || []).forEach(function (a) {
                if (c.statuts && c.statuts.indexOf(a.statut_actuel) === -1) return;
                var lib = a.nom_usuel + (a.numero_interne ? ' (' + a.numero_interne + ')' : '') + (a.statut_actuel ? ' — ' + a.statut_actuel : '');
                valeursAnimaux[lib] = a.id; html += '<option value="' + esc(lib) + '"></option>';
            });
            dl.innerHTML = html;
        });
    }

    async function chargerSaisisseurs() {
        var champs = tousChamps().filter(function (c) { return c.type === 'saisisseur'; });
        if (!champs.length) return;
        var res = await sb.from('utilisateurs').select('id, nom').eq('actif', true).order('nom');
        if (res.error) return;
        champs.forEach(function (c) {
            el(c).innerHTML = '<option value="">— Choisir —</option>' + (res.data || []).map(function (u) { return '<option value="' + u.id + '">' + esc(u.nom) + '</option>'; }).join('');
        });
    }

    async function chargerListes() {
        for (var i = 0; i < (conf.listes || []).length; i++) {
            var L = conf.listes[i], zone = document.getElementById('fg-liste-' + i);
            try {
                var rows = await L.charger(sb);
                if (!rows || !rows.length) { zone.innerHTML = '<p class="fg-vide">' + esc(L.vide || 'Rien à afficher pour le moment.') + '</p>'; continue; }
                var h = '<div class="fg-table-wrap"><table class="fg-table"><thead><tr>' + L.colonnes.map(function (c) { return '<th>' + esc(c.t) + '</th>'; }).join('') + (L.actions ? '<th></th>' : '') + '</tr></thead><tbody>';
                rows.forEach(function (r, ri) {
                    h += '<tr>' + L.colonnes.map(function (c) { var t = c.f(r); return '<td>' + (c.brut ? t : esc(t == null ? '' : t)) + '</td>'; }).join('');
                    if (L.actions) h += '<td>' + L.actions.filter(function (a) { return !a.si || a.si(r); }).map(function (a, ai) { return '<button type="button" class="fg-btn clair petit" data-l="' + i + '" data-r="' + ri + '" data-a="' + L.actions.indexOf(a) + '">' + esc(a.libelle) + '</button>'; }).join(' ') + '</td>';
                    h += '</tr>';
                });
                zone.innerHTML = h + '</tbody></table></div>';
                zone._rows = rows;
            } catch (e) { zone.innerHTML = '<p class="fg-msg err">' + esc(e.message || e) + '</p>'; }
        }
    }

    function construirePage() {
        var h = '<div class="entete-site"><a class="entete-site-lien" href="' + (conf.public ? '#' : 'index.html') + '"><img class="entete-site-logo" src="logo.png" alt="Logo">' +
            '<div class="entete-site-texte"><h1>{{asso.nom}}</h1><p>' + esc(conf.sousTitre || 'Association de protection animale') + '</p></div></a></div>';
        h += '<div class="fg-wrap">' + (conf.public ? '' : '<a class="fg-retour" href="index.html">← Retour au portail</a>');
        h += '<div class="fg-carte"><h1>' + esc(conf.titre) + '</h1>' + (conf.intro ? '<p class="fg-intro">' + esc(conf.intro) + '</p>' : '') + '</div>';
        if (conf.sections.length) h += '<form id="fg-form" class="fg-carte" novalidate>';
        conf.sections.forEach(function (s) { h += '<h2>' + esc(s.titre) + '</h2><div class="fg-grille">' + s.champs.map(champHtml).join('') + '</div><div style="height:14px"></div>'; });
        if (conf.public) h += '<div class="fg-piege" aria-hidden="true"><label>Ne pas remplir<input id="fg_piege" tabindex="-1" autocomplete="off"></label></div>';
        if (conf.sections.length) h += '<div class="fg-actions"><button type="submit" class="fg-btn" id="fg-envoyer">' + esc(conf.libelleBouton || 'Enregistrer') + '</button></div><div id="fg-msg" class="fg-msg" style="display:none"></div></form>';
        else h += '<div id="fg-msg" class="fg-msg" style="display:none"></div>';
        (conf.listes || []).forEach(function (L, i) { h += '<div class="fg-carte"><h2>' + esc(L.titre) + '</h2><div id="fg-liste-' + i + '"><p class="fg-vide">Chargement…</p></div></div>'; });
        h += '</div>';
        if (!conf.public) h += '<div id="fg-login"><div class="boite"><h1 style="font-size:16px;margin:0 0 4px">{{asso.nom}}</h1><p style="font-size:12px;color:#8a7968;margin-bottom:16px">Connexion requise.</p>' +
            '<input type="email" id="fg-email" placeholder="Email"><input type="password" id="fg-mdp" placeholder="Mot de passe"><div id="fg-login-err" style="font-size:12px;color:#b00020;margin-bottom:8px"></div>' +
            '<button type="button" class="fg-btn" id="fg-connexion" style="width:100%">Se connecter</button></div></div>';
        document.getElementById('app').innerHTML = h;
        if (conf.sections.length) document.getElementById('fg-form').addEventListener('submit', function (e) { e.preventDefault(); enregistrer(); });
        document.getElementById('app').addEventListener('click', async function (e) {
            var b = e.target.closest('button[data-a]'); if (!b) return;
            var L = conf.listes[+b.dataset.l], zone = document.getElementById('fg-liste-' + b.dataset.l), row = zone._rows[+b.dataset.r];
            try { b.disabled = true; await L.actions[+b.dataset.a].f(row, sb); await chargerListes(); } catch (err) { messageErreur(err); b.disabled = false; }
        });
        (document.querySelectorAll('.fg-champ[data-champ]') || []).forEach(function (d) {
            var c = tousChamps().filter(function (x) { return x.id === d.dataset.champ; })[0];
            if (c && c.maj) el(c).addEventListener('input', function () { var s = this.selectionStart; this.value = this.value.toUpperCase(); this.setSelectionRange(s, s); });
            if (c && c.defaut) el(c).value = c.defaut;
        });
        if (typeof initSelecteurPersonne === 'function') {
            conf.sections.forEach(function (s) {
                if (!s.personne) return;
                var m = {}; ['adresse', 'code_postal', 'ville', 'email', 'telephone'].forEach(function (k) { m['fg_' + k] = k; });
                initSelecteurPersonne({ nomId: 'fg_nom', prenomId: 'fg_prenom', champs: m });
            });
        }
    }

    async function demarrer() {
        await chargerAnimaux(); await chargerSaisisseurs(); await chargerListes();
        if (conf.apres) conf.apres(sb);
    }

    async function verifierAcces(user) {
        var err = document.getElementById('fg-login-err');
        try {
            var r = await sb.from('profils_suivi').select('email').eq('user_id', user.id).maybeSingle();
            if (r.error || !r.data) { err.textContent = "Ce compte n'est pas autorisé."; await sb.auth.signOut(); return; }
            document.getElementById('fg-login').style.display = 'none';
            demarrer();
        } catch (e) { err.textContent = 'Le chargement a échoué : ' + e.message; }
    }

    FG.page = function (c) {
        conf = c; sb = creerClientSupabase(); window.supabaseClient = sb;
        construirePage();
        if (conf.public) { demarrer(); return; }
        document.getElementById('fg-connexion').onclick = async function () {
            var r = await sb.auth.signInWithPassword({ email: document.getElementById('fg-email').value.trim(), password: document.getElementById('fg-mdp').value });
            if (r.error) { document.getElementById('fg-login-err').textContent = 'Connexion refusée : ' + r.error.message; return; }
            verifierAcces(r.data.user);
        };
        document.getElementById('fg-mdp').addEventListener('keydown', function (e) { if (e.key === 'Enter') document.getElementById('fg-connexion').click(); });
        sb.auth.getSession().then(function (r) { if (r.data.session) verifierAcces(r.data.session.user); });
    };
    FG.client = function () { return sb; };
    FG.valeurs = function () { return lireValeurs(); };
    FG.message = message;
    // Petite fenêtre de saisie : renvoie un objet {id: valeur} ou null si annulé.
    FG.demander = function (titre, champs) {
        return new Promise(function (resolve) {
            var fond = document.createElement('div');
            fond.style.cssText = 'position:fixed;inset:0;background:rgba(40,30,20,.55);z-index:100000;display:flex;align-items:center;justify-content:center;padding:16px';
            var h = '<div class="fg-carte" style="max-width:420px;width:100%;margin:0"><h2>' + esc(titre) + '</h2>';
            champs.forEach(function (c) { h += '<div class="fg-champ" style="margin-bottom:10px"><label>' + esc(c.label) + '</label>' +
                (c.type === 'select' ? '<select data-k="' + c.id + '">' + c.options.map(function (o) { o = Array.isArray(o) ? o : [o, o]; return '<option value="' + esc(o[0]) + '">' + esc(o[1]) + '</option>'; }).join('') + '</select>'
                    : '<input data-k="' + c.id + '" type="' + (c.type || 'text') + '" value="' + esc(c.defaut || '') + '">') + '</div>'; });
            h += '<div class="fg-actions"><button type="button" class="fg-btn" data-ok>Valider</button><button type="button" class="fg-btn clair" data-ko>Annuler</button></div></div>';
            fond.innerHTML = h; document.body.appendChild(fond);
            fond.querySelector('[data-ko]').onclick = function () { fond.remove(); resolve(null); };
            fond.querySelector('[data-ok]').onclick = function () { var r = {}; fond.querySelectorAll('[data-k]').forEach(function (i) { r[i.dataset.k] = i.value; }); fond.remove(); resolve(r); };
        });
    };
    FG.fmtDate = function (d) { return d ? new Date(d).toLocaleDateString('fr-FR') : ''; };
    FG.fmtEuro = function (n) { return n == null ? '' : Number(n).toFixed(2).replace('.', ',') + ' €'; };
})();
