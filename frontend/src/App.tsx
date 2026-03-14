import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/AppLayout";
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
import StoryDetail from "./pages/StoryDetail";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<AppLayout />}>
            <Route path="/" element={<Channels />} />
            <Route path="/channel/:id" element={<ChannelDetail />} />
            <Route path="/video/:id" element={<VideoDetail />} />
            <Route path="/pipeline" element={<Pipeline />} />
            <Route path="/monitor" element={<Monitor />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/stories" element={<Stories />} />
            <Route path="/brain" element={<Brain />} />
            <Route path="/story/:id" element={<StoryDetail />} />
            <Route path="/settings" element={<Settings />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
