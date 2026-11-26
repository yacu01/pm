import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LoginForm } from "@/components/LoginForm";

const mockFetch = (ok: boolean) => {
  const fetchMock = vi.fn().mockResolvedValue({ ok, json: async () => ({}) });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

const submit = async (password: string) => {
  await userEvent.type(screen.getByLabelText("Username"), "user");
  await userEvent.type(screen.getByLabelText("Password"), password);
  await userEvent.click(screen.getByRole("button", { name: /sign in/i }));
};

describe("LoginForm", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("renders username and password fields", () => {
    render(<LoginForm onLogin={() => {}} />);
    expect(screen.getByLabelText("Username")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toHaveAttribute("type", "password");
  });

  it("submits credentials and calls onLogin on success", async () => {
    const fetchMock = mockFetch(true);
    const onLogin = vi.fn();
    render(<LoginForm onLogin={onLogin} />);
    await submit("password");

    expect(fetchMock).toHaveBeenCalledWith("/api/login", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ username: "user", password: "password" }),
    }));
    expect(onLogin).toHaveBeenCalled();
  });

  it("shows an error on failure", async () => {
    mockFetch(false);
    const onLogin = vi.fn();
    render(<LoginForm onLogin={onLogin} />);
    await submit("wrong");

    expect(await screen.findByRole("alert")).toHaveTextContent(/invalid/i);
    expect(onLogin).not.toHaveBeenCalled();
  });
});
