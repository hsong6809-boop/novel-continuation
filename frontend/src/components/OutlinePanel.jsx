import { useState, useEffect } from 'react';
import { FileText, BookOpen, Layers } from 'lucide-react';
import { listOutlines } from '../api/client';
import OverallOutlineEditor from './OverallOutlineEditor';
import VolumeOutlinePanel from './VolumeOutlinePanel';
import ChapterOutlinePanel from './ChapterOutlinePanel';

export default function OutlinePanel({ project, onRefresh, focusChapter }) {
  const [activeSection, setActiveSection] = useState('overall');
  const [outlines, setOutlines] = useState([]);

  useEffect(() => {
    listOutlines(project.id).then(setOutlines).catch(() => {});
  }, [project.id]);

  const tabs = [
    { key: 'overall', label: '总纲', icon: BookOpen, color: 'purple' },
    { key: 'volumes', label: '分卷大纲', icon: Layers, color: 'blue' },
    { key: 'chapters', label: '逐章章纲', icon: FileText, color: 'green' },
  ];

  const colorMap = {
    purple: { active: 'bg-inkblue-500/[0.12] text-inkblue-600 border-inkblue-500/25' },
    blue: { active: 'bg-gold-500/[0.12] text-gold-600 border-gold-500/25' },
    green: { active: 'bg-jade-500/[0.12] text-jade-600 border-jade-500/25' },
  };

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <div className="flex items-center gap-3 mb-6">
        <FileText className="w-5 h-5 text-jade-700" />
        <h1 className="text-xl font-bold text-gradient-ink">大纲管理</h1>
      </div>

      {/* 三栏切换 */}
      <div className="flex gap-1 mb-6 bg-surface-1 border border-border-subtle rounded-lg p-1">
        {tabs.map(t => {
          const Icon = t.icon;
          const isActive = activeSection === t.key;
          const c = colorMap[t.color];
          return (
            <button key={t.key} onClick={() => setActiveSection(t.key)}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-md text-sm transition border ${
                isActive
                  ? c.active
                  : 'border-transparent text-ink-500 hover:text-ink-900 hover:bg-surface-1'
              }`}>
              <Icon className="w-4 h-4" />
              {t.label}
              {t.key === 'chapters' && outlines.length > 0 && (
                <span className="text-xs bg-black/[0.05] px-1.5 py-0.5 rounded-full">{outlines.length}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* 内容区 */}
      <div className="bg-surface-1 border border-border-subtle rounded-xl p-6">
        {activeSection === 'overall' && <OverallOutlineEditor project={project} />}
        {activeSection === 'volumes' && <VolumeOutlinePanel project={project} />}
        {activeSection === 'chapters' && <ChapterOutlinePanel project={project} focusChapter={focusChapter} outlines={outlines} onOutlinesChange={setOutlines} />}
      </div>
    </div>
  );
}
