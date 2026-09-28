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

export type FeedbackScreenshot = { mime_type: string; data_base64: string };

function screenshotPayload(dataUrl: string): FeedbackScreenshot {
  const [prefix = '', data = ''] = dataUrl.split(',', 2);
  return {
    mime_type: prefix.match(/^data:(.+?);base64$/)?.[1] ?? 'image/png',
    data_base64: data,
  };
}

async function captureScreenshot(): Promise<FeedbackScreenshot | null> {
  const hidden = Array.from(document.querySelectorAll<HTMLElement>('[data-feedback-widget-root]'));
  const display = hidden.map((node) => node.style.display);
  hidden.forEach((node) => (node.style.display = 'none'));

  try {
    if ('fonts' in document) await document.fonts.ready;
    const width = window.innerWidth;
    const height = window.innerHeight;
    const render = (scale: number, simplifyStyles = false) =>
      html2canvas(document.documentElement, {
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
            .forEach((node) => (node.style.display = 'none'));
          if (simplifyStyles) {
            clonedDocument.querySelectorAll<HTMLElement>('*').forEach((node) => {
              node.style.setProperty('background-image', 'none', 'important');
              node.style.setProperty('box-shadow', 'none', 'important');
              node.style.setProperty('filter', 'none', 'important');
              node.style.setProperty('backdrop-filter', 'none', 'important');
            });
          }
        },
      });

    let canvas: HTMLCanvasElement;
    try {
      canvas = await render(Math.min(window.devicePixelRatio || 1, 2));
    } catch {
      canvas = await render(1, true);
    }
    const webp = canvas.toDataURL('image/webp', 0.9);
    return screenshotPayload(
      webp.startsWith('data:image/webp;base64,') ? webp : canvas.toDataURL('image/png'),
    );
  } catch (error) {
    console.warn('ROI feedback screenshot capture failed', error);
    return null;
  } finally {
    hidden.forEach((node, index) => (node.style.display = display[index] ?? ''));
  }
}

export async function collectFeedbackDiagnostics(): Promise<{
  context: FeedbackContext;
  screenshot?: FeedbackScreenshot | null;
}> {
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
      color_scheme: document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light',
      client_timestamp: new Date().toISOString(),
      extra: { dashboard: 'celine-roi' },
    },
    screenshot: await captureScreenshot(),
  };
}
