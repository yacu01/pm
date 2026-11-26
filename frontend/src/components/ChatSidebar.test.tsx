import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KanbanBoard } from "@/components/KanbanBoard";
import { initialData } from "@/lib/kanban";

const reply = (body: object, ok = true) => ({ ok, json: async () => body });

const send = async (text: string) => {
  if (!screen.queryByRole("complementary", { name: "AI chat" })) {
    await userEvent.click(screen.getByRole("button", { name: /open ai chat/i }));
  }
  const chat = screen.getByRole("complementary", { name: "AI chat" });
  await userEvent.type(within(chat).getByLabelText("Chat message"), text);
  await userEvent.click(within(chat).getByRole("button", { name: /send/i }));
  return chat;
};

describe("ChatSidebar", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("shows the user message and the AI reply", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply({ reply: "Hi there", board: null })));
    render(<KanbanBoard onLogout={() => {}} />);
    const chat = await send("Hello");

    expect(within(chat).getByText("Hello")).toBeInTheDocument();
    expect(await within(chat).findByText("Hi there")).toBeInTheDocument();
  });

  it("sends the previous messages as history", async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply({ reply: "First reply", board: null }));
    vi.stubGlobal("fetch", fetchMock);
    render(<KanbanBoard onLogout={() => {}} />);
    const chat = await send("First");
    await within(chat).findByText("First reply");
    await send("Second");

    const body = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(body).toEqual({
      message: "Second",
      history: [
        { role: "user", content: "First" },
        { role: "assistant", content: "First reply" },
      ],
    });
  });

  it("updates the board when the response includes one", async () => {
    const board = structuredClone(initialData);
    board.cards["card-ai"] = { id: "card-ai", title: "Card from AI", details: "" };
    board.columns[0].cardIds.push("card-ai");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply({ reply: "Added it", board })));
    render(<KanbanBoard onLogout={() => {}} />);
    await send("Add a card");

    const firstColumn = screen.getAllByTestId(/column-/i)[0];
    expect(await within(firstColumn).findByText("Card from AI")).toBeInTheDocument();
  });

  it("shows an error when the request fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply({}, false)));
    render(<KanbanBoard onLogout={() => {}} />);
    const chat = await send("Hello");

    expect(await within(chat).findByText(/something went wrong/i)).toBeInTheDocument();
  });

  it("starts closed, opens and closes", async () => {
    render(<KanbanBoard onLogout={() => {}} />);
    expect(screen.queryByRole("complementary", { name: "AI chat" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /open ai chat/i }));
    expect(screen.getByRole("complementary", { name: "AI chat" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("complementary", { name: "AI chat" })).not.toBeInTheDocument();
  });
});
