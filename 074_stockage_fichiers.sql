-- ============================================================
-- 074_stockage_fichiers.sql
-- Stockage des fichiers dans Supabase Storage (remplace Google Drive).
--
-- Dossier "documents" : PDF des formulaires, photos et pièces
-- justificatives, factures, certificats ICAD.
--
-- SÉCURITÉ (dossier PRIVÉ) :
--   - le dossier n'est PAS public : une adresse de fichier ne
--     fonctionne jamais sans être connecté ;
--   - lecture et dépôt réservés aux comptes du site (Suivi ou Compta,
--     tables profils_suivi / profils_compta) ;
--   - aucune règle de modification / suppression depuis le site ;
--   - la page « Archives » liste les fichiers via la fonction
--     lister_documents(), réservée aux mêmes comptes.
-- Les fichiers déjà déposés deviennent privés dès l'exécution.
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
    'documents', 'documents', false, 20971520,
    array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif']
)
on conflict (id) do update
    set public = false,
        file_size_limit = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "documents_depot_connectes" on storage.objects;
drop policy if exists "documents_depot_autorises" on storage.objects;
create policy "documents_depot_autorises" on storage.objects
    for insert to authenticated
    with check (
        bucket_id = 'documents'
        and (public.role_suivi_courant() is not null or public.role_compta_courant() is not null)
    );

drop policy if exists "documents_lecture_autorises" on storage.objects;
create policy "documents_lecture_autorises" on storage.objects
    for select to authenticated
    using (
        bucket_id = 'documents'
        and (public.role_suivi_courant() is not null or public.role_compta_courant() is not null)
    );

-- Liste des fichiers pour la page « Archives » (réservée aux comptes autorisés).
create or replace function lister_documents()
returns table (chemin text, cree_le timestamptz, taille bigint, type_mime text)
language plpgsql
security definer
set search_path = public, storage
stable
as $$
begin
    if role_suivi_courant() is null and role_compta_courant() is null then
        raise exception 'Accès refusé';
    end if;
    return query
        select o.name::text, o.created_at, nullif(o.metadata->>'size', '')::bigint, (o.metadata->>'mimetype')::text
        from storage.objects o
        where o.bucket_id = 'documents'
        order by o.created_at desc
        limit 5000;
end;
$$;
revoke all on function lister_documents() from public, anon;
grant execute on function lister_documents() to authenticated;

notify pgrst, 'reload schema';
