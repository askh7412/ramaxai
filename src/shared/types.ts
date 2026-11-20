export type UserRole =
  | 'super_admin'
  | 'owner'
  | 'site_manager'
  | 'support_supervisor'
  | 'operator'
  | 'writer'
  | 'finance'
  | 'viewer';

export type AccountStatus = 'pending_activation' | 'active' | 'suspended';

export interface RolePermissionMatrix {
  role: UserRole;
  labelFa: string;
  descriptionFa: string;
  permissions: string[];
}

export const ROLE_PERMISSIONS: RolePermissionMatrix[] = [
  {
    role: 'owner',
    labelFa: 'مالک حساب',
    descriptionFa: 'دسترسی کامل به سایت‌ها، تیم، کیف پول، کلیدهای API، قراردادها و تنظیمات',
    permissions: [
      'sites:manage',
      'support:manage',
      'team:manage',
      'models:use',
      'content:publish',
      'automation:manage',
      'contracts:finalize',
      'wallet:manage',
      'settings:manage',
      'files:delete',
    ],
  },
  {
    role: 'site_manager',
    labelFa: 'مدیر سایت',
    descriptionFa: 'مدیریت تنظیمات سایت مجاز، ویجت، اتوماسیون، محتوا و تیم پشتیبانی آن سایت',
    permissions: [
      'sites:edit',
      'support:manage',
      'team:invite',
      'models:use',
      'content:publish',
      'automation:manage',
      'contracts:create',
      'settings:site',
    ],
  },
  {
    role: 'support_supervisor',
    labelFa: 'سرپرست پشتیبانی',
    descriptionFa: 'مدیریت صف‌ها، ارجاع گفتگوها، تنظیم دپارتمان‌ها، پاسخدهی و مشاهده گزارش پشتیبانی',
    permissions: [
      'support:manage',
      'support:transfer',
      'support:archive',
      'support:notes',
      'contracts:create',
      'departments:edit',
    ],
  },
  {
    role: 'operator',
    labelFa: 'اپراتور پاسخگویی',
    descriptionFa: 'پاسخ به مشتریان، دریافت گفتگو، ثبت یادداشت داخلی و ارجاع به دپارتمان دیگر',
    permissions: ['support:reply', 'support:transfer', 'support:notes'],
  },
  {
    role: 'writer',
    labelFa: 'نویسنده محتوا',
    descriptionFa: 'تولید و ویرایش پیش‌نویس محتوا، توضیحات محصول و سئو با ابزار هوش مصنوعی',
    permissions: ['models:use', 'content:draft'],
  },
  {
    role: 'finance',
    labelFa: 'امور مالی',
    descriptionFa: 'مشاهده تراکنش‌ها، ثبت درخواست شارژ کیف پول، بررسی رسیدها و پیش‌نمایش قراردادها',
    permissions: ['wallet:view', 'wallet:topup', 'contracts:view', 'support:view_finance'],
  },
  {
    role: 'viewer',
    labelFa: 'مشاهده‌گر',
    descriptionFa: 'دسترسی فقط‌خواندنی به گزارش‌ها و وضعیت سایت‌های مجاز',
    permissions: ['dashboard:view', 'support:view'],
  },
];

export interface PlatformSettings {
  domains: {
    mainDomain: string;
    aiDomain: string;
    panelDomain: string;
    controlDomain: string;
  };
  legal: {
    proposedLegalName: string;
    proposedLegalWebsite: string;
    confirmedByOwner: boolean;
    confirmedAt?: string;
    contactEmail: string;
    contactPhone: string;
    supportAddressFa: string;
  };
  pricing: {
    tariffVersion: string;
    markupMultiplier: number; // default 3x
    taxPercent: number; // default 10%
    usdToTomanRate: number;
    plansConfigured: boolean;
  };
  trialPolicy: {
    trialDays: number; // default 14
    dailyTextLimit: number; // default 20
    dailyImageLimit: number; // default 2
    resetHourTehran: number;
  };
  globalAiRules: string;
  dataRetentionDays: number;
  backupSchedule: string;
}

export interface PublicModelInfo {
  id: string;
  publicName: string;
  icon: string;
  category: 'fast' | 'writing' | 'coding' | 'analysis' | 'document' | 'vision' | 'image_gen' | 'studio';
  descriptionFa: string;
  inputTypes: ('text' | 'image' | 'document')[];
  capabilitiesFa: string[];
  pricingTierFa: string;
  quotaType: 'text' | 'image';
  enabled: boolean;
  pipelineReady: boolean;
  pipelineNoteFa?: string;
  salePricePer1kTokensToman?: number;
  salePricePerImageToman?: number;
}

