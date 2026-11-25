import React, { useEffect, useState } from 'react';
import {
  Plus,
  Trash2,
  Edit,
  Sparkles,
  Check,
  Loader2,
  Image as ImageIcon,
  Eye,
  EyeOff,
  Star,
} from 'lucide-react';
import { AnimeImage } from '@/src/components/AnimeImage';
import { db, logFirestoreError, OperationType } from '@/src/lib/firebase';
import { collection, getDocs, doc, deleteDoc } from 'firebase/firestore';
import { saveAdminCharacter, deleteAdminCharacter } from '@/src/services/characterDatabaseService';
import { uploadUserProfileMedia } from '@/src/services/userMediaService';
import { useAuth } from '@/src/context/AuthContext';
import type { CharacterProfile, CharacterRole } from '@/src/types/anime';

export const AdminCharacterManagementSection: React.FC = () => {
  const { user } = useAuth();
  const [characters, setCharacters] = useState<CharacterProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingChar, setEditingChar] = useState<CharacterProfile | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);

  // Form states
  const [formName, setFormName] = useState('');
  const [formNativeName, setFormNativeName] = useState('');
  const [formAnimeTitle, setFormAnimeTitle] = useState('');
  const [formRole, setFormRole] = useState<CharacterRole>('Main');
  const [formDescription, setFormDescription] = useState('');
  const [formImageUrl, setFormImageUrl] = useState('');
  const [formBannerUrl, setFormBannerUrl] = useState('');
  const [formVisible, setFormVisible] = useState(true);
  const [formFeatured, setFormFeatured] = useState(false);

  const loadCharacters = async () => {
    if (!db) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, 'characters'));
      const list: CharacterProfile[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          key: `custom_${d.id}`,
          customId: d.id,
          name: String(data.name || ''),
          nativeName: data.nativeName || null,
          animeTitle: data.animeTitle || null,
          role: (data.role as CharacterRole) || 'Main',
          description: data.description || null,
          imageUrl: String(data.imageUrl || ''),
          bannerUrl: data.bannerUrl || null,
          visible: Boolean(data.visible !== false),
          featured: Boolean(data.featured),
          createdAt: Number(data.createdAt) || Date.now(),
          updatedAt: Number(data.updatedAt) || Date.now(),
        };
      });
      setCharacters(list);
    } catch (err) {
      logFirestoreError(err, OperationType.LIST, 'characters');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCharacters();
  }, []);

  const openCreateModal = () => {
    setEditingChar(null);
    setFormName('');
    setFormNativeName('');
    setFormAnimeTitle('');
    setFormRole('Main');
    setFormDescription('');
    setFormImageUrl('');
    setFormBannerUrl('');
    setFormVisible(true);
    setFormFeatured(false);
    setIsCreating(true);
  };

  const openEditModal = (ch: CharacterProfile) => {
    setEditingChar(ch);
    setFormName(ch.name);
    setFormNativeName(ch.nativeName || '');
    setFormAnimeTitle(ch.animeTitle || '');
    setFormRole(ch.role);
    setFormDescription(ch.description || '');
    setFormImageUrl(ch.imageUrl);
    setFormBannerUrl(ch.bannerUrl || '');
    setFormVisible(ch.visible);
    setFormFeatured(ch.featured);
    setIsCreating(true);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, isBanner = false) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingImage(true);
    try {
      const kind = isBanner ? 'character_banner' : 'character_portrait';
      const uploadResult = await uploadUserProfileMedia(file, kind);
      if (isBanner) {
        setFormBannerUrl(uploadResult.imageUrl);
      } else {
        setFormImageUrl(uploadResult.imageUrl);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to upload image.');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || !formImageUrl.trim()) {
      alert('Character Name and Portrait Image URL are required.');
      return;
    }
    setSaving(true);
    try {
      await saveAdminCharacter(
        editingChar?.customId || null,
        {
          name: formName.trim(),
          nativeName: formNativeName.trim() || undefined,
          animeTitle: formAnimeTitle.trim() || undefined,
          role: formRole,
          description: formDescription.trim() || undefined,
          imageUrl: formImageUrl.trim(),
          bannerUrl: formBannerUrl.trim() || undefined,
          visible: formVisible,
          featured: formFeatured,
        },
        user?.uid || 'admin'
      );
      setIsCreating(false);
      await loadCharacters();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to save character.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (customId?: string | null) => {
    if (!customId) return;
    if (!window.confirm('Are you sure you want to delete this character?')) return;
    try {
      await deleteAdminCharacter(customId);
      await loadCharacters();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete character.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-white">Character Database Management</h3>
          <p className="text-xs text-slate-400">Add, edit, and feature characters in Firebase.</p>
        </div>
        <button
          type="button"
          onClick={openCreateModal}
          className="kuro-btn-primary inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold text-white"
        >
          <Plus className="h-4 w-4" />
          <span>Add Character</span>
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-violet-400" />
        </div>
      ) : characters.length === 0 ? (
        <div className="kuro-glass rounded-3xl p-8 text-center text-slate-400 text-sm">
          No custom characters added yet. Click &ldquo;Add Character&rdquo; to create one.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {characters.map((ch) => (
            <div key={ch.key} className="kuro-glass rounded-2xl p-4 flex gap-4 items-center">
              <AnimeImage
                src={ch.imageUrl}
                alt={ch.name}
                className="h-16 w-14 rounded-xl object-cover shrink-0"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-bold text-white">{ch.name}</p>
                  {ch.featured && (
                    <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold text-amber-300">
                      Featured
                    </span>
                  )}
                </div>
                <p className="truncate text-xs text-slate-400">
                  {[ch.animeTitle, ch.role].filter(Boolean).join(' · ')}
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => openEditModal(ch)}
                    className="kuro-btn-glass inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium text-violet-300"
                  >
                    <Edit className="h-3.5 w-3.5" />
                    <span>Edit</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(ch.customId)}
                    aria-label="Delete character"
                    className="kuro-btn-glass inline-flex items-center justify-center rounded-lg p-1 text-rose-300 hover:text-rose-200"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit Modal */}
      {isCreating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md">
          <div className="kuro-glass max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-3xl p-6 sm:p-8 space-y-6">
            <h3 className="text-lg font-bold text-white">
              {editingChar ? 'Edit Character' : 'Add New Character'}
            </h3>

            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Character Name *</label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. Sung Jin-Woo"
                  className="h-10 w-full rounded-xl border border-white/[0.1] bg-[#07080d] px-3 text-sm text-white focus:border-violet-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Japanese / Native Name</label>
                <input
                  type="text"
                  value={formNativeName}
                  onChange={(e) => setFormNativeName(e.target.value)}
                  placeholder="e.g. 成振宇"
                  className="h-10 w-full rounded-xl border border-white/[0.1] bg-[#07080d] px-3 text-sm text-white focus:border-violet-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Anime Title</label>
                  <input
                    type="text"
                    value={formAnimeTitle}
                    onChange={(e) => setFormAnimeTitle(e.target.value)}
                    placeholder="e.g. Solo Leveling"
                    className="h-10 w-full rounded-xl border border-white/[0.1] bg-[#07080d] px-3 text-sm text-white focus:border-violet-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Character Role</label>
                  <select
                    value={formRole}
                    onChange={(e) => setFormRole(e.target.value as CharacterRole)}
                    className="h-10 w-full rounded-xl border border-white/[0.1] bg-[#07080d] px-3 text-sm text-white focus:border-violet-500 focus:outline-none"
                  >
                    <option value="Main">Main</option>
                    <option value="Supporting">Supporting</option>
                    <option value="Villain">Villain</option>
                    <option value="Background">Background</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Portrait Image URL *</label>
                <div className="flex gap-2">
                  <input
                    type="url"
                    required
                    value={formImageUrl}
                    onChange={(e) => setFormImageUrl(e.target.value)}
                    placeholder="https://..."
                    className="h-10 flex-1 rounded-xl border border-white/[0.1] bg-[#07080d] px-3 text-sm text-white focus:border-violet-500 focus:outline-none"
                  />
                  <label className="kuro-btn-glass inline-flex cursor-pointer items-center gap-1.5 rounded-xl px-3 text-xs font-semibold text-slate-200">
                    <ImageIcon className="h-4 w-4" />
                    <span>{uploadingImage ? 'Uploading...' : 'Upload'}</span>
                    <input type="file" accept="image/*" onChange={(e) => handleImageUpload(e, false)} className="hidden" />
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Banner Image URL</label>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={formBannerUrl}
                    onChange={(e) => setFormBannerUrl(e.target.value)}
                    placeholder="https://..."
                    className="h-10 flex-1 rounded-xl border border-white/[0.1] bg-[#07080d] px-3 text-sm text-white focus:border-violet-500 focus:outline-none"
                  />
                  <label className="kuro-btn-glass inline-flex cursor-pointer items-center gap-1.5 rounded-xl px-3 text-xs font-semibold text-slate-200">
                    <ImageIcon className="h-4 w-4" />
                    <span>Upload</span>
                    <input type="file" accept="image/*" onChange={(e) => handleImageUpload(e, true)} className="hidden" />
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Biography</label>
                <textarea
                  rows={4}
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Character biography and backstory..."
                  className="w-full rounded-xl border border-white/[0.1] bg-[#07080d] p-3 text-sm text-white focus:border-violet-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center gap-6 pt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formVisible}
                    onChange={(e) => setFormVisible(e.target.checked)}
                    className="rounded border-white/20 bg-black text-violet-600 focus:ring-0"
                  />
                  <span className="text-xs font-medium text-slate-200">Visible in Database</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formFeatured}
                    onChange={(e) => setFormFeatured(e.target.checked)}
                    className="rounded border-white/20 bg-black text-violet-600 focus:ring-0"
                  />
                  <span className="text-xs font-medium text-slate-200">Feature on Home Page</span>
                </label>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  className="kuro-btn-glass rounded-xl px-4 py-2.5 text-xs font-semibold text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="kuro-btn-primary inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-xs font-semibold text-white disabled:opacity-60"
                >
                  {saving && <Loader2 className="h-4 w-4 animate-spin text-white" />}
                  <span>Save Character</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
