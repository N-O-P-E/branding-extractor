/* eslint-disable */
(function () {
  var nonce = (document.currentScript && document.currentScript.getAttribute('data-vir-nonce')) || '';
  var requestEvent = 'vir-request-shopify-data' + (nonce ? '-' + nonce : '');
  var responseEvent = 'vir-shopify-data' + (nonce ? '-' + nonce : '');

  document.addEventListener(requestEvent, function () {
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
      new CustomEvent(responseEvent, {
        detail: JSON.stringify(data),
      }),
    );
  });
})();
