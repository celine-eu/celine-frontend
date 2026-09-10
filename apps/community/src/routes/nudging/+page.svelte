<script lang="ts">
  import { onMount } from 'svelte';
  import { _ } from 'svelte-i18n';
  import { getNudgingConversion, type NudgingConversion, type Period } from '$lib/api';
  import { meStore } from '$lib/stores';
  import ExportButtons from '$lib/components/ExportButtons.svelte';

  let period = $state<Period>('30d');
  let data = $state<NudgingConversion | null>(null);
  let loading = $state(true);
  let error = $state(false);

  async function load() {
    const me = $meStore;
    if (!me) return;
    loading = true;
    error = false;
    try {
      data = await getNudgingConversion(me.communityKey, period);
    } catch {
      error = true;
    } finally {
      loading = false;
    }
  }

  function formatDate(value?: string): string {
    if (!value) return '—';
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
  }

  function ruleConversion(rule: NudgingConversion['rules'][number]): number {
    return rule.steps.find((step) => step.id === 'committed')?.conversionPercent ?? 0;
  }

  onMount(load);
</script>

<svelte:head><title>{$_('nav.nudging')} · {$_('app.title')}</title></svelte:head>

<div class="page-wrap">
  <header class="page-heading"><div><span>{$_('nudging.eyebrow')}</span><h1>{$_('nudging.title')}</h1><p>{$_('nudging.subtitle')}</p></div><div class="heading-actions">{#if $meStore}<ExportButtons communityKey={$meStore.communityKey} dataset="nudging" {period} />{/if}<label><span>{$_('common.period')}</span><select bind:value={period} onchange={load}><option value="today">{$_('period.today')}</option><option value="7d">{$_('period.7d')}</option><option value="30d">{$_('period.30d')}</option></select></label></div></header>

  {#if loading}<div class="state"><div class="spinner"></div><p>{$_('common.loading')}</p></div>
  {:else if error}<div class="state error"><strong>!</strong><p>{$_('nudging.error')}</p><button onclick={load}>{$_('error.retry')}</button></div>
  {:else if data}
    {#if data.partial}<div class="partial">{$_('common.partial')} · {$_('nudging.partial_help')}</div>{/if}
    <section class="panel funnel-panel">
      <header>
        <div><span>{$_('nudging.performance')}</span><h2>{$_('nudging.funnel')}</h2><p class="funnel-help">{$_('nudging.funnel_help')}</p></div>
        <div class="commit"><small>{$_('nudging.click_commit')}</small><strong>{data.clickToCommitPercent}%</strong></div>
      </header>
      <ol class="funnel">
        {#each data.steps as step, index (step.id)}
          <li>
            <div class="step-heading"><span>{index + 1}</span><div><small>{$_(`nudge_step.${step.id}`)}</small><p>{$_(`nudge_step.${step.id}_description`)}</p></div></div>
            <div class="step-value"><strong>{step.count}</strong><small>{$_('nudging.observed_events')}</small></div>
            <em>{index === 0 ? $_('nudging.funnel_base') : `${step.conversionPercent}% ${$_('nudging.from_previous_step')}`}</em>
          </li>
        {/each}
      </ol>
    </section>

    <div class="health-grid">
      <section class="panel"><header><div><span>{$_('nudging.channels')}</span><h2>{$_('nudging.reachability')}</h2></div></header><div class="reach-list">{#each data.reachability as item (item.channel)}<article><div class={`channel ${item.channel}`}>{item.channel === 'email' ? '@' : '◉'}</div><div><strong>{$_(`channel.${item.channel}`)}</strong><small>{item.reachable} / {item.total} {$_('nudging.reachable')}</small><div class="progress"><span style={`width:${item.reachablePercent}%`}></span></div></div><b>{item.reachablePercent}%<small>{item.optedOut} opt-out</small></b></article>{/each}</div></section>
      <section class="panel"><header><div><span>{$_('nudging.delivery')}</span><h2>{$_('nudging.failures')}</h2></div></header>{#if data.failures.length === 0}<div class="empty">{$_('nudging.no_failures')}</div>{:else}<div class="failure-list">{#each data.failures as item}<article><span class={`channel ${item.channel}`}>{item.channel}</span><code>{item.errorClass}</code><strong>{item.count}</strong></article>{/each}</div>{/if}</section>
    </div>

    <section class="panel rules"><header><div><span>{$_('nudging.catalogue')}</span><h2>{$_('nudging.active_rules')}</h2><p class="catalogue-help">{$_('nudging.catalogue_filter')}</p></div><small>{$_('nudging.read_only')}</small></header><div class="table-scroll"><table><thead><tr><th>{$_('nudging.rule')}</th><th>{$_('nudging.family')}</th><th>{$_('nudging.channel')}</th><th>{$_('nudging.severity')}</th><th>{$_('nudging.last_fired')}</th><th>{$_('nudging.volume')}</th><th>{$_('nudging.commit_conversion')}</th><th>{$_('nudging.state')}</th></tr></thead><tbody>{#each data.rules as rule (rule.id)}<tr><td><strong>{rule.name}</strong><code>{rule.id}</code></td><td>{rule.family}</td><td><span class={`tag ${rule.channel}`}>{$_(`channel.${rule.channel}`)}</span></td><td><span class={`tag ${rule.severity}`}>{$_(`severity.${rule.severity}`)}</span></td><td>{formatDate(rule.lastFiredAt)}</td><td>{rule.volume}</td><td><b>{ruleConversion(rule)}%</b></td><td><span class="tag active">{rule.active ? $_('nudging.active') : $_('nudging.inactive')}</span></td></tr>{/each}</tbody></table></div><p class="notice">{$_('nudging.no_editor')}</p></section>
  {/if}
</div>

<style>
  .heading-actions{display:flex;align-items:flex-end;gap:.45rem}
  .page-wrap{max-width:1500px;margin:0 auto;padding:1.6rem 2rem 3rem}.page-heading{display:flex;justify-content:space-between;align-items:flex-end;gap:1rem;margin-bottom:1rem}.page-heading>div>span,.panel header>div>span{color:var(--community-primary);font-size:.62rem;font-weight:800;letter-spacing:.1em;text-transform:uppercase}h1{margin:.3rem 0;font-size:clamp(1.6rem,3vw,2.25rem)}.page-heading p{margin:0;color:var(--community-muted);font-size:.8rem}.page-heading label{display:grid;gap:.3rem}.page-heading label span{color:var(--community-muted);font-size:.6rem}.page-heading select{height:38px;padding:0 .7rem;border:1px solid var(--community-border);border-radius:9px;background:var(--community-surface);color:var(--community-text)}.partial{margin-bottom:.8rem;padding:.7rem;border-radius:10px;background:var(--community-warning-soft);color:var(--community-warning);font-size:.65rem}.panel{padding:1rem;border:1px solid var(--community-border);border-radius:14px;background:var(--community-surface);box-shadow:var(--community-shadow)}.panel>header{display:flex;justify-content:space-between;align-items:flex-start;gap:1rem}.panel h2{margin:.25rem 0;font-size:.95rem}.panel header>small{color:var(--community-muted);font-size:.58rem}.commit{text-align:right}.commit small,.commit strong{display:block}.commit small{color:var(--community-muted);font-size:.56rem}.commit strong{margin-top:.2rem;color:var(--community-primary);font-size:1.05rem}
  .funnel-help,.catalogue-help{max-width:720px;margin:.25rem 0 0;color:var(--community-muted);font-size:.61rem;line-height:1.5}.funnel{display:grid;grid-template-columns:repeat(5,1fr);gap:.55rem;margin:1rem 0 0;padding:0;list-style:none}.funnel li{position:relative;display:flex;min-height:170px;padding:.8rem;flex-direction:column;border-radius:11px;background:var(--community-surface-soft)}.funnel li:not(:last-child)::after{content:'›';position:absolute;right:-.42rem;top:43%;color:var(--community-muted);font-weight:800}.step-heading{display:flex;align-items:flex-start;gap:.45rem}.step-heading>span{display:grid;place-items:center;width:21px;height:21px;flex:0 0 21px;border-radius:50%;background:var(--community-primary-soft);color:var(--community-primary);font-size:.52rem;font-weight:800}.step-heading small{display:block;color:var(--community-text);font-size:.61rem;font-weight:800}.step-heading p{margin:.25rem 0 0;color:var(--community-muted);font-size:.55rem;line-height:1.45}.step-value{display:flex;align-items:baseline;gap:.35rem;margin-top:auto;padding-top:.7rem}.step-value strong{font-size:1.35rem}.step-value small{color:var(--community-muted);font-size:.52rem}.funnel em{margin-top:.15rem;color:var(--community-primary-strong);font-size:.56rem;font-style:normal;font-weight:700}.health-grid{display:grid;grid-template-columns:1fr 1fr;gap:.8rem;margin:.8rem 0}.reach-list,.failure-list{margin-top:.6rem}.reach-list article{display:grid;grid-template-columns:auto 1fr auto;gap:.7rem;align-items:center;padding:.75rem 0;border-top:1px solid var(--community-border)}.channel{display:grid;place-items:center;min-width:34px;height:28px;padding:0 .35rem;border-radius:8px;background:var(--community-primary-soft);color:var(--community-primary);font-size:.58rem;font-weight:750}.channel.email{background:var(--community-warning-soft);color:var(--community-warning)}.reach-list strong,.reach-list small,.reach-list b{display:block}.reach-list strong{font-size:.67rem}.reach-list small{color:var(--community-muted);font-size:.55rem}.reach-list b{text-align:right;font-size:.7rem}.reach-list b small{margin-top:.2rem}.progress{height:4px;margin-top:.4rem;border-radius:4px;background:var(--community-border);overflow:hidden}.progress span{display:block;height:100%;background:var(--community-primary)}.failure-list article{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:.6rem;padding:.7rem 0;border-top:1px solid var(--community-border)}.failure-list code{font-size:.61rem}.failure-list strong{color:var(--community-danger);font-size:.78rem}.empty{padding:2rem;color:var(--community-muted);font-size:.68rem;text-align:center}
  .rules{margin-top:.2rem}.table-scroll{overflow-x:auto;margin-top:.7rem}table{width:100%;border-collapse:collapse;font-size:.64rem}th{padding:.65rem;color:var(--community-muted);text-align:left;font-size:.52rem;text-transform:uppercase}td{padding:.7rem .65rem;border-top:1px solid var(--community-border);white-space:nowrap}td strong,td code{display:block}td strong{font-size:.64rem}td code{margin-top:.18rem;color:var(--community-muted);font-size:.53rem}.tag{display:inline-block;padding:.25rem .42rem;border-radius:999px;background:var(--community-surface-soft);color:var(--community-muted);font-size:.52rem;font-weight:700}.tag.high,.tag.critical{background:var(--community-danger-soft);color:var(--community-danger)}.tag.medium{background:var(--community-warning-soft);color:var(--community-warning)}.tag.active,.tag.webpush{background:var(--community-primary-soft);color:var(--community-success)}.notice{margin:.8rem 0 0;padding:.7rem;border-radius:9px;background:var(--community-primary-soft);color:var(--community-primary-strong);font-size:.61rem;line-height:1.45}.state{min-height:360px;display:grid;place-content:center;justify-items:center;gap:.6rem;color:var(--community-muted)}.state p{margin:0}.state.error strong{color:var(--community-danger);font-size:1.5rem}.state button{padding:.45rem .7rem;border:0;border-radius:8px;background:var(--community-primary);color:#fff}.spinner{width:25px;height:25px;border:3px solid var(--community-border);border-top-color:var(--community-primary);border-radius:50%;animation:spin .8s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}
  @media(max-width:850px){.health-grid{grid-template-columns:1fr}.funnel{grid-template-columns:repeat(3,1fr)}.funnel li::after{display:none}}@media(max-width:600px){.page-wrap{padding:1.1rem .8rem 5rem}.page-heading{align-items:flex-start;flex-direction:column}.heading-actions{width:100%;flex-wrap:wrap}.funnel{grid-template-columns:1fr 1fr}}
</style>
