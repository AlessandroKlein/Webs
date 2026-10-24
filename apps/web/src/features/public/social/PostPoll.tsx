import { useMutation } from '@tanstack/react-query';
import { api } from '../../../lib/api';
import type { SocialPoll } from './types';

const SOCIAL_BASE = '/api/v1/plugins/social';

/**
 * Encuesta interactiva en el feed: muestra las opciones con porcentaje en vivo
 * y marca la opción ya votada por el usuario. Al votar hace POST
 * `/posts/:id/vote` y notifica para refrescar los resultados.
 */
export function PostPoll({
  poll,
  postId,
  myId,
  onVoted,
}: {
  poll: SocialPoll;
  postId: string;
  myId: string | null;
  onVoted: () => void;
}) {
  const vote = useMutation({
    mutationFn: (optionId: string) => api.post(`${SOCIAL_BASE}/posts/${postId}/vote`, { optionId }),
    onSuccess: onVoted,
  });

  const options = poll.options ?? [];
  const votes = poll.votes ?? [];
  const total = votes.length;
  const myVote = myId ? votes.find((v) => v.userId === myId) : undefined;
  const closed = poll.endsAt ? new Date(poll.endsAt).getTime() < Date.now() : false;

  if (options.length === 0) return null;

  return (
    <div className="stack" style={{ gap: 'var(--ws-space-2)' }}>
      <strong style={{ fontSize: 'var(--ws-font-size-sm)' }}>📊 {poll.question}</strong>

      {options.map((option) => {
        const count = votes.filter((v) => v.optionId === option.id).length;
        const pct = total > 0 ? Math.round((count / total) * 100) : 0;
        const selected = myVote?.optionId === option.id;
        const canVote = !!myId && !myVote && !closed && !vote.isPending;

        return (
          <div key={option.id} style={{ position: 'relative' }}>
            <button
              type="button"
              disabled={!canVote}
              onClick={() => canVote && vote.mutate(option.id)}
              style={{
                position: 'relative',
                zIndex: 1,
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: 'var(--ws-space-2) var(--ws-space-3)',
                border: selected ? '1px solid var(--ws-primary)' : '1px solid var(--ws-border)',
                borderRadius: 'var(--ws-radius-md)',
                background: 'transparent',
                cursor: canVote ? 'pointer' : 'default',
                overflow: 'hidden',
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  inset: 0,
                  zIndex: -1,
                  width: `${pct}%`,
                  background: selected ? 'var(--ws-primary-soft)' : 'var(--ws-surface-2)',
                }}
              />
              <span className="row" style={{ justifyContent: 'space-between', gap: 'var(--ws-space-2)' }}>
                <span style={{ fontWeight: selected ? 600 : 400 }}>{option.label}</span>
                <span style={{ color: 'var(--ws-text-muted)', fontSize: 'var(--ws-font-size-sm)' }}>
                  {total > 0 ? `${pct}%` : ''}
                </span>
              </span>
              {selected && (
                <span style={{ fontSize: 'var(--ws-font-size-xs)', color: 'var(--ws-primary)' }}>
                  ✓ Tu voto
                </span>
              )}
            </button>
          </div>
        );
      })}

      <span style={{ color: 'var(--ws-text-muted)', fontSize: 'var(--ws-font-size-sm)' }}>
        {total === 0
          ? 'Sin votos todavía.'
          : `${total} ${total === 1 ? 'voto' : 'votos'}${closed ? ' · cerrada' : ''}`}
      </span>

      {vote.error && (
        <span style={{ color: 'var(--ws-danger)', fontSize: 'var(--ws-font-size-sm)' }}>
          No se pudo votar.
        </span>
      )}
    </div>
  );
}
