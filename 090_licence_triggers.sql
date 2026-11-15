-- ============================================================
-- 090_licence_triggers.sql — À EXÉCUTER EN DERNIER (après 071 et 072)
-- Relie chaque module de l'offre aux tables qu'il alimente : toute
-- écriture dans ces tables est refusée si le module n'est pas inclus
-- dans l'offre (voir 071_licence.sql). Rejouable sans risque.
-- Remarque : animaux_soins_veto n'est volontairement pas verrouillée
-- (le contrat d'adoption y enregistre les vaccins) ; le suivi médical
-- est protégé dans creer_soin_veto().
-- ============================================================
select appliquer_licence_tables('adoption',      array['adoptions','adoptions_cheques','adoption_pieces']);
select appliquer_licence_tables('reservation',   array['reservations','reservations_cheques']);
select appliquer_licence_tables('certificat',    array['certificats_engagement']);
select appliquer_licence_tables('adhesion',      array['adhesions','adhesions_cheques']);
select appliquer_licence_tables('don',           array['dons','dons_cheques']);
select appliquer_licence_tables('contact',       array['messages_contact']);
select appliquer_licence_tables('preadoption',   array['demandes_preadoption']);
select appliquer_licence_tables('recu_fiscal',   array['compteurs_recus_fiscaux']);
select appliquer_licence_tables('accueil',       array['familles_accueil','familles_accueil_profils']);
select appliquer_licence_tables('depot_abandon', array['depots_chat','depot_chat_animaux','abandons']);
select appliquer_licence_tables('attestations',  array['attestations']);
select appliquer_licence_tables('materiel',      array['materiel_mouvements']);
select appliquer_licence_tables('icad',          array['icad_suivi']);
select appliquer_licence_tables('visite',        array['visites_preadoption']);
select appliquer_licence_tables('restitution',   array['restitutions']);
select appliquer_licence_tables('sortie',        array['sorties_animaux']);
select appliquer_licence_tables('compta',        array['banque_mouvements','caisse_mouvements','caisse_physique_comptages',
    'cheques','remises_cheques','remise_cheques_details','factures','ecritures_diverses','import_rapprochement',
    'banque_mouvement_facture_liens','banque_mouvement_suivi_liens','caisse_mouvement_suivi_liens']);
select appliquer_licence_tables('notes_frais',   array['notes_frais']);
select appliquer_licence_tables('parrainage',    array['parrainages','ventes_boutique']);
