import { getConsoleErrors } from './console-capture.js';
import type { BrowserMetadata, ShopifyContext } from '../messages.js';

interface NavigatorUAData {
  brands: Array<{ brand: string; version: string }>;
  mobile: boolean;
  platform: string;
}

const parseBrowser = (): { name: string; version: string; engine: string } => {
  const uaData = (navigator as unknown as { userAgentData?: NavigatorUAData }).userAgentData;
  if (uaData?.brands) {
    const brand =
      uaData.brands.find(b => !b.brand.includes('Not')) ??
      uaData.brands.find(b => b.brand === 'Chromium') ??
      uaData.brands[0];
    return {
      name: brand?.brand ?? 'Unknown',
      version: brand?.version ?? 'Unknown',
      engine: 'Blink',
    };
  }
  const ua = navigator.userAgent;
  if (ua.includes('Firefox/')) {
    const ver = ua.match(/Firefox\/([\d.]+)/)?.[1] ?? 'Unknown';
    return { name: 'Firefox', version: ver, engine: 'Gecko' };
  }
  if (ua.includes('Edg/')) {
    const ver = ua.match(/Edg\/([\d.]+)/)?.[1] ?? 'Unknown';
    return { name: 'Edge', version: ver, engine: 'Blink' };
  }
  if (ua.includes('Chrome/')) {
    const ver = ua.match(/Chrome\/([\d.]+)/)?.[1] ?? 'Unknown';
    return { name: 'Chrome', version: ver, engine: 'Blink' };
  }
  if (ua.includes('Safari/') && !ua.includes('Chrome')) {
    const ver = ua.match(/Version\/([\d.]+)/)?.[1] ?? 'Unknown';
    return { name: 'Safari', version: ver, engine: 'WebKit' };
  }
  return { name: 'Unknown', version: 'Unknown', engine: 'Unknown' };
};

const parseOS = (): { name: string; version: string; platform: string } => {
  const uaData = (navigator as unknown as { userAgentData?: NavigatorUAData }).userAgentData;
  const platform = uaData?.platform ?? navigator.platform ?? 'Unknown';

  const ua = navigator.userAgent;
  if (ua.includes('Mac OS X')) {
    const ver = ua.match(/Mac OS X ([\d_]+)/)?.[1]?.replace(/_/g, '.') ?? 'Unknown';
    return { name: 'macOS', version: ver, platform };
  }
  if (ua.includes('Windows NT')) {
    const ntVer = ua.match(/Windows NT ([\d.]+)/)?.[1] ?? '';
    const verMap: Record<string, string> = { '10.0': '10/11', '6.3': '8.1', '6.2': '8', '6.1': '7' };
    return { name: 'Windows', version: verMap[ntVer] ?? ntVer, platform };
  }
  if (ua.includes('Linux')) {
    return { name: 'Linux', version: '', platform };
  }
  if (ua.includes('CrOS')) {
    return { name: 'ChromeOS', version: '', platform };
  }
  return { name: platform, version: '', platform };
};

const detectDeviceType = (): 'desktop' | 'tablet' | 'mobile' => {
  const uaData = (navigator as unknown as { userAgentData?: NavigatorUAData }).userAgentData;
  if (uaData) {
    return uaData.mobile ? 'mobile' : 'desktop';
  }
  const w = window.innerWidth;
  if (w <= 768) return 'mobile';
  if (w <= 1024 && navigator.maxTouchPoints > 0) return 'tablet';
  return 'desktop';
};

