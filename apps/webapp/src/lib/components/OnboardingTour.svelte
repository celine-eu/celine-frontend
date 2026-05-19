<script lang="ts">
  import { page } from "$app/stores";
  import { Icon } from "@celine-eu/ui";
  import { onMount, tick } from "svelte";
  import { t } from "svelte-i18n";

  interface Props {
    enabled?: boolean;
    completed?: boolean;
    completedPages?: string[];
    onComplete?: (pageKey: string) => Promise<unknown> | unknown;
  }

  type TourStep = {
    target?: string;
    titleKey: string;
    bodyKey: string;
  };

  let {
    enabled = true,
    completed = false,
    completedPages = [],
    onComplete,
  }: Props = $props();

  const ROUTE_TOUR_PATHS = new Set([
    "/",
    "/suggestions",
    "/assistant",
    "/notifications",
    "/profile",
    "/settings",
    "/no-smart-meter",
    "/not-a-participant",
  ]);

  const commonSteps: TourStep[] = [
    {
      target: '[data-tour="brand"]',
      titleKey: "onboarding.common.brand_title",
      bodyKey: "onboarding.common.brand_body",
    },
    {
      target: '[data-tour="nav-overview"]',
      titleKey: "onboarding.common.overview_title",
      bodyKey: "onboarding.common.overview_body",
    },
    {
      target: '[data-tour="nav-suggestions"]',
      titleKey: "onboarding.common.suggestions_title",
      bodyKey: "onboarding.common.suggestions_body",
    },
    {
      target: '[data-tour="nav-assistant"]',
      titleKey: "onboarding.common.assistant_title",
      bodyKey: "onboarding.common.assistant_body",
    },
    {
      target: '[data-tour="nav-notifications"]',
      titleKey: "onboarding.common.notifications_title",
      bodyKey: "onboarding.common.notifications_body",
    },
    {
      target: '[data-tour="profile-menu"]',
      titleKey: "onboarding.common.profile_title",
      bodyKey: "onboarding.common.profile_body",
    },
  ];

  const routeSteps: Record<string, TourStep[]> = {
    "/": [
      {
        titleKey: "onboarding.overview.intro_title",
        bodyKey: "onboarding.overview.intro_body",
      },
      {
        target: '[data-tour="overview-progress"]',
        titleKey: "onboarding.overview.progress_title",
        bodyKey: "onboarding.overview.progress_body",
      },
      {
        target: '[data-tour="period-toggle"]',
        titleKey: "onboarding.overview.period_title",
        bodyKey: "onboarding.overview.period_body",
      },
      {
        target: '[data-tour="overview-contribution"]',
        titleKey: "onboarding.overview.contribution_title",
        bodyKey: "onboarding.overview.contribution_body",
      },
      {
        target: '[data-tour="overview-trends"]',
        titleKey: "onboarding.overview.trends_title",
        bodyKey: "onboarding.overview.trends_body",
      },
      {
        target: '[data-tour="ask-ai"]',
        titleKey: "onboarding.common.ask_ai_title",
        bodyKey: "onboarding.common.ask_ai_body",
      },
    ],
    "/suggestions": [
      {
        target: '[data-tour="suggestions-opportunities"]',
        titleKey: "onboarding.suggestions.opportunities_title",
        bodyKey: "onboarding.suggestions.opportunities_body",
      },
      {
        target: '[data-tour="suggestions-forecast"]',
        titleKey: "onboarding.suggestions.forecast_title",
        bodyKey: "onboarding.suggestions.forecast_body",
      },
      {
        target: '[data-tour="suggestions-history"]',
        titleKey: "onboarding.suggestions.history_title",
        bodyKey: "onboarding.suggestions.history_body",
      },
      {
        target: '[data-tour="ask-ai"]',
        titleKey: "onboarding.common.ask_ai_title",
        bodyKey: "onboarding.common.ask_ai_body",
      },
    ],
    "/assistant": [
      {
        target: '[data-tour="assistant-toolbar"]',
        titleKey: "onboarding.assistant.toolbar_title",
        bodyKey: "onboarding.assistant.toolbar_body",
      },
      {
        target: '[data-tour="assistant-chat"]',
        titleKey: "onboarding.assistant.chat_title",
        bodyKey: "onboarding.assistant.chat_body",
      },
    ],
    "/notifications": [
      {
        titleKey: "onboarding.notifications.intro_title",
        bodyKey: "onboarding.notifications.intro_body",
      },
      {
        target: '[data-tour="notifications-push"]',
        titleKey: "onboarding.notifications.push_title",
        bodyKey: "onboarding.notifications.push_body",
      },
      {
        target: '[data-tour="notifications-toolbar"]',
        titleKey: "onboarding.notifications.filters_title",
        bodyKey: "onboarding.notifications.filters_body",
      },
      {
        target: '[data-tour="notifications-list"]',
        titleKey: "onboarding.notifications.list_title",
        bodyKey: "onboarding.notifications.list_body",
      },
    ],
    "/profile": [
      {
        target: '[data-tour="profile-identity"]',
        titleKey: "onboarding.profile.identity_title",
        bodyKey: "onboarding.profile.identity_body",
      },
    ],
    "/settings": [
      {
        target: '[data-tour="settings-language"]',
        titleKey: "onboarding.settings.language_title",
        bodyKey: "onboarding.settings.language_body",
      },
      {
        target: '[data-tour="settings-appearance"]',
        titleKey: "onboarding.settings.appearance_title",
        bodyKey: "onboarding.settings.appearance_body",
      },
      {
        target: '[data-tour="settings-accessibility"]',
        titleKey: "onboarding.settings.accessibility_title",
        bodyKey: "onboarding.settings.accessibility_body",
      },
      {
        target: '[data-tour="settings-notifications"]',
        titleKey: "onboarding.settings.notifications_title",
        bodyKey: "onboarding.settings.notifications_body",
      },
    ],
    "/no-smart-meter": [
      {
        titleKey: "onboarding.empty_state.title",
        bodyKey: "onboarding.empty_state.body",
      },
    ],
    "/not-a-participant": [
      {
        titleKey: "onboarding.empty_state.title",
        bodyKey: "onboarding.empty_state.body",
      },
    ],
  };

  let visible = $state(false);
  let stepIndex = $state(0);
  let steps: TourStep[] = $state([]);
  let targetRect: DOMRect | null = $state(null);
  let currentPath = $state("");
  let sessionCompletedPages: string[] = $state([]);
  let resizeCleanup: (() => void) | null = null;

  const currentStep = $derived(steps[stepIndex]);
  const isLastStep = $derived(stepIndex >= steps.length - 1);

  function normalizePath(pathname: string): string | null {
    if (pathname === "/") return "/";
    const firstSegment = `/${pathname.split("/").filter(Boolean)[0] ?? ""}`;
    return ROUTE_TOUR_PATHS.has(firstSegment) ? firstSegment : null;
  }

  function candidateSteps(pathname: string): TourStep[] {
    const path = normalizePath(pathname);
    if (!path) return [];
    const pageSteps = routeSteps[path] ?? [];
    return path === "/" ? [...commonSteps, ...pageSteps] : pageSteps;
  }

  async function refreshTarget() {
    await tick();

    if (!currentStep?.target) {
      targetRect = null;
      return;
    }

    const el = document.querySelector(currentStep.target);
    if (!(el instanceof HTMLElement)) {
      targetRect = null;
      return;
    }

    el.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
    window.setTimeout(() => {
      targetRect = el.getBoundingClientRect();
    }, 180);
  }

  function availableSteps(pathname: string): TourStep[] {
    return candidateSteps(pathname).filter((step) => {
      if (!step.target) return true;
      return document.querySelector(step.target) !== null;
    });
  }

  async function startTour(pathname: string, manual = false) {
    if (!enabled || completed) return;

    const normalized = normalizePath(pathname);
    if (!normalized) return;
    currentPath = normalized;
    if (
      !manual &&
      (completedPages.includes(currentPath) || sessionCompletedPages.includes(currentPath))
    ) return;

    await tick();
    steps = availableSteps(pathname);
    if (steps.length === 0) return;

    stepIndex = 0;
    visible = true;
    document.body.classList.add("tour-active");
    await refreshTarget();
  }

  async function finishTour() {
    if (currentPath && !sessionCompletedPages.includes(currentPath)) {
      sessionCompletedPages = [...sessionCompletedPages, currentPath];
    }
    try {
      await onComplete?.(currentPath);
    } catch {
      // Keep the UI dismissible even if the backend is temporarily unavailable.
    }
    visible = false;
    targetRect = null;
    document.body.classList.remove("tour-active");
  }

  async function nextStep() {
    if (isLastStep) {
      void finishTour();
      return;
    }

    stepIndex += 1;
    await refreshTarget();
  }

  async function previousStep() {
    if (stepIndex === 0) return;
    stepIndex -= 1;
    await refreshTarget();
  }

  onMount(() => {
    const onResize = () => {
      if (visible) void refreshTarget();
    };
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);
    resizeCleanup = () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
    };

    window.setTimeout(() => startTour($page.url.pathname), 650);

    return () => {
      resizeCleanup?.();
      document.body.classList.remove("tour-active");
    };
  });

  $effect(() => {
    if (!enabled || completed) return;
    const pathname = $page.url.pathname;
    if (!normalizePath(pathname)) return;
    window.setTimeout(() => startTour(pathname), 650);
  });
