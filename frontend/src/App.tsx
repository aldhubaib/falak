import { Component, lazy, Suspense, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { UploadIndicator } from "@/components/UploadIndicator";
import { GalleryUploadIndicator } from "@/components/GalleryUploadIndicator";
import { PageError } from "@/components/PageError";
import { AppLayout } from "@/components/AppLayout";
import { ChannelLayout } from "@/components/ChannelLayout";

const Login = lazy(() => import("./pages/Login"));
const ProfilePicker = lazy(() => import("./pages/ProfilePicker"));
const OurChannels = lazy(() => import("./pages/OurChannels"));
const Competitions = lazy(() => import("./pages/Competitions"));
const ChannelDetail = lazy(() => import("./pages/ChannelDetail"));
const VideoDetail = lazy(() => import("./pages/VideoDetail"));
const Pipeline = lazy(() => import("./pages/Pipeline"));
const Analytics = lazy(() => import("./pages/Analytics"));
const Admin = lazy(() => import("./pages/Admin"));
const Settings = lazy(() => import("./pages/Settings"));
const Stories = lazy(() => import("./pages/Stories"));
const StoryDetail = lazy(() => import("./pages/StoryDetail"));
const PublishQueue = lazy(() => import("./pages/PublishQueue"));
const ArticlePipeline = lazy(() => import("./pages/ArticlePipeline"));
const ArticleDetail = lazy(() => import("./pages/ArticleDetail"));
const ProfileHome = lazy(() => import("./pages/ProfileHome"));
const Gallery = lazy(() => import("./pages/Gallery"));
const AlbumDetail = lazy(() => import("./pages/AlbumDetail"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

class AppErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; error: Error | null; componentStack: string | null }
> {
  state = { hasError: false, error: null as Error | null, componentStack: null as string | null };
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, info: { componentStack?: string }) {
    this.setState({ componentStack: info.componentStack ?? null });
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
            componentStack={this.state.componentStack ?? undefined}
            onRetry={() => this.setState({ hasError: false, error: null, componentStack: null })}
            showHome
          />
        </div>
      );
    }
    return this.props.children;
  }
}

function PageFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
    </div>
  );
}

const App = () => (
  <AppErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <BrowserRouter>
          <Toaster position="top-center" richColors closeButton />
          <UploadIndicator />
          <GalleryUploadIndicator />
          <Suspense fallback={<PageFallback />}>
          <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<ProfilePicker />} />
          <Route path="/c/:channelId" element={<ChannelLayout />}>
            <Route element={<AppLayout />}>
              <Route index element={<ProfileHome />} />
              <Route path="competitors" element={<Competitions />} />
              <Route path="channel/:id" element={<ChannelDetail />} />
              <Route path="video/:id" element={<VideoDetail />} />
              <Route path="pipeline" element={<Pipeline />} />
              <Route path="analytics" element={<Analytics />} />
              <Route path="admin" element={<Admin />} />
              <Route path="stories" element={<Stories />} />
              <Route path="story/:id" element={<StoryDetail />} />
              <Route path="publish" element={<PublishQueue />} />
              <Route path="article-pipeline" element={<ArticlePipeline />} />
              <Route path="article/:id" element={<ArticleDetail />} />
              <Route path="gallery" element={<Gallery />} />
              <Route path="gallery/album/:albumId" element={<AlbumDetail />} />
              <Route path="settings" element={<Settings />} />
            </Route>
          </Route>
          <Route path="*" element={<NotFound />} />
          </Routes>
          </Suspense>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </AppErrorBoundary>
);

export default App;
