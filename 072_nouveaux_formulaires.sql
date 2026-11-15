-- ============================================================
-- 072_nouveaux_formulaires.sql — NOUVEAUX FORMULAIRES
--   contact, pré-adoption (publics), visite de pré-adoption,
--   suivi médical, profil famille d'accueil + fin d'accueil,
--   restitution, décès/sortie, notes de frais, parrainage, boutique.
-- Dépend de : 001, 026 (role_suivi_courant), 030 (changer_statut_animal).
-- Les déclencheurs de licence sont posés par 090_licence_triggers.sql.
-- ============================================================

-- ---------- Outils internes (non exposés à l'API) ----------
create or replace function exiger_suivi()
returns void language plpgsql security definer set search_path = public as $$
begin
    if role_suivi_courant() is null then
        raise exception 'Accès refusé : connexion requise.';
    end if;
end; $$;
revoke all on function exiger_suivi() from public, anon, authenticated;

create or replace function valider_saisisseur(p_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
begin
    if p_id is null then return null; end if;
    if not exists (select 1 from utilisateurs where id = p_id and actif) then
        raise exception 'Personne non reconnue dans la liste des saisisseurs.';
    end if;
    return p_id;
end; $$;
revoke all on function valider_saisisseur(uuid) from public, anon, authenticated;

-- Retrouve (nom + prénom) ou crée une personne à partir d'un objet JSON.
create or replace function trouver_ou_creer_personne(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_nom text := btrim(coalesce(p->>'nom', '')); v_prenom text := nullif(btrim(coalesce(p->>'prenom', '')), '');
begin
    if v_nom = '' then raise exception 'Le nom est obligatoire'; end if;
    select id into v_id from personnes
    where upper(btrim(nom)) = upper(v_nom)
      and coalesce(upper(btrim(prenom)), '') = coalesce(upper(v_prenom), '')
    limit 1;
    if v_id is null then
        insert into personnes (type_personne, nom, prenom, adresse, code_postal, ville, telephone, email)
        values ('particulier', v_nom, v_prenom, nullif(p->>'adresse',''), nullif(p->>'code_postal',''),
                nullif(p->>'ville',''), nullif(p->>'telephone',''), nullif(p->>'email',''))
        returning id into v_id;
    end if;
    return v_id;
end; $$;
revoke all on function trouver_ou_creer_personne(jsonb) from public, anon, authenticated;

-- ============================================================
-- 1. FORMULAIRES PUBLICS : contact et pré-adoption (sans connexion)
-- ============================================================
create table if not exists messages_contact (
    id        uuid primary key default gen_random_uuid(),
    nom       text not null,
    email     text not null,
    sujet     text,
    message   text not null,
    traite    boolean not null default false,
    cree_le   timestamptz not null default now()
);

create table if not exists demandes_preadoption (
    id                 uuid primary key default gen_random_uuid(),
    nom                text not null,
    prenom             text,
    adresse            text,
    code_postal        text,
    ville              text,
    telephone          text,
    email              text not null,
    animal_souhaite    text,
    composition_foyer  text,
    nombre_enfants     int,
    autres_animaux     text,
    type_logement      text,
    surface_m2         int,
    statut_logement    text,
    accord_proprietaire boolean,
    exterieur          text,
    experience         text,
    budget_veto        text,
    gestion_absences   text,
    frais_acceptes     boolean not null default false,
    motivation         text,
    statut             text not null default 'nouvelle'
        check (statut in ('nouvelle','en_cours','visite_prevue','acceptee','refusee','abandonnee')),
    commentaire_interne text,
    cree_le            timestamptz not null default now()
);

alter table messages_contact enable row level security;
alter table demandes_preadoption enable row level security;

create or replace function envoyer_message_contact(
    p_nom text, p_email text, p_sujet text, p_message text, p_piege text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
    if not module_actif('contact') then
        raise exception 'MODULE_NON_INCLUS : formulaire de contact indisponible.';
    end if;
    if coalesce(p_piege, '') <> '' then return; end if;           -- champ piège anti-robot : on ignore sans erreur
    if btrim(coalesce(p_nom, '')) = '' or btrim(coalesce(p_message, '')) = '' then
        raise exception 'Le nom et le message sont obligatoires';
    end if;
    if p_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Adresse email invalide'; end if;
    if length(p_message) > 4000 or length(coalesce(p_sujet, '')) > 200 or length(p_nom) > 200 then
        raise exception 'Texte trop long';
    end if;
    insert into messages_contact (nom, email, sujet, message)
    values (btrim(p_nom), btrim(p_email), nullif(btrim(coalesce(p_sujet, '')), ''), btrim(p_message));
end; $$;
grant execute on function envoyer_message_contact(text, text, text, text, text) to anon, authenticated;

create or replace function envoyer_preadoption(p jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_txt text;
begin
    if not module_actif('preadoption') then
        raise exception 'MODULE_NON_INCLUS : formulaire de pré-adoption indisponible.';
    end if;
    if coalesce(p->>'piege', '') <> '' then return; end if;
    if btrim(coalesce(p->>'nom', '')) = '' then raise exception 'Le nom est obligatoire'; end if;
    if coalesce(p->>'email', '') !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Adresse email invalide'; end if;
    if length(p::text) > 20000 then raise exception 'Demande trop volumineuse'; end if;
    insert into demandes_preadoption (nom, prenom, adresse, code_postal, ville, telephone, email, animal_souhaite,
        composition_foyer, nombre_enfants, autres_animaux, type_logement, surface_m2, statut_logement,
        accord_proprietaire, exterieur, experience, budget_veto, gestion_absences, frais_acceptes, motivation)
    values (btrim(p->>'nom'), nullif(btrim(coalesce(p->>'prenom','')), ''), nullif(p->>'adresse',''),
        nullif(p->>'code_postal',''), nullif(p->>'ville',''), nullif(p->>'telephone',''), btrim(p->>'email'),
        nullif(p->>'animal_souhaite',''), nullif(p->>'composition_foyer',''),
        nullif(p->>'nombre_enfants','')::int, nullif(p->>'autres_animaux',''), nullif(p->>'type_logement',''),
        nullif(p->>'surface_m2','')::int, nullif(p->>'statut_logement',''),
        nullif(p->>'accord_proprietaire','')::boolean, nullif(p->>'exterieur',''), nullif(p->>'experience',''),
        nullif(p->>'budget_veto',''), nullif(p->>'gestion_absences',''),
        coalesce(nullif(p->>'frais_acceptes','')::boolean, false), nullif(p->>'motivation',''));
end; $$;
grant execute on function envoyer_preadoption(jsonb) to anon, authenticated;

-- Consultation par l'équipe
create or replace function lister_demandes_publiques()
returns jsonb language plpgsql security definer set search_path = public stable as $$
begin
    perform exiger_suivi();
    return jsonb_build_object(
        'messages', coalesce((select jsonb_agg(to_jsonb(m) order by m.cree_le desc) from messages_contact m), '[]'),
        'preadoptions', coalesce((select jsonb_agg(to_jsonb(d) order by d.cree_le desc) from demandes_preadoption d), '[]'));
end; $$;

create or replace function traiter_demande_publique(p_type text, p_id uuid, p_valeur text, p_commentaire text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
    perform exiger_suivi();
    if p_type = 'message' then
        update messages_contact set traite = (p_valeur = 'oui') where id = p_id;
    elsif p_type = 'preadoption' then
        update demandes_preadoption set statut = p_valeur,
            commentaire_interne = coalesce(p_commentaire, commentaire_interne) where id = p_id;
    else
        raise exception 'Type inconnu : %', p_type;
    end if;
end; $$;

-- ============================================================
-- 2. VISITE DE PRÉ-ADOPTION
-- ============================================================
create table if not exists visites_preadoption (
    id                 uuid primary key default gen_random_uuid(),
    demande_id         uuid references demandes_preadoption(id) on delete set null,
    personne_id        uuid references personnes(id),
    animal_id          uuid references animaux(id) on delete set null,
    date_visite        date not null,
    visiteur           text,
    logement_conforme  boolean,
    securisation       text,
    environnement      text,
    presence_autres_animaux text,
    avis               text not null check (avis in ('favorable','reserve','defavorable')),
    commentaires       text,
    saisi_par          uuid references utilisateurs(id) on delete set null,
    cree_le            timestamptz not null default now()
);
alter table visites_preadoption enable row level security;

create or replace function creer_visite_preadoption(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_personne uuid; v_id uuid;
begin
    perform exiger_suivi();
    v_personne := trouver_ou_creer_personne(p);
    insert into visites_preadoption (demande_id, personne_id, animal_id, date_visite, visiteur, logement_conforme,
        securisation, environnement, presence_autres_animaux, avis, commentaires, saisi_par)
    values (nullif(p->>'demande_id','')::uuid, v_personne, nullif(p->>'animal_id','')::uuid,
        coalesce(nullif(p->>'date_visite','')::date, current_date), nullif(p->>'visiteur',''),
        nullif(p->>'logement_conforme','')::boolean, nullif(p->>'securisation',''), nullif(p->>'environnement',''),
        nullif(p->>'presence_autres_animaux',''), p->>'avis', nullif(p->>'commentaires',''),
        valider_saisisseur(nullif(p->>'saisi_par','')::uuid))
    returning id into v_id;
    if nullif(p->>'demande_id','') is not null then
        update demandes_preadoption set statut = 'visite_prevue' where id = (p->>'demande_id')::uuid and statut in ('nouvelle','en_cours');
    end if;
    return v_id;
end; $$;

-- ============================================================
-- 3. SUIVI MÉDICAL (carnet de santé) — étend animaux_soins_veto
-- ============================================================
alter table animaux_soins_veto add column if not exists produit text;
alter table animaux_soins_veto add column if not exists resultat text;
alter table animaux_soins_veto add column if not exists cout numeric(10,2);
alter table animaux_soins_veto add column if not exists saisi_par uuid;
alter table animaux_soins_veto add column if not exists cree_le timestamptz not null default now();

create or replace function creer_soin_veto(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_animal uuid := nullif(p->>'animal_id','')::uuid; v_id uuid; v_date date := coalesce(nullif(p->>'date_soin','')::date, current_date);
begin
    perform exiger_suivi();
    if not module_actif('suivi_medical') then
        raise exception 'MODULE_NON_INCLUS : le module « suivi_medical » n''est pas inclus dans votre offre.' using errcode = 'P0001';
    end if;
    if v_animal is null then raise exception 'Animal obligatoire'; end if;
    if coalesce(p->>'type_soin','') = '' then raise exception 'Type de soin obligatoire'; end if;
    if not exists (select 1 from animaux where id = v_animal) then raise exception 'Animal introuvable'; end if;
    insert into animaux_soins_veto (animal_id, date_soin, type_soin, veterinaire, produit, resultat, description,
        cout, prochain_rappel, facture_id, saisi_par)
    values (v_animal, v_date, p->>'type_soin', nullif(p->>'veterinaire',''), nullif(p->>'produit',''),
        nullif(p->>'resultat',''), nullif(p->>'description',''), nullif(p->>'cout','')::numeric,
        nullif(p->>'prochain_rappel','')::date, nullif(p->>'facture_id','')::uuid,
        valider_saisisseur(nullif(p->>'saisi_par','')::uuid))
    returning id into v_id;
    if p->>'type_soin' = 'sterilisation' then
        insert into animaux_sterilisation (animal_id, sterilise, date_sterilisation)
        values (v_animal, true, v_date)
        on conflict (animal_id) do update set sterilise = true, date_sterilisation = excluded.date_sterilisation, derniere_maj = now();
    end if;
    return v_id;
end; $$;

create or replace function lister_soins_animal(p_animal_id uuid)
returns jsonb language plpgsql security definer set search_path = public stable as $$
begin
    perform exiger_suivi();
    return coalesce((select jsonb_agg(to_jsonb(s) order by s.date_soin desc, s.cree_le desc)
                     from animaux_soins_veto s where s.animal_id = p_animal_id), '[]');
end; $$;

create or replace function lister_rappels_soins(p_jours int default 30)
returns jsonb language plpgsql security definer set search_path = public stable as $$
begin
    perform exiger_suivi();
    return coalesce((select jsonb_agg(jsonb_build_object('animal', a.nom_usuel, 'animal_id', a.id,
                'type_soin', s.type_soin, 'prochain_rappel', s.prochain_rappel, 'statut', a.statut_actuel)
                order by s.prochain_rappel)
            from animaux_soins_veto s join animaux a on a.id = s.animal_id
            where s.prochain_rappel is not null and s.prochain_rappel <= current_date + p_jours
              and coalesce(a.statut_actuel, '') not in ('adopte', 'decede', 'relache')
              and not exists (select 1 from animaux_soins_veto s2
                              where s2.animal_id = s.animal_id and s2.type_soin = s.type_soin and s2.date_soin > s.date_soin)), '[]');
end; $$;

-- ============================================================
-- 4. FAMILLES D'ACCUEIL : profil + fin d'accueil
-- ============================================================
create table if not exists familles_accueil_profils (
    id               uuid primary key default gen_random_uuid(),
    personne_id      uuid not null unique references personnes(id) on delete cascade,
    disponibilite    text,
    capacite         int,
    experience       text,
    animaux_presents text,
    notes            text,
    actif            boolean not null default true,
    maj_le           timestamptz not null default now()
);
alter table familles_accueil_profils enable row level security;

create or replace function enregistrer_profil_famille_accueil(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_personne uuid; v_id uuid;
begin
    perform exiger_suivi();
    v_personne := trouver_ou_creer_personne(p);
    insert into familles_accueil_profils (personne_id, disponibilite, capacite, experience, animaux_presents, notes, actif)
    values (v_personne, nullif(p->>'disponibilite',''), nullif(p->>'capacite','')::int, nullif(p->>'experience',''),
            nullif(p->>'animaux_presents',''), nullif(p->>'notes',''), coalesce(nullif(p->>'actif','')::boolean, true))
    on conflict (personne_id) do update set disponibilite = excluded.disponibilite, capacite = excluded.capacite,
        experience = excluded.experience, animaux_presents = excluded.animaux_presents, notes = excluded.notes,
        actif = excluded.actif, maj_le = now()
    returning id into v_id;
    return v_id;
end; $$;

create or replace function lister_familles_accueil()
returns jsonb language plpgsql security definer set search_path = public stable as $$
begin
    perform exiger_suivi();
    return jsonb_build_object(
      'profils', coalesce((select jsonb_agg(jsonb_build_object('nom', pe.nom, 'prenom', pe.prenom, 'ville', pe.ville,
            'telephone', pe.telephone, 'capacite', f.capacite, 'disponibilite', f.disponibilite, 'actif', f.actif,
            'en_cours', (select count(*) from familles_accueil fa where fa.personne_id = f.personne_id and fa.date_fin is null))
            order by pe.nom) from familles_accueil_profils f join personnes pe on pe.id = f.personne_id), '[]'),
      'accueils_en_cours', coalesce((select jsonb_agg(jsonb_build_object('id', fa.id, 'animal', a.nom_usuel,
            'famille', trim(coalesce(pe.prenom, '') || ' ' || coalesce(pe.nom, '')), 'depuis', fa.date_debut, 'type', fa.type_accueil)
            order by fa.date_debut) from familles_accueil fa
            left join animaux a on a.id = fa.animal_id left join personnes pe on pe.id = fa.personne_id
            where fa.date_fin is null), '[]'));
end; $$;

create or replace function terminer_accueil(p_accueil_id uuid, p_date_fin date, p_nouveau_statut text default null,
                                            p_motif text default null, p_saisi_par_id uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_animal uuid;
begin
    perform exiger_suivi();
    select animal_id into v_animal from familles_accueil where id = p_accueil_id and date_fin is null;
    if not found then raise exception 'Accueil introuvable ou déjà terminé.'; end if;
    update familles_accueil set date_fin = coalesce(p_date_fin, current_date) where id = p_accueil_id;
    if v_animal is not null and p_nouveau_statut is not null and p_nouveau_statut <> '' then
        perform changer_statut_animal(v_animal, p_nouveau_statut, coalesce(p_date_fin, current_date), p_motif, p_saisi_par_id);
    end if;
end; $$;

-- ============================================================
-- 5. RESTITUTION d'un animal adopté
-- ============================================================
create table if not exists restitutions (
    id               uuid primary key default gen_random_uuid(),
    animal_id        uuid not null references animaux(id),
    adoption_id      uuid references adoptions(id) on delete set null,
    personne_id      uuid references personnes(id),
    date_restitution date not null,
    motif            text not null,
    etat_sante       text,
    montant_rembourse numeric(10,2),
    commentaires     text,
    saisi_par        uuid references utilisateurs(id) on delete set null,
    cree_le          timestamptz not null default now()
);
alter table restitutions enable row level security;

-- Changement de statut réservé à la restitution (adopté -> adoptable), sans toucher à la
-- table des transitions manuelles (un animal adopté reste « final » partout ailleurs).
create or replace function creer_restitution(p_animal_id uuid, p_date date, p_motif text,
        p_etat_sante text default null, p_montant_rembourse numeric default null,
        p_commentaires text default null, p_saisi_par_id uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_statut text; v_ad record; v_id uuid; v_date date := coalesce(p_date, current_date); v_user uuid;
begin
    perform exiger_suivi();
    if btrim(coalesce(p_motif, '')) = '' then raise exception 'Le motif est obligatoire'; end if;
    select statut_actuel into v_statut from animaux where id = p_animal_id;
    if not found then raise exception 'Animal introuvable.'; end if;
    if v_statut is distinct from 'adopte' then
        raise exception 'Seul un animal au statut « adopté » peut être restitué (statut actuel : %).', coalesce(v_statut, 'aucun');
    end if;
    v_user := valider_saisisseur(p_saisi_par_id);
    select id, personne_id into v_ad from adoptions where animal_id = p_animal_id order by date_adoption desc nulls last limit 1;
    insert into restitutions (animal_id, adoption_id, personne_id, date_restitution, motif, etat_sante,
                              montant_rembourse, commentaires, saisi_par)
    values (p_animal_id, v_ad.id, v_ad.personne_id, v_date, btrim(p_motif), p_etat_sante, p_montant_rembourse, p_commentaires, v_user)
    returning id into v_id;
    update animaux_statuts_historique set date_fin = v_date where animal_id = p_animal_id and date_fin is null;
    insert into animaux_statuts_historique (animal_id, statut, date_debut, motif, saisi_par)
    values (p_animal_id, 'adoptable', v_date, 'Restitution : ' || btrim(p_motif), v_user);
    update animaux set statut_actuel = 'adoptable' where id = p_animal_id;
    return v_id;
end; $$;

-- ============================================================
-- 6. DÉCÈS / SORTIE d'un animal
-- ============================================================
create table if not exists sorties_animaux (
    id            uuid primary key default gen_random_uuid(),
    animal_id     uuid not null references animaux(id),
    type_sortie   text not null check (type_sortie in ('deces','euthanasie','relache','transfert')),
    date_sortie   date not null,
    cause         text,
    destination   text,
    commentaires  text,
    saisi_par     uuid references utilisateurs(id) on delete set null,
    cree_le       timestamptz not null default now()
);
alter table sorties_animaux enable row level security;

create or replace function creer_sortie_animal(p_animal_id uuid, p_type_sortie text, p_date date,
        p_cause text default null, p_destination text default null, p_commentaires text default null,
        p_saisi_par_id uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_date date := coalesce(p_date, current_date); v_statut text;
begin
    perform exiger_suivi();
    if p_type_sortie in ('deces', 'euthanasie') then v_statut := 'decede';
    elsif p_type_sortie in ('relache', 'transfert') then v_statut := 'relache';
    else raise exception 'Type de sortie inconnu : %', p_type_sortie; end if;
    -- Valide la transition ; refuse si elle n'est pas autorisée depuis le statut actuel.
    perform changer_statut_animal(p_animal_id, v_statut, v_date,
        p_type_sortie || coalesce(' — ' || nullif(p_cause, ''), '') || coalesce(' → ' || nullif(p_destination, ''), ''),
        p_saisi_par_id);
    if v_statut = 'decede' then update animaux set date_deces = v_date where id = p_animal_id; end if;
    insert into sorties_animaux (animal_id, type_sortie, date_sortie, cause, destination, commentaires, saisi_par)
    values (p_animal_id, p_type_sortie, v_date, p_cause, p_destination, p_commentaires, valider_saisisseur(p_saisi_par_id))
    returning id into v_id;
    return v_id;
end; $$;

-- ============================================================
-- 7. NOTES DE FRAIS (bénévoles et familles d'accueil)
-- ============================================================
create table if not exists notes_frais (
    id                 uuid primary key default gen_random_uuid(),
    personne_id        uuid not null references personnes(id),
    date_frais         date not null,
    categorie          text not null,
    description        text,
    montant            numeric(10,2) not null check (montant > 0),
    kilometres         numeric(8,1),
    animal_id          uuid references animaux(id) on delete set null,
    justificatif_url   text,
    statut             text not null default 'a_valider' check (statut in ('a_valider','validee','refusee','remboursee')),
    date_remboursement date,
    mode_remboursement text,
    commentaire        text,
    saisi_par          uuid references utilisateurs(id) on delete set null,
    cree_le            timestamptz not null default now()
);
alter table notes_frais enable row level security;

create or replace function creer_note_frais(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_pers uuid; v_id uuid;
begin
    perform exiger_suivi();
    v_pers := trouver_ou_creer_personne(p);
    if coalesce(nullif(p->>'montant','')::numeric, 0) <= 0 then raise exception 'Le montant doit être positif'; end if;
    insert into notes_frais (personne_id, date_frais, categorie, description, montant, kilometres, animal_id, justificatif_url, saisi_par)
    values (v_pers, coalesce(nullif(p->>'date_frais','')::date, current_date), coalesce(nullif(p->>'categorie',''), 'Autre'),
            nullif(p->>'description',''), (p->>'montant')::numeric, nullif(p->>'kilometres','')::numeric,
            nullif(p->>'animal_id','')::uuid, nullif(p->>'justificatif_url',''),
            valider_saisisseur(nullif(p->>'saisi_par','')::uuid))
    returning id into v_id;
    return v_id;
end; $$;

create or replace function changer_statut_note_frais(p_id uuid, p_statut text, p_date_remboursement date default null,
        p_mode text default null, p_commentaire text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
    perform exiger_suivi();
    if p_statut not in ('a_valider','validee','refusee','remboursee') then raise exception 'Statut inconnu'; end if;
    update notes_frais set statut = p_statut,
        date_remboursement = case when p_statut = 'remboursee' then coalesce(p_date_remboursement, current_date) else null end,
        mode_remboursement = case when p_statut = 'remboursee' then p_mode else null end,
        commentaire = coalesce(p_commentaire, commentaire)
    where id = p_id;
end; $$;

create or replace function lister_notes_frais()
returns jsonb language plpgsql security definer set search_path = public stable as $$
begin
    perform exiger_suivi();
    return coalesce((select jsonb_agg(jsonb_build_object('id', n.id, 'date_frais', n.date_frais,
        'personne', trim(coalesce(pe.prenom, '') || ' ' || coalesce(pe.nom, '')), 'categorie', n.categorie,
        'description', n.description, 'montant', n.montant, 'kilometres', n.kilometres, 'animal', a.nom_usuel,
        'justificatif_url', n.justificatif_url, 'statut', n.statut, 'date_remboursement', n.date_remboursement)
        order by n.date_frais desc, n.cree_le desc)
        from notes_frais n join personnes pe on pe.id = n.personne_id left join animaux a on a.id = n.animal_id), '[]');
end; $$;

-- ============================================================
-- 8. PARRAINAGE et BOUTIQUE (ventes d'objets)
-- ============================================================
create table if not exists parrainages (
    id           uuid primary key default gen_random_uuid(),
    personne_id  uuid not null references personnes(id),
    animal_id    uuid references animaux(id) on delete set null,
    montant      numeric(10,2) not null check (montant > 0),
    periodicite  text not null default 'mensuel' check (periodicite in ('mensuel','trimestriel','annuel','ponctuel')),
    mode_paiement text,
    date_debut   date not null,
    date_fin     date,
    commentaires text,
    saisi_par    uuid references utilisateurs(id) on delete set null,
    cree_le      timestamptz not null default now()
);
create table if not exists ventes_boutique (
    id             uuid primary key default gen_random_uuid(),
    date_vente     date not null,
    personne_id    uuid references personnes(id) on delete set null,
    article        text not null,
    quantite       int not null default 1 check (quantite > 0),
    prix_unitaire  numeric(10,2) not null check (prix_unitaire >= 0),
    montant_total  numeric(10,2) generated always as (quantite * prix_unitaire) stored,
    mode_paiement  text,
    commentaires   text,
    saisi_par      uuid references utilisateurs(id) on delete set null,
    cree_le        timestamptz not null default now()
);
alter table parrainages enable row level security;
alter table ventes_boutique enable row level security;

create or replace function creer_parrainage(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_pers uuid; v_id uuid;
begin
    perform exiger_suivi();
    v_pers := trouver_ou_creer_personne(p);
    insert into parrainages (personne_id, animal_id, montant, periodicite, mode_paiement, date_debut, commentaires, saisi_par)
    values (v_pers, nullif(p->>'animal_id','')::uuid, (p->>'montant')::numeric, coalesce(nullif(p->>'periodicite',''), 'mensuel'),
            nullif(p->>'mode_paiement',''), coalesce(nullif(p->>'date_debut','')::date, current_date), nullif(p->>'commentaires',''),
            valider_saisisseur(nullif(p->>'saisi_par','')::uuid))
    returning id into v_id;
    return v_id;
end; $$;

create or replace function terminer_parrainage(p_id uuid, p_date_fin date default current_date)
returns void language plpgsql security definer set search_path = public as $$
begin
    perform exiger_suivi();
    update parrainages set date_fin = coalesce(p_date_fin, current_date) where id = p_id;
end; $$;

create or replace function lister_parrainages()
returns jsonb language plpgsql security definer set search_path = public stable as $$
begin
    perform exiger_suivi();
    return coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'parrain', trim(coalesce(pe.prenom, '') || ' ' || coalesce(pe.nom, '')),
        'animal', a.nom_usuel, 'montant', r.montant, 'periodicite', r.periodicite, 'date_debut', r.date_debut, 'date_fin', r.date_fin)
        order by (r.date_fin is not null), r.date_debut desc)
        from parrainages r join personnes pe on pe.id = r.personne_id left join animaux a on a.id = r.animal_id), '[]');
end; $$;

create or replace function creer_vente_boutique(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_pers uuid; v_id uuid;
begin
    perform exiger_suivi();
    if btrim(coalesce(p->>'article', '')) = '' then raise exception 'L''article est obligatoire'; end if;
    if btrim(coalesce(p->>'nom', '')) <> '' then v_pers := trouver_ou_creer_personne(p); end if;
    insert into ventes_boutique (date_vente, personne_id, article, quantite, prix_unitaire, mode_paiement, commentaires, saisi_par)
    values (coalesce(nullif(p->>'date_vente','')::date, current_date), v_pers, btrim(p->>'article'),
            coalesce(nullif(p->>'quantite','')::int, 1), (p->>'prix_unitaire')::numeric, nullif(p->>'mode_paiement',''),
            nullif(p->>'commentaires',''), valider_saisisseur(nullif(p->>'saisi_par','')::uuid))
    returning id into v_id;
    return v_id;
end; $$;

create or replace function lister_ventes_boutique()
returns jsonb language plpgsql security definer set search_path = public stable as $$
begin
    perform exiger_suivi();
    return coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'date_vente', v.date_vente, 'article', v.article,
        'quantite', v.quantite, 'prix_unitaire', v.prix_unitaire, 'montant_total', v.montant_total, 'mode_paiement', v.mode_paiement,
        'client', trim(coalesce(pe.prenom, '') || ' ' || coalesce(pe.nom, ''))) order by v.date_vente desc, v.cree_le desc)
        from ventes_boutique v left join personnes pe on pe.id = v.personne_id), '[]');
end; $$;
