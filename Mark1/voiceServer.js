import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import compression from 'compression';
import OpenAI from "openai";


dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(compression());

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

const PORT = 3002;
app.listen(PORT, () => {
    console.log(`Voice server running on http://localhost:${PORT}`);
});

app.post('/api/session', async (req, res) => {
    try {
        // Make request to OpenAI's Realtime API (v0.1.9+ format)
        const response = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
            method: 'POST', headers: {
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                session: {
                    type: 'realtime',
                    model: 'gpt-realtime',
                    tool_choice: "auto",
                    truncation: "auto",
                }
            }),
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error('OpenAI API Error:', errorData);
            throw new Error(`OpenAI API returned ${response.status}: ${JSON.stringify(errorData)}`);
        }

        const data = await response.json();
        console.log('Ephemeral key generated:', data.value?.substring(0, 10) + '...');

        // Check if we got a valid key
        if (!data.value) {
            throw new Error('No ephemeral key returned from OpenAI');
        }

        // Return the ephemeral key to the client
        res.json({
            client_secret: {
                value: data.value
            }
        });

    } catch (error) {
        console.error('Error creating session:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/rate-scene', async (req, res) => {
    try {
        const { sceneEvidence, wordsInScene } = req.body || {};
        if (!sceneEvidence || !Array.isArray(wordsInScene)) {
            return res.status(400).json({ error: "sceneEvidence + wordsInScene required" });
        }

        // Rater prompt (reuse your vocabularyRater logic, but in one call)
        const prompt = `
  You are a strict vocabulary evaluator.

  Given:
  - sceneEvidence: a transcript of the scene
  - wordsInScene: array of { id, text, definition, realLifeDef }

  Return JSON only:
  {
    "ratings": [
      { "vocabularyId": "...", "rating": 1-4, "evidence": "short paragraph justification" }
    ]
  }

  Rules:
  - rating 4 only if definition + usage are correct.
  - rating 1 if user said "idk" or failed to use the word.
  - If evidence is weak, do not give 4.
  `;

        const response = await openai.responses.create({
            model: "gpt-5-mini-2025-08-07",
            input: [
                { role: "system", content: prompt },
                { role: "user", content: JSON.stringify({ sceneEvidence, wordsInScene }) }
            ],
            text: {
                format: {
                    type: "json_schema",
                    name: "scene_rating",
                    schema: {
                        type: "object",
                        properties: {
                            ratings: {
                                type: "array",
                                items: {
                                    type: "object",
                                    properties: {
                                        vocabularyId: { type: "string" },
                                        rating: { type: "integer", minimum: 1, maximum: 4 },
                                        evidence: { type: "string" }
                                    },
                                    required: ["vocabularyId", "rating", "evidence"],
                                    additionalProperties: false
                                }
                            }
                        },
                        required: ["ratings"],
                        additionalProperties: false
                    },
                    strict: true
                }
            }
        });

        const json = response.output_text ? JSON.parse(response.output_text) :
            response.output[0]?.content?.[0]?.text;
        return res.json(json);
    } catch (err) {
        console.error("rate-scene failed", err);
        res.status(500).json({ error: err.message });
    }
});