const extractShopifyContext = (): ShopifyContext | undefined => {
  try {
    const url = new URL(window.location.href);
    const hostname = url.hostname;

    const isShopifyAdmin = hostname === 'admin.shopify.com';
    const isMyShopify = hostname.endsWith('.myshopify.com');
    const hasAdminPath = url.pathname.includes('/admin/');

    if (!isShopifyAdmin && !isMyShopify && !hasAdminPath) return undefined;

    let storeName = '';
    let storeHandle = '';
    let themeName: string | undefined;
    let buildVersion: string | undefined;
    let locale: string | undefined;

    const serverDataEl = document.querySelector('script[data-serialized-id="server-data"]');
    if (serverDataEl?.textContent) {
      try {
        const serverData = JSON.parse(serverDataEl.textContent);
        buildVersion = serverData.buildVersion?.split('.')[0];
        locale = serverData.locale;
      } catch {
        /* ignore parse errors */
      }
    }

    const title = document.title;
    const titleMatch = title.match(/^(.+?)\s*[·|]\s*Edit\s+(.+?)\s*[·|]\s*Shopify$/);
    if (titleMatch) {
      storeName = titleMatch[1].trim();
      themeName = titleMatch[2].trim();
    }

    if (isShopifyAdmin) {
      const pathMatch = url.pathname.match(/\/store\/([^/]+)/);
      if (pathMatch) storeHandle = pathMatch[1];
    }

    if (!storeHandle) {
      const preloadLink = document.querySelector('link[rel="preload"][href*="/store/"]');
      if (preloadLink) {
        const hrefMatch = preloadLink.getAttribute('href')?.match(/\/store\/([^/]+)/);
        if (hrefMatch) storeHandle = hrefMatch[1];
      }
    }

    if (!storeHandle && isMyShopify) {
      storeHandle = hostname.replace('.myshopify.com', '');
    }

    if (!storeName && storeHandle) {
      storeName = storeHandle
        .split('-')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
    }

    if (!storeHandle) return undefined;

    const themeId: string | undefined =
      url.searchParams.get('preview_theme_id') ?? url.pathname.match(/\/themes\/(\d+)/)?.[1] ?? undefined;

    let environment: ShopifyContext['environment'] = 'live';
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      environment = 'local';
    } else if (isShopifyAdmin || hasAdminPath) {
      environment = 'editor';
    } else if (url.searchParams.has('preview_theme_id')) {
      environment = 'preview';
    }

    let editorUrl: string | undefined;

    if (isShopifyAdmin && url.pathname.includes('/editor')) {
      // Already in the editor — use the exact current URL (preserves template/section context)
      editorUrl = url.href;
    } else if (storeHandle && themeId) {
      editorUrl = `https://admin.shopify.com/store/${storeHandle}/themes/${themeId}/editor`;
    } else if (storeHandle) {
      editorUrl = `https://admin.shopify.com/store/${storeHandle}/themes`;
    }

    return {
      storeName,
      storeHandle,
      themeName,
      themeId,
      environment,
      buildVersion,
      locale,
      editorUrl,
    };
  } catch {
    return undefined;
  }
};

export const collectBrowserMetadata = async (): Promise<BrowserMetadata> => {
  const consoleErrors = await getConsoleErrors();

  const colorScheme: BrowserMetadata['device']['colorScheme'] = window.matchMedia('(prefers-color-scheme: dark)')
    .matches
    ? 'dark'
    : window.matchMedia('(prefers-color-scheme: light)').matches
      ? 'light'
      : 'no-preference';

  const connection = (navigator as unknown as { connection?: { effectiveType?: string } }).connection;

  return {
    browser: parseBrowser(),
    os: parseOS(),
    device: {
      type: detectDeviceType(),
      screenWidth: window.screen.width,
      screenHeight: window.screen.height,
      pixelRatio: window.devicePixelRatio || 1,
      colorScheme,
    },
    page: {
      title: document.title,
      language: document.documentElement.lang || 'unknown',
      zoomLevel: Math.round((window.visualViewport?.scale ?? 1) * 100),
    },
    network: {
      online: navigator.onLine,
      connectionType: connection?.effectiveType,
    },
    consoleErrors,
    userAgent: navigator.userAgent,
    shopify: extractShopifyContext(),
  };
};
