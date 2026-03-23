/* eslint-disable */
(function () {
  document.addEventListener('coworker-request-shopify-data', function () {
    var data = {};
    try {
      if (window.Shopify) {
        data.shop = window.Shopify.shop || '';
        data.locale = window.Shopify.locale || '';
        data.country = window.Shopify.country || '';
        data.previewMode = !!window.Shopify.previewMode;
        if (window.Shopify.theme) {
          data.themeId = window.Shopify.theme.id ? String(window.Shopify.theme.id) : '';
          data.themeName = window.Shopify.theme.name || '';
          data.schemaName = window.Shopify.theme.schema_name || '';
        }
      }
      if (window.Theme && window.Theme.template) {
        data.template = window.Theme.template.name || '';
      }
    } catch (e) {
      /* ignore */
    }
    document.dispatchEvent(
      new CustomEvent('coworker-shopify-data', {
        detail: JSON.stringify(data),
      }),
    );
  });
})();
