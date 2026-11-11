<script lang="ts">
  import { onMount } from 'svelte';

  type Draft = {
    id: string;
    source_url: string;
    notice_number: string | null;
    pollster: string | null;
    sponsor: string | null;
    fieldwork_start: string | null;
    fieldwork_end: string | null;
    sample_size: number | null;
    confidence: number;
    status: string;
    warnings_json: string | null;
    created_at: string;
  };

  const pipelineBase =
    (import.meta.env.PUBLIC_PIPELINE_URL as string | undefined) ??
    (typeof window !== 'undefined' && window.location.hostname === 'localhost'
      ? 'http://127.0.0.1:8787'
      : '');

  let token = '';
  let drafts: Draft[] = [];
  let loading = false;
  let message = '';
  let error = '';
  let hydrated = false;

  onMount(() => {
    token = sessionStorage.getItem('vlf:admin-token') ?? '';
    hydrated = true;
    if (token) load();
  });

  async function load() {
    if (!token) {
      error = 'Renseignez le token admin (ADMIN_TOKEN du pipeline).';
      return;
    }
    sessionStorage.setItem('vlf:admin-token', token);
    loading = true;
    error = '';
    message = '';
    try {
      const response = await fetch(`${pipelineBase}/admin/polls/drafts?status=pending`, {
        headers: { 'x-admin-token': token },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      drafts = payload.data ?? [];
      message = `${drafts.length} brouillon(s) en attente.`;
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
    } finally {
      loading = false;
    }
  }

  async function approve(id: string) {
    loading = true;
    error = '';
    message = '';
    try {
      const response = await fetch(`${pipelineBase}/admin/polls/drafts/${id}/approve`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-admin-token': token },
        body: '{}',
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? `HTTP ${response.status}`);
      const approved = `Sondage approuvé : ${payload.pollId}. Agrégation et score recalculés.`;
      await load();
      message = approved;
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
    } finally {
      loading = false;
    }
  }

  async function reject(id: string) {
    const note = window.prompt('Motif du rejet (facultatif)');
    if (note === null) return;
    loading = true;
    error = '';
    message = '';
    try {
      const response = await fetch(`${pipelineBase}/admin/polls/drafts/${id}/reject`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-admin-token': token },
        body: JSON.stringify({ note }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? `HTTP ${response.status}`);
      await load();
      message = 'Brouillon rejeté.';
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
    } finally {
      loading = false;
    }
  }
</script>

<div class="p-3">
  <div class="flex flex-wrap items-end gap-2">
    <label class="min-w-[240px] flex-1">
      <span class="font-mono text-[9px] uppercase tracking-[0.12em] text-dim">Token admin</span>
      <input
        type="password"
        bind:value={token}
        on:keydown={(event) => event.key === 'Enter' && load()}
        class="mt-1 w-full border border-line bg-panel2 px-2 py-1.5 font-mono text-[11px] text-fg focus:border-cyan/60 focus:outline-none"
        placeholder="ADMIN_TOKEN"
      />
    </label>
    <button
      type="button"
      on:click={load}
      disabled={loading}
      class="border border-cyan/50 bg-cyan/10 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-cyan disabled:opacity-40"
    >{loading ? 'Chargement…' : 'Charger la file'}</button>
  </div>

  {#if message}<p class="mt-2 font-mono text-[10px] text-ok">{message}</p>{/if}
  {#if error}<p class="mt-2 font-mono text-[10px] text-danger">{error}</p>{/if}

  <div class="mt-3 space-y-2">
    {#each drafts as draft (draft.id)}
      <article class="border border-line bg-panel2/40 p-3">
        <div class="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div class="font-mono text-[9px] uppercase tracking-[0.12em] text-dim">
              {draft.pollster ?? 'Institut inconnu'} · notice {draft.notice_number ?? '—'} · confiance {Math.round((draft.confidence ?? 0) * 100)} %
            </div>
            <div class="mt-1 text-sm text-fg">
              {draft.sponsor ?? 'Commanditaire inconnu'} — terrain {draft.fieldwork_start ?? '?'} → {draft.fieldwork_end ?? '?'}
            </div>
            <div class="mt-0.5 font-mono text-[9px] text-dim">
              n = {draft.sample_size ?? '—'} · {draft.id} · {draft.created_at}
            </div>
          </div>
          <div class="flex gap-2">
            <button
              type="button"
              on:click={() => approve(draft.id)}
              disabled={loading}
              class="border border-ok/50 bg-ok/10 px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.1em] text-ok disabled:opacity-40"
            >Approuver</button>
            <button
              type="button"
              on:click={() => reject(draft.id)}
              disabled={loading}
              class="border border-danger/50 bg-danger/10 px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.1em] text-danger disabled:opacity-40"
            >Rejeter</button>
          </div>
        </div>
        {#if draft.warnings_json && draft.warnings_json !== '[]'}
          <p class="mt-2 font-mono text-[9px] text-amber">{draft.warnings_json}</p>
        {/if}
        <a href={draft.source_url} target="_blank" rel="noopener noreferrer" class="mt-2 inline-block font-mono text-[9px] text-dim underline hover:text-cyan">
          Ouvrir la notice PDF ↗
        </a>
      </article>
    {:else}
      {#if hydrated && !loading}<p class="font-mono text-[10px] text-dim">Aucun brouillon en attente.</p>{/if}
    {/each}
  </div>
</div>
