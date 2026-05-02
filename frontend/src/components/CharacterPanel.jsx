import { useState, useEffect } from 'react';
import { Users, Plus, Trash2, Save, User, X, Link2, Crown, Shield, Swords, UserCircle, ChevronDown, ChevronRight, Star } from 'lucide-react';
import { listCharactersByVolume, createCharacter, updateCharacter, deleteCharacter } from '../api/client';
import { useToast } from './ui/Toast';

const EMPTY = { name: '', role: '', age: '', personality: '', speech_style: '', appearance: '', background: '', character_arc_summary: '', relationships: '', spans_all_volumes: false };

const ROLE_OPTIONS = ['男主', '女主', '反派', '男配', '女配', '导师', '伙伴', '龙套', '路人'];

const ROLE_ORDER = { '男主': 0, '女主': 1, '反派': 2, '男配': 3, '女配': 3, '配角': 3, '导师': 3, '伙伴': 3, '龙套': 4, '路人': 4 };

function getRoleOrder(role) {
  if (!role) return 9;
  for (const [k, v] of Object.entries(ROLE_ORDER)) {
    if (role.includes(k)) return v;
  }
  return 9;
}

// 排序函数：男主 > 女主 > 反派 > 配角 > 龙套
function sortChars(chars) {
  return [...chars].sort((a, b) => {
    const oa = getRoleOrder(a.role);
    const ob = getRoleOrder(b.role);
    if (oa !== ob) return oa - ob;
    return (a.name || '').localeCompare(b.name || '', 'zh');
  });
}

function getRoleIcon(role) {
  if (!role) return UserCircle;
  if (role.includes('主')) return Crown;
  if (role.includes('反派')) return Swords;
  if (role.includes('龙套') || role.includes('路人')) return UserCircle;
  return Shield;
}

function getRoleColor(role) {
  if (!role) return 'text-ink-400';
  if (role.includes('男主')) return 'text-amber-500';
  if (role.includes('女主')) return 'text-pink-500';
  if (role.includes('反派')) return 'text-red-500';
  return 'text-inkblue-500';
}

function Field({ label, field, multiline, form, setForm }) {
  return (
    <div>
      <label className="text-xs text-ink-400 block mb-1">{label}</label>
      {multiline ? (
        <textarea value={form[field] || ''} onChange={e => setForm({ ...form, [field]: e.target.value })}
          rows={2} className="w-full input-surface border border-border-default rounded-lg px-3 py-1.5 text-sm focus:ring-1 focus:ring-vermillion-500/40 resize-none transition" />
      ) : (
        <input value={form[field] || ''} onChange={e => setForm({ ...form, [field]: e.target.value })}
          className="w-full input-surface border border-border-default rounded-lg px-3 py-1.5 text-sm focus:ring-1 focus:ring-vermillion-500/40 transition" />
      )}
    </div>
  );
}

// ========== 贯穿全文角色大卡片 ==========
function HeroCard({ c, onEdit, onDelete }) {
  const Icon = getRoleIcon(c.role);
  const color = getRoleColor(c.role);
  return (
    <div onClick={() => onEdit(c)}
      className="bg-surface-1 border border-amber-500/20 rounded-xl p-4 cursor-pointer transition-all hover:shadow-lg hover:-translate-y-0.5 group">
      <div className="flex items-start gap-3 mb-2">
        <div className="w-11 h-11 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
          <span className={`text-lg font-bold ${color}`}>{(c.name || '?')[0]}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-bold text-sm truncate">{c.name}</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/10 ${color} font-medium`}>
              <Icon className="w-2.5 h-2.5 inline mr-0.5" />{c.role || '未定'}
            </span>
            <Star className="w-3 h-3 text-amber-500 shrink-0" title="贯穿全文" />
            <button onClick={(e) => { e.stopPropagation(); onDelete(c.id, c.name); }}
              className="ml-auto p-1 text-ink-400 hover:text-red-500 rounded transition opacity-0 group-hover:opacity-100">
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
          {c.age && <span className="text-xs text-ink-400">{c.age}岁</span>}
        </div>
      </div>
      {c.personality && <p className="text-xs text-ink-600 leading-relaxed mb-1">{c.personality}</p>}
      {c.relationships && (
        <p className="text-xs text-ink-400 truncate flex items-center gap-1"><Link2 className="w-3 h-3 shrink-0" />{c.relationships}</p>
      )}
    </div>
  );
}

