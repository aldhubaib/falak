import { Component, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/AppLayout";
import { ProjectLayout, ProjectRootRedirect } from "@/components/ProjectLayout";
import Login from "./pages/Login";
import Channels from "./pages/Channels";
import ChannelDetail from "./pages/ChannelDetail";
import VideoDetail from "./pages/VideoDetail";
import Pipeline from "./pages/Pipeline";
import Monitor from "./pages/Monitor";
import Analytics from "./pages/Analytics";
import Admin from "./pages/Admin";
import Settings from "./pages/Settings";
import Stories from "./pages/Stories";
import Brain from "./pages/Brain";
import BrainV2 from "./pages/BrainV2";
import StoryDetail from "./pages/StoryDetail";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

class AppErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError = () => ({ hasError: true });
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "system-ui", background: "#0d0d0d", color: "#a0a0a0", textAlign: "center" }}>
          <div>
            <h1 style={{ fontSize: 18, marginBottom: 8 }}>Something went wrong</h1>
            <p style={{ fontSize: 13, marginBottom: 16 }}>Try refreshing the page. If it keeps happening, check the browser console and your deployment (e.g. Railway build logs).</p>
            <a href="/" style={{ color: "#7c9eff", fontSize: 13 }}>Go to home</a>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const App = () => (
  <AppErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <BrowserRouter>
          <Toaster position="top-center" richColors closeButton />
          <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<ProjectRootRedirect />} />
          <Route path="/p/:projectId" element={<ProjectLayout />}>
            <Route element={<AppLayout />}>
              <Route index element={<Channels />} />
              <Route path="channel/:id" element={<ChannelDetail />} />
              <Route path="video/:id" element={<VideoDetail />} />
              <Route path="pipeline" element={<Pipeline />} />
              <Route path="monitor" element={<Monitor />} />
              <Route path="analytics" element={<Analytics />} />
              <Route path="admin" element={<Admin />} />
              <Route path="stories" element={<Stories />} />
              <Route path="brain" element={<Brain />} />
              <Route path="brain-v2" element={<BrainV2 />} />
              <Route path="story/:id" element={<StoryDetail />} />
              <Route path="settings" element={<Settings />} />
            </Route>
          </Route>
          <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </AppErrorBoundary>
);

export default App;
