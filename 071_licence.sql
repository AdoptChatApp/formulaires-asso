-- ============================================================
-- 071_licence.sql — OFFRES COMMERCIALES (Essentiel / Standard / Complète)
-- ============================================================
-- Principe :
--   * la table « licence » (1 seule ligne) contient l'offre souscrite ;
--   * la table « licence_modules » liste chaque module et l'offre minimale ;
--   * des déclencheurs (triggers) BEFORE INSERT/UPDATE refusent toute
--     écriture dans les tables d'un module hors offre, quel que soit le
--     chemin (page, API, fonction RPC) ;
--   * les pages interrogent obtenir_licence() pour afficher le popup
--     « Ce formulaire est inclus dans l'offre … ».
--
-- CHANGER D'OFFRE (à faire dans l'éditeur SQL Supabase, rôle postgres) :
--     select definir_licence('essentiel');   -- ou 'standard' / 'complete'
--
-- Limite : le propriétaire du projet Supabase conserve les droits
-- d'administration de sa base. Pour une garantie totale, il faudra un
-- serveur de licences géré par le vendeur (évolution prévue).
-- ============================================================

create table if not exists licence (
    id           int primary key default 1 check (id = 1),
    offre        text not null default 'essentiel' check (offre in ('essentiel', 'standard', 'complete')),
    modifie_le   timestamptz not null default now()
);
insert into licence (id, offre) values (1, 'complete') on conflict (id) do nothing;

create table if not exists licence_modules (
    module     text primary key,
    libelle    text not null,
    offre_min  text not null check (offre_min in ('essentiel', 'standard', 'complete'))
);

-- Verrouillées : aucun accès direct par l'API, uniquement via les fonctions ci-dessous.
alter table licence enable row level security;
alter table licence_modules enable row level security;

insert into licence_modules (module, libelle, offre_min) values
    ('animaux',          'Fiches et statuts des animaux',                'essentiel'),
    ('adoption',         'Contrat d''adoption et dossier',               'essentiel'),
    ('reservation',      'Contrat de réservation',                       'essentiel'),
    ('certificat',       'Certificat d''engagement et de connaissance',  'essentiel'),
    ('adhesion',         'Bulletin d''adhésion',                         'essentiel'),
    ('don',              'Dons',                                         'essentiel'),
    ('contact',          'Formulaire de contact',                        'essentiel'),
    ('preadoption',      'Questionnaire de pré-adoption',                'essentiel'),
    ('recu_fiscal',      'Reçus fiscaux',                                'standard'),
    ('accueil',          'Familles d''accueil',                          'standard'),
    ('depot_abandon',    'Dépôt de chat et abandon',                     'standard'),
    ('attestations',     'Attestations et décharges',                    'standard'),
    ('materiel',         'Prêt et retour de matériel',                   'standard'),
    ('icad',             'Suivi ICAD et stérilisation',                  'standard'),
    ('rapports',         'Rapports et statistiques animaux',             'standard'),
    ('visite',           'Visite de pré-adoption',                       'standard'),
    ('restitution',      'Restitution d''un animal adopté',              'standard'),
    ('sortie',           'Décès et sortie d''un animal',                 'standard'),
    ('compta',           'Comptabilité (banques, caisses, chèques, factures)', 'complete'),
    ('suivi_medical',    'Suivi médical / carnet de santé',              'complete'),
    ('notes_frais',      'Notes de frais bénévoles',                     'complete'),
    ('parrainage',       'Parrainage et boutique',                       'complete')
on conflict (module) do update set libelle = excluded.libelle, offre_min = excluded.offre_min;

create or replace function rang_offre(p_offre text)
returns int language sql immutable as $$
    select case p_offre when 'essentiel' then 1 when 'standard' then 2 when 'complete' then 3 else 0 end;
$$;

create or replace function module_actif(p_module text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
    select coalesce((
        select rang_offre(l.offre) >= rang_offre(m.offre_min)
        from licence l, licence_modules m
        where l.id = 1 and m.module = p_module
    ), false);
$$;

-- Lecture publique (aucune donnée sensible) : offre + état de chaque module.
create or replace function obtenir_licence()
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
    select jsonb_build_object(
        'offre', (select offre from licence where id = 1),
        'modules', coalesce((
            select jsonb_agg(jsonb_build_object(
                'module', m.module, 'libelle', m.libelle, 'offre_min', m.offre_min,
                'actif', module_actif(m.module)) order by m.module)
            from licence_modules m), '[]'::jsonb)
    );
$$;
grant execute on function obtenir_licence() to anon, authenticated;
grant execute on function module_actif(text) to anon, authenticated;

-- Changement d'offre : réservé au rôle postgres (éditeur SQL), JAMAIS exposé à l'API.
create or replace function definir_licence(p_offre text)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
    if p_offre not in ('essentiel', 'standard', 'complete') then
        raise exception 'Offre inconnue : % (attendu essentiel, standard ou complete)', p_offre;
    end if;
    update licence set offre = p_offre, modifie_le = now() where id = 1;
    return 'Offre active : ' || p_offre;
end;
$$;
revoke all on function definir_licence(text) from public, anon, authenticated;

-- Déclencheur commun : refuse l'écriture si le module n'est pas dans l'offre.
create or replace function verifier_module()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if not module_actif(tg_argv[0]) then
        raise exception 'MODULE_NON_INCLUS : le module « % » n''est pas inclus dans votre offre.', tg_argv[0]
            using errcode = 'P0001';
    end if;
    return new;
end;
$$;

-- Pose du déclencheur sur chaque table de chaque module (ignore les tables absentes).
create or replace function appliquer_licence_tables(p_module text, p_tables text[])
returns void
language plpgsql
as $$
declare t text;
begin
    foreach t in array p_tables loop
        if to_regclass('public.' || t) is not null then
            execute format('drop trigger if exists trg_licence on %I', t);
            execute format('create trigger trg_licence before insert or update on %I
                            for each row execute function verifier_module(%L)', t, p_module);
        end if;
    end loop;
end;
$$;
revoke all on function appliquer_licence_tables(text, text[]) from public, anon, authenticated;
