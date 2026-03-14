# Query Builder — Stage by Stage

The **Auto Search Query** is the Arabic prompt sent to Perplexity Sonar to discover story suggestions. It is built inside Brain v2 (`getBrainV2Data`). Below is the pipeline stage by stage.

---

## Mermaid: pipeline (stage by stage)

```mermaid
flowchart LR
  subgraph Data
    A[1. Competitor videos done]
    B[2. Our videos done]
    C[3. Build topic map]
    D[4. Assemble stories]
    E[5. Tag published gap_win/late]
    F[6. Competitor channels]
  end
  subgraph Slices
    G[gapWinTitles top 3]
    H[openTitles top 3]
    I[takenTitles top 5]
    J[competitorHandles]
  end
  subgraph Query
    K[buildAutoSearchQuery]
    L[autoSearchQuery]
  end
  A --> C
  B --> C
  C --> D
  B --> E
  D --> H
  D --> I
  E --> G
  F --> J
  G --> K
  H --> K
  I --> K
  J --> K
  K --> L
```

```mermaid
flowchart TB
  subgraph Stage1["Stage 1: DB"]
    S1A["Competitor videos (done)"]
    S1B["Our videos (done)"]
  end
  subgraph Stage2["Stage 2: Topics"]
    S2["Topic map + ourTopicSet"]
  end
  subgraph Stage3["Stage 3: Stories"]
    S3A["takenStories"]
    S3B["untouchedStories"]
    S3C["publishedVideos (gap_win/late)"]
  end
  subgraph Stage4["Stage 4: Channels"]
    S4["Competitor channels list"]
  end
  subgraph Stage5["Stage 5: Slices"]
    S5A["gapWinTitles (3)"]
    S5B["openTitles (3)"]
    S5C["takenTitles (5)"]
    S5D["competitorHandles"]
  end
  subgraph Stage6["Stage 6: Build query"]
    S6["Base + open + gap + taken + competitor"]
    S7["autoSearchQuery"]
  end
  S1A --> S2
  S1B --> S2
  S2 --> S3A
  S2 --> S3B
  S1B --> S3C
  S4 --> S5D
  S3C --> S5A
  S3B --> S5B
  S3A --> S5C
  S5A --> S6
  S5B --> S6
  S5C --> S6
  S5D --> S6
  S6 --> S7
```

---

