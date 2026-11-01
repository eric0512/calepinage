import { NextRequest, NextResponse } from 'next/server';
import { parseCabinetPromptWithNLP } from '@/lib/cabinet-calculator';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      prompt,
      availableMaterials = [],
      stockPanels = [],
      workshopStock = [],
      apiKey,
    } = body;

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json(
        { error: 'Le texte de description est requis.' },
        { status: 400 }
      );
    }

    const geminiKey = apiKey || process.env.GEMINI_API_KEY;

    // Synthèse de l'inventaire réel de l'utilisateur (Stock saisi et Stock atelier)
    const stockSummaryLines: string[] = [];
    if (Array.isArray(stockPanels) && stockPanels.length > 0) {
      stockSummaryLines.push('PANNEAUX EN STOCK SAISI (Projet en cours) :');
      stockPanels.forEach(
        (p: { material: string; length: number; width: number; quantity: number }) => {
          stockSummaryLines.push(
            `- "${p.material}" : ${p.length}×${p.width} mm (qté: ${p.quantity})`
          );
        }
      );
    }
    if (Array.isArray(workshopStock) && workshopStock.length > 0) {
      stockSummaryLines.push('CHUTES ET PANNEAUX EN STOCK ATELIER :');
      workshopStock.forEach(
        (w: { material: string; length: number; width: number; quantity: number }) => {
          stockSummaryLines.push(
            `- "${w.material}" : ${w.length}×${w.width} mm (qté: ${w.quantity})`
          );
        }
      );
    }
    const inventoryContext = stockSummaryLines.join('\n');

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
  "material": "string (matière choisie en priorité dans les stocks de l'utilisateur)",
  "backMaterial": "string (matière spécifique du fond avec son épaisseur, ex: 'MDF 8mm' ou 'Isorel 3mm' choisie en priorité dans le stock atelier ou saisi)",
  "cabinetCount": number (nombre de caissons identiques souhaités, défaut: 1)
}

RÈGLE IMPÉRATIVE SUR LES STOCKS :
Tu DOIS utiliser en priorité les matières et épaisseurs RÉELLEMENT DISPONIBLES dans le stock de l'utilisateur (stock atelier et stock saisi ci-dessous).
Si une matière du stock correspond à l'épaisseur souhaitée (ou s'en rapproche), utilise son intitulé exact !
Pour le fond ("backMaterial"), recherche en priorité les chutes minces (ex: 8mm, 5mm, 3mm) présentes dans le stock atelier ou saisi.

INVENTAIRE DES STOCKS DISPONIBLES :
${inventoryContext || "Aucun stock préalablement saisi"}

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
                      text: `${systemInstruction}\n\nMatières disponibles : ${JSON.stringify(
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
    const localParsed = parseCabinetPromptWithNLP(
      prompt,
      availableMaterials,
      stockPanels,
      workshopStock
    );

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

