import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KanbanBoard } from "@/components/KanbanBoard";

const getFirstColumn = () => screen.getAllByTestId(/column-/i)[0];

describe("KanbanBoard", () => {
  it("renders five columns", () => {
    render(<KanbanBoard onLogout={() => {}} />);
    expect(screen.getAllByTestId(/column-/i)).toHaveLength(5);
  });

  it("renames a column", async () => {
    render(<KanbanBoard onLogout={() => {}} />);
    const column = getFirstColumn();
    const input = within(column).getByLabelText("Column title");
    await userEvent.clear(input);
    await userEvent.type(input, "New Name");
    expect(input).toHaveValue("New Name");
  });

  it("adds and removes a card", async () => {
    render(<KanbanBoard onLogout={() => {}} />);
    const column = getFirstColumn();
    const addButton = within(column).getByRole("button", {
      name: /add a card/i,
    });
    await userEvent.click(addButton);

    const titleInput = within(column).getByPlaceholderText(/card title/i);
    await userEvent.type(titleInput, "New card");
    const detailsInput = within(column).getByPlaceholderText(/details/i);
    await userEvent.type(detailsInput, "Notes");

    await userEvent.click(within(column).getByRole("button", { name: /add card/i }));

    expect(within(column).getByText("New card")).toBeInTheDocument();

    const deleteButton = within(column).getByRole("button", {
      name: /delete new card/i,
    });
    await userEvent.click(deleteButton);

    expect(within(column).queryByText("New card")).not.toBeInTheDocument();
  });

  it("edits a card", async () => {
    render(<KanbanBoard onLogout={() => {}} />);
    const column = getFirstColumn();
    const card = within(column).getAllByTestId(/card-/i)[0];
    await userEvent.click(within(card).getByRole("button", { name: /^edit /i }));

    const title = within(card).getByLabelText("Edit title");
    await userEvent.clear(title);
    await userEvent.type(title, "Edited title");
    const details = within(card).getByLabelText("Edit details");
    await userEvent.clear(details);
    await userEvent.type(details, "Edited details");
    await userEvent.click(within(card).getByRole("button", { name: /save/i }));

    expect(within(column).getByText("Edited title")).toBeInTheDocument();
    expect(within(column).getByText("Edited details")).toBeInTheDocument();
  });

  it("cancels editing without changes", async () => {
    render(<KanbanBoard onLogout={() => {}} />);
    const card = within(getFirstColumn()).getAllByTestId(/card-/i)[0];
    const original = within(card).getByRole("heading").textContent;
    await userEvent.click(within(card).getByRole("button", { name: /^edit /i }));

    const title = within(card).getByLabelText("Edit title");
    await userEvent.clear(title);
    await userEvent.type(title, "Discarded");
    await userEvent.click(within(card).getByRole("button", { name: /cancel/i }));

    expect(within(card).getByRole("heading")).toHaveTextContent(original!);
    expect(screen.queryByText("Discarded")).not.toBeInTheDocument();
  });
});
