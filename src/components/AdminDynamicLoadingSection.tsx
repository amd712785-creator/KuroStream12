import React, { useEffect, useState } from 'react';
import { Loader2, Sparkles, Check, Play } from 'lucide-react';
import {
  DEFAULT_DYNAMIC_LOADING_CONFIG,
  LOADING_STYLE_DEFINITIONS,
  saveDynamicLoadingConfigInFirestore,
  subscribeDynamicLoadingConfig,
} from '@/src/services/dynamicLoadingService';
import { DynamicLoadingScreen } from '@/src/components/DynamicLoadingScreen';
import { useAuth } from '@/src/context/AuthContext';
import type { DynamicLoadingConfig, DynamicLoadingStyleId } from '@/src/types/anime';

export const AdminDynamicLoadingSection: React.FC = () => {
  const { user } = useAuth();
  const [config, setConfig] = useState<DynamicLoadingConfig>(DEFAULT_DYNAMIC_LOADING_CONFIG);
  const [saving, setSaving] = useState(false);
  const [savedToast, setSavedToast] = useState(false);
  const [previewStyle, setPreviewStyle] = useState<DynamicLoadingStyleId | null>(null);

  useEffect(() => {
    const unsub = subscribeDynamicLoadingConfig((cfg) => {
      setConfig(cfg);
    });
    return unsub;
  }, []);

  const handleSave = async (patch: Partial<DynamicLoadingConfig>) => {
    setSaving(true);
    try {
      await saveDynamicLoadingConfigInFirestore(patch, user?.uid || 'admin');
      setSavedToast(true);
      window.setTimeout(() => setSavedToast(false), 2500);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to save loading configuration.');
    } finally {
      setSaving(false);
    }
  };

  const toggleStyleEnabled = (styleId: DynamicLoadingStyleId) => {
    const currentList = config.enabledStyles;
    let nextList: DynamicLoadingStyleId[];
    if (currentList.includes(styleId)) {
      if (currentList.length <= 1) return; // keep at least 1
      nextList = currentList.filter((id) => id !== styleId);
    } else {
      nextList = [...currentList, styleId];
    }
    handleSave({ enabledStyles: nextList });
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-bold text-white">Dynamic Loading Themes Management</h3>
        <p className="text-xs text-slate-400">
          Configure default loading themes, animation duration, and enabled styles across KuroStream.
        </p>
      </div>

      <div className="kuro-glass rounded-3xl p-6 space-y-6">
        {/* Global Enable Toggle */}
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-bold text-white">Global Dynamic Loading</h4>
            <p className="text-xs text-slate-400">Enable anime artwork-based loading themes globally.</p>
          </div>
          <button
            type="button"
            onClick={() => handleSave({ globalEnabled: !config.globalEnabled })}
            className={`rounded-xl px-4 py-2 text-xs font-semibold ${
              config.globalEnabled ? 'kuro-btn-active' : 'kuro-btn-glass text-slate-300'
            }`}
          >
            {config.globalEnabled ? 'Enabled' : 'Disabled'}
          </button>
        </div>

        {/* Default Theme Selector */}
        <div className="border-t border-white/[0.08] pt-5 space-y-3">
          <h4 className="text-sm font-bold text-white">Default Loading Theme Style</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {LOADING_STYLE_DEFINITIONS.map((style) => {
              const isDefault = config.defaultStyle === style.id;
              const isEnabled = config.enabledStyles.includes(style.id);
              return (
                <div
                  key={style.id}
                  className={`rounded-2xl border p-4 space-y-2 transition-all ${
                    isDefault
                      ? 'border-violet-500 bg-violet-600/15'
                      : 'border-white/[0.08] bg-white/[0.03]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-white">{style.name}</span>
                    {isDefault && (
                      <span className="rounded-full bg-violet-500 px-2 py-0.5 text-[10px] font-bold text-white">
                        Default
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-300 line-clamp-2">{style.tagline}</p>
                  <div className="flex items-center justify-between pt-2">
                    <button
                      type="button"
                      onClick={() => handleSave({ defaultStyle: style.id })}
                      disabled={!isEnabled}
                      className="kuro-btn-glass rounded-xl px-3 py-1.5 text-xs font-semibold disabled:opacity-40"
                    >
                      {isDefault ? 'Current Default' : 'Set as Default'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewStyle(style.id)}
                      className="kuro-btn-glass inline-flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-semibold text-violet-200"
                    >
                      <Play className="h-3.5 w-3.5" />
                      <span>Preview</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Duration Slider */}
        <div className="border-t border-white/[0.08] pt-5 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-bold text-white">Animation Duration</h4>
              <p className="text-xs text-slate-400">Minimum loading screen display duration.</p>
            </div>
            <span className="text-xs font-bold text-violet-300 tabular-nums">
              {config.durationMs}ms
            </span>
          </div>
          <input
            type="range"
            min={400}
            max={3000}
            step={100}
            value={config.durationMs}
            onChange={(e) => setConfig((prev) => ({ ...prev, durationMs: Number(e.target.value) }))}
            onMouseUp={(e) => handleSave({ durationMs: Number((e.target as HTMLInputElement).value) })}
            onTouchEnd={(e) => handleSave({ durationMs: Number((e.target as HTMLInputElement).value) })}
            className="w-full accent-violet-500"
          />
        </div>

        {savedToast && (
          <p className="text-xs font-semibold text-emerald-400">
            Dynamic loading configuration saved and applied globally.
          </p>
        )}
      </div>

      {/* Preview Modal */}
      {previewStyle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4">
          <div className="relative h-[480px] w-full max-w-lg overflow-hidden rounded-3xl border border-white/[0.2]">
            <DynamicLoadingScreen
              mode="embedded"
              styleOverride={previewStyle}
              forceAnimated
              message="Live Theme Preview..."
              subMessage={LOADING_STYLE_DEFINITIONS.find((s) => s.id === previewStyle)?.name}
              progress={65}
            />
            <button
              type="button"
              onClick={() => setPreviewStyle(null)}
              className="absolute top-4 right-4 z-40 rounded-full bg-black/70 px-4 py-2 text-xs font-bold text-white backdrop-blur-md"
            >
              Close Preview
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
