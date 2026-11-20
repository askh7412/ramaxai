export const RAMAX_OPENAPI_SPEC = {
  openapi: '3.1.0',
  info: {
    title: 'RAMAX Platform Integration API',
    version: '1.0.0',
    description:
      'قرارداد مشترک API راماکس برای اتصال امن سایت‌ها و فروشگاه‌ها (WordPress/WooCommerce, PrestaShop, Django, Laravel). کلید محرمانه سایت فقط در سمت سرور نگهداری می‌شود.',
  },
  servers: [
    {
      url: 'https://panel.ramax.ramalife.cloud/api/v1',
      description: 'سرور تولید راماکس (قابل تنظیم از تنظیمات دامنه)',
    },
  ],
  components: {
    securitySchemes: {
      SiteApiKey: {
        type: 'http',
        scheme: 'bearer',
        description: 'کلید محرمانه سرور سایت — هرگز در کد فرانت‌اند یا مرورگر قرار نگیرد.',
      },
    },
    schemas: {
      ErrorResponse: {
        type: 'object',
        required: ['code', 'message', 'requestId'],
        properties: {
          code: { type: 'string', example: 'SITE_ACTIVATION_REQUIRED' },
          message: { type: 'string', example: 'حساب تجاری هنوز فعال نشده است.' },
          requestId: { type: 'string', example: 'req_9f812a' },
        },
      },
      ProductAssistRequest: {
        type: 'object',
        required: ['field', 'productName'],
        properties: {
          field: { type: 'string', enum: ['title', 'description', 'seo_meta', 'image_check'] },
          productName: { type: 'string' },
          currentText: { type: 'string' },
          specs: { type: 'object' },
          modelId: { type: 'string', example: 'ramax-writer' },
        },
      },
      WebhookSignatureHeader: {
        type: 'string',
        description: 'X-Ramax-Signature: t=<unix>,v1=<hmac_sha256(t + "." + rawBody, webhookSecret)>',
      },
    },
  },
  paths: {
    '/v1/sites/verify': {
      post: {
        summary: 'تست اتصال سرور سایت و دریافت سایت متصل و مدل پیش‌فرض',
        security: [{ SiteApiKey: [] }],
        responses: {
          '200': { description: 'اتصال معتبر است و شناسه سایت و مدل پیش‌فرض برگردانده می‌شود.' },
          '401': { description: 'کلید نامعتبر یا لغوشده' },
          '403': { description: 'عدم تطابق دامنه یا فعال‌نشدن حساب تجاری' },
        },
      },
    },
    '/v1/content/product-assist': {
      post: {
        summary: 'تولید پیشنهاد برای عنوان، توضیحات، متادیتای محصول (پیش‌نویس نیازمند تأیید کاربر)',
        security: [{ SiteApiKey: [] }],
        requestBody: {
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ProductAssistRequest' },
            },
          },
        },
        responses: {
          '200': { description: 'پیشنهاد تولید شده به همراه هزینه رزرو و تسویه' },
        },
      },
    },
    '/v1/widget/session': {
      post: {
        summary: 'صدور نشست کوتاه‌عمر بازدیدکننده فقط با شناسه عمومی نصب (بدون کلید محرمانه)',
        responses: {
          '200': { description: 'توکن کوتاه‌عمر ویجت + تنظیمات ظاهری سایت' },
        },
      },
    },
  },
};

export interface PluginPackageGuide {
  id: 'wordpress' | 'prestashop' | 'django' | 'laravel';
  name: string;
  compatibility: string;
  testStatusFa: string;
  installStepsFa: string[];
  troubleshootingFa: string[];
  codeFileName: string;
  codeLanguage: string;
  codeSnippet: string;
}

