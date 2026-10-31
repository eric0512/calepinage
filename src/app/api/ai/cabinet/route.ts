import { NextRequest, NextResponse } from 'next/server';
import { parseCabinetPromptWithNLP } from '@/lib/cabinet-calculator';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { prompt, availableMaterials = [], apiKey } = body;

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json(
        { error: 'Le texte de description est requis.' },
        { status: 400 }
      );
    }

    const geminiKey = apiKey || process.env.GEMINI_API_KEY;

    // 1. Si une clé Gemini est disponible, on interroge Gemini pour une compréhension avancée
    if (geminiKey) {
      try {
        const systemInstruction = `Tu es un expert menuisier et fabricant de meubles d'agencement.
Tu dois analyser la description en langage naturel d'un meuble ou caisson et en extraire les paramètres structurés au format JSON exact suivant :
{
  "name": "string (ex: Caisson bas, Dressing...)",
  "height": number (hauteur totale extérieure en mm, défaut: 720),
  "width": number (largeur totale extérieure en mm, défaut: 600),
  "depth": number (profondeur totale extérieure en mm, défaut: 560),
  "thickness": number (épaisseur des panneaux en mm, défaut: 18),
  "assemblyType": "sides_full" (si haut et bas sont à l'intérieur entre les côtés) ou "top_bottom_full" (si les côtés sont pris entre le dessus et le dessous),
  "backType": "applique" | "groove" | "none",
  "backThickness": number (épaisseur du fond en mm, défaut: 8),
  "shelvesCount": number (nombre d'étagères, défaut: 0),
  "shelfRecess": number (retrait de façade des étagères en mm, défaut: 20),
  "partitionsCount": number (séparations verticales, 0 ou 1),
  "doors": "none" | "one_door" | "two_doors",
  "material": "string (la matière la plus proche parmi les disponibles ou mentionnée)"
}
Réponds UNIQUEMENT par ce JSON sans balises markdown ni texte supplémentaire.`;

        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [
                {
                  role: 'user',
                  parts: [
                    {
                      text: `${systemInstruction}\n\nMatières disponibles en stock : ${JSON.stringify(
                        availableMaterials
                      )}\n\nDemande utilisateur : "${prompt}"`,
                    },
                  ],
                },
              ],
              generationConfig: {
                temperature: 0.1,
                responseMimeType: 'application/json',
              },
            }),
          }
        );

        if (response.ok) {
          const data = await response.json();
          const content =
            data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
          if (content) {
            const parsed = JSON.parse(content);
            return NextResponse.json({
              success: true,
              source: 'gemini-ai',
              config: parsed,
            });
          }
        }
      } catch (geminiError) {
        console.warn('Fallback sur analyse locale suite à erreur Gemini:', geminiError);
      }
    }

    // 2. Moteur d'analyse locale intelligente (NLP Menuiserie)
    const localParsed = parseCabinetPromptWithNLP(prompt, availableMaterials);

    return NextResponse.json({
      success: true,
      source: 'local-nlp-expert',
      config: localParsed,
    });
  } catch (error) {
    console.error('Erreur API Cabinet AI:', error);
    return NextResponse.json(
      { error: 'Erreur lors du traitement de la demande.' },
      { status: 500 }
    );
  }
}

