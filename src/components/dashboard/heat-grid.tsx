"use client";

/**
 * ARIA grid keyboard pattern for the heat map: one tab stop, arrow keys move between cell links, Home/End jump within
 * the row. Future months aren't links, so a move skips ahead to the next link in that direction (or stays put).
 * Cells carry data-r / data-c; the server renders tabIndex 0 on one link and -1 on the rest.
 */
export function HeatGrid({ children, ...props }: React.ComponentProps<"div">) {
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const from = (e.target as HTMLElement).closest<HTMLElement>("a[data-r]");
    if (!from) return;
    const r = Number(from.dataset.r);
    const c = Number(from.dataset.c);
    const at = (row: number, col: number) => e.currentTarget.querySelector<HTMLElement>(`a[data-r="${row}"][data-c="${col}"]`);
    const rows = Number(e.currentTarget.dataset.rows);

    const walk = (dr: number, dc: number) => {
      for (let row = r + dr, col = c + dc; row >= 0 && row < rows && col >= 1 && col <= 12; row += dr, col += dc) {
        const hit = at(row, col);
        if (hit) return hit;
      }
      return null;
    };
    const edge = (dir: 1 | -1) => {
      for (let col = dir === 1 ? 12 : 1; col !== c; col -= dir) {
        const hit = at(r, col);
        if (hit) return hit;
      }
      return null;
    };

    const next =
      e.key === "ArrowRight" ? walk(0, 1)
      : e.key === "ArrowLeft" ? walk(0, -1)
      : e.key === "ArrowDown" ? walk(1, 0)
      : e.key === "ArrowUp" ? walk(-1, 0)
      : e.key === "Home" ? edge(-1)
      : e.key === "End" ? edge(1)
      : undefined;
    if (next === undefined) return;
    e.preventDefault();
    if (!next) return;
    from.tabIndex = -1;
    next.tabIndex = 0;
    next.focus();
  };

  return (
    <div {...props} onKeyDown={onKeyDown}>
      {children}
    </div>
  );
}
