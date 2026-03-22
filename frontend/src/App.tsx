import { Component, lazy, Suspense, type ReactNode, type ComponentType } from "react";
import { Loader2 } from "lucide-react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { UploadIndicator } from "@/components/UploadIndicator";
import { GalleryUploadIndicator } from "@/components/GalleryUploadIndicator";
import { PageError } from "@/components/PageError";
import { AppLayout } from "@/components/AppLayout";
import { ChannelLayout } from "@/components/ChannelLayout";

function lazyRetry<T extends ComponentType<unknown>>(
  factory: () => Promise<{ default: T }>,
): React.LazyExoticComponent<T> {
  return lazy(() =>
    factory().catch((err: unknown) => {
      const alreadyRetried = sessionStorage.getItem("chunk-retry");
      if (!alreadyRetried) {
        sessionStorage.setItem("chunk-retry", "1");
        window.location.reload();
        return new Promise<never>(() => {});
      }
      sessionStorage.removeItem("chunk-retry");
      throw err;
    }),
  );
}

const Login = lazyRetry(() => import("./pages/Login"));
const ProfilePicker = lazyRetry(() => import("./pages/ProfilePicker"));
const Competitions = lazyRetry(() => import("./pages/Competitions"));
const ChannelDetail = lazyRetry(() => import("./pages/ChannelDetail"));
const VideoDetail = lazyRetry(() => import("./pages/VideoDetail"));
const Pipeline = lazyRetry(() => import("./pages/Pipeline"));
const Analytics = lazyRetry(() => import("./pages/Analytics"));
const Admin = lazyRetry(() => import("./pages/Admin"));
const Settings = lazyRetry(() => import("./pages/Settings"));
const Stories = lazyRetry(() => import("./pages/Stories"));
const StoryDetail = lazyRetry(() => import("./pages/StoryDetail"));
const PublishQueue = lazyRetry(() => import("./pages/PublishQueue"));
const ArticlePipeline = lazyRetry(() => import("./pages/ArticlePipeline"));
const ArticlePipelineV2 = lazyRetry(() => import("./pages/ArticlePipelineV2"));
const ArticleDetail = lazyRetry(() => import("./pages/ArticleDetail"));
const ProfileHome = lazyRetry(() => import("./pages/ProfileHome"));
const Gallery = lazyRetry(() => import("./pages/Gallery"));
const AlbumDetail = lazyRetry(() => import("./pages/AlbumDetail"));
const DesignSystem = lazyRetry(() => import("./pages/DesignSystem"));
const NotFound = lazyRetry(() => import("./pages/NotFound"));

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
      const isChunkError =
        err?.message?.includes("Failed to fetch dynamically imported module") ||
        err?.message?.includes("Loading chunk") ||
        err?.message?.includes("Loading CSS chunk");
      return (
        <div className="min-h-screen flex items-center justify-center bg-card p-6">
          <PageError
            title={isChunkError ? "App updated" : "Something went wrong"}
            message={
              isChunkError
                ? "A new version was deployed. Reloading…"
                : (err?.message ?? "An unexpected error occurred. Try refreshing the page.")
            }
            detail={isChunkError ? undefined : err?.stack}
            componentStack={isChunkError ? undefined : (this.state.componentStack ?? undefined)}
            onRetry={() => {
              if (isChunkError) {
                sessionStorage.removeItem("chunk-retry");
                window.location.reload();
              } else {
                this.setState({ hasError: false, error: null, componentStack: null });
              }
            }}
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
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
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
              <Route path="article-pipeline-v2" element={<ArticlePipelineV2 />} />
              <Route path="article/:id" element={<ArticleDetail />} />
              <Route path="gallery" element={<Gallery />} />
              <Route path="gallery/album/:albumId" element={<AlbumDetail />} />
              <Route path="settings" element={<Settings />} />
              <Route path="design-system" element={<DesignSystem />} />
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
