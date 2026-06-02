/**
 * UniPet Life Engine - bubble policy.
 *
 * Owns short user-facing bubble text and timing so event interpretation stays
 * focused on agent signals instead of renderer copy policy.
 */
(function initLifeBubble(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.UnipetLifeBubble = api;
})(typeof window !== 'undefined' ? window : globalThis, function lifeBubbleFactory() {
  const MESSAGE_LIMIT = 20;
  const SUMMARY_LIMIT = 44;

  const STATE_DURATIONS_MS = {
    idle: 0,
    running: 4500,
    waiting: 10000,
    failed: 9000,
    review: 6500,
  };

  const KIND_DURATIONS_MS = {
    failure: 9000,
    success: 6500,
    permission: 12000,
    delegate: 5000,
    test: 4200,
    build: 4200,
    network: 4500,
    write: 4500,
    read: 4200,
    shell: 4200,
    thinking: 5500,
  };

  const DISPLAY_STATUS = {
    running: {
      label: '运行中',
      tone: 'running',
      bubbleText: '专注工作中，别打扰我哦~',
    },
    thinking: {
      label: '思考中',
      tone: 'thinking',
      bubbleText: '我在想想怎么做更好...',
    },
    waiting: {
      label: '等待中',
      tone: 'waiting',
      bubbleText: '我在待机，随时开工。',
    },
    confirm: {
      label: '需要确认',
      tone: 'confirm',
      bubbleText: '这里需要你确认一下。',
    },
    done: {
      label: '完成',
      tone: 'done',
      bubbleText: '这一步完成啦。',
    },
    problem: {
      label: '遇到问题',
      tone: 'problem',
      bubbleText: '好像遇到一些问题了...',
    },
  };

  const KIND_BUBBLE_TEXT = {
    read: '我在翻翻项目文件。',
    write: '正在改文件啦。',
    shell: '我去跑一下命令。',
    test: '正在检查稳不稳。',
    build: '正在打包看看。',
    network: '我去外面看一眼。',
    delegate: '我在分派小任务。',
  };

  const KIND_EVENT_LABELS = {
    idle: '待机',
    running: '状态更新',
    waiting: '等待中',
    failure: '出现问题',
    success: '任务完成',
    permission: '等待确认',
    delegate: '分派任务',
    test: '运行检查',
    build: '构建打包',
    network: '外部请求',
    write: '修改文件',
    read: '读取项目',
    shell: '执行命令',
    thinking: '思考方案',
  };

  const UNSAFE_SUMMARY_PATTERNS = [
    /https?:\/\/|www\./i,
    /\b[A-Za-z]:[\\/][^\s]+/,
    /(^|\s)\/(?:Users|home|var|etc|tmp|mnt|workspace|root|src|app)\//i,
    /```|=>|<script\b|<\/\w+>|function\s*\(|\b(?:const|let|var|class)\s+\w+/i,
    /\b(?:api[_-]?key|access[_-]?token|secret|password|passwd|pwd)\b\s*[:=]/i,
    /\bsk-[A-Za-z0-9_-]{8,}/i,
  ];

  function clipBubbleText(text, limit = MESSAGE_LIMIT) {
    const raw = String(text || '').trim().replace(/\s+/g, ' ');
    const chars = Array.from(raw);
    if (chars.length <= limit) return raw;
    return `${chars.slice(0, limit).join('')}...`;
  }

  function displayStatusFor(signal = {}) {
    const state = String(signal.state || 'idle');
    const kind = String(signal.kind || '');
    if (state === 'failed' || kind === 'failure') return 'problem';
    if (state === 'review' || kind === 'success') return 'done';
    if (kind === 'permission') return 'confirm';
    if (kind === 'thinking') return 'thinking';
    if (state === 'running') return 'running';
    return 'waiting';
  }

  function displayFor(signal = {}) {
    const displayStatus = displayStatusFor(signal);
    const spec = DISPLAY_STATUS[displayStatus] || DISPLAY_STATUS.waiting;
    const kind = String(signal.kind || '');
    return {
      displayStatus,
      displayLabel: spec.label,
      displayTone: spec.tone,
      displayEvent: KIND_EVENT_LABELS[kind] || spec.label,
    };
  }

  function bubbleTextFor(signal = {}, display = displayFor(signal)) {
    if (display.displayStatus === 'running' && KIND_BUBBLE_TEXT[signal.kind]) {
      return KIND_BUBBLE_TEXT[signal.kind];
    }
    const spec = DISPLAY_STATUS[display.displayStatus] || DISPLAY_STATUS.waiting;
    return spec.bubbleText;
  }

  function unsafeSummary(text) {
    const raw = String(text || '');
    if (/[\r\n]/.test(raw)) return true;
    return UNSAFE_SUMMARY_PATTERNS.some((pattern) => pattern.test(raw));
  }

  function safeSummary(text, limit = SUMMARY_LIMIT) {
    const raw = String(text || '').trim();
    if (!raw) return '';
    if (unsafeSummary(raw)) return '详情已隐藏';
    return clipBubbleText(raw, limit);
  }

  function durationFor(signal = {}) {
    const kind = String(signal.kind || '');
    const state = String(signal.state || 'idle');
    if (Object.hasOwn(KIND_DURATIONS_MS, kind)) return KIND_DURATIONS_MS[kind];
    if (Object.hasOwn(STATE_DURATIONS_MS, state)) return STATE_DURATIONS_MS[state];
    return STATE_DURATIONS_MS.idle;
  }

  return {
    MESSAGE_LIMIT,
    SUMMARY_LIMIT,
    STATE_DURATIONS_MS,
    KIND_DURATIONS_MS,
    DISPLAY_STATUS,
    KIND_BUBBLE_TEXT,
    clipBubbleText,
    displayFor,
    bubbleTextFor,
    safeSummary,
    durationFor,
  };
});
