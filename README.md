# Sabha — Your Personal AI Advisory Board

> *"Don't ask one AI. Convene a board."*

Sabha is an open-source, multi-agent collaborative workspace where you host **structured meetings** with a roster of distinct AI personas. Unlike a standard chatbot, Sabha's agents have persistent personalities, private knowledge bases, and formal roles. They debate, disagree, and reach consensus — all trackable in real time on a live scoreboard.

---

## ✨ What Makes Sabha Different

| Feature | Standard Chatbot | Sabha |
|---|---|---|
| Number of AIs | 1 | Multiple (full roster) |
| Turn control | AI-controlled | **User-directed** |
| Disagreements | Ignored | First-class tracked objects |
| Knowledge | Shared | Private per-agent + shared meeting docs |
| Grounding | Hallucinations possible | RAG + Web search tools |
| Cost tracking | None | Per-message & per-meeting |

---

## 🗺️ Table of Contents

1. [Core Concepts](#-core-concepts)
2. [Architecture](#-architecture)
3. [Tech Stack](#-tech-stack)
4. [Project Structure](#-project-structure)
5. [Getting Started](#-getting-started)
6. [Environment Variables](#-environment-variables)
7. [Database Setup](#-database-setup)
8. [LLM Providers](#-llm-providers)
9. [RAG Pipeline](#-rag-pipeline)
10. [API Reference](#-api-reference)
11. [Agent Specification](#-agent-specification)
12. [Roadmap](#-roadmap)
13. [Contributing](#-contributing)

---

## 🧠 Core Concepts

### The Meeting
A **Meeting** (Sabha) is the primary workspace. It has:
- A **name** and an **agenda** (the meta-objective visible to all agents)
- A **roster** of AI participants, each with a unique persona
- A **shared document pool** uploaded by the user (fed into the RAG pipeline)
- A live **Disagreement Scoreboard** and **Consensus Log**
- A running **cost tracker**

### The Roster
Your **AI Roster** is a library of reusable AI personas. Each persona has:
- A **name** and **role** (e.g., "The Investor", "The CTO")
- A unique **system prompt** defining personality, focus, and tone
- An optional **private Knowledge Stack** — documents only that agent can see
- A configurable **LLM provider + model** (e.g., Claude for one agent, Gemini for another)

### Turn-Taking (User-Controlled Orchestration)
Sabha does not auto-run. You are the **Director**. You explicitly choose which AI speaks next by clicking their button. This gives you full control over the flow of debate. A lightweight auto-facilitate toggle is available for generating a few AI-to-AI turns automatically.

### Disagreements & Consensus
These are **first-class tracked objects**, not just text. When an AI calls the `log_disagreement` or `log_consensus` tool:
- The event is persisted to the database
- The **Scoreboard** in the right sidebar updates in real time
- Disagreements have a **severity score** (1–5), consensus has a **strength score** (1–5)

---

## 🏗️ Architecture

```
┌────────────────────────────────────────────────────────────┐
│                     Sabha Application                      │
│                                                            │
│  ┌──────────────┐   REST/SSE    ┌──────────────────────┐  │
│  │  Next.js 16  │◄─────────────►│  FastAPI Backend     │  │
│  │  (React 19)  │               │                      │  │
│  │  TypeScript  │               │  ┌────────────────┐  │  │
│  │  Tailwind 4  │               │  │  Orchestrator  │  │  │
│  │  Zustand     │               │  │  (Turn Engine) │  │  │
│  └──────────────┘               │  └───────┬────────┘  │  │
│                                 │          │            │  │
│                                 │  ┌───────▼────────┐  │  │
│                                 │  │  LLM Provider  │  │  │
│                                 │  │  (Pluggable)   │  │  │
│                                 │  └───────┬────────┘  │  │
│                                 └──────────┼───────────┘  │
│                                            │              │
│  ┌─────────────┐   ┌────────────┐  ┌───────▼────────┐    │
│  │  Supabase   │   │   Qdrant   │  │  LLM API       │    │
│  │ (Postgres + │   │ (Vector DB │  │  OpenRouter /  │    │
│  │  Auth)      │   │  for RAG)  │  │  Gemini /      │    │
│  └─────────────┘   └────────────┘  │  Ollama        │    │
│                                    └────────────────┘    │
└────────────────────────────────────────────────────────────┘
```

### The Orchestration Loop

When you trigger an AI turn (`POST /api/meetings/{id}/turn/{participant_id}/stream`):

```
1. HYDRATE   → Load meeting, participant config, and full chat history from Supabase
2. ASSEMBLE  → Build LLM context: [System Prompt + Persona] + [Meeting Agenda] + [Compressed History]
3. INFER     → Call LLM provider with tool definitions injected
4. TOOL LOOP → If LLM calls a tool (search_kb, log_disagreement, etc.):
               → Execute tool → append result → call LLM again
5. STREAM    → Stream TEXT tokens to frontend via SSE
6. PERSIST   → Save final message, tool artifacts, thinking content, and cost to Supabase
```

---

## 🛠️ Tech Stack

### Frontend
| Tech | Version | Purpose |
|---|---|---|
| Next.js | 16.x | React framework + App Router |
| React | 19.x | UI library |
| TypeScript | 5.x | Type safety |
| Tailwind CSS | 4.x | Styling |
| Radix UI | latest | Accessible headless components |
| Zustand | 5.x | Client-side state management |
| `react-markdown` | 10.x | Markdown rendering in chat |

### Backend
| Tech | Version | Purpose |
|---|---|---|
| Python | 3.10+ | Runtime |
| FastAPI | 0.109+ | REST API + SSE streaming |
| Supabase | 2.x | PostgreSQL database + Auth |
| Qdrant | 1.7+ | Vector store for RAG |
| `sse-starlette` | 3.2+ | Server-Sent Events |
| `tiktoken` | 0.5+ | Token counting |
| `pypdf`, `python-docx`, `openpyxl` | latest | Document parsing |
| `langchain-text-splitters` | latest | Text chunking |
| `cohere`, `openai` (SDK) | latest | Embedding providers |

---

## 📁 Project Structure

```
Sabha/
├── .env.example                  # Root env variables template
├── AGENTS.md                     # Agent architecture & tool specification
├── design.md                     # Product design document (v1.2)
│
├── backend/
│   ├── main.py                   # FastAPI app entry point
│   ├── requirements.txt
│   ├── supabase_schema.sql       # Full DB schema (run once in Supabase)
│   └── app/
│       ├── api/                  # Route handlers
│       │   ├── meetings.py       # Meeting CRUD + turn execution
│       │   ├── participants.py   # AI participant endpoints
│       │   ├── personas.py       # Roster/persona management
│       │   ├── documents.py      # File upload & RAG indexing
│       │   ├── knowledge_stacks.py # Knowledge stack management
│       │   └── settings.py       # App settings API
│       ├── llm/                  # LLM provider abstraction
│       │   ├── base.py           # Abstract LLMProvider interface
│       │   ├── gemini.py         # Google Gemini adapter
│       │   ├── openrouter.py     # OpenRouter adapter (Claude, GPT-4, etc.)
│       │   └── ollama.py         # Ollama (local) adapter
│       ├── services/             # Core business logic
│       │   ├── orchestrator.py   # Turn-taking engine (the brain)
│       │   ├── meeting_manager.py # Meeting state management
│       │   ├── persona_manager.py # Persona & roster logic
│       │   ├── vector_store.py   # Qdrant interface
│       │   ├── document_processor.py # PDF/DOCX/XLSX parsing & chunking
│       │   ├── embedding.py      # Embedding model interface
│       │   ├── tools.py          # Tool definitions injected into LLM
│       │   ├── prompts.py        # Base system prompt templates
│       │   └── streaming.py      # SSE streaming helpers
│       ├── models/               # Pydantic data models
│       └── core/                 # Config, DB client, etc.
│
└── frontend/
    ├── next.config.ts
    ├── package.json
    └── src/
        ├── app/                  # Next.js App Router pages
        │   ├── page.tsx          # Dashboard / home
        │   ├── meetings/         # Meeting room pages
        │   ├── roster/           # AI persona management
        │   ├── knowledge-stacks/ # Knowledge stack management
        │   └── settings/         # App settings UI
        ├── components/
        │   ├── chat/             # Chat UI components
        │   ├── layout/           # Sidebar, nav, shell
        │   ├── settings/         # Settings panel components
        │   └── ui/               # Radix-based component library
        ├── lib/                  # API client, utilities
        └── stores/               # Zustand state stores
```

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** 18+ and **npm**
- **Python** 3.10+
- A [Supabase](https://supabase.com) project (free tier works)
- A [Qdrant](https://qdrant.tech) instance — cloud or local via Docker
- At least one LLM provider key (Gemini, OpenRouter, or a local Ollama install)

### 1. Clone the repository

```bash
git clone https://github.com/your-username/Sabha.git
cd Sabha
```

### 2. Set up environment variables

```bash
cp .env.example backend/.env
```

Edit `backend/.env` with your credentials (see [Environment Variables](#-environment-variables)).

For the frontend:

```bash
cp frontend/.env.example frontend/.env.local
```

### 3. Set up the database

Open your [Supabase SQL Editor](https://app.supabase.com) and run the full schema:

```bash
# Copy contents of this file and run in Supabase SQL Editor
cat backend/supabase_schema.sql
```

### 4. Start the backend

```bash
cd backend
python -m venv venv

# Windows
venv\Scripts\activate
# macOS/Linux
source venv/bin/activate

pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Backend API will be live at: `http://localhost:8000`  
Interactive docs: `http://localhost:8000/docs`

### 5. Start the frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend will be live at: `http://localhost:3000`

---

## 🔐 Environment Variables

All variables live in `backend/.env`. Copy from `.env.example`:

```env
# ── Supabase ─────────────────────────────────────────────────────
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your_supabase_anon_key
SUPABASE_SERVICE_KEY=your_supabase_service_role_key

# ── Default LLM Provider ──────────────────────────────────────────
# Options: "gemini" | "openrouter" | "ollama"
DEFAULT_LLM_PROVIDER=gemini

# ── Ollama (local, no API key needed) ────────────────────────────
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_DEFAULT_MODEL=llama3.2

# ── OpenRouter (access Claude, GPT-4, Mistral, etc.) ─────────────
OPENROUTER_API_KEY=sk-or-...
OPENROUTER_DEFAULT_MODEL=anthropic/claude-sonnet-4-20250514

# ── Google Gemini ─────────────────────────────────────────────────
# Get key at: https://aistudio.google.com/apikey
GEMINI_API_KEY=AIza...
GEMINI_DEFAULT_MODEL=gemini-1.5-flash

# ── App ───────────────────────────────────────────────────────────
APP_ENV=development
CORS_ORIGINS=http://localhost:3000
```

**Frontend** (`frontend/.env.local`):
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
NEXT_PUBLIC_API_URL=http://localhost:8000
```

---

## 🗄️ Database Setup

Run `backend/supabase_schema.sql` once in your Supabase SQL Editor. It creates:

| Table | Purpose |
|---|---|
| `meetings` | Meeting rooms with agenda and cost tracking |
| `ai_participants` | AI agents active in a specific meeting |
| `messages` | All chat messages (user, AI, system) |
| `disagreements` | Logged disagreements with severity scores |
| `consensus` | Logged consensus points with strength scores |
| `documents` | Document metadata for the RAG pipeline |

Row Level Security (RLS) is enabled on all tables. Policies are permissive by default for easy local development — **tighten these before any production deployment**.

---

## 🤖 LLM Providers

Sabha uses a pluggable **Provider Adapter** pattern. Every provider implements the same `LLMProvider` abstract base class with `complete()` and `stream()` methods.

### Supported Providers

| Provider | Config Value | Notes |
|---|---|---|
| **Google Gemini** | `gemini` | Recommended default. Supports streaming + thinking tokens. |
| **OpenRouter** | `openrouter` | Access to Claude, GPT-4, Mistral, and 100+ models via one key. |
| **Ollama** | `ollama` | Fully local inference. No API key. Great for privacy. |

### Per-Agent Model Overrides

Each AI participant can use a **different provider and model** within the same meeting. Configure this in the Roster settings or via the `provider_config` JSONB field:

```json
{
  "provider": "openrouter",
  "model": "anthropic/claude-opus-4",
  "temperature": 0.7
}
```

Leave `provider` or `model` blank to fall back to the global `DEFAULT_LLM_PROVIDER` setting.

---

## 📚 RAG Pipeline

Sabha has a full Retrieval-Augmented Generation pipeline using **Qdrant** as the vector store.

### How It Works

1. **Upload** — User uploads a document (PDF, DOCX, XLSX) to a meeting or a Knowledge Stack
2. **Parse** — `document_processor.py` extracts raw text using `pypdf`, `python-docx`, or `openpyxl`
3. **Chunk** — Text is split using LangChain's text splitters
4. **Embed** — Chunks are embedded via Cohere or OpenAI embedding models
5. **Store** — Embeddings are upserted into a Qdrant collection (one per meeting or knowledge stack)
6. **Retrieve** — When an AI calls `search_knowledge_base`, the orchestrator queries the relevant collections and injects the top-5 chunks into the next LLM call

### Document Scoping

| Scope | Who Can Access |
|---|---|
| **Meeting documents** | All AI participants in that meeting |
| **Knowledge Stack documents** | Only AI personas assigned to that stack |

This enables genuine **information asymmetry** between agents — e.g., only The Investor can see the Q4 financial projections.

### Supported File Types

| Format | Extension |
|---|---|
| PDF | `.pdf` |
| Word Document | `.docx` |
| Excel Spreadsheet | `.xlsx` |

---

## 📡 API Reference

The full interactive API docs are available at `http://localhost:8000/docs` when the backend is running.

### Key Endpoints

#### Meetings
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/meetings` | List all meetings |
| `POST` | `/api/meetings` | Create a new meeting |
| `GET` | `/api/meetings/{id}` | Get meeting detail (with messages) |
| `DELETE` | `/api/meetings/{id}` | Delete a meeting |
| `POST` | `/api/meetings/{id}/turn/{participant_id}` | Trigger an AI turn (non-streaming) |
| `GET` | `/api/meetings/{id}/turn/{participant_id}/stream` | Trigger an AI turn **(SSE streaming)** |
| `POST` | `/api/meetings/{id}/message` | Send a user message |

#### Roster & Personas
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/personas` | List all saved AI personas |
| `POST` | `/api/personas` | Create a new persona |
| `PUT` | `/api/personas/{id}` | Update a persona |
| `DELETE` | `/api/personas/{id}` | Delete a persona |

#### Documents
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/documents/upload` | Upload & index a document |
| `GET` | `/api/documents` | List documents (by meeting or stack) |
| `DELETE` | `/api/documents/{id}` | Delete a document |

#### Knowledge Stacks
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/knowledge-stacks` | List all knowledge stacks |
| `POST` | `/api/knowledge-stacks` | Create a new knowledge stack |

#### Settings
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/settings` | Get current app settings |
| `PUT` | `/api/settings` | Update settings |

---

## 🤖 Agent Specification

See [`AGENTS.md`](./AGENTS.md) for the full agent architecture spec, including:
- Base system prompt that all agents receive
- Default persona templates (Investor, CTO, Analyst)
- Full tool definitions (JSON schema) for `search_knowledge_base`, `web_search`, `log_disagreement`, and `log_consensus`
- The complete turn lifecycle and orchestration loop

### Default Personas

| Persona | Focus | Tone |
|---|---|---|
| **The Investor** | ROI, TAM, CAC/LTV, exit strategy | Direct, skeptical, numbers-first |
| **The CTO** | Tech stack, scalability, security, debt | Analytical, buzzword-averse |
| **The Analyst** | User trends, competitor data, citations | Neutral, data-driven |

---

## 🗺️ Roadmap

### ✅ Phase 1 – Core Loop (MVP) — *Complete*
- [x] Multi-meeting workspace with agenda
- [x] AI Roster with reusable persona templates
- [x] Streaming AI responses (SSE)
- [x] Disagreement & Consensus logging with scoreboards
- [x] Multi-provider LLM support (Gemini, OpenRouter, Ollama)
- [x] Per-agent model override
- [x] Cost estimation per message and per meeting
- [x] Thinking tokens support (for extended reasoning models)

### 🔄 Phase 2 – The Brain (RAG + Tools) — *In Progress*
- [x] Document upload & Qdrant indexing
- [x] `search_knowledge_base` tool for agents
- [x] Private Knowledge Stacks per persona
- [ ] Web search tool (Tavily integration)
- [ ] Citations rendered in chat bubbles

### 📅 Phase 3 – Robustness — *Planned*
- [ ] Context compression (semantic summarization for long meetings)
- [ ] Meeting summary generation
- [ ] Fork & replay a meeting from any point
- [ ] Supabase Auth + multi-user support
- [ ] Cost dashboard and billing overview
- [ ] Auto-facilitate toggle (lightweight moderator AI)

---

## 🤝 Contributing

Contributions are welcome! Here's how to get started:

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/your-feature`
3. Make your changes, following the existing code patterns
4. Add/update tests where appropriate
5. Open a Pull Request with a clear description

### Development Tips

- **Backend hot-reload**: `uvicorn main:app --reload` watches for file changes automatically
- **API docs**: FastAPI auto-generates docs at `/docs` (Swagger) and `/redoc`
- **Type checking**: Run `npx tsc --noEmit` in the `frontend/` directory
- **Agent behavior**: Edit `AGENTS.md` and the corresponding system prompts in `backend/app/services/prompts.py` to modify agent personalities

---

## 📄 License

This project is currently unlicensed. All rights reserved by the author.

---

<div align="center">
  <p>Built with ❤️ — <em>Your personal AI advisory board</em></p>
</div>