</script>

{#if visible && currentStep}
  <div class="tour-layer" role="presentation">
    <div class="tour-scrim" aria-hidden="true"></div>

    {#if targetRect}
      <div
        class="tour-highlight"
        style:left={`${Math.max(targetRect.left - 6, 8)}px`}
        style:top={`${Math.max(targetRect.top - 6, 8)}px`}
        style:width={`${targetRect.width + 12}px`}
        style:height={`${targetRect.height + 12}px`}
      ></div>
    {/if}

    <section class="tour-popover" aria-live="polite" aria-modal="true" role="dialog">
      <div class="tour-popover__head">
        <div class="tour-icon">
          <Icon name="info" size={18} />
        </div>
        <span class="tour-progress">
          {$t("onboarding.actions.step", { values: { current: stepIndex + 1, total: steps.length } })}
        </span>
      </div>

      <h2>{ $t(currentStep.titleKey) }</h2>
      <p>{ $t(currentStep.bodyKey) }</p>

      <div class="tour-actions">
        <button class="tour-link" type="button" onclick={finishTour}>
          {$t("onboarding.actions.skip")}
        </button>
        <div class="tour-actions__right">
          <button class="tour-secondary" type="button" onclick={previousStep} disabled={stepIndex === 0}>
            {$t("onboarding.actions.back")}
          </button>
          <button class="tour-primary" type="button" onclick={nextStep}>
            {isLastStep ? $t("onboarding.actions.done") : $t("onboarding.actions.next")}
          </button>
        </div>
      </div>
    </section>
  </div>
{/if}

<style>
  :global(body.tour-active) {
    overflow-x: hidden;
  }

  .tour-layer {
    position: fixed;
    inset: 0;
    z-index: 1000;
    pointer-events: none;
  }

  .tour-scrim {
    position: absolute;
    inset: 0;
    border: 0;
    background: rgba(15, 23, 42, 0.48);
    pointer-events: auto;
  }

  .tour-highlight {
    position: fixed;
    border: 2px solid var(--celine-primary);
    border-radius: var(--celine-radius-lg);
    box-shadow:
      0 0 0 4px color-mix(in srgb, var(--celine-primary) 22%, transparent),
      0 16px 40px rgba(0, 0, 0, 0.22);
    background: color-mix(in srgb, var(--celine-bg-elevated) 12%, transparent);
    pointer-events: none;
    transition: all var(--celine-transition-fast);
  }

  .tour-popover {
    position: fixed;
    left: 50%;
    bottom: max(1rem, env(safe-area-inset-bottom));
    transform: translateX(-50%);
    width: min(calc(100vw - 2rem), 420px);
    border: 1px solid var(--celine-border);
    border-radius: var(--celine-radius-lg);
    background: var(--celine-bg-elevated);
    color: var(--celine-text);
    box-shadow: 0 18px 60px rgba(0, 0, 0, 0.24);
    padding: var(--celine-space-lg);
    pointer-events: auto;
    box-sizing: border-box;
  }

  .tour-popover__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--celine-space-sm);
    margin-bottom: var(--celine-space-sm);
  }

  .tour-icon {
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    border-radius: 999px;
    background: var(--celine-primary-light);
    color: var(--celine-primary);
  }

  .tour-progress {
    color: var(--celine-text-secondary);
    font-size: 0.8125rem;
    font-weight: 600;
  }

  h2 {
    margin: 0 0 var(--celine-space-xs);
    font-size: 1.0625rem;
    line-height: 1.25;
    letter-spacing: 0;
  }

  p {
    margin: 0;
    color: var(--celine-text-secondary);
    font-size: 0.9375rem;
    line-height: 1.5;
  }

  .tour-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--celine-space-sm);
    margin-top: var(--celine-space-lg);
  }

  .tour-actions__right {
    display: flex;
    align-items: center;
    gap: var(--celine-space-sm);
  }

  .tour-link,
  .tour-secondary,
  .tour-primary {
    min-height: 36px;
    border-radius: var(--celine-radius-md);
    font: inherit;
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
  }

  .tour-link {
    border: 0;
    background: transparent;
    color: var(--celine-text-secondary);
    padding: 0;
  }

  .tour-secondary,
  .tour-primary {
    border: 1px solid var(--celine-border);
    padding: 0 var(--celine-space-md);
  }

  .tour-secondary {
    background: var(--celine-bg);
    color: var(--celine-text);
  }

  .tour-secondary:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .tour-primary {
    border-color: var(--celine-primary);
    background: var(--celine-primary);
    color: #fff;
  }

  @media (min-width: 720px) {
    .tour-popover {
      right: 1.25rem;
      left: auto;
      bottom: 1.25rem;
      transform: none;
    }
  }

  @media (max-width: 380px) {
    .tour-actions {
      align-items: stretch;
      flex-direction: column;
    }

    .tour-actions__right {
      justify-content: flex-end;
    }
  }
</style>
