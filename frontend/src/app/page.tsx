"use client";

import { useEffect, useState } from "react";
import { KanbanBoard } from "@/components/KanbanBoard";
import { LoginForm } from "@/components/LoginForm";
import { getMe, logout } from "@/lib/api";

type AuthState = "loading" | "signed-out" | "signed-in";

export default function Home() {
  const [auth, setAuth] = useState<AuthState>("loading");

  useEffect(() => {
    getMe().then((user) => setAuth(user ? "signed-in" : "signed-out"));
  }, []);

  const handleLogout = async () => {
    await logout();
    setAuth("signed-out");
  };

  if (auth === "loading") {
    return null;
  }
  if (auth === "signed-out") {
    return <LoginForm onLogin={() => setAuth("signed-in")} />;
  }
  return <KanbanBoard onLogout={handleLogout} />;
}
