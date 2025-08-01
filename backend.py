from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import google.generativeai as genai
import psycopg2
import uuid
from fastapi.responses import StreamingResponse
import asyncio
import os
from dotenv import load_dotenv
load_dotenv()

genai.configure(api_key=os.getenv("GENAI_API_KEY"))
model = genai.GenerativeModel("models/gemini-2.5-flash")


conn = psycopg2.connect(
    dbname=os.getenv("POSTGRES_DBNAME"),
    user=os.getenv("POSTGRES_USER"),
    password=os.getenv("POSTGRES_PASSWORD"),
    host=os.getenv("POSTGRES_HOST"),
    port=os.getenv("POSTGRES_PORT")
)


# === FastAPI App ===
app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# === Create Tables on Startup ===
@app.on_event("startup")
def create_tables():
    with conn.cursor() as cur:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS chats (
                chat_id UUID PRIMARY KEY,
                user_id TEXT NOT NULL,
                chat_name TEXT DEFAULT 'Untitled Chat',
                created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            );
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS messages (
                id SERIAL PRIMARY KEY,
                chat_id UUID REFERENCES chats(chat_id),
                sender TEXT NOT NULL,
                message TEXT NOT NULL,
                timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            );
        """)
        conn.commit()

# === Helper Functions ===
def log_chat_message(chat_id, sender, message):
    try:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO messages (chat_id, sender, message) VALUES (%s, %s, %s);",
                (chat_id, sender, message)
            )
            conn.commit()
    except Exception as e:
        conn.rollback()
        raise e

def get_chat_history(chat_id):
    with conn.cursor() as cur:
        cur.execute(
            "SELECT sender, message, timestamp FROM messages WHERE chat_id = %s ORDER BY timestamp ASC;",
            (chat_id,)
        )
        return [{"sender": s, "message": m, "timestamp": t} for s, m, t in cur.fetchall()]

def generate_chat_title(user_input, bot_response):
    prompt = f"""
    Generate a short 3-5 word chat title summarizing this conversation.
    User: {user_input}
    Assistant: {bot_response}
    Title:
    """
    response = model.generate_content(prompt)
    return response.text.strip().strip('"')

# === API Endpoints ===

@app.post("/new_chat")
async def create_new_chat(request: Request):
    data = await request.json()
    user_id = data.get("user_id")
    if not user_id:
        return {"error": "Missing user_id"}

    chat_id = str(uuid.uuid4())
    try:
        with conn.cursor() as cur:
            cur.execute("INSERT INTO chats (chat_id, user_id) VALUES (%s, %s);", (chat_id, user_id))
            conn.commit()
    except Exception as e:
        conn.rollback()
        return {"error": str(e)}

    return {"chat_id": chat_id}

@app.post("/chat")
async def chat_handler(request: Request):
    data = await request.json()
    user_input = data.get("text", "")
    chat_id = data.get("chat_id")
    model_id = data.get("model", "gemini-2.5-flash")

    if not chat_id or not user_input.strip():
        return {"error": "Missing input or chat_id"}

    log_chat_message(chat_id, "user", user_input)

    # Build history
    history = get_chat_history(chat_id)[:-1]
    gemini_history = [{"role": "user" if msg["sender"] == "user" else "model", "parts": [msg["message"]]} for msg in history]
    
    selected_model = genai.GenerativeModel(f"models/{model_id}")
    chat = selected_model.start_chat(history=gemini_history)
    print(user_input)
    response = chat.send_message(user_input, stream=True)
    print(response)

    async def event_stream():
        full_response = ""
        try:
            for chunk in response:
                text = chunk.text
                if text:
                    full_response += text
                    yield text
                    await asyncio.sleep(0.01)
        finally:
            log_chat_message(chat_id, "bot", full_response)
            if len(history) == 1:
                title = generate_chat_title(user_input, full_response)
                with conn.cursor() as cur:
                    cur.execute("UPDATE chats SET chat_name = %s WHERE chat_id = %s;", (title, chat_id))
                    conn.commit()

    return StreamingResponse(event_stream(), media_type="text/plain")

@app.get("/chat_history/{chat_id}")
def get_full_chat(chat_id: str):
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT chat_name FROM chats WHERE chat_id = %s;", (chat_id,))
            row = cur.fetchone()
            chat_name = row[0] if row else "Restored Chat"
            history = get_chat_history(chat_id)
            return {
                "chat_name": chat_name,
                "messages": history
            }
    except Exception as e:
        conn.rollback()
        return {"error": str(e)}

@app.get("/user_chats/{user_id}")
def get_user_chats(user_id: str):
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT chat_id, chat_name, created_at
                FROM chats
                WHERE user_id = %s
                ORDER BY created_at DESC;
            """, (user_id,))
            rows = cur.fetchall()
            return [
                {"id": str(cid), "name": name, "createdAt": str(created)}
                for cid, name, created in rows
            ]
    except Exception as e:
        conn.rollback()
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.delete("/delete_chat/{chat_id}")
def delete_chat(chat_id: str):
    try:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM messages WHERE chat_id = %s;", (chat_id,))
            cur.execute("DELETE FROM chats WHERE chat_id = %s;", (chat_id,))
            conn.commit()
        return {"status": "deleted"}
    except Exception as e:
        conn.rollback()
        return {"error": str(e)}
