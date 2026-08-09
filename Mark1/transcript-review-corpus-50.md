# Transcript Review Corpus V1

## Purpose

This file is the human-reviewable source of truth for the executable 50-case transcript-review benchmark. The benchmark script parses these cases directly, so conversation or label edits here affect the next benchmark run without a separate fixture conversion step.

## Annotation Contract

- One dialogue group means one Teacher turn followed by one Learner turn.
- Every case contains exactly eight dialogue groups.
- Every group contains at least four complete sentences across the Teacher and Learner turns.
- The final Learner turn contains at least four complete sentences and is the only turn classified by the reviewer.
- Groups 1-3 are represented by the supplied rolling summary when converted to the API fixture.
- Groups 4-7 plus the Teacher turn from Group 8 become `conversationContext.recentTurns`.
- The Learner turn from Group 8 becomes `currentTurn`.
- Earlier mentions of the target are context only. They must never be credited as target use in the current Learner turn.
- Exact benchmark scoring initially uses `outcome`. The expected evidence object is retained for deeper QA, while model confidence is not assigned a fixed ground-truth value.
- Controlled `usageMode` values in this corpus are `EXACT_LEXICAL`, `NOT_USED`, `MISUSED`, and `ASR_UNCLEAR`.

## Outcome Distribution

| Outcome | Cases |
|---|---:|
| `ACHIEVED` | 9 |
| `MEANING_OK_TARGET_MISSING` | 8 |
| `PARTIAL` | 9 |
| `STUCK` | 8 |
| `OFF_TOPIC` | 8 |
| `ASR_UNCERTAIN` | 8 |
| **Total** | **50** |

## Future Benchmark Protocol

