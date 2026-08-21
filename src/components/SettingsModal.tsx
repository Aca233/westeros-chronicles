import React, { useEffect, useState } from 'react';
import { useGameStore } from '../store/useGameStore';
import { Settings, Key, Server, Cpu, Flame, X, Download, Upload, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react';
import { stripEmoji } from '../services/textSanitizer';
import { exportSaveData, importSaveData } from '../services/db';
import { fetchAvailableModels } from '../services/api';

export const SettingsModal: React.FC = () => {
  const { isSettingsOpen, closeSettings, apiConfig, setApiConfig, replaceGameState, resetStoredGame } = useGameStore();

  const [provider, setProvider] = useState(apiConfig.provider);
  const [baseUrl, setBaseUrl] = useState(apiConfig.baseUrl);
  const [apiKey, setApiKey] = useState(apiConfig.apiKey);
  const [model, setModel] = useState(apiConfig.model);
  const [temperature, setTemperature] = useState(apiConfig.temperature);

  // 模型列表拉取状态
  const [fetchedModels, setFetchedModels] = useState<string[]>([]);
  const [isFetchingModels, setIsFetchingModels] = useState(false);
  const [fetchStatus, setFetchStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Esc 关闭
  useEffect(() => {
    if (!isSettingsOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeSettings();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isSettingsOpen, closeSettings]);

  if (!isSettingsOpen) return null;

  // 快捷切换厂商预设
  const handleProviderChange = (p: typeof provider) => {
    setProvider(p);
    setFetchStatus(null);
    if (p === 'deepseek') {
      setBaseUrl('https://api.deepseek.com/v1');
      setModel('deepseek-chat');
    } else if (p === 'openai') {
      setBaseUrl('https://api.openai.com/v1');
      setModel('gpt-4o');
    } else if (p === 'siliconflow') {
      setBaseUrl('https://api.siliconflow.cn/v1');
      setModel('deepseek-ai/DeepSeek-V3');
    } else if (p === 'claude') {
      setBaseUrl('https://api.anthropic.com/v1');
      setModel('claude-3-5-sonnet-20241022');
    }
  };

  // 点击读取模型列表
  const handleFetchModels = async () => {
    if (!baseUrl) {
      setFetchStatus({ type: 'error', message: '请先填写 API 端点地址' });
      return;
    }

    setIsFetchingModels(true);
    setFetchStatus(null);

    try {
      const models = await fetchAvailableModels(baseUrl, apiKey);
      setFetchedModels(models);
      setFetchStatus({ type: 'success', message: `成功拉取 ${models.length} 个可用模型!` });
      if (models.length > 0 && !models.includes(model)) {
        setModel(models[0]);
      }
    } catch (err) {
      console.error('拉取模型失败:', err);
      setFetchStatus({
        type: 'error',
        message: err instanceof Error ? err.message : '无法获取模型列表,请检查网络、端点或 Key',
      });
    } finally {
      setIsFetchingModels(false);
    }
  };

  const handleSave = () => {
    setApiConfig({
      provider,
      baseUrl,
      apiKey,
      model,
      temperature,
    });
    closeSettings();
  };

  // 导出存档
  const handleExportSave = async () => {
    try {
      const json = await exportSaveData();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `westeros_save_${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert('导出存档失败: ' + e);
    }
  };

  // 导入存档
  const handleImportSave = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const loaded = await importSaveData(text);
      if (loaded) {
        replaceGameState(loaded);
        closeSettings();
      }
    } catch (err) {
      alert('导入存档失败: ' + err);
    }
  };

  const handleResetTestSave = async () => {
    const confirmed = window.confirm('这会删除当前测试存档、人物事件与回合历史，且无法撤销。确认继续吗？');
    if (!confirmed) return;
    try {
      await resetStoredGame();
      closeSettings();
    } catch (err) {
      alert('重置测试存档失败: ' + err);
    }
  };

  // 推荐热门模型快速点击
  const popularModels: Record<string, string[]> = {
    deepseek: ['deepseek-chat', 'deepseek-reasoner'],
    siliconflow: ['deepseek-ai/DeepSeek-V3', 'deepseek-ai/DeepSeek-R1', 'Qwen/Qwen2.5-72B-Instruct', 'THUDM/glm-4-9b-chat'],
    openai: ['gpt-4o', 'gpt-4o-mini', 'o3-mini'],
    claude: ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022'],
    custom: ['deepseek-chat', 'gpt-4o', 'claude-3-5-sonnet'],
  };

  const currentRecommendations = popularModels[provider] || popularModels.custom;

  return (
    <div
      className="modal-backdrop fixed inset-0 z-50 flex select-none items-center justify-center p-4"
      onClick={closeSettings}
      role="dialog"
      aria-modal="true"
      aria-label="大模型 API 与游戏设置"
    >
      <div
        className="panel-iron scene-enter relative flex max-h-[90vh] w-full max-w-md flex-col gap-4 overflow-y-auto p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 顶部标题 */}
        <div className="flex items-center justify-between border-b border-hairline pb-3">
          <div>
            <p className="eyebrow">渡鸦网络</p>
            <h3 className="mt-1 flex items-center gap-2 font-serif text-base font-bold text-parchment">
              <Settings className="h-4 w-4 text-gold" />
              大模型 API 与游戏设置
            </h3>
          </div>
          <button onClick={closeSettings} className="btn-ghost !px-2" aria-label="关闭设置">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* 厂商快捷选择 */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] tracking-wide text-parchment-dim">模型服务厂商预设</label>
          <div className="grid grid-cols-4 gap-1.5 font-serif text-xs">
            {(['deepseek', 'siliconflow', 'openai', 'custom'] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => handleProviderChange(p)}
                className={`border px-1.5 py-2 text-center transition-all ${
                  provider === p
                    ? 'border-gold bg-gold-deep/20 font-bold text-gold-bright'
                    : 'border-hairline bg-ink-2/70 text-parchment-dim hover:text-parchment'
                }`}
              >
                {p === 'deepseek'
                  ? 'DeepSeek'
                  : p === 'siliconflow'
                  ? '硅基流动'
                  : p === 'openai'
                  ? 'OpenAI'
                  : '自定义中转'}
              </button>
            ))}
          </div>
        </div>

        {/* Base URL */}
        <div className="flex flex-col gap-1">
          <label className="flex items-center gap-1.5 text-[11px] tracking-wide text-parchment-dim">
            <Server className="h-3.5 w-3.5 text-gold" /> API 端点地址 (Base URL)
          </label>
          <input
            type="text"
            value={baseUrl}
            onChange={(e) => setBaseUrl(stripEmoji(e.target.value))}
            placeholder="https://api.deepseek.com/v1"
            className="creator-input !font-mono"
          />
        </div>

        {/* API Key */}
        <div className="flex flex-col gap-1">
          <label className="flex items-center gap-1.5 text-[11px] tracking-wide text-parchment-dim">
            <Key className="h-3.5 w-3.5 text-gold" /> API Key(私有密钥,仅保存在本地)
          </label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-..."
            className="creator-input !font-mono"
          />
          <span className="text-[10px] italic text-gold-deep">
            * 若留空将自动切换为内置的【离线 Demo 剧本演化模式】。
          </span>
        </div>

        {/* Model Name 与 拉取模型列表 */}
        <div className="flex flex-col gap-2 border border-hairline bg-ink-3/40 p-3">
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-1.5 text-[11px] tracking-wide text-parchment-dim">
              <Cpu className="h-3.5 w-3.5 text-gold" /> 选择 / 输入模型名称
            </label>

            <button
              type="button"
              onClick={handleFetchModels}
              disabled={isFetchingModels}
              className="btn-ghost !py-1 !text-[10.5px] !text-gold hover:!text-gold-bright"
              title="请求 GET /models 自动读取该端点全部可用模型"
            >
              <RefreshCw className={`h-3 w-3 ${isFetchingModels ? 'animate-spin' : ''}`} />
              <span>{isFetchingModels ? '读取中…' : '读取模型列表'}</span>
            </button>
          </div>

          {/* 如果已拉取到模型列表,显示下拉选择框;也可以手动自由输入 */}
          {fetchedModels.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              <select
                value={model}
                onChange={(e) => setModel(stripEmoji(e.target.value))}
                className="creator-input cursor-pointer !font-mono !text-gold-bright"
              >
                {fetchedModels.map((m) => (
                  <option key={m} value={m} className="bg-ink-2 text-parchment">
                    {m}
                  </option>
                ))}
              </select>
              <span className="text-[10px] text-parchment-faint">或手动输入指定模型:</span>
              <input
                type="text"
                value={model}
                onChange={(e) => setModel(stripEmoji(e.target.value))}
                className="creator-input !font-mono"
              />
            </div>
          ) : (
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(stripEmoji(e.target.value))}
              placeholder="deepseek-chat"
              className="creator-input !font-mono"
            />
          )}

          {/* 状态提示信息 */}
          {fetchStatus && (
            <div
              className={`flex items-center gap-1.5 border p-2 font-serif text-[11px] ${
                fetchStatus.type === 'success'
                  ? 'border-emerald-700/50 bg-emerald-800/10 text-emerald-800'
                  : 'border-rubric-deep bg-rubric-deep/25 text-rubric-bright'
              }`}
            >
              {fetchStatus.type === 'success' ? (
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
              ) : (
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              )}
              <span className="leading-tight">{fetchStatus.message}</span>
            </div>
          )}

          {/* 推荐模型快速点选 Chips */}
          <div className="flex flex-col gap-1 pt-0.5">
            <span className="text-[10px] text-gold-deep">推荐模型快捷点选:</span>
            <div className="flex flex-wrap gap-1">
              {currentRecommendations.map((rec) => (
                <button
                  key={rec}
                  type="button"
                  onClick={() => setModel(rec)}
                  className={`border px-2 py-0.5 font-mono text-[10px] transition-colors ${
                    model === rec
                      ? 'border-gold bg-gold-deep/20 font-bold text-gold-bright'
                      : 'border-hairline bg-ink-2/70 text-parchment-dim hover:text-parchment'
                  }`}
                >
                  {rec}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Temperature */}
        <div className="flex flex-col gap-1.5">
          <div className="flex justify-between text-[11px] tracking-wide text-parchment-dim">
            <span className="flex items-center gap-1.5">
              <Flame className="h-3.5 w-3.5 text-gold" /> 创意温度 (Temperature)
            </span>
            <span className="font-mono text-gold-bright">{temperature}</span>
          </div>
          <input
            type="range"
            min="0.2"
            max="1.2"
            step="0.1"
            value={temperature}
            onChange={(e) => setTemperature(parseFloat(e.target.value))}
            className="cursor-pointer accent-gold"
          />
        </div>

        {/* 存档管理 */}
        <div className="flex flex-col gap-2 border-t border-hairline pt-3">
          <span className="text-[11px] tracking-wide text-parchment-dim">本地 IndexedDB 存档管理</span>
          <div className="grid grid-cols-2 gap-2 font-serif text-xs">
            <button onClick={handleExportSave} className="btn-ghost justify-center !py-2">
              <Download className="h-3.5 w-3.5 text-gold" />
              <span>导出 JSON 存档</span>
            </button>
            <label className="btn-ghost cursor-pointer justify-center !py-2">
              <Upload className="h-3.5 w-3.5 text-gold" />
              <span>导入 JSON 存档</span>
              <input type="file" accept=".json" onChange={handleImportSave} className="hidden" />
            </label>
            <button type="button" onClick={handleResetTestSave} className="btn-ghost col-span-2 justify-center !py-2 text-rubric-bright">
              <RefreshCw className="h-3.5 w-3.5" />
              <span>重置测试存档</span>
            </button>
          </div>
        </div>

        {/* 底部保存按钮 */}
        <div className="flex justify-end gap-2 border-t border-hairline pt-3">
          <button type="button" onClick={closeSettings} className="btn-ghost !px-4 !py-2">
            取消
          </button>
          <button type="button" onClick={handleSave} className="btn-decree !px-5 !py-2 !text-xs">
            保存配置
          </button>
        </div>
      </div>
    </div>
  );
};