export const PLUGIN_GUIDES: PluginPackageGuide[] = [
  {
    id: 'wordpress',
    name: 'افزونه WordPress و WooCommerce',
    compatibility: 'WordPress 6.4+ · WooCommerce 8.5+ · PHP 8.1+',
    testStatusFa: 'بسته نمونه قرارداد و کد آماده — نیازمند اجرای آزمون نصب در محیط WordPress واقعی پیش از انتشار نهایی',
    installStepsFa: [
      'فایل ZIP افزونه ramax-woocommerce.zip را از بخش افزونه‌ها ← افزودن ← بارگذاری افزونه نصب و فعال کنید.',
      'در پیشخوان وردپرس به منوی «راماکس» بروید و کلید سرور سایت (فقط سمت سرور) و شناسه عمومی ویجت را وارد کنید.',
      'دکمه «تست اتصال» را بزنید تا دامنه، نام سایت متصل و مدل پیش‌فرض راماکس نمایش داده شود.',
      'در صفحه ایجاد یا ویرایش محصول ووکامرس، دکمه کوچک «راماکس» کنار عنوان، توضیحات و متادیتا فعال می‌شود؛ پیشنهاد را بررسی و در صورت تأیید جایگذاری کنید.',
      'برای غیرفعالسازی امن: ابتدا ویجت را در تنظیمات افزونه خاموش کنید، سپس کلید را از پنل راماکس لغو (Revoke) نمایید.',
    ],
    troubleshootingFa: [
      'خطای ۴۰۳ دامنه: مطمئن شوید دامنه ثبت‌شده در پنل راماکس دقیقاً با نشانی WordPress مطابقت دارد.',
      'خطای ۴۰۱ کلید: کلید محرمانه ممکن است چرخش (Rotate) یا لغو شده باشد؛ کلید جدید را در تنظیمات ذخیره کنید.',
      'بررسی CSRF: همه درخواست‌های پیش‌نویس محصول از wp_verify_nonce و current_user_can("edit_products") عبور می‌کنند.',
    ],
    codeFileName: 'ramax-woocommerce.php',
    codeLanguage: 'php',
    codeSnippet: `<?php
/**
 * Plugin Name: RAMAX AI & Support for WooCommerce
 * Description: ویجت چت امن راماکس و دستیار تولید محتوای محصول با بررسی Nonce و کلید سمت سرور.
 * Version: 1.0.0
 */
if (!defined('ABSPATH')) exit;

// 1. Mount public widget iframe loader only using public_install_key (never secret key)
add_action('wp_footer', function () {
    $public_key = get_option('ramax_public_install_key', '');
    $widget_on  = get_option('ramax_widget_enabled', '1');
    if (!$public_key || $widget_on !== '1') return;
    $panel_host = esc_url(get_option('ramax_panel_origin', 'https://panel.ramax.ramalife.cloud'));
    echo '<script async src="' . $panel_host . '/widget/embed.js" data-ramax-key="' . esc_attr($public_key) . '"></script>';
});

// 2. Server-side AJAX proxy with WordPress CSRF Nonce + capability check
add_action('wp_ajax_ramax_product_assist', function () {
    check_ajax_referer('ramax_wc_nonce', 'nonce');
    if (!current_user_can('edit_products')) {
        wp_send_json_error(['message' => 'دسترسی ویرایش محصول وجود ندارد.'], 403);
    }
    $secret_key = get_option('ramax_server_api_key', '');
    $response = wp_remote_post(trailingslashit(get_option('ramax_api_base')) . 'v1/content/product-assist', [
        'headers' => [
            'Authorization' => 'Bearer ' . $secret_key,
            'Content-Type'  => 'application/json',
        ],
        'body' => wp_json_encode([
            'field'       => sanitize_text_field($_POST['field'] ?? 'description'),
            'productName' => sanitize_text_field($_POST['productName'] ?? ''),
            'currentText' => wp_kses_post($_POST['currentText'] ?? ''),
        ]),
        'timeout' => 25,
    ]);
    if (is_wp_error($response)) {
        wp_send_json_error(['message' => $response->get_error_message()], 502);
    }
    wp_send_json_success(json_decode(wp_remote_retrieve_body($response), true));
});`,
  },
  {
    id: 'prestashop',
    name: 'ماژول PrestaShop',
    compatibility: 'PrestaShop 8.0 – 8.2 · PHP 8.1+',
    testStatusFa: 'ساختار ماژول استاندارد — نیازمند نصب و تأیید در Back Office پرستاشاپ واقعی پیش از انتشار',
    installStepsFa: [
      'بسته ماژول ramaxconnector.zip را در بخش Modules ← Module Manager بارگذاری و نصب کنید.',
      'در صفحه پیکربندی Back Office، کلید سرور سایت و شناسه عمومی ویجت را ذخیره و «تست اتصال» را اجرا نمایید.',
      'هوک displayBeforeBodyClosingTag به‌صورت خودکار اسکریپت ویجت عمومی را بدون قرار دادن کلید محرمانه تزریق می‌کند.',
      'در فرم ویرایش محصول، همگام‌سازی توضیحات و قیمت ابتدا پیش‌نمایش اختلاف (Diff) و سقف تغییر را نمایش می‌دهد و پس از تأیید ذخیره می‌شود.',
    ],
    troubleshootingFa: [
      'پاکسازی کش Smarty و Symfony در Advanced Parameters ← Performance پس از نصب ماژول ضروری است.',
      'تغییر قیمت خودکار بدون تأیید مدیر مسدود است و تاریخچه تغییرات در جدول ps_ramax_price_audit ثبت می‌شود.',
    ],
    codeFileName: 'ramaxconnector.php',
    codeLanguage: 'php',
    codeSnippet: `<?php
if (!defined('_PS_VERSION_')) exit;

class RamaxConnector extends Module {
    public function __construct() {
        $this->name = 'ramaxconnector';
        $this->tab = 'front_office_features';
        $this->version = '1.0.0';
        $this->ps_versions_compliancy = ['min' => '8.0.0', 'max' => _PS_VERSION_];
        parent::__construct();
        $this->displayName = 'RAMAX AI & Support';
    }

    public function install() {
        return parent::install()
            && $this->registerHook('displayBeforeBodyClosingTag')
            && $this->registerHook('displayAdminProductsExtra');
    }

    public function hookDisplayBeforeBodyClosingTag() {
        $publicKey = Configuration::get('RAMAX_PUBLIC_INSTALL_KEY');
        if (!$publicKey || !Configuration::get('RAMAX_WIDGET_ENABLED')) return '';
        $origin = Configuration::get('RAMAX_PANEL_ORIGIN');
        return '<script async src="' . htmlspecialchars($origin) . '/widget/embed.js" data-ramax-key="' . htmlspecialchars($publicKey) . '"></script>';
    }
}`,
  },
  {
    id: 'django',
    name: 'بسته Django',
    compatibility: 'Django 4.2 / 5.0+ · Python 3.11+',
    testStatusFa: 'کد مرجع بسته و پراکسی امن — نیازمند اجرای pytest در پروژه Django هدف',
    installStepsFa: [
      'متغیرهای RAMAX_SERVER_API_KEY و RAMAX_PUBLIC_INSTALL_KEY و RAMAX_WEBHOOK_SECRET را در settings.py از محیط بخوانید.',
      'مسیر پراکسی امن را پشت @staff_member_required و CSRF Middleware ثبت کنید.',
      'تگ قالب {% ramax_widget %} را پیش از </body> قرار دهید تا فقط شناسه عمومی ارسال شود.',
      'در Django Admin اکشن «پیشنهاد راماکس» برای پیش‌نویس محصول یا مقاله اضافه می‌شود و بدون تأیید کاربر منتشر نمی‌شود.',
    ],
    troubleshootingFa: [
      'کلید RAMAX_SERVER_API_KEY را هرگز وارد Template Context نکنید.',
      'امضای وبهوک X-Ramax-Signature را با hmac.compare_digest بررسی کنید.',
    ],
    codeFileName: 'ramax_django/views.py',
    codeLanguage: 'python',
    codeSnippet: `import hmac, hashlib, json, urllib.request
from django.conf import settings
from django.http import JsonResponse, HttpResponseForbidden
from django.contrib.admin.views.decorators import staff_member_required
from django.views.decorators.http import require_POST

@staff_member_required
@require_POST
def ramax_product_assist_proxy(request):
    payload = json.loads(request.body.decode("utf-8"))
    req = urllib.request.Request(
        f"{settings.RAMAX_API_BASE}/v1/content/product-assist",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {settings.RAMAX_SERVER_API_KEY}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=25) as resp:
        return JsonResponse(json.loads(resp.read().decode("utf-8")))

def verify_ramax_webhook(request):
    sig_header = request.headers.get("X-Ramax-Signature", "")
    # Format: t=<unix>,v1=<hex>
    parts = dict(item.split("=", 1) for item in sig_header.split(",") if "=" in item)
    signed = f"{parts.get('t','')}.{request.body.decode('utf-8')}".encode("utf-8")
    expected = hmac.new(settings.RAMAX_WEBHOOK_SECRET.encode(), signed, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, parts.get("v1", "")):
        return HttpResponseForbidden("Invalid signature")
    return JsonResponse({"ok": True})`,
  },
  {
    id: 'laravel',
    name: 'پکیج Composer برای Laravel',
    compatibility: 'Laravel 10 / 11 · PHP 8.2+',
    testStatusFa: 'پکیج مرجع با ServiceProvider و Job صف — نیازمند اجرای php artisan test در پروژه Laravel',
    installStepsFa: [
      'پکیج را نصب و فایل پیکربندی را با php artisan vendor:publish --tag=ramax-config منتشر کنید.',
      'کلید سرور را در .env با نام RAMAX_SERVER_API_KEY ثبت کنید (خارج از VITE_* تا به فرانت نشت نکند).',
      'کامپوننت Blade <x-ramax-widget /> را پیش از </body> قرار دهید.',
      'مسیر پراکسی را پشت middleware(["auth", "can:manage-products"]) بگذارید و برای کارهای زمان‌بر از RamaxContentJob استفاده کنید.',
    ],
    troubleshootingFa: [
      'برای وبهوک‌های راماکس از میدل‌ویر VerifyRamaxWebhookSignature پیش از پردازش صف استفاده کنید.',
      'پس از تغییر کلید در پنل راماکس، دستور php artisan config:clear را اجرا کنید.',
    ],
    codeFileName: 'RamaxServiceProvider.php',
    codeLanguage: 'php',
    codeSnippet: `<?php
namespace Ramax\\Laravel;

use Illuminate\\Support\\ServiceProvider;
use Illuminate\\Support\\Facades\\Http;
use Illuminate\\Support\\Facades\\Route;

class RamaxServiceProvider extends ServiceProvider {
    public function boot(): void {
        $this->publishes([__DIR__ . '/../config/ramax.php' => config_path('ramax.php')], 'ramax-config');

        Route::middleware(['web', 'auth'])->prefix('ramax-proxy')->group(function () {
            Route::post('/product-assist', function (\\Illuminate\\Http\\Request $request) {
                abort_unless($request->user()->can('edit-products'), 403);
                $res = Http::withToken(config('ramax.server_api_key'))
                    ->timeout(25)
                    ->post(config('ramax.api_base') . '/v1/content/product-assist', $request->validated());
                return response()->json($res->json(), $res->status());
            });
        });
    }
}`,
  },
];
