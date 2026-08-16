import React, { useState } from 'react';
import { useGameStore } from '../store/useGameStore';
import { Settings, Key, Server, Cpu, Flame, X, Download, Upload, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react';
import { stripEmoji } from '../services/textSanitizer';
import { exportSaveData, importSaveData } from '../services/db';
import { fetchAvailableModels } from '../services/api';

export const SettingsModal: React.FC = () => {
  const { isSettingsOpen, closeSettings, apiConfig, setApiConfig } = useGameStore();

  const [provider, setProvider] = useState(apiConfig.provider);
  const [baseUrl, setBaseUrl] = useState(apiConfig.baseUrl);
  const [apiKey, setApiKey] = useState(apiConfig.apiKey);
  const [model, setModel] = useState(apiConfig.model);
  const [temperature, setTemperature] = useState(apiConfig.temperature);

  // 模型列表拉取状态
  const [fetchedModels, setFetchedModels] = useState<string[]>([]);
  const [isFetchingModels, setIsFetchingModels] = useState(false);
  const [fetchStatus, setFetchStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

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
      setFetchStatus({ type: 'success', message: `成功拉取 ${models.length} 个可用模型！` });
      if (models.length > 0 && !models.includes(model)) {
        setModel(models[0]);
      }
    } catch (err) {
      console.error('拉取模型失败:', err);
      setFetchStatus({
        type: 'error',
        message: err instanceof Error ? err.message : '无法获取模型列表，请检查网络、端点或 Key',
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
        window.location.reload();
      }
    } catch (err) {
      alert('导入存档失败: ' + err);
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in select-none">
      <div className="bg-[#14110e] border border-[#c89d54] rounded-2xl p-6 max-w-md w-full shadow-2xl got-card-texture flex flex-col gap-4 relative max-h-[90vh] overflow-y-auto">
        {/* 顶部标题 */}
        <div className="flex items-center justify-between pb-3 border-b border-[#33271d]">
          <div className="flex items-center gap-2 text-[#e5be6c] font-serif font-bold text-base">
            <Settings className="w-5 h-5 text-[#c89d54]" />
            <span>大模型 API 与游戏设置</span>
          </div>
          <button
            onClick={closeSettings}
            className="p-1 rounded hover:bg-[#2b241c] text-[#a89f91] hover:text-[#e6ded1] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 厂商快捷选择 */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-[#a89f91] font-serif">模型服务厂商预设:</label>
          <div className="grid grid-cols-4 gap-1.5 text-xs font-serif">
            {(['deepseek', 'siliconflow', 'openai', 'custom'] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => handleProviderChange(p)}
                className={`py-1.5 px-1.5 rounded border transition-all text-center ${
                  provider === p
                    ? 'bg-[#2b221a] text-[#e5be6c] border-[#c89d54] font-bold'
                    : 'bg-[#17130f] text-[#a89f91] border-[#33271d] hover:text-[#e6ded1]'
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
          <label className="text-xs text-[#a89f91] font-serif flex items-center gap-1">
            <Server className="w-3.5 h-3.5 text-[#c89d54]" /> API 端点地址 (Base URL):
          </label>
          <input
            type="text"
            value={baseUrl}
            onChange={(e) => setBaseUrl(stripEmoji(e.target.value))}
            placeholder="https://api.deepseek.com/v1"
            className="bg-[#17130f] border border-[#33271d] focus:border-[#c89d54] rounded-lg px-3 py-2 text-xs font-mono text-[#e6ded1] outline-none"
          />
        </div>

        {/* API Key */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-[#a89f91] font-serif flex items-center gap-1">
            <Key className="w-3.5 h-3.5 text-[#c89d54]" /> API Key (私有密钥，仅保存在本地):
          </label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-..."
            className="bg-[#17130f] border border-[#33271d] focus:border-[#c89d54] rounded-lg px-3 py-2 text-xs font-mono text-[#e6ded1] outline-none"
          />
          <span className="text-[10px] text-[#8a652a] italic">
            * 若留空将自动切换为内置的【离线 Demo 剧本演化模式】。
          </span>
        </div>

        {/* Model Name 与 拉取模型列表 */}
        <div className="flex flex-col gap-1.5 bg-black/25 p-3 rounded-xl border border-[#33271d]">
          <div className="flex items-center justify-between">
            <label className="text-xs text-[#a89f91] font-serif flex items-center gap-1">
              <Cpu className="w-3.5 h-3.5 text-[#c89d54]" /> 选择/输入模型名称:
            </label>

            {/* 读取模型列表按钮 */}
            <button
              type="button"
              onClick={handleFetchModels}
              disabled={isFetchingModels}
              className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded bg-[#2b221a] hover:bg-[#3d3126] text-[#e5be6c] border border-[#c89d54]/60 transition-all disabled:opacity-40"
              title="请求 GET /models 自动读取该端点全部可用模型"
            >
              <RefreshCw className={`w-3 h-3 ${isFetchingModels ? 'animate-spin' : ''}`} />
              <span>{isFetchingModels ? '读取中…' : '读取模型列表'}</span>
            </button>
          </div>

          {/* 如果已拉取到模型列表，显示下拉选择框；也可以手动自由输入 */}
          {fetchedModels.length > 0 ? (
            <div className="flex flex-col gap-1">
              <select
                value={model}
                onChange={(e) => setModel(stripEmoji(e.target.value))}
                className="bg-[#17130f] border border-[#c89d54] rounded-lg px-2.5 py-2 text-xs font-mono text-[#e5be6c] outline-none cursor-pointer"
              >
                {fetchedModels.map((m) => (
                  <option key={m} value={m} className="bg-[#14110e] text-[#e6ded1]">
                    {m}
                  </option>
                ))}
              </select>
              <span className="text-[10px] text-[#a89f91]">或手动输入指定模型:</span>
              <input
                type="text"
                value={model}
                onChange={(e) => setModel(stripEmoji(e.target.value))}
                className="bg-[#17130f] border border-[#33271d] focus:border-[#c89d54] rounded-lg px-3 py-1.5 text-xs font-mono text-[#e6ded1] outline-none"
              />
            </div>
          ) : (
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(stripEmoji(e.target.value))}
              placeholder="deepseek-chat"
              className="bg-[#17130f] border border-[#33271d] focus:border-[#c89d54] rounded-lg px-3 py-2 text-xs font-mono text-[#e6ded1] outline-none"
            />
          )}

          {/* 状态提示信息 */}
          {fetchStatus && (
            <div
              className={`flex items-center gap-1.5 text-[11px] p-2 rounded border font-serif ${
                fetchStatus.type === 'success'
                  ? 'bg-emerald-950/40 border-emerald-800 text-emerald-300'
                  : 'bg-red-950/40 border-red-800 text-red-300'
              }`}
            >
              {fetchStatus.type === 'success' ? (
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              ) : (
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              )}
              <span className="leading-tight">{fetchStatus.message}</span>
            </div>
          )}

          {/* 推荐模型快速点选 Chips */}
          <div className="flex flex-col gap-1 pt-1">
            <span className="text-[10px] text-[#8a652a]">推荐模型快捷点选:</span>
            <div className="flex flex-wrap gap-1">
              {currentRecommendations.map((rec) => (
                <button
                  key={rec}
                  type="button"
                  onClick={() => setModel(rec)}
                  className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
                    model === rec
                      ? 'bg-[#c89d54]/20 border-[#c89d54] text-[#fff1ba] font-bold'
                      : 'bg-[#17130f] border-[#33271d] text-[#a89f91] hover:text-[#e6ded1]'
                  }`}
                >
                  {rec}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Temperature */}
        <div className="flex flex-col gap-1">
          <div className="flex justify-between text-xs font-serif text-[#a89f91]">
            <span className="flex items-center gap-1">
              <Flame className="w-3.5 h-3.5 text-[#c89d54]" /> 创意温度 (Temperature):
            </span>
            <span className="font-mono text-[#e5be6c]">{temperature}</span>
          </div>
          <input
            type="range"
            min="0.2"
            max="1.2"
            step="0.1"
            value={temperature}
            onChange={(e) => setTemperature(parseFloat(e.target.value))}
            className="accent-[#c89d54] cursor-pointer"
          />
        </div>

        {/* 存档管理 */}
        <div className="pt-3 border-t border-[#33271d] flex flex-col gap-2">
          <span className="text-xs text-[#a89f91] font-serif">本地 IndexedDB 存档管理:</span>
          <div className="grid grid-cols-2 gap-2 text-xs font-serif">
            <button
              onClick={handleExportSave}
              className="flex items-center justify-center gap-1 py-1.5 rounded bg-[#17130f] hover:bg-[#261f18] text-[#e6ded1] border border-[#33271d] transition-colors"
            >
              <Download className="w-3.5 h-3.5 text-[#c89d54]" />
              <span>导出 JSON 存档</span>
            </button>
            <label className="flex items-center justify-center gap-1 py-1.5 rounded bg-[#17130f] hover:bg-[#261f18] text-[#e6ded1] border border-[#33271d] transition-colors cursor-pointer">
              <Upload className="w-3.5 h-3.5 text-[#c89d54]" />
              <span>导入 JSON 存档</span>
              <input type="file" accept=".json" onChange={handleImportSave} className="hidden" />
            </label>
          </div>
        </div>

        {/* 底部保存按钮 */}
        <div className="pt-2 flex justify-end gap-2 border-t border-[#33271d]">
          <button
            type="button"
            onClick={closeSettings}
            className="px-4 py-2 rounded-lg bg-[#1c1813] text-[#a89f91] hover:text-[#e6ded1] border border-[#33271d] text-xs font-serif transition-colors"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-5 py-2 rounded-lg bg-gradient-to-r from-[#8a652a] to-[#c89d54] hover:from-[#9c7432] hover:to-[#e5be6c] text-[#0e0c0a] text-xs font-serif font-bold transition-all shadow-md"
          >
            保存配置
          </button>
        </div>
      </div>
    </div>
  );
};
