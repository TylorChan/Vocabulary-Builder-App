<p align="right">
  <a href="./README.md">English</a> | <a href="./README.zh-CN.md">中文</a>
</p>

$${\color{orange}\Huge\text{不再复制字幕去查意思 😓}}$$
$${\color{pink}\Huge\text{不再跳转多个搜索标签页 🥲}}$$
$${\color{red}\Huge\text{不再掉进传统单词卡片地狱 🤬}}$$
$${\color{green}\Huge\text{学习一站式搞定，就在你观看的地方 ✅}}$$
$${\color{blue}\Huge\text{🙀 🤯 有请..............}}$$

# <img src="Mark1/public/icons/ironman.png" width="50" height="50" /> $${\color[RGB]{17,49,245}\Huge\text{MARK II}}$$
AI 驱动的基于React的 Chrome 插件，可从 YouTube 捕获实时转录，为任意选中文本即时提供语境化释义，并通过 AI 语音对话强化学习效果。

## 更新日志
### v2.1.0（当前）
- **确定性**的多智能体复习流程（Teacher <-> Rater，严格的工具调用 + 状态管理来保证智能体的工作流的确定性）。
- 提供评分Agent给出该分数的理由。
<p align="center">
  <img src="https://github.com/user-attachments/assets/25c30d72-107f-4e4b-934b-a6a4a7ac66a7" style="height:auto;width:300px;vertical-align:middle;border:0;" alt="Old" />
</p>

### v2.0.3
  - 更清爽的Agent日志 UI（旧 → 新）。
    <p align="center">
      <img src="https://github.com/user-attachments/assets/f83cafba-abb6-4d57-bf7b-142a50e2f93c"
           style="height:auto;width:300px;vertical-align:middle;border:0;" alt="Old" />
      <span style="display:inline-block;height:500px;line-height:500px;vertical-align:middle;font-size:28px;">→</span>
      <img src="https://github.com/user-attachments/assets/73284eb2-4a28-4ad2-89e0-d5dab6318f23"
           style="height:auto;width:300px;vertical-align:middle;border:0;" alt="New" />
    </p>
  - 字幕转录启动更快、更稳定。

### v2.0.2 
- UI 迁移到持久化 **Chrome 侧边栏**（不再因失焦关闭）
- 通过 Spring Boot GraphQL + MongoDB 打通 **Interface 1 ↔ Interface 2**：
  - 保存词汇（`saveVocabulary`）
  - 加载到期词（`startReviewSession`）
  - 批量持久化复习结果（`saveReviewSession`）
- Interface 2 升级为 **AI 多智能体语音复习闭环**（Teacher + Rater），并以工具驱动：
  - 确定性顺序（`get_next_word`），防止会话卡住
  - 词级边界追踪 + 完整证据用于评分
  - 评分本地缓存，断开时 **批量同步**（可重试）

### v2.0.0
- 插件 UI 为 **弹窗**（失焦即关闭）
- Interface 1 与 Interface 2 **未打通**
- Interface 2 仅为 **基础语音 Agent Demo**（无工具、无多智能体、无后端驱动复习）

## 架构概览
<img src="Mark1/public/icons/MarkII_architecure.png" alt="MARK II overall architecture" width="100%" />

### 多智能体工作流（Interface 2）
<img src="Mark1/public/icons/multi-agent_architecture.svg" alt="Multi-Agent Flow" width="100%" />

## 主要功能

### Interface 1：实时字幕视图

#### 🎥 演示（点击缩略图观看）

[![MARK II - Interface 1 Demo](https://img.youtube.com/vi/2OYfxE2eaIY/maxresdefault.jpg)](https://youtu.be/2OYfxE2eaIY)


- 通过实时语音转录 **[Deepgram](https://deepgram.com/product/speech-to-text)** 在侧边栏展示 YouTube 实时字幕
- 一键媒体控制：后退 15s / 播放–暂停 / 前进 15s
- 选中任意单词/短语/句子，获取即时、语境化释义 + 中文翻译。由 **[Gemini2.5 Flash Lite](https://ai.google.dev/gemini-api/docs/models)**支持
- 保存选中内容，供 Interface 2 复习

### Interface 2：AI 对话复习
#### 🎥 演示（点击缩略图观看）

[![MARK II - Interface 2 Demo](https://img.youtube.com/vi/OxUv6CSDiHk/maxresdefault.jpg)](https://youtu.be/OxUv6CSDiHk)


- 在侧边栏与 **AI 多智能体语音导师**对话 [OpenAI Realtime](https://github.com/openai/openai-realtime-agents)
- **Teacher Agent** 负责引导对话并保持流程稳定
- **Rater Agent** 使用词级完整证据进行评估并给出 FSRS 评分
- 复习结果本地缓冲，断开时批量同步至后端（GraphQL）
## 资源
cross-site audio capture: https://developer.chrome.com/docs/web-platform/screen-sharing-controls/#displaySurface

cross-site audio control: https://developer.mozilla.org/en-US/docs/Web/API/Media_Session_API

Speech to Text API: https://developers.deepgram.com/docs/live-streaming-audio 

openAI-realtime-agnet: https://github.com/openai/openai-realtime-agents

## 路线图

- 叠加式词汇面板（页面内随时可用）
- 取消保存/删除词汇条目
- 改善字幕体验：更长的转写缓冲，便于稳定选择

## $${\color{green}\Huge\text{已完成}}$$

- 持久化侧边栏 UI + 扩展消息通信
- 后端（Spring Boot + GraphQL + MongoDB）：saveVocabulary、startReviewSession、saveReviewSession
- Interface 1（捕获）：Deepgram 字幕、媒体控制、Gemini 释义 + 中文翻译
- Interface 2（语音复习）：Teacher <-> Rater 多智能体复习、通过FSRS python flask微服务获取词组的下个复习日、断开批量同步

