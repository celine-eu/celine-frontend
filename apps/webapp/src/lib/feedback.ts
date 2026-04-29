import html2canvas from 'html2canvas';

export type FeedbackContext = {
  page_url: string;
  page_title?: string | null;
  page_path?: string | null;
  locale?: string | null;
  timezone?: string | null;
  user_agent?: string | null;
  viewport_width?: number | null;
  viewport_height?: number | null;
  screen_width?: number | null;
  screen_height?: number | null;
  color_scheme?: 'light' | 'dark' | null;
  client_timestamp?: string | null;
  extra?: Record<string, unknown>;
};

export type FeedbackScreenshot = {
  mime_type: string;
  data_base64: string;
};

function stripDataUrlPrefix(dataUrl: string): string {
  const [, payload = ''] = dataUrl.split(',', 2);
  return payload;
}

function toScreenshotPayload(dataUrl: string): FeedbackScreenshot {
  const [prefix = ''] = dataUrl.split(',', 1);
  const match = prefix.match(/^data:(.+?);base64$/);
  const mimeType = match?.[1] ?? 'image/png';

  return {
    mime_type: mimeType,
    data_base64: stripDataUrlPrefix(dataUrl),
  };
}

async function captureScreenshot(): Promise<FeedbackScreenshot | null> {
  const hiddenNodes = Array.from(document.querySelectorAll<HTMLElement>('[data-feedback-widget-root]'));
  const previousDisplay = hiddenNodes.map((node) => node.style.display);
  hiddenNodes.forEach((node) => {
    node.style.display = 'none';
  });

  try {
    if ('fonts' in document) {
      await document.fonts.ready;
    }
    const width = window.innerWidth;
    const height = window.innerHeight;
    const scale = Math.min(window.devicePixelRatio || 1, 2);
    const canvas = await html2canvas(document.documentElement, {
      backgroundColor: getComputedStyle(document.body).backgroundColor || '#ffffff',
      foreignObjectRendering: false,
      logging: false,
      scale,
      useCORS: true,
      width,
      height,
      windowWidth: width,
      windowHeight: height,
      scrollX: -window.scrollX,
      scrollY: -window.scrollY,
      ignoreElements: (element) => element.hasAttribute('data-feedback-widget-root'),
      onclone: (clonedDocument) => {
        clonedDocument
          .querySelectorAll<HTMLElement>('[data-feedback-widget-root]')
          .forEach((node) => {
            node.style.display = 'none';
          });
      },
    });

    const webpDataUrl = canvas.toDataURL('image/webp', 0.9);
    if (webpDataUrl.startsWith('data:image/webp;base64,')) {
      return toScreenshotPayload(webpDataUrl);
    }

    return toScreenshotPayload(canvas.toDataURL('image/png'));
  } catch {
    return null;
  } finally {
    hiddenNodes.forEach((node, index) => {
      node.style.display = previousDisplay[index] ?? '';
    });
  }
}

export async function collectFeedbackDiagnostics(extra: Record<string, unknown> = {}): Promise<{
  context: FeedbackContext;
  screenshot?: FeedbackScreenshot | null;
}> {
  const colorScheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';

  return {
    context: {
      page_url: window.location.href,
      page_title: document.title,
      page_path: window.location.pathname,
      locale: document.documentElement.lang || navigator.language,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      user_agent: navigator.userAgent,
      viewport_width: window.innerWidth,
      viewport_height: window.innerHeight,
      screen_width: window.screen.width,
      screen_height: window.screen.height,
      color_scheme: colorScheme,
      client_timestamp: new Date().toISOString(),
      extra,
    },
    screenshot: await captureScreenshot(),
  };
}
