-- Autorise les périodes nommées « 2026 » (année seule) en plus de « 2026 - 2027 ».
create or replace function ajouter_periode(p_periode text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_actuelles jsonb;
begin
    if role_compta_courant() <> 'admin' then raise exception 'Accès refusé : réservé aux comptes admin.'; end if;
    if p_periode !~ '^\d{4}( - \d{4})?$' then
        raise exception 'Format invalide, attendu "2026" ou "2026 - 2027".';
    end if;
    select valeur into v_actuelles from config_compta where cle = 'periodes';
    v_actuelles := coalesce(v_actuelles, '[]'::jsonb);
    if v_actuelles ? p_periode then
        raise exception 'Cette période existe déjà.';
    end if;
    v_actuelles := v_actuelles || to_jsonb(p_periode);
    insert into config_compta (cle, valeur) values ('periodes', v_actuelles)
        on conflict (cle) do update set valeur = excluded.valeur, maj_le = now();
end;
$$;
notify pgrst, 'reload schema';
