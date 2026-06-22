import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { useUserSearch } from "./useFriends";
import { UserSearchRow } from "./FriendActions";

/** Debounced username search wired to GET /api/users/search. */
export function FriendSearch({ onClose }: { onClose?: () => void }) {
  const [input, setInput] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(input), 300);
    return () => window.clearTimeout(timer);
  }, [input]);

  const { data, isFetching, isError } = useUserSearch(debounced);
  const showResults = debounced.trim().length >= 1;

  return (
    <div>
      <div className="group flex items-center gap-2 rounded-2xl border border-transparent bg-surface-2 px-3 py-2.5 text-text-muted transition-colors focus-within:border-primary/40 focus-within:bg-surface focus-within:shadow-soft">
        <Search className="h-4 w-4 transition-colors group-focus-within:text-primary" />
        <input
          type="search"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Search by @username"
          className="w-full bg-transparent text-sm text-text placeholder:text-text-muted focus:outline-none"
          aria-label="Find friends by username"
          autoFocus
        />
      </div>

      {showResults ? (
        <div className="mt-2 max-h-64 overflow-y-auto rounded-2xl border border-border bg-surface shadow-soft">
          {isFetching ? (
            <p className="px-3 py-3 text-sm text-text-muted">Searching…</p>
          ) : isError ? (
            <p className="px-3 py-3 text-sm text-text-muted">Search failed. Try again.</p>
          ) : data && data.length > 0 ? (
            <ul className="divide-y divide-border/60 py-1">
              {data.map((user) => (
                <li key={user._id}>
                  <UserSearchRow user={user} onChatStarted={onClose} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-3 py-3 text-sm text-text-muted">No users found.</p>
          )}
        </div>
      ) : (
        <p className="mt-2 px-1 text-xs text-text-muted">Search for friends by @username to start a chat.</p>
      )}
    </div>
  );
}
