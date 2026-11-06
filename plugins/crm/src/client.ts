import { defineClientPlugin, type PluginManifest } from '@webs/plugin-sdk';
import manifestJson from '../plugin.json';

const manifest = manifestJson as unknown as PluginManifest;

interface Contact {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  title: string | null;
}

interface PipelineStage {
  stage: string;
  count: number;
  total: number;
}

const STAGE_LABELS: Record<string, string> = {
  prospecting: 'Prospección',
  qualified: 'Calificado',
  proposal: 'Propuesta',
  negotiation: 'Negociación',
  won: 'Ganado',
  lost: 'Perdido',
};

const LABELS = {
  es: {
    search: 'Buscar contacto…',
    name: 'Nombre',
    add: 'Agregar',
    pipeline: 'Pipeline',
    empty: 'Todavía no hay contactos.',
    loadError: 'No se pudieron cargar los contactos.',
    saveError: 'No se pudo guardar el contacto.',
  },
  en: {
    search: 'Search contact…',
    name: 'Name',
    add: 'Add',
    pipeline: 'Pipeline',
    empty: 'No contacts yet.',
    loadError: 'Could not load contacts.',
    saveError: 'Could not save the contact.',
  },
};

/** Construye un nodo con texto escapado (nunca innerHTML con datos de la API). */
function el<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  return node;
}

export default defineClientPlugin(manifest, ({ container, api, locale }) => {
  const t = locale?.startsWith('en') ? LABELS.en : LABELS.es;

  const root = el('div');
  root.className = 'stack';
  root.style.gap = 'var(--ws-space-3)';

  const search = el('input');
  search.className = 'input';
  search.placeholder = t.search;

  const name = el('input');
  name.className = 'input';
  name.placeholder = t.name;

  const addButton = el('button', t.add);
  addButton.className = 'btn';

  const toolbar = el('div');
  toolbar.className = 'row';
  toolbar.style.gap = 'var(--ws-space-2)';
  toolbar.append(search, name, addButton);

  const contacts = el('div');
  contacts.className = 'stack';

  const pipelineTitle = el('h4', t.pipeline);
  const pipeline = el('div');
  pipeline.className = 'stack';

  root.append(toolbar, contacts, pipelineTitle, pipeline);
  container.appendChild(root);

  const refresh = async (): Promise<void> => {
    try {
      const query = search.value.trim();
      const [list, board] = await Promise.all([
        api.get<Contact[]>(`/api/v1/plugins/crm/contacts${query ? `?search=${encodeURIComponent(query)}` : ''}`),
        api.get<{ stages: PipelineStage[] }>('/api/v1/plugins/crm/pipeline'),
      ]);

      contacts.replaceChildren(
        ...(list.length
          ? list.map((contact) => {
              const line = el('p');
              line.append(el('strong', contact.name));
              if (contact.email) line.append(el('span', ` · ${contact.email}`));
              if (contact.title) line.append(el('span', ` · ${contact.title}`));
              return line;
            })
          : [el('p', t.empty)]),
      );

      pipeline.replaceChildren(
        ...board.stages.map((stage) => {
          const line = el('p');
          line.append(el('strong', STAGE_LABELS[stage.stage] ?? stage.stage));
          line.append(el('span', `: ${stage.count} · $${(stage.total / 100).toFixed(2)}`));
          return line;
        }),
      );
    } catch {
      contacts.replaceChildren(el('p', t.loadError));
    }
  };

  addButton.addEventListener('click', async () => {
    const value = name.value.trim();
    if (!value) return;
    try {
      await api.post('/api/v1/plugins/crm/contacts', { name: value });
      name.value = '';
      await refresh();
    } catch {
      contacts.replaceChildren(el('p', t.saveError));
    }
  });
  search.addEventListener('input', () => {
    void refresh();
  });

  void refresh();

  return () => root.remove();
});
