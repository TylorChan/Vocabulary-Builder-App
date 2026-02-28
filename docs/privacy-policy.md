# MARK II Privacy Policy

Last updated: 2026-02-27

## Overview

MARK II is a Chrome extension for vocabulary learning from online video captions and voice practice.
This policy describes what data is processed, where it is sent, and what users can control.

## Data We Process

- Selected vocabulary items and related context text.
- Voice practice transcripts and session metadata.
- Learning progress data (review state and scheduling fields).
- Optional personalization data (memory/profile signals).

## Data Flow

- Extension UI and local services communicate over `localhost` during local development.
- Optional backend services (GraphQL + memory + FSRS) are used to persist vocabulary/review data.
- Third-party AI APIs may process text/audio content to provide transcription, definitions, planning, and scoring features.

## What We Do Not Do

- We do not sell personal data.
- We do not intentionally collect unrelated browsing history.
- We do not read content from unsupported websites by default.

## Retention and Deletion

- Local extension state can be cleared by removing extension storage.
- Backend data deletion depends on the deployment owner's database controls.
- Users can remove sessions/vocabulary entries through product UI where supported.

## Security

- We follow least-privilege extension permissions.
- Sensitive keys are expected to be stored server-side or in local environment variables, not hard-coded in client bundles.

## Contact

For privacy questions or deletion requests, open an issue in this repository:
`https://github.com/TylorChan/Vocabulary-Builder-App/issues`

