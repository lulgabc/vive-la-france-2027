<script lang="ts">
  import { onMount } from 'svelte';

  export let lang: 'fr' | 'en' | 'zh' = 'fr';

  let time = '';
  let date = '';

  onMount(() => {
    const locale = lang === 'zh' ? 'zh-CN' : lang === 'en' ? 'en-GB' : 'fr-FR';
    const timeFmt = new Intl.DateTimeFormat(locale, {
      timeZone: 'Europe/Paris',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    const dateFmt = new Intl.DateTimeFormat(locale, {
      timeZone: 'Europe/Paris',
      day: '2-digit',
      month: 'short',
    });
    const update = () => {
      const now = new Date();
      time = timeFmt.format(now);
      date = dateFmt.format(now);
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  });
</script>

<div class="text-right leading-tight">
  <div class="font-mono text-[13px] text-fg tabular-nums">{time || '--:--:--'}</div>
  <div class="font-mono text-[9px] uppercase tracking-[0.14em] text-dim">{date || 'PARIS'}</div>
</div>
