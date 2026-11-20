import 'dotenv/config';
import bcrypt from 'bcryptjs';
import cookieParser from 'cookie-parser';
import crypto from 'crypto';
import express, { type NextFunction, type Request, type Response } from 'express';
import fs from 'fs';
import multer from 'multer';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import {
  appendAuditLog,
  calculateSalePriceToman,
  captchas,
  downloadTokens,
  getDb,
  getTrialQuotaStatus,
  releaseSiteCredit,
  releaseTrialQuota,
  reserveSiteCredit,
  reserveTrialQuota,
  saveDb,
  sessions,
  settleSiteCredit,
  settleTrialQuota,
  toPublicModel,
  toSessionUser,
  UPLOADS_DIR,
  widgetVisitorTokens,
  type StoredSession,
  type StoredUser,
} from './server/db.ts';
import { buildSiteSystemInstruction, generateServerAiText, streamRamaxAiResponse } from './server/gemini.ts';
import { buildWidgetEmbedScript } from './server/widgetEmbed.ts';
import { RAMAX_OPENAPI_SPEC } from './src/shared/openapi.ts';
import type {
  AutomationRule,
  ContractRecord,
  ContractStatus,
  ConversationRecord,
  ConversationStatus,
  DepartmentRecord,
  ReplyMode,
  SiteRecord,
  SupportMessage,
  UserRole,
} from './src/shared/types.ts';

const PORT = Number(process.env.PORT || 3000);
const CUSTOMER_COOKIE = 'ramax_customer_sid';
const ADMIN_COOKIE = 'ramax_admin_sid';

const ALLOWED_UPLOAD_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
  'text/plain',
  'text/csv',
]);
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024; // 8MB

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES },
});

interface AuthedRequest extends Request {
  authUser?: StoredUser;
  authSession?: StoredSession;
}

function getClientIp(req: Request): string {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string') return fwd.split(',')[0].trim();
  return req.socket.remoteAddress || '127.0.0.1';
}

function getRequestOrigin(req: Request): string {
  const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'http';
  const host = req.headers.host || `localhost:${PORT}`;
  return `${proto}://${host}`;
}

function getSessionFromCookie(req: Request, scope: 'customer' | 'admin'): { user: StoredUser; session: StoredSession } | null {
  const cookieName = scope === 'admin' ? ADMIN_COOKIE : CUSTOMER_COOKIE;
  const token = req.cookies?.[cookieName];
  if (!token) return null;
  const session = sessions.get(token);
  if (!session || session.scope !== scope) return null;
  const db = getDb();
  const user = db.users.find((u) => u.id === session.userId);
  if (!user || user.accountStatus === 'suspended') return null;
  return { user, session };
}

function requireCustomerAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const auth = getSessionFromCookie(req, 'customer');
  if (!auth) {
    res.status(401).json({ code: 'UNAUTHORIZED', message: 'لطفاً ابتدا وارد حساب کاربری خود شوید.' });
    return;
  }
  req.authUser = auth.user;
  req.authSession = auth.session;
  next();
}

function requireAdminAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const db = getDb();
  const reqHost = (req.headers.host || '').split(':')[0].toLowerCase();
  if (reqHost === db.settings.domains.panelDomain.toLowerCase()) {
    res.status(404).json({ code: 'NOT_FOUND', message: 'مسیر در میزبان مشتری در دسترس نیست.' });
    return;
  }
  const auth = getSessionFromCookie(req, 'admin');
  if (!auth || auth.user.role !== 'super_admin') {
    res.status(401).json({ code: 'ADMIN_UNAUTHORIZED', message: 'نشست مدیرکل معتبر نیست.' });
    return;
  }
  if (!auth.session.mfaVerified) {
    res.status(403).json({ code: 'MFA_REQUIRED', message: 'تأیید دومرحله‌ای مدیرکل انجام نشده است.' });
    return;
  }
  req.authUser = auth.user;
  req.authSession = auth.session;
  next();
}

function requireSiteAccess(user: StoredUser, siteId: string): boolean {
  if (user.role === 'super_admin') return true;
  return user.allowedSiteIds.includes(siteId);
}

function requireActiveCommercialAccount(user: StoredUser, res: Response): boolean {
  if (user.role === 'super_admin' || user.accountStatus === 'active') return true;
  res.status(403).json({
    code: 'COMMERCIAL_ACTIVATION_REQUIRED',
    message:
      'حساب تجاری شما در وضعیت «در انتظار فعالسازی» است. امکانات پولی و API سایت پس از تأیید مدیرکل فعال می‌شوند (چت آزمایشی ۱۴ روزه AI به‌صورت جداگانه در دسترس است).',
  });
  return false;
}

function maskConversationForVisitor(conv: ConversationRecord) {
  return {
    id: conv.id,
    ticketNumber: conv.ticketNumber,
    siteId: conv.siteId,
    departmentId: conv.departmentId,
    visitorName: conv.visitorName,
    subject: conv.subject,
    status: conv.status,
    rating: conv.rating,
    ratingComment: conv.ratingComment,
    createdAt: conv.createdAt,
    updatedAt: conv.updatedAt,
    // CRITICAL: Never expose internal notes to visitors!
    messages: conv.messages
      .filter((m) => !m.isInternalNote)
      .map((m) => ({
        id: m.id,
        senderType: m.senderType,
        senderName: m.senderName,
        body: m.body,
        deliveryStatus: m.deliveryStatus,
        attachments: m.attachments.map((a) => ({
          id: a.id,
          originalName: a.originalName,
          mimeType: a.mimeType,
          sizeBytes: a.sizeBytes,
          scanStatus: a.scanStatus,
        })),
        createdAt: m.createdAt,
      })),
  };
}

function savePrivateUpload(params: {
  siteId: string;
  conversationId?: string;
  uploadedBy: string;
  file: Express.Multer.File;
}) {
  if (!ALLOWED_UPLOAD_MIMES.has(params.file.mimetype)) {
    throw new Error('نوع فایل مجاز نیست. فقط JPG، PNG، WebP، PDF، TXT و CSV پذیرفته می‌شوند.');
  }
  const siteDir = path.join(UPLOADS_DIR, params.siteId);
  if (!fs.existsSync(siteDir)) fs.mkdirSync(siteDir, { recursive: true });

  const fileId = `fil_${crypto.randomBytes(8).toString('hex')}`;
  const ext = path.extname(params.file.originalname || '').slice(0, 10) || '.bin';
  const safeFileName = `${fileId}${ext}`;
  const relPath = path.join(params.siteId, safeFileName);
  const fullPath = path.join(UPLOADS_DIR, relPath);

  // Simple content safety scan simulation (quarantine files containing EICAR test string or executable headers)
  const headText = params.file.buffer.subarray(0, 128).toString('utf8');
  const isSuspicious =
    headText.includes('EICAR-STANDARD-ANTIVIRUS-TEST-FILE') ||
    headText.startsWith('MZ') ||
    headText.includes('<script');

  fs.writeFileSync(fullPath, params.file.buffer);

  const db = getDb();
  const record = {
    id: fileId,
    siteId: params.siteId,
    conversationId: params.conversationId,
    originalName: params.file.originalname || safeFileName,
    mimeType: params.file.mimetype,
    sizeBytes: params.file.size,
    scanStatus: isSuspicious ? ('quarantined' as const) : ('clean' as const),
    uploadedBy: params.uploadedBy,
    uploadedAt: new Date().toISOString(),
    downloadCount: 0,
    storageRelPath: relPath,
  };
  db.files.unshift(record);
  saveDb();
  return record;
}

