import { Header } from "./Header";
import { Sidebar } from "./Sidebar";
import { ConversationPane } from "./ConversationPane";
import { DetailsPane, MobileDetailsSheet } from "./DetailsPane";
import { Lightbox } from "@/components/ui/Lightbox";
import { useUIStore } from "@/lib/store";
import { cn } from "@/lib/utils";

/**
 * 3-pane desktop shell (chat list · conversation · details). On mobile, list and conversation
 * slide with a CSS transition depending on whether a chat is selected.
 */
export function AppShell() {
  const activeChatId = useUIStore((s) => s.activeChatId);
  const detailsOpen = useUIStore((s) => s.detailsOpen);
  const showConversation = Boolean(activeChatId);

  return (
    <div className="flex h-full flex-col bg-bg text-text">
      {/* On mobile, an open chat goes full-screen (app-like): hide the global Linkr bar so only the
          conversation header shows. Always visible from md up (3-pane desktop layout). Sprint H. */}
      <Header className={cn(showConversation && "hidden md:flex")} />
      <div className="relative flex flex-1 overflow-hidden">
        <div
          className={cn(
            "pane-slide h-full w-full md:relative md:w-auto md:transition-none",
            showConversation ? "-translate-x-full md:translate-x-0" : "translate-x-0",
          )}
        >
          <Sidebar />
        </div>
        <div
          className={cn(
            "pane-slide absolute inset-0 h-full flex-1 md:relative md:flex md:transition-none",
            showConversation ? "translate-x-0" : "translate-x-full md:translate-x-0",
            !showConversation && "pointer-events-none md:pointer-events-auto md:flex",
          )}
        >
          <ConversationPane />
        </div>
        {detailsOpen && <DetailsPane />}
      </div>
      <MobileDetailsSheet />
      <Lightbox />
    </div>
  );
}
