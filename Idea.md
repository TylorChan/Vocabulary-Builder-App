Project Proposal: Domain Transfer in Complex Word Identification for Multimedia English Learning

Problem Statement

Current state-of-the-art Complex Word Identification (CWI) models are predominantly trained on formal, well-structured content (news articles, academic texts), yet modern non-native English learners increasingly consume multimedia content through platforms like YouTube and Spotify. This creates a significant domain transfer gap: models trained on edited written text fail when applied to spoken language contexts characterized by conversational delivery, informal register, slang, and cultural references.

Research Question

To what extent do formal-domain CWI models transfer to multimedia content consumption, and can we improve performance through domain-specific fine-tuning with authentic learner interaction data?

Our Plan

Phase 1: Authentic Data Collection
We propose developing a Chrome extension that simulates realistic vocabulary learning scenarios. The extension captures captions from any audio source (YouTube videos, Spotify podcasts, etc.) and presents them to users who select unfamiliar words/phrases, labeling them as 'complex,' 'neutral,' or 'simple.' This approach generates valid training data from actual learning contexts, unlike existing datasets derived from well-structure academic sources.

Phase 2: Domain Gap Analysis & Model Fine-tuning
- Establish baselines using existing CWI models on our multimedia dataset
- Quantify performance degradation compared to traditional benchmarks
- Fine-tune models on our domain-specific data to improve multimedia content prediction

Phase 3: Interactive Evaluation Framework
We implement dual evaluation strategies: 
(1) Pre-highlighting validation - our fine-tuned model predicts complex words/phrases before user selection, creating real-time human evaluation of model predictions
(2) Standard metrics - precision, recall, and F1-score on held-out test data.

Expected Contributions

1. A New Dataset: A CWI dataset from multimedia English learning contexts
2. Domain Transfer Analysis: Systematic evaluation of formal→informal domain gap in vocabulary complexity
3. Improved Models: Fine-tuned CWI systems optimized for real-world language learning scenarios