## High-level flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  DATA GATHERING                    │  QUERY INGREDIENTS    │  FINAL QUERY    │
│  (DB + processing)                 │  (slices for prompt)  │  (Arabic text)   │
├───────────────────────────────────┼──────────────────────┼─────────────────┤
│  1. Competitor videos (done)       │                      │                 │
│  2. Our videos (done)              │  gapWinTitles        │                 │
│  3. Topic map (competitor topics)  │  openTitles          │  buildAuto      │
│  4. Assemble stories (taken/open) │  takenTitles         │  SearchQuery()  │
│  5. Tag our videos (gap_win/late) │  competitorHandles  │       │         │
│  6. Competitor channels list       │                      │       ▼         │
│  7. Slice & format titles/handles │                      │  autoSearchQuery │
└───────────────────────────────────┴──────────────────────┴─────────────────┘
```

---

## Stage-by-stage (backend)

| Stage | What happens | Output used for query |
|-------|----------------|------------------------|
| **1. init** | Start, set `requestTime` | — |
| **2. Competitor videos** | `db.video.findMany` — competitor channels, stage `done`, with `analysisResult` | Feeds topic extraction |
| **3. query-our-videos** | `db.video.findMany` — our channels, stage `done`, with `analysisResult` | Feeds topic set + later “published videos” |
| **4. build-topic-map** | From each competitor video, `extractTopics(analysisResult)` → normalize with `normTopic()`; build `topicMap` (topic → entries). From our videos, build `ourTopicSet` (topics we already covered). | Topic keys for stories |
| **5. assemble-stories** | For each topic in `topicMap`: if we covered it → `takenStories`; else if ≤14 days old → `untouchedStories` (open); else → `takenStories`. Sort untouched by `daysSince`. | `takenStories`, `untouchedStories` |
| **6. tag-published-videos** | For each of our videos: compare publish date with competitor entries for same topic → tag `gap_win` (we were first) or `late`. Build `publishedVideos` list. | Gap-win titles for “similar to our wins” |
| **7. query-competitor-channels** | `db.channel.findMany` — competitor channels, order by subscribers. | Handles for “did competitors cover this?” |
| **8. Slice for prompt** | `gapWinTitles` = top 3 gap_win video titles (≈40 chars each).<br>`openTitles` = top 3 untouched story titles (≈60 chars, with bullet).<br>`takenTitles` = top 5 taken story titles (≈40 chars each).<br>`competitorHandles` = comma-separated handles. | **All four** go into `buildAutoSearchQuery()` |
| **9. buildAutoSearchQuery** | Concatenate: **fixed base** (Arabic: “أعطني أبرز 8 قضايا…”) + **openSection** (priority open issues) + **gapSection** (search similar to our wins) + **takenSection** (avoid these, already filmed) + **competitorSection** (per story: title, summary, source URL, did competitors cover?). | **autoSearchQuery** (full string) |
| **10. load-topic-memory** | Load `TopicMemory` for project (for scoring, not query text). | — |
| **11. score-and-rank** | Score untouched stories (winner weight, freshness, saturation), sort, take top 5 → `rankedOpportunities`. | — |

---

## What goes into the final query (buildAutoSearchQuery)

```
┌────────────────────────────────────────────────────────────────────────────┐
│  BASE (fixed)                                                               │
│  أعطني أبرز 8 قضايا وأخبار من الجريمة والقضايا الحقيقية في السعودية       │
│  والخليج: خليط من أخبار حديثة (آخر 7 أيام) وقصص قديمة ما زالت تستحق...   │
├────────────────────────────────────────────────────────────────────────────┤
│  OPEN SECTION (if openTitles.length > 0)                                   │
│  أولوية: ابحث عن تطورات جديدة في هذه القضايا الغير مغطاة:                  │
│  • عنوان 1                                                                  │
│  • عنوان 2                                                                  │
│  • عنوان 3                                                                  │
├────────────────────────────────────────────────────────────────────────────┤
│  GAP SECTION (if gapWinTitles.length > 0)                                   │
│  ابحث عن قصص مشابهة في النوع والشعور لـ:                                   │
│  "عنوان فيديو 1…"                                                           │
│  و"عنوان فيديو 2…"                                                          │
│  (حققت أعلى مشاهدات لقناتنا).                                               │
├────────────────────────────────────────────────────────────────────────────┤
│  TAKEN SECTION (if takenTitles.length > 0)                                   │
│  تجنب تماماً أي قصص مشابهة لـ:                                              │
│  "قصة 1…", "قصة 2…", … — هذه تم تصويرها بالفعل.                             │
├────────────────────────────────────────────────────────────────────────────┤
│  COMPETITOR SECTION                                                         │
│  لكل قصة: العنوان، ملخص جملتين، رابط المصدر، وهل غطاها أحد من منافسينا    │
│  (handle1, handle2, …)؟   OR   لكل قصة: العنوان، ملخص جملتين، رابط المصدر. │
└────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
                          autoSearchQuery (single string)
                                    │
                                    ▼
                    Used by: GET /api/brain-v2 (UI) and POST /api/stories/fetch (Perplexity)
```

---

## Summary

1. **Data**: Competitor + our videos (done) → topics → taken vs untouched stories; our videos tagged gap_win/late; competitor channel list.
2. **Slices**: Top gap-win titles, top open (untouched) titles, top taken titles, competitor handles.
3. **Assembly**: Fixed base + open + gap + taken + competitor instructions → one Arabic prompt.
4. That prompt is shown in the Brain v2 UI as **Auto Search Query** and is what **Fetch** sends to Perplexity to get story suggestions.
