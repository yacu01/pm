import type { BoardData } from "@/lib/kanban";

export const getMe = async (): Promise<string | null> => {
  const response = await fetch("/api/me");
  if (!response.ok) {
    return null;
  }
  return (await response.json()).username;
};

export const login = async (username: string, password: string): Promise<boolean> => {
  const response = await fetch("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  return response.ok;
};

export const logout = async () => {
  await fetch("/api/logout", { method: "POST" });
};

export type ChatMessage = { role: "user" | "assistant"; content: string };

export type ChatResponse = { reply: string; board: BoardData | null };

export const sendChat = async (
  message: string,
  history: ChatMessage[]
): Promise<ChatResponse> => {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, history }),
  });
  if (!response.ok) {
    throw new Error(`Chat failed: ${response.status}`);
  }
  return response.json();
};
