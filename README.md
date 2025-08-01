# Midam's Playground

A small experimental project exploring Retrieval-Augmented Generation (RAG)-like capabilities using Google Gemini and a PostgreSQL-backed chat history. This is a lightweight attempt at building my own AI chat agent that supports streaming responses, persistent conversations, and context-aware interactions — without relying on heavy external frameworks.

---

## How to Run Locally

### 1. Install Python Dependencies

```bash
pip install -r requirements.txt
```

### 2. Set Up Your Environment

Create a `.env` file in the backend root directory with the following:

```env
GENAI_API_KEY=your_gemini_api_key_here
POSTGRES_DBNAME=MastAI
POSTGRES_USER=your_postgres_username
POSTGRES_PASSWORD=your_postgres_password
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
```

### 3. Run the Backend Server

```bash
uvicorn backend:app --reload
```

This starts the FastAPI server at:

```
http://127.0.0.1:8000/
```

### 4. Run the Frontend

```bash
npm install
npm run dev
```

This starts the frontend at:

```
http://localhost:3000/
```

---
## Features

- Streamed chat using Google Gemini API  
- Chat history stored in PostgreSQL  
- Context-aware conversations using Gemini history  
- Simple React frontend with chat UI and message persistence  
- Secrets loaded securely via `.env`  

---