// ========== 分卷角色卡片 ==========
function VolumeCard({ c, onEdit, onDelete }) {
  const Icon = getRoleIcon(c.role);
  const color = getRoleColor(c.role);
  return (
    <div onClick={() => onEdit(c)}
      className="bg-surface-1 border border-border-subtle rounded-lg px-3 py-2.5 cursor-pointer transition-all hover:border-border-hover group flex items-start gap-2.5">
      <div className="w-8 h-8 rounded-lg bg-surface-3 flex items-center justify-center shrink-0 mt-0.5">
        <span className="text-sm font-medium text-ink-400">{(c.name || '?')[0]}</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium truncate">{c.name}</span>
          {c.role && <span className={`text-[10px] px-1 py-0 rounded bg-surface-3 ${color}`}>{c.role}</span>}
        </div>
        {c.personality && <p className="text-xs text-ink-400 truncate mt-0.5">{c.personality}</p>}
      </div>
      <button onClick={(e) => { e.stopPropagation(); onDelete(c.id, c.name); }}
        className="p-1 text-ink-400 hover:text-red-500 rounded transition opacity-0 group-hover:opacity-100 shrink-0">
        <Trash2 className="w-3 h-3" />
      </button>
    </div>
  );
}

export default function CharacterPanel({ project }) {
  const [data, setData] = useState(null); // { spans_all, volume_groups, current_volume, volumes }
  const [expanded, setExpanded] = useState(null);
  const [form, setForm] = useState({ ...EMPTY });
  const [isNew, setIsNew] = useState(false);
  const [collapsedVolumes, setCollapsedVolumes] = useState({});
  const toast = useToast();

  useEffect(() => { load(); }, [project.id]);

  async function load() {
    try {
      const result = await listCharactersByVolume(project.id);
      setData(result);
    } catch (e) {
      console.error('加载角色失败:', e);
    }
  }

  function startNew() {
    setIsNew(true); setExpanded(-1); setForm({ ...EMPTY });
  }

  function startEdit(c) {
    setIsNew(false); setExpanded(c.id);
    setForm({
      name: c.name || '', role: c.role || '', age: c.age || '',
      personality: c.personality || '', speech_style: c.speech_style || '',
      appearance: c.appearance || '', background: c.background || '',
      character_arc_summary: c.character_arc_summary || '', relationships: c.relationships || '',
      spans_all_volumes: !!c.spans_all_volumes,
    });
  }

  async function handleSave() {
    if (!form.name.trim()) { toast.warning('角色名不能为空'); return; }
    try {
      if (isNew) {
        await createCharacter(project.id, form);
      } else {
        const allChars = [...(data?.spans_all || []), ...Object.values(data?.volume_groups || {}).flat()];
        const char = allChars.find(c => c.id === expanded);
        if (!char) { toast.error('角色数据异常'); return; }
        await updateCharacter(project.id, char.name, form);
      }
      setIsNew(false); setExpanded(null); await load();
    } catch (e) {
      toast.error('保存失败: ' + (e.response?.data?.detail || e.message));
    }
  }

  async function handleDelete(id, name) {
    if (!await toast.confirm(`确定删除角色「${name}」？`)) return;
    try { await deleteCharacter(project.id, name); await load(); } catch { toast.error('删除失败'); }
  }

  if (!data) return <div className="text-center py-8 text-ink-400">加载中...</div>;

  const { spans_all, volume_groups, current_volume, volumes } = data;
  const volNumName = {};
  volumes.forEach(v => { volNumName[v.volume_number] = v; });

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Users className="w-6 h-6 text-vermillion-600" />
          <h1 className="text-xl font-bold">角色档案</h1>
        </div>
        <button onClick={startNew}
          className="flex items-center gap-2 px-4 py-2 bg-vermillion-600 hover:bg-vermillion-500 rounded-lg text-sm transition shadow-lg shadow-vermillion-600/10">
          <Plus className="w-4 h-4" />新增角色
        </button>
      </div>

      {/* 编辑表单 */}
      {(isNew || expanded) && (
        <div className="border-gradient bg-surface-1 rounded-xl p-5 mb-6 space-y-3 animate-fade-in">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-medium">{isNew ? '新增角色' : `编辑：${form.name}`}</span>
            <button onClick={() => { setIsNew(false); setExpanded(null); }} className="p-1 text-ink-400 hover:text-ink-700 hover:bg-surface-3 rounded transition">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <Field label="角色名 *" field="name" form={form} setForm={setForm} />
            <div>
              <label className="text-xs text-ink-400 block mb-1">角色定位</label>
              <select value={form.role || ''} onChange={e => setForm({ ...form, role: e.target.value })}
                className="w-full input-surface border border-border-default rounded-lg px-3 py-1.5 text-sm focus:ring-1 focus:ring-vermillion-500/40 transition">
                <option value="">请选择</option>
                {ROLE_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <Field label="年龄" field="age" form={form} setForm={setForm} />
            <div className="flex items-end">
              <label className="flex items-center gap-2 px-3 py-1.5 input-surface border border-border-default rounded-lg cursor-pointer hover:bg-surface-3 transition">
                <input type="checkbox" checked={form.spans_all_volumes || false}
                  onChange={e => setForm({ ...form, spans_all_volumes: e.target.checked })}
                  className="rounded accent-amber-500" />
                <Star className="w-3.5 h-3.5 text-amber-500" />
                <span className="text-sm">贯穿全文</span>
              </label>
            </div>
          </div>
          <Field label="性格" field="personality" multiline form={form} setForm={setForm} />
          <Field label="说话风格" field="speech_style" form={form} setForm={setForm} />
          <Field label="外貌" field="appearance" multiline form={form} setForm={setForm} />
          <Field label="背景" field="background" multiline form={form} setForm={setForm} />
          <Field label="角色弧线" field="character_arc_summary" multiline form={form} setForm={setForm} />
          <Field label="人物关系" field="relationships" multiline form={form} setForm={setForm} />
          <div className="flex justify-end gap-2">
            <button onClick={() => { setIsNew(false); setExpanded(null); }} className="px-3 py-1.5 text-sm text-ink-500 hover:text-ink-900">取消</button>
            <button onClick={handleSave}
              className="flex items-center gap-1 px-4 py-1.5 bg-green-600 hover:bg-green-500 rounded-lg text-sm transition shadow-lg shadow-green-600/15">
              <Save className="w-3.5 h-3.5" />保存
            </button>
          </div>
        </div>
      )}

      {/* 空状态 */}
      {(!spans_all || spans_all.length === 0) && Object.keys(volume_groups || {}).length === 0 && !isNew && (
        <div className="text-center py-16 text-ink-400">
          <User className="w-10 h-10 mx-auto mb-3 opacity-30" /><p>暂无角色档案</p>
        </div>
      )}

      {/* 贯穿全文角色 */}
      {spans_all && spans_all.length > 0 && (
        <section className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Star className="w-4 h-4 text-amber-500" />
            <span className="text-sm font-bold">贯穿全文</span>
            <span className="text-xs text-ink-400">({spans_all.length})</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {sortChars(spans_all).map(c => <HeroCard key={c.id} c={c} onEdit={startEdit} onDelete={handleDelete} />)}
          </div>
        </section>
      )}

      {/* 按卷分组 */}
      {Object.entries(volume_groups || {}).map(([volKey, chars]) => {
        const volNum = parseInt(volKey);
        const volInfo = volNumName[volNum];
        const isCurrent = volNum === current_volume;
        const isCollapsed = volNum === 0 ? false : (collapsedVolumes[volNum] ?? !isCurrent);
        const label = volNum === 0 ? '未分卷' : `第${volNum}卷${volInfo?.volume_name ? ` · ${volInfo.volume_name}` : ''}`;
        const chRange = volInfo ? `第${volInfo.chapter_start}-${volInfo.chapter_end}章` : '';

        return (
          <section key={volKey} className="mb-4">
            <button onClick={() => setCollapsedVolumes(prev => ({ ...prev, [volNum]: !isCollapsed }))}
              className="flex items-center gap-2 mb-2 w-full text-left group">
              {isCollapsed
                ? <ChevronRight className="w-4 h-4 text-ink-400" />
                : <ChevronDown className="w-4 h-4 text-ink-400" />}
              <span className={`text-sm font-bold ${isCurrent ? 'text-vermillion-600' : ''}`}>{label}</span>
              {isCurrent && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-vermillion-600/10 text-vermillion-600">当前卷</span>}
              {chRange && <span className="text-xs text-ink-400">{chRange}</span>}
              <span className="text-xs text-ink-400">({chars.length})</span>
            </button>
            {!isCollapsed && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 ml-6">
                {sortChars(chars).map(c => <VolumeCard key={c.id} c={c} onEdit={startEdit} onDelete={handleDelete} />)}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