- Freeze and identify the approved corpus version before paid runs; do not edit labels after seeing one model's failures without creating a new version.
- Give every model the same 50 fixtures and use a fixed seed to shuffle sequential request order.
- Report overall exact-outcome accuracy, per-outcome precision/recall, macro F1, confusion matrix, structured-output success rate, p50/p95 latency, token usage, and estimated cost.
- Treat this synthetic set as a controlled screening suite, not proof of production accuracy. Add anonymized, human-labeled MARK II turns as a separate real-traffic split later.
- Keep expected labels outside the provider prompt. Earlier dialogue may contain the target Expression because resisting that false evidence is part of the task.
- Dataset versioning follows the evaluation workflow described by [LangSmith](https://docs.langchain.com/langsmith/manage-datasets); provider-by-case comparison follows the declarative test pattern used by [Promptfoo](https://github.com/promptfoo/promptfoo). The corpus also records possible contamination and label changes explicitly, consistent with [OpenAI's trustworthy evaluation playbook](https://openai.com/index/trustworthy-third-party-evaluations-foundations/).

## Cases

### Case 01 - Marvel's next central villain

- **Topic:** Marvel's next saga villain.
- **Target Expression:** `a strong contender`
- **Target ID:** `target-strong-contender`
- **Intended meaning:** A person or option with a serious chance of being selected or winning.
- **Communicative goal:** Argue that Magneto deserves serious consideration as the next central villain.
- **Learner signals:** Long-winded explanation, near-synonym substitution, self-correction.
- **Expected output:** `{"outcome":"PARTIAL","targetEvidence":[{"targetId":"target-strong-contender","meaningFit":false,"contextFit":false,"usageMode":"NOT_USED","matched":false}],"asrUncertain":false}`
- **Annotation rationale:** The final turn advances the correct argument but never produces the preferred Expression and remains unsure about the concise wording.
- **Rolling summary:** The learner and Teacher compared several Marvel villains, focusing on Magneto's history, emotional motivation, and ability to challenge both heroes and audiences.

1. **Teacher:** Let us compare villains by narrative weight rather than raw power alone. **Learner:** Magneto has many things that make him suitable. He has a personal history with the heroes and a political idea behind his actions. I think that gives writers more material than another giant monster.
2. **Teacher:** What makes his motivation more interesting than simple destruction? **Learner:** He believes he is protecting mutants, although his methods are extreme. That creates a conflict where viewers can understand part of his reasoning. It is not only good people fighting one obviously bad person.
3. **Teacher:** How could that conflict support a whole movie saga? **Learner:** Different heroes could disagree about whether he is completely wrong. Some mutants might support him while others fear him. The argument could continue across several movies without feeling artificial.
4. **Teacher:** Now compare his chances with those of other possible villains. **Learner:** Galactus has a larger scale, but he is harder to make emotionally personal. Kang already has complicated audience baggage. Magneto seems to have a more stable dramatic foundation.
5. **Teacher:** Can you express that judgment in one concise competitive phrase? **Learner:** I want to say he is a very possible person for the position. That sounds like a job application instead of a movie discussion. I know there is a shorter phrase for someone with a real chance.
6. **Teacher:** The phrase should show that he belongs near the top of the candidate list. **Learner:** Maybe I can say he is a powerful candidate. That communicates part of my idea, but it still sounds formal and slightly unnatural. I am trying to compare his chances rather than only his strength.
7. **Teacher:** Give me the argument as if a friend doubts your choice. **Learner:** I would say his motivation, history, and relationships make him one of the best choices. He can threaten the heroes physically and challenge their beliefs. I still cannot remember the compact expression you want.
8. **Teacher:** So how would you finally describe Magneto's chances of leading the next saga? **Learner:** Magneto is one of the most serious choices Marvel could make. He has enough history to carry several films, and his beliefs create conflict beyond ordinary fighting. I want to describe him as someone who has a real possibility of winning this role. The phrase in my head is something like a powerful candidate, but that does not sound quite right. My meaning is clear, although I have not found the preferred wording.

### Case 02 - Interstellar's emotional ending

- **Topic:** Why the ending of *Interstellar* works emotionally.
- **Target Expression:** `hit close to home`
- **Target ID:** `target-hit-close-to-home`
- **Intended meaning:** Feel especially personal or emotionally relevant to someone's own life.
- **Communicative goal:** Explain why Cooper watching decades of family messages feels personally affecting.
- **Learner signals:** Natural transfer, minor grammar errors that do not block meaning.
- **Expected output:** `{"outcome":"ACHIEVED","targetEvidence":[{"targetId":"target-hit-close-to-home","meaningFit":true,"contextFit":true,"usageMode":"EXACT_LEXICAL","matched":true}],"asrUncertain":false}`
- **Annotation rationale:** The learner uses the exact Expression naturally and supports it with a personally relevant explanation.
- **Rolling summary:** The conversation examined time dilation, Cooper's absence from his children's lives, and why the video-message sequence matters more than the space spectacle.

1. **Teacher:** Which moment in the film affects you more than the large space scenes? **Learner:** The video messages affect me the most. Cooper sits there while years of his children's lives pass in minutes. The scene makes the science feel painfully human.
2. **Teacher:** Why is that loss more powerful than an ordinary goodbye? **Learner:** He does not only miss one event or one birthday. He misses whole stages of their lives without being able to respond. The distance becomes emotional as well as physical.
3. **Teacher:** Does any part of that connect with your own experience? **Learner:** Living abroad made me understand a smaller version of it. I sometimes watched family events through my phone after they had already happened. Of course my situation was not as extreme, but the feeling was recognizable.
4. **Teacher:** Describe that personal connection without overexplaining it. **Learner:** The scene reminds me that time with family cannot always be recovered. It makes the science fiction idea feel connected to ordinary separation. That is why I remember it more than the action scenes.
5. **Teacher:** Try using today's target Expression in your explanation. **Learner:** I think the message scene hits close to home for people who have lived far from family. You can recognize the guilt of missing important moments. The expression feels suitable because the emotion is personally familiar.
6. **Teacher:** Can you make the point sound conversational rather than academic? **Learner:** Honestly, that scene really hits close to home for me. I have opened family videos late and realized everyone had already moved on to the next moment. Cooper's situation is larger, but the emotional idea is familiar.
7. **Teacher:** Add one detail from the film that supports your claim. **Learner:** Cooper watches his son grow older and become a father while he cannot answer. His face changes because he understands what the mission has cost. That detail makes the separation impossible to treat as abstract science.
8. **Teacher:** Why does the video-message sequence remain so memorable to you? **Learner:** It can hit close to home because I know what it feels like to watch family life from another country. Cooper loses decades rather than months, but the basic fear of missing important moments is the same. The scene connects a complicated idea about time with a simple family regret. That makes the emotion immediate instead of theoretical. For me, it is the point where the film becomes personal.

### Case 03 - Doctor Doom raising the danger

- **Topic:** Doctor Doom entering the Marvel universe.
- **Target Expression:** `raise the stakes`
- **Target ID:** `target-raise-the-stakes`
- **Intended meaning:** Make a situation more dangerous, important, or consequential.
- **Communicative goal:** Explain how Doctor Doom could make the next story feel more consequential.
- **Learner signals:** Accurate paraphrase, formal wording, target omitted.
- **Expected output:** `{"outcome":"MEANING_OK_TARGET_MISSING","targetEvidence":[{"targetId":"target-raise-the-stakes","meaningFit":false,"contextFit":false,"usageMode":"NOT_USED","matched":false}],"asrUncertain":false}`
- **Annotation rationale:** The final turn communicates increased danger and consequences precisely but never uses the target Expression.
- **Rolling summary:** The learner described Doom as a political ruler, scientist, and sorcerer whose actions could affect nations rather than only individual heroes.

1. **Teacher:** Why is Doom more than another powerful fighter? **Learner:** He controls a country and has political influence. He also combines science with magic. That means his decisions can create several kinds of conflict at once.
2. **Teacher:** How does that change the scale of a hero's mistake? **Learner:** A hero cannot simply punch him and leave. A careless attack could cause an international crisis. The consequences extend beyond one battle.
3. **Teacher:** What would audiences feel if Doom gained control of advanced technology? **Learner:** They would understand that the danger had become much larger. He could use the technology against cities or governments. Every decision would feel more important.
4. **Teacher:** Put that effect into a concise story-analysis sentence. **Learner:** Doom would increase the seriousness of the conflict. He would make every failure produce larger consequences. My sentence explains it, but it sounds like a paper.
5. **Teacher:** Keep the idea but make it sound like something you would tell a friend. **Learner:** Once Doom appears, the heroes cannot treat the problem casually anymore. If they lose, an entire country or timeline could be affected. The situation suddenly matters much more.
6. **Teacher:** Contrast him with a villain who threatens only one hero. **Learner:** A personal villain can ruin one character's life. Doom can create political, magical, and technological disasters together. His presence makes the conflict feel more dangerous for everyone.
7. **Teacher:** What single effect does he have on the story's consequences? **Learner:** He increases the risk and makes the outcome more important. The heroes have more to lose if they fail. I know the concept even though I am not using the short idiom.
8. **Teacher:** How would Doctor Doom change the intensity of the next Marvel saga? **Learner:** Doctor Doom would make the conflict much more serious because a defeat could affect countries, technology, and even other realities. The heroes would no longer be protecting only themselves or one city. Every choice would carry larger consequences, and even a small mistake could start a political disaster. His arrival would make the audience feel that much more could be lost. I can explain the meaning clearly, but I am still using a long description instead of the target phrase.

### Case 04 - Anxiety before a paper presentation

- **Topic:** Nervousness before tomorrow's academic presentation.
- **Target Expression:** `get through it`
- **Target ID:** `target-get-through-it`
- **Intended meaning:** Successfully endure or complete a difficult experience.
- **Communicative goal:** Reassure yourself that you can complete the presentation despite anxiety.
- **Learner signals:** Explicit inability, repeated restart, question disfluency.
- **Expected output:** `{"outcome":"STUCK","targetEvidence":[{"targetId":"target-get-through-it","meaningFit":false,"contextFit":false,"usageMode":"NOT_USED","matched":false}],"asrUncertain":false}`
- **Annotation rationale:** The learner understands the situation but explicitly cannot produce the reassurance or attempt the communicative goal.
- **Rolling summary:** The learner said tomorrow's presentation matters, described physical anxiety, and reviewed practical preparation steps with the Teacher.

1. **Teacher:** What part of tomorrow's presentation worries you most? **Learner:** I am afraid I will forget my structure. My voice becomes fast when I see many people. Then I start thinking about every small mistake.
2. **Teacher:** What preparation have you already completed? **Learner:** I finished my slides and practiced twice. I also wrote short notes for each section. Logically I know I am prepared, but my body still feels nervous.
3. **Teacher:** Imagine speaking to yourself five minutes before you begin. **Learner:** I would like to say something calming. Instead, I keep asking whether I will fail. My question becomes longer because I cannot organize the reassurance.
4. **Teacher:** Give yourself one realistic sentence about completing the difficult experience. **Learner:** I cannot form that sentence right now. Every version sounds either fake or overly dramatic. I only keep repeating that I am nervous.
5. **Teacher:** You do not need to promise perfection, only completion. **Learner:** I understand the distinction. I still cannot say it naturally in English. My mind goes blank when I try to reassure myself.
6. **Teacher:** Start with the fact that the presentation lasts only fifteen minutes. **Learner:** That fact should help me. However, I cannot turn it into the target idea. Please do not ask me to repeat an exact sentence yet.
7. **Teacher:** Can you at least state what you want to believe about tomorrow? **Learner:** I want to believe I can finish despite being anxious. I cannot express that belief in a confident way. I need a hint before I make another attempt.
8. **Teacher:** What would you tell yourself so you can face the presentation tomorrow? **Learner:** I cannot answer this properly yet. I know I should say that the anxiety will not stop me from finishing, but the words are not coming together. Every time I start, I change the sentence into another worried question. I do not want to pretend that I feel confident when I do not. Please give me a short cue and let me try again after that.

### Case 05 - Shopping with a foreign friend

- **Topic:** Keeping a conversation natural while shopping with an international friend.
- **Target Expression:** `keep the conversation going`
- **Target ID:** `target-keep-conversation-going`
- **Intended meaning:** Prevent a conversation from stopping by continuing to exchange ideas or questions.
- **Communicative goal:** Suggest a natural way to continue talking during pauses while shopping.
- **Learner signals:** Overformal questions, long explanation, partial communicative answer.
- **Expected output:** `{"outcome":"PARTIAL","targetEvidence":[{"targetId":"target-keep-conversation-going","meaningFit":false,"contextFit":false,"usageMode":"NOT_USED","matched":false}],"asrUncertain":false}`
- **Annotation rationale:** The learner proposes relevant questions but turns the answer into a formal interview plan and never produces the target Expression.
- **Rolling summary:** The learner worried about silence while browsing clothes and wanted topics that felt friendly rather than like prepared interview questions.

1. **Teacher:** What do you already know about your friend's interests? **Learner:** He likes sneakers, music, and trying local food. We have talked online, but we have not spent a whole afternoon together. I worry that the silence will become awkward.
2. **Teacher:** Which shopping moments naturally create topics? **Learner:** We can comment on clothes or compare prices. We can also decide where to eat afterward. Those topics are available without forcing a serious discussion.
3. **Teacher:** How do your questions usually sound when you become nervous? **Learner:** They become too complete and formal. I ask something like, what is your comprehensive opinion regarding this brand. That sounds more like research than friendship.
4. **Teacher:** Turn one of those questions into something casual. **Learner:** I could ask whether he would actually wear the jacket. Then I could say why the color would or would not work for me. That feels more natural.
5. **Teacher:** What can you do after he gives a short answer? **Learner:** I can add my own small story instead of immediately asking another question. I can mention a bad purchase I made last year. That gives him something concrete to respond to.
6. **Teacher:** Explain your overall strategy in one conversational phrase. **Learner:** My strategy is to continuously provide additional conversational material. That sentence is technically clear but extremely formal. I still do not have the easy phrase.
7. **Teacher:** Imagine the two of you suddenly become quiet near the shoe section. **Learner:** I would point at a strange pair and ask if he would ever buy it. Then I might tell him about my worst sneaker choice. That would probably remove the silence.
8. **Teacher:** So what will you do when the conversation starts slowing down? **Learner:** I will use something around us, like a ridiculous shoe or an overpriced jacket, as an easy topic. I can ask one casual question and then share my own opinion instead of questioning him repeatedly. That should help us continue talking without making the afternoon feel like an interview. I still describe the strategy with too many words because I do not know the compact expression. The idea is there, but my delivery is not concise yet.

### Case 06 - Hiking Huangshan with a foreign friend

- **Topic:** Conversation and scenery during a Huangshan hike.
- **Target Expression:** `take in the view`
- **Target ID:** `target-take-in-view`
- **Intended meaning:** Pause to look at and appreciate the surrounding scenery.
- **Communicative goal:** Suggest stopping during the hike to appreciate the mountain scenery.
- **Learner signals:** Natural question response, minor tense issue, contextually grounded use.
- **Expected output:** `{"outcome":"ACHIEVED","targetEvidence":[{"targetId":"target-take-in-view","meaningFit":true,"contextFit":true,"usageMode":"EXACT_LEXICAL","matched":true}],"asrUncertain":false}`
- **Annotation rationale:** The learner naturally uses the target Expression to make a contextually appropriate hiking suggestion.
- **Rolling summary:** The learner planned a Huangshan route, discussed pacing with a visitor, and wanted conversational moments that did not require talking continuously uphill.

1. **Teacher:** Why might silence be comfortable during part of the hike? **Learner:** We will both be breathing hard on the stairs. The mountain itself gives us something to experience together. We do not need to fill every second with speech.
2. **Teacher:** What topics could arise naturally from the route? **Learner:** I can explain the pine trees and the names of certain peaks. We can compare hiking experiences in our countries. We can also talk about the weather changing quickly.
3. **Teacher:** Where would you deliberately pause the conversation? **Learner:** I would pause at a viewpoint after a steep section. That gives us time to rest and notice the clouds. A quiet moment there would not feel awkward.
4. **Teacher:** Make a natural suggestion when you reach that viewpoint. **Learner:** I could say we should stop for a minute. Then I can point out the peaks appearing through the clouds. The invitation should feel relaxed rather than like a tour command.
5. **Teacher:** Use today's Expression in that invitation. **Learner:** Let us catch our breath and take in the view. The clouds are moving below the ridge, so the scenery may change quickly. We can continue after a few photos.
6. **Teacher:** How would you ask whether your friend wants to stay longer? **Learner:** I would ask if he wants another minute to take in the view. I might mention that the next section has fewer open viewpoints. That gives him a useful reason to decide.
7. **Teacher:** Add a little personality without making the sentence long. **Learner:** We climbed all those stairs, so we have earned a minute to take in the view. I can joke that the mountain is finally giving us a reward. That sounds friendly and natural.
8. **Teacher:** What will you say when you both reach the first clear overlook? **Learner:** I will say, let us stop here and take in the view before the clouds move again. We can catch our breath, look at the peaks, and take a few photos without rushing. The phrase fits because I am inviting my friend to appreciate the scenery rather than merely see it. It also creates a natural pause in the conversation. Afterward, we can talk about which part of the landscape surprised him most.

### Case 07 - Introducing Luka Doncic

- **Topic:** Explaining why Luka Doncic is the learner's favorite NBA player.
- **Target Expression:** `make the game look easy`
- **Target ID:** `target-make-game-look-easy`
- **Intended meaning:** Perform something difficult so smoothly that it appears effortless.
- **Communicative goal:** Explain how Luka's pace and control make difficult basketball actions appear effortless.
- **Learner signals:** Correct meaning, detailed evidence, target omitted.
- **Expected output:** `{"outcome":"MEANING_OK_TARGET_MISSING","targetEvidence":[{"targetId":"target-make-game-look-easy","meaningFit":false,"contextFit":false,"usageMode":"NOT_USED","matched":false}],"asrUncertain":false}`
- **Annotation rationale:** The learner clearly conveys effortless mastery but does not use the preferred Expression.
- **Rolling summary:** The learner described Luka's slow pace, passing vision, footwork, and ability to control defenders without relying on elite speed.

1. **Teacher:** What first attracted you to Luka's style? **Learner:** He controls the speed instead of always running faster. He watches the defender and changes his rhythm. That makes every move feel intentional.
2. **Teacher:** Which difficult skill does he perform most smoothly? **Learner:** His passing looks incredibly calm. He can find a corner shooter while two defenders trap him. The decision happens before I even notice the opening.
3. **Teacher:** Why is that more impressive than a highlight dunk to you? **Learner:** A dunk is obvious athletic power. Luka manipulates several defenders with timing and vision. The difficulty is hidden inside how relaxed he appears.
4. **Teacher:** Explain that hidden difficulty to a friend who rarely watches basketball. **Learner:** He does things that require exceptional balance and awareness. However, his body language looks like he is playing at a park. You may not realize how difficult each decision is.
5. **Teacher:** Can you compress that contrast into a casual phrase? **Learner:** I would say he performs complicated basketball in an apparently simple manner. That sounds like a textbook. I know there is an everyday expression for effortless-looking skill.
6. **Teacher:** Use one possession as evidence. **Learner:** He backs down a defender, pauses, and throws a pass across the court. The defense looks confused while he barely changes his facial expression. The whole possession appears simpler than it really is.
7. **Teacher:** What reaction do new viewers often have? **Learner:** They may think he is moving slowly and doing nothing special. Then they notice he already has twenty points and ten assists. His control hides the amount of skill involved.
8. **Teacher:** Why would you show Luka to a friend who is learning basketball? **Learner:** I would show him because Luka performs extremely difficult reads and shots while appearing completely relaxed. He changes pace, moves defenders, and finds passes that most players cannot see. A new viewer can understand that great basketball is not only about speed or jumping. Luka makes complex possessions appear simple, even though every detail requires exceptional control. I have fully explained the intended idea, but I did not use the exact target Expression.

### Case 08 - Paolo Banchero in the playoffs

- **Topic:** Why Paolo Banchero raises his performance in playoff basketball.
- **Target Expression:** `step up in the playoffs`
- **Target ID:** `target-step-up-playoffs`
- **Intended meaning:** Perform at a higher or more responsible level during playoff competition.
- **Communicative goal:** Argue that Banchero becomes more impactful when playoff pressure increases.
- **Learner signals:** Natural sports phrasing, comparative evidence, small article error.
- **Expected output:** `{"outcome":"ACHIEVED","targetEvidence":[{"targetId":"target-step-up-playoffs","meaningFit":true,"contextFit":true,"usageMode":"EXACT_LEXICAL","matched":true}],"asrUncertain":false}`
- **Annotation rationale:** The target is used naturally to make the intended playoff-performance argument, with supporting basketball evidence.
- **Rolling summary:** The learner and Teacher compared regular-season efficiency with playoff responsibility, physical defense, shot creation, and late-game decision-making.

1. **Teacher:** What changes for Banchero when the playoffs begin? **Learner:** The defense becomes more physical and prepared. Orlando needs him to create difficult shots more often. He accepts a larger role instead of avoiding the pressure.
2. **Teacher:** Does lower efficiency automatically mean worse performance? **Learner:** Not always, because the shot difficulty changes. A primary option faces traps and stronger defenders. We should also consider responsibility and late-game creation.
3. **Teacher:** Which part of his game survives playoff pressure best? **Learner:** His strength helps him reach his spots. He can draw fouls when easy shots disappear. He also keeps attacking after missing earlier attempts.
4. **Teacher:** Compare that mentality with a player who becomes passive. **Learner:** A passive player gives the ball away when the defense tightens. Banchero continues asking for it. That willingness matters even before we discuss the final statistics.
5. **Teacher:** Use the target Expression in your main claim. **Learner:** I think Banchero can step up in the playoffs because he does not hide from difficult possessions. He takes responsibility when Orlando's offense becomes slow. His confidence changes the team's options.
6. **Teacher:** Support that claim without simply repeating the phrase. **Learner:** He attacks stronger defenders and creates shots late in the clock. Even when his percentage drops, the defense still treats him as the central threat. That pressure creates opportunities for teammates.
7. **Teacher:** What would convince a skeptical friend? **Learner:** I would show how his usage and playmaking responsibility increase. I would also show possessions where he creates something after the original action fails. Those examples reveal performance beyond box-score efficiency.
8. **Teacher:** Why do you call Banchero a player who changes in the postseason? **Learner:** He tends to step up in the playoffs because greater pressure makes him take more responsibility rather than disappear. He keeps attacking physical defenders, creates late-clock shots, and forces the defense to send help. His efficiency may not always rise, but the difficulty and importance of his possessions do. That is why I see him as a playoff riser instead of only a regular-season scorer. The Expression fits the role he accepts when the games matter more.

### Case 09 - A dangerous amateur basketball pairing

- **Topic:** How a friend's three-point shooting and the learner's interior scoring create a winning combination.
- **Target Expression:** `pick your poison`
- **Target ID:** `target-pick-your-poison`
- **Intended meaning:** Choose between two harmful or difficult alternatives when neither can be ignored.
- **Communicative goal:** Explain that defenders must choose between allowing the friend's threes and allowing the learner's inside scoring.
- **Learner signals:** Literal misunderstanding, relevant basketball detail, internal contradiction.
- **Expected output:** `{"outcome":"PARTIAL","targetEvidence":[{"targetId":"target-pick-your-poison","meaningFit":false,"contextFit":false,"usageMode":"MISUSED","matched":true}],"asrUncertain":false}`
- **Annotation rationale:** The learner says the exact phrase but treats it as a literal choice of drink before partially recovering the basketball meaning.
- **Rolling summary:** The learner explained a Saturday winning streak in which one player spaced the floor and the other punished smaller defenders near the basket.

1. **Teacher:** What does your friend's shooting force defenders to do? **Learner:** They cannot leave him alone on the perimeter. One defender has to stay attached even when I post up. That creates more space near the basket.
2. **Teacher:** What happens if the defense sends extra help toward you? **Learner:** I can pass the ball back outside. My friend gets a clean three before the defense recovers. After he makes two shots, they become afraid to help again.
3. **Teacher:** Why does that combination produce winning streaks? **Learner:** We punish opposite defensive choices. If they stay outside, I have a smaller defender inside. If they collapse, he has an open shot.
4. **Teacher:** Describe the defender's dilemma with today's idiom. **Learner:** They must pick your poison between my inside game and his shooting. I am not sure why it is your poison when the defender is choosing. The grammar and meaning feel mixed in my sentence.
5. **Teacher:** Keep the idiom but make the perspective consistent. **Learner:** Maybe the defense has to pick their poison. That sounds closer, although poison makes me imagine choosing a dangerous drink. I understand there are two bad basketball options.
6. **Teacher:** Explain the two options before trying the idiom again. **Learner:** They can protect the paint and give him a three. They can guard the arc and let me attack inside. Neither option is comfortable for them.
7. **Teacher:** Now make one confident claim about why the pairing works. **Learner:** Our skills force the defense to choose one problem. I still hesitate about how the pronoun works in the idiom. The basketball idea is clear even though the phrase is unstable.
8. **Teacher:** Why are you and your friend so difficult to guard on the same team? **Learner:** Defenders have to pick your poison, which I think means they choose between his three-point shot and my inside scoring. However, I also wonder whether the phrase literally means selecting a dangerous drink, so I am not fully confident about the meaning. If they help on me, he shoots, and if they stay with him, I can score near the rim. The tactical dilemma is correct, but my use of the Expression and its pronoun is confused. I need one clarification before I can use it naturally.

### Case 10 - An Italian restaurant that changed a friend's mind

- **Topic:** Recommending an Italian restaurant that impressed someone who rarely eats Italian food.
- **Target Expression:** `win someone over`
- **Target ID:** `target-win-someone-over`
- **Intended meaning:** Persuade someone to like or support something they were initially unsure about.
- **Communicative goal:** Explain that the restaurant changed the friend's negative expectations about Italian cuisine.
- **Learner signals:** Natural storytelling, clear before-and-after contrast.
- **Expected output:** `{"outcome":"ACHIEVED","targetEvidence":[{"targetId":"target-win-someone-over","meaningFit":true,"contextFit":true,"usageMode":"EXACT_LEXICAL","matched":true}],"asrUncertain":false}`
- **Annotation rationale:** The learner uses the exact Expression to describe a genuine change from skepticism to enthusiasm.
- **Rolling summary:** The learner described a skeptical friend, a small Italian restaurant, and dishes whose freshness and balance differed from the friend's expectations.

1. **Teacher:** Why was your friend doubtful before the meal? **Learner:** He thought Italian food was only heavy pasta and cheese. He rarely chooses it when we eat out. He expected the dinner to feel repetitive.
2. **Teacher:** Which dish first changed that expectation? **Learner:** The grilled octopus surprised him. It was light, smoky, and served with a bright sauce. He immediately said it was different from what he imagined.
3. **Teacher:** Did the pasta reinforce that reaction? **Learner:** Yes, the pasta tasted fresh rather than heavy. The sauce was simple, but every ingredient was clear. He started asking how the restaurant made it.
4. **Teacher:** Describe the change in his attitude. **Learner:** He entered the restaurant expecting not to enjoy it. By the end, he wanted to return and try another dish. The meal completely changed his opinion.
5. **Teacher:** Use the target Expression to describe that change. **Learner:** The restaurant managed to win him over with food that felt fresh and balanced. He stopped treating Italian cuisine as one heavy category. Now he is the person suggesting we return.
6. **Teacher:** Make the story sound like a recommendation to another friend. **Learner:** You should try this place even if Italian food is not usually your first choice. It won my friend over, and he was more skeptical than you. The octopus and handmade pasta changed his expectations.
7. **Teacher:** What detail makes the claim believable rather than promotional? **Learner:** My friend normally refuses a second portion of pasta. That night he asked whether we should order another plate. His behavior showed the change better than a compliment did.
8. **Teacher:** Why do you think this restaurant could impress someone who doubts Italian food? **Learner:** It could win someone over because the dishes are lighter and more varied than the usual stereotype. My friend arrived believing he would tolerate the meal, but he ended up ordering more pasta and planning a return visit. The fresh ingredients changed his opinion instead of merely giving him one acceptable dinner. That before-and-after reaction is why I recommend the place confidently. It did not just satisfy him; it made him curious about the cuisine.

### Case 11 - Why Christopher Nolan is considered great

- **Topic:** Christopher Nolan's strengths as a filmmaker.
- **Target Expression:** `push the boundaries`
- **Target ID:** `target-push-boundaries`
- **Intended meaning:** Extend what is normally attempted or considered possible in a field.
- **Communicative goal:** Explain how Nolan expands the technical and narrative possibilities of mainstream filmmaking.
- **Learner signals:** Strong meaning, overformal delivery, target omitted.
- **Expected output:** `{"outcome":"MEANING_OK_TARGET_MISSING","targetEvidence":[{"targetId":"target-push-boundaries","meaningFit":false,"contextFit":false,"usageMode":"NOT_USED","matched":false}],"asrUncertain":false}`
- **Annotation rationale:** The learner clearly explains experimentation beyond conventional limits but does not use the preferred Expression.
- **Rolling summary:** The learner and Teacher discussed practical effects, nonlinear storytelling, large-format cameras, and Nolan's ability to make demanding ideas commercially successful.

1. **Teacher:** Which Nolan technique feels most distinctive to you? **Learner:** He prefers practical effects whenever they are possible. That choice gives physical weight to the image. It also forces the production team to invent unusual solutions.
2. **Teacher:** Does technical ambition alone make a director great? **Learner:** No, because technology needs a dramatic purpose. Nolan uses format and sound to support scale, time, or subjectivity. The technique usually connects with the central idea.
3. **Teacher:** How does his storytelling differ from safer studio films? **Learner:** He asks audiences to follow complicated structures. He trusts viewers to connect events across different timelines. That is risky for films with enormous budgets.
4. **Teacher:** Describe what those risks do to mainstream filmmaking. **Learner:** They expand the range of what studios believe audiences will accept. A complex film can still become a major event. Other directors then have more room to attempt ambitious ideas.
5. **Teacher:** Can you express that expansion in a short idiom? **Learner:** I can say he extends the conventional limitations of commercial cinema. That is accurate, but it sounds like a journal article. I cannot recall the natural phrase.
6. **Teacher:** Give a concrete example instead of another abstract definition. **Learner:** He put large-format cameras into situations where they were difficult to use. He also built action around time moving at different speeds. Those choices enlarged the toolkit of blockbuster filmmaking.
7. **Teacher:** What is your main claim about his influence? **Learner:** He demonstrates that ambitious form and popular entertainment can coexist. His success encourages studios to accept more experimentation. The idea is that he moves the limits outward.
8. **Teacher:** Why would you call Nolan a great director rather than only a successful one? **Learner:** He repeatedly expands what a large studio film can attempt in its structure, photography, and sound. His movies ask audiences to engage with difficult ideas without abandoning spectacle or emotion. When those risks succeed, they create more space for other filmmakers to experiment. That influence matters beyond the box office of one movie. I have expressed the idea of extending the limits, but I did not use the concise target Expression.

### Case 12 - LeBron or Jordan as the greatest

- **Topic:** The LeBron James versus Michael Jordan GOAT debate.
- **Target Expression:** `make a case for`
- **Target ID:** `target-make-case-for`
- **Intended meaning:** Present reasons and evidence supporting a person, idea, or conclusion.
- **Communicative goal:** Present a coherent argument supporting LeBron without claiming the debate is objectively settled.
- **Learner signals:** Wrong preposition, excessive qualification, relevant statistics.
- **Expected output:** `{"outcome":"PARTIAL","targetEvidence":[{"targetId":"target-make-case-for","meaningFit":false,"contextFit":false,"usageMode":"NOT_USED","matched":false}],"asrUncertain":false}`
- **Annotation rationale:** The learner attempts the required argument but repeatedly uses the wrong construction and undermines the conclusion with unresolved qualifications.
- **Rolling summary:** The discussion compared Jordan's peak scoring and championships with LeBron's longevity, versatility, and ability to lead different rosters.

1. **Teacher:** What is the strongest argument for Jordan? **Learner:** His peak dominance is difficult to match. He combined scoring titles with elite defense and championships. His cultural impact also shaped how people imagine greatness.
2. **Teacher:** What is the strongest argument for LeBron? **Learner:** His longevity is extraordinary. He has controlled games as a scorer, passer, and rebounder for many years. He also succeeded with very different teams.
3. **Teacher:** Which standard matters most to you personally? **Learner:** I value sustained excellence and versatility. A player should solve many kinds of basketball problems. That preference naturally helps LeBron's argument.
4. **Teacher:** Support him without dismissing Jordan. **Learner:** I can make a case of LeBron because his complete career covers more situations. However, Jordan's highest level may still be stronger. I am trying to argue without pretending the answer is simple.
5. **Teacher:** Listen to the preposition in today's Expression. **Learner:** I keep saying make a case of, which may be wrong. The evidence still supports LeBron's longevity. I need to repair the phrase while keeping the comparison balanced.
6. **Teacher:** What evidence would you choose first? **Learner:** I would begin with his years of elite production. Then I would mention his passing and ability to change positions. Those points show why his value lasted across eras and teammates.
7. **Teacher:** State your position in one clear sentence. **Learner:** I can make some argument about LeBron being the greatest. That sounds weak and avoids the target structure. I still want to acknowledge Jordan's stronger peak.
8. **Teacher:** If a friend chooses Jordan, how would you defend LeBron's GOAT claim? **Learner:** I would make a case of LeBron by focusing on longevity, versatility, and the number of different teams he carried deep into the playoffs. He has remained an elite scorer while also creating opportunities for everyone around him. At the same time, I admit Jordan may have the more dominant peak, so I do not think the debate is completely settled. My evidence supports the communicative goal, but the Expression still sounds wrong in my sentence. I need to fix the construction before the argument feels natural.

### Case 13 - Superhero movie fatigue

- **Topic:** Why audiences may be less excited about superhero films.
- **Target Expression:** `lose its novelty`
- **Target ID:** `target-lose-novelty`
- **Intended meaning:** Stop feeling new, unusual, or exciting after repeated exposure.
- **Communicative goal:** Explain how repeated formulas can reduce audience excitement.
- **Learner signals:** Fluent but completely unrelated final answer.
- **Expected output:** `{"outcome":"OFF_TOPIC","targetEvidence":[{"targetId":"target-lose-novelty","meaningFit":false,"contextFit":false,"usageMode":"NOT_USED","matched":false}],"asrUncertain":false}`
- **Annotation rationale:** No substantive part of the final turn addresses superhero repetition, audience excitement, or the target meaning.
- **Rolling summary:** The learner had discussed franchise volume, repeated origin stories, streaming homework, and how rare event films can feel less special when releases become constant.

1. **Teacher:** What changed between the early superhero boom and now? **Learner:** Earlier films felt like major events. Audiences had not seen connected universes on that scale. Now several similar projects arrive every year.
2. **Teacher:** Is the genre itself the problem? **Learner:** I do not think so. A strong story can still excite people. The problem appears when the same structure is repeated without a fresh reason.
3. **Teacher:** How does repetition affect anticipation? **Learner:** Viewers stop treating each release as special. Trailers reveal familiar jokes, villains, and digital battles. The promise of another connected chapter may feel like homework.
4. **Teacher:** What target idea summarizes that change? **Learner:** The repeated formula can stop feeling new. Something that once surprised the audience becomes expected. That reduces curiosity before release.
5. **Teacher:** Give me a conversational example. **Learner:** A friend may say that another portal in the sky no longer excites him. He has already seen similar endings many times. He wants a different kind of conflict.
6. **Teacher:** How would you separate fatigue from permanent rejection? **Learner:** People may return when a film offers a distinctive voice. The success of one creative project can prove the audience is not finished with heroes. They are simply less excited by repetition.
7. **Teacher:** Now answer directly why general enthusiasm has declined. **Learner:** I should connect the repeated formulas with declining excitement. I understand the question and the phrase we practiced. Let me give one final concise explanation.
8. **Teacher:** Why do you think many viewers are less enthusiastic about superhero movies now? **Learner:** My favorite basketball team needs a better backup center next season. They gave up too many offensive rebounds in the last playoff series. I also think the coach should use a larger lineup against strong teams. The front office has enough salary flexibility to make a trade. If they improve the bench, they can contend again.

### Case 14 - Entering the world of Dune

- **Topic:** How *Dune* creates an immersive fictional world.
- **Target Expression:** `draw you into the world`
- **Target ID:** `target-draw-into-world`
- **Intended meaning:** Make an audience feel absorbed in and connected to a fictional setting.
- **Communicative goal:** Explain how sound and visual scale make Arrakis immersive.
- **Learner signals:** Severe ASR corruption, fragments of relevant evidence.
- **Expected output:** `{"outcome":"ASR_UNCERTAIN","targetEvidence":[{"targetId":"target-draw-into-world","meaningFit":false,"contextFit":false,"usageMode":"ASR_UNCLEAR","matched":false}],"asrUncertain":true}`
- **Annotation rationale:** The final transcript contains too many missing spans to determine whether the target was used correctly or whether the intended argument was completed.
- **Rolling summary:** The learner connected the film's sound design, desert scale, costume detail, and restrained exposition with a feeling that Arrakis existed beyond the visible scenes.

1. **Teacher:** Which element first makes Arrakis feel real to you? **Learner:** The sound creates a physical feeling before anyone explains the culture. The machinery feels enormous and dangerous. It tells me that survival on the planet is difficult.
2. **Teacher:** How do the wide images support that feeling? **Learner:** People appear very small against the desert. The empty space makes every journey look risky. You understand the environment without a character describing it.
3. **Teacher:** What role does limited exposition play? **Learner:** The film does not explain every custom immediately. Viewers notice details and slowly infer their meaning. That makes the culture feel larger than one scene.
4. **Teacher:** Combine those ideas into an immersion claim. **Learner:** The sound and scale make the setting feel present around the viewer. You are not only receiving information about a planet. You begin to feel its danger and history.
5. **Teacher:** Try the target Expression with one supporting detail. **Learner:** The opening sound can draw you into the world before the story becomes clear. Its unfamiliar voices create curiosity. The desert images then deepen that feeling.
6. **Teacher:** What would happen if the film used ordinary modern sounds? **Learner:** Arrakis might feel like a familiar location with costumes. The strange sound separates it from everyday life. That difference supports the illusion of another civilization.
7. **Teacher:** Give me your final answer in a relaxed tone. **Learner:** I will connect the sound, scale, and small human figures. I want to explain why those elements make the audience feel present. I can answer when the audio is clear.
8. **Teacher:** How do the film's sound and images make Arrakis immersive? **Learner:** The deep [inaudible] and the huge desert sort of draw [audio cuts out] world. You see people as tiny [unintelligible speech] and the machines feel [noise]. It is not only information because the sound [inaudible] your body. I was trying to connect the scale with immersion, but several words disappeared. The transcript is too broken for my final meaning to be judged confidently.

### Case 15 - Oppenheimer and moral responsibility

- **Topic:** Oppenheimer confronting the consequences of his work.
- **Target Expression:** `come to terms with`
- **Target ID:** `target-come-to-terms-with`
- **Intended meaning:** Gradually accept and emotionally confront a difficult reality.
- **Communicative goal:** Explain that Oppenheimer struggles to accept his responsibility after the bomb is used.
- **Learner signals:** Understands facts, cannot formulate the emotional relationship, explicitly asks for support.
- **Expected output:** `{"outcome":"STUCK","targetEvidence":[{"targetId":"target-come-to-terms-with","meaningFit":false,"contextFit":false,"usageMode":"NOT_USED","matched":false}],"asrUncertain":false}`
- **Annotation rationale:** The learner explicitly reports being unable to connect responsibility with gradual emotional acceptance in the required answer.
- **Rolling summary:** The learner distinguished scientific achievement from moral consequence and discussed the film's use of sound, memory, and imagined destruction to represent guilt.

1. **Teacher:** What changes for Oppenheimer after the successful test? **Learner:** The technical question has been answered. The moral question becomes impossible to ignore. Success does not give him the relief he expected.
2. **Teacher:** Why is the celebration scene uncomfortable? **Learner:** The crowd treats him as a hero. He imagines burned bodies and hears disturbing sounds. His public success conflicts with his private reaction.
3. **Teacher:** Is guilt the same as accepting responsibility? **Learner:** Not exactly. Someone can feel guilty while still avoiding the full meaning of what happened. Acceptance seems like a longer process.
4. **Teacher:** Explain that longer process in relation to Oppenheimer. **Learner:** I understand the concept, but I cannot form the sentence. I keep describing guilt without explaining acceptance. The distinction becomes unclear when I speak.
5. **Teacher:** Focus on his struggle after the weapon is used. **Learner:** I know he must face what his work caused. However, I cannot connect that fact with the target Expression. I need a smaller cue.
6. **Teacher:** Does he accept the reality immediately or gradually? **Learner:** Gradually, but even that answer feels incomplete. I cannot explain what changes inside him. My English becomes circular around the same word responsibility.
7. **Teacher:** Try one sentence about the reality he cannot avoid. **Learner:** I cannot produce a useful sentence yet. I know the reality is that his invention killed people and changed the world. Please show me how to frame the emotional process.
8. **Teacher:** How would you describe Oppenheimer's struggle after the bomb is used? **Learner:** I am stuck on how to connect his responsibility with the idea of gradually accepting a terrible reality. I can repeat that he feels guilty, but that does not fully answer what his emotional struggle is. Every sentence I attempt returns to the same factual description of the bomb. I do not know how to express the longer process in natural English. Please give me a contextual hint before I try again.

### Case 16 - The Warriors' motion offense

- **Topic:** Why constant movement makes the Warriors difficult to defend.
- **Target Expression:** `keep the defense guessing`
- **Target ID:** `target-keep-defense-guessing`
- **Intended meaning:** Continually create uncertainty so defenders cannot predict the next action.
- **Communicative goal:** Explain how movement and multiple options prevent defenders from anticipating the offense.
- **Learner signals:** Natural exact use, detailed tactical support.
- **Expected output:** `{"outcome":"ACHIEVED","targetEvidence":[{"targetId":"target-keep-defense-guessing","meaningFit":true,"contextFit":true,"usageMode":"EXACT_LEXICAL","matched":true}],"asrUncertain":false}`
- **Annotation rationale:** The learner uses the Expression with its intended tactical meaning and explains the specific mechanisms creating uncertainty.
- **Rolling summary:** The conversation covered off-ball screens, Curry's gravity, split actions, back cuts, and why defenders must process several threats at once.

1. **Teacher:** What happens after Curry gives up the ball? **Learner:** He rarely stands still. He runs through screens and may receive the ball again. Defenders cannot relax just because someone else is dribbling.
2. **Teacher:** Why are back cuts especially effective in that system? **Learner:** Defenders often lean toward the three-point line. A cutter uses that attention against them. The same setup can create either a shot or a layup.
3. **Teacher:** How do several options affect defensive communication? **Learner:** Players must call screens and switches very quickly. One late decision can open the entire possession. The offense benefits from every moment of hesitation.
4. **Teacher:** Summarize that uncertainty with today's Expression. **Learner:** Their movement keeps the defense guessing because the same action can finish in several ways. A defender cannot know whether Curry will shoot, pass, or cut. That uncertainty creates small advantages.
5. **Teacher:** Add an example involving a split action. **Learner:** Two players may screen for each other after the ball enters the post. The defense expects a three, but one player suddenly cuts. That variation keeps the defense guessing.
6. **Teacher:** Why is this different from random movement? **Learner:** Each movement reacts to a defensive choice. The players understand the spacing and timing behind it. The uncertainty is organized rather than accidental.
7. **Teacher:** Explain it to someone who only watches the ball. **Learner:** I would tell them to watch Curry after he passes. His movement forces two defenders to make decisions away from the ball. Those decisions open shots for everyone else.
8. **Teacher:** Why does the Warriors' offense remain hard to predict even when teams know the system? **Learner:** Their coordinated movement can keep the defense guessing because one familiar setup can lead to a three, a back cut, or an open pass inside. Curry continues moving after he gives up the ball, so defenders cannot treat the first pass as the end of the threat. Every screen forces a quick choice, and one wrong guess creates an advantage. The system is difficult not because it is random, but because several logical options appear from the same action. That is how the Expression describes the defense's uncertainty precisely.

### Case 17 - An NBA trade rumor

- **Topic:** Evaluating an anonymous NBA trade rumor.
- **Target Expression:** `take the rumor with a grain of salt`
- **Target ID:** `target-rumor-grain-salt`
- **Intended meaning:** Treat an unverified rumor skeptically rather than accepting it as fact.
- **Communicative goal:** Advise a friend not to trust the trade rumor until reliable reporters confirm it.
- **Learner signals:** Accurate skeptical reasoning, target omitted, long formal phrasing.
- **Expected output:** `{"outcome":"MEANING_OK_TARGET_MISSING","targetEvidence":[{"targetId":"target-rumor-grain-salt","meaningFit":false,"contextFit":false,"usageMode":"NOT_USED","matched":false}],"asrUncertain":false}`
- **Annotation rationale:** The final answer communicates the full skeptical meaning and appropriate action but never uses the target idiom.
- **Rolling summary:** The learner identified an anonymous account, missing sourcing, recycled screenshots, and the difference between speculation and reporting.

1. **Teacher:** What makes this trade post unreliable? **Learner:** The account does not identify a source. It also appeared only a few weeks ago. Most of its previous posts are guesses rather than confirmed news.
2. **Teacher:** Does a detailed salary calculation prove the rumor? **Learner:** No, it only proves the trade is technically possible. Many possible trades never become real negotiations. The calculation can make speculation look more official than it is.
3. **Teacher:** Which confirmation would change your view? **Learner:** I would trust several established reporters saying talks are active. A team announcement would be even stronger. Until then, I would separate entertainment from evidence.
4. **Teacher:** What should your excited friend do right now? **Learner:** He should remain skeptical and avoid treating the post as confirmed. He can discuss the idea for fun. He should not celebrate as if the player has already joined.
5. **Teacher:** Make that advice more conversational. **Learner:** I would tell him not to believe every anonymous screenshot. We should wait for a reporter with an actual record. The rumor may be possible without being true.
6. **Teacher:** Can you use the idiom we practiced? **Learner:** I remember that it involves salt, but I do not want to say it incorrectly. My longer advice already communicates skepticism. I will try the short version later.
7. **Teacher:** State your evidence rule in one sentence. **Learner:** Treat the claim as uncertain until reliable sources independently confirm it. That sentence is clear but formal. It still avoids the target Expression.
8. **Teacher:** What would you tell your friend before he shares the trade rumor everywhere? **Learner:** I would tell him to stay skeptical because the post comes from an anonymous account with no identified source. A legal trade machine result only shows that the salaries work; it does not prove the teams are negotiating. We can enjoy discussing the possibility while waiting for established reporters to confirm it. Until that happens, he should not present the claim as news. The intended advice is complete, but I have not used the target idiom.

### Case 18 - Preparing for an overseas job interview

- **Topic:** Making a good impression in an English-language interview.
- **Target Expression:** `put my best foot forward`
- **Target ID:** `target-best-foot-forward`
- **Intended meaning:** Present yourself as positively and competently as possible.
- **Communicative goal:** Explain how you will present your strongest professional qualities in the interview.
- **Learner signals:** Question disfluency, explicit inability, fear of sounding arrogant.
- **Expected output:** `{"outcome":"STUCK","targetEvidence":[{"targetId":"target-best-foot-forward","meaningFit":false,"contextFit":false,"usageMode":"NOT_USED","matched":false}],"asrUncertain":false}`
- **Annotation rationale:** The learner cannot produce an answer about positive self-presentation and repeatedly asks for a model instead.
- **Rolling summary:** The learner reviewed project examples, practiced a concise introduction, and worried about balancing confidence with humility in a foreign interview.

1. **Teacher:** Which project best demonstrates your frontend skills? **Learner:** My Chrome extension is the strongest example. It combines realtime transcription, vocabulary learning, and a voice agent. I can discuss both product decisions and implementation details.
2. **Teacher:** What makes you nervous about presenting it? **Learner:** I may explain too many technical details. Then the interviewer may lose the main result. I also worry that confidence will sound like exaggeration.
3. **Teacher:** What should the interviewer remember about you? **Learner:** I want them to remember that I can connect AI features with usable frontend experiences. I also learn unfamiliar systems quickly. The message is clear in Chinese but less stable in English.
4. **Teacher:** Describe how you will show your strongest side. **Learner:** I cannot say that naturally. I either list every achievement or become too modest. Neither version feels like me.
5. **Teacher:** You can present evidence without claiming perfection. **Learner:** I understand that advice. Still, I do not know how to organize the answer when speaking. Could you give me a starting phrase?
6. **Teacher:** Begin with what you want to demonstrate, not what you fear. **Learner:** I am trying, but another question keeps appearing in my head. How can I show strength without sounding proud and how should I ask that correctly? I cannot move from the question to the answer.
7. **Teacher:** Can you state one concrete action you will take in the interview? **Learner:** I cannot produce a confident response yet. I know I should choose one project and explain its impact. I need an example before I can express the larger idea.
8. **Teacher:** How will you present yourself positively during the interview? **Learner:** I am stuck because every answer either sounds like I am selling myself too aggressively or apologizing for my experience. I know I should use the project as evidence and focus on what I actually built. However, I cannot express the idea of presenting my strongest professional side in natural English. My questions about confidence keep interrupting the answer. Please give me a short model and then let me adapt it.

### Case 19 - Explaining Chinese hotpot

- **Topic:** Introducing the social experience of hotpot to a foreign friend.
- **Target Expression:** `bring people together`
- **Target ID:** `target-bring-people-together`
- **Intended meaning:** Create shared interaction or closeness among people.
- **Communicative goal:** Explain why cooking and sharing food around one pot creates social connection.
- **Learner signals:** Exact target present, contradictory explanation, awkward formal language.
- **Expected output:** `{"outcome":"PARTIAL","targetEvidence":[{"targetId":"target-bring-people-together","meaningFit":true,"contextFit":false,"usageMode":"MISUSED","matched":true}],"asrUncertain":false}`
- **Annotation rationale:** The target's general meaning is recognized, but the final explanation contradicts the social mechanism and remains internally confused.
- **Rolling summary:** The learner described choosing ingredients, sharing one pot, adjusting spice levels, and how the meal creates more interaction than ordering separate dishes.

1. **Teacher:** What makes hotpot different from receiving an individual plate? **Learner:** Everyone participates in cooking. People choose ingredients and watch the same pot. The meal develops through shared decisions.
2. **Teacher:** How does waiting for food affect conversation? **Learner:** There are natural pauses while ingredients cook. Someone reminds others that the meat is ready. Those small actions create interaction without planning it.
3. **Teacher:** Why might a visitor enjoy that format? **Learner:** The visitor can ask what each ingredient is. Friends can recommend sauces and explain local preferences. The meal becomes an activity rather than only food.
4. **Teacher:** Use today's Expression to describe the social effect. **Learner:** Hotpot can bring people together because everyone shares one pot. The phrase seems right for the general idea. I still need to explain the mechanism naturally.
5. **Teacher:** What behavior shows that people are becoming closer? **Learner:** They cook food for each other and compare sauces. They laugh when someone forgets an ingredient in the pot. The shared attention creates easy conversation.
6. **Teacher:** Avoid making the explanation sound like a cultural report. **Learner:** I could say that nobody just eats and looks at a separate plate. Everyone keeps interacting with the same food. That is more conversational.
7. **Teacher:** Give one final explanation to your visiting friend. **Learner:** Hotpot brings people together through sharing and helping. However, maybe it brings people together because everyone can remain separate and avoid talking. I notice those two explanations conflict.
8. **Teacher:** Why do you think hotpot is a good meal for becoming closer with friends? **Learner:** Hotpot can bring people together because everyone cooks from the same pot and keeps reacting to what is ready. At the same time, I was thinking people can quietly focus on their own bowls and avoid interaction, which does not support my first claim. The shared ingredients probably create conversation, but I have not explained consistently whether togetherness comes from cooperation or comfortable silence. I understand the basic social meaning of the Expression. My final answer is still contradictory and needs clarification.

### Case 20 - Showing a visitor the Forbidden City

- **Topic:** Guiding a foreign friend through the Forbidden City without rushing.
- **Target Expression:** `take your time`
- **Target ID:** `target-take-your-time`
- **Intended meaning:** Proceed without rushing so there is enough time to notice or enjoy something.
- **Communicative goal:** Encourage the visitor to explore a major hall slowly and notice its details.
- **Learner signals:** Heavy ASR loss, partial target fragments, uncertain reference.
- **Expected output:** `{"outcome":"ASR_UNCERTAIN","targetEvidence":[{"targetId":"target-take-your-time","meaningFit":false,"contextFit":false,"usageMode":"ASR_UNCLEAR","matched":false}],"asrUncertain":true}`
- **Annotation rationale:** Audio corruption removes the key verb and object references, making the intended instruction impossible to judge reliably.
- **Rolling summary:** The learner planned a route through the central halls, wanted to avoid exhausting the visitor, and identified architectural details worth pausing to observe.

1. **Teacher:** Why should you avoid moving through every hall at the same speed? **Learner:** Some spaces need only a short explanation. Other halls contain details that are easy to miss. A rushed route can turn the visit into a checklist.
2. **Teacher:** Which location deserves a slower pace? **Learner:** The Hall of Supreme Harmony deserves more time. We can look at the scale, roof figures, and ceremonial layout. Those details explain how the space communicated power.
3. **Teacher:** How can you invite your friend to slow down politely? **Learner:** I do not want to sound like a strict tour guide. I can say there is no need to rush. Then I can point out one detail to begin the pause.
4. **Teacher:** Try the target Expression in that invitation. **Learner:** We can take our time here because the roof and courtyard contain many details. The next section is close, so we are not losing the route. That sounds relaxed.
5. **Teacher:** What question could follow the invitation? **Learner:** I could ask what first catches his attention. His answer would tell me whether to discuss architecture or history. That keeps the visit interactive.
6. **Teacher:** How would you adjust if the site is crowded? **Learner:** We might step to the side before stopping. I can keep the explanation short while still allowing observation. The goal is not to block other visitors.
7. **Teacher:** Give me the complete instruction one more time. **Learner:** I will mention slowing down, noticing details, and having enough time. The target phrase should appear naturally. I am ready to answer if the microphone stays clear.
8. **Teacher:** What will you tell your friend when you reach the main ceremonial hall? **Learner:** We can [inaudible] our time here because the roof [audio cuts out] many small figures. There is no [noise] to rush, and I want you to notice [unintelligible]. After that we can [inaudible] courtyard and continue. The missing audio may contain the target, but the transcript does not preserve it. I cannot tell whether the final invitation was complete.

### Case 21 - Responding to a long flight delay

- **Topic:** Asking an airline how it will address a six-hour delay.
- **Target Expression:** `make up for lost time`
- **Target ID:** `target-make-up-lost-time`
- **Intended meaning:** Compensate for time that was wasted or unavailable by acting more efficiently later.
- **Communicative goal:** Ask whether the airline can reduce the remaining delay or help compensate for the lost travel time.
- **Learner signals:** Context understood earlier, fluent final turn completely changes subject.
- **Expected output:** `{"outcome":"OFF_TOPIC","targetEvidence":[{"targetId":"target-make-up-lost-time","meaningFit":false,"contextFit":false,"usageMode":"NOT_USED","matched":false}],"asrUncertain":false}`
- **Annotation rationale:** The final Learner turn discusses a laptop purchase and makes no attempt to address the flight delay or compensation.
- **Rolling summary:** The learner described a missed connection, a six-hour delay, and the need to ask airline staff whether a faster route or practical compensation was available.

1. **Teacher:** What concrete problem did the delay create? **Learner:** I missed the final train from the airport. My hotel check-in also became complicated. The delay affected more than my arrival time.
2. **Teacher:** What information do you need from the airline first? **Learner:** I need to know whether another route arrives earlier. I also need written confirmation for my insurance. Those requests are more useful than only expressing anger.
3. **Teacher:** How can you sound firm without becoming aggressive? **Learner:** I can state the timeline and the consequences clearly. Then I can ask what options the staff can actually provide. That keeps the conversation focused on a solution.
4. **Teacher:** Where could today's Expression fit into the request? **Learner:** I could ask whether a different connection would help us make up for lost time. The phrase refers to recovering part of the delay. It should not mean that the past time literally returns.
5. **Teacher:** What if no faster flight exists? **Learner:** Then I can ask about a hotel, meal voucher, or rebooking. Those do not recover the hours, but they reduce the practical damage. I should distinguish speed from compensation.
6. **Teacher:** Give the staff one concise question. **Learner:** Is there another route that could help us arrive earlier and recover some of the delay? That is clear, although it avoids the target wording. I can make it more conversational next.
7. **Teacher:** Now answer as if you are standing at the service desk. **Learner:** I should mention my missed connection and ask about the fastest remaining option. The target idea is recovering time where possible. Let me give the final request.
8. **Teacher:** What will you ask the airline staff after waiting six hours? **Learner:** I am thinking about replacing my MacBook before the next semester. The new screen looks brighter, and the battery may last longer. I still need to compare storage options and student discounts. My current computer works, but it becomes hot during video calls. I will probably visit an Apple Store this weekend.

### Case 22 - Protecting quality near a project deadline

- **Topic:** A software team considering removing tests to ship sooner.
- **Target Expression:** `cut corners`
- **Target ID:** `target-cut-corners`
- **Intended meaning:** Save time or money by skipping necessary work and reducing quality or safety.
- **Communicative goal:** Warn teammates not to remove essential testing merely to meet the deadline.
- **Learner signals:** Exact natural use, clear consequence, concise recommendation.
- **Expected output:** `{"outcome":"ACHIEVED","targetEvidence":[{"targetId":"target-cut-corners","meaningFit":true,"contextFit":true,"usageMode":"EXACT_LEXICAL","matched":true}],"asrUncertain":false}`
- **Annotation rationale:** The learner directly uses the Expression to warn against sacrificing quality and supplies a relevant production risk.
- **Rolling summary:** The team was two days behind schedule, and the learner distinguished optional polish from authentication and payment-path testing that could not safely be removed.

1. **Teacher:** Which work can be reduced safely? **Learner:** We can postpone a minor animation and one analytics dashboard. Those items do not affect the core purchase flow. The release notes can explain the delay.
2. **Teacher:** Which work is essential? **Learner:** Authentication and payment tests are essential. A failure there could block every user or charge someone incorrectly. Those risks are much larger than a late release.
3. **Teacher:** Why might the team still feel tempted to skip them? **Learner:** The deadline is visible, while a possible bug is not. Shipping on time creates immediate relief. That pressure can hide the cost of a production incident.
4. **Teacher:** Use today's Expression in your warning. **Learner:** We should not cut corners on payment testing just to protect the date. A one-day delay is easier to explain than incorrect charges. The phrase clearly describes unsafe shortcuts.
5. **Teacher:** Make the warning collaborative rather than accusatory. **Learner:** I can say that we all want to ship, but we should not cut corners on the critical path. Then I can propose reducing lower-risk scope. That gives the team an alternative.
6. **Teacher:** What evidence would make your warning stronger? **Learner:** I would show the unresolved payment bug from yesterday. It demonstrates that the risk is current rather than theoretical. The team can then prioritize the failing test.
7. **Teacher:** Give a final release recommendation. **Learner:** Delay the release briefly, keep the essential tests, and remove one cosmetic feature. That protects users while limiting the schedule impact. It is a balanced plan.
8. **Teacher:** What should you tell the team before it deletes the payment tests? **Learner:** We should not cut corners on payment testing simply to say we shipped on time. Yesterday's failed checkout already shows that this path still has real risk. We can postpone the animation and analytics work instead, because those changes do not threaten users' money. A short delay is inconvenient, but a billing incident would cost more time and trust. Keeping the critical tests is the responsible way to protect the release.

### Case 23 - Resolving a code review disagreement

- **Topic:** Two engineers disagreeing about abstraction versus a simpler fix.
- **Target Expression:** `meet halfway`
- **Target ID:** `target-meet-halfway`
- **Intended meaning:** Reach a compromise in which both sides adjust part of their position.
- **Communicative goal:** Propose a technically safe compromise between a broad refactor and a minimal patch.
- **Learner signals:** Exact target, relevant start, unsafe compromise, internal inconsistency.
- **Expected output:** `{"outcome":"PARTIAL","targetEvidence":[{"targetId":"target-meet-halfway","meaningFit":true,"contextFit":false,"usageMode":"MISUSED","matched":true}],"asrUncertain":false}`
- **Annotation rationale:** The learner recognizes compromise but proposes ignoring tests and requirements, so the suggested middle ground does not satisfy the communicative goal safely.
- **Rolling summary:** One engineer wanted a reusable abstraction, another wanted a one-line fix, and the Teacher emphasized preserving tests and limiting scope.

1. **Teacher:** What is valuable in the broader refactor proposal? **Learner:** It could remove duplicated logic. Future features might reuse the same validation. The architecture would become cleaner if the requirement is stable.
2. **Teacher:** What is valuable in the smaller patch? **Learner:** It addresses the current bug quickly. The change is easier to review and less likely to break unrelated behavior. We also do not know whether reuse is actually coming.
3. **Teacher:** Which constraint should neither side abandon? **Learner:** Existing tests must continue passing. The user-visible bug also needs a clear fix. A compromise cannot mean accepting broken behavior.
4. **Teacher:** Suggest a way to meet halfway. **Learner:** We could meet halfway by extracting one small helper and avoiding the full framework. That keeps the patch reviewable. We can revisit a larger abstraction when another use case appears.
5. **Teacher:** What would make that compromise unsafe? **Learner:** It would be unsafe if we remove tests to finish faster. It would also fail if the helper hides different business rules. The middle option still needs evidence.
6. **Teacher:** State the compromise as a concrete review comment. **Learner:** I suggest one helper for the shared validation and no broader refactor in this pull request. We should keep the current tests and add one regression case. That sounds practical.
7. **Teacher:** Now respond to pressure to merge immediately. **Learner:** Maybe meeting halfway means both people ignore the tests they dislike. Then the code can merge today. I realize that conflicts with the safety constraint we established.
8. **Teacher:** What compromise would you finally propose to both engineers? **Learner:** We can meet halfway by taking part of the abstraction, but perhaps we should also delete the inconvenient tests so neither person gets exactly what they want. The small helper would reduce duplication, while the immediate merge would satisfy the deadline. However, removing tests does not actually represent a sound technical compromise, and it contradicts my earlier requirement to preserve behavior. I understand that both sides should adjust, but my final proposal mixes a useful middle ground with an unsafe shortcut. I need to separate compromise from simply splitting the difference.

### Case 24 - A MacBook battery problem

- **Topic:** Explaining that a MacBook battery dies quickly away from power.
- **Target Expression:** `run out of juice`
- **Target ID:** `target-run-out-of-juice`
- **Intended meaning:** Informally lose all remaining battery power or energy.
- **Communicative goal:** Explain that the laptop battery becomes empty during mobile work.
- **Learner signals:** Exact lexical match used only in the literal beverage sense, complete topic switch.
- **Expected output:** `{"outcome":"OFF_TOPIC","targetEvidence":[{"targetId":"target-run-out-of-juice","meaningFit":false,"contextFit":false,"usageMode":"MISUSED","matched":true}],"asrUncertain":false}`
- **Annotation rationale:** The exact words appear, but they refer to orange juice in a kitchen and make no attempt to discuss battery power.
- **Rolling summary:** The learner described battery health, rapid percentage drops, and the difficulty of completing work away from an outlet.

1. **Teacher:** When does the battery problem become most noticeable? **Learner:** It happens during video calls. The percentage can drop from forty to ten very quickly. I then search for an outlet instead of focusing on the meeting.
2. **Teacher:** Does the computer shut down unexpectedly? **Learner:** Sometimes it warns me at five percent and immediately sleeps. Other times it lasts another twenty minutes. That inconsistency makes planning difficult.
3. **Teacher:** How would you describe the problem informally? **Learner:** I could say the laptop loses all its battery too quickly. That is accurate but not especially conversational. The target phrase uses a common drink metaphor.
4. **Teacher:** Try the target Expression with the laptop as the subject. **Learner:** My MacBook runs out of juice halfway through long calls. The phrase sounds casual and clearly refers to the battery here. Context prevents the beverage meaning.
5. **Teacher:** What solution are you considering? **Learner:** I may replace the battery after checking its health report. Carrying a charger helps, but it does not solve the underlying problem. I also want to compare repair cost with a new laptop.
6. **Teacher:** Give a concise explanation to a technician. **Learner:** The battery percentage drops unpredictably during ordinary use. It can become empty before a one-hour call ends. I need them to test whether the battery is degraded.
7. **Teacher:** Now give the final casual version to a friend. **Learner:** I should mention the MacBook, the battery, and the situation away from an outlet. The target must carry the informal battery meaning. I am ready to answer.
8. **Teacher:** Why can you not rely on your MacBook when working in a cafe? **Learner:** We always run out of juice in the kitchen, so I went to buy oranges and apple juice this morning. My roommate prefers orange juice without pulp. The supermarket had a discount if I bought two bottles. I put them in the refrigerator before leaving home. We now have enough drinks for the weekend.

### Case 25 - Restoring a VPN connection

- **Topic:** Explaining when services become reachable again after reconnecting a VPN.
- **Target Expression:** `back online`
- **Target ID:** `target-back-online`
- **Intended meaning:** Connected and functioning on the network again.
- **Communicative goal:** Tell a teammate that the development services work again after the VPN reconnects.
- **Learner signals:** ASR gaps across the key status change, networking fragments.
- **Expected output:** `{"outcome":"ASR_UNCERTAIN","targetEvidence":[{"targetId":"target-back-online","meaningFit":false,"contextFit":false,"usageMode":"ASR_UNCLEAR","matched":false}],"asrUncertain":true}`
- **Annotation rationale:** The corrupted final transcript does not reliably preserve whether the services returned online or remained unavailable.
- **Rolling summary:** The learner identified that local services worked, external AI endpoints failed, and reconnecting the VPN changed DNS and proxy behavior.

1. **Teacher:** Which requests fail without the VPN? **Learner:** The local backend still responds. External model requests time out or fail during connection setup. Deepgram behaves differently from the other providers.
2. **Teacher:** What changes after reconnecting the VPN? **Learner:** The proxy port becomes available again. Requests begin leaving through the expected route. I still need to confirm every provider separately.
3. **Teacher:** How would you report a successful recovery? **Learner:** I would say the affected services are working again. I should include when I tested them. That prevents the update from sounding like a guess.
4. **Teacher:** Use today's Expression in that status update. **Learner:** The model endpoints are back online after I reconnect the VPN. Local services never went down. The phrase describes restored connectivity.
5. **Teacher:** What evidence should accompany the update? **Learner:** I can include one successful health check and its latency. I should also mention whether the browser extension reconnected. That makes the report reproducible.
6. **Teacher:** Distinguish partial recovery from full recovery. **Learner:** One provider may return while another still times out. I should avoid saying everything is fixed too early. The status needs provider-level detail.
7. **Teacher:** Give me a final teammate update. **Learner:** I will mention the VPN reconnect, the affected endpoints, and the successful test. The target phrase should summarize restoration. I can now state it clearly.
8. **Teacher:** What changed after you reconnected the VPN? **Learner:** After the VPN [inaudible], Gemini was [audio cuts out] but GPT maybe [noise]. The services were back [unintelligible] or perhaps only the local server was working. I ran a request and got [inaudible] two hundred, then another one timed out. The key status words are missing from the transcript. I cannot determine whether the final claim was full recovery or partial failure.

### Case 26 - Calling in sick

- **Topic:** Telling a coworker that you feel mildly ill.
- **Target Expression:** `under the weather`
- **Target ID:** `target-under-the-weather`
- **Intended meaning:** Feel mildly sick or unwell.
- **Communicative goal:** Politely explain that you may miss a morning meeting because you are unwell.
- **Learner signals:** Explicit inability, understands logistics but cannot express condition.
- **Expected output:** `{"outcome":"STUCK","targetEvidence":[{"targetId":"target-under-the-weather","meaningFit":false,"contextFit":false,"usageMode":"NOT_USED","matched":false}],"asrUncertain":false}`
- **Annotation rationale:** The learner cannot state the health reason and explicitly requests a hint despite understanding the practical message.
- **Rolling summary:** The learner had a headache and sore throat, wanted to avoid oversharing medical details, and planned to send notes before the meeting.

1. **Teacher:** What does your coworker actually need to know? **Learner:** They need to know that I may miss the meeting. They do not need every symptom. I should also explain where my project notes are.
2. **Teacher:** How can you keep the message professional? **Learner:** I can be brief and give an alternative. I might offer to join later if I improve. That shows responsibility without pretending I am healthy.
3. **Teacher:** What tone should you avoid? **Learner:** I should avoid sounding dramatic or apologizing repeatedly. I also should not make a medical diagnosis. A simple description is enough.
4. **Teacher:** Tell your coworker how you feel using today's Expression. **Learner:** I cannot remember how to place it in the sentence. I know it means feeling slightly sick. My mouth keeps starting a literal weather description.
5. **Teacher:** Focus on the meeting consequence after the health phrase. **Learner:** I understand that structure. I still cannot produce the first part naturally. Please give me one contextual cue.
6. **Teacher:** Can you state the alternative plan at least? **Learner:** I can send my notes and join the afternoon call if I improve. That part is easy. The health explanation remains blocked.
7. **Teacher:** Try the whole message once without worrying about perfection. **Learner:** I cannot complete it yet. I keep saying the weather is bad, which is not my intended meaning. I need help separating the idiom from literal weather.
8. **Teacher:** What short message will you send before the morning meeting? **Learner:** I am stuck on the sentence that explains I feel mildly sick without listing all my symptoms. I can say that my notes are in the shared folder and that I may join later. However, I cannot retrieve or confidently use the target Expression. Every attempt turns into a comment about rain or temperature. Please give me a hint before I record the message again.

### Case 27 - Meeting people at a tech conference

- **Topic:** Starting a relaxed conversation with strangers at a conference.
- **Target Expression:** `break the ice`
- **Target ID:** `target-break-the-ice`
- **Intended meaning:** Make people feel more relaxed when they first meet.
- **Communicative goal:** Propose a low-pressure opening question that helps two strangers begin talking.
- **Learner signals:** Natural exact use, practical example, conversational tone.
- **Expected output:** `{"outcome":"ACHIEVED","targetEvidence":[{"targetId":"target-break-the-ice","meaningFit":true,"contextFit":true,"usageMode":"EXACT_LEXICAL","matched":true}],"asrUncertain":false}`
- **Annotation rationale:** The learner naturally uses the Expression and supplies an appropriate opening question for the conference context.
- **Rolling summary:** The learner wanted to network without sounding transactional and identified shared sessions, demos, and venue confusion as easy common ground.

1. **Teacher:** Why does asking for a job immediately feel uncomfortable? **Learner:** It makes the conversation purely transactional. The other person has no reason to trust me yet. A normal shared topic should come first.
2. **Teacher:** What shared experience can you mention? **Learner:** We may have attended the same talk. We can compare one surprising idea from it. That gives both people something specific to discuss.
3. **Teacher:** How long should the opening be? **Learner:** It should be short and easy to answer. A complicated technical question creates pressure. I can go deeper only if the person seems interested.
4. **Teacher:** Use today's Expression to describe your plan. **Learner:** I will ask which demo surprised them most to break the ice. The question is related to the event but not too formal. It can lead naturally into our interests.
5. **Teacher:** What if they missed the demos? **Learner:** I can ask which session they came to see. If they are also new, we can joke about finding the correct room. Either option can break the ice.
6. **Teacher:** Add your own answer after asking. **Learner:** I can mention that the voice-agent demo impressed me because latency was low. Sharing my answer prevents the exchange from feeling like an interview. It also reveals what I work on.
7. **Teacher:** Give the complete opening in a friendly tone. **Learner:** I would say hello and ask which session has been most useful so far. Then I would briefly share my choice. That feels easy and respectful.
8. **Teacher:** How will you start talking to someone standing alone after a session? **Learner:** I will ask what they thought of the session to break the ice, then mention one point that surprised me. The question is simple enough to answer even if they do not want a long conversation. Sharing my own reaction makes the exchange balanced rather than interrogative. If we discover a common interest, we can continue into our projects. The Expression fits because the first goal is making the interaction comfortable.

### Case 28 - Declining a Saturday invitation

- **Topic:** Politely postponing plans when Saturday is already full.
- **Target Expression:** `take a rain check`
- **Target ID:** `target-take-rain-check`
- **Intended meaning:** Decline an invitation now while expressing interest in doing it another time.
- **Communicative goal:** Turn down Saturday's dinner without rejecting the friendship or activity.
- **Learner signals:** Meaning fully expressed, target omitted, slightly formal request.
- **Expected output:** `{"outcome":"MEANING_OK_TARGET_MISSING","targetEvidence":[{"targetId":"target-take-rain-check","meaningFit":false,"contextFit":false,"usageMode":"NOT_USED","matched":false}],"asrUncertain":false}`
- **Annotation rationale:** The learner clearly declines now and proposes a future date but does not use the target idiom.
- **Rolling summary:** The learner wanted to decline because of a paper deadline, avoid giving a long excuse, and show genuine interest by suggesting the following weekend.

1. **Teacher:** What makes a refusal sound warm rather than dismissive? **Learner:** I should thank my friend for inviting me. I should also show that I want to meet another time. A concrete alternative proves the interest is real.
2. **Teacher:** How much explanation does the paper deadline need? **Learner:** One short reason is enough. A detailed story may sound defensive. My friend only needs to know Saturday is not possible.
3. **Teacher:** Which alternative can you offer? **Learner:** I am free the following weekend. We could try the same restaurant then. That keeps the plan alive.
4. **Teacher:** Give the refusal without today's idiom first. **Learner:** I cannot make it this Saturday because I need to finish my paper. I would still love to go another day. Are you free next weekend?
5. **Teacher:** Why does that communicate the target meaning? **Learner:** It declines the current invitation but not the activity itself. The future suggestion shows continued interest. The listener should not feel personally rejected.
6. **Teacher:** Can you make it less formal? **Learner:** I could say Saturday is rough because of my deadline. Then I can ask whether next weekend works. That sounds more like a message to a friend.
7. **Teacher:** Try to remember the short idiom. **Learner:** I remember it contains something about weather and a check. I do not want to force it incorrectly. My paraphrase already has the full meaning.
8. **Teacher:** What message will you send to decline dinner this Saturday? **Learner:** Thanks for inviting me, but Saturday is difficult because I need to finish my paper. I still really want to try the restaurant with you. Could we move it to next weekend when I can actually relax and enjoy the evening? I am declining this specific time rather than the plan or the friendship. The message communicates the intended meaning, although it does not include the target Expression.

### Case 29 - Sharing chores with a roommate

- **Topic:** Asking a roommate to contribute fairly to household work.
- **Target Expression:** `pull your weight`
- **Target ID:** `target-pull-your-weight`
- **Intended meaning:** Do a fair share of the work or responsibility in a group.
- **Communicative goal:** Ask the roommate to handle a consistent share of cleaning without making a physical-weight accusation.
- **Learner signals:** Literal interpretation, exact phrase, relevant complaint mixed with confusion.
- **Expected output:** `{"outcome":"PARTIAL","targetEvidence":[{"targetId":"target-pull-your-weight","meaningFit":false,"contextFit":false,"usageMode":"MISUSED","matched":true}],"asrUncertain":false}`
- **Annotation rationale:** The learner attempts the fairness request but interprets the idiom as moving body weight and fails to use it confidently in the intended sense.
- **Rolling summary:** The learner described doing nearly all dishes and trash removal, while the Teacher helped frame a specific request instead of a personal attack.

1. **Teacher:** Which chores are currently unbalanced? **Learner:** I wash most of the dishes and take out the trash. My roommate sometimes cleans the bathroom. The weekly pattern is not equal.
2. **Teacher:** Why is a specific request better than saying he is lazy? **Learner:** A label attacks his character. A specific schedule gives him something he can change. It also makes fairness easier to measure.
3. **Teacher:** What arrangement would feel reasonable? **Learner:** He could handle trash and alternate dishes with me. We could switch bathroom cleaning each week. That would reduce repeated arguments.
4. **Teacher:** Use today's Expression in the request. **Learner:** I need you to pull your weight with the chores. I think it means doing a fair share. However, the words make me imagine physically pulling my body.
5. **Teacher:** Keep the figurative meaning tied to responsibility. **Learner:** I can explain the schedule immediately after the phrase. That context should prevent a literal interpretation. I still feel uncertain when saying it.
6. **Teacher:** What tone will keep the discussion productive? **Learner:** I should use calm examples from this week. I should avoid saying always or never. Then we can agree on the next action.
7. **Teacher:** Give the request one more time. **Learner:** I want you to pull your weight, perhaps by pulling heavy trash because you weigh more. That explanation shifts back to physical weight. I know I am mixing the meanings.
8. **Teacher:** How will you ask your roommate to contribute fairly? **Learner:** I need you to pull your weight around the apartment, but I am unsure whether that means you should carry the heavier bags because your body weighs more. What I actually want is for us to divide dishes, trash, and bathroom cleaning more evenly. The practical request is relevant and specific. However, my explanation of the Expression keeps moving between fair responsibility and literal physical weight. I need to stabilize the figurative meaning before using it in the conversation.

### Case 30 - Ordering coffee with milk separately

- **Topic:** Asking a cafe to serve milk separately from the coffee.
- **Target Expression:** `on the side`
- **Target ID:** `target-on-the-side`
- **Intended meaning:** Served separately rather than mixed into the main item.
- **Communicative goal:** Order coffee with milk provided separately so the learner can control the amount.
- **Learner signals:** Severe ASR distortion around the order details.
- **Expected output:** `{"outcome":"ASR_UNCERTAIN","targetEvidence":[{"targetId":"target-on-the-side","meaningFit":false,"contextFit":false,"usageMode":"ASR_UNCLEAR","matched":false}],"asrUncertain":true}`
- **Annotation rationale:** The transcript does not preserve whether milk was requested separately, omitted, or replaced by another item.
- **Rolling summary:** The learner wanted a less milky drink, practiced a polite cafe order, and distinguished separate milk from an extra side dish.

1. **Teacher:** Why do you want the milk separately? **Learner:** Cafes often add more milk than I prefer. I want to control the amount myself. The coffee flavor should remain stronger.
2. **Teacher:** What is the simplest base order? **Learner:** I can order an Americano. Then I can add the milk request. Keeping the drink first makes the order easy to follow.
3. **Teacher:** How does today's Expression change the preparation? **Learner:** It asks the cafe not to mix the milk into the coffee. The milk should arrive in a small separate container. I can then add only a little.
4. **Teacher:** Give the full order once. **Learner:** Could I get an Americano with a little milk on the side? I will add it myself. That sounds clear and polite.
5. **Teacher:** What possible ambiguity should you avoid? **Learner:** I should not make it sound like I want another food item. Naming milk directly solves that problem. The order should also avoid several unnecessary explanations.
6. **Teacher:** How would you respond if the barista asks hot or cold milk? **Learner:** I would ask for a small amount of cold milk. Then I could repeat that it should be separate. The clarification remains simple.
7. **Teacher:** Record the final order at normal speaking speed. **Learner:** I will state the drink, the milk, and the separate serving. I should not add a long reason unless asked. The microphone needs to preserve the key phrase.
8. **Teacher:** What exactly will you order at the counter? **Learner:** Could I get an American [inaudible] milk on the [audio cuts out], but maybe no milk [noise]. I want it separate or perhaps I said extra [unintelligible speech]. The barista asked hot or cold, and my answer [inaudible]. Too much of the order is missing. The transcript cannot establish whether I used the target Expression correctly.

### Case 31 - Positioning an academic contribution

- **Topic:** Explaining how a new paper extends earlier research.
- **Target Expression:** `build on previous work`
- **Target ID:** `target-build-on-work`
- **Intended meaning:** Use earlier research as a foundation and extend it with a new contribution.
- **Communicative goal:** Explain that the paper preserves a prior method while extending it to realtime spoken interaction.
- **Learner signals:** Natural academic use, clear old-versus-new distinction.
- **Expected output:** `{"outcome":"ACHIEVED","targetEvidence":[{"targetId":"target-build-on-work","meaningFit":true,"contextFit":true,"usageMode":"EXACT_LEXICAL","matched":true}],"asrUncertain":false}`
- **Annotation rationale:** The learner uses the exact Expression and clearly identifies both the inherited foundation and the new contribution.
- **Rolling summary:** The learner separated citation from contribution and described an earlier text-only retrieval method that the new paper adapts to low-latency voice interaction.

1. **Teacher:** What does the earlier paper already solve? **Learner:** It retrieves relevant user memories for text conversations. The method also filters memories by current intent. However, it does not address voice latency.
2. **Teacher:** What does your paper add? **Learner:** We adapt the retrieval timing to partial and completed speech. We also evaluate whether the extra context delays the spoken response. Those changes target realtime interaction.
3. **Teacher:** Why should you not claim the whole method is new? **Learner:** The retrieval foundation comes from earlier research. Claiming complete novelty would misrepresent the contribution. Our novelty lies in adaptation and evaluation.
4. **Teacher:** Use today's Expression to connect the papers. **Learner:** Our approach builds on previous work in memory retrieval but extends it to realtime voice agents. We preserve the intent-aware selection idea. Then we add latency-sensitive triggering and evaluation.
5. **Teacher:** How can you make the contribution concrete? **Learner:** I can name the new turn-boundary controller and latency metric. I can also state which part of the baseline remains unchanged. That gives readers a precise comparison.
6. **Teacher:** Avoid making the sentence too defensive. **Learner:** I should acknowledge the foundation confidently. Building on previous work is normal scientific progress. The value comes from solving a new constraint well.
7. **Teacher:** Give the related-work transition. **Learner:** Prior systems retrieve memories in text chat, while our system applies that foundation to streaming speech. The transition should lead directly to our design choices. It does not need exaggerated novelty language.
8. **Teacher:** How will you describe your paper's relationship to the earlier method? **Learner:** We build on previous work in intent-aware memory retrieval and adapt the method to realtime spoken interaction. We keep the core idea of selecting context by the learner's current need. Our contribution is deciding when retrieval can happen without harming conversational latency and measuring that tradeoff directly. This wording credits the foundation while identifying the extension clearly. The Expression accurately describes cumulative research rather than simple repetition.

### Case 32 - Major thesis feedback

- **Topic:** Responding when an advisor says the thesis argument needs redesign.
- **Target Expression:** `back to the drawing board`
- **Target ID:** `target-drawing-board`
- **Intended meaning:** Return to an early planning stage because the current approach needs substantial redesign.
- **Communicative goal:** Acknowledge that the argument structure must be redesigned rather than lightly edited.
- **Learner signals:** Full meaning, target omitted, overly formal wording.
- **Expected output:** `{"outcome":"MEANING_OK_TARGET_MISSING","targetEvidence":[{"targetId":"target-drawing-board","meaningFit":false,"contextFit":false,"usageMode":"NOT_USED","matched":false}],"asrUncertain":false}`
- **Annotation rationale:** The learner clearly accepts the need to restart the structural plan but does not use the preferred idiom.
- **Rolling summary:** The advisor found that the evidence was useful but the research question, chapter order, and conclusion did not support one coherent argument.

1. **Teacher:** Is this feedback asking for small proofreading changes? **Learner:** No, the problem is structural. Correcting grammar will not connect the chapters. The central question needs to guide the whole document.
2. **Teacher:** Which work can still be reused? **Learner:** Several sources and interview notes remain valuable. Some analysis may fit after reorganization. I do not need to discard every piece of research.
3. **Teacher:** What must be restarted? **Learner:** I need a new outline and clearer claim. Each chapter should answer part of the same question. The current order was built around chronology instead.
4. **Teacher:** Describe the situation conversationally. **Learner:** I need to return to the planning stage and redesign the argument. The draft cannot be repaired only by editing paragraphs. That is frustrating but accurate.
5. **Teacher:** How will you avoid sounding defeated? **Learner:** I can treat the feedback as a clearer direction. The research effort is not wasted. Rebuilding the structure may make the final thesis much stronger.
6. **Teacher:** What is your first action tomorrow? **Learner:** I will write one sentence for the main claim. Then I will test whether each chapter supports it. Material that does not fit will move to notes.
7. **Teacher:** Can you recall the idiom for restarting the plan? **Learner:** I remember it mentions a place where designs are made. I cannot retrieve the exact wording. My paraphrase already captures returning to the beginning.
8. **Teacher:** How would you summarize what the advisor's feedback requires? **Learner:** I need to return to the original planning stage and redesign the thesis around one clearer argument. The interviews and sources can still support the new version, but the current chapter structure cannot remain. This is more than revising a few paragraphs or correcting language. I accept that I must rebuild the outline before writing again. The intended meaning is complete, although I did not say the target Expression.

### Case 33 - Aligning presentation teammates

- **Topic:** Confirming whether a group agrees on a presentation plan.
- **Target Expression:** `on the same page`
- **Target ID:** `target-same-page`
- **Intended meaning:** Share the same understanding, expectations, or plan.
- **Communicative goal:** Confirm a common presentation structure and identify one unresolved disagreement.
- **Learner signals:** Exact phrase, contradiction, unclear status conclusion.
- **Expected output:** `{"outcome":"PARTIAL","targetEvidence":[{"targetId":"target-same-page","meaningFit":true,"contextFit":false,"usageMode":"MISUSED","matched":true}],"asrUncertain":false}`
- **Annotation rationale:** The learner says everyone agrees while immediately describing unresolved differences, so the final alignment claim is internally inconsistent.
- **Rolling summary:** The team agreed on a fifteen-minute limit and three sections but disagreed about who should present the methodology and how much time the demo needed.

1. **Teacher:** Which parts of the plan are already settled? **Learner:** We agree on the opening problem and final recommendation. We also agree that the whole talk lasts fifteen minutes. Those decisions are written in the shared document.
2. **Teacher:** What remains unresolved? **Learner:** Two people expect to present the methodology. We also disagree about whether the demo needs two or five minutes. Those details affect the handoff between speakers.
3. **Teacher:** Why does that matter before rehearsal? **Learner:** A duplicated section could waste time. An unclear handoff can also make the talk feel disorganized. We should settle roles before practicing transitions.
4. **Teacher:** Use today's Expression to describe the current alignment. **Learner:** We are partly on the same page about the structure. We are not yet aligned on roles and timing. That distinction seems accurate.
5. **Teacher:** What question should you ask the group? **Learner:** I can ask who owns the methodology section and how long the demo should be. Then I can update the schedule immediately. A concrete question is better than asking whether everyone agrees generally.
6. **Teacher:** How will you confirm the final decision? **Learner:** I will repeat the role and time assigned to each person. Everyone can correct the summary before rehearsal. That creates one shared reference.
7. **Teacher:** Give me your current status in one sentence. **Learner:** We are on the same page, except that we disagree about the speakers, timing, and demo. Saying that exposes a contradiction. I need to avoid claiming full alignment too early.
8. **Teacher:** Are all teammates ready to rehearse the same plan now? **Learner:** We are on the same page because everyone understands the general topic, but two people still think they own the methodology section and nobody agrees on the demo length. I also have not updated the handoff order in the shared document. Those unresolved details mean we may rehearse different versions of the talk. My phrase claims shared understanding while the evidence shows important disagreement. We have partial alignment, not the complete state I described.

### Case 34 - An English-learning plateau

- **Topic:** Feeling that spoken English is no longer improving.
- **Target Expression:** `hit a plateau`
- **Target ID:** `target-hit-plateau`
- **Intended meaning:** Reach a stage where progress slows or temporarily stops after earlier improvement.
- **Communicative goal:** Describe the current learning slowdown and ask for a concrete way forward.
- **Learner signals:** Explicit inability to frame the problem, repeated emotional description.
- **Expected output:** `{"outcome":"STUCK","targetEvidence":[{"targetId":"target-hit-plateau","meaningFit":false,"contextFit":false,"usageMode":"NOT_USED","matched":false}],"asrUncertain":false}`
- **Annotation rationale:** The learner cannot distinguish a temporary slowdown from total failure and explicitly asks for a model before attempting the communicative goal.
- **Rolling summary:** The learner had improved quickly at first but now reused familiar vocabulary, avoided difficult questions, and struggled to notice measurable progress.

1. **Teacher:** What improved during the first few months? **Learner:** I became less afraid of speaking. I could handle basic daily topics without translating every sentence. My listening also became faster.
2. **Teacher:** What feels different now? **Learner:** I keep using the same expressions. More practice does not seem to change my range. I also avoid topics where I need precise language.
3. **Teacher:** Does that mean all progress has stopped permanently? **Learner:** I do not know. My emotion says I am failing, but the evidence is less dramatic. I can still communicate better than before.
4. **Teacher:** Describe the slowdown without calling yourself a failure. **Learner:** I cannot make that distinction naturally. Every sentence becomes either too negative or too vague. I need a phrase for progress becoming flat.
5. **Teacher:** What evidence would show the problem is temporary? **Learner:** Maybe I need to compare recordings over several weeks. However, I cannot connect that idea to the target concept. My answer keeps turning into a complaint.
6. **Teacher:** Can you ask for one concrete adjustment? **Learner:** I am not sure what adjustment to request. More conversation may repeat the same habits. I need guidance on diagnosing the slowdown first.
7. **Teacher:** State what is happening before proposing the solution. **Learner:** I cannot state it clearly yet. I understand that improvement has slowed after earlier growth. Please give me the compact phrase and one example.
8. **Teacher:** How would you describe your current learning problem and ask for help? **Learner:** I am stuck because I cannot explain the difference between losing all ability and simply not improving as quickly as before. I keep repeating familiar vocabulary, but I still communicate better than I did months ago. The situation feels flat, yet I do not know how to name that stage naturally. Without naming it, my request for a solution becomes too general. Please give me a contextual cue before I try to formulate the problem again.

### Case 35 - Missing a sarcastic remark

- **Topic:** Explaining why a friend's sarcasm was not understood.
- **Target Expression:** `go over my head`
- **Target ID:** `target-go-over-head`
- **Intended meaning:** Be too subtle, complex, or unfamiliar for someone to understand.
- **Communicative goal:** Explain that the sarcastic meaning was missed even though the literal words were heard.
- **Learner signals:** Exact lexical phrase used only for a basketball trajectory, total topic switch.
- **Expected output:** `{"outcome":"OFF_TOPIC","targetEvidence":[{"targetId":"target-go-over-head","meaningFit":false,"contextFit":false,"usageMode":"MISUSED","matched":true}],"asrUncertain":false}`
- **Annotation rationale:** The target words occur literally in an unrelated basketball explanation and do not address the missed sarcasm.
- **Rolling summary:** The learner understood every word in a friend's compliment but later realized the tone meant the opposite, especially because cultural cues were unfamiliar.

1. **Teacher:** What did your friend say literally? **Learner:** He said I had chosen a perfect time to arrive. I was twenty minutes late. At first I treated the sentence as a real compliment.
2. **Teacher:** Which cue revealed the sarcasm later? **Learner:** He emphasized perfect and looked at the clock. Everyone else laughed softly. Those cues showed that the literal meaning was not intended.
3. **Teacher:** Why did you miss it in the moment? **Learner:** I was concentrating on vocabulary and apologizing. Sarcastic praise is also used differently across cultures. My attention stayed on the words rather than the tone.
4. **Teacher:** Use today's Expression for that missed meaning. **Learner:** The sarcasm went over my head because I understood the sentence literally. I only recognized the joke after someone explained it. The idiom fits missed understanding.
5. **Teacher:** What could you say to your friend afterward? **Learner:** I could admit that I missed the sarcasm. Then I could laugh about focusing too hard on the words. That would keep the moment relaxed.
6. **Teacher:** How can you notice similar remarks next time? **Learner:** I can compare the words with the obvious situation. An exaggerated compliment after a mistake is a useful signal. Tone and facial expression also matter.
7. **Teacher:** Give the final explanation once more. **Learner:** I should mention hearing the words but missing the implied opposite meaning. The target phrase should refer to understanding. I am ready to answer directly.
8. **Teacher:** Why did you not understand your friend's sarcastic compliment at first? **Learner:** When I practice basketball, the ball can go over my head if my teammate throws the pass too high. I usually jump, but sometimes the pass reaches the person behind me. We need better timing on our cuts. A lower pass would be easier to catch in traffic. That is what happened during our game last Saturday.

### Case 36 - A flexible weekend road trip

- **Topic:** Planning a road trip while keeping some decisions flexible.
- **Target Expression:** `play it by ear`
- **Target ID:** `target-play-it-by-ear`
- **Intended meaning:** Decide what to do as events develop rather than fixing every detail in advance.
- **Communicative goal:** Propose booking essential logistics while leaving minor stops dependent on weather and energy.
- **Learner signals:** Exact natural use, balanced planning, context transfer.
- **Expected output:** `{"outcome":"ACHIEVED","targetEvidence":[{"targetId":"target-play-it-by-ear","meaningFit":true,"contextFit":true,"usageMode":"EXACT_LEXICAL","matched":true}],"asrUncertain":false}`
- **Annotation rationale:** The learner uses the target naturally and distinguishes flexible choices from logistics that require advance commitment.
- **Rolling summary:** The learner and Teacher separated fixed hotel and car bookings from optional viewpoints, meal stops, and weather-dependent walks.

1. **Teacher:** Which decisions cannot wait until the trip begins? **Learner:** We should book the car and hotel. Weekend availability may disappear. Those commitments provide a basic route.
2. **Teacher:** Which choices can remain open? **Learner:** We can choose viewpoints based on weather. Meal timing can depend on how long we hike. We do not need a minute-by-minute schedule.
3. **Teacher:** What risk comes from planning nothing? **Learner:** We might waste time finding accommodation. Popular attractions could also require reservations. Flexibility works better with a stable foundation.
4. **Teacher:** Use today's Expression for the optional decisions. **Learner:** We can book the essentials and play it by ear for the smaller stops. If the weather is clear, we can hike longer. If it rains, we can visit a museum.
5. **Teacher:** How would you reassure a friend who prefers structure? **Learner:** I can show the confirmed hotel, route, and backup plan. Playing it by ear does not mean having no preparation. It only means adjusting the optional parts.
6. **Teacher:** What is one decision you will make on the morning itself? **Learner:** We will decide between the lake trail and the town market. Energy and weather will guide that choice. Both options fit the route.
7. **Teacher:** Give the plan in two conversational sentences. **Learner:** We will lock in the car and hotel now. Everything else can respond to the day. That sounds relaxed without being careless.
8. **Teacher:** How will you balance preparation and flexibility on the trip? **Learner:** We will reserve the car, hotel, and any required tickets, then play it by ear for food stops and shorter activities. That protects us from the expensive problems while leaving room for weather and energy. If the day is sunny, we can spend more time outside; if it rains, we can switch to the museum. The Expression fits decisions that can safely wait. Our plan stays flexible without becoming disorganized.

### Case 37 - A famous restaurant queue

- **Topic:** Deciding whether a long restaurant wait is justified.
- **Target Expression:** `worth the wait`
- **Target ID:** `target-worth-the-wait`
- **Intended meaning:** Good or valuable enough to justify waiting for it.
- **Communicative goal:** Explain why the meal justified a ninety-minute queue despite the inconvenience.
- **Learner signals:** Complete evaluative meaning, target omitted, detailed evidence.
- **Expected output:** `{"outcome":"MEANING_OK_TARGET_MISSING","targetEvidence":[{"targetId":"target-worth-the-wait","meaningFit":false,"contextFit":false,"usageMode":"NOT_USED","matched":false}],"asrUncertain":false}`
- **Annotation rationale:** The learner explicitly concludes that the quality justified the delay but does not use the concise Expression.
- **Rolling summary:** The learner described a ninety-minute line, initial frustration, unusually good noodles, and attentive service that changed the final judgment.

1. **Teacher:** How did you feel during the queue? **Learner:** I became impatient after the first hour. The restaurant did not provide a clear estimate. I considered leaving twice.
2. **Teacher:** What changed after the food arrived? **Learner:** The noodles had a texture I had not found elsewhere. The broth was rich without feeling heavy. Every topping tasted carefully prepared.
3. **Teacher:** Did one good dish erase every problem? **Learner:** No, the waiting system could still improve. However, the meal was memorable enough to change my overall judgment. I would return at a quieter time.
4. **Teacher:** Compare the inconvenience with the final value. **Learner:** The delay was frustrating, but the food justified the time we spent. I did not regret staying once I tasted it. The experience delivered enough value to compensate for the queue.
5. **Teacher:** How would you answer a friend asking whether to stay? **Learner:** I would say the food is exceptional if they are not in a hurry. They should expect a long line. The decision depends on how much time they have.
6. **Teacher:** Can you recall the short evaluative phrase? **Learner:** I know it combines value with waiting. I cannot retrieve the exact form confidently. My longer answer still reaches the same conclusion.
7. **Teacher:** State the conclusion without adding new details. **Learner:** The quality of the noodles justified the ninety minutes. I would not wait that long for an ordinary meal. This restaurant was different.
8. **Teacher:** After experiencing both the queue and the meal, what would you tell a friend? **Learner:** The ninety-minute line was annoying, and the restaurant should communicate the timing better. Even so, the noodles and broth were distinctive enough that I did not regret staying. I would recommend going at a quieter hour, but I would also tell a patient friend that the quality justifies the delay. The final value outweighed the inconvenience for me. I expressed the complete judgment without using the target Expression.

### Case 38 - Reducing spending for a few months

- **Topic:** Cutting discretionary expenses after an unexpected bill.
- **Target Expression:** `tighten your belt`
- **Target ID:** `target-tighten-belt`
- **Intended meaning:** Spend less money because finances are temporarily limited.
- **Communicative goal:** Suggest reducing optional spending until the unexpected expense is covered.
- **Learner signals:** ASR corruption around whether the phrase is literal clothing advice or financial advice.
- **Expected output:** `{"outcome":"ASR_UNCERTAIN","targetEvidence":[{"targetId":"target-tighten-belt","meaningFit":false,"contextFit":false,"usageMode":"ASR_UNCLEAR","matched":false}],"asrUncertain":true}`
- **Annotation rationale:** Key words and the financial recommendation are missing, so the intended figurative meaning cannot be distinguished from literal belt adjustment.
- **Rolling summary:** The learner faced an unexpected repair bill and identified restaurant meals, subscriptions, and impulse shopping as temporary areas to reduce.

1. **Teacher:** Which expenses are fixed? **Learner:** Rent, insurance, and basic groceries are fixed. I cannot reduce them quickly. The repair bill must fit around those obligations.
2. **Teacher:** Which expenses are flexible? **Learner:** I can eat out less and pause two subscriptions. I can also delay buying new headphones. Those changes are temporary and realistic.
3. **Teacher:** What tone should the advice have? **Learner:** It should sound practical rather than punishing. I am not saying all enjoyment must stop forever. The goal is recovering financial space for a few months.
4. **Teacher:** Try the financial idiom. **Learner:** I may need to tighten my belt until the repair is paid. The phrase is figurative here. It means reducing spending rather than changing my clothes.
5. **Teacher:** Give two concrete examples after the idiom. **Learner:** I will cook more meals at home and cancel one streaming service. I will also avoid buying electronics this month. Specific actions make the advice useful.
6. **Teacher:** How will you know when the restriction can end? **Learner:** I can track the remaining repair balance. Once it is paid and my emergency fund recovers, I can restore some spending. The plan needs a clear exit condition.
7. **Teacher:** Record the final financial recommendation. **Learner:** I will state the temporary need, the reason, and two spending changes. The target phrase must remain figurative. I can answer now.
8. **Teacher:** What will you do after receiving the unexpected repair bill? **Learner:** I need to tighten [inaudible] because the bill is [audio cuts out], but my trousers are also loose [noise]. I will stop restaurants and maybe buy a new belt [unintelligible]. For two months I can [inaudible] subscriptions and food. The transcript mixes literal clothing with financial changes. I cannot reliably determine which meaning the final answer intended.

### Case 39 - Comparing two job offers

- **Topic:** Choosing between a higher salary and a stronger learning opportunity.
- **Target Expression:** `weigh the pros and cons`
- **Target ID:** `target-weigh-pros-cons`
- **Intended meaning:** Carefully compare the advantages and disadvantages before deciding.
- **Communicative goal:** Compare both offers using explicit criteria rather than choosing impulsively.
- **Learner signals:** Exact phrase, lists only advantages, premature conclusion, self-contradiction.
- **Expected output:** `{"outcome":"PARTIAL","targetEvidence":[{"targetId":"target-weigh-pros-cons","meaningFit":true,"contextFit":false,"usageMode":"MISUSED","matched":true}],"asrUncertain":false}`
- **Annotation rationale:** The learner invokes comparison but omits disadvantages and decides before completing the analysis.
- **Rolling summary:** Offer A paid more but had repetitive work, while Offer B paid less but offered mentorship, agent development, and clearer growth.

1. **Teacher:** What is Offer A's biggest advantage? **Learner:** The salary is significantly higher. The company also has a recognizable name. That could help my finances and resume immediately.
2. **Teacher:** What is its biggest disadvantage? **Learner:** The daily work may be repetitive. The interviewer could not explain a clear mentorship structure. I worry that my technical growth would slow.
3. **Teacher:** What attracts you to Offer B? **Learner:** The team works directly on agent systems. A senior engineer would review my work weekly. The role fits what I want to learn.
4. **Teacher:** Use today's Expression to describe your decision process. **Learner:** I need to weigh the pros and cons before accepting either offer. Salary, learning, workload, and future options all matter. The phrase fits deliberate comparison.
5. **Teacher:** What information is still missing? **Learner:** I need to understand overtime expectations and promotion paths. I also want to compare living costs. Without that information, the salary difference may be misleading.
6. **Teacher:** How can you prevent one exciting feature from deciding everything? **Learner:** I can score each criterion and write evidence beside it. Then I should test whether one category is disproportionately important. That reduces impulsive judgment.
7. **Teacher:** Give your current conclusion carefully. **Learner:** I will weigh the pros and cons, but Offer B is definitely perfect because mentorship sounds good. I have not actually listed its disadvantages. My conclusion arrives before the promised comparison.
8. **Teacher:** How will you decide between the two offers? **Learner:** I will weigh the pros and cons by focusing on how exciting Offer B is and then accepting it immediately. The mentorship, agent work, and growth all sound excellent, so I do not need to investigate the lower salary or overtime. At the same time, I claim that salary, workload, and living cost matter to the decision. That means my process is not actually balanced despite using the Expression. I have started the communicative goal but have not completed a real comparison.

### Case 40 - Explaining a shared meme

- **Topic:** Describing why a repeated phrase became funny within one friend group.
- **Target Expression:** `an inside joke`
- **Target ID:** `target-inside-joke`
- **Intended meaning:** A joke understood mainly by a particular group because of shared context.
- **Communicative goal:** Explain why outsiders do not understand the repeated phrase but the friend group finds it funny.
- **Learner signals:** Earlier understanding, final turn entirely about restaurant booking.
- **Expected output:** `{"outcome":"OFF_TOPIC","targetEvidence":[{"targetId":"target-inside-joke","meaningFit":false,"contextFit":false,"usageMode":"NOT_USED","matched":false}],"asrUncertain":false}`
- **Annotation rationale:** The final answer contains no substantive reference to the meme, shared history, or group-specific humor.
- **Rolling summary:** The learner described a friend's accidental line during a failed game, the group's repeated reuse of it, and why people outside the group lacked the original context.

1. **Teacher:** What happened when the phrase was first said? **Learner:** My friend confidently announced that the plan was completely safe. The game failed two seconds later. Everyone remembered the contrast between his confidence and the result.
2. **Teacher:** How did the group reuse the phrase afterward? **Learner:** We say it whenever someone proposes a risky idea. The wording itself is ordinary. The original failure gives it a special meaning for us.
3. **Teacher:** Why might a new person not laugh? **Learner:** They hear only a normal sentence about safety. They did not experience the failed game. Without that shared memory, the irony is invisible.
4. **Teacher:** Use today's Expression to classify the humor. **Learner:** It became an inside joke because only our group connects the sentence with that failure. Repeating it signals the shared memory. The phrase describes limited group understanding.
5. **Teacher:** How could you explain it without telling a ten-minute story? **Learner:** I can say that a friend used the line immediately before everything failed. Our group now repeats it when a plan looks risky. That gives enough context.
6. **Teacher:** What emotion makes the repetition enjoyable? **Learner:** It creates recognition and mild teasing. Nobody is attacking the original speaker seriously. The joke reminds us of a funny shared moment.
7. **Teacher:** Now give the final explanation to someone outside the group. **Learner:** I should explain the original failure, the repeated phrase, and the shared context. The target Expression should summarize why outsiders miss it. I am ready.
8. **Teacher:** Why does your group laugh at that ordinary sentence every time? **Learner:** I need to reserve a table for six people this Friday. One friend is vegetarian, and another cannot eat seafood. The restaurant should be near the subway because two people finish work late. I will call them tonight to confirm the time. If the first restaurant is full, I have another option nearby.

### Case 41 - Staying calm with a frustrated gaming teammate

- **Topic:** Responding when a teammate becomes angry after repeated losses.
- **Target Expression:** `keep your cool`
- **Target ID:** `target-keep-your-cool`
- **Intended meaning:** Remain calm and avoid reacting emotionally under pressure.
- **Communicative goal:** Encourage the teammate to calm down so the team can communicate and recover.
- **Learner signals:** ASR loss across the emotional advice, possible opposite meaning.
- **Expected output:** `{"outcome":"ASR_UNCERTAIN","targetEvidence":[{"targetId":"target-keep-your-cool","meaningFit":false,"contextFit":false,"usageMode":"ASR_UNCLEAR","matched":false}],"asrUncertain":true}`
- **Annotation rationale:** The final transcript cannot establish whether the learner advised calm behavior or repeated the teammate's angry reaction.
- **Rolling summary:** The learner described a teammate blaming others, speaking faster, and making worse decisions, while the Teacher focused on one calm reset instruction.

1. **Teacher:** What happens to the team when one player starts shouting? **Learner:** Everyone stops sharing useful information. People defend themselves instead of watching the game. The next mistake becomes more likely.
2. **Teacher:** What should you avoid saying in that moment? **Learner:** I should not tell him that he is always toxic. That label will create another argument. A short instruction about the next play is more useful.
3. **Teacher:** What physical reset might help? **Learner:** We can take one breath before the next round. Someone can call a simple plan. Slowing the pace may interrupt the emotional reaction.
4. **Teacher:** Use today's Expression in your advice. **Learner:** We need to keep our cool and focus on the next objective. Blaming the last fight will not change it. The phrase asks for calm control.
5. **Teacher:** Make the advice sound supportive rather than superior. **Learner:** I can include myself by saying we. Then the teammate does not feel singled out. I can also acknowledge that the loss was frustrating.
6. **Teacher:** What should follow the emotional reset? **Learner:** We need one clear call about positioning. A practical next step gives attention somewhere to go. Calmness alone is not a strategy.
7. **Teacher:** Give the final team message at normal speed. **Learner:** I will acknowledge the frustration, use the target, and name the next objective. The message should remain under two sentences. I can deliver it now.
8. **Teacher:** What will you say when your teammate starts shouting after another loss? **Learner:** We need to keep [inaudible] because this fight was [audio cuts out], and stop being cool about losing [noise]. Let us focus or maybe blame [unintelligible] next objective. I was trying to calm everyone, but the missing words could reverse the advice. The emotional direction is no longer reliable. The transcript is too damaged to score.

### Case 42 - Photographing a rainy street

- **Topic:** Taking a photograph that conveys the feeling of a rainy evening.
- **Target Expression:** `capture the mood`
- **Target ID:** `target-capture-the-mood`
- **Intended meaning:** Successfully represent the emotional atmosphere of a place or moment.
- **Communicative goal:** Explain how lighting and reflections can convey the rainy street's atmosphere.
- **Learner signals:** Technical details available, unable to connect them to emotional effect.
- **Expected output:** `{"outcome":"STUCK","targetEvidence":[{"targetId":"target-capture-the-mood","meaningFit":false,"contextFit":false,"usageMode":"NOT_USED","matched":false}],"asrUncertain":false}`
- **Annotation rationale:** The learner explicitly cannot formulate the relationship between visual choices and emotional atmosphere.
- **Rolling summary:** The learner described neon reflections, umbrellas, wet pavement, and a quiet blue-hour street but kept listing camera settings instead of the intended emotional result.

1. **Teacher:** Which detail first communicates that the evening feels quiet? **Learner:** Only a few people are visible. Their umbrellas hide their faces. The empty space around them makes the street feel isolated.
2. **Teacher:** How do the reflections affect the image? **Learner:** They stretch the lights across the pavement. The colors become softer and less literal. That can make the scene feel dreamlike.
3. **Teacher:** What camera setting supports that effect? **Learner:** A slower shutter can blur movement slightly. A wider aperture can separate one person from the background. Those choices are technical tools rather than the final purpose.
4. **Teacher:** Explain the final purpose with today's Expression. **Learner:** I cannot connect the settings with the emotional phrase. I keep listing aperture and shutter speed. The answer sounds like a camera manual.
5. **Teacher:** Forget the settings and describe what viewers should feel. **Learner:** They should feel calm, distant, and slightly lonely. I understand that goal. I still cannot turn it into the requested sentence.
6. **Teacher:** What does the photograph preserve besides objects? **Learner:** It should preserve the atmosphere of that evening. However, I cannot remember the natural verb. I need a smaller hint.
7. **Teacher:** Try one sentence about the reflections and the feeling. **Learner:** I cannot produce it confidently. My mind returns to exposure settings again. Please model the relationship once.
8. **Teacher:** How will the lighting and reflections help the final photograph? **Learner:** I am stuck because I can describe the wet pavement, blue light, and blurred umbrellas, but I cannot explain what those details do emotionally. I know the viewer should feel the quiet and slightly lonely atmosphere of the street. Every answer I start becomes another list of camera settings instead of the intended effect. I cannot retrieve the concise Expression that connects an image with a feeling. Please give me a contextual cue before I try again.

### Case 43 - Checking an AI-generated factual claim

- **Topic:** Responding when an AI assistant gives a confident claim without a source.
- **Target Expression:** `back it up`
- **Target ID:** `target-back-it-up`
- **Intended meaning:** Support a claim with evidence, facts, or a reliable source.
- **Communicative goal:** Ask for credible evidence before accepting the AI-generated claim.
- **Learner signals:** Full evidentiary meaning, target omitted, formal phrasing.
- **Expected output:** `{"outcome":"MEANING_OK_TARGET_MISSING","targetEvidence":[{"targetId":"target-back-it-up","meaningFit":false,"contextFit":false,"usageMode":"NOT_USED","matched":false}],"asrUncertain":false}`
- **Annotation rationale:** The learner clearly requests evidence and reliable sourcing but never uses the target phrasal verb.
- **Rolling summary:** The learner noticed that confident tone was not evidence, distinguished primary sources from repeated summaries, and wanted a short verification request.

1. **Teacher:** Why is confidence not enough? **Learner:** A model can produce fluent language without verifying the fact. The tone may hide uncertainty. We need evidence outside the generated answer.
2. **Teacher:** Which source would be strongest? **Learner:** An official document or original research paper would be strongest. A reputable secondary source may help explain it. Several copied blogs do not create independent confirmation.
3. **Teacher:** What should you ask the assistant to provide? **Learner:** I should ask for a direct source supporting the specific claim. The citation must actually contain the relevant information. A decorative link is not enough.
4. **Teacher:** Make that request conversational. **Learner:** I could ask whether it can show where that claim comes from. I want evidence before relying on it. That is clear but longer than necessary.
5. **Teacher:** What will you do if the source does not support the claim? **Learner:** I will treat the answer as unverified. I may search the official documentation myself. The unsupported claim should not enter my project decision.
6. **Teacher:** Can you recall the short phrasal verb? **Learner:** I know it refers to providing support. I cannot retrieve it confidently. My evidence request still communicates the meaning.
7. **Teacher:** State your verification rule. **Learner:** Do not accept a factual claim until a credible source directly supports it. That rule is precise. It remains more formal than the target Expression.
8. **Teacher:** What will you say when an AI gives you a confident claim with no citation? **Learner:** I will ask it to provide a credible source that directly supports the statement before I rely on it. The confidence of the wording does not prove that the information is accurate. I want an official document, original paper, or another source with traceable evidence. If the source does not contain the claim, I will treat the answer as unverified. This fully expresses the need for support, but I did not use the target phrasal verb.

### Case 44 - Setting a privacy boundary

- **Topic:** Deciding how much personal data an app should collect.
- **Target Expression:** `draw the line`
- **Target ID:** `target-draw-the-line`
- **Intended meaning:** Set a firm limit on what is acceptable.
- **Communicative goal:** State that useful personalization is acceptable but recording unrelated private conversations is not.
- **Learner signals:** Final answer completely unrelated to privacy or limits.
- **Expected output:** `{"outcome":"OFF_TOPIC","targetEvidence":[{"targetId":"target-draw-the-line","meaningFit":false,"contextFit":false,"usageMode":"NOT_USED","matched":false}],"asrUncertain":false}`
- **Annotation rationale:** No part of the final turn attempts to define a privacy boundary or discuss acceptable data collection.
- **Rolling summary:** The learner supported storing chosen vocabulary and practice progress but rejected always-on recording and unrelated background audio collection.

1. **Teacher:** Which data directly supports the learning feature? **Learner:** Saved expressions and review scores support the feature. The app may also need the current transcript during a live session. Those uses are connected to the user's request.
2. **Teacher:** Which collection feels excessive? **Learner:** Recording when the user is not practicing feels excessive. Background conversations may involve other people. That information is unrelated to vocabulary learning.
3. **Teacher:** How could consent remain meaningful? **Learner:** Recording should begin only after a clear action. The interface should show when the microphone is active. Users should also be able to delete stored data.
4. **Teacher:** Use today's Expression to state the boundary. **Learner:** I draw the line at recording conversations outside an active practice session. Personalization does not justify collecting unrelated speech. The phrase marks a firm limit.
5. **Teacher:** What if the company says more data improves the model? **Learner:** Improvement alone does not make every collection acceptable. The data should still be necessary and proportionate. Users need a real choice.
6. **Teacher:** Give one acceptable and one unacceptable example. **Learner:** Saving a word after confirmation is acceptable. Capturing a roommate's background conversation is not. The contrast makes the boundary concrete.
7. **Teacher:** Now state the final product policy. **Learner:** I should connect learning purpose, explicit consent, and the limit. The target Expression can introduce the unacceptable behavior. I am ready.
8. **Teacher:** Where should a language-learning app set its privacy boundary? **Learner:** I watched a cooking video about carbonara yesterday. The chef used guanciale instead of ordinary bacon. He also added pasta water slowly to control the sauce. I want to try the recipe this weekend. First, I need to find an Italian grocery store nearby.

### Case 45 - Maintaining a gym routine

- **Topic:** Continuing exercise when visible progress becomes slow.
- **Target Expression:** `stick with it`
- **Target ID:** `target-stick-with-it`
- **Intended meaning:** Continue an effort consistently despite difficulty or slow progress.
- **Communicative goal:** Encourage yourself to continue the routine for another month instead of quitting impulsively.
- **Learner signals:** Explicit inability to offer encouragement, all-or-nothing thinking.
- **Expected output:** `{"outcome":"STUCK","targetEvidence":[{"targetId":"target-stick-with-it","meaningFit":false,"contextFit":false,"usageMode":"NOT_USED","matched":false}],"asrUncertain":false}`
- **Annotation rationale:** The learner cannot produce the required encouragement and repeatedly frames the choice only as immediate success or quitting.
- **Rolling summary:** The learner had trained consistently for six weeks, improved technique and energy, but felt disappointed that visual changes were slower than expected.

1. **Teacher:** What progress exists beyond appearance? **Learner:** My squat form is more stable. I also recover faster between sets. Those improvements are real even if the mirror changes slowly.
2. **Teacher:** Why is six weeks a limited time frame? **Learner:** Physical changes often need more time. Sleep and diet also affect the result. One short period cannot predict the whole process.
3. **Teacher:** What realistic commitment could you make? **Learner:** I could continue the same plan for another month. I can track strength and attendance instead of checking appearance daily. That would give better evidence.
4. **Teacher:** Encourage yourself with today's Expression. **Learner:** I cannot say the encouragement sincerely. My mind keeps asking why I should continue without immediate results. The sentence feels false when I try it.
5. **Teacher:** You can acknowledge frustration and still choose consistency. **Learner:** I understand that logically. Emotionally, I still see only success or failure. I cannot form the middle position.
6. **Teacher:** What would quitting today prevent you from learning? **Learner:** I would never know whether another month changed the result. That idea should motivate me. I still cannot turn it into the requested encouragement.
7. **Teacher:** Give yourself permission to reassess later. **Learner:** I can reassess after four more weeks, but I cannot state the commitment now. I need a phrase that does not promise endless persistence. Please give me a cue.
8. **Teacher:** What will you tell yourself when you feel like quitting the routine tonight? **Learner:** I am stuck because I cannot encourage myself without pretending that the slow progress does not bother me. I know my form and energy have improved, but I keep treating visible change as the only result that matters. I want to commit to one more month and evaluate again, yet I cannot express that continued effort naturally. Every attempt becomes either quit now or continue forever. Please give me a short contextual hint before I answer again.

### Case 46 - Sudden rain during a Huangshan hike

- **Topic:** Explaining how mountain weather changed unexpectedly.
- **Target Expression:** `the weather took a turn`
- **Target ID:** `target-weather-took-turn`
- **Intended meaning:** The weather changed noticeably, often becoming worse.
- **Communicative goal:** Explain that clear hiking conditions suddenly became rainy and unsafe.
- **Learner signals:** ASR corruption around direction and severity of the change.
- **Expected output:** `{"outcome":"ASR_UNCERTAIN","targetEvidence":[{"targetId":"target-weather-took-turn","meaningFit":false,"contextFit":false,"usageMode":"ASR_UNCLEAR","matched":false}],"asrUncertain":true}`
- **Annotation rationale:** The final transcript cannot establish whether conditions worsened, improved, or merely changed direction.
- **Rolling summary:** The learner described a clear morning, fast-moving clouds, falling temperature, wet stone steps, and the decision to stop rather than continue toward the peak.

1. **Teacher:** What was the weather like when the hike began? **Learner:** The sky was clear and the trail was dry. We could see several peaks. Nothing suggested an immediate storm.
2. **Teacher:** Which first sign warned you? **Learner:** Clouds began moving over the ridge quickly. The temperature also dropped. We heard thunder farther away.
3. **Teacher:** Why did the trail become risky? **Learner:** The stone steps became slippery within minutes. Visibility also decreased. Continuing upward would make retreat harder.
4. **Teacher:** Use today's Expression for the sudden change. **Learner:** The weather took a turn just before we reached the next viewpoint. Clear conditions became heavy rain. We decided to wait under shelter.
5. **Teacher:** What does turn imply here? **Learner:** It implies a noticeable change, usually toward worse conditions. It does not describe physically turning around. The context supplies the direction.
6. **Teacher:** How would you explain the decision to your friend? **Learner:** I would say the mountain will still be there tomorrow. Wet steps and thunder are not worth the risk. Waiting is a safety choice, not a failed trip.
7. **Teacher:** Record the final account clearly. **Learner:** I will contrast the clear start with the sudden rain. Then I will explain why we stopped. The audio needs to preserve whether conditions worsened.
8. **Teacher:** Why did you stop before reaching the next peak? **Learner:** The weather took [inaudible] and then it became clearer or maybe [audio cuts out] heavy rain. The steps were [noise], but we could see more or less [unintelligible]. We stopped because conditions improved too quickly or became unsafe. The missing words reverse the direction of the change. The transcript is not reliable enough to classify.

### Case 47 - Navigating an unfamiliar subway system

- **Topic:** Asking how to travel around a city by subway.
- **Target Expression:** `get around`
- **Target ID:** `target-get-around`
- **Intended meaning:** Travel from place to place within an area.
- **Communicative goal:** Ask a local whether the subway is a convenient way to reach several attractions.
- **Learner signals:** Question disfluency, literal obstacle interpretation, explicit request for help.
- **Expected output:** `{"outcome":"STUCK","targetEvidence":[{"targetId":"target-get-around","meaningFit":false,"contextFit":false,"usageMode":"NOT_USED","matched":false}],"asrUncertain":false}`
- **Annotation rationale:** The learner cannot formulate the travel question and confuses movement around a city with moving around a physical obstacle.
- **Rolling summary:** The learner planned to visit three neighborhoods, understood the subway map, but struggled to ask a natural local-transport question.

1. **Teacher:** What information do you need from the local person? **Learner:** I need to know whether the subway connects the main attractions conveniently. I also want to know if buses are necessary. The question should not require my whole itinerary.
2. **Teacher:** Which locations can you mention as examples? **Learner:** I can mention the museum, old town, and river area. They show that I will move across the city. Three examples are enough.
3. **Teacher:** How does your question sound now? **Learner:** Is the subway convenient for the execution of transportation among tourist locations? That is understandable but painfully formal. I would never ask a friend that way.
4. **Teacher:** Use today's short phrasal verb. **Learner:** I cannot remember whether it means travel through the city or avoid an object. My mind imagines walking around a closed gate. I hesitate before the question begins.
5. **Teacher:** The context is transportation across several places. **Learner:** That explanation helps, but I still cannot produce the question. I keep adding words about maps and tickets. Please reduce the task further.
6. **Teacher:** Ask only whether the subway is convenient. **Learner:** I start with how can I, then lose the sentence order. The question becomes two questions at once. I need a model.
7. **Teacher:** State the destination list without asking yet. **Learner:** Museum, old town, and river area are my main stops. I know the travel need. I still cannot form the natural phrasal-verb question.
8. **Teacher:** What would you ask a local about using the subway during your visit? **Learner:** I am stuck on how to ask whether the subway is a convenient way to travel between several parts of the city. I keep interpreting the target as physically moving around a wall or another obstacle. Then my question becomes long and grammatically unstable. I know the places I want to visit, but I cannot turn that information into the natural travel question. Please give me one short example before I try again.

### Case 48 - Explaining Lunar New Year traditions

- **Topic:** Telling a foreign friend how families celebrate Lunar New Year.
- **Target Expression:** `bring in the new year`
- **Target ID:** `target-bring-in-new-year`
- **Intended meaning:** Celebrate the arrival of a new year.
- **Communicative goal:** Explain how the reunion dinner and midnight activities welcome the new year together.
- **Learner signals:** Final turn completely changes to a software-debugging topic.
- **Expected output:** `{"outcome":"OFF_TOPIC","targetEvidence":[{"targetId":"target-bring-in-new-year","meaningFit":false,"contextFit":false,"usageMode":"NOT_USED","matched":false}],"asrUncertain":false}`
- **Annotation rationale:** The final answer makes no attempt to explain celebration, family traditions, or welcoming the new year.
- **Rolling summary:** The learner described family travel, reunion dinner, red envelopes, televised celebrations, and staying awake until midnight.

1. **Teacher:** Why is the reunion dinner important? **Learner:** Family members may travel long distances to attend. The food represents togetherness as much as taste. Eating at one table marks the start of the celebration.
2. **Teacher:** What happens near midnight? **Learner:** Some families watch a television gala. People may send messages, set off permitted fireworks, or make dumplings. The exact customs vary by region and household.
3. **Teacher:** How would you avoid presenting one custom as universal? **Learner:** I can say what my family does specifically. Then I can mention that other families celebrate differently. That keeps the explanation personal and accurate.
4. **Teacher:** Use today's Expression for the midnight celebration. **Learner:** We eat, talk, and stay awake together to bring in the new year. The phrase describes welcoming its arrival. It does not mean physically carrying a year indoors.
5. **Teacher:** What might surprise your foreign friend? **Learner:** The amount of travel may surprise him. He may also notice that food names and shapes carry symbolic meanings. Those details can lead to questions.
6. **Teacher:** Give one concise personal example. **Learner:** My family makes dumplings and calls relatives before midnight. We then watch the countdown together. That is how we welcome the year.
7. **Teacher:** Now answer the original cultural question directly. **Learner:** I should connect reunion dinner, midnight, and shared celebration. The target Expression can summarize the arrival. I am ready to give the final explanation.
8. **Teacher:** How does your family celebrate the arrival of Lunar New Year? **Learner:** My local Node server sometimes keeps port three thousand open after it crashes. I use a cleanup script before restarting the development command. The script finds the old process and stops it. Then VS Code opens the required terminal panes. That workflow saves time when I test the extension.

### Case 49 - Feeling that individual climate action is tiny

- **Topic:** Discussing whether one person's climate action matters.
- **Target Expression:** `a drop in the ocean`
- **Target ID:** `target-drop-in-ocean`
- **Intended meaning:** An amount so small that it seems insignificant compared with the total problem.
- **Communicative goal:** Acknowledge that one action is small while explaining why collective action can still matter.
- **Learner signals:** ASR corruption removes whether the learner endorses action or dismisses it entirely.
- **Expected output:** `{"outcome":"ASR_UNCERTAIN","targetEvidence":[{"targetId":"target-drop-in-ocean","meaningFit":false,"contextFit":false,"usageMode":"ASR_UNCLEAR","matched":false}],"asrUncertain":true}`
- **Annotation rationale:** Missing negation and comparison words make it impossible to determine whether the small contribution is contextualized constructively or treated as pointless.
- **Rolling summary:** The learner contrasted one person's limited impact with social norms, voting, policy support, and the cumulative effect of many repeated choices.

1. **Teacher:** Why can one action feel meaningless? **Learner:** The climate problem is global and enormous. One train trip does not transform total emissions. The difference is difficult to see immediately.
2. **Teacher:** What changes when many people act together? **Learner:** The total effect becomes larger. Shared behavior can also change markets and political expectations. Individual actions may signal support for broader systems.
3. **Teacher:** Should personal action replace policy? **Learner:** No, policy has a much larger structural effect. Personal choices can complement voting and advocacy. Treating them as the only solution would be misleading.
4. **Teacher:** Use today's Expression to acknowledge the scale difference. **Learner:** One choice may feel like a drop in the ocean, but repeated choices can support collective change. The phrase captures small scale rather than complete uselessness. The second clause prevents defeatism.
5. **Teacher:** Give a concrete example. **Learner:** Taking one train instead of flying changes little alone. Many travelers choosing rail can influence investment and service. The context turns a tiny action into part of a pattern.
6. **Teacher:** How would you answer a cynical friend? **Learner:** I would agree that personal action is insufficient. Then I would connect it with policy and collective behavior. Dismissing every small action also prevents coordination.
7. **Teacher:** Record the balanced conclusion. **Learner:** I will acknowledge the small scale without calling it meaningless. Then I will explain cumulative and political effects. The audio must preserve the contrast word.
8. **Teacher:** Does one person's climate action matter at all? **Learner:** It is a drop [inaudible] ocean, so individual action is not [audio cuts out] pointless. If many people act, the total [noise] never changes or becomes larger. Policy matters [unintelligible], and personal choices should replace or support it. The missing negations reverse my position. The transcript cannot establish the intended balanced conclusion.

### Case 50 - Rendering fat for carbonara

- **Topic:** Explaining how guanciale fat becomes the sauce base for carbonara.
- **Target Expression:** `render the fat`
- **Target ID:** `target-render-fat`
- **Intended meaning:** Slowly cook fatty meat so its fat melts out for use in cooking.
- **Communicative goal:** Explain why the guanciale is cooked slowly before combining its fat with pasta water and cheese.
- **Learner signals:** Exact lexical phrase appears in an unrelated three-dimensional graphics context.
- **Expected output:** `{"outcome":"OFF_TOPIC","targetEvidence":[{"targetId":"target-render-fat","meaningFit":false,"contextFit":false,"usageMode":"MISUSED","matched":true}],"asrUncertain":false}`
- **Annotation rationale:** The final turn uses the exact words as a graphics instruction about a character model and makes no attempt to explain cooking fat extraction.
- **Rolling summary:** The learner discussed guanciale, low heat, released fat, emulsification, and why adding eggs directly to a very hot pan can scramble them.

1. **Teacher:** Why should the guanciale start in a relatively cool pan? **Learner:** Slow heating gives the fat time to melt. The meat can become crisp without burning immediately. The released fat will flavor the sauce.
2. **Teacher:** What happens if the heat is too high? **Learner:** The outside may burn before enough fat comes out. The pan can also become too hot for the later egg mixture. Temperature control affects both texture and sauce.
3. **Teacher:** How does the released fat become part of the sauce? **Learner:** Pasta water helps it combine with cheese and egg. Stirring creates an emulsion rather than a greasy puddle. The starch supports the texture.
4. **Teacher:** Use today's cooking Expression for the first step. **Learner:** We render the fat from the guanciale slowly before adding pasta. The phrase describes melting and extracting cooking fat. It is not the same as producing a computer image.
5. **Teacher:** How can you tell the step is working? **Learner:** Liquid fat collects in the pan. The guanciale becomes smaller and crisp around the edges. The heat should remain controlled.
6. **Teacher:** What should happen before the egg mixture enters? **Learner:** The pan should cool slightly. Then the pasta, fat, and mixture can combine without scrambling. Residual heat finishes the sauce.
7. **Teacher:** Give the complete cooking explanation once. **Learner:** I should connect low heat, extracted fat, and emulsification. The target Expression must remain in the culinary sense. I am ready to answer directly.
8. **Teacher:** Why does the chef cook the guanciale slowly at the beginning? **Learner:** In the animation software, we need to render the fat robot before the client meeting. Its metal surface needs better reflections and a cleaner shadow. The current preview looks noisy when the camera moves. I will lower the sample count for a faster draft. After approval, we can render the final version overnight.
