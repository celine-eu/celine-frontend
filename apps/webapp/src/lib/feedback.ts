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

    const clone = document.documentElement.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('[data-feedback-widget-root]').forEach((node) => node.remove());

    const width = window.innerWidth;
    const height = window.innerHeight;
    const xhtml = new XMLSerializer().serializeToString(clone);
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
        <foreignObject width="100%" height="100%">
          ${xhtml}
        </foreignObject>
      </svg>
    `.trim();

    const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const svgUrl = URL.createObjectURL(svgBlob);

    try {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Screenshot render failed'));
        img.src = svgUrl;
      });

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        return null;
      }
      ctx.drawImage(image, 0, 0, width, height);
      const dataUrl = canvas.toDataURL('image/png');
      return {
        mime_type: 'image/png',
        data_base64: stripDataUrlPrefix(dataUrl),
      };
    } finally {
      URL.revokeObjectURL(svgUrl);
    }
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
