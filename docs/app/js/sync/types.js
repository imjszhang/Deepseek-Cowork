/**
 * 消息类型定义
 * 参考 happy/sources/sync/typesMessage.ts
 * 
 * @module sync/types
 */

/**
 * 工具调用对象
 * @typedef {Object} ToolCall
 * @property {string} name - 工具名称
 * @property {'running'|'completed'|'error'} state - 工具状态
 * @property {any} input - 工具输入参数
 * @property {number} createdAt - 创建时间戳
 * @property {number|null} startedAt - 开始执行时间戳
 * @property {number|null} completedAt - 完成时间戳
 * @property {string|null} description - 工具描述
 * @property {any} [result] - 工具执行结果
 * @property {ToolPermission} [permission] - 权限信息
 */

/**
 * 工具权限对象
 * @typedef {Object} ToolPermission
 * @property {string} id - 权限 ID
 * @property {'pending'|'approved'|'denied'|'canceled'} status - 权限状态
 * @property {string} [reason] - 原因
 * @property {string} [mode] - 模式
 * @property {string[]} [allowedTools] - 允许的工具列表
 * @property {'approved'|'approved_for_session'|'denied'|'abort'} [decision] - 决定
 * @property {number} [date] - 决定时间
 */

/**
 * 用户文本消息
 * @typedef {Object} UserTextMessage
 * @property {'user-text'} kind - 消息类型
 * @property {string} id - 消息 ID
 * @property {string|null} localId - 本地 ID
 * @property {number} createdAt - 创建时间戳
 * @property {string} text - 消息文本
 * @property {string} [displayText] - 显示文本（可选）
 * @property {Object} [meta] - 元数据
 */

/**
 * Agent 文本消息
 * @typedef {Object} AgentTextMessage
 * @property {'agent-text'} kind - 消息类型
 * @property {string} id - 消息 ID
 * @property {string|null} localId - 本地 ID
 * @property {number} createdAt - 创建时间戳
 * @property {string} text - 消息文本
 * @property {Object} [meta] - 元数据
 */

/**
 * 工具调用消息
 * @typedef {Object} ToolCallMessage
 * @property {'tool-call'} kind - 消息类型
 * @property {string} id - 消息 ID
 * @property {string|null} localId - 本地 ID
 * @property {number} createdAt - 创建时间戳
 * @property {ToolCall} tool - 工具调用对象
 * @property {Message[]} children - 子消息（sidechain）
 * @property {Object} [meta] - 元数据
 */

/**
 * Agent 事件消息
 * @typedef {Object} AgentEventMessage
 * @property {'agent-event'} kind - 消息类型
 * @property {string} id - 消息 ID
 * @property {number} createdAt - 创建时间戳
 * @property {AgentEvent} event - 事件对象
 * @property {Object} [meta] - 元数据
 */

/**
 * Agent 事件
 * @typedef {Object} AgentEvent
 * @property {'switch'|'message'|'limit-reached'|'ready'} type - 事件类型
 * @property {string} [mode] - 模式（switch 类型）
 * @property {string} [message] - 消息（message 类型）
 * @property {number} [endsAt] - 结束时间（limit-reached 类型）
 */

/**
 * 消息联合类型
 * @typedef {UserTextMessage|AgentTextMessage|ToolCallMessage|AgentEventMessage} Message
 */

/**
 * 消息种类枚举
 */
const MessageKind = {
  USER_TEXT: 'user-text',
  AGENT_TEXT: 'agent-text',
  TOOL_CALL: 'tool-call',
  AGENT_EVENT: 'agent-event'
};

/**
 * 工具状态枚举
 */
const ToolState = {
  RUNNING: 'running',
  COMPLETED: 'completed',
  ERROR: 'error'
};

/**
 * 权限状态枚举
 */
const PermissionStatus = {
  PENDING: 'pending',
  APPROVED: 'approved',
  DENIED: 'denied',
  CANCELED: 'canceled'
};

/**
 * 创建工具调用对象
 * @param {Object} params
 * @returns {ToolCall}
 */
function createToolCall(params) {
  return {
    name: params.name || 'unknown',
    state: params.state || ToolState.RUNNING,
    input: params.input || {},
    createdAt: params.createdAt || Date.now(),
    startedAt: params.startedAt || null,
    completedAt: params.completedAt || null,
    description: params.description || null,
    result: params.result,
    permission: params.permission
  };
}

/**
 * 创建用户文本消息
 * @param {Object} params
 * @returns {UserTextMessage}
 */
function createUserTextMessage(params) {
  return {
    kind: MessageKind.USER_TEXT,
    id: params.id,
    localId: params.localId || null,
    createdAt: params.createdAt || Date.now(),
    text: params.text || '',
    displayText: params.displayText,
    meta: params.meta
  };
}

/**
 * 创建 Agent 文本消息
 * @param {Object} params
 * @returns {AgentTextMessage}
 */
function createAgentTextMessage(params) {
  return {
    kind: MessageKind.AGENT_TEXT,
    id: params.id,
    localId: params.localId || null,
    createdAt: params.createdAt || Date.now(),
    text: params.text || '',
    meta: params.meta
  };
}

/**
 * 创建工具调用消息
 * @param {Object} params
 * @returns {ToolCallMessage}
 */
function createToolCallMessage(params) {
  return {
    kind: MessageKind.TOOL_CALL,
    id: params.id,
    localId: params.localId || null,
    createdAt: params.createdAt || Date.now(),
    tool: params.tool,
    children: params.children || [],
    meta: params.meta
  };
}

/**
 * 创建 Agent 事件消息
 * @param {Object} params
 * @returns {AgentEventMessage}
 */
function createAgentEventMessage(params) {
  return {
    kind: MessageKind.AGENT_EVENT,
    id: params.id,
    createdAt: params.createdAt || Date.now(),
    event: params.event,
    meta: params.meta
  };
}

// 导出到全局
if (typeof window !== 'undefined') {
  window.MessageTypes = {
    MessageKind,
    ToolState,
    PermissionStatus,
    createToolCall,
    createUserTextMessage,
    createAgentTextMessage,
    createToolCallMessage,
    createAgentEventMessage
  };
}
