# Chrome extension front-end
- This is the front end component of Chrome extension

## Voice session diagnostics

Local development records Realtime, Expression Assist, Review Graph, and Expression card events as one JSONL file per voice session under `logs/voice-sessions/`. API credentials and other secret-shaped fields are redacted, but transcripts remain readable for debugging. The directory is git-ignored; do not publish these files.

After reproducing an issue and disconnecting the voice session, list the newest traces:

```bash
npm run trace:voice-session
```

Resolve one known session to its absolute file path:

```bash
npm run trace:voice-session -- <session-id>
```
