"use client"

import { useState, useEffect, useRef } from "react"
import { useParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Menu, LogIn, ArrowUp, ClipboardCopy } from "lucide-react"
import clsx from "clsx"
import ReactMarkdown from "react-markdown"
import rehypeRaw from "rehype-raw"

function BotMessage({ message }: { message: string }) {
  const handleCopy = () => {
    navigator.clipboard.writeText(message)
    alert("Copied to clipboard")
  }

  return (
    <div className="relative group">
      <ReactMarkdown rehypePlugins={[rehypeRaw]}>
        {message}
      </ReactMarkdown>
      <button
        onClick={handleCopy}
        className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 text-xs text-gray-400 hover:text-white"
      >
        <ClipboardCopy size={14} />
      </button>
    </div>
  )
}

interface Message {
  id: string
  type: "user" | "assistant"
  content: string
  timestamp: Date
}

interface ChatSession {
  id: string
  name: string
  messages: Message[]
  createdAt: Date
}

const models = [
  { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash" },
  { id: "gpt‑4", name: "GPT‑4" },
  { id: "claude‑3", name: "Claude 3" },
]

const USER_ID = "FrontendUser"

export default function ChatPage() {
  const router = useRouter()
  const { chat_id } = useParams()
  const isLanding = !chat_id || chat_id === "undefined"

  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [currentSession, setCurrentSession] = useState<ChatSession | null>(null)
  const [selectedModel, setSelectedModel] = useState(models[0])
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [showConfirm, setShowConfirm] = useState(false)
  const [chatToDelete, setChatToDelete] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const createNewChat = async () => {
    const res = await fetch("http://localhost:8000/new_chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: USER_ID }),
    })
    return await res.json()
  }

  useEffect(() => {
    let isMounted = true
    const fetchChats = async () => {
      try {
        const res = await fetch(`http://localhost:8000/user_chats/${USER_ID}`)
        const data = await res.json()
        if (!Array.isArray(data)) return
        const sessions = data.map((c: any) => ({
          id: c.id,
          name: c.name,
          createdAt: new Date(c.createdAt),
          messages: [],
        }))
        if (isMounted) setSessions(sessions)
      } catch {
        alert("Failed to fetch chats")
      }
    }
    fetchChats()
    return () => { isMounted = false }
  }, [])

  useEffect(() => {
    if (!chat_id || chat_id === "undefined") return
    let isMounted = true
    const loadChat = async () => {
      try {
        const res = await fetch(`http://localhost:8000/chat_history/${chat_id}`)
        const data = await res.json()
        if (data.error) return
        const session: ChatSession = {
          id: chat_id as string,
          name: data.chat_name,
          createdAt: new Date(),
          messages: data.messages.map((msg: any) => ({
            id: crypto.randomUUID(),
            type: msg.sender === "user" ? "user" : "assistant",
            content: msg.message,
            timestamp: new Date(msg.timestamp),
          })),
        }
        if (isMounted) setCurrentSession(session)
      } catch {
        alert("Failed to load chat history")
      }
    }
    loadChat()
    return () => { isMounted = false }
  }, [chat_id])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [currentSession?.messages])

  const sendMessage = async () => {
    const textToSend = input.trim()
    if (!textToSend) return

    setInput("")
    setIsLoading(true)

    try {
      let newChatId = chat_id
      if (isLanding) {
        const data = await createNewChat()
        newChatId = data.chat_id
        router.push(`/chat/${newChatId}`)
      }

      const userMessage: Message = {
        id: crypto.randomUUID(),
        type: "user",
        content: textToSend,
        timestamp: new Date(),
      }

      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        type: "assistant",
        content: "",
        timestamp: new Date(),
      }

      setCurrentSession((prev) =>
        prev ? { ...prev, messages: [...prev.messages, userMessage, assistantMessage] } : null
      )

      const res = await fetch("http://localhost:8000/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: newChatId,
          text: textToSend,
          model: selectedModel.id,
        }),
      })

      if (!res.body) throw new Error("No response body from stream")

      const reader = res.body.getReader()
      const decoder = new TextDecoder("utf-8")
      let botReply = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value)
        botReply += chunk

        setCurrentSession((prev) => {
          if (!prev) return null
          const updatedMessages = [...prev.messages]
          const lastIndex = updatedMessages.length - 1
          if (updatedMessages[lastIndex].type === "assistant") {
            updatedMessages[lastIndex].content = botReply
          }
          return { ...prev, messages: updatedMessages }
        })
      }
    } catch {
      alert("Failed to send message")
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const handleDeleteChat = async () => {
    if (!chatToDelete) return
    try {
      await fetch(`http://localhost:8000/delete_chat/${chatToDelete}`, {
        method: "DELETE",
      })
      setSessions((prev) => prev.filter((c) => c.id !== chatToDelete))
      if (currentSession?.id === chatToDelete) {
        router.push("/chat/undefined")
        setCurrentSession(null)
      }
      setShowConfirm(false)
      setChatToDelete(null)
    } catch {
      alert("Failed to delete chat")
    }
  }

  return (
    <div className="flex h-screen overflow-hidden text-white bg-[#0f0f0f] relative">
      {/* Sidebar */}
      <div className={clsx(
        "transition-all duration-300 bg-[#171717] border-r border-gray-800 flex flex-col shrink-0 z-10",
        sidebarOpen ? "w-64" : "w-0"
      )}>
        <div className="p-4 border-b border-gray-800 flex items-center justify-between">
          <h1 className="text-lg font-semibold">Midam's Playground</h1>
          <Button variant="ghost" size="sm" onClick={() => setSidebarOpen(false)} className="text-gray-400 hover:text-white">
            <Menu className="h-4 w-4" />
          </Button>
        </div>
        <ScrollArea className="flex-1 px-2 pt-2">
          <Button
            onClick={async () => {
              const data = await createNewChat()
              router.push(`/chat/${data.chat_id}`)
            }}
            className="w-full mb-4 bg-white text-black hover:bg-gray-200"
          >
            + New Chat
          </Button>
          {sessions.map((session) => (
            <div
              key={session.id}
              className={clsx(
                "group flex items-center justify-between px-3 py-2 mx-2 mb-1 rounded-lg cursor-pointer relative",
                session.id === currentSession?.id ? "bg-[#2A2A2A]" : "hover:bg-[#1F1F1F]"
              )}
              onClick={() => router.push(`/chat/${session.id}`)}
            >
              <p className="text-sm truncate max-w-[140px]">{session.name}</p>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setChatToDelete(session.id)
                  setShowConfirm(true)
                }}
                className="text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 absolute right-2"
              >
                ×
              </button>
            </div>
          ))}
        </ScrollArea>
        <div className="p-4 border-t border-gray-800">
          <Button variant="ghost" className="w-full justify-start text-gray-400 hover:text-white">
            <LogIn className="h-4 w-4 mr-2" /> Login
          </Button>
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col overflow-hidden transition-all duration-300 z-0">
        <div className="p-4 border-b border-gray-800 flex items-center justify-between">
          {!sidebarOpen && (
            <Button variant="ghost" size="sm" onClick={() => setSidebarOpen(true)} className="text-gray-400 hover:text-white">
              <Menu className="h-4 w-4" />
            </Button>
          )}
          <select
            value={selectedModel.id}
            onChange={(e) => {
              const model = models.find((m) => m.id === e.target.value)
              if (model) setSelectedModel(model)
            }}
            className="bg-[#1F1F1F] text-white text-sm px-2 py-1 rounded border border-gray-600 focus:outline-none"
          >
            {models.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </div>

        <div className="flex-1 flex flex-col overflow-y-auto p-4 space-y-4">
          {isLanding && (
            <div className="flex flex-col justify-center items-center h-full text-gray-500">
              <p className="text-2xl font-bold mb-2">How can I help you today?</p>
              <p className="text-sm">Start typing below to begin a new conversation.</p>
            </div>
          )}
          {currentSession?.messages.map((msg) => (
            <div
              key={msg.id}
              className={clsx("transition-all duration-300", msg.type === "user" ? "ml-auto" : "mr-auto", "max-w-[80%]")}
            >
              <div className={`p-4 rounded-lg whitespace-pre-wrap ${msg.type === "user" ? "bg-[#2A2A2A]" : "bg-[#1F1F1F]"}`}>
                {msg.type === "assistant" ? <BotMessage message={msg.content} /> : <p>{msg.content}</p>}
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="mb-6 mr-auto max-w-[80%] animate-pulse">
              <div className="p-4 rounded-lg bg-[#1F1F1F] flex space-x-1">
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-75" />
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-150" />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="p-4 border-t border-gray-800">
          <div className="relative">
            <Input
              value={input}
              disabled={isLoading}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Type your message here..."
              className="w-full pr-16 pl-4 py-3 bg-[#2A2A2A] border-gray-700 text-white rounded-xl"
            />
            <div className="absolute right-4 top-1/2 transform -translate-y-1/2">
              <Button
                onClick={sendMessage}
                disabled={!input.trim() || isLoading}
                size="sm"
                className="bg-white text-black hover:bg-gray-200 rounded-lg"
              >
                <ArrowUp className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Delete Confirmation */}
      {showConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-[#1f1f1f] p-6 rounded-md w-96 text-white border border-gray-700 shadow-lg">
            <h2 className="text-lg font-bold mb-4">Delete Chat</h2>
            <p className="mb-4">Are you sure you want to delete this chat? This action cannot be undone.</p>
            <div className="flex justify-end space-x-2">
              <button className="px-4 py-2 bg-gray-700 rounded" onClick={() => setShowConfirm(false)}>Cancel</button>
              <button className="px-4 py-2 bg-red-600 rounded" onClick={handleDeleteChat}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
