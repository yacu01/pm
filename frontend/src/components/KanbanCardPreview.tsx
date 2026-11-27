import type { Card } from "@/lib/kanban";

type KanbanCardPreviewProps = {
  card: Card;
};

export const KanbanCardPreview = ({ card }: KanbanCardPreviewProps) => (
  <article className="h-full rotate-2 cursor-grabbing rounded-2xl border border-[var(--primary-blue)]/40 bg-white px-3 py-3 shadow-[0_18px_32px_rgba(3,33,71,0.16)]">
    <h4 className="break-words font-display text-sm font-semibold text-[var(--navy-dark)]">
      {card.title}
    </h4>
    {card.details && (
      <p className="mt-1 break-words text-xs leading-5 text-[var(--gray-text)]">
        {card.details}
      </p>
    )}
  </article>
);