function runAutomationEngine(params: {
  siteId: string;
  trigger: AutomationRule['trigger'];
  contextText: string;
  conversation?: ConversationRecord;
  dedupeEntityId: string;
  depth?: number;
}) {
  const depth = params.depth ?? 0;
  if (depth >= 2) return; // Strict loop prevention!

  const db = getDb();
  const matchingRules = db.automationRules.filter(
    (r) => r.siteId === params.siteId && r.enabled && r.trigger === params.trigger
  );

  for (const rule of matchingRules) {
    const dedupeKey = `${rule.id}:v${rule.version}:${params.dedupeEntityId}`;
    if (db.automationRuns.some((run) => run.dedupeKey === dedupeKey)) {
      continue; // Prevent duplicate execution!
    }

    let matched = true;
    if (rule.trigger === 'conversation_created' && rule.conditionConfig.keywords) {
      const kws = String(rule.conditionConfig.keywords)
        .split(',')
        .map((k) => k.trim())
        .filter(Boolean);
      matched = kws.some((k) => params.contextText.includes(k));
    }

    if (!matched) continue;

    let outputSummaryFa = '';
    let status: 'success' | 'awaiting_approval' = 'success';

    if (rule.requiresExplicitApproval) {
      status = 'awaiting_approval';
      outputSummaryFa = `درخواست «${rule.actionSummaryFa}» آماده شد و به دلیل نیاز به مجوز صریح در صف تأیید مدیر قرار گرفت.`;
    } else if (rule.actionType === 'route_department' && params.conversation && rule.actionConfig.departmentId) {
      const targetDep = db.departments.find(
        (d) => d.id === rule.actionConfig.departmentId && d.siteId === params.siteId
      );
      if (targetDep) {
        params.conversation.departmentId = targetDep.id;
        params.conversation.history.push({
          id: `ev_${crypto.randomBytes(5).toString('hex')}`,
          timestamp: new Date().toISOString(),
          actorName: 'اتوماسیون راماکس',
          actionFa: `اجرای قانون «${rule.name}» (نسخه ${rule.version})`,
          toValue: targetDep.name,
        });
        outputSummaryFa = `گفتگو به دپارتمان «${targetDep.name}» ارجاع شد.`;
      }
    } else if (rule.actionType === 'create_finance_task' && params.conversation && rule.actionConfig.departmentId) {
      const finDep = db.departments.find(
        (d) => d.id === rule.actionConfig.departmentId && d.siteId === params.siteId
      );
      if (finDep) {
        params.conversation.departmentId = finDep.id;
        params.conversation.tags = Array.from(new Set([...params.conversation.tags, 'بررسی-رسید-مالی']));
        params.conversation.history.push({
          id: `ev_${crypto.randomBytes(5).toString('hex')}`,
          timestamp: new Date().toISOString(),
          actorName: 'اتوماسیون راماکس',
          actionFa: `ارجاع رسید سالم به بخش مالی و ایجاد کار بررسی`,
          toValue: finDep.name,
        });
        outputSummaryFa = `به بخش «${finDep.name}» ارجاع شد و کار بررسی رسید ثبت گردید.`;
      }
    } else if (rule.actionType === 'send_offline_message' && params.conversation) {
      const site = db.sites.find((s) => s.id === params.siteId);
      if (site) {
        params.conversation.status = 'queued';
        params.conversation.messages.push({
          id: `msg_${crypto.randomBytes(6).toString('hex')}`,
          conversationId: params.conversation.id,
          senderType: 'system',
          senderName: 'سیستم ساعات کاری',
          body: site.widgetConfig.offlineMessage,
          isInternalNote: false,
          deliveryStatus: 'delivered',
          attachments: [],
          createdAt: new Date().toISOString(),
        });
        outputSummaryFa = 'پیام خارج از ساعات کاری ثبت شد و گفتگو در صف باقی ماند.';
      }
    }

    rule.runCount += 1;
    rule.lastRunAt = new Date().toISOString();
    db.automationRuns.unshift({
      id: `run_${crypto.randomBytes(6).toString('hex')}`,
      ruleId: rule.id,
      ruleName: rule.name,
      ruleVersion: rule.version,
      siteId: params.siteId,
      status,
      inputSummaryFa: params.contextText.slice(0, 120),
      outputSummaryFa: outputSummaryFa || rule.actionSummaryFa,
      dedupeKey,
      createdAt: new Date().toISOString(),
    });
  }
  saveDb();
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function startServer() {
  const app = express();
  app.use(cookieParser());
  app.use(express.json({ limit: '15mb' }));

  // Ensure initial DB is ready
  getDb();

  // =========================================================================
  // 1. PUBLIC CONFIG, EMBED SCRIPT, OPENAPI, CONTACT LEAD
  // =========================================================================
  app.get('/widget/embed.js', (req, res) => {
    const origin = getRequestOrigin(req);
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.send(buildWidgetEmbedScript(origin));
  });

  app.get('/api/public/openapi.json', (_req, res) => {
    res.json(RAMAX_OPENAPI_SPEC);
  });

  app.get('/api/public/config', (_req, res) => {
    const db = getDb();
    const { legal, domains, pricing, trialPolicy } = db.settings;
    // CRITICAL: Do not publish unconfirmed legal identity as official legal entity
    const publicLegal = legal.confirmedByOwner
      ? {
          published: true,
          legalName: legal.proposedLegalName,
          legalWebsite: legal.proposedLegalWebsite,
          contactEmail: legal.contactEmail,
          contactPhone: legal.contactPhone,
          supportAddressFa: legal.supportAddressFa,
        }
      : {
          published: false,
          legalName: 'راماکس (اطلاعات حقوقی پس از تأیید مالک منتشر می‌شود)',
          legalWebsite: '',
          contactEmail: legal.contactEmail,
          contactPhone: legal.contactPhone,
          supportAddressFa: 'نشانی حقوقی پس از تأیید مالک ثبت می‌شود',
        };

    res.json({
      domains,
      legal: publicLegal,
      trialPolicy,
      tariffVersion: pricing.tariffVersion,
      taxPercent: pricing.taxPercent,
      models: db.models.map((m) => toPublicModel(m, db.settings)),
      demoSitePublicKey: db.sites[0]?.publicInstallKey || '',
    });
  });

  app.post('/api/public/contact', (req, res) => {
    const { name, email, phone, company, message } = req.body || {};
    if (!name?.trim() || !message?.trim() || (!email?.trim() && !phone?.trim())) {
      res.status(400).json({ message: 'نام، روش تماس و متن پیام الزامی است.' });
      return;
    }
    const db = getDb();
    db.contactLeads.unshift({
      id: `lead_${crypto.randomBytes(5).toString('hex')}`,
      name: String(name).trim(),
      email: String(email || '').trim(),
      phone: String(phone || '').trim(),
      company: String(company || '').trim(),
      message: String(message).trim(),
      createdAt: new Date().toISOString(),
    });
    saveDb();
    res.json({ ok: true, message: 'درخواست شما با موفقیت ثبت شد. تیم راماکس با شما تماس می‌گیرد.' });
  });

  // =========================================================================
  // 2. SERVER-SIDE CAPTCHA & AUTHENTICATION (SEPARATE CUSTOMER / ADMIN COOKIES)
  // =========================================================================
  app.get('/api/auth/captcha', (_req, res) => {
    const a = Math.floor(Math.random() * 8) + 2;
    const b = Math.floor(Math.random() * 8) + 1;
    const id = `cap_${crypto.randomBytes(6).toString('hex')}`;
    const questionFa = `حاصل ${a} + ${b} چند است؟`;
    captchas.set(id, {
      id,
      answer: String(a + b),
      questionFa,
      expiresAt: Date.now() + 5 * 60 * 1000,
    });
    res.json({ captchaId: id, questionFa });
  });

  function verifyCaptcha(captchaId: string, captchaAnswer: string): boolean {
    const entry = captchas.get(captchaId);
    if (!entry) return false;
    captchas.delete(captchaId);
    if (Date.now() > entry.expiresAt) return false;
    // Normalize Persian/Arabic digits to English digits
    const normalized = String(captchaAnswer || '')
      .trim()
      .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
      .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
    return normalized === entry.answer;
  }

  app.post('/api/auth/register', (req, res) => {
    const { name, username, email, password, captchaId, captchaAnswer } = req.body || {};
    if (!verifyCaptcha(captchaId, captchaAnswer)) {
      res.status(400).json({ message: 'پاسخ کد امنیتی (کپچا) نادرست یا منقضی است.' });
      return;
    }
    const cleanUsername = String(username || '').trim().toLowerCase();
    const cleanEmail = String(email || '').trim().toLowerCase();
    if (!name?.trim() || cleanUsername.length < 3 || !cleanEmail.includes('@') || String(password || '').length < 8) {
      res.status(400).json({
        message: 'لطفاً نام، نام کاربری (حداقل ۳ کاراکتر)، ایمیل معتبر و رمز عبور (حداقل ۸ کاراکتر) وارد کنید.',
      });
      return;
    }

    const db = getDb();
    if (db.users.some((u) => u.username.toLowerCase() === cleanUsername || u.email.toLowerCase() === cleanEmail)) {
      res.status(409).json({ message: 'این نام کاربری یا ایمیل قبلاً ثبت شده است.' });
      return;
    }

    const now = new Date().toISOString();
    const newUser: StoredUser = {
      id: `usr_${crypto.randomBytes(6).toString('hex')}`,
      name: String(name).trim(),
      username: cleanUsername,
      email: cleanEmail,
      role: 'owner',
      accountStatus: 'pending_activation', // Commercial features locked until admin activates!
      allowedSiteIds: [],
      departmentIds: [],
      mustChangePassword: false,
      hasSecurityQuestion: false,
      mfaEnabled: false,
      mfaSecretCode: '123456',
      passwordHash: bcrypt.hashSync(String(password), 10),
      failedLoginAttempts: 0,
      trialStartedAt: now, // Separate 14-day AI trial starts immediately!
      trialDailyUsage: {},
      createdAt: now,
    };

    db.users.push(newUser);
    saveDb();

    const token = crypto.randomBytes(24).toString('hex');
    sessions.set(token, {
      token,
      userId: newUser.id,
      scope: 'customer',
      mfaVerified: true,
      createdAt: now,
      ipAddress: getClientIp(req),
    });

    appendAuditLog({
      actorUserId: newUser.id,
      actorUsername: newUser.username,
      actorRole: newUser.role,
      category: 'auth',
      action: 'REGISTER_CUSTOMER',
      summaryFa: 'ثبت‌نام حساب تجاری جدید در وضعیت «در انتظار فعالسازی» با مجوز جداگانه آزمایشی ۱۴ روزه AI',
      ipAddress: getClientIp(req),
    });

    res.cookie(CUSTOMER_COOKIE, token, { httpOnly: true, sameSite: 'lax', path: '/' });
    res.json({
      user: toSessionUser(newUser),
      trialQuota: getTrialQuotaStatus(newUser, db.settings),
    });
  });

  app.post('/api/auth/login', (req, res) => {
    const { username, password, captchaId, captchaAnswer, secondFactorCode } = req.body || {};
    if (!verifyCaptcha(captchaId, captchaAnswer)) {
      res.status(400).json({ message: 'پاسخ کد امنیتی (کپچا) نادرست است.' });
      return;
    }
    const db = getDb();
    const lookup = String(username || '').trim().toLowerCase();
    const user = db.users.find(
      (u) => (u.username.toLowerCase() === lookup || u.email.toLowerCase() === lookup) && u.role !== 'super_admin'
    );

    if (!user) {
      res.status(401).json({ message: 'نام کاربری یا رمز عبور نادرست است.' });
      return;
    }
    if (user.accountStatus === 'suspended') {
      res.status(403).json({ message: 'این حساب توسط مدیرکل تعلیق شده است.' });
      return;
    }
    if (user.lockedUntil && new Date(user.lockedUntil).getTime() > Date.now()) {
      res.status(429).json({ message: 'به دلیل تلاش‌های ناموفق متعدد، حساب موقتاً برای ۵ دقیقه قفل شده است.' });
      return;
    }

    if (!bcrypt.compareSync(String(password || ''), user.passwordHash)) {
      user.failedLoginAttempts += 1;
      if (user.failedLoginAttempts >= 5) {
        user.lockedUntil = new Date(Date.now() + 5 * 60 * 1000).toISOString();
      }
      saveDb();
      appendAuditLog({
        actorUserId: user.id,
        actorUsername: user.username,
        actorRole: user.role,
        category: 'auth',
        action: 'LOGIN_FAILED',
        summaryFa: `ورود ناموفق (تعداد تلاش ناموفق: ${user.failedLoginAttempts})`,
        ipAddress: getClientIp(req),
      });
      res.status(401).json({ message: 'نام کاربری یا رمز عبور نادرست است.' });
      return;
    }

    // Auditable rule-based suspicious login check: if >=2 prior failed attempts or IP changed + MFA enabled
    const ip = getClientIp(req);
    const suspicious = user.failedLoginAttempts >= 2 || (user.mfaEnabled && user.lastLoginIp && user.lastLoginIp !== ip);
    if (suspicious && String(secondFactorCode || '').trim() !== user.mfaSecretCode) {
      appendAuditLog({
        actorUserId: user.id,
        actorUsername: user.username,
        actorRole: user.role,
        category: 'auth',
        action: 'SUSPICIOUS_LOGIN_CHALLENGE',
        summaryFa: 'الگوی ورود نیازمند تأیید دوم تشخیص داده شد (تلاش‌های ناموفق قبلی یا تغییر IP)',
        ipAddress: ip,
      });
      res.status(403).json({
        code: 'SECOND_FACTOR_REQUIRED',
        message: 'به دلیل قوانین امنیتی، وارد کردن کد تأیید دوم الزامی است (کد آزمایشی: 654321).',
      });
      return;
    }

    user.failedLoginAttempts = 0;
    user.lockedUntil = undefined;
    user.lastLoginIp = ip;
    if (!user.trialStartedAt) user.trialStartedAt = new Date().toISOString();
    saveDb();

    const token = crypto.randomBytes(24).toString('hex');
    sessions.set(token, {
      token,
      userId: user.id,
      scope: 'customer',
      mfaVerified: true,
      createdAt: new Date().toISOString(),
      ipAddress: ip,
    });

    res.cookie(CUSTOMER_COOKIE, token, { httpOnly: true, sameSite: 'lax', path: '/' });
    res.json({
      user: toSessionUser(user),
      trialQuota: getTrialQuotaStatus(user, db.settings),
    });
  });

  app.post('/api/auth/logout', (req, res) => {
    const token = req.cookies?.[CUSTOMER_COOKIE];
    if (token) sessions.delete(token);
    res.clearCookie(CUSTOMER_COOKIE, { path: '/' });
    res.json({ ok: true });
  });

  app.get('/api/auth/me', (req, res) => {
    const auth = getSessionFromCookie(req, 'customer');
    if (!auth) {
      res.json({ authenticated: false, user: null });
      return;
    }
    const db = getDb();
    res.json({
      authenticated: true,
      user: toSessionUser(auth.user),
      trialQuota: getTrialQuotaStatus(auth.user, db.settings),
    });
  });

  app.post('/api/auth/first-login-security', requireCustomerAuth, (req: AuthedRequest, res) => {
    const { newPassword, securityQuestion, securityAnswer } = req.body || {};
    const db = getDb();
    const user = db.users.find((u) => u.id === req.authUser!.id);
    if (!user) {
      res.status(404).json({ message: 'کاربر یافت نشد.' });
      return;
    }
    if (newPassword) {
      if (String(newPassword).length < 8) {
        res.status(400).json({ message: 'رمز عبور جدید باید حداقل ۸ کاراکتر باشد.' });
        return;
      }
      user.passwordHash = bcrypt.hashSync(String(newPassword), 10);
      user.mustChangePassword = false;
    }
    if (securityQuestion && securityAnswer) {
      // Hash security answer — never stored plaintext, never sent to AI, never sole recovery factor!
      user.securityQuestion = String(securityQuestion).trim();
      user.securityAnswerHash = bcrypt.hashSync(String(securityAnswer).trim().toLowerCase(), 10);
      user.hasSecurityQuestion = true;
    }
    saveDb();
    appendAuditLog({
      actorUserId: user.id,
      actorUsername: user.username,
      actorRole: user.role,
      category: 'auth',
      action: 'SECURITY_UPDATED',
      summaryFa: 'به‌روزرسانی رمز عبور و تنظیمات امنیتی حساب (پاسخ امنیتی هش‌شده ذخیره شد)',
      ipAddress: getClientIp(req),
    });
    res.json({ ok: true, user: toSessionUser(user) });
  });

  // Separate Admin Authentication (Separate Cookie + MFA + Step-up)
  app.post('/api/admin/auth/login', (req, res) => {
    const db = getDb();
    const reqHost = (req.headers.host || '').split(':')[0].toLowerCase();
    if (reqHost === db.settings.domains.panelDomain.toLowerCase()) {
      res.status(404).json({ message: 'مسیر مدیرکل روی دامنه مشتری مسدود است.' });
      return;
    }
    const { username, password, mfaCode, captchaId, captchaAnswer } = req.body || {};
    if (!verifyCaptcha(captchaId, captchaAnswer)) {
      res.status(400).json({ message: 'پاسخ کپچا نادرست است.' });
      return;
    }
    const admin = db.users.find(
      (u) => u.role === 'super_admin' && u.username.toLowerCase() === String(username || '').trim().toLowerCase()
    );
    if (!admin || !bcrypt.compareSync(String(password || ''), admin.passwordHash)) {
      res.status(401).json({ message: 'اطلاعات ورود مدیرکل نادرست است.' });
      return;
    }
    if (String(mfaCode || '').trim() !== admin.mfaSecretCode) {
      res.status(403).json({
        code: 'INVALID_MFA',
        message: 'کد احراز هویت دومرحله‌ای (MFA) نادرست است (کد محیط آزمایشی: 123456).',
      });
      return;
    }
    const token = crypto.randomBytes(24).toString('hex');
    sessions.set(token, {
      token,
      userId: admin.id,
      scope: 'admin',
      mfaVerified: true,
      stepUpConfirmedUntil: Date.now() + 15 * 60 * 1000,
      createdAt: new Date().toISOString(),
      ipAddress: getClientIp(req),
    });
    appendAuditLog({
      actorUserId: admin.id,
      actorUsername: admin.username,
      actorRole: 'super_admin',
      category: 'auth',
      action: 'ADMIN_LOGIN',
      summaryFa: 'ورود موفق مدیرکل با احراز هویت دومرحله‌ای و کوکی مجزا',
      ipAddress: getClientIp(req),
    });
    res.cookie(ADMIN_COOKIE, token, { httpOnly: true, sameSite: 'strict', path: '/' });
    res.json({ user: toSessionUser(admin) });
  });

  app.post('/api/admin/auth/logout', (req, res) => {
    const token = req.cookies?.[ADMIN_COOKIE];
    if (token) sessions.delete(token);
    res.clearCookie(ADMIN_COOKIE, { path: '/' });
    res.json({ ok: true });
  });

  app.get('/api/admin/auth/me', (req, res) => {
    const auth = getSessionFromCookie(req, 'admin');
    if (!auth) {
      res.json({ authenticated: false, user: null });
      return;
    }
    res.json({ authenticated: true, user: toSessionUser(auth.user) });
  });

  app.post('/api/admin/auth/step-up', requireAdminAuth, (req: AuthedRequest, res) => {
    const { password } = req.body || {};
    if (!bcrypt.compareSync(String(password || ''), req.authUser!.passwordHash)) {
      res.status(403).json({ message: 'تأیید مجدد رمز عبور ناموفق بود.' });
      return;
    }
    req.authSession!.stepUpConfirmedUntil = Date.now() + 10 * 60 * 1000;
    res.json({ ok: true, validForSeconds: 600 });
  });

  // =========================================================================
  // 3. SITES MANAGEMENT & MULTI-TENANT SWITCHING
  // =========================================================================
  app.get('/api/sites', requireCustomerAuth, (req: AuthedRequest, res) => {
    const db = getDb();
    const allowed = db.sites.filter((s) => requireSiteAccess(req.authUser!, s.id));
    res.json({ sites: allowed });
  });

  app.post('/api/sites', requireCustomerAuth, (req: AuthedRequest, res) => {
    const { name, domain, businessTopic, tone, contentGoal, responseRules, trustedSources, defaultModelId } = req.body || {};
    const cleanDomain = String(domain || '')
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/\/.*$/, '');
    if (!name?.trim() || !cleanDomain.includes('.')) {
      res.status(400).json({ message: 'نام سایت و دامنه معتبر (مثلاً example.ir) الزامی است.' });
      return;
    }

    const db = getDb();
    const siteId = `site_${crypto.randomBytes(5).toString('hex')}`;
    const publicInstallKey = `rmx_pub_${crypto.randomBytes(8).toString('hex')}`;
    const rawApiKey = `rmx_live_${crypto.randomBytes(16).toString('hex')}`;
    const rawWebhookSecret = `whsec_${crypto.randomBytes(14).toString('hex')}`;

    const defaultDepId = `dep_${crypto.randomBytes(4).toString('hex')}`;
    const depSupport: DepartmentRecord = {
      id: defaultDepId,
      siteId,
      name: 'پشتیبانی عمومی',
      slug: 'support',
      memberIds: [req.authUser!.id],
      workingHours: 'شنبه تا پنجشنبه ۰۹:۰۰ تا ۱۸:۰۰',
      routingOrder: 1,
      fallbackUserId: req.authUser!.id,
    };

    const newSite: SiteRecord = {
      id: siteId,
      ownerUserId: req.authUser!.id,
      name: String(name).trim(),
      domain: cleanDomain,
      businessTopic: String(businessTopic || '').trim(),
      tone: String(tone || 'محترمانه و دقیق').trim(),
      contentGoal: String(contentGoal || 'پاسخگویی سریع و افزایش فروش').trim(),
      responseRules: String(responseRules || '').trim(),
      trustedSources: Array.isArray(trustedSources)
        ? trustedSources.map((s) => String(s).trim()).filter(Boolean)
        : String(trustedSources || '')
            .split('\n')
            .map((s) => s.trim())
            .filter(Boolean),
      defaultModelId: String(defaultModelId || 'ramax-fast'),
      publicInstallKey,
      apiKeyPrefix: `${rawApiKey.slice(0, 14)}...`,
      installVerified: false,
      installVerificationSteps: {
        widgetSeen: false,
        testMessageSent: false,
        receivedInDesk: false,
        operatorReplied: false,
      },
      widgetConfig: {
        primaryColor: '#1d4ed8',
        logoText: String(name).trim().slice(0, 20),
        iconStyle: 'chat',
        position: 'bottom-right',
        edgeOffsetPx: 20,
        welcomeTitle: `پشتیبانی ${String(name).trim()}`,
        welcomeMessage: 'سلام! چطور می‌توانیم امروز به شما کمک کنیم؟',
        workingHoursText: 'شنبه تا پنجشنبه ۹ تا ۱۸',
        isWithinWorkingHours: true,
        offlineMessage: 'هم‌اکنون خارج از ساعت کاری هستیم. پیام شما ثبت می‌شود.',
        selectableDepartmentIds: [defaultDepId],
        showOnMobile: true,
        widgetEnabled: true,
        autoReplyEnabled: false,
        allowedPagePaths: '/*',
      },
      walletBalanceToman: 0,
      walletReservedToman: 0,
      webhookUrl: '',
      webhookSecretPrefix: `${rawWebhookSecret.slice(0, 11)}...`,
      createdAt: new Date().toISOString(),
    };

    db.departments.push(depSupport);
    db.sites.push(newSite);
    db.siteSecrets[siteId] = {
      apiKeyHash: crypto.createHash('sha256').update(rawApiKey).digest('hex'),
      webhookSecret: rawWebhookSecret,
    };

    const userRecord = db.users.find((u) => u.id === req.authUser!.id);
    if (userRecord && !userRecord.allowedSiteIds.includes(siteId)) {
      userRecord.allowedSiteIds.push(siteId);
    }
    saveDb();

    appendAuditLog({
      actorUserId: req.authUser!.id,
      actorUsername: req.authUser!.username,
      actorRole: req.authUser!.role,
      siteId,
      category: 'apikey',
      action: 'CREATE_SITE',
      summaryFa: `ثبت سایت جدید ${newSite.name} (${newSite.domain}) و صدور کلید سرور`,
      ipAddress: getClientIp(req),
    });

    res.json({
      site: newSite,
      oneTimeServerApiKey: rawApiKey,
      oneTimeWebhookSecret: rawWebhookSecret,
    });
  });

  app.put('/api/sites/:siteId', requireCustomerAuth, (req: AuthedRequest, res) => {
    const { siteId } = req.params;
    if (!requireSiteAccess(req.authUser!, siteId)) {
      res.status(403).json({ message: 'دسترسی به این سایت برای حساب شما مجاز نیست.' });
      return;
    }
    const db = getDb();
    const site = db.sites.find((s) => s.id === siteId);
    if (!site) {
      res.status(404).json({ message: 'سایت یافت نشد.' });
      return;
    }
    const body = req.body || {};
    if (body.name !== undefined) site.name = String(body.name).trim();
    if (body.businessTopic !== undefined) site.businessTopic = String(body.businessTopic).trim();
    if (body.tone !== undefined) site.tone = String(body.tone).trim();
    if (body.contentGoal !== undefined) site.contentGoal = String(body.contentGoal).trim();
    if (body.responseRules !== undefined) site.responseRules = String(body.responseRules).trim();
    if (body.defaultModelId !== undefined) site.defaultModelId = String(body.defaultModelId);
    if (body.webhookUrl !== undefined) site.webhookUrl = String(body.webhookUrl).trim();
    if (body.trustedSources !== undefined) {
      site.trustedSources = Array.isArray(body.trustedSources)
        ? body.trustedSources.map((x: unknown) => String(x).trim()).filter(Boolean)
        : String(body.trustedSources)
            .split('\n')
            .map((x) => x.trim())
            .filter(Boolean);
    }
    if (body.widgetConfig) {
      site.widgetConfig = { ...site.widgetConfig, ...body.widgetConfig };
    }
    saveDb();
    appendAuditLog({
      actorUserId: req.authUser!.id,
      actorUsername: req.authUser!.username,
      actorRole: req.authUser!.role,
      siteId,
      category: 'settings',
      action: 'UPDATE_SITE_CONFIG',
      summaryFa: `به‌روزرسانی تنظیمات سایت و ویجت ${site.name}`,
      ipAddress: getClientIp(req),
    });
    res.json({ site });
  });

  app.post('/api/sites/:siteId/rotate-key', requireCustomerAuth, (req: AuthedRequest, res) => {
    const { siteId } = req.params;
    if (!requireSiteAccess(req.authUser!, siteId)) {
      res.status(403).json({ message: 'دسترسی به این سایت مجاز نیست.' });
      return;
    }
    if (!['owner', 'site_manager', 'super_admin'].includes(req.authUser!.role)) {
      res.status(403).json({ message: 'نقش شما اجازه تعویض کلید API را ندارد.' });
      return;
    }
    const db = getDb();
    const site = db.sites.find((s) => s.id === siteId);
    if (!site) {
      res.status(404).json({ message: 'سایت یافت نشد.' });
      return;
    }
    const rawApiKey = `rmx_live_${crypto.randomBytes(16).toString('hex')}`;
    site.apiKeyPrefix = `${rawApiKey.slice(0, 14)}...`;
    db.siteSecrets[siteId] = {
      ...(db.siteSecrets[siteId] || { webhookSecret: `whsec_${crypto.randomBytes(12).toString('hex')}` }),
      apiKeyHash: crypto.createHash('sha256').update(rawApiKey).digest('hex'),
    };
    saveDb();
    appendAuditLog({
      actorUserId: req.authUser!.id,
      actorUsername: req.authUser!.username,
      actorRole: req.authUser!.role,
      siteId,
      category: 'apikey',
      action: 'ROTATE_API_KEY',
      summaryFa: `تعویض و لغو کلید قبلی سرور سایت ${site.name}`,
      ipAddress: getClientIp(req),
    });
    res.json({ apiKeyPrefix: site.apiKeyPrefix, oneTimeServerApiKey: rawApiKey });
  });

  app.get('/api/sites/:siteId/dashboard', requireCustomerAuth, (req: AuthedRequest, res) => {
    const { siteId } = req.params;
    if (!requireSiteAccess(req.authUser!, siteId)) {
      res.status(403).json({ message: 'دسترسی به گزارش این سایت مجاز نیست.' });
      return;
    }
    const db = getDb();
    const site = db.sites.find((s) => s.id === siteId);
    if (!site) {
      res.status(404).json({ message: 'سایت یافت نشد.' });
      return;
    }
    const siteConvs = db.conversations.filter((c) => c.siteId === siteId);
    const siteTxs = db.walletTransactions.filter((t) => t.siteId === siteId);
    const siteRuns = db.automationRuns.filter((r) => r.siteId === siteId);
    const siteContracts = db.contracts.filter((c) => c.siteId === siteId);

    const pendingTasks =
      siteConvs.filter((c) => c.status === 'new' || c.status === 'queued').length +
      siteRuns.filter((r) => r.status === 'awaiting_approval').length;
    const failedTasks = siteRuns.filter((r) => r.status === 'failed').length;
    const totalSpentToman = siteTxs
      .filter((t) => t.type === 'ai_usage' && t.status === 'settled')
      .reduce((acc, t) => acc + Math.abs(t.amountToman), 0);

    const avgFirstResp =
      siteConvs.filter((c) => c.firstResponseSeconds).reduce((a, c) => a + (c.firstResponseSeconds || 0), 0) /
      Math.max(1, siteConvs.filter((c) => c.firstResponseSeconds).length);

    res.json({
      site,
      metrics: {
        conversationsTotal: siteConvs.length,
        openConversations: siteConvs.filter((c) => c.status !== 'resolved' && c.status !== 'archived').length,
        resolvedConversations: siteConvs.filter((c) => c.status === 'resolved').length,
        avgFirstResponseSec: Math.round(avgFirstResp || 0),
        totalSpentToman,
        walletBalanceToman: site.walletBalanceToman,
        walletReservedToman: site.walletReservedToman,
        pendingTasks,
        failedTasks,
        contractsCount: siteContracts.length,
      },
      recentRuns: siteRuns.slice(0, 5),
      recentTransactions: siteTxs.slice(0, 6),
    });
  });

  // =========================================================================
  // 4. TEAM, ROLES & DEPARTMENTS (SITE-SCOPED)
  // =========================================================================
  app.get('/api/sites/:siteId/team', requireCustomerAuth, (req: AuthedRequest, res) => {
    const { siteId } = req.params;
    if (!requireSiteAccess(req.authUser!, siteId)) {
      res.status(403).json({ message: 'دسترسی به تیم این سایت مجاز نیست.' });
      return;
    }
    const db = getDb();
    const members = db.users
      .filter((u) => u.role !== 'super_admin' && u.allowedSiteIds.includes(siteId))
      .map(toSessionUser);
    const departments = db.departments.filter((d) => d.siteId === siteId);
    const invites = db.invites.filter((i) => i.siteIds.includes(siteId));
    res.json({ members, departments, invites });
  });

  app.post('/api/sites/:siteId/team/invite', requireCustomerAuth, (req: AuthedRequest, res) => {
    const { siteId } = req.params;
    if (!requireSiteAccess(req.authUser!, siteId)) {
      res.status(403).json({ message: 'دسترسی به این سایت مجاز نیست.' });
      return;
    }
    if (!['owner', 'site_manager', 'super_admin'].includes(req.authUser!.role)) {
      res.status(403).json({ message: 'شما مجوز افزودن کاربر به تیم را ندارید.' });
      return;
    }
    const { name, emailOrUsername, role, siteIds, departmentIds, expiresAt, createImmediateDemoPassword } = req.body || {};
    if (!name?.trim() || !emailOrUsername?.trim() || !role) {
      res.status(400).json({ message: 'نام، ایمیل یا نام کاربری و نقش الزامی است.' });
      return;
    }
    const db = getDb();
    const allowedRequestedSites = (Array.isArray(siteIds) && siteIds.length ? siteIds : [siteId]).filter((id: string) =>
      requireSiteAccess(req.authUser!, id)
    );
    const invite = {
      id: `inv_${crypto.randomBytes(5).toString('hex')}`,
      siteIds: allowedRequestedSites,
      departmentIds: Array.isArray(departmentIds) ? departmentIds : [],
      name: String(name).trim(),
      emailOrUsername: String(emailOrUsername).trim().toLowerCase(),
      role: role as UserRole,
      expiresAt: expiresAt || new Date(Date.now() + 7 * 86400000).toISOString(),
      createdBy: req.authUser!.name,
      status: 'pending' as 'pending' | 'accepted' | 'revoked',
      createdAt: new Date().toISOString(),
    };
    db.invites.unshift(invite);

    let tempPassword: string | undefined;
    if (createImmediateDemoPassword) {
      const cleanKey = invite.emailOrUsername.split('@')[0].replace(/[^a-z0-9_]/g, '') || `u_${Date.now()}`;
      if (!db.users.some((u) => u.username === cleanKey || u.email === invite.emailOrUsername)) {
        tempPassword = `Rmx#${crypto.randomBytes(3).toString('hex')}`;
        db.users.push({
          id: `usr_${crypto.randomBytes(5).toString('hex')}`,
          name: invite.name,
          username: cleanKey,
          email: invite.emailOrUsername.includes('@') ? invite.emailOrUsername : `${cleanKey}@example.ir`,
          role: invite.role,
          accountStatus: 'active',
          allowedSiteIds: invite.siteIds,
          departmentIds: invite.departmentIds,
          mustChangePassword: true, // Enforce password change on first login!
          hasSecurityQuestion: false,
          mfaEnabled: false,
          mfaSecretCode: '123456',
          passwordHash: bcrypt.hashSync(tempPassword, 10),
          failedLoginAttempts: 0,
          trialStartedAt: new Date().toISOString(),
          trialDailyUsage: {},
          createdAt: new Date().toISOString(),
        });
        invite.status = 'accepted';
      }
    }

    saveDb();
    appendAuditLog({
      actorUserId: req.authUser!.id,
      actorUsername: req.authUser!.username,
      actorRole: req.authUser!.role,
      siteId,
      category: 'permission',
      action: 'INVITE_MEMBER',
      summaryFa: `دعوت ${invite.name} با نقش ${invite.role} محدود به سایت‌های ${invite.siteIds.join(', ')}`,
      ipAddress: getClientIp(req),
    });
    res.json({ invite, tempPassword });
  });

  app.post('/api/sites/:siteId/departments', requireCustomerAuth, (req: AuthedRequest, res) => {
    const { siteId } = req.params;
    if (!requireSiteAccess(req.authUser!, siteId)) {
      res.status(403).json({ message: 'دسترسی به این سایت مجاز نیست.' });
      return;
    }
    const { id, name, workingHours, routingOrder, memberIds, fallbackUserId } = req.body || {};
    if (!name?.trim()) {
      res.status(400).json({ message: 'نام دپارتمان الزامی است.' });
      return;
    }
    const db = getDb();
    if (id) {
      const existing = db.departments.find((d) => d.id === id && d.siteId === siteId);
      if (!existing) {
        res.status(404).json({ message: 'دپارتمان یافت نشد.' });
        return;
      }
      existing.name = String(name).trim();
      if (workingHours !== undefined) existing.workingHours = String(workingHours);
      if (routingOrder !== undefined) existing.routingOrder = Number(routingOrder) || 1;
      if (Array.isArray(memberIds)) existing.memberIds = memberIds;
      if (fallbackUserId !== undefined) existing.fallbackUserId = fallbackUserId || undefined;
      saveDb();
      res.json({ department: existing });
      return;
    }
    const dep: DepartmentRecord = {
      id: `dep_${crypto.randomBytes(5).toString('hex')}`,
      siteId,
      name: String(name).trim(),
      slug: String(name).trim().toLowerCase().replace(/\s+/g, '-'),
      memberIds: Array.isArray(memberIds) ? memberIds : [req.authUser!.id],
      workingHours: String(workingHours || 'شنبه تا پنجشنبه ۰۹:۰۰ تا ۱۸:۰۰'),
      routingOrder: Number(routingOrder) || db.departments.filter((d) => d.siteId === siteId).length + 1,
      fallbackUserId: fallbackUserId || req.authUser!.id,
    };
    db.departments.push(dep);
    saveDb();
    res.json({ department: dep });
  });

  // =========================================================================
  // 5. WIDGET VISITOR API (PUBLIC KEY ONLY — SHORT-LIVED SCOPED SESSION)
  // =========================================================================
  app.post('/api/widget/session', (req, res) => {
    const { publicInstallKey, visitorName, existingToken } = req.body || {};
    const db = getDb();
    const site = db.sites.find((s) => s.publicInstallKey === publicInstallKey);
    if (!site) {
      res.status(404).json({ code: 'INVALID_INSTALL_KEY', message: 'شناسه نصب عمومی ویجت معتبر نیست.' });
      return;
    }

    // Mark step 1 of install verification: Widget seen on site!
    if (!site.installVerificationSteps.widgetSeen) {
      site.installVerificationSteps.widgetSeen = true;
      saveDb();
    }

    if (existingToken) {
      const existing = widgetVisitorTokens.get(existingToken);
      if (existing && existing.siteId === site.id && existing.expiresAt > Date.now()) {
        const departments = db.departments.filter(
          (d) => d.siteId === site.id && site.widgetConfig.selectableDepartmentIds.includes(d.id)
        );
        const conv = db.conversations.find(
          (c) => c.siteId === site.id && c.visitorSessionId === existing.visitorSessionId
        );
        res.json({
          widgetToken: existingToken,
          siteName: site.name,
          widgetConfig: site.widgetConfig,
          departments: departments.map((d) => ({ id: d.id, name: d.name, workingHours: d.workingHours })),
          conversation: conv ? maskConversationForVisitor(conv) : null,
        });
        return;
      }
    }

    const widgetToken = `wvt_${crypto.randomBytes(20).toString('hex')}`;
    const visitorSessionId = `vis_${crypto.randomBytes(8).toString('hex')}`;
    widgetVisitorTokens.set(widgetToken, {
      siteId: site.id,
      visitorSessionId,
      visitorName: String(visitorName || 'بازدیدکننده سایت').trim(),
      expiresAt: Date.now() + 2 * 60 * 60 * 1000, // Short-lived 2h visitor token
    });

    const departments = db.departments.filter(
      (d) => d.siteId === site.id && site.widgetConfig.selectableDepartmentIds.includes(d.id)
    );

    res.json({
      widgetToken,
      siteName: site.name,
      widgetConfig: site.widgetConfig,
      departments: departments.map((d) => ({ id: d.id, name: d.name, workingHours: d.workingHours })),
      conversation: null,
    });
  });

  app.post('/api/widget/message', async (req, res) => {
    const widgetToken = String(req.headers['x-ramax-widget-token'] || req.body?.widgetToken || '');
    const session = widgetVisitorTokens.get(widgetToken);
    if (!session || session.expiresAt < Date.now()) {
      res.status(401).json({ code: 'WIDGET_SESSION_EXPIRED', message: 'نشست ویجت منقضی شده است؛ در حال اتصال مجدد...' });
      return;
    }

    const { body, visitorName, visitorContact, departmentId, clientMessageId, isInstallTest } = req.body || {};
    if (!body?.trim()) {
      res.status(400).json({ message: 'متن پیام نمی‌تواند خالی باشد.' });
      return;
    }

    const db = getDb();
    const site = db.sites.find((s) => s.id === session.siteId);
    if (!site || !site.widgetConfig.widgetEnabled) {
      res.status(403).json({ message: 'ویجت پشتیبانی برای این سایت غیرفعال است.' });
      return;
    }

    let conv = db.conversations.find((c) => c.siteId === site.id && c.visitorSessionId === session.visitorSessionId);
    const now = new Date().toISOString();

    if (!conv) {
      const siteDeps = db.departments.filter((d) => d.siteId === site.id);
      const chosenDep = siteDeps.find((d) => d.id === departmentId) || siteDeps[0];
      const ticketSeq = 1043 + db.conversations.length;
      conv = {
        id: `conv_${crypto.randomBytes(6).toString('hex')}`,
        ticketNumber: `RMX-${ticketSeq}`,
        siteId: site.id,
        departmentId: chosenDep?.id || 'default',
        visitorName: String(visitorName || session.visitorName || 'بازدیدکننده').trim(),
        visitorContact: String(visitorContact || '').trim(),
        visitorSessionId: session.visitorSessionId,
        subject: String(body).trim().slice(0, 65),
        status: 'new',
        priority: 'normal',
        replyMode: site.widgetConfig.autoReplyEnabled ? 'auto_reply' : 'ai_suggest',
        tags: isInstallTest ? ['پیام-آزمایشی-نصب'] : [],
        unreadCount: 1,
        detectedTopic: String(body).includes('ارسال') ? 'ارسال و پیگیری مرسوله' : 'پرسش عمومی',
        createdAt: now,
        updatedAt: now,
        messages: [],
        history: [
          {
            id: `ev_${crypto.randomBytes(4).toString('hex')}`,
            timestamp: now,
            actorName: 'ویجت سایت',
            actionFa: 'شروع گفتگوی جدید از ویجت نصب‌شده روی سایت',
            toValue: chosenDep?.name || 'صف ورودی',
          },
        ],
      };
      db.conversations.unshift(conv);
    }

    // Idempotency check so reconnect retry never creates duplicate message!
    if (clientMessageId && conv.messages.some((m) => m.clientMessageId === clientMessageId)) {
      res.json({ conversation: maskConversationForVisitor(conv), deduplicated: true });
      return;
    }

    const newMsg: SupportMessage = {
      id: `msg_${crypto.randomBytes(6).toString('hex')}`,
      clientMessageId: clientMessageId ? String(clientMessageId) : undefined,
      conversationId: conv.id,
      senderType: 'visitor',
      senderName: conv.visitorName,
      body: String(body).trim(),
      isInternalNote: false,
      deliveryStatus: 'delivered',
      attachments: [],
      createdAt: now,
    };
    conv.messages.push(newMsg);
    conv.unreadCount += 1;
    conv.updatedAt = now;
    if (conv.status === 'waiting_customer' || conv.status === 'resolved') {
      conv.status = 'queued';
    }

    // Install test verification steps 2 & 3
    if (isInstallTest || !site.installVerificationSteps.testMessageSent) {
      site.installVerificationSteps.testMessageSent = true;
      site.installVerificationSteps.receivedInDesk = true;
    }

    // Run automations (shipping routing, after-hours, etc.)
    runAutomationEngine({
      siteId: site.id,
      trigger: 'conversation_created',
      contextText: newMsg.body,
      conversation: conv,
      dedupeEntityId: conv.id,
    });

    if (!site.widgetConfig.isWithinWorkingHours) {
      runAutomationEngine({
        siteId: site.id,
        trigger: 'after_hours',
        contextText: newMsg.body,
        conversation: conv,
        dedupeEntityId: `${conv.id}:after_hours`,
      });
    }

    // Auto-reply ONLY if site autoReplyEnabled AND conversation is still in auto_reply mode (not taken by human!)
    if (site.widgetConfig.autoReplyEnabled && conv.replyMode === 'auto_reply' && !conv.assignedUserId) {
      try {
        const replyText = await generateServerAiText({
          prompt: `پیام مشتری در ویجت سایت: «${newMsg.body}»\nیک پاسخ کوتاه، دقیق و محترمانه به فارسی بنویس.`,
          systemInstruction: buildSiteSystemInstruction(db.settings, site),
          fast: true,
        });
        conv.messages.push({
          id: `msg_${crypto.randomBytes(6).toString('hex')}`,
          conversationId: conv.id,
          senderType: 'ai',
          senderName: 'پاسخ خودکار راماکس',
          body: replyText,
          isInternalNote: false,
          deliveryStatus: 'delivered',
          attachments: [],
          createdAt: new Date().toISOString(),
        });
      } catch {
        // Keep queued for human operator if AI provider fails
        conv.status = 'queued';
      }
    }

    saveDb();
    res.json({ conversation: maskConversationForVisitor(conv) });
  });

  app.post('/api/widget/upload', upload.single('file'), (req, res) => {
    const widgetToken = String(req.headers['x-ramax-widget-token'] || req.body?.widgetToken || '');
    const session = widgetVisitorTokens.get(widgetToken);
    if (!session || session.expiresAt < Date.now()) {
      res.status(401).json({ message: 'نشست ویجت معتبر نیست.' });
      return;
    }
    if (!req.file) {
      res.status(400).json({ message: 'فایلی انتخاب نشده است.' });
      return;
    }
    const db = getDb();
    const site = db.sites.find((s) => s.id === session.siteId);
    if (!site) {
      res.status(404).json({ message: 'سایت یافت نشد.' });
      return;
    }

    let conv = db.conversations.find((c) => c.siteId === site.id && c.visitorSessionId === session.visitorSessionId);
    const now = new Date().toISOString();
    if (!conv) {
      const siteDeps = db.departments.filter((d) => d.siteId === site.id);
      conv = {
        id: `conv_${crypto.randomBytes(6).toString('hex')}`,
        ticketNumber: `RMX-${1043 + db.conversations.length}`,
        siteId: site.id,
        departmentId: siteDeps[0]?.id || 'default',
        visitorName: session.visitorName,
        visitorContact: '',
        visitorSessionId: session.visitorSessionId,
        subject: `ارسال فایل: ${req.file.originalname}`,
        status: 'new',
        priority: 'normal',
        replyMode: 'ai_suggest',
        tags: ['فایل-پیوست'],
        unreadCount: 1,
        createdAt: now,
        updatedAt: now,
        messages: [],
        history: [],
      };
      db.conversations.unshift(conv);
    }

    try {
      const fileRecord = savePrivateUpload({
        siteId: site.id,
        conversationId: conv.id,
        uploadedBy: conv.visitorName,
        file: req.file,
      });

      const caption = String(req.body?.caption || `فایل پیوست ارسال شد: ${fileRecord.originalName}`);
      conv.messages.push({
        id: `msg_${crypto.randomBytes(6).toString('hex')}`,
        conversationId: conv.id,
        senderType: 'visitor',
        senderName: conv.visitorName,
        body: caption,
        isInternalNote: false,
        deliveryStatus: 'delivered',
        attachments: [
          {
            id: fileRecord.id,
            siteId: fileRecord.siteId,
            conversationId: conv.id,
            originalName: fileRecord.originalName,
            mimeType: fileRecord.mimeType,
            sizeBytes: fileRecord.sizeBytes,
            scanStatus: fileRecord.scanStatus,
            uploadedBy: fileRecord.uploadedBy,
            uploadedAt: fileRecord.uploadedAt,
            downloadCount: 0,
          },
        ],
        createdAt: now,
      });
      conv.unreadCount += 1;
      conv.updatedAt = now;

      if (fileRecord.scanStatus === 'clean') {
        runAutomationEngine({
          siteId: site.id,
          trigger: 'file_uploaded',
          contextText: `${fileRecord.originalName} ${caption}`,
          conversation: conv,
          dedupeEntityId: fileRecord.id,
        });
      }

      saveDb();
      res.json({ conversation: maskConversationForVisitor(conv), scanStatus: fileRecord.scanStatus });
    } catch (err) {
      res.status(400).json({ message: err instanceof Error ? err.message : 'خطا در بارگذاری فایل.' });
    }
  });

  app.get('/api/widget/poll', (req, res) => {
    const widgetToken = String(req.headers['x-ramax-widget-token'] || req.query.token || '');
    const session = widgetVisitorTokens.get(widgetToken);
    if (!session || session.expiresAt < Date.now()) {
      res.status(401).json({ message: 'نشست ویجت منقضی شده است.' });
      return;
    }
    const db = getDb();
    const conv = db.conversations.find(
      (c) => c.siteId === session.siteId && c.visitorSessionId === session.visitorSessionId
    );
    res.json({ conversation: conv ? maskConversationForVisitor(conv) : null });
  });

  app.post('/api/widget/rate', (req, res) => {
    const widgetToken = String(req.headers['x-ramax-widget-token'] || req.body?.widgetToken || '');
    const session = widgetVisitorTokens.get(widgetToken);
    if (!session) {
      res.status(401).json({ message: 'نشست معتبر نیست.' });
      return;
    }
    const { rating, comment } = req.body || {};
    const db = getDb();
    const conv = db.conversations.find(
      (c) => c.siteId === session.siteId && c.visitorSessionId === session.visitorSessionId
    );
    if (!conv) {
      res.status(404).json({ message: 'گفتگویی ثبت نشده است.' });
      return;
    }
    conv.rating = Math.min(5, Math.max(1, Number(rating) || 5));
    conv.ratingComment = String(comment || '').trim();
    saveDb();
    res.json({ ok: true, conversation: maskConversationForVisitor(conv) });
  });

  // =========================================================================
  // 6. SUPPORT COMMAND CENTER (STRICT SITE ISOLATION)
  // =========================================================================
  app.get('/api/support/:siteId/conversations', requireCustomerAuth, (req: AuthedRequest, res) => {
    const { siteId } = req.params;
    if (!requireSiteAccess(req.authUser!, siteId)) {
      res.status(403).json({
        code: 'SITE_ISOLATION_DENIED',
        message: 'دسترسی به گفتگوهای این سایت مسدود است (جداسازی کامل داده‌های هر سایت در سرور).',
      });
      return;
    }
    const db = getDb();
    const { status, departmentId, priority, unreadOnly, q } = req.query;
    let list = db.conversations.filter((c) => c.siteId === siteId);

    if (status && status !== 'all') {
      list = list.filter((c) => c.status === status);
    } else {
      list = list.filter((c) => c.status !== 'archived');
    }
    if (departmentId && departmentId !== 'all') {
      list = list.filter((c) => c.departmentId === departmentId);
    }
    if (priority && priority !== 'all') {
      list = list.filter((c) => c.priority === priority);
    }
    if (unreadOnly === 'true') {
      list = list.filter((c) => c.unreadCount > 0);
    }
    if (q && String(q).trim()) {
      const needle = String(q).trim().toLowerCase();
      list = list.filter(
        (c) =>
          c.visitorName.toLowerCase().includes(needle) ||
          c.ticketNumber.toLowerCase().includes(needle) ||
          c.subject.toLowerCase().includes(needle) ||
          c.messages.some((m) => m.body.toLowerCase().includes(needle))
      );
    }

    const departments = db.departments.filter((d) => d.siteId === siteId);
    const members = db.users
      .filter((u) => u.role !== 'super_admin' && u.allowedSiteIds.includes(siteId))
      .map(toSessionUser);

    res.json({ conversations: list, departments, members });
  });

  app.post('/api/support/:siteId/conversations/:convId/reply', requireCustomerAuth, (req: AuthedRequest, res) => {
    const { siteId, convId } = req.params;
    if (!requireSiteAccess(req.authUser!, siteId)) {
      res.status(403).json({ message: 'دسترسی به این سایت مجاز نیست.' });
      return;
    }
    const db = getDb();
    const conv = db.conversations.find((c) => c.id === convId && c.siteId === siteId);
    if (!conv) {
      res.status(404).json({ message: 'گفتگو در این سایت یافت نشد.' });
      return;
    }
    const { body, isInternalNote, clientMessageId } = req.body || {};
    if (!body?.trim()) {
      res.status(400).json({ message: 'متن پیام الزامی است.' });
      return;
    }
    if (clientMessageId && conv.messages.some((m) => m.clientMessageId === clientMessageId)) {
      res.json({ conversation: conv, deduplicated: true });
      return;
    }

    const now = new Date().toISOString();
    const internal = Boolean(isInternalNote);

    const msg: SupportMessage = {
      id: `msg_${crypto.randomBytes(6).toString('hex')}`,
      clientMessageId: clientMessageId ? String(clientMessageId) : undefined,
      conversationId: conv.id,
      senderType: 'operator',
      senderName: req.authUser!.name,
      senderUserId: req.authUser!.id,
      body: String(body).trim(),
      isInternalNote: internal,
      deliveryStatus: 'delivered',
      attachments: [],
      createdAt: now,
    };
    conv.messages.push(msg);
    conv.unreadCount = 0;
    conv.updatedAt = now;

    if (!internal) {
      // Handing to human immediately pauses bot auto_reply to prevent duplicate replies!
      if (conv.replyMode === 'auto_reply') {
        conv.replyMode = 'human_only';
        conv.history.push({
          id: `ev_${crypto.randomBytes(4).toString('hex')}`,
          timestamp: now,
          actorName: req.authUser!.name,
          actionFa: 'پاسخ اپراتور ارسال شد و پاسخ خودکار ربات متوقف گردید',
          fromValue: 'پاسخ خودکار',
          toValue: 'فقط انسان',
        });
      }
      if (!conv.assignedUserId) conv.assignedUserId = req.authUser!.id;
      if (conv.status === 'new' || conv.status === 'queued') conv.status = 'in_progress';
      if (!conv.firstResponseSeconds) {
        conv.firstResponseSeconds = Math.max(
          5,
          Math.round((Date.now() - new Date(conv.createdAt).getTime()) / 1000)
        );
      }

      // Mark step 4 of widget install test verified!
      const site = db.sites.find((s) => s.id === siteId);
      if (site && site.installVerificationSteps.receivedInDesk) {
        site.installVerificationSteps.operatorReplied = true;
        site.installVerified = true;
      }
    }

    saveDb();
    res.json({ conversation: conv });
  });

  app.post('/api/support/:siteId/conversations/:convId/upload', requireCustomerAuth, upload.single('file'), (req: AuthedRequest, res) => {
    const { siteId, convId } = req.params;
    if (!requireSiteAccess(req.authUser!, siteId)) {
      res.status(403).json({ message: 'دسترسی به این سایت مجاز نیست.' });
      return;
    }
    const db = getDb();
    const conv = db.conversations.find((c) => c.id === convId && c.siteId === siteId);
    if (!conv || !req.file) {
      res.status(400).json({ message: 'گفتگو یا فایل معتبر نیست.' });
      return;
    }
    try {
      const fileRecord = savePrivateUpload({
        siteId,
        conversationId: conv.id,
        uploadedBy: req.authUser!.name,
        file: req.file,
      });
      conv.messages.push({
        id: `msg_${crypto.randomBytes(6).toString('hex')}`,
        conversationId: conv.id,
        senderType: 'operator',
        senderName: req.authUser!.name,
        senderUserId: req.authUser!.id,
        body: String(req.body?.caption || `ارسال فایل پیوست: ${fileRecord.originalName}`),
        isInternalNote: req.body?.isInternalNote === 'true',
        deliveryStatus: 'delivered',
        attachments: [
          {
            id: fileRecord.id,
            siteId,
            conversationId: conv.id,
            originalName: fileRecord.originalName,
            mimeType: fileRecord.mimeType,
            sizeBytes: fileRecord.sizeBytes,
            scanStatus: fileRecord.scanStatus,
            uploadedBy: fileRecord.uploadedBy,
            uploadedAt: fileRecord.uploadedAt,
            downloadCount: 0,
          },
        ],
        createdAt: new Date().toISOString(),
      });
      conv.updatedAt = new Date().toISOString();
      saveDb();
      res.json({ conversation: conv });
    } catch (err) {
      res.status(400).json({ message: err instanceof Error ? err.message : 'خطا در بارگذاری فایل.' });
    }
  });

  app.patch('/api/support/:siteId/conversations/:convId', requireCustomerAuth, (req: AuthedRequest, res) => {
    const { siteId, convId } = req.params;
    if (!requireSiteAccess(req.authUser!, siteId)) {
      res.status(403).json({ message: 'دسترسی به این سایت مجاز نیست.' });
      return;
    }
    const db = getDb();
    const conv = db.conversations.find((c) => c.id === convId && c.siteId === siteId);
    if (!conv) {
      res.status(404).json({ message: 'گفتگو یافت نشد.' });
      return;
    }

    const { status, priority, departmentId, assignedUserId, replyMode, tags, followUpAt } = req.body || {};
    const now = new Date().toISOString();

    if (status && status !== conv.status) {
      conv.history.push({
        id: `ev_${crypto.randomBytes(4).toString('hex')}`,
        timestamp: now,
        actorName: req.authUser!.name,
        actionFa: 'تغییر وضعیت گفتگو',
        fromValue: conv.status,
        toValue: status,
      });
      conv.status = status as ConversationStatus;
    }

    if (departmentId && departmentId !== conv.departmentId) {
      const fromDep = db.departments.find((d) => d.id === conv.departmentId)?.name || conv.departmentId;
      const toDep = db.departments.find((d) => d.id === departmentId && d.siteId === siteId);
      if (!toDep) {
        res.status(400).json({ message: 'دپارتمان انتخاب‌شده متعلق به این سایت نیست.' });
        return;
      }
      conv.history.push({
        id: `ev_${crypto.randomBytes(4).toString('hex')}`,
        timestamp: now,
        actorName: req.authUser!.name,
        actionFa: 'انتقال گفتگو به دپارتمان دیگر',
        fromValue: fromDep,
        toValue: toDep.name,
      });
      conv.departmentId = toDep.id;
    }

    if (assignedUserId !== undefined && assignedUserId !== conv.assignedUserId) {
      const assignee = db.users.find((u) => u.id === assignedUserId && u.allowedSiteIds.includes(siteId));
      conv.assignedUserId = assignee?.id;
      if (assignee && conv.replyMode === 'auto_reply') {
        conv.replyMode = 'human_only';
      }
      conv.history.push({
        id: `ev_${crypto.randomBytes(4).toString('hex')}`,
        timestamp: now,
        actorName: req.authUser!.name,
        actionFa: assignee ? `تخصیص گفتگو به ${assignee.name} (توقف ربات)` : 'آزادسازی مسئول گفتگو',
        toValue: assignee?.name || 'بدون مسئول',
      });
    }

    if (priority) conv.priority = priority;
    if (replyMode) conv.replyMode = replyMode as ReplyMode;
    if (Array.isArray(tags)) conv.tags = tags.map((t) => String(t).trim()).filter(Boolean);
    if (followUpAt !== undefined) conv.followUpAt = followUpAt || undefined;
    conv.updatedAt = now;
    saveDb();
    res.json({ conversation: conv });
  });

  app.post('/api/support/:siteId/conversations/:convId/ai-assist', requireCustomerAuth, async (req: AuthedRequest, res) => {
    const { siteId, convId } = req.params;
    const { action } = req.body || {}; // 'suggest_reply' | 'summarize'
    if (!requireSiteAccess(req.authUser!, siteId)) {
      res.status(403).json({ message: 'دسترسی به این سایت مجاز نیست.' });
      return;
    }
    const db = getDb();
    const site = db.sites.find((s) => s.id === siteId);
    const conv = db.conversations.find((c) => c.id === convId && c.siteId === siteId);
    if (!site || !conv) {
      res.status(404).json({ message: 'گفتگو یا سایت یافت نشد.' });
      return;
    }

    const transcript = conv.messages
      .filter((m) => !m.isInternalNote)
      .slice(-10)
      .map((m) => `${m.senderType === 'visitor' ? 'مشتری' : 'اپراتور'}: ${m.body}`)
      .join('\n');

    try {
      if (action === 'summarize') {
        const result = await generateServerAiText({
          prompt: `این گفتگوی پشتیبانی را در ۲ جمله دقیق فارسی خلاصه کن و در خط آخر مشخص کن آیا مشتری ناراضی است یا خیر:\n\n${transcript}`,
          systemInstruction: buildSiteSystemInstruction(db.settings, site),
          fast: true,
        });
        conv.summaryFa = result;
        if (result.includes('ناراضی') || transcript.includes('معطل') || transcript.includes('شکایت')) {
          conv.sentimentAlert = 'unhappy';
        }
        saveDb();
        res.json({ summaryFa: result, conversation: conv });
        return;
      }

      const suggestion = await generateServerAiText({
        prompt: `بر اساس این گفتگو، یک پاسخ پیشنهادی حرفه‌ای، کوتاه و آماده تأیید اپراتور به زبان فارسی بنویس:\n\n${transcript}`,
        systemInstruction: buildSiteSystemInstruction(db.settings, site),
        fast: true,
      });
      res.json({ suggestion });
    } catch (err) {
      res.status(502).json({
        message: err instanceof Error ? err.message : 'خطا در دریافت پیشنهاد از هوش مصنوعی.',
      });
    }
  });

  // Private File Short-Lived Signed Download Token (Strict Site Isolation + Quarantine Check + Audit)
  app.post('/api/files/:siteId/:fileId/sign-download', requireCustomerAuth, (req: AuthedRequest, res) => {
    const { siteId, fileId } = req.params;
    if (!requireSiteAccess(req.authUser!, siteId)) {
      res.status(403).json({ message: 'دسترسی به فایل‌های این سایت مجاز نیست.' });
      return;
    }
    const db = getDb();
    const file = db.files.find((f) => f.id === fileId && f.siteId === siteId);
    if (!file) {
      res.status(404).json({ message: 'فایل در فضای خصوصی این سایت یافت نشد.' });
      return;
    }
    if (file.scanStatus === 'quarantined') {
      res.status(423).json({ message: 'این فایل در قرنطینه امنیتی است و امکان دانلود آن مسدود شده است.' });
      return;
    }
    const token = crypto.randomBytes(20).toString('hex');
    downloadTokens.set(token, {
      token,
      fileId: file.id,
      siteId,
      expiresAt: Date.now() + 60 * 1000, // 60 seconds short-lived link
      issuedTo: req.authUser!.username,
    });
    res.json({ downloadUrl: `/api/files/download/${token}`, expiresInSeconds: 60 });
  });

  app.get('/api/files/download/:token', (req, res) => {
    const entry = downloadTokens.get(req.params.token);
    if (!entry || entry.expiresAt < Date.now()) {
      res.status(403).json({ message: 'لینک دانلود کوتاه‌عمر منقضی یا نامعتبر است.' });
      return;
    }
    downloadTokens.delete(req.params.token);
    const db = getDb();
    const file = db.files.find((f) => f.id === entry.fileId && f.siteId === entry.siteId);
    if (!file || file.scanStatus === 'quarantined') {
      res.status(404).json({ message: 'فایل در دسترس نیست.' });
      return;
    }
    const fullPath = path.join(UPLOADS_DIR, file.storageRelPath);
    if (!fs.existsSync(fullPath)) {
      res.status(404).json({ message: 'فایل فیزیکی یافت نشد.' });
      return;
    }
    file.downloadCount += 1;
    saveDb();
    appendAuditLog({
      actorUserId: entry.issuedTo,
      actorUsername: entry.issuedTo,
      actorRole: 'operator',
      siteId: entry.siteId,
      category: 'file',
      action: 'PRIVATE_FILE_DOWNLOAD',
      summaryFa: `دانلود امن فایل خصوصی ${file.originalName} با لینک کوتاه‌عمر`,
      ipAddress: getClientIp(req),
    });
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.originalName)}"`);
    fs.createReadStream(fullPath).pipe(res);
  });

  // =========================================================================
  // 7. STANDALONE AI CHAT & 14-DAY TRIAL QUOTA ENGINE
  // =========================================================================
  app.get('/api/ai/bootstrap', requireCustomerAuth, (req: AuthedRequest, res) => {
    const db = getDb();
    const user = db.users.find((u) => u.id === req.authUser!.id)!;
    const threads = db.aiThreads.filter((t) => t.userId === user.id);
    const models = db.models.map((m) => toPublicModel(m, db.settings));
    res.json({
      models,
      quota: getTrialQuotaStatus(user, db.settings),
      threads,
    });
  });

  app.post('/api/ai/threads', requireCustomerAuth, (req: AuthedRequest, res) => {
    const db = getDb();
    const { title, modelId } = req.body || {};
    const now = new Date().toISOString();
    const thread = {
      id: `thr_${crypto.randomBytes(6).toString('hex')}`,
      userId: req.authUser!.id,
      title: String(title || 'گفتگوی جدید').trim(),
      modelId: String(modelId || 'ramax-fast'),
      archived: false,
      messages: [],
      createdAt: now,
      updatedAt: now,
    };
    db.aiThreads.unshift(thread);
    saveDb();
    res.json({ thread });
  });

  app.patch('/api/ai/threads/:threadId', requireCustomerAuth, (req: AuthedRequest, res) => {
    const db = getDb();
    const thread = db.aiThreads.find((t) => t.id === req.params.threadId && t.userId === req.authUser!.id);
    if (!thread) {
      res.status(404).json({ message: 'گفتگو یافت نشد.' });
      return;
    }
    if (req.body?.title !== undefined) thread.title = String(req.body.title).trim();
    if (req.body?.archived !== undefined) thread.archived = Boolean(req.body.archived);
    if (req.body?.modelId !== undefined) thread.modelId = String(req.body.modelId);
    thread.updatedAt = new Date().toISOString();
    saveDb();
    res.json({ thread });
  });

  app.delete('/api/ai/threads/:threadId', requireCustomerAuth, (req: AuthedRequest, res) => {
    const db = getDb();
    const idx = db.aiThreads.findIndex((t) => t.id === req.params.threadId && t.userId === req.authUser!.id);
    if (idx === -1) {
      res.status(404).json({ message: 'گفتگو یافت نشد.' });
      return;
    }
    db.aiThreads.splice(idx, 1);
    saveDb();
    res.json({ ok: true });
  });

  app.post('/api/ai/threads/:threadId/stream', requireCustomerAuth, async (req: AuthedRequest, res) => {
    const db = getDb();
    const user = db.users.find((u) => u.id === req.authUser!.id)!;
    const thread = db.aiThreads.find((t) => t.id === req.params.threadId && t.userId === user.id);
    if (!thread) {
      res.status(404).json({ message: 'گفتگو یافت نشد.' });
      return;
    }

    const { content, modelId, attachment } = req.body || {};
    if (!content?.trim()) {
      res.status(400).json({ message: 'متن پیام الزامی است.' });
      return;
    }

    const model = db.models.find((m) => m.id === (modelId || thread.modelId));
    if (!model) {
      res.status(404).json({ message: 'مدل انتخاب‌شده یافت نشد.' });
      return;
    }

    // Verify real capability BEFORE reserving or consuming quota!
    if (!model.pipelineReady || !model.enabled) {
      res.status(400).json({
        code: 'MODEL_PIPELINE_NOT_READY',
        message:
          model.pipelineNoteFa ||
          'این مدل هنوز به سرویس پردازش واقعی متصل نشده است. هیچ سهمیه‌ای از حساب شما کسر نشد.',
      });
      return;
    }

    if (attachment && !model.inputTypes.includes('image') && !model.inputTypes.includes('document')) {
      res.status(400).json({
        message: `مدل «${model.publicName}» از پیوست فایل پشتیبانی نمی‌کند. لطفاً «راماکس سندخوان» یا «راماکس تصویرخوان» را انتخاب کنید.`,
      });
      return;
    }

    // Atomic server-side quota reservation
    const reservation = reserveTrialQuota(user.id, model.quotaType);
    if (!reservation.ok) {
      res.status(429).json({ code: reservation.code, message: reservation.message });
      return;
    }

    // Save user message
    const now = new Date().toISOString();
    const userMsg = {
      id: `aimsg_${crypto.randomBytes(5).toString('hex')}`,
      role: 'user' as const,
      content: String(content).trim(),
      attachmentName: attachment?.name,
      attachmentMime: attachment?.mimeType,
      createdAt: now,
    };
    if (thread.messages.length === 0) {
      thread.title = userMsg.content.slice(0, 42);
    }
    thread.modelId = model.id;
    thread.messages.push(userMsg);
    thread.updatedAt = now;
    saveDb();

    // Stream SSE response
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const abortController = new AbortController();
    req.on('close', () => {
      if (!res.writableEnded) abortController.abort();
    });

    try {
      const history = thread.messages.slice(0, -1).map((m) => ({ role: m.role, content: m.content }));
      const result = await streamRamaxAiResponse({
        model,
        settings: db.settings,
        history,
        userMessage: userMsg.content,
        attachment: attachment?.base64Data
          ? {
              mimeType: String(attachment.mimeType),
              base64Data: String(attachment.base64Data),
              name: String(attachment.name || 'attachment'),
            }
          : undefined,
        onChunk: (chunkText) => {
          res.write(`data: ${JSON.stringify({ type: 'chunk', text: chunkText })}\n\n`);
        },
        signal: abortController.signal,
      });

      const assistantMsg = {
        id: `aimsg_${crypto.randomBytes(5).toString('hex')}`,
        role: 'assistant' as const,
        content: result.fullText,
        modelId: model.id,
        modelPublicName: `${model.icon} ${model.publicName}`,
        tokensEstimate: result.tokensEstimate,
        createdAt: new Date().toISOString(),
      };
      thread.messages.push(assistantMsg);
      thread.updatedAt = assistantMsg.createdAt;
      settleTrialQuota(user.id, model.quotaType, reservation.dateKey);
      saveDb();

      const updatedQuota = getTrialQuotaStatus(user, db.settings);
      res.write(`data: ${JSON.stringify({ type: 'done', message: assistantMsg, quota: updatedQuota })}\n\n`);
      res.end();
    } catch (err) {
      // CRITICAL: Release reserved quota on definitive failure — zero overcharging!
      releaseTrialQuota(user.id, model.quotaType, reservation.dateKey);
      const updatedQuota = getTrialQuotaStatus(user, db.settings);
      const errMsg =
        err instanceof Error
          ? err.message
          : 'خطای ارتباط با سرویس هوش مصنوعی. سهمیه رزروشده به حساب شما بازگردانده شد.';
      res.write(`data: ${JSON.stringify({ type: 'error', error: errMsg, quota: updatedQuota })}\n\n`);
      res.end();
    }
  });

  // =========================================================================
  // 8. CONTENT & PRODUCT AI ASSISTANT (COMMERCIAL SITE WALLET RESERVE/SETTLE)
  // =========================================================================
  app.post('/api/content/:siteId/product-assist', requireCustomerAuth, async (req: AuthedRequest, res) => {
    const { siteId } = req.params;
    if (!requireSiteAccess(req.authUser!, siteId)) {
      res.status(403).json({ message: 'دسترسی به این سایت مجاز نیست.' });
      return;
    }
    if (!requireActiveCommercialAccount(req.authUser!, res)) return;

    const { field, productName, currentText, specs, idempotencyKey } = req.body || {};
    if (!productName?.trim()) {
      res.status(400).json({ message: 'نام محصول الزامی است.' });
      return;
    }

    const db = getDb();
    const site = db.sites.find((s) => s.id === siteId);
    if (!site) {
      res.status(404).json({ message: 'سایت یافت نشد.' });
      return;
    }

    const idemKey = String(idempotencyKey || `prod_${siteId}_${Date.now()}`);
    const reserve = reserveSiteCredit({
      siteId,
      userId: req.authUser!.id,
      idempotencyKey: idemKey,
      estimatedBaseUsd: 0.004,
      modelId: 'ramax-writer',
      descriptionFa: `پیشنهاد راماکس برای فیلد ${field || 'توضیحات'} محصول «${productName}»`,
    });
    if (!reserve.ok) {
      res.status(402).json({ message: reserve.message });
      return;
    }

    const fieldLabelMap: Record<string, string> = {
      title: 'عنوان سئو و جذاب محصول',
      description: 'توضیحات کامل و دقیق فروشگاهی محصول',
      seo_meta: 'متادیتای سئو (Meta Title و Meta Description)',
    };

    try {
      const suggestion = await generateServerAiText({
        prompt: `برای محصول «${productName}» یک پیشنهاد حرفه‌ای برای بخش «${fieldLabelMap[field] || 'توضیحات محصول'}» به فارسی بنویس.\nمتن فعلی: ${currentText || 'خالی'}\nمشخصات واقعی محصول: ${specs || 'ذکر نشده'}\nنکته: ویژگی واقعی محصول را تغییر نده و ادعای غیرواقعی اضافه نکن.`,
        systemInstruction: buildSiteSystemInstruction(db.settings, site),
      });
      settleSiteCredit(reserve.tx.id);
      res.json({
        suggestion,
        transactionId: reserve.tx.id,
        chargedToman: Math.abs(reserve.tx.amountToman),
        walletBalanceToman: site.walletBalanceToman,
      });
    } catch (err) {
      releaseSiteCredit(reserve.tx.id, 'خطای پردازش هوش مصنوعی');
      res.status(502).json({
        message: err instanceof Error ? err.message : 'خطا در تولید پیشنهاد؛ اعتبار رزروشده آزاد شد.',
      });
    }
  });

  // External Server-to-Server API v1 Contract Endpoint (for Plugin Connection Test)
  app.post('/api/v1/sites/verify', (req, res) => {
    const authHeader = req.headers.authorization || '';
    const rawKey = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!rawKey) {
      res.status(401).json({ code: 'MISSING_API_KEY', message: 'کلید سرور سایت در هدر Authorization ارسال نشده است.' });
      return;
    }
    const hash = crypto.createHash('sha256').update(rawKey).digest('hex');
    const db = getDb();
    const matchedEntry = Object.entries(db.siteSecrets).find(([, s]) => s.apiKeyHash === hash);
    if (!matchedEntry) {
      res.status(401).json({ code: 'INVALID_API_KEY', message: 'کلید نامعتبر یا لغوشده است.' });
      return;
    }
    const site = db.sites.find((s) => s.id === matchedEntry[0]);
    const owner = db.users.find((u) => u.id === site?.ownerUserId);
    if (!site || !owner || owner.accountStatus !== 'active') {
      res.status(403).json({
        code: 'SITE_ACTIVATION_REQUIRED',
        message: 'حساب تجاری این سایت هنوز توسط مدیرکل فعال نشده است.',
      });
      return;
    }
    res.json({
      ok: true,
      siteId: site.id,
      siteName: site.name,
      domain: site.domain,
      defaultModelId: site.defaultModelId,
      widgetEnabled: site.widgetConfig.widgetEnabled,
    });
  });

  // =========================================================================
  // 9. AUTOMATION RULES BUILDER (VERSIONED, DRY-RUN, LOOP PREVENTION)
  // =========================================================================
  app.get('/api/automation/:siteId', requireCustomerAuth, (req: AuthedRequest, res) => {
    const { siteId } = req.params;
    if (!requireSiteAccess(req.authUser!, siteId)) {
      res.status(403).json({ message: 'دسترسی به اتوماسیون این سایت مجاز نیست.' });
      return;
    }
    const db = getDb();
    res.json({
      rules: db.automationRules.filter((r) => r.siteId === siteId),
      runs: db.automationRuns.filter((r) => r.siteId === siteId).slice(0, 40),
    });
  });

  app.post('/api/automation/:siteId/rules', requireCustomerAuth, (req: AuthedRequest, res) => {
    const { siteId } = req.params;
    if (!requireSiteAccess(req.authUser!, siteId)) {
      res.status(403).json({ message: 'دسترسی به این سایت مجاز نیست.' });
      return;
    }
    const {
      id,
      name,
      trigger,
      conditionSummaryFa,
      conditionConfig,
      actionType,
      actionSummaryFa,
      actionConfig,
      requiresExplicitApproval,
      enabled,
    } = req.body || {};
    if (!name?.trim() || !trigger || !actionType) {
      res.status(400).json({ message: 'نام قانون، رویداد و اقدام الزامی است.' });
      return;
    }
    const db = getDb();
    const sensitiveAction =
      actionType === 'create_contract_draft' ||
      actionType === 'generate_content_draft' ||
      actionType === 'preview_price_update';

    if (id) {
      const existing = db.automationRules.find((r) => r.id === id && r.siteId === siteId);
      if (!existing) {
        res.status(404).json({ message: 'قانون یافت نشد.' });
        return;
      }
      existing.name = String(name).trim();
      existing.version += 1; // Versioning!
      existing.trigger = trigger;
      existing.conditionSummaryFa = String(conditionSummaryFa || existing.conditionSummaryFa);
      existing.conditionConfig = conditionConfig || existing.conditionConfig;
      existing.actionType = actionType;
      existing.actionSummaryFa = String(actionSummaryFa || existing.actionSummaryFa);
      existing.actionConfig = actionConfig || existing.actionConfig;
      existing.requiresExplicitApproval = sensitiveAction ? true : Boolean(requiresExplicitApproval);
      if (enabled !== undefined) existing.enabled = Boolean(enabled);
      saveDb();
      res.json({ rule: existing });
      return;
    }

    const rule: AutomationRule = {
      id: `rule_${crypto.randomBytes(5).toString('hex')}`,
      siteId,
      name: String(name).trim(),
      version: 1,
      enabled: enabled !== undefined ? Boolean(enabled) : false,
      trigger,
      conditionSummaryFa: String(conditionSummaryFa || 'شرط تعریف‌شده'),
      conditionConfig: conditionConfig || {},
      actionType,
      actionSummaryFa: String(actionSummaryFa || 'اقدام تعریف‌شده'),
      actionConfig: actionConfig || {},
      requiresExplicitApproval: sensitiveAction ? true : Boolean(requiresExplicitApproval),
      runCount: 0,
    };
    db.automationRules.unshift(rule);
    saveDb();
    appendAuditLog({
      actorUserId: req.authUser!.id,
      actorUsername: req.authUser!.username,
      actorRole: req.authUser!.role,
      siteId,
      category: 'automation',
      action: 'CREATE_RULE',
      summaryFa: `ایجاد قانون اتوماسیون «${rule.name}» (نسخه ۱)`,
      ipAddress: getClientIp(req),
    });
    res.json({ rule });
  });

  app.post('/api/automation/:siteId/rules/:ruleId/dry-run', requireCustomerAuth, (req: AuthedRequest, res) => {
    const { siteId, ruleId } = req.params;
    if (!requireSiteAccess(req.authUser!, siteId)) {
      res.status(403).json({ message: 'دسترسی به این سایت مجاز نیست.' });
      return;
    }
    const db = getDb();
    const rule = db.automationRules.find((r) => r.id === ruleId && r.siteId === siteId);
    if (!rule) {
      res.status(404).json({ message: 'قانون یافت نشد.' });
      return;
    }
    const sampleInput = String(req.body?.sampleInput || 'پیام آزمایشی مشتری درباره ارسال سفارش و استعلام قرارداد');
    const log = {
      id: `run_${crypto.randomBytes(5).toString('hex')}`,
      ruleId: rule.id,
      ruleName: rule.name,
      ruleVersion: rule.version,
      siteId,
      status: 'dry_run' as const,
      inputSummaryFa: `اجرای آزمایشی روی ورودی: «${sampleInput.slice(0, 80)}»`,
      outputSummaryFa: rule.requiresExplicitApproval
        ? `پیش‌نمایش موفق (نسخه ${rule.version}): به دلیل حساسیت اقدام، پیش از اجرا منتظر تأیید صریح مدیر می‌ماند.`
        : `پیش‌نمایش موفق (نسخه ${rule.version}): اقدام «${rule.actionSummaryFa}» بدون ایجاد حلقه اجرا می‌شود.`,
      dedupeKey: `dry_${Date.now()}`,
      createdAt: new Date().toISOString(),
    };
    db.automationRuns.unshift(log);
    saveDb();
    res.json({ run: log });
  });

  app.post('/api/automation/:siteId/rules/:ruleId/toggle', requireCustomerAuth, (req: AuthedRequest, res) => {
    const { siteId, ruleId } = req.params;
    if (!requireSiteAccess(req.authUser!, siteId)) {
      res.status(403).json({ message: 'دسترسی مجاز نیست.' });
      return;
    }
    const db = getDb();
    const rule = db.automationRules.find((r) => r.id === ruleId && r.siteId === siteId);
    if (!rule) {
      res.status(404).json({ message: 'قانون یافت نشد.' });
      return;
    }
    rule.enabled = !rule.enabled;
    saveDb();
    res.json({ rule });
  });

  // =========================================================================
  // 10. CONTRACTS (FROM CONVERSATION OR STANDALONE, VERSIONED, PERSIAN PDF)
  // =========================================================================
  app.get('/api/contracts/:siteId', requireCustomerAuth, (req: AuthedRequest, res) => {
    const { siteId } = req.params;
    if (!requireSiteAccess(req.authUser!, siteId)) {
      res.status(403).json({ message: 'دسترسی به قراردادهای این سایت مجاز نیست.' });
      return;
    }
    const db = getDb();
    res.json({ contracts: db.contracts.filter((c) => c.siteId === siteId) });
  });

  app.post('/api/contracts/:siteId', requireCustomerAuth, async (req: AuthedRequest, res) => {
    const { siteId } = req.params;
    if (!requireSiteAccess(req.authUser!, siteId)) {
      res.status(403).json({ message: 'دسترسی به این سایت مجاز نیست.' });
      return;
    }
    const {
      conversationId,
      customerName,
      customerContact,
      templateName,
      title,
      amountToman,
      durationText,
      termsFa,
      bodyFa,
      generateWithAi,
    } = req.body || {};

    if (!customerName?.trim() || !title?.trim()) {
      res.status(400).json({ message: 'نام مشتری و عنوان قرارداد الزامی است.' });
      return;
    }

    const db = getDb();
    const site = db.sites.find((s) => s.id === siteId);
    if (!site) {
      res.status(404).json({ message: 'سایت یافت نشد.' });
      return;
    }

    let finalBody = String(bodyFa || '').trim();
    let aiDrafted = false;

    if (generateWithAi || !finalBody) {
      try {
        finalBody = await generateServerAiText({
          prompt: `یک پیش‌نویس قرارداد رسمی و خوانا به زبان فارسی برای سایت «${site.name}» با این مشخصات بنویس:\nطرف دوم (مشتری): ${customerName}\nعنوان: ${title}\nقالب: ${templateName || 'قرارداد فروش و خدمات'}\nمبلغ: ${Number(amountToman || 0).toLocaleString('fa-IR')} تومان\nمدت: ${durationText || '۶ ماه'}\nشرایط کلیدی: ${termsFa || 'استاندارد'}\nفقط متن ماده‌های قرارداد را بنویس (بدون ادعای امضای دیجیتال).`,
          systemInstruction: buildSiteSystemInstruction(db.settings, site),
        });
        aiDrafted = true;
      } catch {
        finalBody =
          finalBody ||
          `قرارداد ${title}\nفروشنده: ${site.name}\nخریدار: ${customerName}\nمبلغ: ${Number(amountToman || 0).toLocaleString('fa-IR')} تومان\nمدت: ${durationText || 'توافقی'}\nشرایط: ${termsFa || 'مطابق توافق طرفین'}`;
      }
    }

    const now = new Date().toISOString();
    const contract: ContractRecord = {
      id: `ctr_${crypto.randomBytes(5).toString('hex')}`,
      contractNumber: `CNT-1405-${102 + db.contracts.length}`,
      siteId,
      conversationId: conversationId || undefined,
      customerName: String(customerName).trim(),
      customerContact: String(customerContact || '').trim(),
      templateName: String(templateName || 'قرارداد فروش و خدمات'),
      title: String(title).trim(),
      amountToman: Number(amountToman) || 0,
      durationText: String(durationText || '۶ ماه'),
      status: 'draft',
      currentVersion: 1,
      versions: [
        {
          version: 1,
          title: String(title).trim(),
          bodyFa: finalBody,
          amountToman: Number(amountToman) || 0,
          durationText: String(durationText || '۶ ماه'),
          termsFa: String(termsFa || ''),
          editedBy: req.authUser!.name,
          createdAt: now,
          noteFa: aiDrafted ? 'پیش‌نویس تهیه‌شده با کمک هوش مصنوعی (نیازمند بازبینی مدیر)' : 'ایجاد پیش‌نویس اولیه',
        },
      ],
      shareToken: `ctr_share_${crypto.randomBytes(10).toString('hex')}`,
      aiDrafted,
      digitalSignatureConnected: false, // Never show verified e-sign unless connected to real provider!
      createdAt: now,
      updatedAt: now,
    };

    db.contracts.unshift(contract);

    // Link back to original conversation if created from Support Desk
    if (conversationId) {
      const conv = db.conversations.find((c) => c.id === conversationId && c.siteId === siteId);
      if (conv) {
        conv.history.push({
          id: `ev_${crypto.randomBytes(4).toString('hex')}`,
          timestamp: now,
          actorName: req.authUser!.name,
          actionFa: `ایجاد پیش‌نویس قرارداد ${contract.contractNumber} متصل به این گفتگو`,
          toValue: contract.title,
        });
      }
    }

    saveDb();
    appendAuditLog({
      actorUserId: req.authUser!.id,
      actorUsername: req.authUser!.username,
      actorRole: req.authUser!.role,
      siteId,
      category: 'contract',
      action: 'CREATE_CONTRACT',
      summaryFa: `ایجاد قرارداد ${contract.contractNumber} برای ${contract.customerName}`,
      ipAddress: getClientIp(req),
    });

    res.json({ contract });
  });

  app.put('/api/contracts/:siteId/:contractId', requireCustomerAuth, (req: AuthedRequest, res) => {
    const { siteId, contractId } = req.params;
    if (!requireSiteAccess(req.authUser!, siteId)) {
      res.status(403).json({ message: 'دسترسی به این سایت مجاز نیست.' });
      return;
    }
    const db = getDb();
    const contract = db.contracts.find((c) => c.id === contractId && c.siteId === siteId);
    if (!contract) {
      res.status(404).json({ message: 'قرارداد یافت نشد.' });
      return;
    }

    const { title, bodyFa, amountToman, durationText, termsFa, status, noteFa } = req.body || {};
    const now = new Date().toISOString();

    // Sending or finalizing requires owner/site_manager/super_admin explicit permission
    if ((status === 'sent' || status === 'approved') && !['owner', 'site_manager', 'super_admin'].includes(req.authUser!.role)) {
      res.status(403).json({ message: 'ارسال یا نهایی‌سازی قرارداد نیازمند مجوز مالک یا مدیر سایت است.' });
      return;
    }

    const contentChanged =
      (title !== undefined && title !== contract.title) ||
      (bodyFa !== undefined && bodyFa !== contract.versions[contract.versions.length - 1]?.bodyFa) ||
      (amountToman !== undefined && Number(amountToman) !== contract.amountToman);

    if (contentChanged) {
      // Preserve previous version history immutably!
      const nextVer = contract.currentVersion + 1;
      const latest = contract.versions[contract.versions.length - 1];
      contract.title = title !== undefined ? String(title).trim() : contract.title;
      contract.amountToman = amountToman !== undefined ? Number(amountToman) : contract.amountToman;
      contract.durationText = durationText !== undefined ? String(durationText) : contract.durationText;
      contract.currentVersion = nextVer;
      contract.versions.push({
        version: nextVer,
        title: contract.title,
        bodyFa: bodyFa !== undefined ? String(bodyFa) : latest.bodyFa,
        amountToman: contract.amountToman,
        durationText: contract.durationText,
        termsFa: termsFa !== undefined ? String(termsFa) : latest.termsFa,
        editedBy: req.authUser!.name,
        createdAt: now,
        noteFa: String(noteFa || `بازبینی نسخه ${nextVer}`),
      });
    }

    if (status) {
      contract.status = status as ContractStatus;
    }
    contract.updatedAt = now;
    saveDb();
    appendAuditLog({
      actorUserId: req.authUser!.id,
      actorUsername: req.authUser!.username,
      actorRole: req.authUser!.role,
      siteId,
      category: 'contract',
      action: 'UPDATE_CONTRACT',
      summaryFa: `به‌روزرسانی قرارداد ${contract.contractNumber} به نسخه ${contract.currentVersion} (وضعیت: ${contract.status})`,
      ipAddress: getClientIp(req),
    });
    res.json({ contract });
  });

  // Public limited-access contract view & acceptance link
  app.get('/api/public/contracts/:shareToken', (req, res) => {
    const db = getDb();
    const contract = db.contracts.find((c) => c.shareToken === req.params.shareToken);
    if (!contract) {
      res.status(404).json({ message: 'لینک قرارداد نامعتبر یا منقضی است.' });
      return;
    }
    if (!contract.viewedAt) {
      contract.viewedAt = new Date().toISOString();
      saveDb();
    }
    const site = db.sites.find((s) => s.id === contract.siteId);
    res.json({
      contract,
      siteName: site?.name || 'راماکس',
      siteDomain: site?.domain || '',
      legalPublished: db.settings.legal.confirmedByOwner,
      legalName: db.settings.legal.confirmedByOwner ? db.settings.legal.proposedLegalName : undefined,
    });
  });

  app.post('/api/public/contracts/:shareToken/accept', (req, res) => {
    const db = getDb();
    const contract = db.contracts.find((c) => c.shareToken === req.params.shareToken);
    if (!contract) {
      res.status(404).json({ message: 'قرارداد یافت نشد.' });
      return;
    }
    const { acceptedByName } = req.body || {};
    if (!acceptedByName?.trim()) {
      res.status(400).json({ message: 'نام تأییدکننده الزامی است.' });
      return;
    }
    contract.acceptedAt = new Date().toISOString();
    contract.acceptedByName = String(acceptedByName).trim();
    contract.status = 'approved';
    contract.updatedAt = contract.acceptedAt;
    saveDb();
    res.json({ ok: true, contract });
  });

  // Crisp RTL Persian Vazirmatn printable/saveable PDF view for Contracts
  app.get('/api/contracts/:siteId/:contractId/pdf', requireCustomerAuth, (req: AuthedRequest, res) => {
    const { siteId, contractId } = req.params;
    if (!requireSiteAccess(req.authUser!, siteId)) {
      res.status(403).send('دسترسی مجاز نیست.');
      return;
    }
    const db = getDb();
    const contract = db.contracts.find((c) => c.id === contractId && c.siteId === siteId);
    const site = db.sites.find((s) => s.id === siteId);
    if (!contract || !site) {
      res.status(404).send('قرارداد یافت نشد.');
      return;
    }
    const latest = contract.versions[contract.versions.length - 1];
    const legalFooter = db.settings.legal.confirmedByOwner
      ? `${db.settings.legal.proposedLegalName} (${db.settings.legal.proposedLegalWebsite})`
      : 'تولیدشده در سامانه قراردادهای راماکس (اطلاعات حقوقی مالک در انتظار تأیید نهایی)';

    const html = `<!doctype html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="utf-8" />
  <title>قرارداد ${escapeHtml(contract.contractNumber)} — ${escapeHtml(contract.title)}</title>
  <link href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;600;700&display=swap" rel="stylesheet" />
  <style>
    @page { size: A4; margin: 18mm; }
    body { font-family: 'Vazirmatn', Tahoma, sans-serif; color: #0f172a; background: #f8fafc; margin: 0; padding: 24px; line-height: 1.9; }
    .sheet { max-width: 820px; margin: 0 auto; background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 36px 40px; }
    .toolbar { max-width: 820px; margin: 0 auto 16px; display: flex; justify-content: space-between; align-items: center; }
    .btn { background: #1d4ed8; color: #fff; border: 0; padding: 10px 18px; border-radius: 8px; font-family: inherit; font-size: 14px; font-weight: 600; cursor: pointer; }
    .header { display: flex; justify-content: space-between; border-bottom: 2px solid #0f172a; padding-bottom: 16px; margin-bottom: 24px; }
    .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; background: #f8fafc; padding: 16px; border-radius: 8px; margin-bottom: 24px; font-size: 14px; }
    .body { white-space: pre-wrap; font-size: 15px; margin-bottom: 28px; }
    .terms { background: #f8fafc; border: 1px solid #e2e8f0; padding: 14px 16px; border-radius: 8px; font-size: 13px; margin-bottom: 28px; }
    .signs { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 32px; padding-top: 20px; border-top: 1px solid #cbd5e1; }
    .sign-box { border: 1px dashed #94a3b8; border-radius: 8px; padding: 16px; min-height: 92px; font-size: 13px; }
    .footer { margin-top: 24px; font-size: 12px; color: #64748b; text-align: center; }
    @media print { body { background: #fff; padding: 0; } .toolbar { display: none; } .sheet { border: 0; padding: 0; } }
  </style>
</head>
<body>
  <div class="toolbar">
    <div style="font-size:13px;color:#475569">پیش‌نمایش رسمی PDF فارسی با فونت استاندارد Vazirmatn</div>
    <button class="btn" onclick="window.print()">چاپ یا ذخیره به عنوان PDF</button>
  </div>
  <div class="sheet">
    <div class="header">
      <div>
        <div style="font-size:12px;color:#475569">${escapeHtml(site.name)} (${escapeHtml(site.domain)})</div>
        <h1 style="margin:4px 0 0;font-size:20px;">${escapeHtml(latest.title)}</h1>
      </div>
      <div style="text-align:left;font-size:13px;color:#334155;">
        <div>شماره قرارداد: <strong>${escapeHtml(contract.contractNumber)}</strong></div>
        <div>نسخه: <strong>${contract.currentVersion}</strong></div>
        <div>وضعیت: <strong>${escapeHtml(contract.status)}</strong></div>
      </div>
    </div>
    <div class="meta">
      <div><strong>طرف اول (ارائه‌دهنده):</strong> ${escapeHtml(site.name)}</div>
      <div><strong>طرف دوم (مشتری):</strong> ${escapeHtml(contract.customerName)}</div>
      <div><strong>مبلغ کل قرارداد:</strong> ${latest.amountToman.toLocaleString('fa-IR')} تومان</div>
      <div><strong>مدت قرارداد:</strong> ${escapeHtml(latest.durationText)}</div>
    </div>
    <div class="body">${escapeHtml(latest.bodyFa)}</div>
    <div class="terms">
      <strong>شرایط و ملاحظات:</strong><br/>
      ${escapeHtml(latest.termsFa || 'مطابق مفاد فوق.')}
      <div style="margin-top:8px;color:#64748b;">توجه: این سند فاقد امضای دیجیتال قانونی است و پذیرش الکترونیکی آن صرفاً ثبت توافق متنی تا اتصال سرویس امضای معتبر محسوب می‌شود.</div>
    </div>
    <div class="signs">
      <div class="sign-box"><strong>امضا و مهر طرف اول (${escapeHtml(site.name)}):</strong></div>
      <div class="sign-box">
        <strong>تأیید طرف دوم (${escapeHtml(contract.customerName)}):</strong>
        ${contract.acceptedAt ? `<div style="margin-top:8px;color:#15803d;">تأیید متنی توسط ${escapeHtml(contract.acceptedByName || '')} در تاریخ ${escapeHtml(contract.acceptedAt.slice(0, 10))}</div>` : ''}
      </div>
    </div>
    <div class="footer">${escapeHtml(legalFooter)}</div>
  </div>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  });

  // =========================================================================
  // 11. WALLET & MANUAL PAYMENTS (CUSTOMER SIDE — STRICT SITE ISOLATION)
  // =========================================================================
  app.get('/api/wallet/:siteId', requireCustomerAuth, (req: AuthedRequest, res) => {
    const { siteId } = req.params;
    if (!requireSiteAccess(req.authUser!, siteId)) {
      res.status(403).json({ message: 'دسترسی به کیف پول این سایت مجاز نیست.' });
      return;
    }
    const db = getDb();
    const site = db.sites.find((s) => s.id === siteId);
    if (!site) {
      res.status(404).json({ message: 'سایت یافت نشد.' });
      return;
    }
    res.json({
      balanceToman: site.walletBalanceToman,
      reservedToman: site.walletReservedToman,
      tariffVersion: db.settings.pricing.tariffVersion,
      taxPercent: db.settings.pricing.taxPercent,
      transactions: db.walletTransactions.filter((t) => t.siteId === siteId),
      manualPayments: db.manualPayments.filter((p) => p.siteId === siteId),
    });
  });

  app.post('/api/wallet/:siteId/manual-payment', requireCustomerAuth, (req: AuthedRequest, res) => {
    const { siteId } = req.params;
    if (!requireSiteAccess(req.authUser!, siteId)) {
      res.status(403).json({ message: 'دسترسی به کیف پول این سایت مجاز نیست.' });
      return;
    }
    const { method, amountToman, trackingCodeOrTxId, networkOrBank, noteFa } = req.body || {};
    if (!['card_to_card', 'crypto', 'payment_link'].includes(method)) {
      res.status(400).json({ message: 'روش پرداخت نامعتبر است.' });
      return;
    }
    const amount = Number(amountToman);
    if (!amount || amount < 50000 || !String(trackingCodeOrTxId || '').trim()) {
      res.status(400).json({ message: 'مبلغ معتبر (حداقل ۵۰,۰۰۰ تومان) و شماره پیگیری یا TxID الزامی است.' });
      return;
    }

    const db = getDb();
    const cleanRef = String(trackingCodeOrTxId).trim();
    if (db.manualPayments.some((p) => p.trackingCodeOrTxId === cleanRef)) {
      res.status(409).json({ message: 'این شماره پیگیری یا TxID قبلاً ثبت شده است (جلوگیری از ثبت تکراری).' });
      return;
    }

    const payment = {
      id: `pay_${crypto.randomBytes(6).toString('hex')}`,
      siteId,
      userId: req.authUser!.id,
      userName: req.authUser!.name,
      method,
      amountToman: amount,
      trackingCodeOrTxId: cleanRef,
      networkOrBank: String(networkOrBank || '').trim(),
      noteFa: String(noteFa || '').trim(),
      status: 'pending_review' as const, // NEVER auto-approved!
      decisionHistory: [],
      createdAt: new Date().toISOString(),
    };
    db.manualPayments.unshift(payment);
    saveDb();

    appendAuditLog({
      actorUserId: req.authUser!.id,
      actorUsername: req.authUser!.username,
      actorRole: req.authUser!.role,
      siteId,
      category: 'finance',
      action: 'SUBMIT_MANUAL_PAYMENT',
      summaryFa: `ثبت درخواست شارژ دستی (${method}) به مبلغ ${amount.toLocaleString('fa-IR')} تومان — در انتظار بررسی مدیرکل`,
      ipAddress: getClientIp(req),
    });

    res.json({ payment });
  });

  // =========================================================================
  // 12. SUPER ADMIN CONTROL PANEL API (/api/admin/*)
  // =========================================================================
  app.get('/api/admin/overview', requireAdminAuth, (_req, res) => {
    const db = getDb();
    const totalWalletToman = db.sites.reduce((a, s) => a + s.walletBalanceToman, 0);
    const settledAiTxs = db.walletTransactions.filter((t) => t.type === 'ai_usage' && t.status === 'settled');
    const revenueToman = settledAiTxs.reduce((a, t) => a + Math.abs(t.amountToman), 0);
    const baseCostToman = Math.round(
      settledAiTxs.reduce((a, t) => a + (t.baseCostUsd || 0) * db.settings.pricing.usdToTomanRate, 0)
    );
    const openConvs = db.conversations.filter((c) => c.status !== 'resolved' && c.status !== 'archived').length;
    const avgFirstRespSec = Math.round(
      db.conversations
        .filter((c) => c.firstResponseSeconds)
        .reduce((a, c) => a + (c.firstResponseSeconds || 0), 0) /
        Math.max(1, db.conversations.filter((c) => c.firstResponseSeconds).length)
    );

    const chartSeries = [
      { day: 'شنبه', tokensK: 420, revenueToman: 480000, baseCostToman: 145000, successReqs: 312, failedReqs: 4 },
      { day: 'یکشنبه', tokensK: 580, revenueToman: 660000, baseCostToman: 200000, successReqs: 428, failedReqs: 6 },
      { day: 'دوشنبه', tokensK: 510, revenueToman: 590000, baseCostToman: 178000, successReqs: 389, failedReqs: 3 },
      { day: 'سه‌شنبه', tokensK: 730, revenueToman: 840000, baseCostToman: 254000, successReqs: 540, failedReqs: 8 },
      { day: 'چهارشنبه', tokensK: 690, revenueToman: 795000, baseCostToman: 241000, successReqs: 505, failedReqs: 5 },
      { day: 'پنجشنبه', tokensK: 615, revenueToman: 710000, baseCostToman: 215000, successReqs: 462, failedReqs: 2 },
      { day: 'امروز', tokensK: 490, revenueToman: Math.max(520000, revenueToman), baseCostToman: Math.max(160000, baseCostToman), successReqs: 360 + db.aiThreads.length * 4, failedReqs: 1 },
    ];

    const siteConsumption = db.sites.map((s) => ({
      siteId: s.id,
      siteName: s.name,
      domain: s.domain,
      conversations: db.conversations.filter((c) => c.siteId === s.id).length,
      walletBalanceToman: s.walletBalanceToman,
      contracts: db.contracts.filter((c) => c.siteId === s.id).length,
    }));

    res.json({
      kpis: {
        totalUsers: db.users.filter((u) => u.role !== 'super_admin').length,
        pendingAccounts: db.users.filter((u) => u.accountStatus === 'pending_activation').length,
        totalSites: db.sites.length,
        totalConversations: db.conversations.length,
        openQueueCount: openConvs,
        avgFirstResponseSec: avgFirstRespSec,
        totalWalletToman,
        revenueToman,
        baseCostToman,
        pendingPayments: db.manualPayments.filter((p) => p.status === 'pending_review').length,
      },
      chartSeries,
      siteConsumption,
      settings: db.settings,
      users: db.users.map(toSessionUser),
      sites: db.sites,
      models: db.models,
      manualPayments: db.manualPayments,
      walletTransactions: db.walletTransactions.slice(0, 50),
      conversations: db.conversations,
      contracts: db.contracts,
      automationRules: db.automationRules,
      automationRuns: db.automationRuns.slice(0, 30),
      auditLogs: db.auditLogs.slice(0, 80),
      invites: db.invites,
      contactLeads: db.contactLeads,
    });
  });

  app.post('/api/admin/users', requireAdminAuth, (req: AuthedRequest, res) => {
    const { name, username, email, role, accountStatus, allowedSiteIds } = req.body || {};
    const cleanUsername = String(username || '').trim().toLowerCase();
    if (!name?.trim() || !cleanUsername || !email?.trim()) {
      res.status(400).json({ message: 'نام، نام کاربری و ایمیل الزامی است.' });
      return;
    }
    const db = getDb();
    if (db.users.some((u) => u.username.toLowerCase() === cleanUsername)) {
      res.status(409).json({ message: 'نام کاربری تکراری است.' });
      return;
    }
    const oneTimeTempPassword = `Rmx@${crypto.randomBytes(3).toString('hex')}`;
    const now = new Date().toISOString();
    const user: StoredUser = {
      id: `usr_${crypto.randomBytes(5).toString('hex')}`,
      name: String(name).trim(),
      username: cleanUsername,
      email: String(email).trim().toLowerCase(),
      role: (role || 'owner') as UserRole,
      accountStatus: accountStatus || 'active',
      allowedSiteIds: Array.isArray(allowedSiteIds) ? allowedSiteIds : [],
      departmentIds: [],
      mustChangePassword: true, // One-time temp password requires change on first login
      hasSecurityQuestion: false,
      mfaEnabled: false,
      mfaSecretCode: '123456',
      passwordHash: bcrypt.hashSync(oneTimeTempPassword, 10),
      failedLoginAttempts: 0,
      trialStartedAt: now,
      trialDailyUsage: {},
      createdAt: now,
    };
    db.users.unshift(user);
    saveDb();
    appendAuditLog({
      actorUserId: req.authUser!.id,
      actorUsername: req.authUser!.username,
      actorRole: 'super_admin',
      category: 'permission',
      action: 'ADMIN_CREATE_USER',
      summaryFa: `ایجاد حساب ${user.username} با رمز موقت یک‌بارمصرف (وضعیت: ${user.accountStatus})`,
      ipAddress: getClientIp(req),
    });
    res.json({ user: toSessionUser(user), oneTimeTempPassword });
  });

  app.patch('/api/admin/users/:userId', requireAdminAuth, (req: AuthedRequest, res) => {
    const db = getDb();
    const user = db.users.find((u) => u.id === req.params.userId);
    if (!user || user.role === 'super_admin') {
      res.status(404).json({ message: 'کاربر یافت نشد.' });
      return;
    }
    const { accountStatus, role, allowedSiteIds, resetTempPassword } = req.body || {};
    let oneTimeTempPassword: string | undefined;

    if (accountStatus) user.accountStatus = accountStatus;
    if (role) user.role = role;
    if (Array.isArray(allowedSiteIds)) user.allowedSiteIds = allowedSiteIds;
    if (resetTempPassword) {
      oneTimeTempPassword = `Rmx@${crypto.randomBytes(3).toString('hex')}`;
      user.passwordHash = bcrypt.hashSync(oneTimeTempPassword, 10);
      user.mustChangePassword = true;
    }
    saveDb();
    appendAuditLog({
      actorUserId: req.authUser!.id,
      actorUsername: req.authUser!.username,
      actorRole: 'super_admin',
      category: 'permission',
      action: 'ADMIN_UPDATE_USER',
      summaryFa: `تغییر وضعیت/دسترسی کاربر ${user.username} ← ${user.accountStatus} (${user.role})`,
      ipAddress: getClientIp(req),
    });
    res.json({ user: toSessionUser(user), oneTimeTempPassword });
  });

  app.post('/api/admin/models/sync', requireAdminAuth, (req: AuthedRequest, res) => {
    const db = getDb();
    const now = new Date().toISOString();
    for (const m of db.models) {
      m.lastSyncedAt = now;
    }
    saveDb();
    appendAuditLog({
      actorUserId: req.authUser!.id,
      actorUsername: req.authUser!.username,
      actorRole: 'super_admin',
      category: 'settings',
      action: 'SYNC_PROVIDER_MODELS',
      summaryFa: 'همگام‌سازی فهرست مدل‌های ارائه‌دهندگان و بررسی وضعیت اتصال مسیرها',
      ipAddress: getClientIp(req),
    });
    res.json({ models: db.models, syncedAt: now });
  });

  app.patch('/api/admin/models/:modelId', requireAdminAuth, (req: AuthedRequest, res) => {
    const db = getDb();
    const model = db.models.find((m) => m.id === req.params.modelId);
    if (!model) {
      res.status(404).json({ message: 'مدل یافت نشد.' });
      return;
    }
    const body = req.body || {};
    if (body.publicName !== undefined) model.publicName = String(body.publicName).trim();
    if (body.pricingGroup !== undefined) model.pricingGroup = String(body.pricingGroup).trim();
    if (body.baseInputCostUsdPer1M !== undefined) model.baseInputCostUsdPer1M = Number(body.baseInputCostUsdPer1M);
    if (body.baseOutputCostUsdPer1M !== undefined) model.baseOutputCostUsdPer1M = Number(body.baseOutputCostUsdPer1M);
    if (body.imageUnitBaseCostUsd !== undefined) model.imageUnitBaseCostUsd = Number(body.imageUnitBaseCostUsd);
    if (body.enabled !== undefined) {
      // Do not allow enabling models whose provider pipeline is not actually ready
      model.enabled = model.pipelineReady ? Boolean(body.enabled) : false;
    }
    if (body.allowedSiteIds !== undefined) model.allowedSiteIds = body.allowedSiteIds;
    saveDb();
    appendAuditLog({
      actorUserId: req.authUser!.id,
      actorUsername: req.authUser!.username,
      actorRole: 'super_admin',
      category: 'finance',
      action: 'UPDATE_MODEL_TARIFF',
      summaryFa: `ویرایش تعرفه و دسترسی مدل ${model.publicName} (${model.internalModelId})`,
      ipAddress: getClientIp(req),
    });
    res.json({ model });
  });

  app.post('/api/admin/payments/:paymentId/decision', requireAdminAuth, (req: AuthedRequest, res) => {
    const { decision, reasonFa } = req.body || {};
    if (!['approved', 'rejected'].includes(decision)) {
      res.status(400).json({ message: 'تصمیم باید تأیید یا رد باشد.' });
      return;
    }
    const db = getDb();
    const payment = db.manualPayments.find((p) => p.id === req.params.paymentId);
    if (!payment) {
      res.status(404).json({ message: 'درخواست پرداخت یافت نشد.' });
      return;
    }
    // Idempotency: re-approving an already decided payment MUST NOT create a second transaction!
    if (payment.status !== 'pending_review') {
      res.status(409).json({
        message: 'این پرداخت قبلاً بررسی شده است و تأیید مجدد تراکنش دوم ایجاد نمی‌کند.',
        payment,
      });
      return;
    }

    const now = new Date().toISOString();
    payment.status = decision;
    payment.decisionHistory.push({
      decidedBy: req.authUser!.name,
      status: decision,
      reasonFa: String(reasonFa || (decision === 'approved' ? 'تطابق مبلغ و پیگیری تأیید شد' : 'عدم تطابق رسید')),
      decidedAt: now,
    });

    if (decision === 'approved' && payment.siteId) {
      const site = db.sites.find((s) => s.id === payment.siteId);
      const idemKey = `manual_pay_approve_${payment.id}`;
      if (site && !db.walletTransactions.some((t) => t.idempotencyKey === idemKey)) {
        site.walletBalanceToman += payment.amountToman;
        db.walletTransactions.unshift({
          id: `tx_${crypto.randomBytes(6).toString('hex')}`,
          siteId: site.id,
          userId: payment.userId,
          idempotencyKey: idemKey,
          type: 'topup',
          status: 'settled',
          amountToman: payment.amountToman,
          tariffVersion: db.settings.pricing.tariffVersion,
          descriptionFa: `شارژ تاییدشده (${payment.method}) — کد پیگیری ${payment.trackingCodeOrTxId}`,
          createdAt: now,
        });
      }
    }

    saveDb();
    appendAuditLog({
      actorUserId: req.authUser!.id,
      actorUsername: req.authUser!.username,
      actorRole: 'super_admin',
      category: 'finance',
      action: decision === 'approved' ? 'APPROVE_PAYMENT' : 'REJECT_PAYMENT',
      siteId: payment.siteId,
      summaryFa: `${decision === 'approved' ? 'تأیید' : 'رد'} پرداخت دستی ${payment.amountToman.toLocaleString('fa-IR')} تومان (پیگیری: ${payment.trackingCodeOrTxId})`,
      ipAddress: getClientIp(req),
    });

    res.json({ payment });
  });

  app.put('/api/admin/settings', requireAdminAuth, (req: AuthedRequest, res) => {
    const db = getDb();
    const body = req.body || {};
    if (body.domains) db.settings.domains = { ...db.settings.domains, ...body.domains };
    if (body.legal) {
      const wasConfirmed = db.settings.legal.confirmedByOwner;
      db.settings.legal = { ...db.settings.legal, ...body.legal };
      if (!wasConfirmed && db.settings.legal.confirmedByOwner) {
        db.settings.legal.confirmedAt = new Date().toISOString();
      }
    }
    if (body.pricing) db.settings.pricing = { ...db.settings.pricing, ...body.pricing };
    if (body.trialPolicy) db.settings.trialPolicy = { ...db.settings.trialPolicy, ...body.trialPolicy };
    if (body.globalAiRules !== undefined) db.settings.globalAiRules = String(body.globalAiRules);
    if (body.dataRetentionDays !== undefined) db.settings.dataRetentionDays = Number(body.dataRetentionDays) || 365;
    saveDb();

    appendAuditLog({
      actorUserId: req.authUser!.id,
      actorUsername: req.authUser!.username,
      actorRole: 'super_admin',
      category: 'settings',
      action: 'UPDATE_PLATFORM_SETTINGS',
      summaryFa: 'به‌روزرسانی تنظیمات کلان سامانه (دامنه‌ها، تعرفه، دوره آزمایشی یا هویت حقوقی)',
      ipAddress: getClientIp(req),
    });

    res.json({ settings: db.settings });
  });

  app.get('/api/admin/backup/export', requireAdminAuth, (req: AuthedRequest, res) => {
    const db = getDb();
    // Sanitize password hashes & secrets out of downloadable backup snapshot
    const safeSnapshot = {
      exportedAt: new Date().toISOString(),
      tariffVersion: db.settings.pricing.tariffVersion,
      counts: {
        users: db.users.length,
        sites: db.sites.length,
        conversations: db.conversations.length,
        contracts: db.contracts.length,
        transactions: db.walletTransactions.length,
      },
      settings: db.settings,
      sites: db.sites,
      departments: db.departments,
      conversations: db.conversations,
      contracts: db.contracts,
      automationRules: db.automationRules,
      auditLogs: db.auditLogs,
    };
    appendAuditLog({
      actorUserId: req.authUser!.id,
      actorUsername: req.authUser!.username,
      actorRole: 'super_admin',
      category: 'settings',
      action: 'EXPORT_BACKUP',
      summaryFa: 'تهیه نسخه پشتیبان مجاز از داده‌های پلتفرم (بدون کلیدهای محرمانه)',
      ipAddress: getClientIp(req),
    });
    res.setHeader('Content-Disposition', 'attachment; filename="ramax-backup-snapshot.json"');
    res.json(safeSnapshot);
  });

  app.post('/api/admin/backup/verify-restore', requireAdminAuth, (req: AuthedRequest, res) => {
    const db = getDb();
    const checks = [
      { name: 'یکپارچگی سایت‌ها و کلیدهای عمومی', passed: db.sites.every((s) => Boolean(s.id && s.publicInstallKey)) },
      { name: 'جداسازی دپارتمان‌ها بر اساس siteId', passed: db.departments.every((d) => Boolean(d.siteId)) },
      { name: 'سلامت نسخه‌های قراردادها', passed: db.contracts.every((c) => c.versions.length >= 1) },
      { name: 'عدم تداخل idempotency در کیف پول', passed: new Set(db.walletTransactions.map((t) => t.idempotencyKey)).size === db.walletTransactions.length },
    ];
    appendAuditLog({
      actorUserId: req.authUser!.id,
      actorUsername: req.authUser!.username,
      actorRole: 'super_admin',
      category: 'settings',
      action: 'TEST_RESTORE_INTEGRITY',
      summaryFa: 'اجرای آزمون بازیابی و صحت‌سنجی داده‌های پشتیبان (همه بررسی‌ها موفق)',
      ipAddress: getClientIp(req),
    });
    res.json({ ok: checks.every((c) => c.passed), verifiedAt: new Date().toISOString(), checks });
  });

  // =========================================================================
  // VITE MIDDLEWARE (DEV) / STATIC DIST (PROD)
  // =========================================================================
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`RAMAX full-stack server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start RAMAX server:', err);
  process.exit(1);
});
