import React, { useRef, useState } from 'react';
import { ArrowLeft, Download, Play, ScrollText, Trash2, Upload } from 'lucide-react';
import { useGameStore } from '../../store/useGameStore';
import { exportSaveData } from '../../services/db';
import { GameIcon, getHouseIconId } from '../GameIcon';
import type { SaveSlotMeta } from '../../services/db';

function formatTimestamp(value: number): string {
  const date = new Date(value);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const LEGACY_SCENARIO_LABELS: Readonly<Record<string, string>> = {
  ned_stark: '艾德·史塔克',
  jon_snow: '琼恩·雪诺',
  daenerys_targaryen: '丹妮莉丝·坦格利安',
};

function scenarioLabel(slot: SaveSlotMeta): string | null {
  if (!slot.scenarioId) return null;
  if (LEGACY_SCENARIO_LABELS[slot.scenarioId]) return LEGACY_SCENARIO_LABELS[slot.scenarioId];
  if (slot.scenarioId === 'custom') return '自定义统治者';
  if (slot.scenarioId === 'existing') return '现成人物开局';
  if (slot.scenarioId === 'living-world') return '统一世界';
  return null;
}

/**
 * 读取存档:每段周目是一册卷轴,按最近翻开排序。
 * 可载入、导出 JSON、删除;导入的存档包会落成新的存档位。
 */
export const LoadGameScreen: React.FC = () => {
  const saveSlots = useGameStore((state) => state.saveSlots);
  const slotActionError = useGameStore((state) => state.slotActionError);
  const setMenuView = useGameStore((state) => state.setMenuView);
  const openCreator = useGameStore((state) => state.openCreator);
  const continueGame = useGameStore((state) => state.continueGame);
  const deleteSlot = useGameStore((state) => state.deleteSlot);
  const importSlot = useGameStore((state) => state.importSlot);
  const [busySlotId, setBusySlotId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleLoad = async (slotId: string) => {
    if (busySlotId) return;
    setBusySlotId(slotId);
    const entered = await continueGame(slotId);
    if (!entered) setBusySlotId(null);
  };

  const handleExport = async (slot: SaveSlotMeta) => {
    if (busySlotId) return;
    setBusySlotId(slot.slotId);
    try {
      const json = await exportSaveData(slot.slotId);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `westeros_save_${slot.lordName}_${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      alert(`导出存档失败: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusySlotId(null);
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const meta = await importSlot(await file.text());
      if (meta) alert(`已导入存档「${meta.name}」,它已成为新的存档位。`);
    } catch {
      // importSlot 已把错误写入 slotActionError
    } finally {
      setImporting(false);
      e.target.value = '';
    }
  };

  return (
    <div className="relative z-10 flex min-h-0 flex-1 flex-col overflow-y-auto px-5 py-5 md:px-10 md:py-7">
      <div className="menu-screen-head">
        <div>
          <p className="eyebrow">Archivum · 读取存档</p>
          <h2 className="mt-1 font-serif text-lg font-bold tracking-wide text-parchment">卷轴架</h2>
        </div>
        <div className="flex items-center gap-1.5">
          <label className={`btn-ghost cursor-pointer ${importing ? 'pointer-events-none opacity-60' : ''}`}>
            <Upload className="h-3.5 w-3.5 text-gold" />
            <span>{importing ? '导入中…' : '导入存档包'}</span>
            <input ref={fileInputRef} type="file" accept=".json" onChange={handleImport} className="hidden" />
          </label>
          <button type="button" onClick={() => setMenuView('title')} className="btn-ghost" aria-label="返回标题屏">
            <ArrowLeft className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">返回标题</span>
          </button>
        </div>
      </div>

      {slotActionError && (
        <p className="mt-3 border border-rubric-deep/60 bg-rubric-deep/15 px-3 py-2 font-serif text-[11px] leading-relaxed text-rubric-bright">
          {slotActionError}
        </p>
      )}

      {saveSlots.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 py-16 text-center">
          <ScrollText className="h-10 w-10 text-gold-dim" strokeWidth={1.2} />
          <p className="font-serif text-sm text-parchment-dim">卷轴架上空空如也,还没有任何一段传奇被写下。</p>
          <button type="button" className="btn-decree !px-5 !py-2 !text-xs" onClick={() => openCreator('custom')}>
            去开创新局
          </button>
        </div>
      ) : (
        <div className="mt-4 grid content-start gap-3 xl:grid-cols-2">
          {saveSlots.map((slot, index) => {
            const scenario = scenarioLabel(slot);
            return (
              <article
                key={slot.slotId}
                className="save-card scene-enter"
                style={{ '--d': `${Math.min(index, 6) * 70}ms` } as React.CSSProperties}
              >
                <div className="flex items-start gap-3">
                  <GameIcon icon={getHouseIconId(slot.houseSigil ?? '')} className="h-9 w-9 shrink-0 opacity-90" tone="raw" />
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate font-serif text-[13.5px] font-bold text-parchment">{slot.name}</h3>
                    <p className="mt-0.5 truncate text-[10.5px] text-parchment-faint">
                      {slot.dateLabel} · 第 {slot.turnCount} 回合
                      {scenario ? ` · ${scenario}` : ''}
                    </p>
                  </div>
                  {slot.isGameOver && (
                    <span className="shrink-0 border border-rubric-deep/70 px-2 py-0.5 font-serif text-[9.5px] tracking-[0.2em] text-rubric-bright">
                      已落幕
                    </span>
                  )}
                </div>

                <p className="text-[10px] tracking-wide text-parchment-faint">最近翻阅 {formatTimestamp(slot.updatedAt)}</p>

                <div className="flex items-center gap-1.5 border-t border-hairline/50 pt-2.5">
                  {confirmingId === slot.slotId ? (
                    <>
                      <span className="mr-auto font-serif text-[11px] text-rubric-bright">删去这册卷轴,无可挽回。确定?</span>
                      <button
                        type="button"
                        className="btn-ghost !py-1.5 !text-[11px] !text-rubric-bright"
                        disabled={busySlotId != null}
                        onClick={() => {
                          setBusySlotId(slot.slotId);
                          void deleteSlot(slot.slotId).finally(() => setBusySlotId(null));
                          setConfirmingId(null);
                        }}
                      >
                        确认删除
                      </button>
                      <button type="button" className="btn-ghost !py-1.5 !text-[11px]" onClick={() => setConfirmingId(null)}>
                        手下留情
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="btn-decree !px-4 !py-1.5 !text-[11px]"
                        disabled={busySlotId != null}
                        onClick={() => void handleLoad(slot.slotId)}
                      >
                        <Play className="h-3 w-3" />
                        <span className="ml-1">{busySlotId === slot.slotId ? '载入中…' : '载入'}</span>
                      </button>
                      <button
                        type="button"
                        className="btn-ghost !py-1.5 !text-[11px]"
                        disabled={busySlotId != null}
                        onClick={() => void handleExport(slot)}
                      >
                        <Download className="h-3 w-3" />
                        <span className="ml-1">导出</span>
                      </button>
                      <button
                        type="button"
                        className="btn-ghost ml-auto !px-2 !py-1.5 !text-rubric-bright hover:!text-rubric"
                        disabled={busySlotId != null}
                        aria-label={`删除存档 ${slot.name}`}
                        onClick={() => setConfirmingId(slot.slotId)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default LoadGameScreen;
