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

function toScreenshotPayload(dataUrl: string): FeedbackScreenshot {
  const [prefix = ''] = dataUrl.split(',', 1);
  const mimeType = prefix.match(/^data:(.+?);base64$/)?.[1] ?? 'image/png';
  return { mime_type: mimeType, data_base64: dataUrl.split(',', 2)[1] ?? '' };
}

async function captureScreenshot(): Promise<FeedbackScreenshot | null> {
  const hiddenNodes = Array.from(document.querySelectorAll<HTMLElement>('[data-feedback-widget-root]'));
  const previousDisplay = hiddenNodes.map((node) => node.style.display);
  hiddenNodes.forEach((node) => (node.style.display = 'none'));

  try {
    if ('fonts' in document) await document.fonts.ready;
    const width = window.innerWidth;
    const height = window.innerHeight;
    const scale = Math.min(window.devicePixelRatio || 1, 2);

    const render = (renderScale: number, simplifyStyles = false) =>
      html2canvas(document.documentElement, {
        backgroundColor: getComputedStyle(document.body).backgroundColor || '#ffffff',
        foreignObjectRendering: false,
        logging: false,
        scale: renderScale,
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

          // html2canvas 1.x cannot parse newer CSS image functions such as
          // conic-gradient. If the normal render fails, keep the page content
          // and remove decorative effects in the retry instead of dropping the
          // screenshot from the feedback altogether.
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
      canvas = await render(scale);
    } catch {
      canvas = await render(1, true);
    }
    const webp = canvas.toDataURL('image/webp', 0.9);
    return toScreenshotPayload(
      webp.startsWith('data:image/webp;base64,') ? webp : canvas.toDataURL('image/png'),
    );
  } catch (error) {
    console.warn('Feedback screenshot capture failed', error);
    return null;
  } finally {
    hiddenNodes.forEach((node, index) => (node.style.display = previousDisplay[index] ?? ''));
  }
}

export async function collectFeedbackDiagnostics(
  extra: Record<string, unknown> = {},
): Promise<{ context: FeedbackContext; screenshot?: FeedbackScreenshot | null }> {
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
      color_scheme: document.documentElement.classList.contains('dark') ? 'dark' : 'light',
      client_timestamp: new Date().toISOString(),
      extra,
    },
    screenshot: await captureScreenshot(),
  };
}
