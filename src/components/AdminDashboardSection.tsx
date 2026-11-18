import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  BarChart3,
  CalendarClock,
  Check,
  Edit3,
  Eye,
  Globe,
  ImagePlus,
  Link2,
  Loader2,
  Megaphone,
  Plus,
  Power,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  UserCheck,
  Users,
} from 'lucide-react';
import { PopupBannerCard } from '@/src/components/PopupBannerModal';
import { useAuth } from '@/src/context/AuthContext';
import {
  createPopupBanner,
  deletePopupBanner,
  fetchAdminRegisteredUsersStats,
  fetchAdminServerStats,
  getBannerStatus,
  isValidDestinationUrl,
  subscribeAllBannersForAdmin,
  updatePopupBanner,
  uploadBannerImage,
} from '@/src/services/adminService';
import type {
  AdminServerStats,
  BannerFrequency,
  PopupBanner,
  PopupBannerInput,
  RegisteredUsersStats,
} from '@/src/types/anime';

const EMPTY_FORM: PopupBannerInput = {
  title: '',
  description: '',
  imageUrl: '',
  buttonText: '',
  destinationUrl: '',
  openInNewTab: false,
  enabled: true,
  startAt: '',
  expiresAt: '',
  frequency: 'once_per_session',
};

const FREQUENCY_LABELS: Record<BannerFrequency, string> = {
  once_per_session: 'Once per session',
  once_per_day: 'Once per day',
  once_per_user: 'Once per user',
  always_on_launch: 'Every launch',
};

function formatDateShort(isoDate: string): string {
  const parts = isoDate.split('-');
  if (parts.length !== 3) return isoDate;
  return `${parts[1]}/${parts[2]}`;
}