export interface AdminModelConfig extends PublicModelInfo {
  provider: 'gemini' | 'arvan' | 'image_provider';
  internalModelId: string;
  pricingGroup: string;
  baseInputCostUsdPer1M: number;
  baseOutputCostUsdPer1M: number;
  imageUnitBaseCostUsd: number;
  allowedSiteIds: string[] | 'all';
  lastSyncedAt: string;
}

export interface WidgetConfig {
  primaryColor: string;
  logoText: string;
  iconStyle: 'chat' | 'headset' | 'message';
  position: 'bottom-right' | 'bottom-left';
  edgeOffsetPx: number;
  welcomeTitle: string;
  welcomeMessage: string;
  workingHoursText: string;
  isWithinWorkingHours: boolean;
  offlineMessage: string;
  selectableDepartmentIds: string[];
  showOnMobile: boolean;
  widgetEnabled: boolean;
  autoReplyEnabled: boolean;
  allowedPagePaths: string;
}

export interface SiteRecord {
  id: string;
  ownerUserId: string;
  name: string;
  domain: string;
  businessTopic: string;
  tone: string;
  contentGoal: string;
  responseRules: string;
  trustedSources: string[];
  defaultModelId: string;
  publicInstallKey: string;
  apiKeyPrefix: string;
  installVerified: boolean;
  installVerificationSteps: {
    widgetSeen: boolean;
    testMessageSent: boolean;
    receivedInDesk: boolean;
    operatorReplied: boolean;
  };
  widgetConfig: WidgetConfig;
  walletBalanceToman: number;
  walletReservedToman: number;
  webhookUrl: string;
  webhookSecretPrefix: string;
  isDemo?: boolean;
  createdAt: string;
}

export interface DepartmentRecord {
  id: string;
  siteId: string;
  name: string;
  slug: string;
  memberIds: string[];
  workingHours: string;
  routingOrder: number;
  fallbackUserId?: string;
  isDemo?: boolean;
}

export type ConversationStatus =
  | 'new'
  | 'queued'
  | 'in_progress'
  | 'waiting_customer'
  | 'resolved'
  | 'archived';

export type ReplyMode = 'human_only' | 'ai_suggest' | 'auto_reply';

export interface AttachmentRecord {
  id: string;
  siteId: string;
  conversationId?: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  scanStatus: 'clean' | 'quarantined' | 'scanning';
  uploadedBy: string;
  uploadedAt: string;
  downloadCount: number;
}

export interface SupportMessage {
  id: string;
  clientMessageId?: string;
  conversationId: string;
  senderType: 'visitor' | 'operator' | 'ai' | 'system';
  senderName: string;
  senderUserId?: string;
  body: string;
  isInternalNote: boolean;
  deliveryStatus: 'sending' | 'sent' | 'delivered' | 'failed';
  attachments: AttachmentRecord[];
  createdAt: string;
}

export interface TransferEvent {
  id: string;
  timestamp: string;
  actorName: string;
  actionFa: string;
  fromValue?: string;
  toValue?: string;
}

export interface ConversationRecord {
  id: string;
  ticketNumber: string;
  siteId: string;
  departmentId: string;
  assignedUserId?: string;
  visitorName: string;
  visitorContact: string;
  visitorSessionId: string;
  subject: string;
  status: ConversationStatus;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  replyMode: ReplyMode;
  tags: string[];
  unreadCount: number;
  sentimentAlert?: 'unhappy' | null;
  detectedTopic?: string;
  summaryFa?: string;
  firstResponseSeconds?: number;
  followUpAt?: string;
  rating?: number;
  ratingComment?: string;
  createdAt: string;
  updatedAt: string;
  messages: SupportMessage[];
  history: TransferEvent[];
  isDemo?: boolean;
}

