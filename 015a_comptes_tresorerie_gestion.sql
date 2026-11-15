-- ============================================================
-- 015a_comptes_tresorerie_gestion.sql — droits et gestion des comptes
-- (nécessite role_compta_courant() défini dans 015)
-- ============================================================
alter table comptes_tresorerie enable row level security;
drop policy if exists comptes_tresorerie_select on comptes_tresorerie;
create policy comptes_tresorerie_select on comptes_tresorerie for select using (role_compta_courant() is not null);

-- Crée une banque ou une caisse. Le code est généré (banque2, banque3… / caisse3, caisse4…).
create or replace function creer_compte_tresorerie(p_libelle text, p_type text)
returns text language plpgsql security definer set search_path = public as $$
declare v_n int := 1; v_code text; v_ordre int;
begin
    if role_compta_courant() <> 'admin' then raise exception 'Accès refusé : réservé aux comptes admin.'; end if;
    if p_type not in ('banque', 'caisse') then raise exception 'Type inconnu : % (banque ou caisse)', p_type; end if;
    if btrim(coalesce(p_libelle, '')) = '' then raise exception 'Le nom du compte est obligatoire'; end if;
    loop
        v_n := v_n + 1;
        v_code := p_type || v_n;
        exit when not exists (select 1 from comptes_tresorerie where code = v_code);
    end loop;
    select coalesce(max(ordre), 0) + 1 into v_ordre from comptes_tresorerie;
    insert into comptes_tresorerie (code, libelle, type, ordre) values (v_code, btrim(p_libelle), p_type, v_ordre);
    insert into journal_audit_compta (user_email, action, onglet, ligne_ref, detail)
    values (auth.jwt() ->> 'email', 'AJOUT', 'comptes_tresorerie', v_code, btrim(p_libelle));
    return v_code;
end; $$;

create or replace function modifier_compte_tresorerie(p_code text, p_libelle text, p_actif boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
    if role_compta_courant() <> 'admin' then raise exception 'Accès refusé : réservé aux comptes admin.'; end if;
    if btrim(coalesce(p_libelle, '')) = '' then raise exception 'Le nom du compte est obligatoire'; end if;
    update comptes_tresorerie set libelle = btrim(p_libelle), actif = coalesce(p_actif, actif) where code = p_code;
    if not found then raise exception 'Compte introuvable'; end if;
    insert into journal_audit_compta (user_email, action, onglet, ligne_ref, detail)
    values (auth.jwt() ->> 'email', 'MODIF', 'comptes_tresorerie', p_code, btrim(p_libelle));
end; $$;

-- Solde initial d'un compte quelconque (remplace enregistrer_soldes_initiaux, qui reste disponible).
create or replace function enregistrer_solde_initial(p_periode text, p_compte text, p_montant numeric)
returns void language plpgsql security definer set search_path = public as $$
begin
    if role_compta_courant() <> 'admin' then raise exception 'Accès refusé : réservé aux comptes admin.'; end if;
    if not compte_existe(p_compte) then raise exception 'Compte inconnu : %', p_compte; end if;
    insert into soldes (periode, compte, type_solde, montant) values (p_periode, p_compte, 'initial', coalesce(p_montant, 0))
    on conflict (periode, compte, type_solde) do update set montant = excluded.montant;
end; $$;
