// RELAIS CAPRICORNE — à coller dans un "Worker" Cloudflare (gratuit).
//
// À quoi il sert : il garde ta clé Gemini chez Cloudflare. Les lunettes lui parlent avec un
// simple code ; lui ajoute la clé et transmet à Google. Ta clé n'est donc jamais sur les
// lunettes, ni dans le QR code, ni sur GitHub.
//
// Il a besoin de deux "secrets" (Paramètres du Worker > Variables et secrets) :
//   GEMINI_KEY : ta clé Gemini (AIza… ou AQ.…)
//   CODE       : un mot de passe inventé par toi (long, sans espace), le même que dans le QR code
//
// Il ne laisse passer QUE les demandes de Capricorne à Gemini (liste des modèles et réponses).

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, x-capricorne-code',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

const refus = (status, message) =>
  new Response(JSON.stringify({ error: { message } }), { status, headers: { ...CORS, 'content-type': 'application/json' } });

export default {
  async fetch(requete, env) {
    if (requete.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (!env.GEMINI_KEY || !env.CODE) return refus(500, 'relais pas configuré : il manque GEMINI_KEY ou CODE');
    if (requete.headers.get('x-capricorne-code') !== env.CODE) return refus(401, 'code refusé');

    const adresse = new URL(requete.url);
    const autorise = /^\/v1beta\/models(\/[\w.-]+:(generateContent|streamGenerateContent))?$/.test(adresse.pathname);
    if (!autorise || !['GET', 'POST'].includes(requete.method)) return refus(404, 'chemin inconnu');

    const reponse = await fetch('https://generativelanguage.googleapis.com' + adresse.pathname + adresse.search, {
      method: requete.method,
      headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_KEY },
      body: requete.method === 'POST' ? requete.body : undefined,
    });
    const entetes = new Headers(reponse.headers);
    for (const [k, v] of Object.entries(CORS)) entetes.set(k, v);
    return new Response(reponse.body, { status: reponse.status, headers: entetes });   // en flux : mot à mot
  },
};
