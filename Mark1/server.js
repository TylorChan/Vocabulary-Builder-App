import { WebSocket, WebSocketServer } from 'ws';
import express from 'express';
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

// Gemini setup
const ai = new GoogleGenAI({});

//Endpoint for word definitions from Gemini
app.post('/api/define', async (req, res) => {
    const {tmpText} = req.body;
    console.log(tmpText)
    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash-lite",
            contents: `Define: ${tmpText}`,
            config: {
                systemInstruction: `You are a concise English-Chinese dictionary assistant.
   
  For any word or phrase provided, respond in this EXACT format:

  Definition: [One clear sentence in English]
  中文: [Chinese translation]
  Example: [One natural usage sentence]

  Keep it brief and practical for English learners. Focus on the most common meaning.`,
            },
        });
        console.log(response.text)
        res.json({ definition: response.text });
    } catch (error) {
        console.log(error.message)
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
        console.log('Deepgram connection established');
    });

    // Relay audio: Browser → Deepgram
    browserWS.on('message', (audioData) => {
        if (deepgramWS.readyState === WebSocket.OPEN) {
            console.log('start transcription');
            deepgramWS.send(audioData);
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