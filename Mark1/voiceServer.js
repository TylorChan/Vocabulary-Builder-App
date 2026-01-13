import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import compression from 'compression';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(compression());

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