export interface AutomationRule {
  id: string;
  siteId: string;
  name: string;
  version: number;
  enabled: boolean;
  trigger:
    | 'conversation_created'
    | 'file_uploaded'
    | 'unanswered_timeout'
    | 'contract_requested'
    | 'after_hours'
    | 'content_schedule'
    | 'price_sync_source';
  conditionSummaryFa: string;
  conditionConfig: Record<string, string | number | boolean>;
  actionType:
    | 'route_department'
    | 'create_finance_task'
    | 'notify_supervisor'
    | 'create_contract_draft'
    | 'send_offline_message'
    | 'generate_content_draft'
    | 'preview_price_update';
  actionSummaryFa: string;
  actionConfig: Record<string, string | number | boolean>;
  requiresExplicitApproval: boolean;
  lastRunAt?: string;
  runCount: number;
  isDemo?: boolean;
}

export interface AutomationRunLog {
  id: string;
  ruleId: string;
  ruleName: string;
  ruleVersion: number;
  siteId: string;
  status: 'success' | 'failed' | 'halted' | 'dry_run' | 'awaiting_approval';
  inputSummaryFa: string;
  outputSummaryFa: string;
  dedupeKey: string;
  createdAt: string;
}

export type ContractStatus =
  | 'draft'
  | 'review'
  | 'ready_to_send'
  | 'sent'
  | 'approved'
  | 'archived';

export interface ContractVersion {
  version: number;
  title: string;
  bodyFa: string;
  amountToman: number;
  durationText: string;
  termsFa: string;
  editedBy: string;
  createdAt: string;
  noteFa: string;
}

export interface ContractRecord {
  id: string;
  contractNumber: string;
  siteId: string;
  conversationId?: string;
  customerName: string;
  customerContact: string;
  templateName: string;
  title: string;
  amountToman: number;
  durationText: string;
  status: ContractStatus;
  currentVersion: number;
  versions: ContractVersion[];
  shareToken: string;
  viewedAt?: string;
  acceptedAt?: string;
  acceptedByName?: string;
  aiDrafted: boolean;
  digitalSignatureConnected: boolean;
  createdAt: string;
  updatedAt: string;
  isDemo?: boolean;
}

export interface WalletTransaction {
  id: string;
  siteId?: string;
  userId: string;
  idempotencyKey: string;
  type: 'reserve' | 'settle' | 'release' | 'topup' | 'ai_usage';
  status: 'reserved' | 'settled' | 'released' | 'failed';
  amountToman: number;
  baseCostUsd?: number;
  markupMultiplier?: number;
  taxToman?: number;
  tariffVersion: string;
  modelId?: string;
  descriptionFa: string;
  createdAt: string;
}

export interface ManualPaymentRequest {
  id: string;
  siteId?: string;
  userId: string;
  userName: string;
  method: 'card_to_card' | 'crypto' | 'payment_link';
  amountToman: number;
  trackingCodeOrTxId: string;
  networkOrBank?: string;
  noteFa?: string;
  status: 'pending_review' | 'approved' | 'rejected';
  decisionHistory: {
    decidedBy: string;
    status: 'approved' | 'rejected';
    reasonFa: string;
    decidedAt: string;
  }[];
  createdAt: string;
}

export interface AiChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  modelId?: string;
  modelPublicName?: string;
  attachmentName?: string;
  attachmentMime?: string;
  tokensEstimate?: number;
  error?: string;
  createdAt: string;
}

export interface AiChatThread {
  id: string;
  userId: string;
  title: string;
  modelId: string;
  archived: boolean;
  messages: AiChatMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface TrialQuotaStatus {
  trialActive: boolean;
  trialExpired: boolean;
  trialStartedAt: string;
  trialEndsAt: string;
  daysRemaining: number;
  dateKey: string;
  dailyTextLimit: number;
  dailyTextUsed: number;
  dailyTextReserved: number;
  dailyImageLimit: number;
  dailyImageUsed: number;
  dailyImageReserved: number;
  nextResetAt: string;
  hasCommercialAccess: boolean;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  actorUserId: string;
  actorUsername: string;
  actorRole: UserRole;
  siteId?: string;
  category: 'auth' | 'permission' | 'finance' | 'apikey' | 'file' | 'settings' | 'contract' | 'automation';
  action: string;
  summaryFa: string;
  ipAddress: string;
}

export interface SessionUser {
  id: string;
  name: string;
  username: string;
  email: string;
  role: UserRole;
  accountStatus: AccountStatus;
  allowedSiteIds: string[];
  departmentIds: string[];
  mustChangePassword: boolean;
  hasSecurityQuestion: boolean;
  mfaEnabled: boolean;
  createdAt: string;
}
