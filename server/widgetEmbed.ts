/**
 * Generates the lightweight embeddable script (/widget/embed.js) that customer websites paste before </body>.
 * Security guarantees:
 * - Only accepts publicInstallKey (never secret API keys)
 * - Mounts UI inside an isolated iframe so host store CSS cannot break widget styling
 * - Validates postMessage origin strictly against the panel origin
 */
export function buildWidgetEmbedScript(panelOrigin: string): string {
  return `(function () {
  if (window.__RAMAX_WIDGET_LOADED__) return;
  window.__RAMAX_WIDGET_LOADED__ = true;

  var script = document.currentScript || document.querySelector('script[data-ramax-key]');
  if (!script) return;
  var publicKey = script.getAttribute('data-ramax-key');
  if (!publicKey) return;

  var PANEL_ORIGIN = ${JSON.stringify(panelOrigin)};
  var isOpen = false;

  var container = document.createElement('div');
  container.id = 'ramax-widget-root';
  container.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:2147483000;font-family:Vazirmatn,sans-serif;direction:rtl;';

  var iframe = document.createElement('iframe');
  iframe.src = PANEL_ORIGIN + '/widget/frame?key=' + encodeURIComponent(publicKey) + '&host=' + encodeURIComponent(window.location.hostname);
  iframe.title = 'پشتیبانی آنلاین راماکس';
  iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms');
  iframe.style.cssText = 'display:none;width:390px;max-width:calc(100vw - 24px);height:600px;max-height:calc(100vh - 96px);border:0;border-radius:16px;box-shadow:0 20px 50px rgba(15,23,42,0.22);background:#fff;margin-bottom:12px;';

  var btn = document.createElement('button');
  btn.type = 'button';
  btn.setAttribute('aria-label', 'باز کردن گفتگوی پشتیبانی راماکس');
  btn.textContent = 'پشتیبانی آنلاین';
  btn.style.cssText = 'height:52px;padding:0 20px;border-radius:999px;border:0;background:#1d4ed8;color:#fff;font-size:14px;font-weight:600;cursor:pointer;box-shadow:0 12px 30px rgba(29,78,216,0.35);display:flex;align-items:center;gap:8px;margin-right:auto;';

  btn.addEventListener('click', function () {
    isOpen = !isOpen;
    iframe.style.display = isOpen ? 'block' : 'none';
    btn.textContent = isOpen ? 'بستن گفتگو' : 'پشتیبانی آنلاین';
    if (isOpen && iframe.contentWindow) {
      iframe.contentWindow.postMessage({ type: 'RAMAX_HOST_OPENED', path: window.location.pathname }, PANEL_ORIGIN);
    }
  });

  window.addEventListener('message', function (event) {
    if (event.origin !== PANEL_ORIGIN) return;
    if (!event.data || typeof event.data !== 'object') return;
    if (event.data.type === 'RAMAX_WIDGET_CONFIG' && event.data.config) {
      var cfg = event.data.config;
      if (cfg.primaryColor) btn.style.background = cfg.primaryColor;
      if (cfg.position === 'bottom-left') {
        container.style.right = 'auto';
        container.style.left = (cfg.edgeOffsetPx || 20) + 'px';
      } else {
        container.style.left = 'auto';
        container.style.right = (cfg.edgeOffsetPx || 20) + 'px';
      }
      container.style.bottom = (cfg.edgeOffsetPx || 20) + 'px';
      if (cfg.widgetEnabled === false) {
        container.style.display = 'none';
      }
    }
    if (event.data.type === 'RAMAX_WIDGET_CLOSE') {
      isOpen = false;
      iframe.style.display = 'none';
      btn.textContent = 'پشتیبانی آنلاین';
    }
  });

  container.appendChild(iframe);
  container.appendChild(btn);
  document.body.appendChild(container);
})();
`;
}
