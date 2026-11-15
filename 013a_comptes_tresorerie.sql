-- ============================================================
-- 013a_comptes_tresorerie.sql — BANQUES ET CAISSES ILLIMITÉES
-- ============================================================
-- Remplace les comptes figés « banque / caisse1 / caisse2 » par une table
-- paramétrable : une association peut avoir autant de comptes bancaires
-- et de caisses qu'elle veut (créés dans Configuration).
-- Les 3 comptes d'origine sont conservés (codes inchangés) pour rester
-- compatibles avec les anciennes installations.
-- À exécuter avant 014_schema_compta.sql.
-- ============================================================
create table if not exists comptes_tresorerie (
    code     text primary key,
    libelle  text not null,
    type     text not null check (type in ('banque', 'caisse')),
    ordre    int  not null default 100,
    actif    boolean not null default true
);

insert into comptes_tresorerie (code, libelle, type, ordre) values
    ('banque',  'Banque',   'banque', 1),
    ('caisse1', 'Caisse 1', 'caisse', 2),
    ('caisse2', 'Caisse 2', 'caisse', 3)
on conflict (code) do nothing;

create or replace function compte_existe(p_code text)
returns boolean language plpgsql stable security definer set search_path = public as $$
begin return exists (select 1 from comptes_tresorerie where code = p_code); end; $$;

create or replace function compte_est_banque(p_code text)
returns boolean language plpgsql stable security definer set search_path = public as $$
begin return exists (select 1 from comptes_tresorerie where code = p_code and type = 'banque'); end; $$;

create or replace function compte_est_caisse(p_code text)
returns boolean language plpgsql stable security definer set search_path = public as $$
begin return exists (select 1 from comptes_tresorerie where code = p_code and type = 'caisse'); end; $$;
