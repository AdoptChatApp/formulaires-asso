// ============================================================
// Edge Function "envoyer-mail-formulaire"
// ============================================================
// Envoie, via Brevo, le mail d'un formulaire (avec son PDF en pièce
// jointe) à l'association, au bureau et — si une adresse valide est
// fournie — à la personne concernée.
// Remplace la fonction sendMailBrevo() de l'ancien Apps Script.
//
// Secrets à définir (Supabase → Edge Functions → Secrets, ou
//   supabase secrets set BREVO_API_KEY=... EMAIL_ASSOCIATION=... ) :
//   BREVO_API_KEY      — clé API Brevo (commence par « xkeysib- »)
//   EMAIL_ASSOCIATION  — adresse expéditrice, vérifiée dans Brevo (ex. compta@votre-asso.fr)
//   EMAIL_BUREAU       — (facultatif) 2e adresse interne en copie
//   NOM_ASSOCIATION    — nom affiché comme expéditeur (ex. « Association Les Amis des Chats »)
// (SUPABASE_URL et SUPABASE_ANON_KEY sont fournis automatiquement.)
//
// Déploiement : supabase functions deploy envoyer-mail-formulaire
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const BREVO_API_KEY = Deno.env.get('BREVO_API_KEY');
const EMAIL_ASSOCIATION = Deno.env.get('EMAIL_ASSOCIATION');
const EMAIL_BUREAU = Deno.env.get('EMAIL_BUREAU');
const NOM_ASSOCIATION = Deno.env.get('NOM_ASSOCIATION') || 'Association';

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

Deno.serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });
    if (req.method !== 'POST') return jsonResponse({ ok: false, error: 'Méthode non autorisée.' }, 405);

    if (!BREVO_API_KEY || !EMAIL_ASSOCIATION) {
        console.error('envoyer-mail-formulaire: secrets BREVO_API_KEY / EMAIL_ASSOCIATION manquants.');
        return jsonResponse({ ok: false, error: "Envoi de mail non configuré côté serveur (secrets Brevo manquants)." }, 500);
    }

    try {
        // Seule une personne connectée peut déclencher un envoi.
        const authHeader = req.headers.get('Authorization') || '';
        const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authHeader } } });
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) return jsonResponse({ ok: false, error: 'Session expirée — reconnectez-vous puis réessayez.' }, 401);

        const { sujet, corps, pdfBase64, pdfNomFichier, emailClient, nomClient } = await req.json();
        if (!sujet || !corps) return jsonResponse({ ok: false, error: 'Sujet ou contenu manquant.' }, 400);

        // Destinataires : l'association, le bureau (si défini), puis la personne concernée.
        const destinataires: { email: string; name: string }[] = [{ email: EMAIL_ASSOCIATION, name: `${NOM_ASSOCIATION} - Compta` }];
        if (EMAIL_BUREAU && EMAIL_BUREAU !== EMAIL_ASSOCIATION) destinataires.push({ email: EMAIL_BUREAU, name: `${NOM_ASSOCIATION} - Bureau` });
        const client = (emailClient || '').trim();
        if (client && EMAIL_REGEX.test(client) && !destinataires.some((d) => d.email.toLowerCase() === client.toLowerCase())) {
            destinataires.push({ email: client, name: (nomClient || '').trim() || client });
        }

        const payload: Record<string, unknown> = {
            sender: { email: EMAIL_ASSOCIATION, name: NOM_ASSOCIATION },
            to: destinataires,
            subject: String(sujet).slice(0, 300),
            textContent: String(corps),
        };
        if (pdfBase64 && pdfNomFichier) payload.attachment = [{ content: pdfBase64, name: pdfNomFichier }];

        const resp = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: { 'api-key': BREVO_API_KEY, 'Content-Type': 'application/json', accept: 'application/json' },
            body: JSON.stringify(payload),
        });
        if (resp.status !== 201) {
            const detail = await resp.text();
            console.error('Erreur Brevo', resp.status, detail);
            return jsonResponse({ ok: false, error: `Brevo a refusé l'envoi (code ${resp.status}). Vérifiez l'expéditeur validé et la clé API.` }, 502);
        }
        return jsonResponse({ ok: true, destinataires: destinataires.map((d) => d.email) });
    } catch (e) {
        console.error('envoyer-mail-formulaire', e);
        return jsonResponse({ ok: false, error: 'Erreur interne lors de l\'envoi.' }, 500);
    }
});
