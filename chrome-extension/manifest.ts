import { readFileSync } from 'node:fs';
import type { ManifestType } from '@extension/shared';

const packageJson = JSON.parse(readFileSync('./package.json', 'utf8'));

const manifest = {
  manifest_version: 3,
  default_locale: 'en',
  name: 'Coworker',
  version: packageJson.version,
  description: '__MSG_extensionDescription__',
  host_permissions: ['<all_urls>'],
  permissions: ['activeTab', 'storage', 'sidePanel'],
  background: {
    service_worker: 'background.js',
    type: 'module',
  },
  action: {
    default_icon: 'icon-34.png',
  },
  side_panel: {
    default_path: 'side-panel/index.html',
  },
  icons: {
    '128': 'icon-128.png',
  },
  content_scripts: [
    {
      matches: ['http://*/*', 'https://*/*'],
      js: ['content/all.iife.js'],
    },
    {
      matches: ['http://*/*', 'https://*/*'],
      js: ['content-ui/all.iife.js'],
    },
    {
      matches: ['http://*/*', 'https://*/*'],
      css: ['content.css'],
    },
  ],
  web_accessible_resources: [
    {
      resources: ['*.js', '*.css', '*.svg', '*.woff2', '*.woff', 'icon-128.png', 'icon-34.png'],
      matches: ['*://*/*'],
    },
  ],
} as ManifestType & { side_panel: { default_path: string } };

export default manifest;
