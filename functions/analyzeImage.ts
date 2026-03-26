// ════════════════════════════════════════════════════════════════════════
// BACKEND — Firebase Cloud Function (ou Express endpoint)
// Fichier: functions/src/analyzeImage.ts
//
// Pourquoi ? L'API Anthropic ne peut pas être appelée directement
// depuis un navigateur (pas de clé API exposée, pas de CORS).
// Ce backend reçoit l'image en base64, appelle Claude, et renvoie le JSON.
// ════════════════════════════════════════════════════════════════════════

import * as functions from 'firebase-functions';

// ── Si tu utilises Express à la place ───────────────────────────────────
// import express from 'express';
// const router = express.Router();
// router.post('/api/analyze-image', analyzeImageHandler);

export const analyzeImage = functions.https.onRequest(async (req, res) => {
  // CORS
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(204).send(''); return; }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { image, mediaType, cropType, dayOffset, zone, stageDescription } = req.body;

  if (!image || !cropType) {
    res.status(400).json({ error: 'image et cropType requis' });
    return;
  }

  const cropNames: Record<string, string> = {
    tomato: 'Tomate', millet: 'Mil', onion: 'Oignon',
    rice: 'Riz', corn: 'Maïs', cassava: 'Manioc',
  };
  const cropFr = cropNames[cropType] || cropType;

  const prompt = `Tu es un expert agronome spécialisé en Afrique subsaharienne (zone: ${zone || 'default'}).
Analyse cette photo de culture dans le cadre d'un système de certification agricole.

CONTEXTE:
- Culture: ${cropFr}
- Jour depuis plantation/semis: J+${dayOffset}
- Stade attendu à ce jour: ${stageDescription}

Réponds UNIQUEMENT en JSON valide, sans texte autour, sans balises markdown:
{
  "stageCoherent": true,
  "stageScore": 85,
  "stageLabel": "Floraison",
  "stageNotes": "Fleurs jaunes visibles, cohérent avec J+45",
  "healthScore": 80,
  "healthNotes": "Feuilles vertes, pas de signes de maladie",
  "isAuthentic": true,
  "hasExpectedFeatures": true,
  "isPlantVisible": true
}

Critères stageCoherent: la plante correspond-elle au stade J+${dayOffset} de ${cropFr}?
Critères isAuthentic: vraie photo terrain (pas screenshot, pas image générée, pas photo studio)?`;

  try {
    const anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // ✅ La clé API reste côté serveur, jamais exposée au client
        'x-api-key': process.env['ANTHROPIC_API_KEY'] || '',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 400,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType || 'image/jpeg',
                data: image,
              },
            },
            { type: 'text', text: prompt },
          ],
        }],
      }),
    });

    if (!anthropicResponse.ok) {
      const err = await anthropicResponse.text();
      console.error('Anthropic error:', err);
      res.status(502).json({ error: 'Vision API error', fallback: true });
      return;
    }

    const data = await anthropicResponse.json();
    const text = data.content?.find((b: any) => b.type === 'text')?.text || '';

    // Parser le JSON retourné par Claude
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);

    res.status(200).json(parsed);
  } catch (error: any) {
    console.error('analyzeImage error:', error);
    // En cas d'erreur, renvoyer un fallback plutôt que planter
    res.status(200).json({
      stageCoherent: true,
      stageScore: 65,
      stageLabel: 'Non analysé',
      stageNotes: 'Analyse IA indisponible',
      healthScore: 65,
      healthNotes: 'Analyse IA indisponible',
      isAuthentic: true,
      hasExpectedFeatures: true,
      isPlantVisible: true,
      fallback: true,
    });
  }
});

// ════════════════════════════════════════════════════════════════════════
// DÉPLOIEMENT Firebase:
//   firebase functions:config:set anthropic.key="sk-ant-..."
//   firebase deploy --only functions:analyzeImage
//
// Dans angular (environment.ts):
//   visionApiUrl: 'https://us-central1-TON-PROJET.cloudfunctions.net/analyzeImage'
//
// Dans image-comparison.service.ts:
//   private readonly BACKEND_VISION_URL = environment.visionApiUrl;
// ════════════════════════════════════════════════════════════════════════
