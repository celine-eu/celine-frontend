<script lang="ts">
    import { Icon } from "@celine-eu/ui";
    import { t } from "svelte-i18n";
</script>

<section class="no-meter-page">
    <div class="no-meter-card">
        <div class="icon-wrapper">
            <Icon name="plug" size={48} />
        </div>
        <h1 class="page-title">{$t('no_smart_meter.title')}</h1>
        <p class="page-text">{$t('no_smart_meter.body_1')}</p>
        <p class="page-text">{$t('no_smart_meter.body_2')}</p>
        <a href="/" class="back-link">
            <Icon name="chevron-left" size={16} />
            {$t('no_smart_meter.back')}
        </a>
    </div>
</section>

<style>
    .no-meter-page {
        display: flex;
        justify-content: center;
        align-items: center;
        min-height: 50vh;
    }

    .no-meter-card {
        text-align: center;
        max-width: 400px;
        padding: var(--celine-space-xl);
    }

    .icon-wrapper {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 80px;
        height: 80px;
        background: var(--celine-warning-bg);
        color: var(--celine-warning);
        border-radius: 50%;
        margin-bottom: var(--celine-space-lg);
    }

    .page-title {
        font-size: 1.5rem;
        font-weight: 700;
        color: var(--celine-text);
        margin: 0 0 var(--celine-space-md);
    }

    .page-text {
        color: var(--celine-text-secondary);
        margin: 0 0 var(--celine-space-sm);
    }

    .back-link {
        display: inline-flex;
        align-items: center;
        gap: var(--celine-space-xs);
        margin-top: var(--celine-space-lg);
        color: var(--celine-primary);
        text-decoration: none;
        font-weight: 500;
    }

    .back-link:hover {
        text-decoration: underline;
    }
</style>
