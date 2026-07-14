import { useCallback, useEffect, useState } from 'react';
import * as api from '../api/client';
import type { Bookmark } from '../api/client';

// Bookmarks panel (ARCHITECTURE.md §5). Lists saved views, saves the current
// view, loads a bookmark's params back into SchemaForm, and deletes bookmarks.

export interface BookmarksPanelProps {
  currentFunctionId: string;
  currentParams: Record<string, unknown>;
  onLoad: (bookmark: Bookmark) => void;
}

export function BookmarksPanel({ currentFunctionId, currentParams, onLoad }: BookmarksPanelProps) {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    api
      .listBookmarks()
      .then(setBookmarks)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const save = async () => {
    setError(null);
    try {
      await api.createBookmark({
        functionId: currentFunctionId,
        title: title.trim() || currentFunctionId,
        params: currentParams,
      });
      setTitle('');
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const remove = async (id: string) => {
    setError(null);
    try {
      await api.deleteBookmark(id);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <section className="bookmarks">
      <h2>Bookmarks</h2>
      <div className="bookmark-save">
        <input
          type="text"
          placeholder="View title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          aria-label="Bookmark title"
        />
        <button type="button" onClick={save}>
          Save view
        </button>
      </div>
      {error && <p className="sf-error" role="alert">{error}</p>}
      <ul className="bookmark-list">
        {bookmarks.map((b) => (
          <li key={b.id}>
            <button type="button" className="bookmark-load" onClick={() => onLoad(b)}>
              <span className="bookmark-title">{b.title}</span>
              <span className="bookmark-fn">{b.functionId}</span>
            </button>
            <button
              type="button"
              className="bookmark-del"
              aria-label={`Delete ${b.title}`}
              onClick={() => remove(b.id)}
            >
              ×
            </button>
          </li>
        ))}
        {bookmarks.length === 0 && <li className="sf-empty">No saved views</li>}
      </ul>
    </section>
  );
}