export const AdminDashboardSection: React.FC = () => {
  const { user, isAdmin, getIdToken } = useAuth();

  // Analytics state
  const [serverStats, setServerStats] = useState<AdminServerStats | null>(null);
  const [registeredStats, setRegisteredStats] = useState<RegisteredUsersStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [hoveredDayIndex, setHoveredDayIndex] = useState<number | null>(null);

  // Banner management state
  const [banners, setBanners] = useState<PopupBanner[]>([]);
  const [bannersError, setBannersError] = useState<string | null>(null);
  const [form, setForm] = useState<PopupBannerInput>(EMPTY_FORM);
  const [editingBannerId, setEditingBannerId] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [savingBanner, setSavingBanner] = useState(false);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [bannerFormError, setBannerFormError] = useState<string | null>(null);
  const [showLivePreview, setShowLivePreview] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadAnalytics = useCallback(async () => {
    if (!isAdmin) return;
    setStatsError(null);
    try {
      const token = await getIdToken();
      if (!token) {
        throw new Error('Unable to obtain verified administrator token.');
      }
      const [srvRes, regRes] = await Promise.all([
        fetchAdminServerStats(token),
        fetchAdminRegisteredUsersStats(),
      ]);
      setServerStats(srvRes);
      setRegisteredStats(regRes);
    } catch (err) {
      setStatsError(err instanceof Error ? err.message : 'Failed to load admin analytics.');
    } finally {
      setStatsLoading(false);
    }
  }, [isAdmin, getIdToken]);

  useEffect(() => {
    if (!isAdmin) return;
    loadAnalytics();
    const timer = window.setInterval(loadAnalytics, 20000);
    return () => window.clearInterval(timer);
  }, [isAdmin, loadAnalytics]);

  useEffect(() => {
    if (!isAdmin) return;
    const unsub = subscribeAllBannersForAdmin(
      (list) => {
        setBanners(list);
        setBannersError(null);
      },
      (msg) => setBannersError(msg)
    );
    return () => unsub();
  }, [isAdmin]);

  const combinedUsersActiveToday = useMemo(() => {
    const srvToday = serverStats?.usersActiveToday || 0;
    const regToday = registeredStats?.registeredActiveToday || 0;
    const guestToday = serverStats?.guestActiveToday || 0;
    return Math.max(srvToday, regToday + guestToday);
  }, [serverStats, registeredStats]);

  const combinedTotalActiveUsers = useMemo(() => {
    return registeredStats?.totalActiveRegisteredUsers || 0;
  }, [registeredStats]);

  if (!isAdmin) {
    return (
      <section className="kuro-glass rounded-3xl p-8 text-center">
        <ShieldCheck className="mx-auto h-10 w-10 text-rose-400" />
        <h2 className="mt-3 text-lg font-bold text-white">Restricted Administrator Area</h2>
        <p className="mt-1 text-sm text-slate-400">
          You do not have permission to view KuroStream admin statistics or manage banners.
        </p>
      </section>
    );
  }

  const handleImageFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setUploadError(null);
    setUploadingImage(true);
    try {
      const token = await getIdToken();
      if (!token) throw new Error('Authentication expired. Please sign in again.');
      const result = await uploadBannerImage(token, file);
      setForm((prev) => ({ ...prev, imageUrl: result.imageUrl }));
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Failed to upload image.');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSaveBanner = async (e: React.FormEvent) => {
    e.preventDefault();
    setBannerFormError(null);
    setSaveNotice(null);

    if (!user) {
      setBannerFormError('Signed-in admin session is required.');
      return;
    }
    if (!form.title.trim()) {
      setBannerFormError('Banner title is required.');
      return;
    }
    if (!form.imageUrl.trim()) {
      setBannerFormError('Please upload a banner image or enter an image URL.');
      return;
    }
    if (form.destinationUrl && !isValidDestinationUrl(form.destinationUrl)) {
      setBannerFormError('Destination URL must be an internal /path or start with https:// or http://.');
      return;
    }
    if (form.startAt && form.expiresAt) {
      const startMs = Date.parse(form.startAt);
      const endMs = Date.parse(form.expiresAt);
      if (!Number.isNaN(startMs) && !Number.isNaN(endMs) && endMs <= startMs) {
        setBannerFormError('Expiry date must be later than start date.');
        return;
      }
    }

    setSavingBanner(true);
    try {
      if (editingBannerId) {
        await updatePopupBanner(editingBannerId, form);
        setSaveNotice('Popup banner updated.');
      } else {
        await createPopupBanner(user.uid, form);
        setSaveNotice('Popup banner published.');
      }
      setForm(EMPTY_FORM);
      setEditingBannerId(null);
      window.setTimeout(() => setSaveNotice(null), 3000);
    } catch (err) {
      setBannerFormError(err instanceof Error ? err.message : 'Failed to save popup banner.');
    } finally {
      setSavingBanner(false);
    }
  };

  const handleStartEdit = (banner: PopupBanner) => {
    setEditingBannerId(banner.id);
    setForm({
      title: banner.title,
      description: banner.description,
      imageUrl: banner.imageUrl,
      buttonText: banner.buttonText || '',
      destinationUrl: banner.destinationUrl || '',
      openInNewTab: banner.openInNewTab,
      enabled: banner.enabled,
      startAt: banner.startAt || '',
      expiresAt: banner.expiresAt || '',
      frequency: banner.frequency,
    });
    setBannerFormError(null);
    setUploadError(null);
  };

  const handleToggleBannerEnabled = async (banner: PopupBanner) => {
    try {
      await updatePopupBanner(banner.id, { enabled: !banner.enabled });
    } catch (err) {
      setBannersError(err instanceof Error ? err.message : 'Unable to toggle banner status.');
    }
  };

  const handleDeleteBanner = async (banner: PopupBanner) => {
    try {
      const token = await getIdToken();
      await deletePopupBanner(banner, token);
      if (editingBannerId === banner.id) {
        setEditingBannerId(null);
        setForm(EMPTY_FORM);
      }
      setConfirmDeleteId(null);
    } catch (err) {
      setBannersError(err instanceof Error ? err.message : 'Failed to delete banner.');
    }
  };

  const series = serverStats?.dailySeries || [];
  const maxChartValue = Math.max(
    1,
    ...series.map((d) => Math.max(d.visits, d.activeUsers))
  );

  const onlineRegPct =
    serverStats && serverStats.currentlyOnlineUsers > 0
      ? Math.round((serverStats.onlineRegisteredUsers / serverStats.currentlyOnlineUsers) * 100)
      : 0;

  const activeRetentionPct =
    registeredStats && registeredStats.totalRegisteredUsers > 0
      ? Math.min(
          100,
          Math.round((registeredStats.registeredLast7Days / registeredStats.totalRegisteredUsers) * 100)
        )
      : 0;

  return (
    <div className="space-y-8">
      {/* SECTION 1: ADMIN USER STATISTICS */}
      <section className="kuro-glass rounded-3xl p-5 sm:p-6 space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-xl border border-violet-400/25 bg-violet-500/10 px-2.5 py-1 text-[11px] font-semibold text-violet-300">
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>Admin Analytics</span>
            </div>
            <h2 className="mt-2 text-lg sm:text-xl font-bold text-white">
              User Statistics &amp; Live Presence
            </h2>
            <p className="mt-0.5 text-xs sm:text-sm text-slate-400">
              Real-time heartbeat presence and persisted Firestore user records. Auto-refreshes every 20s.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            {serverStats?.updatedAt && (
              <span className="text-[11px] text-slate-400 tabular-nums">
                Updated {new Date(serverStats.updatedAt).toLocaleTimeString()}
              </span>
            )}
            <button
              type="button"
              onClick={loadAnalytics}
              disabled={statsLoading}
              className="kuro-btn-glass inline-flex min-h-[38px] items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-semibold"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${statsLoading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {statsError && (
          <div className="rounded-2xl border border-rose-500/35 bg-rose-950/35 px-4 py-3 text-xs sm:text-sm text-rose-200">
            {statsError}
          </div>
        )}

        {/* 5 Real-Data KPI Cards */}
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-5">
          <StatKpiCard
            icon={<Users className="h-4.5 w-4.5 text-violet-300" />}
            label="Total Registered Users"
            value={registeredStats ? String(registeredStats.totalRegisteredUsers) : '—'}
            subtext={
              registeredStats
                ? `${registeredStats.registeredLast7Days} active in last 7 days`
                : 'Loading Firestore...'
            }
          />
          <StatKpiCard
            icon={<UserCheck className="h-4.5 w-4.5 text-fuchsia-300" />}
            label="Total Active Users"
            value={registeredStats ? String(combinedTotalActiveUsers) : '—'}
            subtext={
              serverStats
                ? `${serverStats.totalUniqueVisitors} unique visitors recorded`
                : 'Verified user accounts'
            }
          />
          <StatKpiCard
            icon={<Activity className="h-4.5 w-4.5 text-emerald-400" />}
            label="Currently Online Users"
            value={serverStats ? String(serverStats.currentlyOnlineUsers) : '—'}
            liveDot
            subtext={
              serverStats
                ? `${serverStats.onlineRegisteredUsers} signed-in · ${serverStats.onlineGuestUsers} guests`
                : 'Active heartbeat sessions'
            }
          />
          <StatKpiCard
            icon={<CalendarClock className="h-4.5 w-4.5 text-sky-300" />}
            label="Users Active Today"
            value={serverStats || registeredStats ? String(combinedUsersActiveToday) : '—'}
            subtext={
              serverStats
                ? `${Math.max(serverStats.registeredActiveToday, registeredStats?.registeredActiveToday || 0)} registered · ${serverStats.guestActiveToday} guests`
                : 'UTC daily active count'
            }
          />
          <StatKpiCard
            icon={<Globe className="h-4.5 w-4.5 text-amber-300" />}
            label="Total Website Visits"
            value={serverStats ? String(serverStats.totalWebsiteVisits) : '—'}
            subtext={serverStats ? `${serverStats.visitsToday} visits today` : 'Session-deduplicated'}
          />
        </div>

        {/* Real-Data Charts Grid */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          {/* 7-Day Real Visits & Active Users Chart */}
          <div className="lg:col-span-2 rounded-2xl border border-white/[0.08] bg-[#090b12]/80 p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-violet-400" />
                <h3 className="text-sm font-semibold text-white">
                  7-Day Website Visits &amp; Daily Active Users
                </h3>
              </div>
              <div className="flex items-center gap-4 text-[11px] text-slate-300">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm bg-violet-500" />
                  Visits
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm bg-fuchsia-400" />
                  Active Users
                </span>
              </div>
            </div>

            {series.length === 0 ? (
              <div className="flex h-44 items-center justify-center text-xs text-slate-500">
                No recorded traffic buckets yet.
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-7 gap-2 items-end h-44 pt-4">
                  {series.map((point, idx) => {
                    const visitPct = Math.round((point.visits / maxChartValue) * 100);
                    const activePct = Math.round((point.activeUsers / maxChartValue) * 100);
                    const isHovered = hoveredDayIndex === idx;
                    return (
                      <div
                        key={point.date}
                        onMouseEnter={() => setHoveredDayIndex(idx)}
                        onMouseLeave={() => setHoveredDayIndex(null)}
                        className="relative flex h-full flex-col items-center justify-end gap-1.5"
                      >
                        {isHovered && (
                          <div className="pointer-events-none absolute -top-3 z-10 whitespace-nowrap rounded-xl border border-violet-400/35 bg-[#121526] px-2.5 py-1 text-[10px] font-medium text-white shadow-xl">
                            {point.date}: {point.visits} visits · {point.activeUsers} active
                          </div>
                        )}
                        <div className="flex w-full max-w-[44px] flex-1 items-end justify-center gap-1 rounded-xl bg-white/[0.02] px-1 pt-2">
                          <div
                            className="w-1/2 rounded-t-md bg-gradient-to-t from-violet-700 to-violet-400 transition-all duration-300"
                            style={{ height: `${Math.max(point.visits > 0 ? 8 : 2, visitPct)}%` }}
                            title={`${point.date}: ${point.visits} visits`}
                          />
                          <div
                            className="w-1/2 rounded-t-md bg-gradient-to-t from-fuchsia-700 to-fuchsia-400 transition-all duration-300"
                            style={{ height: `${Math.max(point.activeUsers > 0 ? 8 : 2, activePct)}%` }}
                            title={`${point.date}: ${point.activeUsers} active users`}
                          />
                        </div>
                        <span className="text-[10px] font-medium text-slate-400 tabular-nums">
                          {formatDateShort(point.date)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Live Audience & Retention Breakdown */}
          <div className="rounded-2xl border border-white/[0.08] bg-[#090b12]/80 p-4 sm:p-5 flex flex-col justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold text-white">Real Audience Composition</h3>
              <p className="mt-0.5 text-xs text-slate-400">
                Computed directly from live presence and Firestore user timestamps.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="text-slate-300">Online Signed-In Share</span>
                  <span className="font-semibold text-white tabular-nums">{onlineRegPct}%</span>
                </div>
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-white/[0.08]">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-300"
                    style={{ width: `${onlineRegPct}%` }}
                  />
                </div>
                <p className="mt-1 text-[11px] text-slate-500 tabular-nums">
                  {serverStats?.onlineRegisteredUsers || 0} signed-in /{' '}
                  {serverStats?.currentlyOnlineUsers || 0} online
                </p>
              </div>

              <div>
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="text-slate-300">7-Day Registered Activity Rate</span>
                  <span className="font-semibold text-white tabular-nums">{activeRetentionPct}%</span>
                </div>
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-white/[0.08]">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-500 transition-all duration-300"
                    style={{ width: `${activeRetentionPct}%` }}
                  />
                </div>
                <p className="mt-1 text-[11px] text-slate-500 tabular-nums">
                  {registeredStats?.registeredLast7Days || 0} of{' '}
                  {registeredStats?.totalRegisteredUsers || 0} registered users
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2.5 text-[11px] text-slate-300 tabular-nums">
              Active Today Breakdown:{' '}
              <span className="font-semibold text-white">
                {Math.max(
                  serverStats?.registeredActiveToday || 0,
                  registeredStats?.registeredActiveToday || 0
                )}{' '}
                registered
              </span>{' '}
              + <span className="font-semibold text-white">{serverStats?.guestActiveToday || 0} guests</span>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 2: POPUP BANNER MANAGEMENT */}
      <section className="kuro-glass rounded-3xl p-5 sm:p-6 space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-xl border border-fuchsia-400/25 bg-fuchsia-500/10 px-2.5 py-1 text-[11px] font-semibold text-fuchsia-300">
              <Megaphone className="h-3.5 w-3.5" />
              <span>Popup Banner System</span>
            </div>
            <h2 className="mt-2 text-lg sm:text-xl font-bold text-white">
              {editingBannerId ? 'Edit Popup Banner' : 'Create & Manage Popup Banners'}
            </h2>
            <p className="mt-0.5 text-xs sm:text-sm text-slate-400">
              Upload promotional artwork, schedule start/expiry windows, preview live, and control display frequency.
            </p>
          </div>

          {form.imageUrl && (
            <button
              type="button"
              onClick={() => setShowLivePreview(true)}
              className="kuro-btn-glass inline-flex min-h-[40px] items-center gap-1.5 rounded-2xl px-4 py-2 text-xs font-semibold"
            >
              <Eye className="h-4 w-4 text-violet-300" />
              <span>Preview Popup</span>
            </button>
          )}
        </div>

        {(bannerFormError || uploadError || saveNotice || bannersError) && (
          <div className="space-y-2">
            {saveNotice && (
              <div className="flex items-center gap-2 rounded-2xl border border-emerald-500/35 bg-emerald-950/35 px-4 py-3 text-xs sm:text-sm text-emerald-200">
                <Check className="h-4 w-4 shrink-0" />
                <span>{saveNotice}</span>
              </div>
            )}
            {(bannerFormError || uploadError || bannersError) && (
              <div className="rounded-2xl border border-rose-500/35 bg-rose-950/35 px-4 py-3 text-xs sm:text-sm text-rose-200">
                {bannerFormError || uploadError || bannersError}
              </div>
            )}
          </div>
        )}

        {/* Create / Edit Banner Form */}
        <form
          onSubmit={handleSaveBanner}
          className="grid grid-cols-1 gap-6 rounded-2xl border border-white/[0.08] bg-[#090b12]/80 p-4 sm:p-5 lg:grid-cols-5"
        >
          {/* Left Column: Image Upload + Thumbnail */}
          <div className="lg:col-span-2 space-y-3">
            <label className="block text-xs font-semibold text-slate-200">
              Banner Image (JPG, PNG, WebP, GIF · max 5 MB)
            </label>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              onChange={handleImageFileSelect}
              className="hidden"
            />

            <div className="relative overflow-hidden rounded-2xl border border-dashed border-violet-400/35 bg-[#0e111d]">
              {form.imageUrl ? (
                <div className="relative aspect-[16/9] w-full">
                  <img
                    src={form.imageUrl}
                    alt="Banner preview"
                    className="h-full w-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-transparent" />
                  <div className="absolute bottom-2.5 right-2.5 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadingImage}
                      className="kuro-btn-glass inline-flex min-h-[34px] items-center gap-1.5 rounded-xl px-3 py-1 text-xs font-semibold"
                    >
                      <Upload className="h-3.5 w-3.5" />
                      <span>Replace</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setForm((p) => ({ ...p, imageUrl: '' }))}
                      className="kuro-btn-glass inline-flex min-h-[34px] items-center rounded-xl px-2.5 py-1 text-xs font-semibold text-rose-300"
                    >
                      Clear
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingImage}
                  className="flex aspect-[16/9] w-full flex-col items-center justify-center gap-2 p-6 text-center transition-colors hover:bg-violet-500/5"
                >
                  {uploadingImage ? (
                    <>
                      <Loader2 className="h-7 w-7 animate-spin text-violet-400" />
                      <span className="text-xs font-medium text-slate-300">Uploading &amp; validating image...</span>
                    </>
                  ) : (
                    <>
                      <ImagePlus className="h-7 w-7 text-violet-400" />
                      <span className="text-xs font-semibold text-white">Click to Upload Banner Image</span>
                      <span className="text-[11px] text-slate-400">16:9 recommended · Max 5 MB</span>
                    </>
                  )}
                </button>
              )}
            </div>

            <div>
              <label htmlFor="banner-image-url" className="block text-[11px] font-medium text-slate-400 mb-1">
                Or paste external image URL (optional)
              </label>
              <input
                id="banner-image-url"
                type="text"
                maxLength={500}
                value={form.imageUrl}
                onChange={(e) => setForm((p) => ({ ...p, imageUrl: e.target.value }))}
                placeholder="https://... or /api/banners/image/..."
                className="h-10 w-full rounded-xl border border-white/[0.1] bg-[#07080d] px-3 text-xs text-white focus:border-violet-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Right Column: Fields & Scheduling */}
          <div className="lg:col-span-3 space-y-4">
            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label htmlFor="banner-title" className="block text-xs font-semibold text-slate-200 mb-1.5">
                  Banner Title *
                </label>
                <input
                  id="banner-title"
                  type="text"
                  required
                  maxLength={160}
                  value={form.title}
                  onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                  placeholder="e.g. Solo Leveling Season 2 Now Streaming in Hindi!"
                  className="h-10 w-full rounded-xl border border-white/[0.1] bg-[#07080d] px-3 text-sm text-white focus:border-violet-500 focus:outline-none"
                />
              </div>

              <div className="sm:col-span-2">
                <label htmlFor="banner-desc" className="block text-xs font-semibold text-slate-200 mb-1.5">
                  Banner Description
                </label>
                <textarea
                  id="banner-desc"
                  rows={2}
                  maxLength={1000}
                  value={form.description}
                  onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                  placeholder="Short announcement or callout shown inside the popup..."
                  className="w-full rounded-xl border border-white/[0.1] bg-[#07080d] px-3 py-2 text-sm text-white focus:border-violet-500 focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="banner-cta-text" className="block text-xs font-semibold text-slate-200 mb-1.5">
                  Button Text (optional)
                </label>
                <input
                  id="banner-cta-text"
                  type="text"
                  maxLength={60}
                  value={form.buttonText || ''}
                  onChange={(e) => setForm((p) => ({ ...p, buttonText: e.target.value }))}
                  placeholder="e.g. Watch Now"
                  className="h-10 w-full rounded-xl border border-white/[0.1] bg-[#07080d] px-3 text-sm text-white focus:border-violet-500 focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="banner-cta-url" className="block text-xs font-semibold text-slate-200 mb-1.5">
                  Destination URL (optional)
                </label>
                <div className="relative">
                  <Link2 className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
                  <input
                    id="banner-cta-url"
                    type="text"
                    maxLength={500}
                    value={form.destinationUrl || ''}
                    onChange={(e) => setForm((p) => ({ ...p, destinationUrl: e.target.value }))}
                    placeholder="/anime/151807 or https://..."
                    className="h-10 w-full rounded-xl border border-white/[0.1] bg-[#07080d] pl-8 pr-3 text-sm text-white focus:border-violet-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="banner-start" className="block text-xs font-semibold text-slate-200 mb-1.5">
                  Start Date &amp; Time (optional)
                </label>
                <input
                  id="banner-start"
                  type="datetime-local"
                  value={form.startAt || ''}
                  onChange={(e) => setForm((p) => ({ ...p, startAt: e.target.value }))}
                  className="h-10 w-full rounded-xl border border-white/[0.1] bg-[#07080d] px-3 text-xs text-white focus:border-violet-500 focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="banner-expiry" className="block text-xs font-semibold text-slate-200 mb-1.5">
                  Expiry Date &amp; Time (optional)
                </label>
                <input
                  id="banner-expiry"
                  type="datetime-local"
                  value={form.expiresAt || ''}
                  onChange={(e) => setForm((p) => ({ ...p, expiresAt: e.target.value }))}
                  className="h-10 w-full rounded-xl border border-white/[0.1] bg-[#07080d] px-3 text-xs text-white focus:border-violet-500 focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="banner-freq" className="block text-xs font-semibold text-slate-200 mb-1.5">
                  Display Frequency
                </label>
                <select
                  id="banner-freq"
                  value={form.frequency}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, frequency: e.target.value as BannerFrequency }))
                  }
                  className="h-10 w-full rounded-xl border border-white/[0.1] bg-[#07080d] px-3 text-xs text-white focus:border-violet-500 focus:outline-none"
                >
                  <option value="once_per_session">Once per session</option>
                  <option value="once_per_day">Once per day</option>
                  <option value="once_per_user">Once per user</option>
                  <option value="always_on_launch">Always on site launch</option>
                </select>
              </div>

              <div className="flex flex-col justify-end gap-2 pb-1">
                <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-slate-200">
                  <input
                    type="checkbox"
                    checked={form.enabled}
                    onChange={(e) => setForm((p) => ({ ...p, enabled: e.target.checked }))}
                    className="h-4 w-4 rounded border-white/20 bg-[#07080d] text-violet-500 focus:ring-violet-500"
                  />
                  <span>Banner Enabled</span>
                </label>
                <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-slate-300">
                  <input
                    type="checkbox"
                    checked={form.openInNewTab}
                    onChange={(e) => setForm((p) => ({ ...p, openInNewTab: e.target.checked }))}
                    className="h-4 w-4 rounded border-white/20 bg-[#07080d] text-violet-500 focus:ring-violet-500"
                  />
                  <span>Open external button link in new tab</span>
                </label>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2.5 border-t border-white/[0.06] pt-4">
              {editingBannerId && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingBannerId(null);
                    setForm(EMPTY_FORM);
                    setBannerFormError(null);
                  }}
                  className="kuro-btn-glass inline-flex min-h-[42px] items-center rounded-2xl px-4 py-2 text-xs font-semibold"
                >
                  Cancel Edit
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowLivePreview(true)}
                className="kuro-btn-glass inline-flex min-h-[42px] items-center gap-1.5 rounded-2xl px-4 py-2 text-xs font-semibold"
              >
                <Eye className="h-4 w-4 text-violet-300" />
                <span>Live Preview</span>
              </button>
              <button
                type="submit"
                disabled={savingBanner || uploadingImage}
                className="kuro-btn-primary inline-flex min-h-[42px] items-center gap-1.5 rounded-2xl px-5 py-2 text-xs sm:text-sm font-semibold"
              >
                {savingBanner ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : editingBannerId ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                <span>{editingBannerId ? 'Save Banner Changes' : 'Publish Popup Banner'}</span>
              </button>
            </div>
          </div>
        </form>

        {/* Existing Banners List */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">
              Published &amp; Scheduled Banners ({banners.length})
            </h3>
          </div>

          {banners.length === 0 ? (
            <div className="rounded-2xl border border-white/[0.06] bg-[#090b12]/60 p-8 text-center">
              <Sparkles className="mx-auto h-7 w-7 text-violet-400/70" />
              <p className="mt-2 text-sm font-medium text-slate-200">No popup banners created yet</p>
              <p className="mt-0.5 text-xs text-slate-400">
                Create your first promotional or announcement popup banner above.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
              {banners.map((banner) => {
                const status = getBannerStatus(banner);
                const statusStyle =
                  status === 'Active'
                    ? 'border-emerald-400/35 bg-emerald-500/15 text-emerald-300'
                    : status === 'Scheduled'
                      ? 'border-sky-400/35 bg-sky-500/15 text-sky-300'
                      : status === 'Expired'
                        ? 'border-amber-400/35 bg-amber-500/15 text-amber-300'
                        : 'border-slate-500/35 bg-slate-500/15 text-slate-300';

                return (
                  <div
                    key={banner.id}
                    className="flex flex-col justify-between gap-3 rounded-2xl border border-white/[0.08] bg-[#090b12]/80 p-3.5"
                  >
                    <div className="flex items-start gap-3.5">
                      <div className="h-20 w-32 shrink-0 overflow-hidden rounded-xl border border-white/[0.08] bg-[#141728]">
                        <img
                          src={banner.imageUrl}
                          alt={banner.title}
                          className="h-full w-full object-cover"
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`inline-flex items-center rounded-lg border px-2 py-0.5 text-[10px] font-semibold ${statusStyle}`}
                          >
                            {status}
                          </span>
                          <span className="text-[11px] text-slate-400">
                            {FREQUENCY_LABELS[banner.frequency]}
                          </span>
                        </div>
                        <p className="mt-1 truncate text-sm font-semibold text-white">
                          {banner.title}
                        </p>
                        {banner.description && (
                          <p className="mt-0.5 line-clamp-2 text-xs text-slate-400">
                            {banner.description}
                          </p>
                        )}
                        {(banner.startAt || banner.expiresAt) && (
                          <p className="mt-1 text-[10px] text-slate-500 tabular-nums">
                            {banner.startAt ? `From ${banner.startAt.replace('T', ' ')}` : 'Immediate'}{' '}
                            ·{' '}
                            {banner.expiresAt
                              ? `Until ${banner.expiresAt.replace('T', ' ')}`
                              : 'No expiry'}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-end gap-2 border-t border-white/[0.06] pt-2.5">
                      <button
                        type="button"
                        onClick={() => handleToggleBannerEnabled(banner)}
                        className={`kuro-btn-glass inline-flex min-h-[34px] items-center gap-1.5 rounded-xl px-3 py-1 text-xs font-semibold ${
                          banner.enabled ? 'text-emerald-300' : 'text-slate-300'
                        }`}
                      >
                        <Power className="h-3.5 w-3.5" />
                        <span>{banner.enabled ? 'Disable' : 'Enable'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleStartEdit(banner)}
                        className="kuro-btn-glass inline-flex min-h-[34px] items-center gap-1.5 rounded-xl px-3 py-1 text-xs font-semibold"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                        <span>Edit</span>
                      </button>

                      {confirmDeleteId === banner.id ? (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleDeleteBanner(banner)}
                            className="kuro-btn-glass inline-flex min-h-[34px] items-center rounded-xl border border-rose-500/40 bg-rose-600/25 px-3 py-1 text-xs font-semibold text-rose-200"
                          >
                            Confirm Delete
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="kuro-btn-glass inline-flex min-h-[34px] items-center rounded-xl px-2.5 py-1 text-xs font-semibold"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(banner.id)}
                          aria-label={`Delete banner ${banner.title}`}
                          className="kuro-btn-glass inline-flex min-h-[34px] items-center gap-1.5 rounded-xl px-3 py-1 text-xs font-semibold text-rose-300"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          <span>Delete</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Live Preview Modal */}
      {showLivePreview && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowLivePreview(false);
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
        >
          <PopupBannerCard
            banner={form}
            previewBadge="Admin Live Preview"
            onClose={() => setShowLivePreview(false)}
          />
        </div>
      )}
    </div>
  );
};

interface StatKpiCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  subtext: string;
  liveDot?: boolean;
}

const StatKpiCard: React.FC<StatKpiCardProps> = ({
  icon,
  label,
  value,
  subtext,
  liveDot,
}) => (
  <div className="rounded-2xl border border-white/[0.08] bg-[#090b12]/85 p-4 flex flex-col justify-between gap-2.5">
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs font-medium text-slate-400">{label}</span>
      <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.04]">
        {icon}
      </span>
    </div>
    <div className="flex items-center gap-2">
      <span className="text-2xl font-extrabold tracking-tight text-white tabular-nums">
        {value}
      </span>
      {liveDot && (
        <span className="inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.9)]" />
      )}
    </div>
    <p className="text-[11px] text-slate-400 truncate tabular-nums">{subtext}</p>
  </div>
);
