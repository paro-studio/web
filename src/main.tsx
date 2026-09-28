import '@/services/supabase/client';
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { listenForStaleDeploys } from "@/lib/staleDeploy";
import "./index.css";

listenForStaleDeploys();

createRoot(document.getElementById("root")!).render(<App />);
