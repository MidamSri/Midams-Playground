// app/chat/page.tsx

import { redirect } from "next/navigation"

export default async function ChatRedirectPage() {
  const res = await fetch("http://localhost:8000/new_chat", {
    method: "POST",
    cache: "no-store", // prevent caching of this fetch
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ user_name: "Midam" }), // 🔥 this line was missing
  });

  if (!res.ok) {
    throw new Error("Failed to create a new chat session.");
  }

  const data = await res.json();
  const chat_id = data.chat_id;

  redirect(`/chat/${chat_id}`);
}
