import { useEffect, useRef, useState, type FormEvent } from "react";
import clsx from "clsx";
import { sendChat, type ChatMessage } from "@/lib/api";
import type { BoardData } from "@/lib/kanban";
import { CloseIcon, SendIcon } from "@/components/icons";

type ChatSidebarProps = {
  isOpen: boolean;
  onClose: () => void;
  onBoardUpdate: (board: BoardData) => void;
};

export const ChatSidebar = ({ isOpen, onClose, onBoardUpdate }: ChatSidebarProps) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: "end" });
  }, [messages, isLoading]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const message = input.trim();
    if (!message || isLoading) {
      return;
    }
    const history = messages;
    setMessages([...history, { role: "user", content: message }]);
    setInput("");
    setError("");
    setIsLoading(true);
    try {
      const response = await sendChat(message, history);
      setMessages((prev) => [...prev, { role: "assistant", content: response.reply }]);
      if (response.board) {
        onBoardUpdate(response.board);
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <aside
      aria-label="AI chat"
      className="fixed inset-y-0 right-0 z-20 flex w-full flex-col border-l border-[var(--stroke)] bg-white shadow-[var(--shadow)] sm:w-[380px]"
    >
      <div className="flex items-center justify-between border-b border-[var(--stroke)] px-5 py-4">
        <div>
          <div className="h-1.5 w-8 rounded-full bg-[var(--accent-yellow)]" />
          <h2 className="mt-2 font-display text-lg font-semibold text-[var(--navy-dark)]">
            AI Assistant
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          title="Close"
          className="rounded-lg p-2 text-[var(--gray-text)] transition hover:bg-[var(--surface)] hover:text-[var(--navy-dark)]"
        >
          <CloseIcon />
        </button>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4" data-testid="chat-messages">
        {messages.length === 0 && (
          <p className="text-sm leading-6 text-[var(--gray-text)]">
            Ask me to add, edit or move cards, for example: &quot;Move Design card layout to
            Review&quot;.
          </p>
        )}
        {messages.map((message, index) => (
          <div
            key={index}
            className={clsx(
              "max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2 text-sm leading-6",
              message.role === "user"
                ? "ml-auto bg-[var(--primary-blue)] text-white"
                : "bg-[var(--surface)] text-[var(--navy-dark)]"
            )}
          >
            {message.content}
          </div>
        ))}
        {isLoading && (
          <p className="text-sm text-[var(--gray-text)]" role="status">
            Thinking...
          </p>
        )}
        {error && <p className="text-sm font-semibold text-red-600">{error}</p>}
        <div ref={endRef} />
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2 border-t border-[var(--stroke)] px-5 py-4">
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Message the AI"
          aria-label="Chat message"
          className="min-w-0 flex-1 rounded-full border border-[var(--stroke)] bg-white px-4 py-2 text-sm text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
        />
        <button
          type="submit"
          disabled={isLoading || !input.trim()}
          aria-label="Send"
          title="Send"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--secondary-purple)] text-white transition hover:brightness-110 disabled:opacity-50"
        >
          <SendIcon />
        </button>
      </form>
    </aside>
  );
};
