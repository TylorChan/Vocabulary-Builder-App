import { WebSocket, WebSocketServer } from 'ws';
import express from 'express';
import compression from 'compression';
import cors from 'cors';
import dotenv from 'dotenv';
import { GoogleGenAI } from "@google/genai";

// Load .env file
dotenv.config();
const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY;

const PORT = 3000;

// Express app
const app = express();
app.use(cors());
app.use(express.json());
app.use(compression());

// Gemini setup
const ai = new GoogleGenAI({});

//Endpoint for word definitions from Gemini
app.post('/api/define', async (req, res) => {
    const { tmpText, videoTitle, surroundingText } = req.body;
    // console.log(tmpText)
    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash-lite",
            contents: `You are a vocabulary tutor helping English learners understand words from real 
  video/podcast content.

  Task: Explain the word/phrase in EXACT JSON format with natural, conversational language.

  Format Requirements:
  - "definition": Single paragraph (2-3 sentences) combining: [what it means] + [how it's used in THIS video. Integrate the context naturally—avoid phrases like "in the
  context of" or "the video states"]
  - "readLife_usage":When/where native speakers use it in real life (one sentence). Must start
   with 'In real life,' followed by a complete, coherent statement.
  - "example_sentence": One vivid real life practical example using the exact word "${tmpText}"
  - "example_translation": Chinese translation of the example sentence

  Example 1:
  Word: "binge-watch"
  Video: "Netflix Shows Worth Your Time"
  Caption: "I totally binge-watched this series last weekend"
  Answer: {
    "definition": "This means watching many episodes of a TV show consecutively in one sitting. In
   this Netflix review, the host is discussing shows that are so engaging you can't stop watching.",
    "readLife_usage": "People say this constantly when talking about streaming services, especially on weekends or holidays.",
    "example_sentence": "I accidentally binge-watched the entire season instead of sleeping.",
    "example_translation": "我一不小心刷了整季剧，都没睡觉。"
  }

  Example 2:
  Word: "render"
  Video: "Traditional Carbonara Recipe"
  Caption: "cook the guanciale to render out the fat"
  Answer: {
    "definition": "This means to melt and extract fat from meat by cooking it slowly. In this
  Italian cooking tutorial, the chef shows how to render fat from guanciale to create the sauce
  base for carbonara.",
    "readLife_usage": "Cooks use this technique with bacon, duck, or any fatty meat to extract flavorful fat for cooking.",
    "example_sentence": "Render the bacon until crispy, then save the fat for cooking
  vegetables.",
    "example_translation": "把培根煎到酥脆，然后留下油脂用来炒菜。"
  }

  Now complete:
  Word: "${tmpText}"
  Video: "${videoTitle || 'Unknown video'}"
  Caption: "${surroundingText || 'No context available'}"
  Answer: {`,
            config: {
                temperature: 0.7,
                responseMimeType: "application/json",  // Force JSON output
                responseSchema: {
                    type: "object",
                    properties: {
                        definition: { type: "string" },
                        readLife_usage: { type: "string" },
                        example_sentence: { type: "string" },
                        example_translation: { type: "string" }
                    },
                    required: ["definition", "readLife_usage", "example_sentence", "example_translation"]
                }
            }
        });
        const parsedData = JSON.parse(response.text);
        console.log(parsedData);
        res.json(parsedData);
    } catch (error) {
        console.log("ERROR: " + error.message)
        // res.status(500).json({ error: error.message });
    }
});

// Create HTTP server from Express app
const httpServer = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

// Attach WebSocket server to same HTTP server
const wss = new WebSocketServer({ server: httpServer });


wss.on('connection', (browserWS) => {
    console.log('Browser connected');

    // Connect to Deepgram with auth headers
    const deepgramWS = new WebSocket(
        'wss://api.deepgram.com/v1/listen?' + new URLSearchParams({
            punctuate: 'true',
            interim_results: 'true',
            filler_words: 'true',
            smart_format: 'true',
            model: 'nova-3',
        }),
        {
            headers: { 'Authorization': `token ${DEEPGRAM_API_KEY}` }
        }
    );

    // Handle Deepgram connection events
    deepgramWS.on('error', (error) => {
        console.error('Deepgram error:', error.message);
    });

    browserWS.on('error', (error) => {
        console.error('Browser error:', error.message);
    });


    deepgramWS.on('open', () => {
        if (browserWS.readyState === WebSocket.OPEN) {
            browserWS.send(JSON.stringify({ type: "READY" }));
        }
        console.log('Deepgram connection established');
    });

    // Relay audio: Browser → Deepgram
    browserWS.on('message', (audioData, isbinary) => {
        if (deepgramWS.readyState === WebSocket.OPEN) {
            // console.log(isbinary)
            // NOTE: websocket accepts binary (audio data here) and text data. 
            // The server was blindly forwarding everything as binary. 
            // So fowarding type check is necessary here.
            if (isbinary) {
                console.log('start transcription');
                deepgramWS.send(audioData);
            } else {
                const parsed = JSON.parse(audioData);
                if (parsed?.type === 'KeepAlive') {
                    console.log('Forwarding KeepAlive to Deepgram');
                    deepgramWS.send(JSON.stringify(parsed));
                    return;
                }
            }
        }
    });

    // Relay transcription: Deepgram → Browser
    deepgramWS.on('message', (transcription) => {
        if (browserWS.readyState === WebSocket.OPEN) {
            console.log('send transcription to browser');
            const textData = transcription.toString();
            browserWS.send(textData);
            console.log(textData)
            // browserWS.send(transcription);
        }
    });

    // Cleanup on disconnect
    browserWS.on('close', () => deepgramWS.close());
    deepgramWS.on('close', () => browserWS.close());
});