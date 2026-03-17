import { Component, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { UploadIndicator } from "@/components/UploadIndicator";
import { PageError } from "@/components/PageError";
import { AppLayout } from "@/components/AppLayout";
import { ProjectLayout, ProjectRootRedirect } from "@/components/ProjectLayout";
import Login from "./pages/Login";
import OurChannels from "./pages/OurChannels";
import Competitions from "./pages/Competitions";
import ChannelDetail from "./pages/ChannelDetail";
import VideoDetail from "./pages/VideoDetail";
import Pipeline from "./pages/Pipeline";
import Monitor from "./pages/Monitor";
import Analytics from "./pages/Analytics";
import Admin from "./pages/Admin";
import Settings from "./pages/Settings";
import Stories from "./pages/Stories";
import BrainV2 from "./pages/BrainV2";
import StoryDetail from "./pages/StoryDetail";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

class AppErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; error: Error | null }
> {
  state = { hasError: false, error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      const err = this.state.error;
      return (
        <div className="min-h-screen flex items-center justify-center bg-surface p-6">
          <PageError
            title="Something went wrong"
            message={err?.message ?? "An unexpected error occurred. Try refreshing the page."}
            detail={err?.stack}
            onRetry={() => this.setState({ hasError: false, error: null })}
            showHome
          />
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
          <UploadIndicator />
          <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<ProjectRootRedirect />} />
          <Route path="/p/:projectId" element={<ProjectLayout />}>
            <Route element={<AppLayout />}>
              <Route index element={<OurChannels />} />
              <Route path="competitions" element={<Competitions />} />
              <Route path="channel/:id" element={<ChannelDetail />} />
              <Route path="video/:id" element={<VideoDetail />} />
              <Route path="pipeline" element={<Pipeline />} />
              <Route path="monitor" element={<Monitor />} />
              <Route path="analytics" element={<Analytics />} />
              <Route path="admin" element={<Admin />} />
              <Route path="stories" element={<Stories />} />
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
