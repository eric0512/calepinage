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
  "height": number (hauteur totale extérieure en mm, défaut: 720. Ex: 700 de haut = 700),
  "width": number (largeur totale extérieure du corps en mm, défaut: 600. Ex: 1000 de large = 1000),
  "depth": number (profondeur totale extérieure du corps en mm, défaut: 560. Ex: 450 de profondeur = 450),
  "thickness": number (épaisseur des panneaux de structure en mm, défaut: 18),
  "assemblyType": "sides_full" (si haut et bas sont à l'intérieur entre les côtés) | "top_bottom_full" (si les côtés sont pris entre le dessus et le dessous) | "bottom_inside_top_over" (si le plateau du bas est encastré entre les côtés et le plateau du haut est posé sur les côtés, avec ou sans débord),
  "topOverhangSides": number (débord latéral du plateau du haut en mm de chaque côté, ex: 20 pour 2 cm de débord sur les côtés),
  "topOverhangFront": number (débord avant du plateau du haut en mm, ex: 20 pour 2 cm de débord sur l'avant),
  "backType": "applique" | "groove" (utiliser 'groove' si le fond est encastré ou en rainure) | "none",
  "backThickness": number (épaisseur du fond en mm, ex: 9 si fond en MDF de 9mm),
  "shelvesCount": number (nombre d'étagères par compartiment, ex: 2 si 2 étagères de chaque côté de la séparation),
  "shelfRecess": number (marge de retrait des étagères en mm, défaut: 5),
  "partitionsCount": number (séparations verticales intérieures, de 0 à 4. Ex: 1 si séparation au milieu, 2 pour deux montants intermédiaires, jusqu'à 4),
  "doors": "none" | "one_door" | "two_doors",
  "material": "string (matière choisie en priorité dans les stocks de l'utilisateur pour le caisson)",
  "backMaterial": "string (matière spécifique du fond avec son épaisseur, ex: 'MDF 9mm' si fond en mdf de 9 mm)",
  "cabinetCount": number (nombre de caissons identiques souhaités, défaut: 1)
}

RÈGLES D'INTERPRÉTATION MÉTIER :
1. "700 de haut, 1000 de large et 450 de profondeur" -> height=700, width=1000, depth=450.
2. "plateau du bas encastré entre les côtés" et "plateau du haut posé sur les côtés avec débord de 2 cm sur les côtés et l'avant" -> assemblyType="bottom_inside_top_over", topOverhangSides=20, topOverhangFront=20.
3. "séparation au milieu et 2 étagères de chaque côté" -> partitionsCount=1, shelvesCount=2.
4. "fond en mdf de 9 mm encastré" -> backType="groove", backThickness=9, backMaterial="MDF 9mm".

RÈGLE IMPÉRATIVE SUR LES STOCKS :
Tu DOIS utiliser en priorité les matières et épaisseurs RÉELLEMENT DISPONIBLES dans le stock de l'utilisateur (stock atelier et stock saisi ci-dessous).
Si une matière du stock correspond à l'épaisseur souhaitée (ou s'en rapproche), utilise son intitulé exact !
Pour le fond ("backMaterial"), recherche en priorité les chutes minces (ex: 9mm, 8mm, 5mm, 3mm) présentes dans le stock atelier ou saisi.

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

